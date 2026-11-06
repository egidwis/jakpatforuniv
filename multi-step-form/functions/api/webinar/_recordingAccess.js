// Fase 5A: siapa boleh menonton rekaman & mengunduh materi. Satu aturan untuk
// /api/webinar/watch, /api/webinar/material, dan keadaan kartu di my.js.
//
// Pemilik = auth_user_id saja (verifikasi email mati, jadi email bukan bukti).
// Order refund → "Tiket tidak aktif" (tanpa kata refund untuk pembeli).
// URL & kunci R2 tidak pernah keluar dari sini kecuali lewat watch.js.

import { webinarOpenFor } from './_access.js';
import { caller, json, resolveService, rest, UUID_RE } from './_server.js';

export const WATCH_SECONDS = 3 * 3600;
export const MATERIAL_SECONDS = 600;

const EVENT_COLUMNS = 'id,slug,title,summary,poster_url,speakers,starts_at,duration_minutes,price,status,offer_kind,sales_mode,is_listed,is_test,recording_minutes,recording_published_at,recording_object_key,materials_path';

/** Rekaman sudah terbit dan punya objek. */
export const recordingReady = (event) => Boolean(event?.recording_published_at && event?.recording_object_key);

/**
 * @returns {{ ok: true } | { ok: false, status: number, code: string, error: string }}
 */
export function recordingAccess(order) {
  if (!order) return { ok: false, status: 404, code: 'not_owner', error: 'Rekaman ini untuk pemilik tiket' };
  if (order.status === 'refunded') {
    return { ok: false, status: 403, code: 'inactive', error: 'Tiket tidak aktif. Hubungi admin bila ada pertanyaan.' };
  }
  if (order.status !== 'paid') return { ok: false, status: 404, code: 'not_owner', error: 'Rekaman ini untuk pemilik tiket' };
  const event = order.webinar_events || {};
  if (event.status === 'cancelled') return { ok: false, status: 409, code: 'cancelled', error: 'Acara ini dibatalkan, jadi tidak ada rekaman.' };
  if (!recordingReady(event)) return { ok: false, status: 409, code: 'not_ready', error: 'Rekaman segera tersedia' };
  return { ok: true };
}

/** "tegar@jakpat.net · 7F3A": email dari SESI (bukan body) + 4 karakter kode tiket. */
export function watermarkText(email, ticketCode) {
  const code = String(ticketCode || '').slice(0, 4).toUpperCase();
  return code ? `${email} · ${code}` : String(email);
}

/**
 * Gerbang bersama watch/material: sesi, masa uji, body, lalu order milik akun.
 * @returns {Promise<{ response: Response } | { user, sb, order }>}
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
  const access = recordingAccess(order);
  if (!access.ok) return { response: json(access.status, { error: access.error, code: access.code, slug: order?.webinar_events?.slug ?? null }) };
  return { user, sb, order };
}
