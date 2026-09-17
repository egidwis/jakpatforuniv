import { deriveScheduleMoney, type ScheduleMoney } from './scheduleMoney';
import type { AdScheduleEntry } from './supabase';

/**
 * Kolom yang BENAR-BENAR dibaca `deriveScheduleMoney`.
 *
 * ⚠️ Sengaja `Pick`, bukan `AdScheduleEntry` utuh. Mengisi 11 kolom lain
 * (`title`, `periodBatch`, `slotBookedBy`, …) dengan nilai karangan membuat
 * baris palsu ini terlihat seperti baris sungguhan, dan kolom karangan adalah
 * yang paling mudah dikira data oleh pembaca berikutnya. Kalau suatu hari
 * `deriveScheduleMoney` mulai membaca kolom di luar daftar ini, TypeScript
 * yang akan memberi tahu — bukan peneliti lewat angka yang salah.
 */
type PricingFields = Pick<
  AdScheduleEntry,
  | 'ordinal'
  | 'duration'
  | 'status'
  | 'distributionType'
  | 'totalCost'
  | 'subtotal'
  | 'ppnAmount'
  | 'voucherCode'
  | 'prizePerWinner'
  | 'winnerCount'
  | 'additionalPrizePerWinner'
  | 'isNewPeriod'
>;

/**
 * Estimasi biaya untuk jadwal yang BELUM LAHIR.
 *
 * ⚠️ KENAPA ADA. Halaman "jadwal baru" harus memperlihatkan harga SEBELUM
 * peneliti menekan kunci — rencana menaruh blok RINCIAN tepat di antara
 * kalender dan tombol, dan modal lama yang digantikannya tidak punya harga sama
 * sekali ("❗ TIDAK ADA HARGA"). Tapi `deriveScheduleMoney` menuntut
 * `AdScheduleEntry`, dan pada layar itu barisnya belum ada.
 *
 * ⚠️ MENGHITUNG NOL. Modul ini TIDAK menurunkan satu pun nominal; ia merakit
 * entry sementara lalu menyerahkannya ke `deriveScheduleMoney`. Itu disengaja
 * dan mengikat: menyalin rumusnya ke sini melahirkan jalur harga KEDUA yang
 * bisa menyimpang diam-diam dari yang dipakai kartu jadwal, halaman bayar, dan
 * `create-payment.js`. Rencana menyebutnya eksplisit — "jangan hitung ulang,
 * itu mengulang cacat yang baru ditutup".
 *
 * ⚠️ `ordinal` DAN `isNewPeriod` ADALAH GERBANG HADIAH. `fundsPrizePool`
 * (`ordinal === 1 || isNewPeriod`, asal sql/37) yang memutuskan apakah baris
 * Reward muncul. Perpanjangan batch LAMA ikut kolam yang sudah didanai, jadi
 * hadiahnya nol — mengirim `isNewPeriod: true` untuk batch lama akan menawarkan
 * hadiah yang tidak pernah ditagih, dan itu penagihan ganda yang sama dengan
 * yang sql/37 tutup.
 *
 * ⚠️ HASILNYA SELALU `isEstimate: true` — dipaksa lewat `totalCost: 0`, yang
 * membuat `deriveScheduleMoney` mengambil cabang "penawaran, bukan catatan".
 * Labelnya wajib berbunyi "estimasi": `recordedVsBilled` membuktikan
 * `total_cost` bisa menyimpang dari `invoices.amount`.
 */

export interface DraftScheduleInput {
  /** Ordinal jadwal yang AKAN lahir (2 untuk perpanjangan pertama). */
  ordinal: number;
  duration: number;
  /** Jawaban SERVER (`get_schedule_batch_context`), bukan tebakan browser. */
  isNewBatch: boolean;
  /** Hanya berarti bila `isNewBatch`; batch lama tidak mendanai pool. */
  prizePerWinner: number;
  winnerCount: number;
  questionCount: number | null | undefined;
  distributionType: string | null | undefined;
  /** Voucher WARISAN order — read-only, tidak pernah diketik di layar jadwal. */
  voucherCode: string | null | undefined;
}

export function draftScheduleMoney(input: DraftScheduleInput): ScheduleMoney {
  /*
    Entry sementara: hanya kolom yang DIBACA `deriveScheduleMoney` yang diisi
    dengan sungguh-sungguh. Sisanya nilai netral — bukan kemalasan, melainkan
    supaya tidak ada kolom karangan yang bisa dikira data.
  */
  const entry: PricingFields = {
    ordinal: input.ordinal,
    duration: input.duration,
    // ⚠️ BUKAN 'cancelled'. Cabang jadwal batal memulangkan total 0 tanpa
    // rincian, dan layar ini justru sedang menawarkan.
    status: 'draft',
    distributionType: input.distributionType ?? null,
    // ⚠️ NOL WAJIB: inilah yang memilih cabang "belum ditagih" di
    // `deriveScheduleMoney`. Angka bukan-nol akan membuatnya membaca
    // `subtotal`/`ppnAmount` yang di sini memang belum ada.
    totalCost: 0,
    subtotal: null,
    ppnAmount: null,
    voucherCode: input.voucherCode ?? null,
    /*
      ⚠️ DIKIRIM APA ADANYA — JANGAN dinolkan di sini.

      Godaannya: "batch lama tidak mendanai pool, jadi nolkan saja". Itu
      menyalin `fundsPrizePool` ke tempat kedua, dan salinan itu SALAH karena
      ia melewatkan setengah aturannya: `ordinal === 1 || isNewPeriod`. Jadwal
      PERTAMA selalu mendanai pool meski `is_new_period`-nya false (kolom itu
      lahir untuk membedakan perpanjangan), jadi menggerbangi dengan
      `isNewBatch` saja mencabut hadiah dari setiap order pertama.

      Ditangkap spec `ordinal 1 SELALU mendanai pool` sebelum ini sempat
      terkirim. Gerbangnya milik `deriveScheduleMoney`; di sini cukup jujur.
    */
    prizePerWinner: input.prizePerWinner,
    winnerCount: input.winnerCount,
    additionalPrizePerWinner: 0,
    isNewPeriod: input.isNewBatch,
  };

  /*
    Cast ke `AdScheduleEntry` disengaja dan AMAN selama daftar `PricingFields`
    di atas tetap memuat semua yang dibaca — itulah gunanya daftar itu ada,
    alih-alih `as any` yang tidak menjaga apa pun.
  */
  return deriveScheduleMoney(entry as AdScheduleEntry, {
    question_count: input.questionCount ?? null,
    distribution_type: input.distributionType ?? null,
  });
}
