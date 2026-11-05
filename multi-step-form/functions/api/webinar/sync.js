import { webinarOpenFor } from './_access.js';
import { dokuRequest } from '../doku/_helpers.js';
import { deliverWebinarTicket, processWebinarPayment, recordWebinarAlarm } from '../doku/_webinar.js';
import { caller, CORS, json, resolveService, rest, sbFetch, UUID_RE } from './_server.js';
import { claimRow } from './_claim.js';

// Dokumentasi DOKU: Check Status hanya sesudah 60 detik.
const MIN_INTERVAL_MS = 60_000;

/**
 * Jaring pengaman bila DOKU tidak menelepon webhook. Sumber kebenaran pembayaran
 * tetap DOKU, bukan browser: yang dipercaya hanya jawaban Check Status.
 */
export async function onRequest({ request, env, waitUntil }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const user = await caller(env, request);
  if (!user) return json(401, { error: 'Unauthorized' });
  if (!webinarOpenFor(user.email)) return json(403, { error: 'Webinar belum dibuka', code: 'not_open' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Body bukan JSON' }); }
  if (typeof body?.orderId !== 'string' || !UUID_RE.test(body.orderId)) return json(400, { error: 'Order tidak dikenali' });

  try {
    const sb = resolveService(env);
    const [order] = await rest(
      sb,
      `webinar_orders?id=eq.${body.orderId}&auth_user_id=eq.${user.id}&select=id,invoice_number,status,created_at,last_status_check_at`,
      {},
      'SELECT webinar_orders (sync)'
    );
    if (!order) return json(404, { error: 'Order tidak ditemukan' });
    if (order.status !== 'pending') return json(200, { status: order.status, checked: false });

    const now = Date.now();
    const notBefore = new Date(now - MIN_INTERVAL_MS).toISOString();
    if (new Date(order.created_at).getTime() > now - MIN_INTERVAL_MS) {
      return json(200, { status: 'pending', checked: false });
    }

    // Klaim bersyarat: tab ganda hanya menghasilkan satu panggilan ke DOKU. Lewat token +
    // baca-balik, BUKAN balasan PATCH: balasan PATCH ber-`or=` selalu kosong (insiden 5 Nov).
    const claimed = await claimRow({
      sb,
      sbFetch,
      table: 'webinar_orders',
      match: `id=eq.${order.id}`,
      where: 'status=eq.pending',
      column: 'last_status_check_at',
      staleBefore: notBefore,
      select: 'id',
      now: new Date(now),
      label: 'webinar_orders (klaim sync)',
    });
    if (!claimed) return json(200, { status: 'pending', checked: false });

    const doku = await dokuRequest(env, 'GET', `/orders/v1/status/${encodeURIComponent(order.invoice_number)}`);
    const dokuStatus = doku?.data?.transaction?.status;
    if (!doku?.ok || dokuStatus !== 'SUCCESS') {
      return json(200, { status: 'pending', checked: true });
    }

    const result = await processWebinarPayment({
      sb,
      sbFetch,
      invoiceNumber: order.invoice_number,
      amount: doku.data?.order?.amount,
      appStatus: 'completed',
      paymentChannel: doku.data?.channel?.id ?? doku.data?.service?.id ?? null,
      via: 'status_check',
    });

    if (result.outcome !== 'ok') {
      await recordWebinarAlarm({
        env, sb, sbFetch,
        invoiceNumber: order.invoice_number,
        outcome: result.outcome,
        errorMessage: result.errorMessage,
        amount: doku.data?.order?.amount,
        rawPayload: doku.data,
      });
    }
    if (result.sendTicket) {
      const ticket = deliverWebinarTicket({ env, sb, sbFetch, invoiceNumber: order.invoice_number });
      if (typeof waitUntil === 'function') waitUntil(ticket); else await ticket;
    }

    const stored = await rest(sb, `webinar_orders?id=eq.${order.id}&select=status`, {}, 'SELECT webinar_orders (sesudah sync)');
    return json(200, { status: stored?.[0]?.status ?? 'pending', checked: true });
  } catch (err) {
    console.error('[webinar/sync]', err);
    return json(500, { error: 'Status belum bisa diperiksa' });
  }
}
