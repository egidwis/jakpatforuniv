import { describe, it, expect } from 'vitest';
import { schedulePageState } from './schedulePageState';
import type { PageSubject } from './schedulePageState';

/*
  Layar mana yang ditampilkan halaman per-jadwal — dipilih dari DATA, bukan
  dari jalur review yang ditempuh dulu.

  ⚠️ KENAPA DARI DATA. Admin bisa menjadwalkan order mana pun kapan saja, jadi
  "peneliti memesan sendiri" vs "admin menjadwalkan" adalah properti KEADAAN
  SEKARANG, bukan riwayat. Memilih layar dari riwayat membuat order yang baru
  saja dijadwalkan admin tetap menampilkan kalender kosong.

  ⚠️ COUNTDOWN ADALAH BAHAYA UTAMA DI SINI. Hold 1 jam hanya berlaku untuk
  `slot_booked_by='user'` (`slotHold.ts`); jadwal admin tidak pernah lepas
  sendiri. Menampilkan timer untuk mereka = 31 peneliti produksi melihat hitung
  mundur yang berbohong, dan sebagian akan mengira tanggalnya hangus.
*/

const subjectOf = (over: Partial<PageSubject> = {}): PageSubject => ({
  startDate: '2026-12-20T08:00:00Z',
  slotBookedBy: 'user',
  paymentStatus: 'pending',
  status: 'slot_reserved',
  slotReservedAt: new Date().toISOString(),
  ...over,
});

describe('schedulePageState — pemilihan layar', () => {
  it('belum bertanggal → PILIH TANGGAL', () => {
    const s = schedulePageState(subjectOf({ startDate: null }));
    expect(s.screen).toBe('pick');
  });

  it('sudah bertanggal + belum lunas → MENUNGGU BAYAR', () => {
    expect(schedulePageState(subjectOf()).screen).toBe('awaiting_payment');
  });

  it('lunas → SELESAI', () => {
    expect(schedulePageState(subjectOf({ paymentStatus: 'paid' })).screen).toBe('settled');
  });

  it('dibatalkan → RESERVASI DILEPAS', () => {
    const s = schedulePageState(subjectOf({ status: 'cancelled' }));
    expect(s.screen).toBe('released');
  });

  it('payment_status expired → RESERVASI DILEPAS', () => {
    // `releaseExpiredSlot` mengosongkan `slot_booked_by`, jadi aturan hold
    // memulangkan "tidak pernah lepas" untuk baris yang justru SUDAH lepas.
    // `payment_status` yang menyimpan faktanya — pola yang sama dipakai
    // PaymentRetryPage & PaymentCheckoutPage.
    const s = schedulePageState(subjectOf({ paymentStatus: 'expired' }));
    expect(s.screen).toBe('released');
  });
});

describe('schedulePageState — ⚠️ countdown', () => {
  it('jadwal ADMIN bertanggal: layar bayar TANPA countdown', () => {
    /*
      Segmen 3 — 31 order produksi. Keadaan ① dilewati (jadwalnya sudah
      bertanggal) dan timernya DILARANG.
    */
    const s = schedulePageState(subjectOf({ slotBookedBy: 'admin' }));
    expect(s.screen).toBe('awaiting_payment');
    expect(s.showCountdown).toBe(false);
  });

  it('baris lama tanpa slot_booked_by juga TANPA countdown', () => {
    // 264 baris warisan; cabang lama menghapusnya SEKETIKA tanpa timer.
    for (const by of [null, undefined, '']) {
      expect(schedulePageState(subjectOf({ slotBookedBy: by })).showCountdown).toBe(false);
    }
  });

  it('jadwal PENELITI bertanggal: countdown TAMPIL', () => {
    const s = schedulePageState(subjectOf({ slotBookedBy: 'user' }));
    expect(s.showCountdown).toBe(true);
  });

  it('`slot_reserved_at` kosong → tidak ada countdown meski user', () => {
    // Tanpa titik mulai, tenggatnya tidak bisa dihitung — `slotReleaseDeadline`
    // memulangkan null, dan null berarti "tidak pernah lepas sendiri".
    const s = schedulePageState(subjectOf({ slotReservedAt: null }));
    expect(s.showCountdown).toBe(false);
  });

  it('layar SELAIN menunggu-bayar tidak pernah punya countdown', () => {
    for (const over of [
      { startDate: null },
      { paymentStatus: 'paid' },
      { status: 'cancelled' },
    ]) {
      expect(schedulePageState(subjectOf(over)).showCountdown).toBe(false);
    }
  });
});

describe('schedulePageState — pembatalan mandiri', () => {
  it('hanya reservasi PENELITI yang boleh dibatalkan sendiri', () => {
    expect(schedulePageState(subjectOf({ slotBookedBy: 'user' })).canCancel).toBe(true);
  });

  it('jadwal ADMIN: tanpa tombol batalkan — itu keputusan tim', () => {
    expect(schedulePageState(subjectOf({ slotBookedBy: 'admin' })).canCancel).toBe(false);
  });

  it('jadwal LUNAS tidak bisa dibatalkan dari layar ini', () => {
    expect(schedulePageState(subjectOf({ paymentStatus: 'paid' })).canCancel).toBe(false);
  });
});
