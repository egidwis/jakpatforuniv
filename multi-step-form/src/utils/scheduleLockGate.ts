import { isBookingClosedForDate } from './airing-window';
import type { TranslationKey } from '../i18n/translations';

/**
 * Boleh mengunci tanggal ini? — SATU gerbang, satu tempat.
 *
 * ⚠️ ATURANNYA PUNYA TIGA PEMANGGIL yang harus sepakat: langkah Jadwal di
 * wizard (jadwal ke-1), kalender yang hidup lagi di halaman bayar (pilih ulang
 * sesudah kedaluwarsa), dan perpanjangan. Sampai modul ini lahir ketiganya
 * menyalin keempat pemeriksaan yang sama — `handleRebook` bahkan menuliskannya
 * apa adanya: *"Sama seperti di StepSchedule"*.
 *
 * ⚠️ DAN INI SATU-SATUNYA PENJAGA DI JALUR PILIH-ULANG.
 * `rebookSlotForSubmission` hanya menolak order yang sudah lunas; ia tidak
 * memeriksa kuota sama sekali. Untuk jalur itu tidak ada pemeriksaan ulang di
 * server — jadi longgarnya gerbang ini langsung jadi kuota yang tertembus.
 *
 * Murni: masuk data, keluar keputusan. Tidak mengimpor React, tidak menyentuh
 * jaringan, tidak memanggil `toast`. Pemanggil yang memutuskan cara
 * menyampaikannya. Pola yang sama dengan `slotHold.ts` dan `canScheduleAgain.ts`.
 */

/** Ketersediaan yang dibutuhkan gerbang — irisan kecil dari `SlotAvailability`. */
export interface LockGateAvailability {
  /**
   * Ketersediaan sudah benar-benar terbaca, minimal sekali.
   *
   * ⚠️ KOSONG BUKAN LOWONG. `isRangeAvailable` membaca `counts[ymd] || 0`, jadi
   * selama ini masih `false` ia menjawab TRUE untuk SETIAP tanggal — termasuk
   * yang sudah penuh.
   */
  isReady: boolean;
  isRangeAvailable: (startYmd: string, days: number) => boolean;
}

export interface LockGateInput {
  /** Tanggal pilihan peneliti, `YYYY-MM-DD`. `null` = belum memilih. */
  selected: string | null;
  /** Lama tayang dalam hari. Nilai < 1 dinaikkan ke 1. */
  duration: number;
  availability: LockGateAvailability;
  /**
   * Disuntikkan supaya gerbang bisa diuji tanpa bergantung pada jam dinding.
   * Bawaannya `isBookingClosedForDate` — batas pesan 13.00 WIB.
   */
  isBookingClosed?: (ymd: string) => boolean;
}

export type LockGateReason =
  | 'no_date'
  | 'past_cutoff'
  | 'availability_unknown'
  | 'range_full';

/**
 * Kunci i18n per sebab — supaya pesannya tidak bisa berbeda antar pemanggil.
 *
 * ⚠️ Bertipe `TranslationKey`, bukan `string`: kunci yang salah ketik jadi
 * galat kompilasi di sini, bukan teks mentah di layar peneliti.
 */
const MESSAGE_KEY: Record<LockGateReason, TranslationKey> = {
  no_date: 'slotErrorNoDate',
  past_cutoff: 'slotErrorPastCutoff',
  availability_unknown: 'slotErrorAvailabilityUnknown',
  range_full: 'slotErrorFull',
};

export type LockGateVerdict =
  | { ok: true; ymd: string; duration: number }
  | {
      ok: false;
      reason: LockGateReason;
      messageKey: TranslationKey;
      /**
       * Tanggal yang terpilih wajib dibersihkan.
       *
       * Hanya untuk `past_cutoff`: membiarkan tanggal mati tetap terpilih
       * membuat klik berikutnya menolak lagi dengan pesan yang sama, dan
       * peneliti tidak punya petunjuk bahwa yang harus diganti adalah
       * tanggalnya. Kedua pemanggil lama sudah melakukan ini.
       */
      clearSelection: boolean;
      /** Pemanggil sebaiknya memuat ulang ketersediaan (hanya `availability_unknown`). */
      shouldReload: boolean;
    };

const tolak = (
  reason: LockGateReason,
  extra: { clearSelection?: boolean; shouldReload?: boolean } = {},
): LockGateVerdict => ({
  ok: false,
  reason,
  messageKey: MESSAGE_KEY[reason],
  clearSelection: extra.clearSelection ?? false,
  shouldReload: extra.shouldReload ?? false,
});

/**
 * ⚠️ URUTANNYA MENGIKAT, dan bukan soal rapi:
 *
 *   1. `no_date`              — tanpa tanggal, tiga sisanya tidak punya subjek.
 *   2. `past_cutoff`          — tanggal lewat batas pesan tidak pernah jadi sah,
 *                               seberapa pun lowongnya. Menaruhnya sesudah
 *                               `isReady` akan menyuruh peneliti menunggu
 *                               kalender termuat untuk tanggal yang memang mati.
 *   3. `availability_unknown` — WAJIB sebelum no. 4. `isRangeAvailable`
 *                               fail-open, jadi urutan terbalik meloloskan
 *                               tanggal penuh setiap kali datanya menggantung.
 *   4. `range_full`           — barulah pertanyaan kuota bisa dipercaya.
 */
export function scheduleLockGate(input: LockGateInput): LockGateVerdict {
  const { selected, availability } = input;
  const isBookingClosed = input.isBookingClosed ?? isBookingClosedForDate;
  const duration = Math.max(input.duration || 1, 1);

  if (!selected) return tolak('no_date');

  if (isBookingClosed(selected)) return tolak('past_cutoff', { clearSelection: true });

  if (!availability.isReady) {
    return tolak('availability_unknown', { shouldReload: true });
  }

  if (!availability.isRangeAvailable(selected, duration)) return tolak('range_full');

  return { ok: true, ymd: selected, duration };
}
