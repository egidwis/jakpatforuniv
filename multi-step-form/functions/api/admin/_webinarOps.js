// Fase 3 menu Webinar admin: peserta, kirim ulang e-tiket, cek ke DOKU, refund,
// dan email otomatis (rencana "Iterasi 6 Nov").
//
// Aturan yang sama dengan webinar.js: tulisan memfilter kunci saja (id), tidak
// pernah kolom yang diubahnya sendiri, dan meminta barisnya kembali; nol baris = galat.
// Email otomatis ke peserta tidak dikirim dari sini: cron Postgres memanggil
// /api/notify-webinar per peserta (sql/136b). Statusnya dibaca dari kolom penanda
// di webinar_orders (pola email iklan, Iterasi 4).

import { SITE_URL } from '../webinar/_view.js';
import { sbFetch } from '../webinar/_server.js';
import { checkOrderAtDoku } from '../webinar/_checkStatus.js';
import { accountEmailOf, deliverWebinarTicket } from '../doku/_webinar.js';
import { db, dbAll, decorate, loadOrRefuse, refuse } from './_webinarDb.js';
import { normalizeRefundNote, normalizeTicketEmail } from './webinarGate.js';

/** Aksi yang menulis ke produksi atau mengirim email: ditolak dari uji lokal. */
export const LOCAL_BLOCKED_ACTIONS = ['resend-ticket', 'check-order', 'refund'];

// payment_url & doku_request_id sengaja tidak dibaca: tidak dibutuhkan admin.
const ORDER_COLUMNS = [
  'id', 'event_id', 'kind', 'status', 'auth_user_id', 'buyer_name', 'buyer_email', 'buyer_phone',
  'buyer_university', 'buyer_major', 'buyer_status', 'buyer_referral', 'marketing_consent', 'consent_at',
  'invoice_number', 'amount', 'discount_amount', 'voucher_code', 'paid_at', 'paid_via', 'payment_channel',
  'payment_expires_at', 'hold_until', 'created_at', 'ticket_code', 'join_token', 'alarm_outcome',
  'ticket_email_sent_at', 'ticket_email_error', 'ticket_email_claimed_at', 'refunded_at', 'refunded_by',
  'refund_note', 'last_status_check_at',
  // Email otomatis (sql/136): penanda per jenis + galat terakhir.
  'reminder_sent_for', 'schedule_email_sent_at', 'cancel_email_sent_at', 'recording_email_sent_at', 'email_error',
].join(',');

/** Token mentah tidak keluar; link gabung hanya untuk tiket live yang aktif. */
function orderView(order) {
  const { join_token: joinToken, ...rest } = order;
  const joinable = order.status === 'paid' && order.kind === 'live' && joinToken;
  return { ...rest, join_url: joinable ? `${SITE_URL}/webinar/gabung/${joinToken}` : null };
}

async function loadOrder(sb, orderId, columns = ORDER_COLUMNS) {
  const rows = await db(sb, `webinar_orders?id=eq.${orderId}&select=${columns}`, {}, 'SELECT webinar_orders');
  if (!rows?.[0]) throw refuse(404, 'Order tidak ditemukan');
  return rows[0];
}

async function rpc(sb, fn, args) {
  return db(sb, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }, `RPC ${fn}`);
}

/**
 * Penjaga 5 (Iterasi 7): akun yang memegang tiket live lunas di webinar asal Video
 * kelas ini. Satu-satunya jalan beli dua kali adalah penghubung diisi sesudah Video
 * kelasnya telanjur laku, jadi pembelinya ditandai untuk dipertimbangkan refund.
 */
async function sourceTicketHolders(sb, sourceId) {
  const rows = await dbAll(sb, `webinar_orders?event_id=eq.${sourceId}&status=eq.paid&kind=eq.live&auth_user_id=not.is.null&select=auth_user_id&order=id.asc`, 'SELECT webinar_orders (tiket webinar asal)');
  return new Set(rows.map((r) => r.auth_user_id));
}

export async function participants(sb, body) {
  const event = await loadOrRefuse(sb, body.id);
  const orders = await dbAll(sb, `webinar_orders?event_id=eq.${body.id}&select=${ORDER_COLUMNS}&order=created_at.desc,id.asc`, 'SELECT webinar_orders (peserta)');
  let source = null;
  let holders = new Set();
  if (event.offer_kind === 'replay' && event.source_event_id) {
    const [row] = (await db(sb, `webinar_events?id=eq.${event.source_event_id}&select=id,title,slug`, {}, 'SELECT webinar_events (webinar asal)')) || [];
    source = row ?? null;
    holders = await sourceTicketHolders(sb, event.source_event_id);
  }
  return {
    event: decorate(event, { full: false }),
    source,
    orders: orders.map((o) => ({ ...orderView(o), holds_source_ticket: Boolean(o.auth_user_id && holders.has(o.auth_user_id)) })),
  };
}

export async function participant(sb, body) {
  const order = await loadOrder(sb, body.orderId);
  const accountEmail = await accountEmailOf({ sb, userId: order.auth_user_id });
  return { order: orderView(order), account_email: accountEmail };
}

export async function resendTicket(sb, env, body) {
  const order = await loadOrder(sb, body.orderId, 'id,event_id,kind,status,buyer_email,invoice_number');
  const what = order.kind === 'replay' ? 'Bukti pembelian' : 'E-tiket';
  if (order.status !== 'paid') {
    throw refuse(409, 'Hanya order lunas yang bisa dikirimi ulang email pembelian', { code: 'not_paid' });
  }
  const [event] = (await db(sb, `webinar_events?id=eq.${order.event_id}&select=status`, {}, 'SELECT webinar_events (status)')) || [];
  if (event?.status === 'cancelled') {
    throw refuse(409, `Acara ini dibatalkan, jadi ${what.toLowerCase()} tidak dikirim lagi`, { code: 'event_cancelled' });
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
    throw refuse(409, `${what} untuk peserta ini sedang dikirim. Coba lagi sebentar.`, { code: 'busy' });
  }
  throw refuse(502, `${what} gagal terkirim: ${result.error || 'tanpa keterangan'}`, { code: 'mail_failed' });
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
