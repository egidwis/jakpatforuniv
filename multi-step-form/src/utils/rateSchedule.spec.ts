import { describe, expect, test } from 'vitest';
import { AD_RATE_SCHEDULE } from './constants';
import {
  adRateAt, calculateAdCostPerDay, calculateTotalCost, rateInstantOf,
} from './cost-calculator';
import { deriveScheduleMoney } from './scheduleMoney';
import type { AdScheduleEntry } from './supabase';
import type { SurveyFormData } from '../types';
// @ts-ignore -- Pages Function tanpa deklarasi tipe
import { AD_RATE_SCHEDULE as SERVER_SCHEDULE, calculateAdCostPerDay as serverPerDay, computeTotalCostFromSubmission, pricingRowForSchedule, buildNoteItems } from '../../functions/api/doku/create-payment.js';

/*
  Tarif iklan BERTANGGAL (1 Okt 2026 → 1 Des → 1 Jan 2027).

  Yang dikunci berkas ini:
    • tabel klien = tabel server, entri demi entri (dua salinan literal);
    • tepi tengah malam WIB, bukan UTC;
    • Okt–Nov = NO-OP rupiah (efektif = harga lama persis);
    • baris "Harga perkenalan" menjumlah — list − perkenalan = efektif;
    • kwitansi (`buildNoteItems`) menjumlah ke subtotal di setiap jendela;
    • instan tarif ≠ instan voucher (jadwal dipesan ulang).
*/

const T = (iso: string) => Date.parse(iso);
const SEBELUM = T('2026-09-30T23:59:59+07:00');
const OKT = T('2026-10-01T00:00:00+07:00');
const AKHIR_NOV = T('2026-11-30T23:59:59+07:00');
const DES = T('2026-12-01T00:00:00+07:00');
const AKHIR_DES = T('2026-12-31T23:59:59+07:00');
const JAN = T('2027-01-01T00:00:00+07:00');

// Satu jumlah soal per tier, plus tepinya.
const TIERS = [
  { q: 15, tier: 0 }, { q: 16, tier: 1 }, { q: 30, tier: 1 }, { q: 31, tier: 2 },
  { q: 50, tier: 2 }, { q: 51, tier: 3 }, { q: 70, tier: 3 }, { q: 71, tier: 4 }, { q: 1, tier: 0 },
];

const LAMA = [150000, 200000, 300000, 400000, 500000];
const DESEMBER = [160000, 280000, 400000, 520000, 640000];
const PENUH = [200000, 350000, 500000, 650000, 800000];

describe('tabel tarif — angka yang disetujui direksi', () => {
  test.each(TIERS)('%o: s/d 30 Sep = harga lama', ({ q, tier }) => {
    expect(adRateAt(q, SEBELUM)).toEqual({ list: LAMA[tier], effective: LAMA[tier], introUntil: null });
  });

  test.each(TIERS)('%o: 1 Okt–30 Nov = list baru, efektif harga lama', ({ q, tier }) => {
    for (const at of [OKT, AKHIR_NOV]) {
      expect(adRateAt(q, at)).toEqual({ list: PENUH[tier], effective: LAMA[tier], introUntil: '2026-11-30' });
    }
  });

  test.each(TIERS)('%o: Desember = tahap 2 (−20%%)', ({ q, tier }) => {
    for (const at of [DES, AKHIR_DES]) {
      expect(adRateAt(q, at)).toEqual({ list: PENUH[tier], effective: DESEMBER[tier], introUntil: '2026-12-31' });
    }
  });

  test.each(TIERS)('%o: mulai 1 Jan 2027 = tarif penuh, tanpa perkenalan', ({ q, tier }) => {
    expect(adRateAt(q, JAN)).toEqual({ list: PENUH[tier], effective: PENUH[tier], introUntil: null });
  });

  test('0 soal = 0 di setiap jendela', () => {
    for (const at of [SEBELUM, OKT, DES, JAN]) expect(calculateAdCostPerDay(0, at)).toBe(0);
  });

  test('tepi WIB: 30 Sep 23.59.59 WIB masih tarif lama, 17.00 UTC 30 Sep sudah Oktober', () => {
    // 1 Okt 00.00 WIB = 30 Sep 17.00 UTC. Membandingkan dengan tanggal UTC akan
    // menggeser tepi 7 jam.
    expect(adRateAt(40, T('2026-09-30T16:59:59Z')).list).toBe(300000);
    expect(adRateAt(40, T('2026-09-30T17:00:00Z')).list).toBe(500000);
    expect(adRateAt(40, T('2026-11-30T16:59:59Z')).effective).toBe(300000);
    expect(adRateAt(40, T('2026-11-30T17:00:00Z')).effective).toBe(400000);
    expect(adRateAt(40, T('2026-12-31T16:59:59Z')).effective).toBe(400000);
    expect(adRateAt(40, T('2026-12-31T17:00:00Z')).effective).toBe(500000);
  });
});

