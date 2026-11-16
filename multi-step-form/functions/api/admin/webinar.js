// POST /api/admin/webinar: menu Webinar di /internal-dash (daftar + form acara).
//
// Tabel webinar tanpa policy dan tanpa hak untuk browser (sql/131), jadi semua
// baca-tulis admin lewat sini dengan service_role, setelah email sesi dicocokkan
// ke ADMIN_EMAILS. Endpoint ini TIDAK terkena saklar masa uji (_access.js).
//
// Aturan tulis (pelajaran insiden 3 & 5 Nov, lihat webinar/_claim.js):
// - Setiap tulisan acara memfilter `id=eq.<id>` saja, tidak pernah kolom yang ia
//   ubah sendiri, dan meminta barisnya kembali. Nol baris = galat.
// - Pemeriksaan versi (`expectedUpdatedAt`) dilakukan dengan membaca lebih dulu,
//   BUKAN dengan `updated_at=eq.` di PATCH: trigger mengubah updated_at, jadi
//   filter itu termasuk "memfilter kolom yang diubah". Jendela balapannya kecil
//   dan pengelolanya satu akun.
// - Sesudah menulis, baris dibaca ulang bersama webinar_offer_state, supaya
//   badge di daftar admin sama dengan yang dilihat pengunjung.

import { caller, json, CORS, resolveService } from '../webinar/_server.js';
import { webinarLocalOpen } from '../webinar/_access.js';
import { cancelDokuOrder } from '../doku/_doku-cancel.js';
import {
  adminEmails, validateWebinarRequest, normalizePatch, applySalesInvariant, slugifyTitle, pickFreeSlug,
  isSlugLocked, missingForPublish, crossFieldError, quotaError, clearedScheduleError, scheduleChanged,
  kindChangeError, applyKindInvariant, sourceError, linkLockError,
} from './webinarGate.js';
import { DbError, Refusal, refuse, db, dbAll, decorate, loadEvent, loadOrRefuse, writeEvent } from './_webinarDb.js';
import { holderVideo } from '../webinar/_recordingAccess.js';
import {
  participants, participant, resendTicket, checkOrder, refundOrder, LOCAL_BLOCKED_ACTIONS, buyers,
} from './_webinarOps.js';
import {
  uploadStart, partUrls, uploadComplete, uploadAbort, preview, saveMaterials, publishRecording, purgeEventFiles,
} from './_webinarRecording.js';
import { StorageError } from '../webinar/_recording.js';

// meeting_url hanya dibaca untuk has_meeting_url lalu dibuang; deskripsi tidak perlu di daftar.
const LIST_SELECT = [
  'id', 'slug', 'title', 'summary', 'poster_url', 'speakers', 'starts_at', 'duration_minutes',
  'sales_mode', 'sales_open_at', 'sales_close_at', 'price', 'quota', 'status', 'offer_kind',
  'is_listed', 'is_test', 'preview_token', 'published_at', 'created_at', 'updated_at',
  'meeting_url', 'webinar_offer_state',
  // Fase 5A: kunci R2 hanya untuk admin; pembeli tidak pernah menerimanya.
  'recording_object_key', 'recording_minutes', 'recording_published_at', 'materials_path',
  // Iterasi 7: Video kelas → webinar asal (sql/137); Iterasi 8: waktu kaitan (sql/138).
  'source_event_id', 'source_linked_at',
].join(',');

const LOCAL_TEST = 'Dimatikan di uji lokal karena memakai database produksi dan bisa mengirim email ke peserta sungguhan. Uji di produksi.';

async function freeSlug(sb, title, excludeId) {
  const base = slugifyTitle(title);
  const exclude = excludeId ? `&id=neq.${excludeId}` : '';
  const rows = await db(sb, `webinar_events?slug=like.${base}*&select=slug${exclude}`, {}, 'SELECT slug');
  return pickFreeSlug(base, (rows || []).map((r) => r.slug));
}

/** Slug dihitung ulang sekali lagi bila balapan dengan acara lain menghasilkan 23505. */
async function withSlugRetry(attempt) {
  try {
    return await attempt();
  } catch (err) {
    if (err instanceof DbError && err.code === '23505' && !isSourceConflict(err)) return attempt();
    throw err;
  }
}

