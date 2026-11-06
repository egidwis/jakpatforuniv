// Fase 3 menu Webinar admin: peserta, kirim ulang e-tiket, cek ke DOKU, refund,
// dan email otomatis (rencana "Iterasi 6 Nov").
//
// Aturan yang sama dengan webinar.js: tulisan memfilter kunci saja (id), tidak
// pernah kolom yang diubahnya sendiri, dan meminta barisnya kembali; nol baris = galat.
// Email ke peserta tidak pernah dikirim dari sini secara langsung: ia diantrekan
// (sql/135) lalu dikirim _notify.js, supaya cron dan aksi admin tidak dobel.

import { SITE_URL } from '../webinar/_view.js';
import { sbFetch } from '../webinar/_server.js';
import { checkOrderAtDoku } from '../webinar/_checkStatus.js';
import { dispatchWebinarNotifications } from '../webinar/_notify.js';
import { accountEmailOf, deliverWebinarTicket } from '../doku/_webinar.js';
import { db, dbAll, decorate, loadOrRefuse, refuse } from './_webinarDb.js';
import { normalizeRefundNote, normalizeTicketEmail } from './webinarGate.js';

/** Aksi yang menulis ke produksi atau mengirim email: ditolak dari uji lokal. */
export const LOCAL_BLOCKED_ACTIONS = ['resend-ticket', 'check-order', 'refund', 'email-retry'];

// payment_url & doku_request_id sengaja tidak dibaca: tidak dibutuhkan admin.
const ORDER_COLUMNS = [
  'id', 'event_id', 'kind', 'status', 'auth_user_id', 'buyer_name', 'buyer_email', 'buyer_phone',
  'buyer_university', 'buyer_major', 'buyer_status', 'buyer_referral', 'marketing_consent', 'consent_at',
  'invoice_number', 'amount', 'discount_amount', 'voucher_code', 'paid_at', 'paid_via', 'payment_channel',
  'payment_expires_at', 'hold_until', 'created_at', 'ticket_code', 'join_token', 'alarm_outcome',
  'ticket_email_sent_at', 'ticket_email_error', 'ticket_email_claimed_at', 'refunded_at', 'refunded_by',
  'refund_note', 'last_status_check_at',
].join(',');

const DELIVERY_STATUSES = ['queued', 'sending', 'sent', 'failed', 'skipped'];

/** Token mentah tidak keluar; link gabung hanya untuk tiket yang aktif. */
function orderView(order) {
  const { join_token: joinToken, ...rest } = order;
  return { ...rest, join_url: order.status === 'paid' && joinToken ? `${SITE_URL}/webinar/gabung/${joinToken}` : null };
}

async function loadOrder(sb, orderId, columns = ORDER_COLUMNS) {
  const rows = await db(sb, `webinar_orders?id=eq.${orderId}&select=${columns}`, {}, 'SELECT webinar_orders');
  if (!rows?.[0]) throw refuse(404, 'Order tidak ditemukan');
  return rows[0];
}

async function rpc(sb, fn, args) {
  return db(sb, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }, `RPC ${fn}`);
}

/** Kirim batch pertama seketika; sisanya diambil cron tiap menit. Tidak pernah melempar. */
function kickDispatch(sb, env, waitUntil) {
  const run = dispatchWebinarNotifications({ env, sb })
    .catch((err) => console.error('[admin/webinar] kirim email otomatis:', err?.message || err));
  if (typeof waitUntil === 'function') { waitUntil(run); return Promise.resolve(); }
  return run;
}

/**
 * Antrekan email otomatis untuk acara ini. Dipanggil SESUDAH acara tersimpan:
 * kegagalan di sini dilaporkan (`notify_error`) tetapi tidak membatalkan aksinya.
 */
export async function notifyParticipants({ sb, env, waitUntil, adminEmail, eventId, kind }) {
  try {
    const result = await rpc(sb, 'webinar_enqueue_broadcast', { p_event_id: eventId, p_kind: kind, p_created_by: adminEmail });
    await kickDispatch(sb, env, waitUntil);
    return { notified: Number(result?.total) || 0 };
  } catch (err) {
    console.error(`[admin/webinar] email ${kind} gagal diantrekan:`, err?.message || err);
    return { notify_error: true };
  }
}

export async function participants(sb, body) {
  const event = await loadOrRefuse(sb, body.id);
  const [orders, broadcasts] = await Promise.all([
    dbAll(sb, `webinar_orders?event_id=eq.${body.id}&kind=eq.live&select=${ORDER_COLUMNS}&order=created_at.desc`, 'SELECT webinar_orders (peserta)'),
    db(sb, `webinar_broadcasts?event_id=eq.${body.id}&select=id,kind,event_starts_at,recipient_total,skipped_reason,created_by,created_at&order=created_at.desc`, {}, 'SELECT webinar_broadcasts'),
  ]);

  const list = broadcasts || [];
  const deliveries = list.length
    ? await dbAll(
      sb,
      `webinar_broadcast_deliveries?broadcast_id=in.(${list.map((b) => b.id).join(',')})&select=broadcast_id,order_id,status,attempts,sent_at,error,retry_after&order=broadcast_id,order_id`,
      'SELECT webinar_broadcast_deliveries'
    )
    : [];

  return {
    event: decorate(event, { full: false }),
    orders: orders.map(orderView),
    broadcasts: list.map((b) => {
      const counts = Object.fromEntries(DELIVERY_STATUSES.map((s) => [s, 0]));
      for (const d of deliveries) if (d.broadcast_id === b.id && d.status in counts) counts[d.status] += 1;
      return { ...b, counts };
    }),
    deliveries,
  };
}