describe('paritas klien ⇄ server', () => {
  test('tabel literal identik', () => {
    expect(SERVER_SCHEDULE).toEqual(AD_RATE_SCHEDULE.map((e) => ({ ...e, list: [...e.list], effective: [...e.effective] })));
  });

  test('tarif per hari identik di setiap jendela × tier', () => {
    for (const at of [SEBELUM, OKT, AKHIR_NOV, DES, AKHIR_DES, JAN]) {
      for (const { q } of TIERS) {
        expect(serverPerDay(q, at), `q=${q} at=${new Date(at).toISOString()}`).toBe(calculateAdCostPerDay(q, at));
      }
    }
  });

  test('server MELEMPAR tanpa instan tarif — tidak pernah menebak "sekarang"', () => {
    expect(() => serverPerDay(40)).toThrow('rate_instant_missing');
    expect(() => computeTotalCostFromSubmission({ question_count: 40, duration: 2 })).toThrow('rate_instant_missing');
  });

  const formOf = (o: Partial<SurveyFormData>): SurveyFormData => ({
    questionCount: 40, duration: 2, winnerCount: 2, prizePerWinner: 25000,
    voucherCode: '', isKilatUpgrade: false, ...o,
  } as SurveyFormData);

  test.each([
    ['tanpa voucher', {}],
    ['JFUFEB 3 hari', { voucherCode: 'JFUFEB', duration: 3, questionCount: 60 }],
    ['JFUFEB 7 hari', { voucherCode: 'JFUFEB', duration: 7, questionCount: 60 }],
    ['ambassador 10%', { voucherCode: 'JFUGITA' }],
    ['Kilat', { isKilatUpgrade: true }],
  ] as const)('total wizard = total server (%s)', (_n, o) => {
    for (const at of [SEBELUM, OKT, DES, JAN]) {
      const form = formOf(o);
      const client = calculateTotalCost(form, at);
      const server = computeTotalCostFromSubmission(pricingRowForSchedule({
        question_count: form.questionCount, duration: form.duration,
        winner_count: form.winnerCount, prize_per_winner: form.prizePerWinner,
        voucher_code: form.voucherCode || null,
        distribution_type: form.isKilatUpgrade ? 'kilat' : 'regular',
        created_at: new Date(at).toISOString(),
      }, null, null, at));
      expect(server.total).toBe(client.totalCost);
      expect(server.subtotal).toBe(client.subtotal);
    }
  });
});

describe('1 Okt adalah NO-OP rupiah', () => {
  test('total order Oktober = total order 30 Sep, setiap tier & voucher', () => {
    for (const { q } of TIERS) {
      for (const voucherCode of ['', 'JFUFEB', 'ILKOMUNY', 'JFUGITA']) {
        const form = { questionCount: q, duration: 3, winnerCount: 2, prizePerWinner: 25000, voucherCode } as SurveyFormData;
        expect(calculateTotalCost(form, OKT).totalCost).toBe(calculateTotalCost(form, SEBELUM).totalCost);
        expect(calculateTotalCost(form, AKHIR_NOV).totalCost).toBe(calculateTotalCost(form, SEBELUM).totalCost);
      }
    }
  });
});

// ── Tampilan: baris "Harga perkenalan" ────────────────────────────────────

