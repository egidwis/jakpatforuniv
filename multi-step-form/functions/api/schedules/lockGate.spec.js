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
