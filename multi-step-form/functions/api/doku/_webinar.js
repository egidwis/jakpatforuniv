import { sendWebhookAlert } from './_webhook-alert.js';
import { sendWebinarTicketEmail } from './_webinar-ticket-email.js';

// Jalur uang webinar: dipanggil webhook.js, dan nanti Check Status (Fase 2).
//
// Diawali `_` supaya Cloudflare Pages tidak merutekannya sebagai endpoint.
// `sb` dan `sbFetch` diteruskan sebagai parameter supaya jalur iklan di webhook.js
// tidak perlu di-refactor.

export const isWebinarInvoice = (invoiceNumber) => String(invoiceNumber ?? '').startsWith('WBN-');

/** Uang sudah diterima tetapi perlu manusia. Lihat webinar_mark_paid (sql/131). */
export const WEBINAR_ALERT_OUTCOMES = new Set([
  'webinar_over_quota',
  'webinar_duplicate_paid',
  'webinar_not_found',
  'webinar_paid_on_cancelled',
]);

// Sesudah ini klaim dianggap mati: pengirimnya berhenti sebelum sempat mencatat.
const EMAIL_CLAIM_TTL_MS = 10 * 60_000;

const toNumericAmount = (amount) => {
  if (amount === null || amount === undefined || amount === '') return null;
  const value = Number(amount);
  return Number.isFinite(value) ? value : null;
};

/**
 * Melempar bila database gagal, supaya webhook membalas 500 dan DOKU mengulang.
 *
 * @returns {Promise<{outcome: string, errorMessage: string|null, sendTicket: boolean}>}
 */
export async function processWebinarPayment({ sb, sbFetch, invoiceNumber, amount, appStatus, paymentChannel, via = 'webhook' }) {
  if (appStatus === 'failed') {
    // Hanya yang masih pending. Baris lunas tidak boleh mundur, dan nol baris di
    // sini memang sah.
    await sbFetch(
      `${sb.url}/rest/v1/webinar_orders?invoice_number=eq.${encodeURIComponent(invoiceNumber)}&status=eq.pending`,
      {
        method: 'PATCH',
        headers: { ...sb.headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'expired' }),
      },
      'PATCH webinar_orders (expired)'
    );
    return { outcome: 'ok', errorMessage: null, sendTicket: false };
  }

  if (appStatus !== 'completed') {
    return { outcome: 'ok', errorMessage: null, sendTicket: false };
  }

  const res = await sbFetch(
    `${sb.url}/rest/v1/rpc/webinar_mark_paid`,
    {
      method: 'POST',
      headers: sb.headers,
      body: JSON.stringify({
        p_invoice: invoiceNumber,
        p_amount: toNumericAmount(amount),
        p_channel: paymentChannel ?? null,
        p_via: via,
      }),
    },
    'RPC webinar_mark_paid'
  );
  const result = await res.json();
  if (!result || typeof result.outcome !== 'string') {
    throw new Error(`RPC webinar_mark_paid membalas bentuk tak dikenal: ${JSON.stringify(result).slice(0, 200)}`);
  }

  return {
    outcome: result.outcome,
    errorMessage: result.message
      ?? (result.outcome === 'webinar_not_found' ? 'Invoice WBN- ini tidak ada di webinar_orders.' : null),
    sendTicket: result.send_ticket === true,
  };
}

/**
 * Jalur Check Status tidak lewat recordWebhookEvent di webhook.js, jadi alarmnya
 * ditulis di sini supaya tetap muncul di banner admin. Tidak pernah melempar:
 * pembayarannya sudah tercatat.
 */
export async function recordWebinarAlarm({ env, sb, sbFetch, invoiceNumber, outcome, errorMessage, amount, rawPayload }) {
  try {
    await sbFetch(
      `${sb.url}/rest/v1/doku_webhook_events`,
      {
        method: 'POST',
        headers: { ...sb.headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          invoice_number: invoiceNumber,
          doku_status: 'SUCCESS',
          app_status: 'completed',
          amount: toNumericAmount(amount),
          outcome,
          http_status: 200,
          error_message: errorMessage ?? 'Ditemukan lewat Check Status.',
          raw_payload: rawPayload ?? null,
        }),
      },
      'INSERT doku_webhook_events (sync)'
    );
  } catch (err) {
    console.error(`[webinar] Gagal mencatat alarm ${invoiceNumber}:`, err);
  }
  await sendWebhookAlert(env, { invoiceNumber, outcome, errorMessage, amount, dokuStatus: 'SUCCESS' });
}

