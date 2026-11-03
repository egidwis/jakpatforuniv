import { deliverWebinarTicket } from '../doku/_webinar.js';
import { SITE_URL, buildEventView, formatPrice } from './_view.js';
import { caller, CORS, json, resolveService, rest, sbFetch } from './_server.js';

// meeting_url sengaja tidak diambil; pembeli masuk lewat link gabung.
const EVENT_COLUMNS = 'id,slug,title,summary,poster_url,speakers,starts_at,duration_minutes,price,status,offer_kind,sales_mode,is_listed,is_test,recording_minutes,recording_published_at';

/** Keadaan yang dilihat pembeli; pending yang link-nya mati terbaca kedaluwarsa. */
export function orderDisplayStatus(order, now = Date.now()) {
  if (order.status === 'pending') {
    return new Date(order.payment_expires_at).getTime() > now ? 'pending' : 'expired';
  }
  if (order.status === 'cancelled') return 'expired';
  return order.status;
}

export function buildOrderView(order, now = Date.now()) {
  const display = orderDisplayStatus(order, now);
  const event = order.webinar_events || {};
  return {
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
    join_url: display === 'paid' ? `${SITE_URL}/webinar/gabung/${order.join_token}` : null,
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
      if (order.status === 'paid' && order.kind === 'live' && !order.ticket_email_sent_at && order.webinar_events?.status !== 'cancelled') {
        const retry = deliverWebinarTicket({ env, sb, sbFetch, invoiceNumber: order.invoice_number });
        if (typeof waitUntil === 'function') waitUntil(retry); else await retry;
      }
    }

    return json(200, { email: user.email, orders: rows.map((o) => buildOrderView(o)) });
  } catch (err) {
    console.error('[webinar/my]', err);
    return json(500, { error: 'Tiket belum bisa dimuat' });
  }
}
