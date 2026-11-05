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
import { buildEventView } from '../webinar/_view.js';
import { cancelDokuOrder } from '../doku/_doku-cancel.js';
import {
  adminEmails, validateWebinarRequest, normalizePatch, applySalesInvariant, slugifyTitle, pickFreeSlug,
  isSlugLocked, missingForPublish, crossFieldError, quotaError, clearedScheduleError, scheduleChanged,
} from './webinarGate.js';

const EVENT_SELECT = '*,webinar_offer_state';

// meeting_url hanya dibaca untuk has_meeting_url lalu dibuang; deskripsi tidak perlu di daftar.
const LIST_SELECT = [
  'id', 'slug', 'title', 'summary', 'poster_url', 'speakers', 'starts_at', 'duration_minutes',
  'sales_mode', 'sales_open_at', 'sales_close_at', 'price', 'quota', 'status', 'offer_kind',
  'is_listed', 'is_test', 'preview_token', 'published_at', 'created_at', 'updated_at',
  'meeting_url', 'webinar_offer_state',
].join(',');

class DbError extends Error {
  constructor(label, status, body) {
    super(`${label} gagal — HTTP ${status}: ${JSON.stringify(body).slice(0, 400)}`);
    this.status = status;
    this.code = body && typeof body === 'object' ? body.code : undefined;
  }
}

class Refusal extends Error {
  constructor(status, error, extra = {}) {
    super(error);
    this.status = status;
    this.extra = extra;
  }
}

const refuse = (status, error, extra) => new Refusal(status, error, extra);