const entryOf = (o: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 'sch', submissionId: 'sub', ordinal: 1, isExtension: false, bookingId: 'K3M9PQ7T',
  sourceId: 'sub', startDate: null, endDate: null, duration: 2,
  status: 'requested', reviewStatus: 'approved', paymentStatus: 'pending',
  distributionType: 'regular', kilatSlotHour: null,
  totalCost: 0, subtotal: null, ppnAmount: null, voucherCode: null,
  prizePerWinner: 25000, winnerCount: 2, additionalPrizePerWinner: 0, isNewPeriod: false,
  submissionCreatedAt: '2026-10-05T03:00:00Z',
  rateLockedAt: '2026-10-05T03:00:00Z',
  ...o,
} as AdScheduleEntry);

const byKey = (lines: { labelKey?: string; amount: number }[] | null, key: string) =>
  lines?.find((l) => l.labelKey === key)?.amount;
const sumNonSummary = (lines: { amount: number; isSubtotal?: boolean }[] | null) =>
  (lines ?? []).filter((l) => !l.isSubtotal).reduce((a, l) => a + l.amount, 0);

describe('layar ③ — order 5 Okt, 40 soal × 2 hari, reward 2 × 25rb', () => {
  const m = deriveScheduleMoney(entryOf(), { question_count: 40, distribution_type: 'regular' });

  test('total sama persis dengan hari ini: Rp721.500', () => {
    expect(m.total).toBe(721_500);
    expect(m.isEstimate).toBe(true);
  });

  test('Iklan di harga katalog, perkenalan −400rb, dan kolomnya menjumlah', () => {
    expect(byKey(m.lines, 'costLineAd')).toBe(1_000_000);
    expect(byKey(m.lines, 'costLineIntro')).toBe(-400_000);
    expect(m.lines?.find((l) => l.labelKey === 'costLineIntro')?.kind).toBe('intro');
    expect(sumNonSummary(m.lines)).toBe(m.total);
  });

  test('order 3 Des → tahap 2: Rp943.500', () => {
    const d = deriveScheduleMoney(entryOf({ rateLockedAt: '2026-12-03T03:00:00Z' }), { question_count: 40 });
    expect(d.total).toBe(943_500);
    expect(byKey(d.lines, 'costLineIntro')).toBe(-200_000);
  });

  test('order 5 Jan 2027 → tarif penuh, TANPA baris perkenalan: Rp1.165.500', () => {
    const j = deriveScheduleMoney(entryOf({ rateLockedAt: '2027-01-05T03:00:00Z' }), { question_count: 40 });
    expect(j.total).toBe(1_165_500);
    expect(byKey(j.lines, 'costLineIntro')).toBeUndefined();
  });

  test('order pra-Oktober → tanpa baris perkenalan (list = efektif)', () => {
    const s = deriveScheduleMoney(entryOf({ rateLockedAt: '2026-09-20T03:00:00Z' }), { question_count: 40 });
    expect(s.total).toBe(721_500);
    expect(byKey(s.lines, 'costLineIntro')).toBeUndefined();
    expect(byKey(s.lines, 'costLineAd')).toBe(600_000);
  });
});

describe('instan tarif ≠ instan voucher', () => {
  test('⑤ perpanjangan dipesan 3 Des untuk order Oktober → tarif Desember', () => {
    const m = deriveScheduleMoney(
      entryOf({ ordinal: 2, isExtension: true, isNewPeriod: false, prizePerWinner: 0, winnerCount: 0,
        rateLockedAt: '2026-12-03T03:00:00Z' }),
      { question_count: 40 },
    );
    expect(m.total).toBe(888_000);
  });

  test('jadwal pertama order Oktober yang DILEPAS (rate NULL) → tarif saat dipesan ulang', () => {
    const lepas = entryOf({ rateLockedAt: null });
    expect(rateInstantOf(lepas.rateLockedAt, DES)).toBe(DES);
  });

  test('⑥ JFUFEB — T4, 3 hari, order 5 Okt: nominal tetap Rp1.054.500', () => {
    const m = deriveScheduleMoney(
      entryOf({ duration: 3 }),
      { question_count: 60, voucher_code: 'JFUFEB' },
    );
    expect(m.total).toBe(1_054_500);
    expect(byKey(m.lines, 'costLineAd')).toBe(1_950_000);
    expect(byKey(m.lines, 'costLineIntro')).toBe(-750_000);
    expect(byKey(m.lines, 'costLineVoucherNamed')).toBe(-300_000);
  });

  test('⑥ JFUFEB — order 5 Jan 2027 (voucher masih hidup s/d 20 Feb): tetap Rp1.054.500', () => {
    const m = deriveScheduleMoney(
      entryOf({ duration: 3, rateLockedAt: '2027-01-05T03:00:00Z', submissionCreatedAt: '2027-01-05T03:00:00Z' }),
      { question_count: 60, voucher_code: 'JFUFEB' },
    );
    expect(m.total).toBe(1_054_500);
    expect(byKey(m.lines, 'costLineIntro')).toBeUndefined();
  });
});

