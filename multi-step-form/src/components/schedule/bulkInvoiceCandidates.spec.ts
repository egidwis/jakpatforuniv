import { describe, it, expect } from 'vitest';
import { distinctAccounts, planBulkInvoice } from './bulkInvoiceCandidates';
import type { AdScheduleEntry, ScheduleBilling } from '@/utils/supabase';

const entry = (o: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 's1', submissionId: 'o1', ordinal: 1, isExtension: false, bookingId: 'AAAA1111',
  sourceId: 'o1', startDate: '2026-12-10T08:00:00Z', endDate: '2026-12-17T08:00:00Z',
  duration: 7, status: 'slot_reserved', reviewStatus: 'approved', paymentStatus: 'pending',
  distributionType: 'regular', kilatSlotHour: null, totalCost: 0, subtotal: null,
  ppnAmount: null, voucherCode: null, prizePerWinner: 0, winnerCount: 0,
  additionalPrizePerWinner: 0, isNewPeriod: false, periodBatch: null, createdAt: null,
  slotBookedBy: 'admin', slotReservedAt: null, title: 'T', researcherName: 'R',
  ...o,
} as unknown as AdScheduleEntry);

const billing = (o: Partial<ScheduleBilling> = {}): ScheduleBilling => ({
  invoices: [], billed: 0, paid: 0, outstanding: 0, isSettled: false,
  openInvoice: null, paymentChannel: null, ...o,
} as unknown as ScheduleBilling);

const sub = (id: string, title = `Survei ${id}`) => ({ id, formTitle: title, submittedAt: '2026-08-30T02:00:00Z' });

