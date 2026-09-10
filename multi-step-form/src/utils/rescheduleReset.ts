/**
 * Apa yang harus IKUT direset saat sebuah jadwal dipindah ke tanggal baru.
 *
 * ── Cacat yang melahirkan modul ini (10 Sep 2026) ──────────────────────────
 *
 * Booking `#MM36J2EW` dipindah ke 22 Sep — tanggal yang masih jauh di depan —
 * dan kartunya TETAP berbunyi *"Slot kedaluwarsa. Silakan atur tanggal tayang
 * baru."*, sementara penelitinya melihat *"Batas bayar terlewat — perlu
 * tanggal tayang baru."*
 *
 * Penyebabnya bukan salah baca. `isEntryHoldLapsed()` menyala oleh EMPAT
 * sebab, dan tiga di antaranya memang sudah padam sesudah pemindahan (hold 1
 * jam, cutoff 14.00 hari tayang, dan `holdStateOf`). Yang keempat —
 * `paymentStatus === 'expired'` — tidak pernah dibersihkan siapa pun.
 *
 * `ScheduleForm.handleSaveEdit` sudah menyetel ulang `submission_status`,
 * `slot_booked_by`, dan `slot_reserved_at`, tapi MELEWATKAN `payment_status`.
 * Nilai `'expired'`-nya ditulis lebih dulu oleh `releaseExpiredSlot()` atau
 * `cancelSchedule()`, lalu bertahan selamanya melewati pemindahan tanggal.
 * Diverifikasi di produksi: baris `#MM36J2EW` menunjukkan
 * `submission_status='slot_reserved'` dan `slot_reserved_at` hari itu (dua-duanya
 * ter-reset) berdampingan dengan `payment_status='expired'` (tidak).
 *
 * ⚠️ Presedennya SUDAH ADA dan tinggal diikuti: `rebookSlotForSubmission()`
 * menulis `payment_status: 'pending'` justru untuk keadaan yang sama — jendela
 * bayar habis lalu penelitinya memilih tanggal lain. Jalur ADMIN yang
 * tertinggal, bukan aturannya yang belum ada.
 *
 * ── Kenapa fungsi murni, bukan langsung di dalam komponen ──────────────────
 *
 * Keputusannya punya tiga syarat yang mudah dilanggar sebagian, dan
 * pelanggarannya SUNYI: kartu yang salah tetap dirender tanpa satu pun error.
 * Sebagai fungsi murni ia bisa diuji tanpa jaringan maupun DOM.
 */

/**
 * Status siklus hidup yang berarti "order ini sudah berjalan".
 *
 * Sengaja sama dengan daftar `alreadyCommitted` di `ScheduleForm`: order yang
 * sudah `scheduled`/`live` tidak boleh status bayarnya diutak-atik oleh
 * pemindahan tanggal, karena di situ pemindahannya adalah koreksi jadwal —
 * bukan penjadwalan ulang slot yang gugur.
 */
export const COMMITTED_LIFECYCLE_STATUSES = ['paid', 'scheduled', 'live', 'completed'];

/** Status bayar yang berarti uangnya SUDAH masuk. */
const PAID_STATUSES = ['paid', 'completed'];

export interface RescheduleResetInput {
  /**
   * `payment_status` baris SEKARANG.
   *
   * ⚠️ Harus dibaca ulang dari server, bukan diambil dari objek kartu. Kartu
   * bisa basi beberapa detik — dan webhook DOKU boleh mendarat tepat di sela
   * itu. Yang dipertaruhkan: membalik pembayaran yang baru saja sah jadi
   * `pending`.
   */
  paymentStatus: string | null | undefined;
  /** `submission_status` (ordinal 1) atau `ad_schedules.status` (jadwal ke-2 dst.). */
  lifecycleStatus?: string | null;
}

/**
 * Tambalan yang harus ikut ditulis bersama tanggal barunya.
 *
 * Objek KOSONG berarti "tidak ada yang perlu direset" — bukan kegagalan.
 */
export function rescheduleResetPatch(
  input: RescheduleResetInput,
): { payment_status?: 'pending' } {
  const payment = String(input.paymentStatus ?? '').toLowerCase();
  const lifecycle = String(input.lifecycleStatus ?? '').toLowerCase();

  // Uang yang sudah masuk tidak pernah dibalik oleh pemindahan tanggal.
  // Aturan yang sama dipegang sql/60 (tagihan lunas tidak pernah basi) dan
  // `cancelSchedule()` (jadwal lunas tidak bisa dibatalkan dari sana).
  if (PAID_STATUSES.includes(payment)) return {};

  // Order yang sudah berjalan: pemindahan tanggalnya koreksi jadwal, bukan
  // penjadwalan ulang slot yang gugur. Jangan sentuh status bayarnya.
  if (COMMITTED_LIFECYCLE_STATUSES.includes(lifecycle)) return {};

  /*
    HANYA `'expired'` yang dibersihkan, dan itu disengaja.

    `'pending'` sudah benar (tidak ada yang berubah). `'failed'` menyimpan
    riwayat percobaan bayar yang gagal — memutihkannya menghapus jejak yang
    masih dibutuhkan admin. Yang tidak lagi benar sesudah tanggalnya pindah
    cuma satu: vonis "jendelanya sudah lewat", karena jendelanya baru.
  */
  if (payment !== 'expired') return {};

  return { payment_status: 'pending' };
}
