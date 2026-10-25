import { describe, expect, test, vi } from 'vitest';

/*
  Prefill invoice admin untuk GELOMBANG KILAT TAMBAHAN (Phase 5 §5.10, R8).

  Temuan audit invoice 15 Okt: `buildExtensionInvoiceItems` menghitung tarif
  harian Iklan × durasi untuk baris perpanjangan Kilat, sementara server
  (`buildNoteItems` lewat `pricingRowForSchedule`) sudah memakai tabel Kilat.
  Yang dikunci di sini: admin = server, baris demi baris, dan jumlahnya =
  subtotal yang ditagih — di bulan yang sama (tanpa hadiah) dan bulan baru
  (hadiah ditagih), dengan voucher ambassador, JFUTGRX, dan rumus lama.

  Tanggal buka pintu dipalsukan seperti `kilatTariffActive.spec.ts`: klien
  lewat vi.mock, server lewat parameter — tanggal yang SAMA.
*/

const FROM = '2026-10-19T00:00:00+07:00';

vi.mock('../../utils/constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/constants')>()),
  KILAT_TARIFF_FROM: '2026-10-19T00:00:00+07:00',
}));

const { buildExtensionInvoiceItems } = await import('./invoiceItems');
const { KILAT_VOUCHER_CODES } = await import('../../utils/cost-calculator');
// @ts-ignore -- Pages Function tanpa deklarasi tipe
const server = await import('../../../functions/api/doku/create-payment.js');
import type { AdScheduleEntry } from '../../utils/supabase';

const RILIS = Date.parse('2026-10-20T08:00:00+07:00');
const SEBELUM = Date.parse('2026-10-15T08:00:00+07:00');
const AMBASSADOR = KILAT_VOUCHER_CODES.find((c) => c !== 'JFUTGRX')!;

const order = {
  id: 'o', question_count: 40, duration: 1, winner_count: 2, prize_per_winner: 25_000,
  voucher_code: null, distribution_type: 'kilat', created_at: '2026-10-01T00:00:00Z',
};

const entryOf = (at: number, over: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 'sch-2', submissionId: 'o', ordinal: 2, isExtension: true, sourceId: 'src-2',
  startDate: '2026-10-21T04:00:00Z', endDate: '2026-10-22T04:00:00Z', duration: 1,
  status: 'waiting_payment', paymentStatus: 'pending', distributionType: 'kilat', kilatSlotHour: 11,
  prizePerWinner: 0, winnerCount: 0, additionalPrizePerWinner: 0, isNewPeriod: false,
  rateLockedAt: new Date(at).toISOString(), voucherCode: null,
  ...over,
} as AdScheduleEntry);

const shape = (items: { name: string; qty: number; price: number; category: string }[]) =>
  items.map(({ name, qty, price, category }) => ({ name, qty, price, category }));
const sum = (items: { qty: number; price: number }[]) => items.reduce((a, i) => a + i.qty * i.price, 0);

function both(entry: AdScheduleEntry, voucher: string | null) {
  const admin = buildExtensionInvoiceItems(entry, { questionCount: order.question_count, voucherCode: voucher });
  const schedule = {
    duration: entry.duration, is_new_period: entry.isNewPeriod, winner_count: entry.winnerCount,
    prize_per_winner: entry.prizePerWinner, voucher_code: null, additional_prize_per_winner: 0,
  };
  const row = server.pricingRowForSchedule(order, schedule, voucher, Date.parse(entry.rateLockedAt!));
  return {
    admin,
    srv: server.buildNoteItems(order, row, FROM),
    subtotal: server.computeTotalCostFromSubmission(row, FROM).subtotal,
  };
}

describe('gelombang Kilat tambahan — admin = server', () => {
  test('bulan sama: satu baris tarif gelombang, tanpa hadiah', () => {
    const { admin, srv, subtotal } = both(entryOf(RILIS), null);
    expect(shape(admin)).toEqual([
      { name: 'Kilat Survei (1 gelombang)', qty: 1, price: 750_000, category: 'Jakpat for Universities (ads)' },
    ]);
    expect(shape(admin)).toEqual(shape(srv));
    expect(sum(admin)).toBe(subtotal);
  });

  test('durasi pada baris tidak pernah mengalikan tarif', () => {
    const { admin } = both(entryOf(RILIS, { duration: 3 }), null);
    expect(sum(admin)).toBe(750_000);
  });

  test('bulan baru: hadiah batch baru ditagih', () => {
    const { admin, srv, subtotal } = both(entryOf(RILIS, { isNewPeriod: true, winnerCount: 3, prizePerWinner: 30_000 }), null);
    expect(shape(admin).map((i) => i.price * i.qty)).toEqual([750_000, 90_000]);
    expect(admin.map((i) => i.qty)).toEqual(srv.map((i: { qty: number }) => i.qty));
    expect(sum(admin)).toBe(sum(srv));
    expect(sum(admin)).toBe(subtotal);
  });

  test('voucher ambassador: −10% dari tarif saja', () => {
    const { admin, srv, subtotal } = both(entryOf(RILIS, { isNewPeriod: true, winnerCount: 2, prizePerWinner: 25_000 }), AMBASSADOR);
    expect(admin[0].price).toBe(675_000);
    expect(sum(admin)).toBe(sum(srv));
    expect(sum(admin)).toBe(subtotal);
  });

  test('JFUTGRX: satu baris biaya uji Rp1.000', () => {
    const { admin, srv, subtotal } = both(entryOf(RILIS), 'JFUTGRX');
    expect(shape(admin)).toEqual([{ name: 'System Testing Fee (JFUTGRX)', qty: 1, price: 1_000, category: 'Lainnya' }]);
    expect(shape(admin)).toEqual(shape(srv));
    expect(subtotal).toBe(1_000);
  });

  test('tarif dikunci sebelum tanggal mulai: rumus lama (tarif 1× + add-on)', () => {
    const { admin, srv, subtotal } = both(entryOf(SEBELUM), null);
    expect(admin.map((i) => i.name)).toEqual(['Jakpat for Universities (ads)', 'Add-on JFU Kilat']);
    expect(shape(admin)).toEqual(shape(srv));
    expect(sum(admin)).toBe(subtotal);
  });

  test('Iklan tidak tersentuh: tarif harian × durasi', () => {
    const entry = entryOf(RILIS, { distributionType: 'ads', duration: 3, kilatSlotHour: null });
    const items = buildExtensionInvoiceItems(entry, { questionCount: 40 });
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(3);
    expect(items[0].name).toBe('Jakpat for Universities (ads)');
  });
});
