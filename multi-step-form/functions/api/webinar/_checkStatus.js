import { dokuRequest } from '../doku/_helpers.js';
import { deliverWebinarTicket, processWebinarPayment, recordWebinarAlarm } from '../doku/_webinar.js';
import { claimRow } from './_claim.js';
import { rest, sbFetch } from './_server.js';

// Dokumentasi DOKU: Check Status hanya sesudah 60 detik.
export const CHECK_MIN_INTERVAL_MS = 60_000;

/**
 * Bertanya ke DOKU apakah order sudah dibayar (Check Status API). Dipakai halaman
 * tiket pembeli (sync.js, hanya pending) dan tombol "Cek ke DOKU" admin (pending,
 * expired, atau cancelled: bayaran telat tetap diterima webinar_mark_paid).
 *
 * Sumber kebenaran pembayaran tetap DOKU: yang dipercaya hanya jawaban Check Status.
 * Klaim `last_status_check_at` membuat tab ganda / klik ganda hanya menghasilkan
 * satu panggilan ke DOKU per menit.
 *
 * @param order  { id, invoice_number, status, created_at }
 * @param statusFilter  syarat PostgREST status order yang boleh dicek
 * @returns {{ checked: boolean, status: string, reason?: string, dokuStatus?: string|null, outcome?: string }}
 */
export async function checkOrderAtDoku({ env, sb, order, statusFilter = 'status=eq.pending', now = Date.now(), waitUntil }) {
  if (new Date(order.created_at).getTime() > now - CHECK_MIN_INTERVAL_MS) {
    return { checked: false, status: order.status, reason: 'too_soon' };
  }

  // Lewat token + baca-balik, BUKAN balasan PATCH: balasan PATCH ber-`or=` selalu
  // kosong (insiden 5 Nov, lihat _claim.js).
  const claimed = await claimRow({
    sb,
    sbFetch,
    table: 'webinar_orders',
    match: `id=eq.${order.id}`,
    where: statusFilter,
    column: 'last_status_check_at',
    staleBefore: new Date(now - CHECK_MIN_INTERVAL_MS).toISOString(),
    select: 'id',
    now: new Date(now),
    label: 'webinar_orders (klaim cek status)',
  });
  if (!claimed) return { checked: false, status: order.status, reason: 'recently_checked' };

  const doku = await dokuRequest(env, 'GET', `/orders/v1/status/${encodeURIComponent(order.invoice_number)}`);
  const dokuStatus = doku?.data?.transaction?.status ?? null;
  if (!doku?.ok) return { checked: true, status: order.status, reason: 'doku_error', dokuStatus };
  if (dokuStatus !== 'SUCCESS') return { checked: true, status: order.status, reason: 'unpaid', dokuStatus };

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

  const stored = await rest(sb, `webinar_orders?id=eq.${order.id}&select=status`, {}, 'SELECT webinar_orders (sesudah cek status)');
  return { checked: true, status: stored?.[0]?.status ?? order.status, dokuStatus, outcome: result.outcome };
}
