import { describe, expect, it, test } from 'vitest';
import { calculateKilatDiscount, getVoucherInfo, voucherVerdict, voucherVerdictReason } from './cost-calculator';
import { deriveScheduleMoney } from './scheduleMoney';
import { orderMoneyLines } from './orderMoneyLines';
import { describeVoucher } from '../components/schedule/invoiceItems';
import type { AdScheduleEntry } from './supabase';
import type { CostCalculation } from '../types';

/*
  "Voucher ini memotong atau tidak, dan kenapa" — SATU jawaban di setiap layar.

  Asal kasus (2 Nov 2026): tiga order Usep Suhud tersimpan dengan
  `JFU-SUHUDEANDYEAR` (salah ketik dari JFU-SUHUDENDYEAR). Rincian harga diam
  saja karena baris voucher hanya muncul bila diskon > 0, jadi admin tidak bisa
  membedakan "voucher tidak berlaku" dari "tanpa voucher".
*/

const OCT31 = Date.parse('2026-10-31T07:39:36Z');
const ctx = { isKilat: false, voucherAtMs: OCT31, rateAtMs: OCT31 };

describe('voucherVerdict', () => {
  test.each([
    ['', 0, null],
    ['JFU-SUHUDENDYEAR', 30_000, 'applied'],
    ['JFU-SUHUDEANDYEAR', 0, 'unknown'],
    ['JAKPATUNIV2025', 0, 'expired'],
    ['JFUFEB', 0, 'no_effect'],
  ])('%s (diskon %d) → %s', (code, discount, status) => {
    expect(voucherVerdict(code, discount, ctx)?.status ?? null).toBe(status);
  });

  it('kedaluwarsa bertanggal menyebut hari terakhirnya (WIB)', () => {
    const v = voucherVerdict('JFU-EHEF2026', 0, { ...ctx, voucherAtMs: Date.parse('2027-01-02T00:00:00Z') })!;
    expect(v.status).toBe('expired');
    expect(voucherVerdictReason(v)).toBe('masa berlaku habis (s/d 31 Des 2026)');
  });

  it('Kilat: kode Iklan-saja → not_for_kilat; ambassador di tarif lama → kilat_legacy', () => {
    const k = { isKilat: true, voucherAtMs: OCT31, rateAtMs: Date.parse('2026-10-20T00:00:00Z') };
    expect(voucherVerdict('TEGARGANTENG', 0, k)?.status).toBe('not_for_kilat');
    expect(voucherVerdict('JFUGITA', 0, k)?.status).toBe('kilat_legacy');
  });
});

const entryOf = (over: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 'sch-1', submissionId: 'sub-1', ordinal: 1, isExtension: false, bookingId: 'S2E895RW', sourceId: 'sub-1',
  startDate: '2026-11-05T08:00:00Z', endDate: '2026-11-06T08:00:00Z', duration: 1,
  status: 'slot_reserved', reviewStatus: 'approved', paymentStatus: 'pending', distributionType: 'regular',
  kilatSlotHour: null, totalCost: 527_250, subtotal: 475_000, ppnAmount: 52_250, voucherCode: null,
  prizePerWinner: 35_000, winnerCount: 5, additionalPrizePerWinner: 0, isNewPeriod: false, periodBatch: '2026-11',
  slotBookedBy: 'admin', slotReservedAt: null, title: 'JAK2666', researcherName: 'Uji', university: null,
  submissionCreatedAt: '2026-10-31T07:39:36Z', rateLockedAt: '2026-10-31T07:39:36Z',
  ...over,
} as AdScheduleEntry);
const SUB = { question_count: 40, distribution_type: 'regular' };
const voucherLines = (lines: { tone?: string; label: string }[] | null) =>
  (lines ?? []).filter((l) => l.tone === 'void' || l.label.startsWith('Diskon Voucher'));

