import type { AdminAway } from '@/utils/operationalHolidays';

// ─────────────────────────────────────────────────────────────
// Bagian STATUS TIM ADMIN di system prompt Mimin (mode libur, sql/122) —
// kembaran `miminPricing.ts`, dengan alasan yang sama: prompt DB
// (`ai_settings.system_prompt`) menimpa prompt bawaan, jadi apa pun yang WAJIB
// sampai ke Mimin ditempel dari kode, SETELAH prompt mana pun.
//
// Ditempel setelah ORDER CONTEXT: kalimat "maks 2 hari kerja" di FAQ, SOP, dan
// callout order kalah oleh blok ini selama libur. Tanpa libur = string kosong.
// ─────────────────────────────────────────────────────────────

export const MIMIN_AWAY_HEADING =
  '=== STATUS TIM ADMIN — MENGALAHKAN ESTIMASI WAKTU DI FAQ, SOP, DAN ORDER CONTEXT ===';

const longDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00+07:00`).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
  });

export function buildMiminAwaySection(away: AdminAway | null): string {
  if (!away) return '';
  const message = away.message.trim();
  return [
    MIMIN_AWAY_HEADING,
    `Tim admin JFU sedang LIBUR sejak ${longDate(away.since)}.`,
    message
      ? `Pesan admin untuk peneliti: "${message.replace(/"/g, "'")}"`
      : 'Admin tidak menulis pesan atau tanggal kembali.',
    '- Tetap jalan: iklan jalur otomatis tayang sesuai jadwal; pembayaran tetap bisa.',
    '- Menunggu tim kembali: review manual, penjadwalan & tagihan oleh admin, pemesanan dan push JFU Kilat (order Kilat baru diproses manual), lapor kendala, komplain.',
    '- JANGAN menjanjikan "maks X hari kerja" / "1x24 jam" selama libur. Sebut tanggal kembali HANYA bila tertulis di pesan admin; jangan mengarang tanggal.',
    '- Jangan mengarahkan user memilih gelombang Kilat sendiri selama libur (CTA ke /dashboard/jadwal/baru untuk order Kilat tidak berguna sekarang).',
  ].join('\n');
}
