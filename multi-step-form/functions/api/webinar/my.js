import { webinarOpenFor } from './_access.js';
import { deliverWebinarTicket } from '../doku/_webinar.js';
import { SITE_URL, buildEventView, formatPrice, formatTimeWib, joinWindow } from './_view.js';
import { caller, CORS, json, resolveService, rest, sbFetch } from './_server.js';
import { linkedVideos, recordingFor } from './_recordingAccess.js';

// meeting_url hanya dibaca untuk `join.meeting_ready` (boolean); nilainya tidak pernah
// ikut ke browser, karena buildEventView memilih kolomnya sendiri. Pembeli masuk lewat link gabung.
// Sama halnya recording_object_key & materials_path (baris Video kelas sendiri, atau
// Video kelas yang dikaitkan ke webinar tiket): hanya menjadi boolean di `recording`.
// URL tonton hanya keluar dari /api/webinar/watch.
const EVENT_COLUMNS = 'id,slug,title,summary,poster_url,speakers,starts_at,duration_minutes,price,status,offer_kind,sales_mode,is_listed,is_test,recording_minutes,recording_published_at,meeting_url,recording_object_key,materials_path';

/**
 * Jendela gabung untuk halaman tiket. Hitungan dalam detik dari jam server, supaya jam
 * perangkat yang salah tidak menggeser hitung mundur. Null bila tidak ada ruang untuk dimasuki.
 */
export function buildJoinView(order, event, display, now = Date.now()) {
  if (order.kind !== 'live' || display !== 'paid' || event.status === 'cancelled') return null;
  const win = joinWindow(event, now);
  if (!win) return null;
  return {
    phase: win.phase,
    opens_in_seconds: Math.max(0, Math.ceil((win.opensAt - now) / 1000)),
    closes_in_seconds: Math.max(0, Math.ceil((win.closesAt - now) / 1000)),
    opens_label: `${formatTimeWib(new Date(win.opensAt).toISOString())} WIB`,
    meeting_ready: /^https:\/\//i.test(event.meeting_url || ''),
  };
}

/** Keadaan yang dilihat pembeli; pending yang link-nya mati terbaca kedaluwarsa. */
export function orderDisplayStatus(order, now = Date.now()) {
  if (order.status === 'pending') {
    return new Date(order.payment_expires_at).getTime() > now ? 'pending' : 'expired';
  }
  if (order.status === 'cancelled') return 'expired';
  return order.status;
}

/**
 * Keadaan rekaman di kartu tiket; tanpa URL dan tanpa kunci objek.
 * `video` = Video kelas yang dikaitkan ke webinar tiket ini (Iterasi 8); untuk order
 * Video kelas rekamannya baris acara itu sendiri.
 */
export function buildRecordingView(order, display, video = null, now = Date.now()) {
  const event = order.webinar_events || {};
  const source = display === 'paid' && event.status !== 'cancelled' ? recordingFor(order, video, now) : null;
  const available = Boolean(source);
  return {
    recording: {
      available,
      minutes: available ? source.recording_minutes ?? null : null,
      has_materials: available && Boolean(source.materials_path),
    },
    watch_path: available ? `/dashboard/webinar/tonton/${order.id}` : null,
  };
}

export function buildOrderView(order, now = Date.now(), video = null) {
  const display = orderDisplayStatus(order, now);
  const event = order.webinar_events || {};
  return {
    ...buildRecordingView(order, display, video, now),
    id: order.id,
    kind: order.kind,
    status: display,
    amount_label: formatPrice(order.amount),
    invoice_number: order.invoice_number,
    ticket_code: display === 'paid' ? order.ticket_code : null,
    buyer_email: order.buyer_email,
    paid_at: order.paid_at,
    created_at: order.created_at,
    payment_url: display === 'pending' ? order.payment_url : null,
    payment_expires_at: display === 'pending' ? order.payment_expires_at : null,
    join_url: display === 'paid' && order.kind === 'live' ? `${SITE_URL}/webinar/gabung/${order.join_token}` : null,
    join: buildJoinView(order, event, display, now),
    event: buildEventView({ ...event, webinar_offer_state: { state: event.status === 'cancelled' ? 'cancelled' : 'closed' } }),
    event_cancelled: event.status === 'cancelled',
    event_is_past: event.starts_at
      ? new Date(event.starts_at).getTime() + (event.duration_minutes || 0) * 60_000 < now
      : false,
  };
}

export async function onRequest({ request, env, waitUntil }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET') return json(405, { error: 'Method Not Allowed' });

  const user = await caller(env, request);
  if (!user) return json(401, { error: 'Unauthorized' });
  if (!webinarOpenFor(user.email, env, request)) return json(403, { error: 'Webinar belum dibuka', code: 'not_open' });

  try {
    const sb = resolveService(env);
    // Hanya auth_user_id: verifikasi email mati, jadi kecocokan email bukan bukti.
    const orders = await rest(
      sb,
      `webinar_orders?auth_user_id=eq.${user.id}&select=*,webinar_events(${EVENT_COLUMNS})&order=created_at.desc`,
      {},
      'SELECT webinar_orders (milik akun)'
    );
    const rows = orders || [];

    for (const order of rows) {
      // Email pembelian yang tertunda: e-tiket (live) atau "Rekamanmu siap" (Video kelas).
      if (order.status === 'paid' && !order.ticket_email_sent_at && order.webinar_events?.status !== 'cancelled') {
        const retry = deliverWebinarTicket({ env, sb, sbFetch, invoiceNumber: order.invoice_number });
        if (typeof waitUntil === 'function') waitUntil(retry); else await retry;
      }
    }

    // Video kelas terkait untuk semua tiket live lunas, dalam satu kueri.
    const liveIds = rows.filter((o) => o.kind === 'live' && o.status === 'paid').map((o) => o.webinar_events?.id);
    const videos = await linkedVideos(sb, liveIds, 'kartu tiket');
    const now = Date.now();
    return json(200, {
      email: user.email,
      orders: rows.map((o) => buildOrderView(o, now, o.kind === 'live' ? videos.get(o.webinar_events?.id) ?? null : null)),
    });
  } catch (err) {
    console.error('[webinar/my]', err);
    return json(500, { error: 'Tiket belum bisa dimuat' });
  }
}