/** 23505 dari index satu-Video-kelas-per-webinar (sql/137), bukan dari slug. */
const isSourceConflict = (err) => err instanceof DbError && err.code === '23505'
  && String(err.message).includes('webinar_events_source_unique');

const SOURCE_TAKEN = 'Webinar ini sudah punya Video kelas. Satu webinar paling banyak satu Video kelas.';

function normalized(body) {
  const result = normalizePatch(body.patch ?? {});
  if (result.error) throw refuse(400, result.error, { field: result.field });
  return result.patch;
}

/** Jenis halaman ditentukan saat dibuat (Iterasi 7): webinar dan Video kelas produk terpisah. */
function refuseKindChange(current, patch) {
  const kind = kindChangeError(current, patch);
  if (kind) {
    const { code, field, error } = kind;
    throw refuse(409, error, { code, field });
  }
}

/** Baris sesudah patch, dengan kedua invarian (penjualan + jenis) diterapkan. */
const nextRow = (current, patch) => applyKindInvariant(applySalesInvariant({ ...current, ...patch }));

/**
 * Iterasi 8: kaitan Video kelas ↔ webinar hanya berubah lewat link-video /
 * unlink-video (dengan konfirmasi & kunci), tidak lewat simpan otomatis form.
 * Nilai yang sama dengan sekarang dibuang dari patch, supaya form lama tetap jalan.
 */
function dropLinkFromPatch(current, patch) {
  if (!('source_event_id' in patch)) return patch;
  const { source_event_id: wanted, ...rest } = patch;
  if (wanted !== (current.source_event_id ?? null)) {
    throw refuse(409, 'Kaitan webinar diubah lewat Kaitkan / Lepas kaitan.', { code: 'use_link_action', field: 'source_event_id' });
  }
  return rest;
}

/**
 * Webinar asal Video kelas (sql/137), hanya untuk `create` ("Buat Video kelas dari
 * webinar ini"). Kaitan sesudahnya lewat link-video / unlink-video.
 */
async function checkSource(sb, current, next, patch) {
  if ((next.offer_kind ?? 'live') !== 'replay') {
    if (patch.source_event_id) throw refuse(400, 'Hanya Video kelas yang punya webinar asal', { field: 'source_event_id' });
    return null;
  }
  if (!next.source_event_id) return null;
  const changed = next.source_event_id !== (current.source_event_id ?? null);
  const [source] = (await db(
    sb,
    `webinar_events?id=eq.${next.source_event_id}&select=id,title,offer_kind,status,is_test,recording_published_at`,
    {},
    'SELECT webinar_events (webinar asal)'
  )) || [];
  const error = sourceError(next, source ?? null, { changed });
  if (error) throw refuse(400, error.error, { code: error.code, field: error.field });
  if (changed) {
    const self = current.id ? `&id=neq.${current.id}` : '';
    const taken = await db(sb, `webinar_events?source_event_id=eq.${next.source_event_id}${self}&select=id&limit=1`, {}, 'SELECT webinar_events (Video kelas lain)');
    if (taken?.length) throw refuse(409, SOURCE_TAKEN, { code: 'source_taken', field: 'source_event_id' });
  }
  return source;
}

/** Kolom yang benar-benar ditulis: isi patch, ditambah tanggal buka yang dikosongkan oleh invarian. */
function columnsToWrite(current, patch, next) {
  // Nilai sesudah invarian: isian live yang dikirim untuk Video kelas tertulis kosong.
  const write = Object.fromEntries(Object.keys(patch).map((key) => [key, next[key]]));
  if (next.sales_open_at === null && current.sales_open_at !== null && current.sales_open_at !== undefined) {
    write.sales_open_at = null;
  }
  return write;
}

