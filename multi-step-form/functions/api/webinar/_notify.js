// Email otomatis webinar untuk SATU peserta (Iterasi 4, sql/136b). Pola email iklan
// (notify-ad-live.js): cron Postgres (webinar_notify_tick) memanggil
// /api/notify-webinar sekali per order dan langsung mengisi kolom penanda di
// webinar_orders. Di sini hanya: baca order + acara terbaru → periksa keadaannya
// masih cocok → kirim → catat galat bila gagal.
//
// Tidak ada ulang otomatis. Gagal = webinar_orders.email_error terisi dan tampil di
// halaman Peserta; email otomatis berikutnya yang sukses mengosongkannya.
//
// Aturan tulis (pelajaran 3 & 5 Nov): PATCH memfilter id saja dan meminta barisnya
// kembali; nol baris = galat.

import { sendMail } from '../_mail.js';
import { buildWebinarNotifyEmail } from './_notify-email.js';
import { rest } from './_server.js';

export const NOTIFY_KINDS = ['reminder_day', 'schedule_change', 'cancellation', 'recording_ready'];

export const NOTIFY_LABEL = {
  reminder_day: 'Pengingat H-1',
  schedule_change: 'Jadwal berubah',
  cancellation: 'Pembatalan',
  recording_ready: 'Rekaman tersedia',
};

const ORDER_COLUMNS = 'id,event_id,kind,status,buyer_name,buyer_email,ticket_code,join_token,email_error';
const EVENT_COLUMNS = 'id,title,starts_at,duration_minutes,speakers,status,offer_kind,recording_published_at';

/** "16 Nov 09.00" (WIB) */
function wibStamp(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.day} ${p.month} ${p.hour}.${p.minute}`;
}

/** Keadaan acara saat ini masih cocok dengan jenis email? (tick bisa basi beberapa detik) */
function stillDue(kind, event, now) {
  const started = !event.starts_at || Date.parse(event.starts_at) <= now.getTime();
  if (kind === 'cancellation') return event.status === 'cancelled';
  if (kind === 'recording_ready') return event.status === 'published' && Boolean(event.recording_published_at);
  return event.status === 'published' && event.offer_kind === 'live' && !started;
}

function describeError(mail) {
  const detail = typeof mail?.error === 'string' ? mail.error : JSON.stringify(mail?.error ?? null);
  return `${mail?.provider ?? '?'} HTTP ${mail?.status ?? 0}: ${detail}`;
}

async function patchOrder(sb, orderId, write, label) {
  const rows = await rest(sb, `webinar_orders?id=eq.${orderId}&select=id`, { method: 'PATCH', body: JSON.stringify(write) }, label);
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`${label}: bukan tepat satu baris`);
}

/**
 * @returns {Promise<{sent: true} | {sent: false, error: string} | {skipped: string}>}
 * Melempar bila database gagal dibaca atau galat tidak bisa dicatat.
 */
export async function sendOrderNotification({ env, sb, orderId, kind, now = new Date() }) {
  const [order] = (await rest(sb, `webinar_orders?id=eq.${orderId}&select=${ORDER_COLUMNS}`, {}, 'SELECT webinar_orders (email otomatis)')) || [];
  if (!order) return { skipped: 'not_found' };
  if (order.status !== 'paid' || order.kind !== 'live') return { skipped: 'not_paid' };

  const [event] = (await rest(sb, `webinar_events?id=eq.${order.event_id}&select=${EVENT_COLUMNS}`, {}, 'SELECT webinar_events (email otomatis)')) || [];
  if (!event || !stillDue(kind, event, now)) return { skipped: 'wrong_state' };

  let error;
  try {
    const message = buildWebinarNotifyEmail({ kind, event, recipient: { ...order, order_id: order.id } });
    const mail = await sendMail(env, { to: [order.buyer_email], subject: message.subject, html: message.html });
    if (!mail?.ok) error = describeError(mail);
  } catch (err) {
    error = `Templat gagal: ${err?.message || err}`;
  }

  if (!error) {
    if (order.email_error) {
      // Email sudah berangkat: gagal mengosongkan catatan lama tidak boleh membuatnya terlihat gagal.
      await patchOrder(sb, order.id, { email_error: null }, 'PATCH webinar_orders (kosongkan email_error)')
        .catch((err) => console.error('[webinar/notify]', err?.message || err));
    }
    return { sent: true };
  }

  const note = `${NOTIFY_LABEL[kind]} · ${wibStamp(now)} · ${error}`.slice(0, 500);
  await patchOrder(sb, order.id, { email_error: note }, 'PATCH webinar_orders (email_error)');
  return { sent: false, error: note };
}
