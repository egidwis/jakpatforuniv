import { describe, it, expect } from 'vitest';
import {
  entryInPeriod,
  computeAlerts,
  paidPageNotReachable,
  needsBannerSwap,
} from './scheduleModel';
import type { AdScheduleEntry } from '@/utils/supabase';

function makeEntry(partial: Partial<AdScheduleEntry>): AdScheduleEntry {
  return {
    id: 'test-id',
    submissionId: 'sub-id',
    ordinal: 1,
    isExtension: false,
    bookingId: 'BK123456',
    sourceId: 'src-id',
    startDate: null,
    endDate: null,
    duration: null,
    status: 'scheduled',
    reviewStatus: 'approved',
    paymentStatus: 'paid',
    distributionType: 'regular',
    kilatSlotHour: null,
    totalCost: 100000,
    subtotal: 100000,
    ppnAmount: 0,
    voucherCode: null,
    prizePerWinner: 10000,
    winnerCount: 10,
    additionalPrizePerWinner: 0,
    isNewPeriod: false,
    periodBatch: null,
    slotBookedBy: null,
    slotReservedAt: null,
    title: 'Test Survey',
    researcherName: 'Researcher',
    university: 'UI',
    submissionCreatedAt: '2026-09-01T10:00:00Z',
    createdAt: '2026-09-01T10:00:00Z',
    pageId: 'page-1',
    pageSlug: 'test-slug',
    pageBannerUrl: '/banner.jpg',
    pageBannerIsPlaceholder: false,
    pageStatus: 'published',
    ...partial,
  };
}

describe('entryInPeriod', () => {
  const sept2026Window = {
    fromYmd: '2026-09-01',
    toYmd: '2026-09-30',
  };
  const oct2026Window = {
    fromYmd: '2026-10-01',
    toYmd: '2026-10-31',
  };

  it('mengembalikan true jika Semua Bulan (-1) atau window null', () => {
    const entry = makeEntry({ startDate: '2026-09-10T08:00:00Z', endDate: '2026-09-14T08:00:00Z' });
    expect(entryInPeriod(entry, -1, 2026, null)).toBe(true);
  });

  it('mengembalikan true untuk jadwal yang tayang di bulan September 2026', () => {
    const entry = makeEntry({ startDate: '2026-09-08T08:00:00Z', endDate: '2026-09-14T08:00:00Z' });
    expect(entryInPeriod(entry, 8, 2026, sept2026Window)).toBe(true);
    expect(entryInPeriod(entry, 9, 2026, oct2026Window)).toBe(false);
  });

  it('mengembalikan true untuk jadwal lintas bulan (mis. 28 Agustus - 3 September)', () => {
    const entry = makeEntry({ startDate: '2026-08-28T08:00:00Z', endDate: '2026-09-03T08:00:00Z' });
    expect(entryInPeriod(entry, 8, 2026, sept2026Window)).toBe(true);
  });

  it('memeriksa tanggal order dibuat untuk entri yang belum dijadwalkan', () => {
    const unscheduledSept = makeEntry({
      startDate: null,
      endDate: null,
      status: 'unscheduled',
      submissionCreatedAt: '2026-09-05T09:00:00Z',
    });
    const unscheduledAug = makeEntry({
      startDate: null,
      endDate: null,
      status: 'unscheduled',
      submissionCreatedAt: '2026-08-15T09:00:00Z',
    });

    expect(entryInPeriod(unscheduledSept, 8, 2026, sept2026Window)).toBe(true);
    expect(entryInPeriod(unscheduledAug, 8, 2026, sept2026Window)).toBe(false);
  });
});

describe('computeAlerts & indicator chips', () => {
  it('menghitung halaman belum bisa dibuka (paidPageNotReachable)', () => {
    const e1 = makeEntry({
      status: 'paid',
      pageStatus: 'none',
      startDate: '2026-09-10T08:00:00Z',
      endDate: '2026-09-14T08:00:00Z',
    });
    const e2 = makeEntry({
      status: 'paid',
      pageStatus: 'draft',
      startDate: '2026-09-10T08:00:00Z',
      endDate: '2026-09-14T08:00:00Z',
    });
    const e3 = makeEntry({
      status: 'paid',
      pageStatus: 'published',
      startDate: '2026-09-10T08:00:00Z',
      endDate: '2026-09-14T08:00:00Z',
    });

    expect(paidPageNotReachable(e1)).toBe(true);
    expect(paidPageNotReachable(e2)).toBe(true);
    expect(paidPageNotReachable(e3)).toBe(false);

    const alerts = computeAlerts([e1, e2, e3]);
    expect(alerts.paidWithoutPage).toBe(2);
  });

  it('menghitung banner bawaan (needsBannerSwap)', () => {
    const e1 = makeEntry({
      pageStatus: 'published',
      pageBannerIsPlaceholder: true,
      startDate: '2026-09-10T08:00:00Z',
      endDate: '2026-09-14T08:00:00Z',
    });
    const e2 = makeEntry({
      pageStatus: 'published',
      pageBannerIsPlaceholder: false,
      startDate: '2026-09-10T08:00:00Z',
      endDate: '2026-09-14T08:00:00Z',
    });

    expect(needsBannerSwap(e1)).toBe(true);
    expect(needsBannerSwap(e2)).toBe(false);

    const alerts = computeAlerts([e1, e2]);
    expect(alerts.placeholderBanner).toBe(1);
  });
});