function checkRules(current, next, { publishing = false, confirmScheduleChange = false } = {}) {
  const offer = current.webinar_offer_state || {};
  const cross = crossFieldError(next);
  if (cross) throw refuse(400, cross.error, { field: cross.field });

  if (publishing || next.status === 'published') {
    const missing = missingForPublish(next);
    if (missing.length) {
      throw refuse(400, 'Masih ada isian yang perlu dilengkapi', { code: 'missing_fields', fields: missing, field: missing[0] });
    }
  }

  const quota = quotaError(current, next, offer) || clearedScheduleError(current, next, offer);
  if (quota) throw refuse(400, quota.error, { field: quota.field });

  const sold = Number(offer.sold) || 0;
  if (current.status === 'published' && sold > 0 && scheduleChanged(current, next) && !confirmScheduleChange) {
    throw refuse(409, 'Jadwal berubah padahal tiket sudah terjual', { code: 'confirm_schedule', sold });
  }
}

const soldOf = (row) => Number(row?.webinar_offer_state?.sold) || 0;

/** Kunci kaitan Video kelas ↔ webinar (keputusan pemilik produk 10 Nov), atau null. */
async function linkLockOf(sb, video) {
  if (!video?.source_event_id) return null;
  const webinar = await loadEvent(sb, video.source_event_id);
  return linkLockError(webinar, video, soldOf(webinar));
}

function refuseIfLocked(lock) {
  if (lock) throw refuse(409, lock.error, { code: lock.code, field: lock.field });
}

const FAILURE_MESSAGE = {
  participants: 'Daftar peserta belum bisa dimuat. Coba lagi sebentar.',
  participant: 'Data peserta belum bisa dimuat. Coba lagi sebentar.',
  'resend-ticket': 'E-tiket belum bisa dikirim ulang. Coba lagi sebentar.',
  'check-order': 'Status pembayaran belum bisa dicek. Coba lagi sebentar.',
  refund: 'Refund belum bisa dicatat. Coba lagi sebentar.',
  buyers: 'Data pembeli webinar belum bisa dimuat. Coba lagi sebentar.',
  'recording-upload-start': 'Unggahan belum bisa dimulai. Coba lagi sebentar.',
  'recording-part-urls': 'Unggahan terputus. Coba lagi sebentar.',
  'recording-upload-complete': 'Video belum bisa disimpan. Coba lagi sebentar.',
  'recording-upload-abort': 'Unggahan belum bisa dibatalkan.',
  'recording-preview': 'Pratinjau belum bisa dimuat. Coba lagi sebentar.',
  'materials-save': 'Materi belum bisa disimpan. Coba lagi sebentar.',
  'recording-publish': 'Rekaman belum bisa diterbitkan. Coba lagi sebentar.',
  'link-video': 'Video kelas belum bisa dikaitkan. Coba lagi sebentar.',
  'unlink-video': 'Kaitan belum bisa dilepas. Coba lagi sebentar.',
};

// ── Aksi ───────────────────────────────────────────────────────────────────

async function list(sb) {
  const rows = await db(sb, `webinar_events?select=${LIST_SELECT}&order=created_at.desc`, {}, 'SELECT webinar_events (daftar)');
  // webinar_offer_state.sold hanya menghitung tiket live; Video kelas dihitung di sini.
  const paid = await dbAll(sb, 'webinar_orders?status=eq.paid&select=event_id,kind&order=id.asc', 'SELECT webinar_orders (terjual)');
  const sold = new Map();
  for (const o of paid) {
    const n = sold.get(o.event_id) ?? { live: 0, replay: 0 };
    n[o.kind === 'replay' ? 'replay' : 'live'] += 1;
    sold.set(o.event_id, n);
  }
  return {
    events: (rows || []).map((row) => ({
      ...decorate(row, { full: false }),
      sold_live: sold.get(row.id)?.live ?? 0,
      sold_replay: sold.get(row.id)?.replay ?? 0,
    })),
  };
}

async function get(sb, body) {
  return { event: decorate(await loadOrRefuse(sb, body.id)) };
}

