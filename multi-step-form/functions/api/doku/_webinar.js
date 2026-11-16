import { sendWebhookAlert } from './_webhook-alert.js';
import { sendWebinarTicketEmail } from './_webinar-ticket-email.js';
import { claimRow } from '../webinar/_claim.js';

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

/**
 * Kolom order yang dipakai email pembelian (e-tiket / "Rekamanmu siap") dan
 * kwitansinya. meeting_url tidak ada di tabel ini. `id` untuk link tonton Video kelas.
 */
export const TICKET_ORDER_COLUMNS = [
  'id', 'kind', 'event_id', 'auth_user_id', 'invoice_number', 'amount', 'subtotal', 'ppn_amount', 'paid_at',
  'payment_channel', 'buyer_name', 'buyer_email', 'buyer_university', 'ticket_code', 'join_token',
].join(',');

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
 * Email akun pemilik tiket, untuk kalimat "Masuk dengan akun ..." di e-tiket.
 * Bisa berbeda dari buyer_email (kontak khusus). Gagal membaca tidak menahan tiket.
 */
export async function accountEmailOf({ sb, userId }) {
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

/**
 * Mengirim email pembelian tepat satu kali walau webhook, Check Status, dan halaman
 * pembeli berjalan bersamaan: e-tiket untuk tiket live, "Rekamanmu siap" untuk Video
 * kelas (Fase 5B; kolom ticket_email_* dipakai kedua jenis). Tidak pernah melempar: tiketnya sudah terbit, dan DOKU tidak
 * akan mengulang sesudah menerima 200.
 *
 * `resend: true` = "Kirim ulang e-tiket" dari admin: tidak mensyaratkan e-tiket
 * belum terkirim. Klaim tetap berlaku, jadi klik ganda hanya menghasilkan satu email.
 * Sesudah terkirim klaim selalu dilepas: klaim berarti "sedang mengirim", bukan
 * "sudah pernah dikirim" (itu tugas ticket_email_sent_at).
 */
export async function deliverWebinarTicket({ env, sb, sbFetch, invoiceNumber, now = () => new Date(), resend = false }) {
  const encodedInvoice = encodeURIComponent(invoiceNumber);
  let token = null;
  try {
    const startedAt = now();
    // Klaim lewat token + baca-balik, BUKAN balasan PATCH (insiden 5 Nov, lihat _claim.js).
    const claim = await claimRow({
      sb,
      sbFetch,
      table: 'webinar_orders',
      match: `invoice_number=eq.${encodedInvoice}`,
      // Kedua jenis order (Fase 5B): templat dipilih dari order.kind.
      where: resend ? 'status=eq.paid' : 'status=eq.paid&ticket_email_sent_at=is.null',
      column: 'ticket_email_claimed_at',
      staleBefore: new Date(startedAt.getTime() - EMAIL_CLAIM_TTL_MS).toISOString(),
      select: TICKET_ORDER_COLUMNS,
      now: startedAt,
      label: 'webinar_orders (klaim e-tiket)',
    });
    if (!claim) return { sent: false, reason: 'not_claimed' };
    token = claim.token;
    const order = claim.row;

    // meeting_url sengaja tidak diambil, jadi tidak mungkin masuk email.
    const eventRes = await sbFetch(
      `${sb.url}/rest/v1/webinar_events?id=eq.${encodeURIComponent(order.event_id)}` +
        `&select=title,starts_at,duration_minutes,speakers,recording_minutes`,
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
        body: JSON.stringify({ ticket_email_sent_at: now().toISOString(), ticket_email_error: null, ticket_email_claimed_at: null }),
      },
      'PATCH webinar_orders (e-tiket terkirim)'
    );
    return { sent: true };
  } catch (err) {
    const message = err?.message || String(err);
    console.error(`[webinar] E-tiket ${invoiceNumber} gagal:`, message);

    if (token) {
      // Lepas klaim supaya menu Webinar bisa mencoba lagi tanpa menunggu 10 menit.
      // Hanya klaim milik sendiri: klaim yang sudah basi bisa telah diambil alih.
      await sbFetch(
        `${sb.url}/rest/v1/webinar_orders?invoice_number=eq.${encodedInvoice}` +
          `&ticket_email_claimed_at=eq.${encodeURIComponent(token)}`,
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
    return { sent: false, reason: 'failed', error: message };
  }
}