async function db(sb, path, init = {}, label = path) {
  const res = await fetch(`${sb.url}/rest/v1/${path}`, {
    ...init,
    headers: { ...sb.headers, Prefer: 'return=representation', ...(init.headers || {}) },
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!res.ok) throw new DbError(label, res.status, data);
  return data;
}

function decorate(row, { full = true } = {}) {
  const { meeting_url: meetingUrl, ...rest } = row;
  return { ...(full ? row : rest), view: buildEventView(row), has_meeting_url: Boolean(meetingUrl) };
}

async function loadEvent(sb, id) {
  const rows = await db(sb, `webinar_events?id=eq.${id}&select=${EVENT_SELECT}`, {}, 'SELECT webinar_events');
  return rows?.[0] ?? null;
}

async function loadOrRefuse(sb, id) {
  const row = await loadEvent(sb, id);
  if (!row) throw refuse(404, 'Acara tidak ditemukan');
  return row;
}

/** PATCH berfilter id saja, minta barisnya kembali, lalu baca ulang bersama keadaan penjualan. */
async function writeEvent(sb, id, write, label) {
  const rows = await db(sb, `webinar_events?id=eq.${id}&select=id`, { method: 'PATCH', body: JSON.stringify(write) }, label);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${label}: nol baris berubah`);
  const fresh = await loadEvent(sb, id);
  if (!fresh) throw new Error(`${label}: baris hilang sesudah ditulis`);
  return fresh;
}

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
    if (err instanceof DbError && err.code === '23505') return attempt();
    throw err;
  }
}

function normalized(body) {
  const result = normalizePatch(body.patch ?? {});
  if (result.error) throw refuse(400, result.error, { field: result.field });
  return result.patch;
}

/** Kolom yang benar-benar ditulis: isi patch, ditambah tanggal buka yang dikosongkan oleh invarian. */
function columnsToWrite(current, patch, next) {
  const write = { ...patch };
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

// ── Aksi ───────────────────────────────────────────────────────────────────

async function list(sb) {
  const rows = await db(sb, `webinar_events?select=${LIST_SELECT}&order=created_at.desc`, {}, 'SELECT webinar_events (daftar)');
  return { events: (rows || []).map((row) => decorate(row, { full: false })) };
}

async function get(sb, body) {
  return { event: decorate(await loadOrRefuse(sb, body.id)) };
}

async function create(sb, body) {
  const patch = normalized(body);
  if (!patch.title) throw refuse(400, 'Judul wajib diisi', { field: 'title' });
  const row = applySalesInvariant({ sales_mode: 'coming_soon', ...patch });
  const cross = crossFieldError(row);
  if (cross) throw refuse(400, cross.error, { field: cross.field });

  const inserted = await withSlugRetry(async () => {
    const slug = await freeSlug(sb, row.title);
    return db(sb, 'webinar_events?select=id', {
      method: 'POST',
      body: JSON.stringify({ ...row, slug, status: 'draft' }),
    }, 'INSERT webinar_events');
  });
  const id = inserted?.[0]?.id;
  if (!id) throw new Error('INSERT webinar_events: nol baris');
  return { event: decorate(await loadOrRefuse(sb, id)) };
}

async function save(sb, body) {
  const current = await loadOrRefuse(sb, body.id);
  if (current.status === 'cancelled') throw refuse(409, 'Acara yang dibatalkan tidak bisa diubah', { code: 'cancelled' });
  if (body.expectedUpdatedAt && body.expectedUpdatedAt !== current.updated_at) {
    throw refuse(409, 'Acara ini baru diubah di tempat lain. Muat ulang dulu.', { code: 'stale' });
  }

  const patch = normalized(body);
  const next = applySalesInvariant({ ...current, ...patch });
  checkRules(current, next, { confirmScheduleChange: body.confirmScheduleChange === true });

  const write = columnsToWrite(current, patch, next);
  if (Object.keys(write).length === 0) return { event: decorate(current) };

  const followTitle = !isSlugLocked(current) && 'title' in patch && patch.title !== current.title;
  const event = await withSlugRetry(async () => writeEvent(sb, body.id, {
    ...write,
    ...(followTitle ? { slug: await freeSlug(sb, next.title, body.id) } : {}),
  }, 'PATCH webinar_events (simpan)'));
  return { event: decorate(event) };
}

async function publish(sb, body) {
  const current = await loadOrRefuse(sb, body.id);
  if (current.status !== 'draft') throw refuse(409, 'Acara ini sudah pernah terbit', { code: 'not_draft' });
  if (body.expectedUpdatedAt && body.expectedUpdatedAt !== current.updated_at) {
    throw refuse(409, 'Acara ini baru diubah di tempat lain. Muat ulang dulu.', { code: 'stale' });
  }

  const patch = normalized(body);
  const next = applySalesInvariant({ ...current, ...patch });
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
async function cancel(sb, env, body) {
  const current = await loadOrRefuse(sb, body.id);
  if (current.status === 'draft') throw refuse(409, 'Draft dihapus, bukan dibatalkan', { code: 'draft' });

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
  };
}

async function remove(sb, body) {
  const current = await loadOrRefuse(sb, body.id);
  if (current.status !== 'draft') throw refuse(409, 'Hanya draft yang bisa dihapus. Acara terbit memakai Batalkan acara.', { code: 'not_draft' });

  const orders = await db(sb, `webinar_orders?event_id=eq.${body.id}&select=id&limit=1`, {}, 'SELECT webinar_orders (hapus)');
  if (orders?.length) throw refuse(409, 'Draft ini sudah punya order, jadi tidak bisa dihapus', { code: 'has_orders' });

  const deleted = await db(sb, `webinar_events?id=eq.${body.id}&status=eq.draft&select=id`, { method: 'DELETE' }, 'DELETE webinar_events');
  if (!deleted?.length) throw refuse(409, 'Acara ini baru berubah. Muat ulang dulu.', { code: 'stale' });
  return { deleted: body.id };
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const user = await caller(env, request);
  if (!user || !adminEmails(env).includes(user.email)) return json(401, { error: 'Unauthorized' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Body bukan JSON' }); }
  const invalid = validateWebinarRequest(body);
  if (invalid) return json(400, { error: invalid });

  try {
    const sb = resolveService(env);
    switch (body.action) {
      case 'list': return json(200, await list(sb));
      case 'get': return json(200, await get(sb, body));
      case 'create': return json(200, await create(sb, body));
      case 'save': return json(200, await save(sb, body));
      case 'publish': return json(200, await publish(sb, body));
      case 'close-sales': return json(200, await closeSales(sb, body));
      case 'cancel': return json(200, await cancel(sb, env, body));
      case 'delete': return json(200, await remove(sb, body));
      default: return json(400, { error: 'Tindakan tidak diizinkan' });
    }
  } catch (err) {
    if (err instanceof Refusal) return json(err.status, { error: err.message, ...err.extra });
    if (err instanceof DbError && err.code === '23503') {
      return json(409, { error: 'Acara ini sudah punya order, jadi tidak bisa dihapus', code: 'has_orders' });
    }
    if (err instanceof DbError && err.code === '23505') {
      return json(409, { error: 'URL acara bentrok dengan acara lain. Coba simpan lagi.', code: 'slug_taken' });
    }
    if (err instanceof DbError && err.code === '23514') {
      console.error('[admin/webinar] CHECK', err.message);
      return json(400, { error: 'Isian belum memenuhi syarat penyimpanan. Periksa lagi isian penjualan.' });
    }
    console.error('[admin/webinar]', body.action, err);
    return json(500, { error: 'Acara belum bisa disimpan. Coba lagi sebentar.' });
  }
}