async function create(sb, body) {
  const patch = normalized(body);
  if (!patch.title) throw refuse(400, 'Judul wajib diisi', { field: 'title' });
  const row = applyKindInvariant(applySalesInvariant({ sales_mode: 'coming_soon', offer_kind: 'live', ...patch }));
  const cross = crossFieldError(row);
  if (cross) throw refuse(400, cross.error, { field: cross.field });
  const source = await checkSource(sb, { status: 'draft' }, { status: 'draft', ...row }, patch);
  // Video kelas dari acara uji juga uji: transaksinya berlabel Uji dan halamannya
  // terbuka selama masa uji. Diambil dari baris sumber, bukan dari browser.
  // Kaitan selalu berpasangan dengan waktunya (CHECK sql/138).
  const fromSource = source ? { is_test: Boolean(source.is_test), source_linked_at: new Date().toISOString() } : {};

  const inserted = await withSlugRetry(async () => {
    const slug = await freeSlug(sb, row.title);
    return db(sb, 'webinar_events?select=id', {
      method: 'POST',
      body: JSON.stringify({ ...row, ...fromSource, slug, status: 'draft' }),
    }, 'INSERT webinar_events');
  });
  const id = inserted?.[0]?.id;
  if (!id) throw new Error('INSERT webinar_events: nol baris');
  return { event: decorate(await loadOrRefuse(sb, id)) };
}

async function save(sb, body, ctx) {
  const current = await loadOrRefuse(sb, body.id);
  if (current.status === 'cancelled') throw refuse(409, 'Acara yang dibatalkan tidak bisa diubah', { code: 'cancelled' });
  if (body.expectedUpdatedAt && body.expectedUpdatedAt !== current.updated_at) {
    throw refuse(409, 'Acara ini baru diubah di tempat lain. Muat ulang dulu.', { code: 'stale' });
  }

  const patch = dropLinkFromPatch(current, normalized(body));
  refuseKindChange(current, patch);
  const next = nextRow(current, patch);
  // Peserta dikabari otomatis bila jadwal acara yang sudah terjual berubah: cukup
  // tandai schedule_changed_at; cron mengirim email per peserta (sql/136b).
  const notifySchedule = current.status === 'published' && soldOf(current) > 0 && scheduleChanged(current, next);
  if (notifySchedule && ctx.local) throw refuse(403, LOCAL_TEST, { code: 'local_test' });
  checkRules(current, next, { confirmScheduleChange: body.confirmScheduleChange === true });

  const write = columnsToWrite(current, patch, next);
  if (Object.keys(write).length === 0) return { event: decorate(current) };

  const followTitle = !isSlugLocked(current) && 'title' in patch && patch.title !== current.title;
  const event = await withSlugRetry(async () => writeEvent(sb, body.id, {
    ...write,
    ...(followTitle ? { slug: await freeSlug(sb, next.title, body.id) } : {}),
    ...(notifySchedule ? { schedule_changed_at: new Date().toISOString() } : {}),
  }, 'PATCH webinar_events (simpan)'));
  return { event: decorate(event), ...(notifySchedule ? { notify_scheduled: soldOf(current) } : {}) };
}

async function publish(sb, body) {
  const current = await loadOrRefuse(sb, body.id);
  if (current.status !== 'draft') throw refuse(409, 'Acara ini sudah pernah terbit', { code: 'not_draft' });
  if (body.expectedUpdatedAt && body.expectedUpdatedAt !== current.updated_at) {
    throw refuse(409, 'Acara ini baru diubah di tempat lain. Muat ulang dulu.', { code: 'stale' });
  }

  const patch = dropLinkFromPatch(current, normalized(body));
  refuseKindChange(current, patch);
  const next = nextRow(current, patch);
  if (next.sales_mode === 'closed') {
    throw refuse(400, 'Pilih kapan penjualan dibuka sebelum terbit', { field: 'sales_open_at' });
  }
  checkRules(current, next, { publishing: true });

  const followTitle = !isSlugLocked(current) && 'title' in patch && patch.title !== current.title;
  const event = await withSlugRetry(async () => writeEvent(sb, body.id, {
    ...columnsToWrite(current, patch, next),
    ...(followTitle ? { slug: await freeSlug(sb, next.title, body.id) } : {}),
    status: 'published',
    published_at: current.published_at ?? new Date().toISOString(),
  }, 'PATCH webinar_events (terbit)'));
  return { event: decorate(event) };
}

