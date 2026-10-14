import { describe, expect, test, vi } from 'vitest';

/*
  Tarif JFU Kilat bertanggal (Phase 5 Task 5.1) — SETELAH MENYALA.

  Produksi masih `KILAT_TARIFF_FROM = null`; berkas ini memalsukan tanggal buka
  pintu (Senin 19 Okt 2026) di klien lewat vi.mock, dan di server lewat
  parameter `kilatTariffFrom` — tanggal yang SAMA untuk keduanya. Yang dikunci:
    • instan tarif < tanggal mulai → rumus lama; sesudahnya → tabel Kilat;
    • angka per tanggal (tier 31–50: 750rb / 1,0jt / 1,25jt);
    • voucher Kilat: ambassador −10% dari tarif saja, JFUTGRX = Rp1.000,
      JFUFEB/ILKOMUNY/TEGARGANTENG = 0 — klien = server;
    • tampilan: satu baris "JFU Kilat", tanpa add-on; kwitansi & invoice admin
      menjumlah ke subtotal.
*/

const FROM = '2026-10-19T00:00:00+07:00';

vi.mock('./constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./constants')>()),
  KILAT_TARIFF_FROM: '2026-10-19T00:00:00+07:00',
}));

const { calculateTotalCost, getVoucherInfo, kilatRateAt } = await import('./cost-calculator');
const { deriveScheduleMoney } = await import('./scheduleMoney');
const { orderMoneyLines } = await import('./orderMoneyLines');
const { buildOrderInvoiceItems } = await import('../components/schedule/invoiceItems');
const { buildMiminPricingSection } = await import('./miminPricing');
// @ts-ignore -- Pages Function tanpa deklarasi tipe
const server = await import('../../functions/api/doku/create-payment.js');
import type { SurveyFormData } from '../types';
import type { AdScheduleEntry } from './supabase';

const T = (iso: string) => Date.parse(iso);
const SEBELUM = T('2026-10-18T23:59:59+07:00');
const RILIS = T(FROM);
const AKHIR_NOV = T('2026-11-30T23:59:59+07:00');
const DES = T('2026-12-01T00:00:00+07:00');
const JAN = T('2027-01-01T00:00:00+07:00');

const RILIS_EFF = [375_000, 500_000, 750_000, 1_000_000, 1_250_000];
const DES_EFF = [400_000, 700_000, 1_000_000, 1_300_000, 1_600_000];
const PENUH = [500_000, 875_000, 1_250_000, 1_625_000, 2_000_000];
const TIERS = [{ q: 15, t: 0 }, { q: 16, t: 1 }, { q: 40, t: 2 }, { q: 51, t: 3 }, { q: 71, t: 4 }];

const sum = (items: { qty: number; price: number }[]) => items.reduce((a, i) => a + i.qty * i.price, 0);

const orderOf = (o: Record<string, unknown> = {}) => ({
  id: 'o', question_count: 40, duration: 1, winner_count: 2, prize_per_winner: 25000,
  voucher_code: null as string | null, distribution_type: 'kilat', ...o,
});
const serverPriced = (at: number, o: Record<string, unknown> = {}) => {
  const order = orderOf({ created_at: new Date(at).toISOString(), ...o });
  const row = server.pricingRowForSchedule(order, null, null, at);
  return {
    order, row,
    priced: server.computeTotalCostFromSubmission(row, FROM),
    items: server.buildNoteItems(order, row, FROM),
  };
};
const formOf = (o: Partial<SurveyFormData> = {}): SurveyFormData => ({
  questionCount: 40, duration: 1, winnerCount: 2, prizePerWinner: 25000,
  voucherCode: '', isKilatUpgrade: true, ...o,
} as SurveyFormData);

describe('tabel per tanggal', () => {
  test.each(TIERS)('%o', ({ q, t }) => {
    expect(kilatRateAt(q, SEBELUM).legacy).toBe(true);
    expect(kilatRateAt(q, RILIS)).toEqual({ list: PENUH[t], effective: RILIS_EFF[t], introUntil: '2026-11-30', addon: 0, legacy: false });
    expect(kilatRateAt(q, AKHIR_NOV).effective).toBe(RILIS_EFF[t]);
    expect(kilatRateAt(q, DES)).toEqual({ list: PENUH[t], effective: DES_EFF[t], introUntil: '2026-12-31', addon: 0, legacy: false });
    expect(kilatRateAt(q, JAN)).toEqual({ list: PENUH[t], effective: PENUH[t], introUntil: null, addon: 0, legacy: false });
    for (const at of [SEBELUM, RILIS, DES, JAN]) {
      const c = kilatRateAt(q, at);
      expect(server.kilatRateAt(q, at, FROM)).toEqual({ effective: c.effective, addon: c.addon, legacy: c.legacy });
    }
  });

  test('tepi tanggal mulai di WIB: 18 Okt 16.59.59Z masih rumus lama', () => {
    expect(kilatRateAt(40, T('2026-10-18T16:59:59Z')).legacy).toBe(true);
    expect(kilatRateAt(40, T('2026-10-18T17:00:00Z')).effective).toBe(750_000);
  });
});

