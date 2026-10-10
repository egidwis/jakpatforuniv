import { addDaysToYmd, toWibYmd } from './airing-window';

/** Panjang kalender pemilih tanggal peneliti. */
export const SCHEDULE_HORIZON_DAYS = 14;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hari-hari kalender pemilih, mulai HARI INI MENURUT WIB.
 *
 * ⚠️ BUKAN `new Date()` + `setDate` lokal. Semua aturan yang menilai sebuah
 * tanggal — cutoff 13.00, batas bayar 14.00, tayang 15.00, kuota harian —
 * berjalan di kalender WIB. Kalender yang dibangun dari jam perangkat menggeser
 * tile "hari ini" sehari untuk peneliti di WITA/WIT/luar negeri dekat tengah
 * malam, dan pada kalender beku sorotan tanggal terkunci jatuh di tile yang
 * salah.
 */
export function wibHorizonYmds(now: Date = new Date(), days: number = SCHEDULE_HORIZON_DAYS): string[] {
  const today = toWibYmd(now);
  return Array.from({ length: days }, (_, i) => addDaysToYmd(today, i));
}

/**
 * Bisakah tanggal terkunci digambar di kalender beku?
 *
 * Tidak bila: belum ada tanggal, sudah lewat (kredit, sedang tayang), atau
 * jatuh di luar jendela 14 hari (jadwal admin jauh ke depan). Untuk semua itu
 * halaman memajang kartu jadwal terkunci sebagai cadangan — kalender yang tidak
 * memuat tanggalnya sendiri akan terbaca "tidak ada yang terkunci".
 *
 * Hanya menerima `YYYY-MM-DD`; pemanggil menurunkannya ke hari WIB lebih dulu.
 * Bentuk lain ditolak, bukan ditebak.
 */
export function lockedDateFitsHorizon(
  ymd: string | null | undefined,
  now: Date = new Date(),
  days: number = SCHEDULE_HORIZON_DAYS,
): boolean {
  if (!ymd || !YMD.test(ymd)) return false;
  const first = toWibYmd(now);
  const last = addDaysToYmd(first, days - 1);
  return ymd >= first && ymd <= last;
}