async function closeSales(sb, body) {
  const current = await loadOrRefuse(sb, body.id);
  if (current.status !== 'published') throw refuse(409, 'Hanya acara terbit yang bisa ditutup penjualannya', { code: 'not_published' });
  if (current.sales_mode === 'closed') return { event: decorate(current) };
  const event = await writeEvent(sb, body.id, { sales_mode: 'closed', sales_open_at: null }, 'PATCH webinar_events (tutup)');
  return { event: decorate(event) };
}

/**
 * Batalkan acara terbit. Memanggil ulang pada acara yang sudah batal hanya
 * menjalankan pembersihan order pending (mis. sesudah DOKU sempat gagal).
 * Bayaran yang masuk belakangan tetap dicatat webinar_mark_paid sebagai alarm
 * webinar_paid_on_cancelled, jadi admin tetap tahu siapa yang harus dihubungi.
 */
async function cancel(sb, env, body, ctx) {
  const current = await loadOrRefuse(sb, body.id);
  if (current.status === 'draft') throw refuse(409, 'Draft dihapus, bukan dibatalkan', { code: 'draft' });
  // Membatalkan Video kelas berarti email "Webinar dibatalkan" ke pemegang tiket dan
  // rekamannya hilang dari mereka (Fase 5B). Untuk berhenti menjual: Tutup penjualan.
  if ((current.offer_kind ?? 'live') === 'replay') {
    throw refuse(409, 'Video kelas tidak dibatalkan. Pakai Tutup penjualan untuk berhenti menjual.', { code: 'replay_no_cancel' });
  }
  // Sesudah acara mulai, membatalkan berarti email "dibatalkan" untuk acara yang sudah
  // terjadi dan rekamannya hilang dari pemegang tiket (Iterasi 7). Memanggil ulang pada
  // acara yang sudah batal tetap boleh: hanya membersihkan.
  if (current.status === 'published' && current.starts_at && Date.now() >= Date.parse(current.starts_at)) {
    throw refuse(409, 'Acara yang sudah mulai tidak bisa dibatalkan. Pakai Tutup penjualan untuk berhenti menjual.', { code: 'already_started' });
  }
  // Hanya transisi pertama yang mengabari peserta (cron per peserta, sql/136b);
  // memanggil ulang hanya membersihkan.
  const notifyCancel = current.status === 'published' && soldOf(current) > 0;
  if (notifyCancel && ctx.local) throw refuse(403, LOCAL_TEST, { code: 'local_test' });

  const event = current.status === 'published'
    ? await writeEvent(sb, body.id, { status: 'cancelled' }, 'PATCH webinar_events (batal)')
    : current;

  const pending = await db(
    sb,
    `webinar_orders?event_id=eq.${body.id}&status=eq.pending&select=id,invoice_number,doku_request_id,payment_expires_at`,
    {},
    'SELECT webinar_orders (pending)'
  ) || [];

  const now = Date.now();
  const live = pending.filter((o) => o.payment_expires_at && Date.parse(o.payment_expires_at) > now);
  const results = await Promise.all(live.map(async (o) => ({
    invoice: o.invoice_number,
    ...(await cancelDokuOrder(env, o.invoice_number, o.doku_request_id, 'Acara webinar dibatalkan')),
  })));
  const failed = results.filter((r) => !r.cancelled).map((r) => ({ invoice: r.invoice, reason: r.reason }));
  if (failed.length) console.error('[admin/webinar] link DOKU gagal dimatikan', failed);

  // Nol baris sah: order bisa saja sudah dibayar/kedaluwarsa di antara baca dan tulis.
  if (pending.length) {
    await db(sb, `webinar_orders?event_id=eq.${body.id}&status=eq.pending`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'cancelled' }),
    }, 'PATCH webinar_orders (batal)');
  }

  return {
    event: decorate(event),
    pending_cancelled: pending.length,
    doku_cancelled: results.length - failed.length,
    doku_failed: failed,
    ...(notifyCancel ? { notify_scheduled: soldOf(current) } : {}),
  };
}

