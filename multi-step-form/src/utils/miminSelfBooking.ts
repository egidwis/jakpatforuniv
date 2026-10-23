import type { SelfBookingClosure } from '@/utils/selfBookingClosure';

// ─────────────────────────────────────────────────────────────
// Bagian RESERVASI MANDIRI di system prompt Mimin (sql/125) — kembaran
// `miminAway.ts`: prompt DB (`ai_settings.system_prompt`) menimpa prompt
// bawaan, jadi apa yang WAJIB sampai ke Mimin ditempel dari kode, SETELAH
// prompt mana pun. Saklar terbuka = string kosong.
// ─────────────────────────────────────────────────────────────

export const MIMIN_SELF_BOOKING_HEADING =
  '=== RESERVASI MANDIRI DITUTUP — MENGALAHKAN SOP "PILIH JADWAL SENDIRI" DI FAQ, SOP, DAN ORDER CONTEXT ===';

const longDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00+07:00`).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
  });

export function buildMiminSelfBookingSection(closure: SelfBookingClosure | null): string {
  if (!closure) return '';
  const message = closure.message.trim();
  return [
    MIMIN_SELF_BOOKING_HEADING,
    `Admin JFU MENUTUP reservasi mandiri sejak ${longDate(closure.since)}: peneliti tidak memilih tanggal tayang dan tidak menerbitkan tagihan sendiri.`,
    message
      ? `Pesan admin untuk peneliti: "${message.replace(/"/g, "'")}"`
      : 'Admin tidak menulis alasan — jangan mengarang alasannya.',
    '- Order baru jalur otomatis TETAP diterima dan lolos review otomatis; tim yang menetapkan tanggal tayang dan mengirim tagihan (maks 1 hari kerja, kecuali tim sedang libur). Order seperti itu tetap dijadwalkan tim walau reservasi mandiri dibuka lagi.',
    '- Slot yang sudah dikunci peneliti SEBELUM ditutup tetap boleh dibayar; tagihan dari admin juga tetap dibayar seperti biasa.',
    '- JANGAN mengarahkan user ke kalender / "Pilih Jadwal" / "Pilih Tanggal Lain" / perpanjangan mandiri (CTA ke /dashboard/jadwal/baru tidak berguna sekarang). Kalau user butuh jadwal cepat atau perpanjangan, tawarkan eskalasi ke tim.',
  ].join('\n');
}
