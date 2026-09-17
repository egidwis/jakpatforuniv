import type { TranslationKey } from '../i18n/translations';

/**
 * Judul TETAP per segmen — nama TEMPAT, bukan instruksi.
 *
 * ⚠️ MASALAH YANG DITUTUPNYA. Setiap judul yang sudah ada bersifat instruksi:
 * "Pilih kapan iklanmu tayang", "Selesaikan pembayaran", "Periksa pesananmu".
 * Semuanya menjawab *"aku harus apa"* dan tidak satu pun menjawab *"aku ada di
 * mana"*. Untuk peneliti yang mendarat dari link admin — 31 order produksi yang
 * jadwalnya sudah ditetapkan tim — pertanyaan kedua itu justru yang pertama
 * muncul, karena ia tidak pernah menempuh langkah sebelumnya.
 *
 * Judul segmen menjawabnya sebagai `<h1>`; judul layar yang sudah ada turun
 * pangkat jadi subjudul. Keduanya tidak bertabrakan karena menjawab pertanyaan
 * yang berbeda.
 *
 * Kosakatanya BUKAN karangan baru: dashboard peneliti sudah menamai tiga fase
 * (`StatusPage`: Review · Periode Tayang · Publikasi), dan judul segmen
 * meneruskan bahasa itu supaya peneliti tidak belajar dua kosakata untuk satu
 * produk.
 *
 * Murni: masuk keadaan, keluar kunci i18n. Tidak merender apa pun, tidak
 * menyentuh React — sama seperti `slotHold.ts` dan `scheduleLockGate.ts`.
 */

export type SegmentPhase =
  /** Order sedang direview; belum bertanggal, belum ada tagihan. */
  | 'detail'
  /** Disetujui TAPI belum dijadwalkan tim. 21 order produksi. */
  | 'awaiting_schedule'
  /** Peneliti sedang memilih tanggal. */
  | 'reservation'
  /** Tanggal sudah terkunci; tinggal dibayar. */
  | 'payment'
  /** Reservasi lepas karena pembayaran tidak selesai. */
  | 'released';

export interface SegmentState {
  phase: SegmentPhase;
  /**
   * `ad_schedules.ordinal` — ordinal NYATA, bukan nomor langkah.
   * 1 = jadwal pertama, ≥2 = perpanjangan.
   */
  ordinal?: number;
  /**
   * Siapa yang memesan slotnya. Sengaja TIDAK memengaruhi judul: lihat catatan
   * di `segmentTitleOf`. Ada di tipe ini supaya pemanggil tidak perlu
   * menghapusnya sebelum memanggil.
   */
  bookedBy?: string | null;
}

export interface SegmentTitle {
  key: TranslationKey;
  /** Variabel interpolasi, hanya untuk judul yang memuat ordinal. */
  vars?: Record<string, string | number>;
}

/**
 * ⚠️ TIGA ATURAN YANG MUDAH DILANGGAR saat menambah keadaan baru:
 *
 * 1. **Dua jalur bayar WAJIB sekata.** `bookedBy` tidak ikut menentukan judul.
 *    Peneliti yang memesan sendiri dan peneliti yang dijadwalkan admin berdiri
 *    di TEMPAT yang sama; yang berbeda cuma cara sampai ke sana. Judul berbeda
 *    akan menyiratkan ada dua jenis pembayaran.
 *
 * 2. **NOL nomor jadwal di judul** (keputusan pemilik produk 2026-09-17).
 *    Judul reservasi berbunyi sama untuk jadwal pertama maupun kesepuluh.
 *
 *    Sebelumnya perpanjangan berjudul "Reservasi Jadwal Ke-2". Ordinal itu
 *    menjawab pertanyaan yang TIDAK sedang diajukan peneliti: ia datang dari
 *    kartu ordernya sendiri, jadi ia sudah tahu survei mana — dan Booking ID
 *    tercetak persis di atas judul. Yang tersisa cuma cara kita menghitung,
 *    bocor ke layarnya. Pada order yang sudah panjang, "Ke-7" mulai terbaca
 *    seperti birokrasi, bukan bantuan.
 *
 *    ⚠️ `ordinal` SENGAJA TETAP di tipe ini. Ia masih dipakai pemanggil untuk
 *    keputusan lain (mis. `defaultOpen` rincian biaya), dan menghapusnya dari
 *    `SegmentState` memaksa mereka membongkar objeknya sebelum memanggil.
 *
 * 3. **Nol penomoran langkah.** Jalur admin tidak pernah menempuh langkah 1–2
 *    dan perpanjangan bukan bagian wizard — "Langkah N dari 3" hanya membuat
 *    mereka mencari langkah yang tidak ada.
 */
export function segmentTitleOf(state: SegmentState): SegmentTitle {
  switch (state.phase) {
    case 'detail':
      return { key: 'segmentDetail' };

    case 'awaiting_schedule':
      return { key: 'segmentAwaitingSchedule' };

    case 'payment':
      // Aturan 1: `bookedBy` sengaja tidak dilihat.
      return { key: 'segmentPayment' };

    case 'released':
      // Sengaja TIDAK memakai ordinal: yang perlu diketahui peneliti di layar
      // ini adalah tanggalnya hilang, bukan nomor jadwalnya.
      return { key: 'segmentReservationReleased' };

    case 'reservation':
      // Aturan 2: nomor jadwal TIDAK ikut ke judul, berapa pun ordinal-nya.
      return { key: 'segmentReservation' };
  }
}