async function remove(sb, env, body) {
  const current = await loadOrRefuse(sb, body.id);
  if (current.status !== 'draft') throw refuse(409, 'Hanya draft yang bisa dihapus. Acara terbit memakai Batalkan acara.', { code: 'not_draft' });

  // Video kelas yang sudah ditonton pemegang tiket webinar tidak boleh hilang.
  refuseIfLocked(await linkLockOf(sb, current));

  const orders = await db(sb, `webinar_orders?event_id=eq.${body.id}&select=id&limit=1`, {}, 'SELECT webinar_orders (hapus)');
  if (orders?.length) throw refuse(409, 'Draft ini sudah punya order, jadi tidak bisa dihapus', { code: 'has_orders' });

  const deleted = await db(sb, `webinar_events?id=eq.${body.id}&status=eq.draft&select=id`, { method: 'DELETE' }, 'DELETE webinar_events');
  if (!deleted?.length) throw refuse(409, 'Acara ini baru berubah. Muat ulang dulu.', { code: 'stale' });
  // Baris sudah tiada: berkasnya tidak dipakai siapa pun lagi. Gagal membersihkan
  // hanya dicatat di log (berkas yatim, bukan galat bagi admin).
  const filesRemoved = await purgeEventFiles(sb, env, current);
  return { deleted: body.id, files_removed: filesRemoved };
}

/**
 * Kaitkan Video kelas ke webinar (Iterasi 8): pemegang tiket webinar ikut menonton
 * rekaman Video kelas itu tanpa membeli. Satu PATCH berfilter id Video kelas saja,
 * menulis sumber + waktunya bersamaan (CHECK sql/138). Bila kaitan ini langsung
 * membuka akses (webinar sudah mulai, rekaman sudah terbit), cron mengirim email
 * "Rekaman tersedia" ke pemegang tiket dan kaitannya langsung terkunci.
 */
async function linkVideo(sb, body, ctx) {
  const webinar = await loadOrRefuse(sb, body.id);
  if ((webinar.offer_kind ?? 'live') !== 'live' || webinar.status !== 'published') {
    throw refuse(409, 'Video kelas hanya bisa dikaitkan ke webinar yang sudah terbit dan tidak dibatalkan', { code: 'source_invalid', field: 'source_event_id' });
  }
  const video = await loadOrRefuse(sb, body.videoId);
  if (video.offer_kind !== 'replay' || video.status === 'cancelled') {
    throw refuse(409, 'Yang dikaitkan harus Video kelas', { code: 'video_invalid', field: 'source_event_id' });
  }
  if (video.source_event_id === webinar.id) return { event: decorate(webinar), video: decorate(video), notify_scheduled: 0 };
  if (video.source_event_id) {
    throw refuse(409, 'Video kelas ini sudah dikaitkan ke webinar lain. Lepas kaitannya dulu.', { code: 'video_linked', field: 'source_event_id' });
  }
  if (Boolean(video.is_test) !== Boolean(webinar.is_test)) {
    throw refuse(409, 'Acara uji hanya bisa dikaitkan dengan Video kelas uji, dan sebaliknya.', { code: 'test_mismatch', field: 'source_event_id' });
  }
  const taken = await db(sb, `webinar_events?source_event_id=eq.${webinar.id}&select=id&limit=1`, {}, 'SELECT webinar_events (Video kelas lain)');
  if (taken?.length) throw refuse(409, SOURCE_TAKEN, { code: 'source_taken', field: 'source_event_id' });

  const opens = holderVideo(webinar, { ...video, source_event_id: webinar.id }) ? soldOf(webinar) : 0;
  if (opens > 0 && ctx.local) throw refuse(403, LOCAL_TEST, { code: 'local_test' });

  const fresh = await writeEvent(sb, video.id, {
    source_event_id: webinar.id,
    source_linked_at: new Date().toISOString(),
  }, 'PATCH webinar_events (kaitkan)');
  return { event: decorate(webinar), video: decorate(fresh), notify_scheduled: opens };
}