describe('rincian harga tercatat (kartu jadwal admin & dashboard peneliti)', () => {
  it('JAK2666: kode salah ketik → baris "tidak terpotong: kode tidak dikenal", total tetap', () => {
    const m = deriveScheduleMoney(entryOf(), { ...SUB, voucher_code: 'JFU-SUHUDEANDYEAR' });
    expect(m.total).toBe(527_250);
    const [line] = voucherLines(m.lines);
    expect(line).toMatchObject({ tone: 'void', amount: 0, hintKey: 'costVoucherReason_unknown' });
    expect(line.label).toBe('Voucher JFU-SUHUDEANDYEAR');
  });

  it('ejaan dibetulkan TANPA hitung ulang → not_in_record, bukan diskon karangan', () => {
    const m = deriveScheduleMoney(entryOf(), { ...SUB, voucher_code: 'JFU-SUHUDENDYEAR' });
    const lines = m.lines!;
    // Dulu: pembalikan rasio mengarang "Iklan 333.333 / Diskon −33.333".
    expect(lines.find((l) => l.tone === 'discount' && l.kind !== 'intro')).toBeUndefined();
    expect(voucherLines(lines)).toEqual([expect.objectContaining({ tone: 'void', hintKey: 'costVoucherReason_not_in_record' })]);
  });

  it('harga tercatat sudah berdiskon → baris potongan biasa', () => {
    const m = deriveScheduleMoney(
      entryOf({ subtotal: 445_000, ppnAmount: 48_950, totalCost: 493_950 }),
      { ...SUB, voucher_code: 'JFU-SUHUDENDYEAR' },
    );
    expect(voucherLines(m.lines)).toEqual([expect.objectContaining({ tone: 'discount', amount: -30_000 })]);
  });

  it('estimasi (belum ditagih): kode tak dikenal juga tampil, bukan hilang', () => {
    const m = deriveScheduleMoney(entryOf({ totalCost: 0, subtotal: null, ppnAmount: null }), { ...SUB, voucher_code: 'JFU-SUHUDEANDYEAR' });
    expect(voucherLines(m.lines)).toEqual([expect.objectContaining({ tone: 'void', hintKey: 'costVoucherReason_unknown' })]);
  });
});

describe('ringkasan order (peneliti)', () => {
  it('kode tak dikenal → baris void', () => {
    const calc = { adCost: 300_000, incentiveCost: 175_000, discount: 0, subtotal: 475_000, ppn: 52_250, totalCost: 527_250 } as CostCalculation;
    const lines = orderMoneyLines(calc, { questionCount: 40, duration: 1, voucherCode: 'JFU-SUHUDEANDYEAR', atMs: OCT31 });
    expect(voucherLines(lines)).toEqual([expect.objectContaining({ tone: 'void' })]);
  });
});

describe('form Kilat peneliti (getVoucherInfo)', () => {
  const NOV = Date.parse('2026-11-02T05:00:00Z');
  it('kode Kilat bertanggal menyebut tenggatnya, bukan "kode ambassador"', () => {
    const v = getVoucherInfo('JFU-EHEF2026', 1, NOV, 'kilat');
    expect(v).toMatchObject({ isValid: true, discount: 10 });
    expect(v.message).toBe('Diskon 10% dari tarif Kilat Survei, berlaku s/d 31 Des 2026');
  });
  it('sesudah tenggat: ditolak — sama dengan harganya yang tidak terpotong', () => {
    const at = Date.parse('2027-01-02T05:00:00Z');
    expect(getVoucherInfo('JFU-EHEF2026', 1, at, 'kilat')).toMatchObject({ isValid: false, isError: true });
    expect(calculateKilatDiscount('JFU-EHEF2026', 500_000, 0, at)).toBe(0);
  });
  it('kode Iklan-saja: tidak berlaku untuk Kilat', () => {
    expect(getVoucherInfo('TEGARGANTENG', 1, NOV, 'kilat').message).toBe('Kode ini tidak berlaku untuk Kilat Survei.');
  });
});

describe('form invoice admin', () => {
  it('kalimat yang sama dengan rincian harga', () => {
    const v = describeVoucher('JFU-SUHUDEANDYEAR', { adCost: 300_000, incentiveCost: 175_000, duration: 1, voucherInstantMs: OCT31 });
    expect(v).toEqual({ applied: false, discount: 0, label: 'Voucher JFU-SUHUDEANDYEAR tidak terpotong: kode tidak dikenal sistem — periksa ejaannya' });
    expect(describeVoucher('JFU-SUHUDENDYEAR', { adCost: 300_000, incentiveCost: 175_000, duration: 1, voucherInstantMs: OCT31 }))
      .toMatchObject({ applied: true, discount: 30_000 });
  });

  it('masa berlaku dinilai pada tanggal ORDER, bukan jam sekarang', () => {
    // Order Desember ditagih Januari: item terpotong, label pun harus berkata terpotong.
    const dec = Date.parse('2026-12-20T00:00:00Z');
    expect(describeVoucher('JFU-EHEF2026', { adCost: 300_000, incentiveCost: 0, duration: 1, voucherInstantMs: dec }))
      .toMatchObject({ applied: true, discount: 30_000 });
  });
});
