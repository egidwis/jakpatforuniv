// Fase 5A: siapa boleh menonton rekaman & mengunduh materi. Satu aturan untuk
// /api/webinar/watch, /api/webinar/material, keadaan kartu di my.js, dan email
// "Rekaman tersedia" (_notify.js).
//
// Iterasi 8 (sql/138): rekaman & materi hanya ada di baris Video kelas.
//   * Order Video kelas → rekaman baris acaranya sendiri.
//   * Tiket webinar → rekaman Video kelas yang dikaitkan (source_event_id), terbuka
//     bila webinar terbit dan sudah mulai, dan rekaman V terbit. Status halaman V
//     tidak berpengaruh: V draft = rekaman khusus peserta.
//
// Pemilik = auth_user_id saja (verifikasi email mati, jadi email bukan bukti).
// Order refund → "Tiket tidak aktif" (tanpa kata refund untuk pembeli).
// URL & kunci R2 tidak pernah keluar dari sini kecuali lewat watch.js.

import { webinarOpenFor } from './_access.js';
import { caller, json, resolveService, rest, UUID_RE } from './_server.js';

export const WATCH_SECONDS = 3 * 3600;
export const MATERIAL_SECONDS = 600;

const EVENT_COLUMNS = 'id,slug,title,summary,poster_url,speakers,starts_at,duration_minutes,price,status,offer_kind,sales_mode,is_listed,is_test,recording_minutes,recording_published_at,recording_object_key,materials_path';
export const VIDEO_COLUMNS = 'id,status,source_event_id,source_linked_at,recording_minutes,recording_published_at,recording_object_key,materials_path';

/** Rekaman sudah terbit dan punya objek. */
export const recordingReady = (event) => Boolean(event?.recording_published_at && event?.recording_object_key);

const ms = (iso) => (iso ? Date.parse(iso) : NaN);

/**
 * Video kelas yang bisa ditonton pemegang tiket webinar `event`, atau null.
 * Cermin cabang 'recording_ready' di webinar_notify_tick (sql/138).
 */
export function holderVideo(event, video, now = Date.now()) {
  if (!event || !video) return null;
  if (event.status !== 'published' || event.offer_kind !== 'live') return null;
  if (!(ms(event.starts_at) <= now)) return null;
  if (video.status === 'cancelled' || video.source_event_id !== event.id) return null;
  return recordingReady(video) ? video : null;
}

/** Sejak kapan pemegang tiket bisa menonton: terbit rekaman, kaitan, atau mulai webinar, yang paling akhir. */
export function availableSince(event, video) {
  if (!video) return null;
  const t = [video.recording_published_at, video.source_linked_at, event?.starts_at].map(ms).filter(Number.isFinite);
  return t.length ? new Date(Math.max(...t)).toISOString() : null;
}

/** Baris pemilik rekaman untuk order ini (Video kelas itu sendiri, atau yang dikaitkan), atau null. */
export function recordingFor(order, video, now = Date.now()) {
  const event = order?.webinar_events || {};
  if (order?.kind === 'replay') return recordingReady(event) ? event : null;
  return holderVideo(event, video, now);
}

/**
 * @returns {{ ok: true } | { ok: false, status: number, code: string, error: string }}
 */
export function recordingAccess(order, video = null, now = Date.now()) {
  if (!order) return { ok: false, status: 404, code: 'not_owner', error: 'Rekaman ini untuk pemilik tiket' };
  if (order.status === 'refunded') {
    const error = order.kind === 'replay'
      ? 'Akses video ini tidak aktif. Hubungi admin bila ada pertanyaan.'
      : 'Tiket tidak aktif. Hubungi admin bila ada pertanyaan.';
    return { ok: false, status: 403, code: 'inactive', error };
  }
  if (order.status !== 'paid') return { ok: false, status: 404, code: 'not_owner', error: 'Rekaman ini untuk pemilik tiket' };
  const event = order.webinar_events || {};
  if (event.status === 'cancelled') return { ok: false, status: 409, code: 'cancelled', error: 'Acara ini dibatalkan, jadi tidak ada rekaman.' };
  if (!recordingFor(order, video, now)) return { ok: false, status: 409, code: 'not_ready', error: 'Rekaman segera tersedia' };
  return { ok: true };
}

/**
 * Video kelas yang dikaitkan ke webinar-webinar ini, dalam SATU kueri.
 * @returns {Promise<Map<string, object>>} id webinar → baris Video kelas
 */
export async function linkedVideos(sb, eventIds, label) {
  const ids = [...new Set(eventIds.filter((id) => typeof id === 'string' && UUID_RE.test(id)))];
  if (!ids.length) return new Map();
  const rows = await rest(sb, `webinar_events?source_event_id=in.(${ids.join(',')})&select=${VIDEO_COLUMNS}`, {}, `SELECT Video kelas terkait (${label})`);
  return new Map((rows || []).map((v) => [v.source_event_id, v]));
}

/** "tegar@jakpat.net · 7F3A": email dari SESI (bukan body) + 4 karakter kode tiket. */
export function watermarkText(email, ticketCode) {
  const code = String(ticketCode || '').slice(0, 4).toUpperCase();
  return code ? `${email} · ${code}` : String(email);
}

/**
 * Gerbang bersama watch/material: sesi, masa uji, body, lalu order milik akun.
 * `recording` = baris yang menyimpan kunci video & materi (Video kelas).
 * @returns {Promise<{ response: Response } | { user, sb, order, recording }>}
 */
export async function ownedOrderRequest(env, request, label) {
  const user = await caller(env, request);
  if (!user) return { response: json(401, { error: 'Unauthorized' }) };
  if (!webinarOpenFor(user.email, env, request)) return { response: json(403, { error: 'Webinar belum dibuka', code: 'not_open' }) };

  let body;
  try { body = await request.json(); } catch { return { response: json(400, { error: 'Body bukan JSON' }) }; }
  if (typeof body?.orderId !== 'string' || !UUID_RE.test(body.orderId)) return { response: json(400, { error: 'Order tidak dikenali' }) };

  const sb = resolveService(env);
  const rows = await rest(
    sb,
    `webinar_orders?id=eq.${body.orderId}&auth_user_id=eq.${user.id}&select=id,kind,status,ticket_code,webinar_events(${EVENT_COLUMNS})`,
    {},
    `SELECT webinar_orders (${label})`
  );
  const order = rows?.[0] ?? null;
  // Tiket webinar lunas: rekamannya milik Video kelas yang dikaitkan.
  const needsVideo = order?.kind === 'live' && order?.status === 'paid' && order.webinar_events?.id;
  const video = needsVideo ? (await linkedVideos(sb, [order.webinar_events.id], label)).get(order.webinar_events.id) ?? null : null;
  const access = recordingAccess(order, video);
  if (!access.ok) {
    // `kind` supaya halaman tonton memilih kalimat tiket atau Video kelas (Fase 5B).
    return { response: json(access.status, { error: access.error, code: access.code, slug: order?.webinar_events?.slug ?? null, kind: order?.kind ?? null }) };
  }
  return { user, sb, order, recording: recordingFor(order, video) };
}
