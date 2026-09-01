import { describe, it, expect } from 'vitest';
import { planCardActions, cardStateOf, isLateForSchedule, type CardState } from './scheduleCardActions';
import type { AdScheduleEntry, ScheduleBilling } from '@/utils/supabase';

const entry = (o: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 's1', submissionId: 'o1', ordinal: 1, isExtension: false, bookingId: 'AAAA1111',
  sourceId: 'o1', startDate: '2026-09-10T08:00:00Z', endDate: '2026-09-11T08:00:00Z',
  duration: 1, status: 'waiting_payment', reviewStatus: 'approved', paymentStatus: 'pending',
  distributionType: 'regular', kilatSlotHour: null, totalCost: 233100, subtotal: 210000,
  ppnAmount: 23100, voucherCode: null, prizePerWinner: 30000, winnerCount: 2,
  additionalPrizePerWinner: 0, isNewPeriod: false, periodBatch: null, createdAt: null,
  slotBookedBy: 'admin', slotReservedAt: null, title: 'T', researcherName: 'R',
  ...o,
} as unknown as AdScheduleEntry);

const billing = (o: Partial<ScheduleBilling> = {}): ScheduleBilling => ({
  invoices: [], billed: 0, paid: 0, outstanding: 0, isSettled: false,
  openInvoice: null, paymentChannel: null, ...o,
} as unknown as ScheduleBilling);

const ALL: NonNullable<Parameters<typeof planCardActions>[0]['can']> = {
  markPaid: true, unmarkPaid: true, cancelSchedule: true, createInvoice: true,
};

const plan = (state: CardState, o: Partial<Parameters<typeof planCardActions>[0]> = {}) =>
  planCardActions({ state, entry: entry(), billing: billing(), isLate: false, can: ALL, ...o });

const STATES: CardState[] = [
  'awaiting_review', 'cancelled', 'choose_schedule', 'awaiting_invoice',
  'hold_lapsed', 'waiting_payment', 'partially_paid', 'paid',
];