export async function participant(sb, body) {
  const order = await loadOrder(sb, body.orderId);
  const accountEmail = await accountEmailOf({ sb, userId: order.auth_user_id });
  return { order: orderView(order), account_email: accountEmail };
}

export async function resendTicket(sb, env, body) {
  const order = await loadOrder(sb, body.orderId, 'id,event_id,kind,status,buyer_email,invoice_number');
  if (order.status !== 'paid' || order.kind !== 'live') {
    throw refuse(409, 'Hanya tiket live yang lunas yang bisa dikirimi e-tiket', { code: 'not_paid' });
  }
  const [event] = (await db(sb, `webinar_events?id=eq.${order.event_id}&select=status`, {}, 'SELECT webinar_events (status)')) || [];
  if (event?.status === 'cancelled') {
    throw refuse(409, 'Acara ini dibatalkan, jadi e-tiket tidak dikirim lagi', { code: 'event_cancelled' });
  }

  let email = order.buyer_email;
  const wanted = body.email ? normalizeTicketEmail(body.email) : null;
  if (wanted && wanted !== email) {
    const rows = await db(sb, `webinar_orders?id=eq.${order.id}&select=id,buyer_email`, {
      method: 'PATCH',
      body: JSON.stringify({ buyer_email: wanted }),
    }, 'PATCH webinar_orders (email e-tiket)');
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('PATCH webinar_orders (email e-tiket): bukan tepat satu baris');
    email = wanted;
  }

  const result = await deliverWebinarTicket({ env, sb, sbFetch, invoiceNumber: order.invoice_number, resend: true });
  if (result.sent) return { sent: true, email };
  if (result.reason === 'not_claimed') {
    throw refuse(409, 'E-tiket untuk peserta ini sedang dikirim. Coba lagi sebentar.', { code: 'busy' });
  }
  throw refuse(502, `E-tiket gagal terkirim: ${result.error || 'tanpa keterangan'}`, { code: 'mail_failed' });
}

export async function checkOrder(sb, env, body, waitUntil) {
  const order = await loadOrder(sb, body.orderId, 'id,invoice_number,status,created_at,kind');
  if (order.status === 'paid' || order.status === 'refunded') {
    throw refuse(409, 'Order ini sudah lunas', { code: 'already_paid' });
  }
  return checkOrderAtDoku({ env, sb, order, statusFilter: 'status=in.(pending,expired,cancelled)', waitUntil });
}

export async function refundOrder(sb, body, adminEmail) {
  const result = await rpc(sb, 'webinar_mark_refunded', {
    p_order_id: body.orderId,
    p_note: normalizeRefundNote(body.note),
    p_admin_email: adminEmail,
  });
  if (result?.outcome === 'not_found') throw refuse(404, 'Order tidak ditemukan');
  if (result?.outcome === 'not_paid') throw refuse(409, 'Hanya tiket lunas yang bisa ditandai refund', { code: 'not_paid' });
  if (result?.outcome !== 'ok' && result?.outcome !== 'already_refunded') {
    throw new Error(`RPC webinar_mark_refunded membalas bentuk tak dikenal: ${JSON.stringify(result).slice(0, 200)}`);
  }
  return result;
}

export async function retryEmail(sb, env, body, waitUntil) {
  const requeued = Number(await rpc(sb, 'webinar_retry_broadcast', { p_broadcast_id: body.broadcastId })) || 0;
  if (requeued > 0) await kickDispatch(sb, env, waitUntil);
  return { requeued };
}

// ── Fase 4: pembeli webinar untuk halaman Customers ───────────────────────

const BUYER_ORDER_COLUMNS = 'id,auth_user_id,event_id,kind,status,amount,paid_at,invoice_number';

/**
 * Tiket lunas/refund per akun, untuk chip "Webinar" dan tier "Pembeli webinar".
 * Sengaja TANPA data pribadi pembeli (nama, email, WA), token, atau link bayar:
 * profil akunnya sudah tampil di Customers dari `get_customer_profiles`.
 * Baca saja, jadi boleh dari uji lokal.
 */
export async function buyers(sb) {
  const [orders, events] = await Promise.all([
    dbAll(
      sb,
      `webinar_orders?status=in.(paid,refunded)&auth_user_id=not.is.null&select=${BUYER_ORDER_COLUMNS}&order=paid_at.desc.nullslast,id.asc`,
      'SELECT webinar_orders (pembeli)'
    ),
    dbAll(sb, 'webinar_events?select=id,title,starts_at,is_test&order=id.asc', 'SELECT webinar_events (pembeli)'),
  ]);
  const eventById = new Map(events.map((e) => [e.id, e]));
  return {
    tickets: orders.map((o) => {
      const event = eventById.get(o.event_id);
      return {
        order_id: o.id,
        auth_user_id: o.auth_user_id,
        kind: o.kind,
        status: o.status,
        amount: o.amount,
        paid_at: o.paid_at,
        invoice_number: o.invoice_number,
        event_title: event?.title ?? 'Acara',
        event_starts_at: event?.starts_at ?? null,
        is_test: Boolean(event?.is_test),
      };
    }),
  };
}
