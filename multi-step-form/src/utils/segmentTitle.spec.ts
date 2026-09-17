import { describe, it, expect } from 'vitest';
import { segmentTitleOf } from './segmentTitle';
import type { SegmentState } from './segmentTitle';

/*
  Judul TETAP per segmen — supaya peneliti tahu ADA DI MANA, bukan cuma harus
  apa.

  ⚠️ KENAPA BERKAS INI ADA. Judul yang sudah ada semuanya bersifat INSTRUKSI
  ("Pilih kapan iklanmu tayang", "Selesaikan pembayaran"). Tidak satu pun
  menyatakan posisi, jadi peneliti yang mendarat dari link admin — 31 order
  produksi — tidak punya cara tahu ia sedang di tahap mana dari perjalanan yang
  belum pernah ia mulai.

  Yang dikunci di sini bukan kata-katanya (itu milik i18n), melainkan PEMETAAN
  keadaan → judul. Tiga aturan yang mudah dilanggar saat menambah keadaan baru:
  dua segmen bayar wajib sekata, perpanjangan wajib memakai ordinal nyata, dan
  tidak boleh ada penomoran langkah.
*/

const stateOf = (over: Partial<SegmentState> = {}): SegmentState => ({
  phase: 'reservation',
  ordinal: 1,
  ...over,
});

describe('segmentTitleOf — pemetaan keadaan', () => {
  it('detail → segmentDetail', () => {
    expect(segmentTitleOf(stateOf({ phase: 'detail' })).key).toBe('segmentDetail');
  });

  it('menunggu jadwal admin → segmentAwaitingSchedule', () => {
    // 21 order produksi: approved TAPI belum bertanggal. Bukan review (sudah
    // selesai), bukan reservasi (bukan peneliti yang memilih).
    expect(segmentTitleOf(stateOf({ phase: 'awaiting_schedule' })).key)
      .toBe('segmentAwaitingSchedule');
  });

  it('reservasi ordinal 1 → segmentReservation, TANPA nomor', () => {
    const v = segmentTitleOf(stateOf({ phase: 'reservation', ordinal: 1 }));
    expect(v.key).toBe('segmentReservation');
    expect(v.vars).toBeUndefined();
  });

  it('bayar → segmentPayment', () => {
    expect(segmentTitleOf(stateOf({ phase: 'payment' })).key).toBe('segmentPayment');
  });

  it('kedaluwarsa → segmentReservationReleased', () => {
    // Tanpa judul tersendiri, layar ini tampak IDENTIK dengan pilih-tanggal —
    // padahal artinya jauh berbeda: tanggal sebelumnya sudah hilang.
    expect(segmentTitleOf(stateOf({ phase: 'released' })).key)
      .toBe('segmentReservationReleased');
  });
});

describe('segmentTitleOf — dua jalur bayar WAJIB sekata', () => {
  it('bayar jalur peneliti dan jalur admin memakai judul yang SAMA', () => {
    /*
      ⚠️ Tempatnya memang satu; yang berbeda cuma cara sampai ke sana
      (peneliti memesan sendiri vs admin menjadwalkan). Nama berbeda akan
      membuat peneliti mengira ada dua jenis pembayaran.
    */
    const peneliti = segmentTitleOf(stateOf({ phase: 'payment', bookedBy: 'user' }));
    const admin = segmentTitleOf(stateOf({ phase: 'payment', bookedBy: 'admin' }));
    expect(peneliti.key).toBe(admin.key);
  });
});

describe('segmentTitleOf — ⚠️ nomor jadwal TIDAK ikut ke judul', () => {
  /*
    Keputusan pemilik produk 2026-09-17: judul reservasi berbunyi SAMA untuk
    jadwal pertama maupun kesepuluh.

    Ordinal menjawab pertanyaan yang tidak sedang diajukan peneliti — ia datang
    dari kartu ordernya sendiri dan Booking ID tercetak persis di atas judul.
    Yang tersisa cuma cara kita menghitung, bocor ke layarnya.
  */
  it('perpanjangan memakai judul yang SAMA dengan jadwal pertama', () => {
    const pertama = segmentTitleOf(stateOf({ phase: 'reservation', ordinal: 1 }));
    const kedua = segmentTitleOf(stateOf({ phase: 'reservation', ordinal: 2 }));
    expect(kedua.key).toBe(pertama.key);
    expect(kedua.vars).toBeUndefined();
  });

  it('ordinal setinggi apa pun tidak memunculkan nomor', () => {
    for (const n of [2, 5, 10]) {
      const v = segmentTitleOf(stateOf({ phase: 'reservation', ordinal: n }));
      expect(v.key).toBe('segmentReservation');
      expect(v.vars).toBeUndefined();
    }
  });

  it('kedaluwarsa pada perpanjangan TIDAK jadi "Ke-n" — ia tetap "Dilepas"', () => {
    // Yang perlu diketahui peneliti di layar itu adalah tanggalnya hilang,
    // bukan nomor jadwalnya.
    const v = segmentTitleOf(stateOf({ phase: 'released', ordinal: 3 }));
    expect(v.key).toBe('segmentReservationReleased');
  });

  it('bayar pada perpanjangan tetap "Pembayaran" polos', () => {
    const v = segmentTitleOf(stateOf({ phase: 'payment', ordinal: 3 }));
    expect(v.key).toBe('segmentPayment');
    expect(v.vars).toBeUndefined();
  });
});

describe('segmentTitleOf — nol penomoran langkah', () => {
  it('tidak ada kunci yang memuat "step" atau "langkah"', () => {
    /*
      ⚠️ Segmen jalur admin tidak pernah menempuh langkah 1–2 (jadwalnya sudah
      ditetapkan), dan perpanjangan bukan bagian wizard. Penomoran langkah cuma
      membuat mereka mencari langkah yang tidak ada.
    */
    const semua: SegmentState[] = [
      stateOf({ phase: 'detail' }),
      stateOf({ phase: 'awaiting_schedule' }),
      stateOf({ phase: 'reservation', ordinal: 1 }),
      stateOf({ phase: 'reservation', ordinal: 2 }),
      stateOf({ phase: 'payment' }),
      stateOf({ phase: 'released' }),
    ];
    for (const st of semua) {
      const k = segmentTitleOf(st).key.toLowerCase();
      expect(k).not.toContain('step');
      expect(k).not.toContain('langkah');
    }
  });
});
