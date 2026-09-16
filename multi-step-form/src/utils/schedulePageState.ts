import { slotReleaseDeadline } from './slotHold';

/**
 * Layar mana yang ditampilkan halaman per-jadwal — SATU mesin keadaan.
 *
 * ⚠️ DIPILIH DARI DATA, BUKAN DARI RIWAYAT. Admin bisa menjadwalkan order mana
 * pun kapan saja, jadi "peneliti memesan sendiri" vs "admin menjadwalkan"
 * adalah properti KEADAAN SEKARANG, bukan jalur review yang ditempuh dulu.
 * Memilih layar dari riwayat membuat order yang baru saja dijadwalkan admin
 * tetap memajang kalender kosong.
 *
 * ⚠️ DINYATAKAN EKSPLISIT, bukan disimpulkan dari `isExpired` di tengah render.
 * `PaymentCheckoutPage` hari ini menukar seluruh isi halaman lewat satu boolean;
 * tanpa keadaan yang punya nama, layar berkedip antar-bentuk saat countdown
 * menyentuh nol.
 *
 * Murni: masuk baris jadwal, keluar keputusan tampilan. Tidak menyentuh
 * jaringan, tidak merender.
 */

export interface PageSubject {
  /** Instant ISO; `null` = order belum punya jendela tayang. */
  startDate: string | null;
  slotBookedBy: string | null | undefined;
  paymentStatus: string | null | undefined;
  /** Sumbu tayang `ad_schedules.status`. */
  status: string | null | undefined;
  slotReservedAt: string | null | undefined;
}

export type PageScreen =
  /** Belum bertanggal — kalender. */
  | 'pick'
  /** Bertanggal, belum lunas — countdown (kalau berhak) + tombol bayar. */
  | 'awaiting_payment'
  /** Reservasi lepas / dibatalkan — banner + kalender lagi. */
  | 'released'
  /** Lunas — tidak ada lagi yang harus dilakukan di sini. */
  | 'settled';

export interface PageState {
  screen: PageScreen;
  /**
   * Boleh menampilkan hitung mundur?
   *
   * ⚠️ BAHAYA UTAMA MODUL INI. Hold 1 jam hanya berlaku
   * `slot_booked_by='user'`; jadwal admin tidak pernah lepas sendiri
   * (`slotHold.ts`). Timer untuk mereka = 31 peneliti produksi melihat hitung
   * mundur yang berbohong, dan sebagian akan mengira tanggalnya hangus.
   */
  showCountdown: boolean;
  /** Boleh menawarkan "Batalkan reservasi"? */
  canCancel: boolean;
}

const PAID = ['paid', 'completed'];
/** Sudah tidak menahan tanggal lagi — apa pun sebabnya. */
const RELEASED_PAYMENT = ['expired'];
const RELEASED_STATUS = ['cancelled', 'slot_cancelled'];

export function schedulePageState(subject: PageSubject): PageState {
  const diam = { showCountdown: false, canCancel: false };

  // Lunas menang atas segalanya: tidak ada tanggal untuk dilepas, tidak ada
  // tagihan untuk dibayar.
  if (PAID.includes(subject.paymentStatus || '')) {
    return { screen: 'settled', ...diam };
  }

  /*
    Sudah dilepas ATAU dibatalkan → layar "Reservasi Dilepas".

    ⚠️ `payment_status='expired'` ikut di sini dan itu BUKAN duplikasi:
    `releaseExpiredSlot` mengosongkan `slot_booked_by`, jadi aturan hold
    memulangkan "tidak pernah lepas" untuk baris yang justru SUDAH lepas.
    Kolom pembayaran yang menyimpan faktanya — pola yang sama sudah dipakai
    `PaymentRetryPage` dan `PaymentCheckoutPage`.
  */
  if (
    RELEASED_PAYMENT.includes(subject.paymentStatus || '')
    || RELEASED_STATUS.includes(subject.status || '')
  ) {
    return { screen: 'released', ...diam };
  }

  // Belum bertanggal → pilih tanggal. Untuk segmen 3 (admin sudah
  // menjadwalkan) cabang ini TIDAK diambil, jadi keadaan ① memang dilewati.
  if (!subject.startDate) {
    return { screen: 'pick', ...diam };
  }

  /*
    Bertanggal & belum lunas. `slotReleaseDeadline()` yang memutuskan timernya,
    bukan pemeriksaan `slotBookedBy` yang disalin ulang di sini — `null`
    berarti "tidak pernah lepas sendiri", dan ia sudah memuat syarat
    `slot_reserved_at` yang terisi.
  */
  const deadline = slotReleaseDeadline({
    slotBookedBy: subject.slotBookedBy,
    slotReservedAt: subject.slotReservedAt,
  });

  return {
    screen: 'awaiting_payment',
    showCountdown: deadline !== null,
    // Yang boleh membatalkan sendiri hanya yang memesan sendiri. Jadwal admin
    // dilepas admin — itu keputusan tim, bukan keputusan layar ini.
    canCancel: subject.slotBookedBy === 'user',
  };
}
