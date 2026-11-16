// Email otomatis ke peserta webinar (Fase 3, 6 Nov 2026). Templat TETAP: admin
// tidak bisa mengubah teksnya, dan teksnya disetujui pemilik produk.
//
// Aturan yang dikunci notify.spec.js:
// - Teks untuk pembeli tidak menyebut refund/pengembalian dana sama sekali;
//   kendala diarahkan ke admin.
// - Link Zoom tidak pernah dicantumkan, hanya link gabung pribadi
//   (/webinar/gabung/<join_token>), yang meneruskan ke Zoom saat ruang dibuka.
// - Semua isi dari database di-escape.

import { escapeHtml, googleCalendarUrl } from '../doku/_webinar-ticket-email.js';
import { ADMIN_CONTACT, SITE_URL } from './_view.js';

const TZ = 'Asia/Jakarta';

function parts(date, options) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('id-ID', { timeZone: TZ, ...options }).formatToParts(date).map((p) => [p.type, p.value])
  );
}

const clock = (date) => {
  const p = parts(date, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.hour}.${p.minute}`;
};

/** "Selasa, 17 November 2026 · 08.30–10.00 WIB" */
export function formatWibRange(startsAt, durationMinutes) {
  const start = new Date(startsAt);
  const d = parts(start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const minutes = Number(durationMinutes);
  const end = Number.isFinite(minutes) && minutes > 0 ? `–${clock(new Date(start.getTime() + minutes * 60_000))}` : '';
  return `${d.weekday}, ${d.day} ${d.month} ${d.year} · ${clock(start)}${end} WIB`;
}

/** "Sel, 17 Nov, 08.30 WIB" untuk subjek. */
function shortWib(startsAt) {
  const start = new Date(startsAt);
  const d = parts(start, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${d.weekday}, ${d.day} ${d.month}, ${clock(start)} WIB`;
}

const speakersLine = (speakers) => (Array.isArray(speakers) ? speakers : [])
  .map((s) => [s?.name, s?.title].filter(Boolean).join(', '))
  .filter(Boolean)
  .join(' · ');

const p = (html, extra = '') => `<p style="margin:0 0 12px;font-size:14px;${extra}">${html}</p>`;
const row = (label, value) =>
  `<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>` +
  `<td style="padding:4px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`;
const button = (href, label = 'Gabung ke webinar') =>
  `<p style="margin:16px 0 12px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#1976D2;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;">${escapeHtml(label)}</a></p>`;

/** "Selasa, 17 November 2026" untuk email rekaman. */
function longDate(startsAt) {
  const d = parts(new Date(startsAt), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${d.weekday}, ${d.day} ${d.month} ${d.year}`;
}
const contact = p(`Ada kendala? Hubungi admin di <a href="mailto:${ADMIN_CONTACT}">${ADMIN_CONTACT}</a>.`);
const wrap = (inner) => `<div style="font-family: Arial, sans-serif; line-height:1.6; color:#333; max-width:600px;">${inner}</div>`;

/**
 * @param {{ kind: 'reminder_day'|'schedule_change'|'cancellation'|'recording_ready',
 *           event: { title, starts_at, duration_minutes, speakers },
 *           recipient: { buyer_name, ticket_code, join_token, order_id } }} input
 * @returns {{ subject: string, html: string }}
 */
export function buildWebinarNotifyEmail({ kind, event, recipient }) {
  const name = escapeHtml(recipient?.buyer_name || 'Kak');
  const title = escapeHtml(event.title);
  const schedule = formatWibRange(event.starts_at, event.duration_minutes);
  const code = recipient?.ticket_code || '';
  const joinUrl = `${SITE_URL}/webinar/gabung/${recipient?.join_token}`;
  const calendarUrl = googleCalendarUrl({
    title: event.title, startsAt: event.starts_at, durationMinutes: event.duration_minutes, joinUrl,
  });

  if (kind === 'reminder_day') {
    const speakers = speakersLine(event.speakers);
    return {
      subject: `Pengingat: ${event.title} · ${shortWib(event.starts_at)}`,
      html: wrap(
        p(`Halo ${name}, ini pengingat untuk webinar yang kamu ikuti.`) +
        `<h2 style="margin:0 0 8px;font-size:20px;color:#111;">${title}</h2>` +
        `<table style="border-collapse:collapse;font-size:14px;margin-bottom:8px;">` +
          row('Jadwal', schedule) + (speakers ? row('Pembicara', speakers) : '') + row('Kode tiket', code) +
        `</table>` +
        button(joinUrl) +
        p('Ruang dibuka 30 menit sebelum acara. Link ini milikmu pribadi, jadi jangan disebarkan.') +
        p(`<a href="${escapeHtml(calendarUrl)}">Tambahkan ke Google Calendar</a> · <a href="${SITE_URL}/dashboard/webinar">Buka menu Webinar</a>`) +
        p('Tidak bisa hadir? Tiketmu sudah termasuk rekaman, yang tersedia di menu Webinar setelah acara.') +
        contact
      ),
    };
  }

  if (kind === 'schedule_change') {
    return {
      subject: `Jadwal baru: ${event.title}`,
      html: wrap(
        p(`Halo ${name}, jadwal webinar <strong>${title}</strong> berubah. Ini jadwal terbarunya:`) +
        `<table style="border-collapse:collapse;font-size:14px;margin-bottom:8px;">` +
          row('Jadwal', schedule) + row('Kode tiket', code) +
        `</table>` +
        p('Tiketmu tetap berlaku untuk jadwal baru ini dan sudah termasuk rekaman. Kamu tidak perlu melakukan apa pun.') +
        button(joinUrl) +
        p(`Link gabungmu tetap sama. <a href="${escapeHtml(calendarUrl)}">Tambahkan jadwal baru ke Google Calendar</a>`) +
        contact
      ),
    };
  }

  if (kind === 'cancellation') {
    return {
      subject: `Webinar dibatalkan: ${event.title}`,
      html: wrap(
        p(`Halo ${name}, mohon maaf, webinar <strong>${title}</strong> yang dijadwalkan ${escapeHtml(schedule)} dibatalkan.`) +
        p(`Untuk pertanyaan tentang tiketmu (kode ${escapeHtml(code)}), hubungi admin di <a href="mailto:${ADMIN_CONTACT}">${ADMIN_CONTACT}</a>.`) +
        p('Terima kasih atas pengertianmu.')
      ),
    };
  }

  if (kind === 'recording_ready') {
    // Link ke halaman tonton per order (wajib login sebagai pemilik). Tanpa URL video:
    // URL R2 hanya diterbitkan /api/webinar/watch.
    if (!/^[0-9a-f-]{36}$/i.test(String(recipient?.order_id ?? ''))) throw new Error('order_id wajib untuk email rekaman');
    const watchUrl = `${SITE_URL}/dashboard/webinar/tonton/${recipient.order_id}`;
    const when = event.starts_at ? ` (${escapeHtml(longDate(event.starts_at))})` : '';
    return {
      subject: `Rekaman tersedia: ${event.title}`,
      html: wrap(
        p(`Halo ${name}, rekaman webinar <strong>${title}</strong>${when} sudah bisa ditonton.`) +
        button(watchUrl, 'Tonton rekaman') +
        p('Materi presentasi bisa diunduh di halaman yang sama. Masuk dengan akun yang dipakai saat membeli tiket.') +
        p('Rekaman ini untuk penggunaan pribadi, jadi jangan disebarkan.') +
        contact
      ),
    };
  }

  throw new Error(`Jenis email webinar tidak dikenal: ${kind}`);
}
