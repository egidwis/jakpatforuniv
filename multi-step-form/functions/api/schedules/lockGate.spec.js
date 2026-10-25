import { describe, expect, it } from 'vitest';
import { bookingClosed, lockInstants, lockPatch, selfBookingBlock, validateLock } from './lockGate.js';

const id = 'b7eb61ca-079a-4787-9787-be253b0a1111';

describe('validateLock', () => {
  it('meloloskan kunci tanggal', () => {
    expect(validateLock({ submissionId: id, startYmd: '2026-10-24', duration: 2 })).toBeNull();
  });

  it('menolak status pembayaran dari browser', () => {
    expect(validateLock({
      submissionId: id,
      startYmd: '2026-10-24',
      duration: 2,
      paymentStatus: 'paid',
    })).toMatch(/pembayaran/);
  });
});

describe('lockPatch', () => {
  const now = new Date('2026-10-21T02:00:00.000Z');

  it('menulis menunggu bayar pada jam 15.00 WIB, bukan status lunas', () => {
    const result = lockPatch(
      { payment_status: 'pending', submission_status: 'approved', duration: 2 },
      { startYmd: '2026-10-24', duration: 1 },
      now,
    );
    expect(result.patch).toMatchObject({
      start_date: '2026-10-24T08:00:00.000Z',
      end_date: '2026-10-26T08:00:00.000Z',
      slot_booked_by: 'user',
      submission_status: 'waiting_payment',
      payment_status: 'pending',
    });
    expect(lockInstants('2026-10-24', 2).start).toBe('2026-10-24T08:00:00.000Z');
  });

  it('menolak order yang sudah lunas dan tanggal yang sudah lewat', () => {
    expect(lockPatch(
      { payment_status: 'paid', submission_status: 'approved', duration: 2 },
      { startYmd: '2026-10-24', duration: 2 },
      now,
    ).error).toMatch(/lunas/);
    expect(bookingClosed('2026-10-20', now)).toBe(true);
    expect(lockPatch(
      { payment_status: 'pending', submission_status: 'approved', duration: 1 },
      { startYmd: '2026-10-20', duration: 1 },
      now,
    ).error).toMatch(/13\.00/);
  });
});

describe('validateAction (satu pintu jadwal, sql/123)', () => {
  const lock = { submissionId: id, startYmd: '2026-10-24', duration: 1 };

  it('action kosong = lock, supaya klien lama tetap jalan', async () => {
    const { actionOf, validateAction } = await import('./lockGate.js');
    expect(actionOf(lock)).toBe('lock');
    expect(validateAction(lock)).toBeNull();
  });

  it('lock Kilat: hanya jam 11 atau 15', async () => {
    const { validateAction } = await import('./lockGate.js');
    expect(validateAction({ ...lock, kilatHour: 15 })).toBeNull();
    expect(validateAction({ ...lock, kilatHour: 13 })).toMatch(/Gelombang/);
    expect(validateAction({ ...lock, kilatHour: '15' })).toMatch(/Gelombang/);
  });

  it('extend: instant, durasi, hadiah, batch wajib berbentuk benar', async () => {
    const { validateAction } = await import('./lockGate.js');
    const ext = {
      action: 'extend', submissionId: id,
      startDate: '2026-10-24T08:00:00.000Z', endDate: '2026-10-25T08:00:00.000Z',
      duration: 1, prizePerWinner: 0, winnerCount: 0, isNewPeriod: false,
    };
    expect(validateAction(ext)).toBeNull();
    expect(validateAction({ ...ext, endDate: ext.startDate })).toMatch(/Tanggal/);
    expect(validateAction({ ...ext, startDate: '2026-10-24' })).toMatch(/Tanggal/);
    expect(validateAction({ ...ext, duration: 0 })).toMatch(/Durasi/);
    expect(validateAction({ ...ext, winnerCount: -1 })).toMatch(/Hadiah/);
    expect(validateAction({ ...ext, isNewPeriod: 'ya' })).toMatch(/Batch/);
  });

  it('release & cancel; status pembayaran dan tindakan asing ditolak', async () => {
    const { validateAction } = await import('./lockGate.js');
    expect(validateAction({ action: 'release', submissionId: id })).toBeNull();
    expect(validateAction({ action: 'cancel', submissionId: id, sourceId: id, isExtension: false })).toBeNull();
    expect(validateAction({ action: 'cancel', submissionId: id, sourceId: 'x', isExtension: false })).toMatch(/Jadwal/);
    expect(validateAction({ action: 'cancel', submissionId: id, sourceId: id })).toMatch(/Jadwal/);
    expect(validateAction({ action: 'release', submissionId: id, paymentStatus: 'paid' })).toMatch(/pembayaran/);
    expect(validateAction({ action: 'mark-paid', submissionId: id })).toMatch(/Tindakan/);
  });
});

describe('lockRoute', () => {
  it('bentuk kunci harus cocok dengan produknya', async () => {
    const { lockRoute } = await import('./lockGate.js');
    expect(lockRoute({ distribution_type: 'kilat' }, { kilatHour: 11 })).toEqual({ kind: 'kilat' });
    expect(lockRoute({ distribution_type: 'kilat' }, {}).error).toMatch(/gelombang/);
    expect(lockRoute({ distribution_type: 'regular' }, {})).toEqual({ kind: 'iklan' });
    expect(lockRoute({ distribution_type: null }, {})).toEqual({ kind: 'iklan' });
    expect(lockRoute({ distribution_type: 'regular' }, { kilatHour: 15 }).error).toMatch(/bukan Kilat/);
  });
});

describe('selfBookingBlock (sql/125, tutup reservasi mandiri)', () => {
  it('saklar terbuka & order tanpa cap: lolos', () => {
    expect(selfBookingBlock({ self_booking_closed_at: null }, false)).toBeNull();
  });

  it('saklar tertutup: semua kunci peneliti ditolak dengan kode', () => {
    expect(selfBookingBlock({ self_booking_closed_at: null }, true)).toMatchObject({ code: 'self_booking_closed' });
  });

  it('order bercap: ditolak walau saklar sudah dibuka lagi', () => {
    const block = selfBookingBlock({ self_booking_closed_at: '2026-10-22T03:00:00Z' }, false);
    expect(block).toMatchObject({ code: 'self_booking_closed' });
    expect(block.error).toMatch(/tim Jakpat/);
  });
});
