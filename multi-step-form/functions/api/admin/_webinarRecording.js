// Fase 5A menu Webinar admin: rekaman di Cloudflare R2 + materi di Supabase Storage
// (rencana "Iterasi 6 Nov (3)", sql/136).
//
// Alur unggah (browser → R2 langsung; Function hanya menandatangani):
//   recording-upload-start    → buat multipart, balas {key, uploadId, partSize}
//   recording-part-urls       → URL PUT per bagian (2 jam), maks. 20 per panggilan
//   recording-upload-complete → selesaikan multipart, HEAD ukuran, PATCH acara,
//                               lalu hapus objek lama (bila ganti video)
//   recording-upload-abort    → batalkan multipart (tombol Batal)
// Lalu recording-preview (URL baca 1 jam), materials-save, dan recording-publish
// (dua centang wajib; email "Rekaman tersedia" dikirim cron per peserta, sql/136b,
// sekali per tiket lewat penanda recording_email_sent_at). Draft Video kelas boleh
// menerbitkan rekaman (Fase 5B).
//
// Iterasi 8 (sql/138): rekaman & materi HANYA di baris Video kelas. Baris webinar
// ditolak (409 recording_on_video); pemegang tiket webinar menonton rekaman Video
// kelas yang dikaitkan (source_event_id).
//
// Aturan tulis sama dengan webinar.js: PATCH acara memfilter id saja dan meminta
// barisnya kembali. Kunci R2 hanya dikirim ke admin, tidak pernah ke pembeli.

import {
  recordingConfig, objectKey, presignGet, presignPart, createMultipart, completeMultipart,
  abortMultipart, headObject, deleteObject,
} from '../webinar/_recording.js';
import { MAX_RECORDING_BYTES, RECORDING_PART_SIZE } from './webinarGate.js';
import { db, decorate, loadEvent, loadOrRefuse, refuse, writeEvent } from './_webinarDb.js';
import { holderVideo } from '../webinar/_recordingAccess.js';

export const PREVIEW_SECONDS = 3600;
const PART_URL_SECONDS = 2 * 3600;
const MATERIALS_BUCKET = 'webinar-materials';

const LOCAL_TEST = 'Dimatikan di uji lokal karena memakai database produksi: aksi ini mengubah rekaman yang sudah ditonton atau mengirim email ke pembeli sungguhan. Uji di produksi.';

function config(env) {
  const c = recordingConfig(env);
  if (!c) throw refuse(503, 'Penyimpanan rekaman belum diatur. Minta tim dev mengisi secret R2.', { code: 'storage_unconfigured' });
  return c;
}

function requireVideo(event) {
  if ((event.offer_kind ?? 'live') !== 'replay') {
    throw refuse(409, 'Rekaman webinar diunggah di Video kelas yang dikaitkan.', { code: 'recording_on_video' });
  }
  return event;
}

async function loadEditable(sb, id) {
  const event = await loadOrRefuse(sb, id);
  if (event.status === 'cancelled') throw refuse(409, 'Acara yang dibatalkan tidak punya rekaman', { code: 'cancelled' });
  return requireVideo(event);
}

/** Pembeli Video kelas ini sudah ada (order lunas apa pun jenisnya). */
async function hasPaidOrders(sb, eventId) {
  const rows = await db(sb, `webinar_orders?event_id=eq.${eventId}&status=eq.paid&select=id&limit=1`, {}, 'SELECT webinar_orders (lunas)');
  return Array.isArray(rows) && rows.length > 0;
}

export async function uploadStart(sb, env, body) {
  const c = config(env);
  await loadEditable(sb, body.id);
  const key = objectKey(body.id, body.fileName);
  const uploadId = await createMultipart(c, key);
  return { key, uploadId, partSize: RECORDING_PART_SIZE };
}

export async function partUrls(sb, env, body) {
  const c = config(env);
  const urls = await Promise.all(body.partNumbers.map(async (partNumber) => ({
    partNumber,
    url: await presignPart(c, body.key, body.uploadId, partNumber, PART_URL_SECONDS),
  })));
  return { urls };
}

export async function uploadComplete(sb, env, body, ctx) {
  const c = config(env);
  const current = await loadEditable(sb, body.id);
  if (ctx.local && current.recording_published_at) throw refuse(403, LOCAL_TEST, { code: 'local_test' });

  await completeMultipart(c, body.key, body.uploadId, body.parts);
  const head = await headObject(c, body.key);
  if (!head || head.size < 1 || head.size > MAX_RECORDING_BYTES) {
    await deleteObject(c, body.key).catch((err) => console.error('[admin/webinar] hapus objek gagal:', err?.message || err));
    throw refuse(400, 'Video yang tersimpan tidak utuh. Unggah ulang.', { code: 'bad_object' });
  }

  const event = await writeEvent(sb, body.id, {
    recording_object_key: body.key,
    recording_minutes: body.minutes,
  }, 'PATCH webinar_events (rekaman)');

  // Sesudah baris menunjuk objek baru: objek lama tidak dipakai siapa pun lagi.
  const old = current.recording_object_key;
  let oldDeleted = null;
  if (old && old !== body.key) {
    oldDeleted = await deleteObject(c, old).then(() => true, (err) => {
      console.error('[admin/webinar] objek rekaman lama gagal dihapus:', old, err?.message || err);
      return false;
    });
  }
  return { event: decorate(event), size: head.size, old_deleted: oldDeleted };
}

