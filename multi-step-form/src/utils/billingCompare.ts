// ─────────────────────────────────────────────────────────────
// Harga TERCATAT vs nominal yang benar-benar DITAGIHKAN.
//
// Dua angka yang hidup di kartu jadwal yang sama dan tidak pernah dibandingkan:
//
//   TERCATAT  — `ad_schedules.total_cost`, dibekukan saat order dibuat.
//   DITAGIHKAN — `invoices.amount`, dihitung ULANG dari `question_count` pada
//                detik admin menerbitkan tagihan (`buildOrderInvoiceItems`).
//
// Selama masukan harga bisa disunting tanpa menghitung ulang harganya, kedua
// angka itu menyimpang diam-diam — dan kartunya memajang yang pertama di bawah
// judul "Total Penagihan" tepat di atas blok yang mencetak yang kedua.
// ─────────────────────────────────────────────────────────────

/**
 * Bentuk minimal satu peristiwa tagihan. Sengaja struktural, bukan
 * `ScheduleInvoice` utuh: berkas ini dipakai `supabase.ts` sendiri, jadi
 * mengimpor tipenya dari sana akan melingkar — dan spec-nya jadi harus memuat
 * seluruh klien Supabase demi satu perbandingan aritmetika.
 */
export interface BillingEvent {
  amount: number;
  isPaid: boolean;
  isPending: boolean;
  isSuperseded: boolean;
  isStale: boolean;
  source: 'invoice' | 'transaction';
  /**
   * Link bayarnya sudah lewat masa berlaku (sql/83). Opsional supaya pemanggil
   * lama tidak perlu diubah — `undefined` diperlakukan sebagai "belum
   * kedaluwarsa", yang persis perilaku sebelum kolom ini ada.
   */
  isExpired?: boolean;
}

/**
 * Tagihan yang IKUT DIHITUNG sebagai piutang/penerimaan jadwal ini.
 *
 * ⚠️ CERMINAN `live` DI `schedule_billing_summary()` (sql/53, diperluas sql/83)
 * — kalau salah satu berubah, ubah keduanya. Diangkat ke sini supaya
 * `fetchScheduleBilling` dan pembandingan di bawah memakai definisi yang SAMA;
 * menyalin predikatnya adalah cara angka di layar mulai berbeda dari angka di
 * database tanpa satu pun error.
 *
 * ⚠️ `!isExpired` BUKAN KERAPIAN — ia yang membuat gerbang "batalkan jadwal"
 * (Bagian 6a) bisa dipercaya. TIDAK ADA cron yang mengedaluwarsakan tagihan,
 * jadi tanpa syarat ini sebuah tagihan yang link DOKU-nya sudah mati tetap
 * terbaca `pending` selamanya, terus dihitung sebagai `openInvoice`, dan
 * mengunci jadwalnya dari pembatalan tanpa alasan yang bisa dilihat admin.
 * Terukur: 182 dari 183 invoice `pending` produksi sudah lewat 7 hari.
 */
export function isLiveInvoice(i: BillingEvent): boolean {
  return i.isPaid
    || (i.isPending && i.source === 'invoice' && !i.isSuperseded && !i.isStale && !i.isExpired);
}

export interface RecordedVsBilled {
  /** Nominal tagihan yang berdiri untuk jadwal ini. */
  billed: number;
  /** Harga yang tercatat di `ad_schedules.total_cost`. */
  recorded: number;
  /** `billed - recorded`. Positif = ditagih lebih dari yang tercatat. */
  delta: number;
}

/**
 * `null` = tidak ada yang bisa dikatakan dengan jujur.
 *
 * Tiga alasan berbeda, dan ketiganya sengaja bungkam:
 *
 *   * **Harganya estimasi.** Jadwal yang belum pernah ditagih memajang
 *     penawaran, bukan catatan. Membandingkannya dengan tagihan berarti
 *     membandingkan sesuatu dengan dirinya sendiri.
 *   * **Nol tagihan hidup.** Tidak ada pembanding.
 *   * **Lebih dari satu tagihan hidup.** Satu jadwal BOLEH ditagih beberapa
 *     kali — tagihan susulan, top-up hadiah — dan jumlahnya memang tidak harus
 *     sama dengan harga tercatat. Menyalakan peringatan di situ berarti
 *     menuduh keadaan yang benar. Terukur: `76XKVW5P` (Rp 1.470.750 lalu
 *     Rp 61.050) dan `43MG75Y5` (Rp 1.000.000 lalu Rp 500.000) keduanya sah.
 *
 * Aturan emas: jangan pernah menampilkan tuduhan yang sumbernya belum
 * diputuskan.
 */
export function recordedVsBilled(
  money: { total: number; isEstimate: boolean },
  invoices: readonly BillingEvent[],
): RecordedVsBilled | null {
  if (money.isEstimate) return null;

  const live = invoices.filter(isLiveInvoice);
  if (live.length !== 1) return null;

  const billed = live[0].amount;
  if (billed === money.total) return null;

  return { billed, recorded: money.total, delta: billed - money.total };
}
