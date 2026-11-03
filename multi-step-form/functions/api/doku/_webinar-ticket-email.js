import { sendMail } from '../_mail.js';
import {
  formatChannelLabel,
  formatDateTimeIndo,
  generateReceiptPdf,
  shortDocCode,
  terbilangCapitalized,
} from './_payment-receipt.js';

// E-tiket webinar beserta kwitansi PDF.
//
// Keputusan pemilik produk: teks untuk pembeli tidak menyebut pengembalian dana
// sama sekali. Pembeli yang punya kendala diarahkan menghubungi admin. Dikunci
// oleh webhookWebinar.spec.js.

const SITE_URL = 'https://submit.jakpatforuniv.com';
const ADMIN_CONTACT = 'product@jakpat.net';

function escapeHtml(value) {
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
export function buildTicketEmail({ order, event }) {
  const joinUrl = `${SITE_URL}/webinar/gabung/${order.join_token}`;
  const dashboardUrl = `${SITE_URL}/dashboard/webinar`;
  const calendarUrl = googleCalendarUrl({
    title: event.title,
    startsAt: event.starts_at,
    durationMinutes: event.duration_minutes,
    joinUrl,
  });
  const speakers = (Array.isArray(event.speakers) ? event.speakers : [])
    .map((s) => [s?.name, s?.title].filter(Boolean).join(', '))
    .filter(Boolean)
    .join(' · ');

  const row = (label, value) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>` +
    `<td style="padding:6px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`;

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
      <p style="margin:0 0 8px;font-size:14px;">Tidak bisa hadir? Tiketmu sudah termasuk rekaman, yang tersedia di menu Webinar setelah acara. Masuk dengan akun <strong>${escapeHtml(order.buyer_email)}</strong>.</p>
      <p style="margin:0;font-size:14px;">Ada kendala? Hubungi admin di <a href="mailto:${ADMIN_CONTACT}">${ADMIN_CONTACT}</a>.</p>
    </div>
  `;

  return { subject: `E-tiket: ${event.title}`, html };
}

const SHORT_DATE = { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' };

/** Kwitansi tidak boleh menahan tiket: gagal membuat PDF berarti tiket terkirim tanpa lampiran. */
export function buildTicketReceipt({ order, event }) {
  try {
    const code = shortDocCode(order.invoice_number);
    const content = generateReceiptPdf({
      docNumber: `RCP-${code}`,
      invoiceNumber: order.invoice_number,
      paidAtFormatted: formatDateTimeIndo(order.paid_at ? new Date(order.paid_at) : new Date()),
      fullName: order.buyer_name || 'Peserta',
      university: order.buyer_university || '',
      bundles: [{
        title: `Tiket webinar: ${event.title}`,
        scheduleStr: new Date(event.starts_at).toLocaleDateString('id-ID', SHORT_DATE),
        amount: order.amount,
      }],
      subtotal: order.subtotal,
      ppn: order.ppn_amount,
      total: order.amount,
      channelLabel: formatChannelLabel(order.payment_channel),
      terbilangText: terbilangCapitalized(order.amount),
      itemColumnLabel: 'Deskripsi',
      scheduleColumnLabel: 'Jadwal Acara',
    });
    return content ? { filename: `Kwitansi-${code}.pdf`, content } : null;
  } catch (err) {
    console.error(`[webinar] Kwitansi ${order.invoice_number} gagal dibuat:`, err);
    return null;
  }
}

/** Meneruskan hasil sendMail: `{ ok: true, ... }` atau `{ ok: false, error, ... }`. */
export async function sendWebinarTicketEmail(env, { order, event }) {
  const receipt = buildTicketReceipt({ order, event });
  return sendMail(env, {
    to: [order.buyer_email],
    ...buildTicketEmail({ order, event }),
    ...(receipt ? { attachments: [receipt] } : {}),
  });
}
