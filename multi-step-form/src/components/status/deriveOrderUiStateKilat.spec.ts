import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { deriveOrderUiState } from './deriveOrderUiState';
import type { AdScheduleEntry, FormSubmission } from '@/utils/supabase';

/*
  Dashboard peneliti untuk order Kilat (Phase 5 §5.7, R6): batas bayar yang
  disebut dan keadaan "lewat batas" memakai gelombang − 60 menit, bukan
  14.00 WIB. Jalur yang sama dengan Iklan; yang beda hanya masukan batasnya.
*/

// Senin 19 Okt 2026, gelombang 11.00 WIB (04:00Z) → batas bayar 10.00 (03:00Z).
const WAVE = '2026-10-19T04:00:00.000Z';

const entry = (o: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 's1', submissionId: 'o1', ordinal: 1, isExtension: false, bookingId: 'KKKK1111',
  sourceId: 'o1', startDate: WAVE, endDate: '2026-10-20T04:00:00.000Z',
  duration: 1, status: 'requested', reviewStatus: 'approved', paymentStatus: 'pending',
  distributionType: 'kilat', kilatSlotHour: 11, totalCost: 499_500, subtotal: 450_000,
  ppnAmount: 49_500, voucherCode: null, prizePerWinner: 25_000, winnerCount: 2,
  additionalPrizePerWinner: 0, isNewPeriod: true, periodBatch: null, createdAt: null,
  slotBookedBy: 'admin', slotReservedAt: null, title: 'K', researcherName: 'R',
  airOnCreditAt: null, airOnCreditNote: null,
  ...o,
} as unknown as AdScheduleEntry);

const sub = {
  id: 'o1', title: 'Survei Kilat', distribution_type: 'kilat',
  submission_status: 'slot_reserved', payment_status: 'pending', slot_booked_by: 'admin',
  created_at: '2026-10-18T03:00:00Z',
} as unknown as FormSubmission;

describe('deriveOrderUiState — Kilat', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('09.59 WIB: belum terlambat', () => {
    vi.setSystemTime(new Date('2026-10-19T02:59:00Z'));
    expect(deriveOrderUiState(sub, [entry()]).isTooLateToday).toBe(false);
  });

  it('10.00.01 WIB: terlambat — empat jam sebelum batas Iklan 14.00', () => {
    vi.setSystemTime(new Date('2026-10-19T03:00:01Z'));
    const ui = deriveOrderUiState(sub, [entry()]);
    expect(ui.isTooLateToday).toBe(true);
    expect(ui.callout).toBe('too_late_today');
  });

  it('reservasi mandiri: batas yang disebut = hold bila lebih awal dari batas gelombang', () => {
    vi.setSystemTime(new Date('2026-10-19T01:40:00Z'));
    const own = entry({ slotBookedBy: 'user', slotReservedAt: '2026-10-19T01:30:00Z' });
    const ui = deriveOrderUiState({ ...sub, slot_booked_by: 'user', slot_reserved_at: '2026-10-19T01:30:00Z' } as FormSubmission, [own]);
    expect(ui.paymentDeadline?.toISOString()).toBe('2026-10-19T02:30:00.000Z');
    expect(ui.paymentDeadlineCause).toBe('slot');
  });
});
