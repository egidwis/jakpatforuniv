import { describe, expect, it } from 'vitest';
import { deriveLifecycle, isReviewDecisionLocked } from './lifecycle';
import type { ExistingPage, PaymentState, SurveySubmission } from './types';

/*
  D1 — kebuntuan Review ⇄ Jadwal & Bayar, order 08ef25ac ("asda").

  Bentuk datanya diambil dari produksi 23 Sep 2026: order di-reset ke review,
  tagihannya sudah mati, dan halamannya TERBIT + DISEMBUNYIKAN + TANPA TANGGAL
  (sisa pelunasan manual yang dibatalkan). Halaman itu dulu terbaca `live`,
  Review terkunci, dan tab Jadwal menyuruh kembali ke Review.
*/

const NOW = Date.parse('2026-09-23T06:30:00Z');

const asda = {
  id: '08ef25ac-6fe3-4df1-b62c-9562446c6635',
  status: 'in_review',
  submission_status: 'in_review',
  payment_status: 'expired',
  start_date: '2026-09-22',
  end_date: '2026-09-27',
  slot_booked_by: null,
  slot_reserved_at: null,
  distribution_type: 'regular',
} as unknown as SurveySubmission;

const deadBill: PaymentState = {
  hasInvoices: true,
  hasOpenInvoice: false,
  latestStatus: 'expired',
  invoiceCount: 4,
  latestPaymentUrl: null,
  hasEverPaid: false,
};

const page = (over: Partial<ExistingPage> = {}): ExistingPage => ({
  id: '694ae172-4da4-4124-84c6-020cda9b2990',
  slug: 'asda',
  is_published: true,
  publish_start_date: null,
  publish_end_date: null,
  ...over,
});

describe('deriveLifecycle — halaman yang tidak sedang tayang', () => {
  it('kasus "asda": halaman terbit tersembunyi tanpa tanggal → BUKAN live, Review tidak terkunci', () => {
    const lc = deriveLifecycle(asda, deadBill, page({ is_hidden: true }), true, NOW);
    expect(lc.pageStatus).toBe('hidden');
    expect(lc.stage).not.toBe('live');
    expect(lc.stage).toBe('reserved_expired');
    expect(isReviewDecisionLocked(lc)).toBe(false);
  });

  it('halaman terbit TIDAK tersembunyi tetap live', () => {
    const lc = deriveLifecycle(asda, deadBill, page(), true, NOW);
    expect(lc.pageStatus).toBe('live');
    expect(lc.stage).toBe('live');
  });

  it('jendela ditutup sistem (sql/99) → auto_closed, BUKAN completed', () => {
    const lc = deriveLifecycle(
      asda,
      deadBill,
      page({
        publish_start_date: '2026-09-22T08:00:00Z',
        publish_end_date: '2026-09-21T06:13:00Z',
        auto_closed_at: '2026-09-21T06:13:00Z',
      }),
      true,
      NOW,
    );
    expect(lc.pageStatus).toBe('auto_closed');
    expect(lc.stage).not.toBe('completed');
    expect(isReviewDecisionLocked(lc)).toBe(false);
  });

  it('jendela yang berakhir normal tetap completed', () => {
    const lc = deriveLifecycle(
      asda,
      deadBill,
      page({ publish_start_date: '2026-09-10T08:00:00Z', publish_end_date: '2026-09-15T08:00:00Z' }),
      true,
      NOW,
    );
    expect(lc.pageStatus).toBe('completed');
  });
});

describe('isReviewDecisionLocked — invarian', () => {
  it('menunggu review & belum lunas: TIDAK PERNAH terkunci, apa pun stage-nya', () => {
    for (const stage of ['live', 'completed', 'page_scheduled', 'reserved', 'awaiting_payment'] as const) {
      expect(isReviewDecisionLocked({ stage, displayStatus: 'in_review', isPaid: false })).toBe(false);
    }
  });

  it('order lunas yang sedang tayang tetap terkunci', () => {
    expect(isReviewDecisionLocked({ stage: 'live', displayStatus: 'approved', isPaid: true })).toBe(true);
    expect(isReviewDecisionLocked({ stage: 'paid', displayStatus: 'in_review', isPaid: true })).toBe(true);
  });

  it('order batal tidak terkunci (Reset tetap tersedia)', () => {
    expect(isReviewDecisionLocked({ stage: 'cancelled', displayStatus: 'slot_cancelled', isPaid: false })).toBe(false);
  });
});
