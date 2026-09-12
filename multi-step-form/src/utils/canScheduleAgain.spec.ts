import { describe, it, expect } from 'vitest';
import { canScheduleAgain, scheduleAgainBlock } from './canScheduleAgain';
import type { AdScheduleEntry } from './supabase';

/*
  Gerbang tombol "Jadwalkan Iklan Lagi".

  ⚠️ DIUKUR DARI KUOTA, BUKAN DARI TAGIHAN. Jadwal `waiting_payment` yang
  belum dibayar TETAP memakan kuota harian (assert_daily_ad_quota_free kaki 2
  menghitung status, bukan pembayaran). Kalau gerbang ini memakai "ada tagihan
  hidup", peneliti bisa menumpuk jadwal waiting_payment tanpa tagihan di
  tanggal-tanggal berbeda dan menghabiskan kapasitas peneliti lain.
*/

const HOUR = 3_600_000;
const NOW = Date.parse('2026-09-12T10:00:00+07:00');

const entryOf = (over: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 'sch-1',
  submissionId: 'sub-1',
  ordinal: 1,
  isExtension: false,
  bookingId: 'K3M9PQ7T',
  sourceId: 'src-1',
  startDate: '2026-09-20T08:00:00Z',
  endDate: '2026-09-27T08:00:00Z',
  duration: 7,
  status: 'waiting_payment',
  reviewStatus: 'approved',
  paymentStatus: null,
  distributionType: 'ads',
  kilatSlotHour: null,
  totalCost: 100000,
  subtotal: null,
  ppnAmount: null,
  voucherCode: null,
  prizePerWinner: 0,
  winnerCount: 0,
  additionalPrizePerWinner: 0,
  isNewPeriod: false,
  periodBatch: null,
  slotBookedBy: null,
  slotReservedAt: null,
  title: 'Uji',
  researcherName: 'Uji',
  university: null,
  submissionCreatedAt: '2026-09-01T00:00:00Z',
  ...over,
} as AdScheduleEntry);

const orderOf = (over: Partial<{ distribution_type: string; submission_status: string }> = {}) => ({
  distribution_type: 'ads',
  submission_status: 'approved',
  ...over,
}) as any;

describe('canScheduleAgain', () => {
  it('order approved tanpa jadwal yang menahan kuota → boleh', () => {
    const selesai = entryOf({ status: 'completed', paymentStatus: 'paid' });
    expect(canScheduleAgain(orderOf(), [selesai], NOW)).toBe(true);
    expect(scheduleAgainBlock(orderOf(), [selesai], NOW)).toBeNull();
  });

  it('order Kilat → tidak pernah boleh', () => {
    expect(canScheduleAgain(orderOf({ distribution_type: 'kilat' }), [], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf({ distribution_type: 'kilat' }), [], NOW)).toBe('kilat');
  });

  it('order in_review → tidak boleh (kasus pemicu spec ini)', () => {
    expect(canScheduleAgain(orderOf({ submission_status: 'in_review' }), [], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf({ submission_status: 'in_review' }), [], NOW)).toBe('order_inactive');
  });

  it('order slot_cancelled → tidak boleh, meski sumbu review-nya approved', () => {
    expect(canScheduleAgain(orderOf({ submission_status: 'slot_cancelled' }), [], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf({ submission_status: 'slot_cancelled' }), [], NOW)).toBe('order_inactive');
  });

  /*
    ⚠️ TES YANG MEMBEDAKAN GERBANG KUOTA DARI GERBANG TAGIHAN.
    Jadwal ini TIDAK punya tagihan sama sekali. Gerbang berbasis "tagihan
    hidup" akan meloloskannya; gerbang kuota harus menolak.
  */
  it('jadwal waiting_payment TANPA tagihan apa pun → tetap menahan kuota, tidak boleh', () => {
    const menahan = entryOf({ status: 'waiting_payment', paymentStatus: null });
    expect(canScheduleAgain(orderOf(), [menahan], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf(), [menahan], NOW)).toBe('quota_held');
  });

  it('jadwal dibatalkan tidak menahan kuota → boleh lagi', () => {
    const batal = entryOf({ status: 'cancelled' });
    expect(canScheduleAgain(orderOf(), [batal], NOW)).toBe(true);
  });

  it('hold peneliti yang sudah basi (>1 jam) tidak lagi menahan kuota', () => {
    const basi = entryOf({
      status: 'waiting_payment',
      slotBookedBy: 'user',
      slotReservedAt: new Date(NOW - 2 * HOUR).toISOString(),
    });
    expect(canScheduleAgain(orderOf(), [basi], NOW)).toBe(true);
  });

  it('hold ADMIN tidak pernah basi — tetap menahan kuota selamanya', () => {
    const adminHold = entryOf({
      status: 'waiting_payment',
      slotBookedBy: 'admin',
      slotReservedAt: new Date(NOW - 2 * HOUR).toISOString(),
    });
    expect(canScheduleAgain(orderOf(), [adminHold], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf(), [adminHold], NOW)).toBe('quota_held');
  });

  it('jadwal LUNAS yang masih tayang tidak memblokir jadwal berikutnya', () => {
    const lunas = entryOf({ status: 'paid', paymentStatus: 'paid' });
    expect(canScheduleAgain(orderOf(), [lunas], NOW)).toBe(true);
  });

  it('order Kilat menang atas sebab lain (presedens)', () => {
    const menahan = entryOf({ status: 'waiting_payment' });
    expect(scheduleAgainBlock(orderOf({ distribution_type: 'kilat' }), [menahan], NOW)).toBe('kilat');
  });
});
