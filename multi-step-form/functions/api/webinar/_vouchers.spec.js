import { describe, it, expect } from 'vitest';
import {
  applyWebinarVoucher, resolveWebinarVoucher, VOUCHER_MESSAGES, WEBINAR_VOUCHERS,
} from './_vouchers.js';
import { calculateDiscount, VOUCHER_CATALOG } from '../../../src/utils/cost-calculator.ts';

const BEFORE_ALL_EXPIRY = Date.parse('2026-01-01T00:00:00Z');

describe('voucher webinar mengikuti katalog iklan/Kilat', () => {
  it('setiap kode di VOUCHER_CATALOG sudah diputuskan untuk webinar', () => {
    const webinarCodes = WEBINAR_VOUCHERS.map((v) => v.code).sort();
    expect(webinarCodes).toEqual(VOUCHER_CATALOG.map((v) => v.code).sort());
  });

  it('persen dan masa berlaku sama dengan iklan', () => {
    for (const v of WEBINAR_VOUCHERS.filter((x) => x.kind === 'percent')) {
      const ad = VOUCHER_CATALOG.find((c) => c.code === v.code);
      expect(v.validUntil, v.code).toBe(ad.validUntil);
      expect(calculateDiscount(v.code, 100_000, 0, 7, BEFORE_ALL_EXPIRY), v.code).toBe(100_000 * v.percent / 100);
    }
  });

  it('JFUTGRX = harga jadi Rp 1.000, sama dengan iklan', () => {
    expect(calculateDiscount('JFUTGRX', 50_000, 0, 7)).toBe(49_000);
    expect(applyWebinarVoucher(50_000, WEBINAR_VOUCHERS.find((v) => v.code === 'JFUTGRX'))).toBe(1000);
  });

  it('kode khusus iklan ditolak dengan kalimat produk', () => {
    for (const code of ['JFUFEB', 'ilkomuny']) {
      expect(resolveWebinarVoucher(code, BEFORE_ALL_EXPIRY)).toMatchObject({ ok: false, message: VOUCHER_MESSAGES.not_for_product });
    }
  });

  it('kedaluwarsa, pensiun, dan tak dikenal', () => {
    expect(resolveWebinarVoucher('JFUSUHUD', Date.parse('2026-11-03T00:00:00Z')).reason).toBe('expired');
    expect(resolveWebinarVoucher('JAKPATUNIV2025').reason).toBe('expired');
    expect(resolveWebinarVoucher('ASAL').reason).toBe('unknown');
    expect(resolveWebinarVoucher(' tegarganteng ').ok).toBe(true);
  });

  it('total tidak di bawah Rp 1.000 dan tidak di atas harga', () => {
    const ten = WEBINAR_VOUCHERS.find((v) => v.code === 'JFUTYR');
    expect(applyWebinarVoucher(1110, ten)).toBe(1000);
    expect(applyWebinarVoucher(50_000, ten)).toBe(45_000);
    expect(applyWebinarVoucher(1000, WEBINAR_VOUCHERS.find((v) => v.code === 'JFUTGRX'))).toBe(1000);
  });
});