export async function uploadAbort(sb, env, body) {
  const c = config(env);
  try {
    await abortMultipart(c, body.key, body.uploadId);
  } catch (err) {
    // Unggahan yang sudah selesai/dibatalkan tidak perlu dibatalkan lagi.
    if (err?.status !== 404) throw err;
  }
  return { aborted: true };
}

export async function preview(sb, env, body) {
  const c = config(env);
  const event = requireVideo(await loadOrRefuse(sb, body.id));
  if (!event.recording_object_key) throw refuse(404, 'Rekaman belum diunggah', { code: 'no_recording' });
  return {
    url: await presignGet(c, event.recording_object_key, PREVIEW_SECONDS),
    expires_at: new Date(Date.now() + PREVIEW_SECONDS * 1000).toISOString(),
  };
}

/** Berkas sungguh ada di bucket (diunggah admin lewat Storage API, policy sql/131). */
async function materialExists(sb, path) {
  const slash = path.indexOf('/');
  const res = await fetch(`${sb.url}/storage/v1/object/list/${MATERIALS_BUCKET}`, {
    method: 'POST',
    headers: sb.headers,
    body: JSON.stringify({ prefix: path.slice(0, slash), search: path.slice(slash + 1), limit: 100 }),
  });
  if (!res.ok) throw new Error(`Storage list ${MATERIALS_BUCKET} gagal — HTTP ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) && rows.some((r) => r?.name === path.slice(slash + 1));
}

export async function saveMaterials(sb, body) {
  await loadEditable(sb, body.id);
  if (!(await materialExists(sb, body.path))) throw refuse(400, 'Berkas materi belum terunggah. Coba unggah lagi.', { code: 'no_material' });
  const event = await writeEvent(sb, body.id, { materials_path: body.path }, 'PATCH webinar_events (materi)');
  return { event: decorate(event) };
}

export async function publishRecording(sb, body, ctx) {
  const current = await loadEditable(sb, body.id);
  // Rekaman Video kelas boleh terbit saat halamannya masih draft (Fase 5B): halaman
  // baru bisa dijual sesudah rekamannya terbit, dan V draft yang dikaitkan ke webinar
  // = rekaman khusus peserta (Iterasi 8).
  if (!current.recording_object_key) throw refuse(409, 'Unggah video rekaman dulu', { code: 'no_recording' });
  // Sekali terbit: menekan lagi tidak mengubah apa pun (penanda per tiket juga menjaga).
  if (current.recording_published_at) return { event: decorate(current), already: true };

  // Pemegang tiket webinar terkait dikabari cron bila webinarnya sudah mulai;
  // bila belum, email berangkat saat acara mulai.
  const publishedAt = new Date().toISOString();
  const webinar = current.source_event_id ? await loadEvent(sb, current.source_event_id) : null;
  const notify = holderVideo(webinar, { ...current, recording_published_at: publishedAt })
    ? Number(webinar.webinar_offer_state?.sold) || 0
    : 0;
  if (ctx.local && (notify > 0 || await hasPaidOrders(sb, body.id))) throw refuse(403, LOCAL_TEST, { code: 'local_test' });

  const event = await writeEvent(sb, body.id, { recording_published_at: publishedAt }, 'PATCH webinar_events (terbit rekaman)');
  return { event: decorate(event), notify_scheduled: notify };
}

/**
 * Hapus berkas milik draft yang barisnya SUDAH terhapus (Iterasi 7): video di R2 dan
 * seluruh materi di folder `<id>/` bucket webinar-materials (termasuk versi yang
 * sudah diganti). Gambar di webinar-public sengaja dibiarkan: foto pembicara ikut
 * tersalin ke Video kelas yang dibuat dari webinar, jadi URL-nya bisa dipakai bersama.
 *
 * @returns {Promise<boolean>} true bila semua yang ada terhapus; galat hanya dicatat.
 */
export async function purgeEventFiles(sb, env, row) {
  let ok = true;
  const fail = (what) => (err) => {
    ok = false;
    console.error(`[admin/webinar] ${what} draft ${row.id} gagal dihapus:`, err?.message || err);
  };
  if (row.recording_object_key) {
    const c = recordingConfig(env);
    if (c) await deleteObject(c, row.recording_object_key).catch(fail('video'));
    else fail('video')(new Error('secret R2 belum diatur'));
  }
  await removeMaterialFolder(sb, row.id).catch(fail('materi'));
  return ok;
}

async function removeMaterialFolder(sb, eventId) {
  const res = await fetch(`${sb.url}/storage/v1/object/list/${MATERIALS_BUCKET}`, {
    method: 'POST',
    headers: sb.headers,
    body: JSON.stringify({ prefix: eventId, search: '', limit: 1000 }),
  });
  if (!res.ok) throw new Error(`Storage list ${MATERIALS_BUCKET} gagal — HTTP ${res.status}`);
  const names = ((await res.json()) || []).map((r) => r?.name).filter(Boolean);
  if (!names.length) return;
  const del = await fetch(`${sb.url}/storage/v1/object/${MATERIALS_BUCKET}`, {
    method: 'DELETE',
    headers: { ...sb.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: names.map((n) => `${eventId}/${n}`) }),
  });
  if (!del.ok) throw new Error(`Storage hapus ${MATERIALS_BUCKET} gagal — HTTP ${del.status}`);
}
