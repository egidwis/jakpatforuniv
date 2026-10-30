import { describe, expect, test } from 'vitest';
import { AD_RATE_SCHEDULE, KILAT_RATE_SCHEDULE, KILAT_TARIFF_FROM } from './constants';
import { adRateAt, calculateTotalCost, kilatRateAt, KILAT_VOUCHER_CODES, VOUCHER_CATALOG, getVoucherInfo } from './cost-calculator';
import type { SurveyFormData } from '../types';
import { buildOrderInvoiceItems, describeVoucher } from '../components/schedule/invoiceItems';
// @ts-ignore -- Pages Function tanpa deklarasi tipe
import * as server from '../../functions/api/doku/create-payment.js';

/*
  Tarif JFU Kilat bertanggal (Phase 5 Task 5.1) — TIDAK BERLAKU SURUT.

  `KILAT_TARIFF_FROM` diisi di Push B (27 Okt 2026 10.00 WIB). Yang dikunci di
  sini:
    • tanggal mulai klien = server, tabel klien = tabel server, kode voucher
      Kilat klien = server;
    • invarian keputusan 14 Okt: Kilat efektif = 2,5 × Iklan efektif (selalu
      lebih mahal dari Iklan 2 hari), list pun 2,5×;
    • order Kilat yang instan tarifnya SEBELUM tanggal mulai tetap dihargai
      rumus lama persis — tarif harian + add-on Rp200rb, tanpa diskon voucher
      (JFUTGRX = Rp1.000, opsi A). Order yang sudah dikutip tidak boleh
      ditagih berbeda saat dibayar.
  Perilaku tabel yang sudah menyala dikunci kilatTariffActive.spec.ts.
*/

const T = (iso: string) => Date.parse(iso);
const FROM = '2026-10-27T10:00:00+07:00';
// Semua instan SEBELUM tanggal mulai — order lama yang belum lunas.
const INSTANTS = [
  T('2026-09-30T23:59:59+07:00'), T('2026-10-01T00:00:00+07:00'), T('2026-10-15T10:00:00+07:00'),
  T(FROM) - 1,
];
const LEGACY_AT = T('2026-10-20T10:00:00+07:00');
const QS = [1, 15, 16, 30, 31, 50, 51, 70, 71];
const sumOf = (items: { qty: number; price: number }[]) => items.reduce((a, i) => a + i.qty * i.price, 0);

describe('paritas klien ⇄ server', () => {
  test('tanggal mulai klien = server = Push B (27 Okt 2026 10.00 WIB)', () => {
    expect(KILAT_TARIFF_FROM).toBe(FROM);
    expect(server.KILAT_TARIFF_FROM).toBe(FROM);
  });

  test('batas tepat di tanggal mulai: 1 ms sebelumnya rumus lama, tepat di situ tabel baru', () => {
    for (const q of QS) {
      expect(kilatRateAt(q, T(FROM) - 1)).toMatchObject({ legacy: true });
      expect(server.kilatRateAt(q, T(FROM) - 1)).toMatchObject({ legacy: true });
      expect(kilatRateAt(q, T(FROM)).legacy).toBeFalsy();
      expect(server.kilatRateAt(q, T(FROM)).legacy).toBeFalsy();
      expect(server.kilatRateAt(q, T(FROM)).effective).toBe(kilatRateAt(q, T(FROM)).effective);
    }
  });

  test('tabel literal identik', () => {
    expect(server.KILAT_RATE_SCHEDULE).toEqual(
      KILAT_RATE_SCHEDULE.map((e) => ({ ...e, list: [...e.list], effective: [...e.effective] })),
    );
  });

  test('kode voucher Kilat identik: 12 ambassador + JFUTGRX + JFU-EHEF2026 + JFU-SUHUDENDYEAR', () => {
    expect([...server.KILAT_VOUCHER_CODES].sort()).toEqual([...KILAT_VOUCHER_CODES].sort());
    expect(KILAT_VOUCHER_CODES).toHaveLength(15);
    expect(KILAT_VOUCHER_CODES).toContain('JFUTGRX');
    expect(KILAT_VOUCHER_CODES).toContain('JFU-EHEF2026');
    expect(KILAT_VOUCHER_CODES).toContain('JFU-SUHUDENDYEAR');
    for (const code of ['JFUFEB', 'ILKOMUNY', 'TEGARGANTENG', 'PPISWEDIA', 'JFUSUHUD', 'JAKPATUNIV2025']) {
      expect(KILAT_VOUCHER_CODES).not.toContain(code);
    }
    // Ambassador = semua kode berketentuan "kode ambassador" di katalog.
    const ambassador = VOUCHER_CATALOG.filter((v) => v.terms.includes('kode ambassador')).map((v) => v.code);
    expect(ambassador).toHaveLength(12);
    for (const code of ambassador) expect(KILAT_VOUCHER_CODES).toContain(code);
  });
});