/** Lepas kaitan (id = Video kelas). Ditolak bila terkunci; tanpa kaitan = tidak ada yang ditulis. */
async function unlinkVideo(sb, body) {
  const video = await loadOrRefuse(sb, body.id);
  if (video.offer_kind !== 'replay') throw refuse(409, 'Lepas kaitan dari Video kelas', { code: 'video_invalid' });
  if (!video.source_event_id) return { video: decorate(video) };
  refuseIfLocked(await linkLockOf(sb, video));
  const fresh = await writeEvent(sb, video.id, { source_event_id: null, source_linked_at: null }, 'PATCH webinar_events (lepas kaitan)');
  return { video: decorate(fresh) };
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function onRequest({ request, env, waitUntil }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const user = await caller(env, request);
  if (!user || !adminEmails(env).includes(user.email)) return json(401, { error: 'Unauthorized' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Body bukan JSON' }); }
  const invalid = validateWebinarRequest(body);
  if (invalid) return json(400, { error: invalid });

  const local = webinarLocalOpen(env, request);
  if (local && LOCAL_BLOCKED_ACTIONS.includes(body.action)) return json(403, { error: LOCAL_TEST, code: 'local_test' });

  try {
    const sb = resolveService(env);
    const ctx = { env, waitUntil, local, adminEmail: user.email };
    switch (body.action) {
      case 'list': return json(200, await list(sb));
      case 'get': return json(200, await get(sb, body));
      case 'create': return json(200, await create(sb, body));
      case 'save': return json(200, await save(sb, body, ctx));
      case 'publish': return json(200, await publish(sb, body));
      case 'close-sales': return json(200, await closeSales(sb, body));
      case 'cancel': return json(200, await cancel(sb, env, body, ctx));
      case 'delete': return json(200, await remove(sb, env, body));
      case 'participants': return json(200, await participants(sb, body));
      case 'participant': return json(200, await participant(sb, body));
      case 'resend-ticket': return json(200, await resendTicket(sb, env, body));
      case 'check-order': return json(200, await checkOrder(sb, env, body, waitUntil));
      case 'refund': return json(200, await refundOrder(sb, body, user.email));
      case 'buyers': return json(200, await buyers(sb));
      case 'recording-upload-start': return json(200, await uploadStart(sb, env, body));
      case 'recording-part-urls': return json(200, await partUrls(sb, env, body));
      case 'recording-upload-complete': return json(200, await uploadComplete(sb, env, body, ctx));
      case 'recording-upload-abort': return json(200, await uploadAbort(sb, env, body));
      case 'recording-preview': return json(200, await preview(sb, env, body));
      case 'materials-save': return json(200, await saveMaterials(sb, body));
      case 'recording-publish': return json(200, await publishRecording(sb, body, ctx));
      case 'link-video': return json(200, await linkVideo(sb, body, ctx));
      case 'unlink-video': return json(200, await unlinkVideo(sb, body));
      default: return json(400, { error: 'Tindakan tidak diizinkan' });
    }
  } catch (err) {
    if (err instanceof Refusal) return json(err.status, { error: err.message, ...err.extra });
    if (err instanceof StorageError) {
      console.error('[admin/webinar]', body.action, err.message);
      return json(502, { error: 'Penyimpanan rekaman tidak menjawab. Coba lagi sebentar.', code: 'storage_failed' });
    }
    if (err instanceof DbError && err.code === '23503') {
      return json(409, { error: 'Acara ini sudah punya order, jadi tidak bisa dihapus', code: 'has_orders' });
    }
    if (isSourceConflict(err)) {
      return json(409, { error: SOURCE_TAKEN, code: 'source_taken', field: 'source_event_id' });
    }
    if (err instanceof DbError && err.code === '23505') {
      return json(409, { error: 'URL acara bentrok dengan acara lain. Coba simpan lagi.', code: 'slug_taken' });
    }
    if (err instanceof DbError && err.code === '23514') {
      console.error('[admin/webinar] CHECK', err.message);
      return json(400, { error: 'Isian belum memenuhi syarat penyimpanan. Periksa lagi isian penjualan.' });
    }
    console.error('[admin/webinar]', body.action, err);
    return json(500, { error: FAILURE_MESSAGE[body.action] ?? 'Acara belum bisa disimpan. Coba lagi sebentar.' });
  }
}
