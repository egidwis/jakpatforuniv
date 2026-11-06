import { sendMail } from '../_mail.js';
import {
  formatChannelLabel,
  formatDateTimeIndo,
  generateReceiptPdf,
  shortDocCode,
  terbilangCapitalized,
} from './_payment-receipt.js';

// Email pembelian webinar beserta kwitansi PDF: e-tiket untuk tiket live, dan
// "Rekamanmu siap" untuk Video kelas (Fase 5B, tanpa link gabung & kalender).
//
// Keputusan pemilik produk: teks untuk pembeli tidak menyebut pengembalian dana
// sama sekali. Pembeli yang punya kendala diarahkan menghubungi admin. Dikunci
// oleh webhookWebinar.spec.js. URL rekaman (R2) tidak pernah masuk email: tombol
// tonton membuka halaman tonton yang memeriksa sesi.

const SITE_URL = 'https://submit.jakpatforuniv.com';
const ADMIN_CONTACT = 'product@jakpat.net';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatWib(iso) {
  const when = new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${when} WIB`;
}

const toCalendarStamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export function googleCalendarUrl({ title, startsAt, durationMinutes, joinUrl }) {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + (Number(durationMinutes) || 60) * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${toCalendarStamp(start)}/${toCalendarStamp(end)}`,
    details: `Link gabung pribadimu: ${joinUrl}`,
    location: joinUrl,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Hanya kolom yang dikirim ke sini yang bisa bocor; meeting_url tidak pernah. */
/**
 * `accountEmail` = email akun pembeli (pemilik tiket). Bisa berbeda dari buyer_email
 * bila pembeli mengisi kontak khusus di checkout; kosong berarti tidak diketahui.
 */
const speakerLine = (event) => (Array.isArray(event.speakers) ? event.speakers : [])
  .map((s) => [s?.name, s?.title].filter(Boolean).join(', '))
  .filter(Boolean)
  .join(' · ');

const row = (label, value) =>
  `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>` +
  `<td style="padding:6px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`;

const accountSentence = (accountEmail) => (accountEmail
  ? `Masuk dengan akun <strong>${escapeHtml(accountEmail)}</strong>.`
  : 'Masuk dengan akun yang kamu pakai saat membeli.');

export function buildTicketEmail({ order, event, accountEmail = null }) {
  const joinUrl = `${SITE_URL}/webinar/gabung/${order.join_token}`;
  const dashboardUrl = `${SITE_URL}/dashboard/webinar`;
  const calendarUrl = googleCalendarUrl({
    title: event.title,
    startsAt: event.starts_at,
    durationMinutes: event.duration_minutes,
    joinUrl,
  });
  const speakers = speakerLine(event);

  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.6; color:#333; max-width:600px;">
      <p style="margin:0 0 16px;">Halo ${escapeHtml(order.buyer_name || 'Kak')}, pembayaranmu sudah kami terima. Ini e-tiketmu.</p>
      <h2 style="margin:0 0 12px;font-size:20px;color:#111;">${escapeHtml(event.title)}</h2>
      <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px;">
        ${row('Jadwal', formatWib(event.starts_at))}
        ${speakers ? row('Pembicara', speakers) : ''}
        ${row('Kode tiket', order.ticket_code)}
        ${row('Invoice', order.invoice_number)}
      </table>
      <p style="margin:0 0 20px;">
        <a href="${escapeHtml(joinUrl)}" style="display:inline-block;background:#1976D2;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;">Gabung ke webinar</a>
      </p>
      <p style="margin:0 0 8px;font-size:14px;">Link ini milikmu pribadi, jadi jangan disebarkan. Ruangannya terbuka 30 menit sebelum acara.</p>
      <p style="margin:0 0 20px;font-size:14px;">
        <a href="${escapeHtml(calendarUrl)}">Tambahkan ke Google Calendar</a> ·
        <a href="${escapeHtml(dashboardUrl)}">Buka menu Webinar</a>
      </p>
      <p style="margin:0 0 8px;font-size:14px;">Tidak bisa hadir? Tiketmu sudah termasuk rekaman, yang tersedia di menu Webinar setelah acara. ${accountSentence(accountEmail)}</p>
      <p style="margin:0;font-size:14px;">Ada kendala? Hubungi admin di <a href="mailto:${ADMIN_CONTACT}">${ADMIN_CONTACT}</a>.</p>
    </div>
  `;

  return { subject: `E-tiket: ${event.title}`, html };
}

/** C22 (Fase 5B): email pembelian Video kelas. Tombol tonton per order, tanpa link gabung. */
export function buildReplayEmail({ order, event, accountEmail = null }) {
  const watchUrl = `${SITE_URL}/dashboard/webinar/tonton/${order.id}`;
  const minutes = Number(event.recording_minutes) || null;
  const speakers = speakerLine(event);

  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.6; color:#333; max-width:600px;">
      <p style="margin:0 0 16px;">Halo ${escapeHtml(order.buyer_name || 'Kak')}, terima kasih sudah membeli video kelas <strong>${escapeHtml(event.title)}</strong>. Rekaman dan materinya sudah bisa dibuka.</p>
      <h2 style="margin:0 0 12px;font-size:20px;color:#111;">${escapeHtml(event.title)}</h2>
      <table style="border-collapse:collapse;font-size:14px;margin-bottom:20px;">
        ${minutes ? row('Durasi', `${minutes} menit`) : ''}
        ${speakers ? row('Pembicara', speakers) : ''}
        ${row('Invoice', order.invoice_number)}
      </table>
      <p style="margin:0 0 20px;">
        <a href="${escapeHtml(watchUrl)}" style="display:inline-block;background:#1976D2;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;">Tonton rekaman</a>
      </p>
      <p style="margin:0 0 8px;font-size:14px;">${accountSentence(accountEmail)} Materi presentasi bisa diunduh di halaman yang sama.</p>
      <p style="margin:0 0 8px;font-size:14px;">Rekaman ini untuk penggunaan pribadi, jadi jangan disebarkan.</p>
      <p style="margin:0;font-size:14px;">Kwitansi terlampir. Ada kendala? Hubungi admin di <a href="mailto:${ADMIN_CONTACT}">${ADMIN_CONTACT}</a>.</p>
    </div>
  `;

  return { subject: `Rekamanmu siap: ${event.title}`, html };
}

const SHORT_DATE = { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' };

/** Tanggal kosong ditulis "–", bukan 1 Jan 1970. */
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('id-ID', SHORT_DATE) : '–');

/** Kwitansi tidak boleh menahan tiket: gagal membuat PDF berarti tiket terkirim tanpa lampiran. */
export function buildTicketReceipt({ order, event }) {
  const replay = order.kind === 'replay';
  try {
    const code = shortDocCode(order.invoice_number);
    const content = generateReceiptPdf({
      docNumber: `RCP-${code}`,
      invoiceNumber: order.invoice_number,
      paidAtFormatted: formatDateTimeIndo(order.paid_at ? new Date(order.paid_at) : new Date()),
      fullName: order.buyer_name || 'Peserta',
      university: order.buyer_university || '',
      bundles: [{
        title: `${replay ? 'Video kelas' : 'Tiket webinar'}: ${event.title}`,
        scheduleStr: shortDate(replay ? order.paid_at : event.starts_at),
        amount: order.amount,
      }],
      subtotal: order.subtotal,
      ppn: order.ppn_amount,
      total: order.amount,
      channelLabel: formatChannelLabel(order.payment_channel),
      terbilangText: terbilangCapitalized(order.amount),
      itemColumnLabel: 'Deskripsi',
      scheduleColumnLabel: replay ? 'Tanggal Beli' : 'Jadwal Acara',
    });
    return content ? { filename: `Kwitansi-${code}.pdf`, content } : null;
  } catch (err) {
    console.error(`[webinar] Kwitansi ${order.invoice_number} gagal dibuat:`, err);
    return null;
  }
}

/** Meneruskan hasil sendMail: `{ ok: true, ... }` atau `{ ok: false, error, ... }`. */
export async function sendWebinarTicketEmail(env, { order, event, accountEmail = null }) {
  const receipt = buildTicketReceipt({ order, event });
  const build = order.kind === 'replay' ? buildReplayEmail : buildTicketEmail;
  return sendMail(env, {
    to: [order.buyer_email],
    ...build({ order, event, accountEmail }),
    ...(receipt ? { attachments: [receipt] } : {}),
  });
}
