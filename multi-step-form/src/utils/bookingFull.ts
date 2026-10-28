import { kilatNoBookableWave, kilatWaveDays, type KilatWaveRow } from './kilatWaves';
import { firstFitStartYmd, wibHorizonYmds } from './scheduleHorizon';
import { isBookingClosedForDate } from './airing-window';

/**
 * Peneliti tidak punya SATU PUN pilihan jadwal yang bisa dipesan sendiri?
 * (keputusan 27 Okt 2026: kuota penuh → pemesanan dibantu tim)
 *
 *   null     → pemilih biasa.
 *   'full'   → kuota yang menutupnya (Kilat: semua gelombang; Iklan: tidak ada
 *              tanggal mulai yang memuat seluruh durasi dalam 14 hari).
 *   'closed' → Kilat buntu karena libur / lewat batas saja.
 *
 * SATU predikat untuk tiga layar — wizard (`StepSchedule`), Jadwal & Bayar,
 * Jadwal Baru — supaya ketiganya tidak bisa berselisih kapan kartunya muncul.
 *
 * ⚠️ KOSONG BUKAN PENUH. Ketersediaan yang belum terbaca atau gagal SELALU
 * null: kartu penuh menjanjikan bantuan tim, janji yang tidak boleh lahir dari
 * data kosong. Mode libur Kilat (sql/122) punya pemberitahuannya sendiri.
 */
export function bookingBlockedReason({
  isKilat,
  waves,
  availability,
  duration,
  now = new Date(),
}: {
  isKilat: boolean;
  waves: { isReady: boolean; hasError: boolean; adminAway: boolean; rows: readonly KilatWaveRow[] };
  availability: { isReady: boolean; hasError: boolean; isRangeAvailable: (startYmd: string, days: number) => boolean };
  duration: number;
  now?: Date;
}): 'full' | 'closed' | null {
  if (isKilat) {
    if (!waves.isReady || waves.hasError || waves.adminAway) return null;
    return kilatNoBookableWave(kilatWaveDays(waves.rows, now));
  }
  if (!availability.isReady || availability.hasError) return null;
  const fit = firstFitStartYmd(
    wibHorizonYmds(now),
    duration,
    availability.isRangeAvailable,
    (ymd) => isBookingClosedForDate(ymd, now),
  );
  return fit === null ? 'full' : null;
}
