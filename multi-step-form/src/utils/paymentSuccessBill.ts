/**
 * Tagihan mana yang sedang dilihat peneliti di halaman "/payment-success".
 *
 * ⚠️ ADA KARENA HALAMAN ITU MENAMPILKAN NOMINAL YANG SALAH. Ia membaca
 * `form_submissions.total_cost / subtotal / ppn_amount` — biaya ORDER — lalu
 * mencetaknya di bawah judul "Total Pembayaran". Terukur pada satu jadwal
 * produksi: halaman kami menyebut Rp 277.500 sementara DOKU menagih Rp 1.110.
 * Normalnya kedua angka sama, dan justru itu yang membuatnya berbahaya: ia
 * benar cukup lama untuk dipercaya, lalu berbohong tepat saat tagihannya
 * berbeda dari harga order (tagihan susulan, top-up hadiah, harga yang
 * di-reprice).
 *
 * ⚠️ HALAMAN INI HANYA MENERIMA PEMBAYARAN N=1. `createManualInvoice`
 * mengarahkan tagihan gabungan ke `/invoices/<no>` — yang memang memuat seluruh
 * bundel — jadi di sini selalu ada satu pembayaran, bukan empat.
 */

/** Satu peristiwa tagihan, sudah ditautkan ke jadwalnya. */
export interface SuccessBillEvent {
  /** `ad_schedules.id` — kunci resolver `/bayar/<id>`. */
  scheduleId: string;
  paymentId: string | null;
  amount: number;
  createdAt: string | null;
  isPaid: boolean;
  /** Tagihan yang MASIH menunggu dibayar (`openInvoice` dari `schedule_billing`). */
  isOpen: boolean;
}

export interface SuccessBillPick {
  /**
   * Tagihan yang nominalnya boleh ditampilkan. `null` = **sembunyikan blok
   * nominal**; jangan pernah jatuh kembali ke angka order.
   */
  bill: SuccessBillEvent | null;
  /**
   * Jadwal yang ditunjuk tombol "Lanjutkan Pembayaran".
   *
   * ⚠️ TETAP TERISI WALAU `bill` NULL — keputusan pemilik produk: tombolnya
   * tetap ada, dan `/bayar/` yang menjelaskan keadaannya. Halaman ini tidak
   * boleh ikut menghitung "tagihan mana yang berwenang"; itu akan jadi salinan
   * kedua dari aturan yang sudah hidup di `authoritative_payment_url()`.
   */
  scheduleId: string | null;
}

const newestFirst = (a: SuccessBillEvent, b: SuccessBillEvent): number => {
  const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return bt - at;
};

/**
 * Aturannya satu kalimat: **peristiwa tagihan TERBARU yang masih berarti.**
 *
 * "Masih berarti" = terbuka (menunggu dibayar) atau lunas. Yang mati, tersusul,
 * dan basi sengaja diabaikan — bukan itu yang barusan ditagihkan DOKU, dan
 * menampilkannya berarti mencetak angka dari tagihan yang sudah ditinggalkan.
 *
 * @param events   seluruh peristiwa tagihan order ini, dari seluruh jadwalnya
 * @param fallbackScheduleId jadwal ordinal 1, dipakai kalau tak ada satu pun
 *                           peristiwa yang berarti — supaya tombolnya tetap ada
 */
export const pickSuccessBill = (
  events: SuccessBillEvent[],
  fallbackScheduleId: string | null = null,
): SuccessBillPick => {
  const meaningful = (events || []).filter((e) => e.isOpen || e.isPaid);
  if (meaningful.length === 0) return { bill: null, scheduleId: fallbackScheduleId };

  /*
    Yang TERBUKA menang atas yang lunas, walau lebih tua.

    Kalau order ini masih menyisakan tagihan yang menunggu dibayar, itulah yang
    sedang dihadapi orangnya — dan tombol "Lanjutkan Pembayaran" harus menunjuk
    ke sana, bukan ke kuitansi jadwal lain yang kebetulan dibayar belakangan.
  */
  const open = meaningful.filter((e) => e.isOpen).sort(newestFirst);
  const bill = open[0] ?? meaningful.sort(newestFirst)[0];

  return { bill, scheduleId: bill.scheduleId || fallbackScheduleId };
};