/**
 * Mengirim e-tiket tepat satu kali walau webhook dan Check Status berjalan
 * bersamaan. Tidak pernah melempar: tiketnya sudah terbit, dan DOKU tidak akan
 * mengulang sesudah menerima 200.
 */
/**
 * Email akun pemilik tiket, untuk kalimat "Masuk dengan akun ..." di e-tiket.
 * Bisa berbeda dari buyer_email (kontak khusus). Gagal membaca tidak menahan tiket.
 */
async function accountEmailOf({ sb, userId }) {
  if (!userId) return null;
  try {
    const res = await fetch(`${sb.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: sb.headers });
    if (!res.ok) return null;
    const user = await res.json();
    return typeof user?.email === 'string' && user.email ? user.email.toLowerCase() : null;
  } catch (err) {
    console.error('[webinar] email akun tidak terbaca:', err?.message || err);
    return null;
  }
}

export async function deliverWebinarTicket({ env, sb, sbFetch, invoiceNumber, now = () => new Date() }) {
  const encodedInvoice = encodeURIComponent(invoiceNumber);
  let claimed = false;
  try {
    const staleBefore = new Date(now().getTime() - EMAIL_CLAIM_TTL_MS).toISOString();
    const claimRes = await sbFetch(
      `${sb.url}/rest/v1/webinar_orders?invoice_number=eq.${encodedInvoice}` +
        `&status=eq.paid&kind=eq.live&ticket_email_sent_at=is.null` +
        `&or=(ticket_email_claimed_at.is.null,ticket_email_claimed_at.lt.${encodeURIComponent(staleBefore)})`,
      {
        method: 'PATCH',
        headers: { ...sb.headers, Prefer: 'return=representation' },
        body: JSON.stringify({ ticket_email_claimed_at: now().toISOString() }),
      },
      'PATCH webinar_orders (klaim e-tiket)'
    );
    const rows = await claimRes.json();
    const order = Array.isArray(rows) ? rows[0] : null;
    if (!order) return { sent: false, reason: 'not_claimed' };
    claimed = true;

    // meeting_url sengaja tidak diambil, jadi tidak mungkin masuk email.
    const eventRes = await sbFetch(
      `${sb.url}/rest/v1/webinar_events?id=eq.${encodeURIComponent(order.event_id)}` +
        `&select=title,starts_at,duration_minutes,speakers`,
      { headers: sb.headers },
      'SELECT webinar_events (e-tiket)'
    );
    const [event] = await eventRes.json();
    if (!event) throw new Error(`Acara ${order.event_id} tidak ditemukan`);

    const accountEmail = await accountEmailOf({ sb, userId: order.auth_user_id });
    const mail = await sendWebinarTicketEmail(env, { order, event, accountEmail });
    if (!mail?.ok) {
      throw new Error(`Provider ${mail?.provider ?? '?'} menolak: ${mail?.error ?? 'tanpa keterangan'}`);
    }

    // Email sudah terkirim. Kalau baris ini gagal, klaim kedaluwarsa dan pembeli
    // bisa menerima dua email; itu lebih baik daripada tidak menerima tiket.
    await sbFetch(
      `${sb.url}/rest/v1/webinar_orders?invoice_number=eq.${encodedInvoice}`,
      {
        method: 'PATCH',
        headers: { ...sb.headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ ticket_email_sent_at: now().toISOString(), ticket_email_error: null }),
      },
      'PATCH webinar_orders (e-tiket terkirim)'
    );
    return { sent: true };
  } catch (err) {
    const message = err?.message || String(err);
    console.error(`[webinar] E-tiket ${invoiceNumber} gagal:`, message);

    if (claimed) {
      // Lepas klaim supaya halaman tiket bisa mencoba lagi tanpa menunggu 10 menit.
      await sbFetch(
        `${sb.url}/rest/v1/webinar_orders?invoice_number=eq.${encodedInvoice}`,
        {
          method: 'PATCH',
          headers: { ...sb.headers, Prefer: 'return=minimal' },
          body: JSON.stringify({ ticket_email_claimed_at: null, ticket_email_error: message.slice(0, 500) }),
        },
        'PATCH webinar_orders (e-tiket gagal)'
      ).catch((patchErr) => console.error(`[webinar] Gagal melepas klaim ${invoiceNumber}:`, patchErr));
    }

    await sendWebhookAlert(env, {
      invoiceNumber,
      outcome: 'webinar_ticket_email_failed',
      errorMessage: message,
    });
    return { sent: false, reason: 'failed' };
  }
}