describe('planCardActions — bentuk yang ditegakkan', () => {
  it('TIDAK PERNAH lebih dari satu aksi utama, di kondisi mana pun', () => {
    // Inilah alasan modul ini ada: dulu `waiting_payment` menampilkan 6 kontrol.
    for (const s of STATES) {
      const p = plan(s);
      expect(Array.isArray(p.menu)).toBe(true);
      expect(p.primary === null || typeof p.primary.label === 'string').toBe(true);
    }
  });

  it('aksi merusak selalu di DASAR menu, tidak pernah di tengah', () => {
    for (const s of STATES) {
      const idx = plan(s).menu.findIndex((a) => a.destructive);
      if (idx !== -1) expect(idx).toBe(plan(s).menu.length - 1);
    }
  });

  it('nol duplikat di dalam satu kartu', () => {
    // Dulu "Pilih jadwal tayang" dan "Pilih Jadwal" tampil BERSAMAAN dan
    // memanggil handler yang sama.
    for (const s of STATES) {
      const p = plan(s);
      const ids = [...(p.primary ? [p.primary.id] : []), ...p.menu.map((a) => a.id)];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('order yang lunas maupun dibatalkan tidak punya aksi utama', () => {
    expect(plan('paid').primary).toBeNull();
    expect(plan('cancelled').primary).toBeNull();
  });

  it('order menunggu review hanya menunjuk ke tab Review — nol penagihan', () => {
    const p = plan('awaiting_review');
    expect(p.primary?.id).toBe('open_review');
    expect([...p.menu.map((a) => a.id)]).not.toContain('invoice');
    expect([...p.menu.map((a) => a.id)]).not.toContain('mark_paid');
  });

  it('"Tagih Susulan" HILANG saat tidak berlaku, bukan tampil disabled', () => {
    const open = billing({ openInvoice: { paymentId: 'x' } as any, billed: 1, paid: 1 });
    const ids = planCardActions({
      state: 'partially_paid', entry: entry(), billing: open, isLate: false, can: ALL,
    });
    expect([...(ids.primary ? [ids.primary.id] : []), ...ids.menu.map((a) => a.id)]).not.toContain('top_up');
  });

  it('lewat batas bayar: yang utama Ganti Tanggal, bukan Tandai Lunas', () => {
    const p = plan('waiting_payment', { isLate: true });
    expect(p.primary?.id).toBe('schedule');
  });

  it('menggeser tanggal order LUNAS ditandai berdialog+berkabar', () => {
    const s = plan('paid').menu.find((a) => a.id === 'schedule');
    expect(s?.warns).toBe(true);
  });

  it('tanpa hak batalkan jadwal, aksinya tidak muncul di mana pun', () => {
    for (const s of STATES) {
      const p = plan(s, { can: { ...ALL, cancelSchedule: false } });
      expect(p.menu.map((a) => a.id)).not.toContain('cancel_schedule');
    }
  });
});

describe('cardStateOf — gerbang aturan 2', () => {
  it('order yang masih in_review TIDAK jatuh ke awaiting_invoice', () => {
    // Ini bug yang membuat admin ditawari "Buat Tagihan" untuk order yang di
    // layar penelitinya berbunyi "tunggu review dulu".
    expect(cardStateOf(entry({ reviewStatus: 'in_review' }), billing())).toBe('awaiting_review');
  });

  it('tapi order in_review yang TERLANJUR LUNAS tetap dibaca lunas', () => {
    // 156 order di produksi lunas sambil kolom statusnya tertinggal di in_review.
    expect(cardStateOf(
      entry({ reviewStatus: 'in_review', paymentStatus: 'paid' }),
      billing({ isSettled: true }),
    )).toBe('paid');
  });

  it('slot yang masa tahannya lewat punya keadaan sendiri', () => {
    expect(cardStateOf(entry(), billing(), { holdLapsed: true })).toBe('hold_lapsed');
  });

  it('slot yang masa tahannya lewat TETAP hold_lapsed walau ada openInvoice menggantung', () => {
    // ⚠️ Tagihan lama ikut kedaluwarsa saat slotnya lepas — tidak boleh kembali ke waiting_payment
    const openBill = billing({ openInvoice: { paymentId: 'JFU-123' } as any, billed: 355200, outstanding: 355200 });
    expect(cardStateOf(entry(), openBill, { holdLapsed: true })).toBe('hold_lapsed');
  });

  it('pemesanan mandiri peneliti yang lewat 1 jam otomatis terdeteksi hold_lapsed', () => {
    const expiredUserEntry = entry({
      slotBookedBy: 'user',
      slotReservedAt: '2026-08-01T00:00:00.000Z',
    });
    const openBill = billing({ openInvoice: { paymentId: 'JFU-123' } as any, billed: 355200, outstanding: 355200 });
    expect(cardStateOf(expiredUserEntry, openBill)).toBe('hold_lapsed');
  });
});

describe('isLateForSchedule — satu definisi', () => {
  const past = entry({ startDate: '2026-08-01T08:00:00Z' });
  const now = new Date('2026-09-03T09:00:00Z');

  it('jadwal yang dibayar SEBAGIAN tetap terlambat kalau tanggalnya lewat', () => {
    // Definisi lama mengecualikan `partially_paid`, jadi bagian tagihan dan
    // baris aksi di kartu yang sama bisa berbeda pendapat.
    expect(isLateForSchedule(past, 'partially_paid', now)).toBe(true);
  });

  it('hanya jadwal yang benar-benar lunas yang kebal', () => {
    expect(isLateForSchedule(past, 'paid', now)).toBe(false);
  });

  it('jadwal tanpa tanggal tidak pernah terlambat', () => {
    expect(isLateForSchedule(entry({ startDate: null }), 'waiting_payment', now)).toBe(false);
  });
});
