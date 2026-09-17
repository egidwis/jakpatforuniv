import { describe, it, expect } from 'vitest';
import { deriveScheduleMoney } from './scheduleMoney';
import type { AdScheduleEntry } from './supabase';

/*
  ⚠️ RINCIAN WAJIB MENJUMLAH KE TOTAL YANG DITAGIHKAN.

  Insiden #2KT24KKK (17 Sep 2026): halaman bayar memajang
  "Iklan Rp 300.000 + PPN Rp 33.000" di atas total "Rp 1.110". Peneliti
  melihat total yang membantah rinciannya sendiri, tepat di layar tempat ia
  diminta membayar — dan jumlah yang benar justru yang KECIL, jadi bukan
  sekadar salah tampil: ia membuat tagihan yang sah terlihat palsu.

  Sebabnya: `ad_schedules.voucher_code` NULL untuk perpanjangan. Voucher
  diwariskan saat MENAGIH (`create-payment.js`: `billingVoucher ||
  scheduleVoucher || base.voucher_code`), bukan saat menjadwalkan. Halaman
  menghitung ulang tanpa voucher, lalu memajangnya di sebelah total yang
  memakai voucher.
*/

const entryOf = (o: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 'x', submissionId: 'y', ordinal: 3, isExtension: true, bookingId: '2KT24KKK',
  sourceId: 's', startDate: null, endDate: null, duration: 1,
  status: 'waiting_payment', reviewStatus: '', paymentStatus: 'pending',
  distributionType: 'regular', kilatSlotHour: null,
  totalCost: 0, subtotal: null, ppnAmount: null,
  voucherCode: null, prizePerWinner: 0, winnerCount: 0,
  additionalPrizePerWinner: 0, isNewPeriod: false,
  ...o,
} as AdScheduleEntry);

const sum = (m: ReturnType<typeof deriveScheduleMoney>) =>
  (m.lines ?? []).reduce((a, l) => a + l.amount, 0);

describe('rincian vs tagihan nyata', () => {
  it('TANPA voucher tagihan: baris meleset dari tagihan — ini bugnya', () => {
    // Bentuk yang dilihat peneliti sebelum perbaikan: 300.000 + 33.000.
    const m = deriveScheduleMoney(entryOf(), { question_count: 34, distribution_type: 'regular' });
    expect(sum(m)).toBe(333000);
    expect(sum(m)).not.toBe(1110);
  });

  it('DENGAN voucher tagihan dioper: baris menjumlah persis ke Rp 1.110', () => {
    /*
      Angka nyata dari produksi: invoices.amount = 1110,
      invoices.voucher_code = 'JFUTGRX', question_count = 34, duration = 1.
    */
    const m = deriveScheduleMoney(
      entryOf({ voucherCode: 'JFUTGRX' }),
      { question_count: 34, distribution_type: 'regular' },
    );
    expect(m.total).toBe(1110);
    expect(sum(m)).toBe(1110);
    expect((m.lines ?? []).some((l) => l.tone === 'discount')).toBe(true);
  });

  it('baris diskon menyebut kode voucher yang benar-benar menagih', () => {
    const m = deriveScheduleMoney(
      entryOf({ voucherCode: 'JFUTGRX' }),
      { question_count: 34, distribution_type: 'regular' },
    );
    const diskon = (m.lines ?? []).find((l) => l.tone === 'discount');
    expect(diskon?.labelVars).toEqual({ code: 'JFUTGRX' });
  });
});
