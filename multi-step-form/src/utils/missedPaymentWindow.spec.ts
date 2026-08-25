import { describe, it, expect } from 'vitest';
import { missedPaymentWindow } from './missedPaymentWindow';

/** 2026-09-03, 16.00 WIB (09:00Z) — sesudah cutoff bayar 14.00 WIB. */
const AFTER_CUTOFF = new Date('2026-09-03T09:00:00Z');
/** 2026-09-03, 10.00 WIB (03:00Z) — sebelum cutoff. */
const BEFORE_CUTOFF = new Date('2026-09-03T03:00:00Z');

const waiting = (startDate: string) => ({
  startDate,
  submissionStatus: 'waiting_payment',
  paymentStatus: 'pending',
});

describe('missedPaymentWindow', () => {
  it('menandai jadwal HARI INI yang lewat 14.00 WIB', () => {
    expect(missedPaymentWindow(waiting('2026-09-03'), AFTER_CUTOFF)).toBe(true);
  });

  it('TIDAK menandai jadwal hari ini yang masih sebelum 14.00 WIB', () => {
    expect(missedPaymentWindow(waiting('2026-09-03'), BEFORE_CUTOFF)).toBe(false);
  });

  it('menandai jadwal yang tanggalnya sudah lampau', () => {
    expect(missedPaymentWindow(waiting('2026-08-30'), BEFORE_CUTOFF)).toBe(true);
  });

  it('TIDAK menandai jadwal di masa depan', () => {
    expect(missedPaymentWindow(waiting('2026-09-10'), AFTER_CUTOFF)).toBe(false);
  });

  it('order LUNAS tidak pernah ditandai meski tanggalnya lampau', () => {
    // Mayoritas arsip adalah order lunas bertanggal lampau. Penanda yang menyala
    // untuk mereka sama tak bergunanya dengan tidak ada penanda.
    expect(missedPaymentWindow(
      { startDate: '2026-08-01', submissionStatus: 'completed', paymentStatus: 'paid' },
      AFTER_CUTOFF,
    )).toBe(false);
  });

  it('order yang dibatalkan/spam tidak ditandai', () => {
    for (const st of ['cancelled', 'spam', 'rejected', 'slot_cancelled']) {
      expect(missedPaymentWindow(
        { startDate: '2026-08-01', submissionStatus: st, paymentStatus: 'pending' },
        AFTER_CUTOFF,
      )).toBe(false);
    }
  });

  it('order tanpa tanggal tidak ditandai — tidak ada yang bisa terlambat', () => {
    expect(missedPaymentWindow(
      { startDate: null, submissionStatus: 'waiting_payment', paymentStatus: 'pending' },
      AFTER_CUTOFF,
    )).toBe(false);
  });

  it('order in_review/approved tidak ditandai walau bertanggal lampau', () => {
    // Tanggalnya belum mengikat: order jalur manual boleh punya tanggal warisan
    // tanpa pernah menjadi reservasi sah.
    expect(missedPaymentWindow(
      { startDate: '2026-08-01', submissionStatus: 'in_review', paymentStatus: 'pending' },
      AFTER_CUTOFF,
    )).toBe(false);
  });

  it('TIMESTAMPTZ 00.00 WIB tidak dimundurkan sehari', () => {
    // 2026-09-04 00.00 WIB = 2026-09-03T17:00Z. Memotong 10 karakter pertama
    // memberi '2026-09-03' — tanggal KEMARIN — dan akan menandai order yang
    // sebenarnya masih punya satu hari penuh.
    expect(missedPaymentWindow(
      { startDate: '2026-09-03T17:00:00Z', submissionStatus: 'waiting_payment', paymentStatus: 'pending' },
      AFTER_CUTOFF,
    )).toBe(false);
  });

  it('TIMESTAMPTZ 15.00 WIB hari ini tetap tertandai sesudah cutoff', () => {
    expect(missedPaymentWindow(
      { startDate: '2026-09-03T08:00:00Z', submissionStatus: 'waiting_payment', paymentStatus: 'pending' },
      AFTER_CUTOFF,
    )).toBe(true);
  });
});