describe('invarian 2,5 × Iklan (keputusan 14 Okt 2026)', () => {
  test.each(KILAT_RATE_SCHEDULE.map((e) => [e.from, e] as const))('entri %s', (from, entry) => {
    const iklan = AD_RATE_SCHEDULE.find((e) => e.from === from);
    expect(iklan, `entri Iklan ber-from ${from} wajib ada`).toBeDefined();
    for (let t = 0; t < 5; t++) {
      expect(entry.effective[t]).toBe(iklan!.effective[t] * 2.5);
      expect(entry.list[t]).toBe(iklan!.list[t] * 2.5);
      expect(entry.effective[t]).toBeGreaterThan(iklan!.effective[t] * 2);
    }
    expect(entry.introUntil).toBe(iklan!.introUntil);
  });

  test('tier 31–50: 750rb → 1,0jt → 1,25jt', () => {
    expect(KILAT_RATE_SCHEDULE.map((e) => e.effective[2])).toEqual([750_000, 1_000_000, 1_250_000]);
  });
});

describe('order bertarif sebelum tanggal mulai: rumus lama persis', () => {
  const formOf = (o: Partial<SurveyFormData>): SurveyFormData => ({
    questionCount: 40, duration: 1, winnerCount: 2, prizePerWinner: 25000,
    voucherCode: '', isKilatUpgrade: true, ...o,
  } as SurveyFormData);

  test('kilatRateAt = tarif harian Iklan + add-on Rp200rb di setiap instan × tier', () => {
    for (const at of INSTANTS) {
      for (const q of [0, ...QS]) {
        const rate = adRateAt(q, at);
        expect(kilatRateAt(q, at)).toEqual({ ...rate, addon: 200_000, legacy: true });
        expect(server.kilatRateAt(q, at)).toEqual({ effective: rate.effective, addon: 200_000, legacy: true });
      }
    }
  });

  test.each(['', 'JFUGITA', 'JFUFEB', 'ILKOMUNY', 'TEGARGANTENG', 'JFUSUHUD'])(
    'voucher %s tidak memotong apa pun; klien = server',
    (voucherCode) => {
      for (const at of INSTANTS) {
        for (const q of QS) {
          const form = formOf({ questionCount: q, voucherCode });
          const client = calculateTotalCost(form, at);
          const expectedSubtotal = adRateAt(q, at).effective + 200_000 + 50_000;
          expect(client.discount).toBe(0);
          expect(client.kilatAddonCost).toBe(200_000);
          expect(client.kilatTariff).toBe(false);
          expect(client.subtotal).toBe(expectedSubtotal);
          const priced = server.computeTotalCostFromSubmission(server.pricingRowForSchedule({
            question_count: q, duration: 1, winner_count: 2, prize_per_winner: 25000,
            voucher_code: voucherCode || null, distribution_type: 'kilat',
            created_at: new Date(at).toISOString(),
          }, null, null, at));
          expect(priced.subtotal).toBe(client.subtotal);
          expect(priced.total).toBe(client.totalCost);
        }
      }
    },
  );

  test('kwitansi tetap dua baris (iklan + add-on) dan menjumlah ke subtotal', () => {
    const at = LEGACY_AT;
    const order = {
      id: 'o', created_at: new Date(at).toISOString(), question_count: 40, duration: 1,
      winner_count: 2, prize_per_winner: 25000, voucher_code: 'JFUGITA', distribution_type: 'kilat',
    };
    const row = server.pricingRowForSchedule(order, null, null, at);
    const items = server.buildNoteItems(order, row);
    expect(items.map((i: { name: string }) => i.name)).toEqual([
      'Jakpat for Universities (ads)', 'Add-on JFU Kilat', "Respondent's Incentive",
    ]);
    const sum = items.reduce((a: number, i: { qty: number; price: number }) => a + i.qty * i.price, 0);
    expect(sum).toBe(server.computeTotalCostFromSubmission(row).subtotal);
  });

  test('JFUTGRX pada rumus lama: total dipatok Rp1.000 (opsi A, 16 Okt); klien = server', () => {
    for (const at of INSTANTS) {
      for (const q of QS) {
        const client = calculateTotalCost(formOf({ questionCount: q, voucherCode: 'JFUTGRX' }), at);
        expect(client.kilatTariff).toBe(false);
        expect(client).toMatchObject({ subtotal: 1_000, totalCost: 1_110 });
        const priced = server.computeTotalCostFromSubmission(server.pricingRowForSchedule({
          question_count: q, duration: 1, winner_count: 2, prize_per_winner: 25000,
          voucher_code: 'JFUTGRX', distribution_type: 'kilat', created_at: new Date(at).toISOString(),
        }, null, null, at));
        expect(priced.subtotal).toBe(1_000);
        expect(priced.total).toBe(client.totalCost);
      }
    }
  });

  test('JFUTGRX Kilat lama: prefill admin = kwitansi server (satu baris biaya uji)', () => {
    const at = LEGACY_AT;
    const order = {
      id: 'o', created_at: new Date(at).toISOString(), question_count: 40, duration: 1,
      winner_count: 2, prize_per_winner: 25000, voucher_code: 'JFUTGRX', distribution_type: 'kilat',
    };
    const row = server.pricingRowForSchedule(order, null, null, at);
    const serverItems = server.buildNoteItems(order, row);
    const admin = buildOrderInvoiceItems({
      questionCount: 40, duration: 1, winnerCount: 2, prizePerWinner: 25000,
      voucherCode: 'JFUTGRX', isKilat: true, rateInstantMs: at, voucherInstantMs: at,
    }).items;
    expect(admin.map(({ name, qty, price }) => ({ name, qty, price })))
      .toEqual(serverItems.map(({ name, qty, price }: { name: string; qty: number; price: number }) => ({ name, qty, price })));
    expect(admin.map(({ name, price }) => [name, price])).toEqual([['System Testing Fee (JFUTGRX)', 1_000]]);
    expect(sumOf(admin)).toBe(server.computeTotalCostFromSubmission(row).subtotal);
  });

  test('label voucher admin Kilat lama: JFUTGRX = biaya uji', () => {
    const at = LEGACY_AT;
    expect(describeVoucher('JFUTGRX', { adCost: 300_000, incentiveCost: 50_000, duration: 1 }, { adCost: 500_000, rateInstantMs: at })?.label)
      .toBe('Voucher uji sistem — tagihan dipatok Rp 1.000');
  });

  test.each(['JFUGITA', 'JFUFEB'])('label voucher admin untuk Kilat lama: %s → null (tidak mengubah harga)', (code) => {
    const at = LEGACY_AT;
    expect(describeVoucher(code, { adCost: 300_000, incentiveCost: 50_000, duration: 1 }, { adCost: 500_000, rateInstantMs: at })).toBeNull();
  });
});