describe('total: klien = server, setiap voucher × tanggal', () => {
  test.each(['', 'JFUGITA', 'jfutyr', 'JFUTGRX', 'JFUFEB', 'ILKOMUNY', 'TEGARGANTENG'])('voucher %s', (voucherCode) => {
    for (const at of [SEBELUM, RILIS, AKHIR_NOV, DES, JAN]) {
      for (const { q } of TIERS) {
        const client = calculateTotalCost(formOf({ questionCount: q, voucherCode }), at);
        const { priced } = serverPriced(at, { question_count: q, voucher_code: voucherCode || null });
        expect(priced.subtotal, `q=${q} at=${new Date(at).toISOString()}`).toBe(client.subtotal);
        expect(priced.total).toBe(client.totalCost);
      }
    }
  });

  test('tier 31–50 saat rilis, hadiah 2 × 25rb', () => {
    const at = RILIS;
    expect(calculateTotalCost(formOf(), at)).toMatchObject({ adCost: 750_000, adCostList: 1_250_000, kilatAddonCost: 0, discount: 0, subtotal: 800_000, totalCost: 888_000, kilatTariff: true });
    // Ambassador: 10% dari TARIF (75rb), bukan dari hadiah.
    expect(calculateTotalCost(formOf({ voucherCode: 'JFUGITA' }), at)).toMatchObject({ discount: 75_000, subtotal: 725_000, totalCost: 804_750 });
    // JFUTGRX: total sebelum PPN dipatok Rp1.000.
    expect(calculateTotalCost(formOf({ voucherCode: 'JFUTGRX' }), at)).toMatchObject({ subtotal: 1_000, totalCost: 1_110 });
    // Kode di luar daftar Kilat: tanpa potongan.
    for (const v of ['JFUFEB', 'ILKOMUNY', 'TEGARGANTENG']) {
      expect(calculateTotalCost(formOf({ voucherCode: v }), at).subtotal).toBe(800_000);
    }
  });

  test('order Kilat lama (instan < tanggal mulai) tetap tanpa diskon', () => {
    expect(calculateTotalCost(formOf({ voucherCode: 'JFUGITA' }), SEBELUM)).toMatchObject({ discount: 0, kilatAddonCost: 200_000, subtotal: 300_000 + 200_000 + 50_000 });
  });
});

describe('kwitansi (transactions.note)', () => {
  test.each(['', 'JFUGITA', 'JFUFEB'])('satu baris tarif Kilat, menjumlah ke subtotal (voucher %s)', (v) => {
    for (const at of [RILIS, DES, JAN]) {
      const { priced, items } = serverPriced(at, { voucher_code: v || null });
      expect(items[0].name).toBe('JFU Kilat (1 gelombang)');
      expect(items.some((i: { name: string }) => i.name === 'Add-on JFU Kilat')).toBe(false);
      expect(sum(items)).toBe(priced.subtotal);
    }
  });
});

describe('validasi voucher di form Kilat', () => {
  test('ambassador & JFUTGRX diterima', () => {
    expect(getVoucherInfo('JFUGITA', 0, RILIS, 'kilat')).toMatchObject({ isValid: true });
    expect(getVoucherInfo('jfutgrx', 0, RILIS, 'kilat')).toMatchObject({ isValid: true });
  });

  test.each(['JFUFEB', 'ILKOMUNY', 'TEGARGANTENG', 'PPISWEDIA'])('%s ditolak dengan pesan khusus Kilat', (code) => {
    const info = getVoucherInfo(code, 0, RILIS, 'kilat');
    expect(info.isValid).toBe(false);
    expect(info.isError).toBe(true);
    expect(info.message).toContain('tidak berlaku untuk JFU Kilat');
  });

  test('kode asing tetap "tidak dikenal"; produk regular tidak berubah', () => {
    expect(getVoucherInfo('NGAWUR', 0, RILIS, 'kilat')).toMatchObject({ isValid: false, isError: false });
    expect(getVoucherInfo('JFUFEB', 3, RILIS).isValid).toBe(true);
  });
});