describe('⑦ Kilat — T3, Oktober', () => {
  test('perkenalan ikut tampil, add-on tetap Rp200rb, total = hari ini', () => {
    const m = deriveScheduleMoney(entryOf({ distributionType: 'kilat' }), { question_count: 40, distribution_type: 'kilat' });
    expect(m.total).toBe(610_500);
    expect(byKey(m.lines, 'costLineAd')).toBe(500_000);
    expect(byKey(m.lines, 'costLineIntro')).toBe(-200_000);
    expect(byKey(m.lines, 'costLineKilatAddon')).toBe(200_000);
  });
});

describe('sudah ditagih: perkenalan hanya direkonstruksi bila nominalnya cocok', () => {
  test('nominal tersimpan = tarif pada instannya → baris perkenalan muncul', () => {
    const m = deriveScheduleMoney(
      entryOf({ totalCost: 721_500, subtotal: 650_000, ppnAmount: 71_500 }),
      { question_count: 40 },
    );
    expect(m.isEstimate).toBe(false);
    expect(byKey(m.lines, 'costLineIntro')).toBe(-400_000);
    expect(sumNonSummary(m.lines)).toBe(721_500);
  });

  test('admin menagih nominal lain → bentuk lama, tanpa tebakan', () => {
    const m = deriveScheduleMoney(
      entryOf({ totalCost: 666_000, subtotal: 600_000, ppnAmount: 66_000 }),
      { question_count: 40 },
    );
    expect(byKey(m.lines, 'costLineIntro')).toBeUndefined();
    expect(m.total).toBe(666_000);
  });
});

describe('kwitansi (transactions.note) menjumlah ke subtotal di setiap jendela', () => {
  const sum = (items: { qty: number; price: number }[]) => items.reduce((a, i) => a + i.qty * i.price, 0);
  const ORDER = {
    id: 'o', created_at: '2026-10-05T03:00:00Z', question_count: 40, duration: 2,
    winner_count: 2, prize_per_winner: 25000, voucher_code: null, distribution_type: 'regular',
  };

  test.each([
    ['order 30 Nov dibayar 2 Des → tarif Nov', AKHIR_NOV, 721_500],
    ['perpanjangan dipesan 2 Des → tarif Des', T('2026-12-02T10:00:00+07:00'), 943_500],
    ['dipesan Januari → tarif penuh', JAN, 1_165_500],
  ] as const)('%s', (_n, at, total) => {
    const row = pricingRowForSchedule(ORDER, null, null, at);
    const priced = computeTotalCostFromSubmission(row);
    expect(priced.total).toBe(total);
    expect(sum(buildNoteItems(ORDER, row))).toBe(priced.subtotal);
  });

  test('JFUFEB di bulan Desember: rincian tetap menjumlah', () => {
    const o = { ...ORDER, question_count: 60, duration: 3, voucher_code: 'JFUFEB' };
    const row = pricingRowForSchedule(o, null, null, DES);
    const priced = computeTotalCostFromSubmission(row);
    expect(sum(buildNoteItems(o, row))).toBe(priced.subtotal);
    expect(priced.total).toBe(1_054_500);
  });
});