describe('JFUTGRX Iklan: kwitansi menjumlah ke subtotal', () => {
  test('satu baris biaya uji Rp1.000', () => {
    const at = T('2026-12-10T10:00:00+07:00');
    const order = {
      id: 'o', created_at: new Date(at).toISOString(), question_count: 40, duration: 3,
      winner_count: 2, prize_per_winner: 25000, voucher_code: 'JFUTGRX', distribution_type: 'regular',
    };
    const row = server.pricingRowForSchedule(order, null, null, at);
    const items = server.buildNoteItems(order, row);
    expect(server.computeTotalCostFromSubmission(row).subtotal).toBe(1_000);
    expect(items).toEqual([{ name: 'System Testing Fee (JFUTGRX)', qty: 1, price: 1_000, category: 'Lainnya' }]);
  });
});

describe('getVoucherInfo form Kilat selama rumus lama (opsi A, 16 Okt)', () => {
  const at = LEGACY_AT;
  test('JFUTGRX sah; kode ambassador belum memotong (bukan galat)', () => {
    expect(getVoucherInfo('JFUTGRX', 1, at, 'kilat')).toEqual({ isValid: true });
    const amb = KILAT_VOUCHER_CODES.find((c) => c !== 'JFUTGRX')!;
    expect(getVoucherInfo(amb, 1, at, 'kilat')).toMatchObject({ isValid: false, isError: false });
  });
  test('kode non-Kilat tetap ditolak sebagai galat', () => {
    expect(getVoucherInfo('JFUFEB', 1, at, 'kilat')).toMatchObject({ isValid: false, isError: true });
  });
});