describe('tampilan', () => {
  const entryOf = (o: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
    id: 'sch', submissionId: 'sub', ordinal: 1, isExtension: false, bookingId: 'K3M9PQ7T',
    sourceId: 'sub', startDate: null, endDate: null, duration: 1,
    status: 'requested', reviewStatus: 'approved', paymentStatus: 'pending',
    distributionType: 'kilat', kilatSlotHour: 15,
    totalCost: 0, subtotal: null, ppnAmount: null, voucherCode: null,
    prizePerWinner: 25000, winnerCount: 2, additionalPrizePerWinner: 0, isNewPeriod: true,
    submissionCreatedAt: '2026-10-20T03:00:00Z',
    rateLockedAt: '2026-10-20T03:00:00Z',
    ...o,
  } as AdScheduleEntry);
  const keyOf = (lines: { labelKey?: string; amount: number }[] | null, key: string) =>
    lines?.find((l) => l.labelKey === key)?.amount;
  const total = (lines: { amount: number; isSubtotal?: boolean }[] | null) =>
    (lines ?? []).filter((l) => !l.isSubtotal).reduce((a, l) => a + l.amount, 0);

  test('estimasi kartu jadwal: satu baris JFU Kilat + perkenalan, tanpa add-on', () => {
    const m = deriveScheduleMoney(entryOf(), { question_count: 40, distribution_type: 'kilat', voucher_code: 'JFUGITA' });
    expect(m.total).toBe(804_750);
    expect(keyOf(m.lines, 'costLineKilat')).toBe(1_250_000);
    expect(keyOf(m.lines, 'costLineIntro')).toBe(-500_000);
    expect(keyOf(m.lines, 'costLineVoucherNamed')).toBe(-75_000);
    expect(keyOf(m.lines, 'costLineKilatAddon')).toBeUndefined();
    expect(keyOf(m.lines, 'costLineAd')).toBeUndefined();
    expect(total(m.lines)).toBe(m.total);
  });

  test('sudah ditagih: diskon ambassador direkonstruksi dari subtotal tersimpan', () => {
    const m = deriveScheduleMoney(
      entryOf({ totalCost: 804_750, subtotal: 725_000, ppnAmount: 79_750, voucherCode: 'JFUGITA' }),
      { question_count: 40, distribution_type: 'kilat' },
    );
    expect(m.isEstimate).toBe(false);
    expect(keyOf(m.lines, 'costLineKilat')).toBe(1_250_000);
    expect(keyOf(m.lines, 'costLineVoucherNamed')).toBe(-75_000);
    expect(total(m.lines)).toBe(804_750);
  });

  test('Ringkasan: satu baris JFU Kilat, tanpa add-on', () => {
    const calc = calculateTotalCost(formOf({ voucherCode: 'JFUGITA' }), RILIS);
    const lines = orderMoneyLines(calc, { questionCount: 40, duration: 1, isKilat: true, voucherCode: 'JFUGITA' });
    expect(lines[0].labelKey).toBe('costLineKilat');
    expect(lines.some((l) => l.labelKey === 'costLineKilatAddon')).toBe(false);
    expect(total(lines)).toBe(calc.totalCost);
  });

  test('invoice admin = kwitansi server', () => {
    const { items } = buildOrderInvoiceItems({
      questionCount: 40, duration: 1, winnerCount: 2, prizePerWinner: 25000,
      voucherCode: 'JFUGITA', isKilat: true, rateInstantMs: RILIS, voucherInstantMs: RILIS,
    });
    const { priced } = serverPriced(RILIS, { voucher_code: 'JFUGITA' });
    expect(items[0]).toMatchObject({ name: 'JFU Kilat (1 gelombang)', price: 675_000 });
    expect(sum(items)).toBe(priced.subtotal);
  });

  test('Mimin: tarif per gelombang mulai tanggal buka, rumus add-on hilang', () => {
    const text = buildMiminPricingSection(RILIS);
    expect(text).toContain('tarif per GELOMBANG');
    expect(text).toContain('Pesanan dibuat 19 Okt 2026 – 30 Nov 2026');
    expect(text).toContain('31–50 soal Rp750.000 (normal Rp1.250.000)');
    expect(text).not.toContain('add-on Kilat');
    // Sebelum tanggal buka, Mimin tetap menyebut rumus lama.
    expect(buildMiminPricingSection(SEBELUM)).toContain('add-on Kilat Rp200.000');
  });
});