describe('planBulkInvoice', () => {
  it('order yang siap ditagih jadi kandidat', () => {
    const plan = planBulkInvoice({
      submissions: [sub('o1')],
      entries: [entry()],
      billings: new Map(),
    });
    expect(plan.candidates).toHaveLength(1);
    expect(plan.rejected).toHaveLength(0);
    expect(plan.candidates[0].orderCreatedAt).toBe('2026-08-30T02:00:00Z');
  });

  it('order TANPA tanggal tayang dicoret dengan alasan yang bisa ditindaklanjuti', () => {
    // Bentuk paling umum dari order approved-belum-ditagih: 9 dari 10 sejak Mei.
    const plan = planBulkInvoice({
      submissions: [sub('o1')],
      entries: [entry({ startDate: null })],
      billings: new Map(),
    });
    expect(plan.candidates).toHaveLength(0);
    expect(plan.rejected[0].state).toBe('choose_schedule');
    expect(plan.rejected[0].reason).toBe('Belum ada tanggal tayang');
    expect(plan.rejected[0].fixable).toBe(true);
  });

  it('order Kilat bertanggal tapi tanpa jam slot ikut tercoret', () => {
    const plan = planBulkInvoice({
      submissions: [sub('o1')],
      entries: [entry({ distributionType: 'kilat', kilatSlotHour: null })],
      billings: new Map(),
    });
    expect(plan.rejected[0].state).toBe('choose_schedule');
  });

  it('order yang masih antre review dicoret — gerbang aturan 2', () => {
    const plan = planBulkInvoice({
      submissions: [sub('o1')],
      entries: [entry({ reviewStatus: 'in_review' })],
      billings: new Map(),
    });
    expect(plan.rejected[0].state).toBe('awaiting_review');
    expect(plan.rejected[0].fixable).toBe(false);
  });

  it('order yang sudah punya tagihan aktif dicoret — satu tagihan terbuka per jadwal', () => {
    const plan = planBulkInvoice({
      submissions: [sub('o1')],
      entries: [entry()],
      billings: new Map([['s1', billing({ openInvoice: { paymentId: 'JFU-1' } as any, billed: 100, outstanding: 100 })]]),
    });
    expect(plan.rejected[0].state).toBe('waiting_payment');
    expect(plan.rejected[0].reason).toBe('Sudah punya tagihan aktif');
  });

  it('order lunas dicoret', () => {
    const plan = planBulkInvoice({
      submissions: [sub('o1')],
      entries: [entry()],
      billings: new Map([['s1', billing({ isSettled: true, paid: 100, billed: 100 })]]),
    });
    expect(plan.rejected[0].state).toBe('paid');
  });

  it('satu order tidak layak TIDAK menjatuhkan yang lain', () => {
    const plan = planBulkInvoice({
      submissions: [sub('o1'), sub('o2'), sub('o3')],
      entries: [
        entry({ id: 's1', submissionId: 'o1' }),
        entry({ id: 's2', submissionId: 'o2', startDate: null }),
        entry({ id: 's3', submissionId: 'o3' }),
      ],
      billings: new Map(),
    });
    expect(plan.candidates.map((c) => c.submissionId)).toEqual(['o1', 'o3']);
    expect(plan.rejected.map((r) => r.submissionId)).toEqual(['o2']);
  });

  it('order berjadwal banyak: setiap jadwal yang siap jadi bundel sendiri', () => {
    const plan = planBulkInvoice({
      submissions: [sub('o1')],
      entries: [
        entry({ id: 's1', submissionId: 'o1' }),
        entry({ id: 's2', submissionId: 'o1', isExtension: true, sourceId: 'ext-2' }),
      ],
      billings: new Map(),
    });
    expect(plan.candidates).toHaveLength(2);
    expect(plan.rejected).toHaveLength(0);
  });

  it('order berjadwal banyak: satu jadwal siap sudah cukup, sisanya tidak dicoret terpisah', () => {
    const plan = planBulkInvoice({
      submissions: [sub('o1')],
      entries: [
        entry({ id: 's1', submissionId: 'o1' }),
        entry({ id: 's2', submissionId: 'o1', startDate: null }),
      ],
      billings: new Map(),
    });
    expect(plan.candidates).toHaveLength(1);
    expect(plan.rejected).toHaveLength(0);
  });

  it('alasan yang paling bisa ditindaklanjuti yang ditampilkan', () => {
    // Menyebut "sudah lunas" untuk order yang jadwal lainnya hanya kurang
    // tanggal menghentikan admin pada masalah yang salah.
    const plan = planBulkInvoice({
      submissions: [sub('o1')],
      entries: [
        entry({ id: 's1', submissionId: 'o1' }),
        entry({ id: 's2', submissionId: 'o1', startDate: null }),
      ],
      billings: new Map([['s1', billing({ isSettled: true, paid: 100, billed: 100 })]]),
    });
    expect(plan.rejected[0].state).toBe('choose_schedule');
  });

  it('order tanpa baris jadwal sama sekali tidak lenyap begitu saja', () => {
    const plan = planBulkInvoice({ submissions: [sub('o9')], entries: [], billings: new Map() });
    expect(plan.rejected[0].state).toBe('no_schedule');
    expect(plan.rejected[0].title).toBe('Survei o9');
  });
});

describe('distinctAccounts', () => {
  it('satu akun = 1', () => {
    expect(distinctAccounts([{ auth_user_id: 'u1' }, { auth_user_id: 'u1' }])).toBe(1);
  });

  it('akun berbeda terhitung terpisah', () => {
    expect(distinctAccounts([{ auth_user_id: 'u1' }, { auth_user_id: 'u2' }])).toBe(2);
  });

  it('order tanpa akun tidak menempel ke grup siapa pun', () => {
    expect(distinctAccounts([{ auth_user_id: 'u1' }, { auth_user_id: null }])).toBe(2);
  });
});

describe('jumlah pertanyaan ikut ke kandidat', () => {
  it('dibawa dari ORDER, bukan dari jadwal', () => {
    // `ad_schedules` tidak punya `question_count`, dan calculateAdCostPerDay(0)
    // mengembalikan 0 — tanpa ini setiap bundel lahir tanpa baris iklan.
    const plan = planBulkInvoice({
      submissions: [{ ...sub('o1'), questionCount: 24 }],
      entries: [entry()],
      billings: new Map(),
    });
    expect(plan.candidates[0].questionCount).toBe(24);
  });

  it('null kalau ordernya memang tidak punya angka itu', () => {
    const plan = planBulkInvoice({
      submissions: [sub('o1')],
      entries: [entry()],
      billings: new Map(),
    });
    expect(plan.candidates[0].questionCount).toBeNull();
  });
});
