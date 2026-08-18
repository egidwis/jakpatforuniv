import { describe, expect, test, afterEach, vi } from 'vitest';
import { calculateDiscount, getVoucherInfo } from './cost-calculator';
// Salinan harga sisi server. Ia Cloudflare Pages Function berformat .js tanpa
// tipe, dan SENGAJA dibiarkan begitu: menaruh .d.ts di dalam functions/ berisiko
// dirutekan Cloudflare sebagai endpoint, karena routing di sana berbasis path
// berkas. Satu @ts-ignore di berkas tes lebih murah daripada itu.
// @ts-ignore -- Pages Function tanpa deklarasi tipe, lihat alasan di atas
import { calculateDiscount as serverCalculateDiscount, computeTotalCostFromSubmission } from '../../functions/api/doku/create-payment.js';

// Semua instant ditulis UTC. WIB = UTC+7.
//   31 Agu 2026 23.59 WIB = 2026-08-31T16:59Z  → masih berlaku
//    1 Sep 2026 00.00 WIB = 2026-08-31T17:00Z  → sudah mati
const MENIT_TERAKHIR = Date.parse('2026-08-31T16:59:00Z');
const TEPAT_TUTUP = Date.parse('2026-08-31T17:00:00Z');

const AD_COST = 500_000;

afterEach(() => {
  vi.useRealTimers();
});

describe('masa berlaku JFUSUHUD (sisi klien)', () => {
  test('diskon 10% masih berlaku pada menit terakhir 31 Agustus 2026', () => {
    expect(calculateDiscount('JFUSUHUD', AD_COST, 0, 1, MENIT_TERAKHIR)).toBe(50_000);
  });

  test('diskon hilang tepat saat 1 September 2026 masuk', () => {
    expect(calculateDiscount('JFUSUHUD', AD_COST, 0, 1, TEPAT_TUTUP)).toBe(0);
  });

  test('voucher lain tidak ikut mati — ILKOMUNY masih hidup di 1 September 2026', () => {
    expect(getVoucherInfo('ILKOMUNY', 7, TEPAT_TUTUP).isValid).toBe(true);
  });
});

describe('peneliti diberi tahu sebelum kehilangan, bukan sesudah', () => {
  test('pesan voucher yang masih berlaku sudah menyebut tanggal berakhirnya', () => {
    const info = getVoucherInfo('JFUSUHUD', 1, MENIT_TERAKHIR);
    expect(info.isValid).toBe(true);
    expect(info.message).toContain('31 Agu 2026');
  });

  test('sesudah lewat batas voucher ditolak dan pintu Kilat ikut tertutup', () => {
    const info = getVoucherInfo('JFUSUHUD', 1, TEPAT_TUTUP);
    expect(info.isValid).toBe(false);
    expect(info.isKilatEligible).toBeFalsy();
  });
});

// Komentar di kepala create-payment.js menuntut kedua salinan harga selalu
// diubah bersamaan, tapi sampai sekarang tidak ada yang menjaganya. Tes ini
// yang menjaga.
describe('salinan server sepakat dengan klien', () => {
  test('server juga mematikan diskon JFUSUHUD pada 1 September 2026', () => {
    expect(serverCalculateDiscount('JFUSUHUD', AD_COST, 0, 1, TEPAT_TUTUP)).toBe(
      calculateDiscount('JFUSUHUD', AD_COST, 0, 1, TEPAT_TUTUP),
    );
  });

  test('server masih memberi diskon yang sama di menit terakhir', () => {
    expect(serverCalculateDiscount('JFUSUHUD', AD_COST, 0, 1, MENIT_TERAKHIR)).toBe(
      calculateDiscount('JFUSUHUD', AD_COST, 0, 1, MENIT_TERAKHIR),
    );
  });
});

describe('harga dikunci ke tanggal order, bukan ke jam pembayaran', () => {
  const subDasar = {
    question_count: 37,
    duration: 1,
    winner_count: 0,
    prize_per_winner: 0,
    distribution_type: 'regular',
  };

  test('order yang lahir 17 Agustus tetap didiskon walau baru dibayar 5 September', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T03:00:00Z'));

    const denganVoucher = computeTotalCostFromSubmission({
      ...subDasar,
      voucher_code: 'JFUSUHUD',
      created_at: '2026-08-17T03:00:00Z',
    });
    const tanpaVoucher = computeTotalCostFromSubmission({
      ...subDasar,
      voucher_code: null,
      created_at: '2026-08-17T03:00:00Z',
    });

    expect(denganVoucher.total).toBeLessThan(tanpaVoucher.total);
  });

  test('order yang lahir SESUDAH batas tidak lagi didiskon', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T03:00:00Z'));

    const denganVoucher = computeTotalCostFromSubmission({
      ...subDasar,
      voucher_code: 'JFUSUHUD',
      created_at: '2026-09-01T03:00:00Z',
    });
    const tanpaVoucher = computeTotalCostFromSubmission({
      ...subDasar,
      voucher_code: null,
      created_at: '2026-09-01T03:00:00Z',
    });

    expect(denganVoucher.total).toBe(tanpaVoucher.total);
  });
});
