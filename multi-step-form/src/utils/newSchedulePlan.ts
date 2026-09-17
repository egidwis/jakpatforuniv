import type { BatchContext } from './batchContext';
import type { TranslationKey } from '../i18n/translations';

/**
 * Boleh menekan "Kunci Jadwal" untuk jadwal BARU — dan kalau tidak, kenapa.
 *
 * ⚠️ DIPISAH DARI LAYAR KARENA SATU CABANGNYA MENYENTUH UANG. Panel hadiah
 * hanya wajib diisi kalau jendela tayang ini membuka BATCH BARU, dan batch itu
 * dijawab SERVER (`get_schedule_batch_context`, sql/37) — bukan disimpulkan di
 * browser. Menyimpulkannya di browser adalah yang dulu membuat jadwal #3
 * ditagih untuk pool yang sudah didanai jadwal #2.
 *
 * ⚠️ `BatchContext` `null` berarti **TIDAK BISA DIPASTIKAN**, bukan "batch
 * lama". Pemanggil yang memperlakukannya sebagai batch lama akan melewatkan
 * panel hadiah untuk batch yang sebenarnya baru, lalu `create_ad_schedule`
 * menolaknya di server SESUDAH penelitinya mengisi seluruh layar. Di sini ia
 * jadi penolakan yang bersuara.
 *
 * ⚠️ Modal lama mematikan tombolnya TANPA sepatah kata (`canSubmit` sebuah
 * boolean telanjang). Setiap penolakan di sini membawa kunci i18n-nya.
 *
 * Murni: masuk keadaan, keluar keputusan. Tidak menyentuh jaringan, tidak
 * merender, tidak menghitung harga.
 */

export type NewScheduleBlock =
  /** Belum memilih tanggal. */
  | 'no_date'
  /** Ketersediaan slot belum terbaca — "kosong bukan lowong". */
  | 'availability_unknown'
  /** Batch masih ditanyakan ke server. */
  | 'batch_resolving'
  /** Server tidak bisa memastikan batch — JANGAN tebak batch lama. */
  | 'batch_unknown'
  /** Jendela ini membuka pool baru dan hadiahnya belum diisi. */
  | 'reward_missing'
  /** Sedang menyimpan. */
  | 'saving';

export interface NewScheduleInput {
  selected: string | null;
  availabilityReady: boolean;
  /** `null` = belum terjawab; lihat peringatan `batch_unknown` di atas. */
  batch: BatchContext | null;
  isResolvingBatch: boolean;
  prizePerWinner: number;
  winnerCount: number;
  isSaving: boolean;
}

export interface NewSchedulePlan {
  canSubmit: boolean;
  block: NewScheduleBlock | null;
  /**
   * Panel hadiah ditampilkan? Hanya untuk batch baru — batch lama ikut kolam
   * yang sudah didanai, dan menanyakan hadiah lagi di sana menagih dua kali.
   */
  needsReward: boolean;
}

/**
 * Kunci i18n per sebab.
 *
 * ⚠️ Bertipe `TranslationKey`, bukan `string` — salah ketik jadi galat
 * kompilasi, bukan kalimat kosong di layar peneliti. Dua kunci pertama SENGAJA
 * memakai milik `scheduleLockGate`: kalimatnya memang sama, dan kunci kedua
 * untuk kalimat yang sama adalah cara terjemahan mulai menyimpang.
 */
export const NEW_SCHEDULE_BLOCK_KEY: Record<NewScheduleBlock, TranslationKey> = {
  no_date: 'slotErrorNoDate',
  availability_unknown: 'slotErrorAvailabilityUnknown',
  batch_resolving: 'scheduleAgainBatchResolving',
  batch_unknown: 'scheduleAgainBatchUnknown',
  reward_missing: 'scheduleAgainRewardRequired',
  saving: 'scheduleAgainBooking',
};

export function newSchedulePlan(input: NewScheduleInput): NewSchedulePlan {
  const needsReward = input.batch?.isNewBatch === true;
  const tolak = (block: NewScheduleBlock): NewSchedulePlan => ({
    canSubmit: false,
    block,
    needsReward,
  });

  if (input.isSaving) return tolak('saving');
  if (!input.selected) return tolak('no_date');

  /*
    Ketersediaan sebelum apa pun yang lain — `counts[ymd] || 0` menjawab
    "lowong" untuk SETIAP tanggal selama belum terbaca. Urutan yang sama
    ditegakkan `scheduleLockGate`.
  */
  if (!input.availabilityReady) return tolak('availability_unknown');

  if (input.isResolvingBatch) return tolak('batch_resolving');

  // Tanggal sudah dipilih tapi server belum menjawab batch-nya → menolak,
  // BUKAN menganggapnya batch lama.
  if (input.batch === null) return tolak('batch_unknown');

  if (needsReward && (input.prizePerWinner <= 0 || input.winnerCount <= 0)) {
    return tolak('reward_missing');
  }

  return { canSubmit: true, block: null, needsReward };
}
