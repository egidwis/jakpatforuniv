import { describe, it, expect, vi, afterEach } from 'vitest';
import { repickEstimate } from './repickPrice';
import type { AdScheduleEntry } from './supabase';

afterEach(() => vi.useRealTimers());

// Pick yang cukup untuk deriveScheduleMoney; sisanya tak dibaca.
const entry = {
  id: 's1', ordinal: 1, duration: 1, status: 'requested', distributionType: 'regular',
  startDate: '2026-10-16T08:00:00Z', totalCost: 166500, subtotal: 150000, ppnAmount: 16500, voucherCode: null,
  prizePerWinner: 0, winnerCount: 0, additionalPrizePerWinner: 0, isNewPeriod: false,
  rateLockedAt: '2026-10-15T03:00:00Z', submissionCreatedAt: '2026-10-15T03:00:00Z',
} as unknown as AdScheduleEntry;

describe('repickEstimate — harga pilih ulang = tarif HARI INI (sql/103)', () => {
  it('mengabaikan total tersimpan & instan tarif lama', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-02T03:00:00Z')); // tarif Des: tier 0 = 160.000
    const m = repickEstimate(entry, { question_count: 10, distribution_type: 'regular', voucher_code: null });
    expect(m.isEstimate).toBe(true);
    expect(m.total).toBe(160000 + 17600);
  });

  it('jadwal batal tetap ditawar sebagai pemesanan baru, bukan Rp 0', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T03:00:00Z')); // Okt: 150.000
    const m = repickEstimate({ ...entry, status: 'cancelled' } as AdScheduleEntry, { question_count: 10, distribution_type: 'regular', voucher_code: null });
    expect(m.total).toBe(150000 + 16500);
  });

  it('durasi baru ikut dihitung', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T03:00:00Z'));
    const m = repickEstimate(entry, { question_count: 10, distribution_type: 'regular', voucher_code: null }, { duration: 3 });
    expect(m.total).toBe(450000 + 49500);
  });

  it('order yang BELUM PERNAH bertanggal: tarif tetap instan order (trigger tak menyentuhnya)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-02T03:00:00Z')); // Des 160.000, tapi order lahir Okt
    const m = repickEstimate({ ...entry, startDate: null } as unknown as AdScheduleEntry, { question_count: 10, distribution_type: 'regular', voucher_code: null });
    expect(m.total).toBe(150000 + 16500);
  });

  it('dilepas (tanggal & instan tarif kosong) → tarif sekarang', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-02T03:00:00Z'));
    const m = repickEstimate({ ...entry, startDate: null, rateLockedAt: null } as unknown as AdScheduleEntry, { question_count: 10, distribution_type: 'regular', voucher_code: null });
    expect(m.total).toBe(160000 + 17600);
  });
});
