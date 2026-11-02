import { describe, expect, it } from 'vitest';
import type { AdScheduleEntry } from '@/utils/supabase';
import { bundleVoucherEffect, type BulkCandidate } from './bulkInvoiceCandidates';

/*
  Dialog bulk adalah SATU-SATUNYA titik kendali nominal tagihan gabungan:
  server tidak menghitung ulang grup (create-payment.js menolak mencetak tagihan
  kedua untuk anggota grup). Jadi yang admin baca per pesanan di dialog harus
  persis yang ditagih.
*/

const OCT31 = '2026-10-31T07:39:36Z';
const entryOf = (over: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 'sch-1', submissionId: 'sub-1', ordinal: 1, isExtension: false, bookingId: 'S2E895RW', sourceId: 'sub-1',
  startDate: '2026-11-05T08:00:00Z', endDate: '2026-11-06T08:00:00Z', duration: 1,
  status: 'slot_reserved', reviewStatus: 'approved', paymentStatus: 'pending', distributionType: 'regular',
  kilatSlotHour: null, totalCost: 527_250, subtotal: 475_000, ppnAmount: 52_250, voucherCode: null,
  prizePerWinner: 35_000, winnerCount: 5, additionalPrizePerWinner: 0, isNewPeriod: false, periodBatch: '2026-11',
  slotBookedBy: 'admin', slotReservedAt: null, title: 'JAK2666', researcherName: 'Uji', university: null,
  submissionCreatedAt: OCT31, rateLockedAt: OCT31,
  ...over,
} as AdScheduleEntry);
const cand = (over: Partial<AdScheduleEntry> = {}, orderCreatedAt: string | null = OCT31, questionCount = 40): BulkCandidate =>
  ({ entry: entryOf(over), orderCreatedAt, questionCount, submissionId: 'sub-1', title: 'JAK2666' } as unknown as BulkCandidate);

describe('efek voucher per pesanan di dialog tagihan gabungan', () => {
  it('kosong → tidak ada keterangan', () => {
    expect(bundleVoucherEffect(cand(), '')).toBeNull();
  });

  it('order Iklan JAK2666 + JFU-SUHUDENDYEAR → potongan Rp 30.000', () => {
    expect(bundleVoucherEffect(cand(), 'jfu-suhudendyear')).toEqual({ applied: true, label: 'Voucher JFU-SUHUDENDYEAR: potongan Rp 30.000' });
  });

  it('salah ketik → tidak terpotong, kode tidak dikenal', () => {
    expect(bundleVoucherEffect(cand(), 'JFU-SUHUDEANDYEAR')).toMatchObject({ applied: false });
    expect(bundleVoucherEffect(cand(), 'JFU-SUHUDEANDYEAR')!.label).toContain('kode tidak dikenal sistem');
  });

  it('order lahir sesudah tenggat → tidak terpotong, menyebut tanggal', () => {
    const v = bundleVoucherEffect(cand({ rateLockedAt: '2027-01-05T00:00:00Z' }, '2027-01-05T00:00:00Z'), 'JFU-EHEF2026')!;
    expect(v.applied).toBe(false);
    expect(v.label).toContain('masa berlaku habis (s/d 31 Des 2026)');
  });

  it('perpanjangan ikut terpotong (instan voucher = tanggal ORDER)', () => {
    const v = bundleVoucherEffect(
      cand({ ordinal: 2, isExtension: true, rateLockedAt: '2026-11-20T00:00:00Z', isNewPeriod: true, startDate: '2026-11-25T08:00:00Z' }),
      'JFU-SUHUDENDYEAR',
    )!;
    expect(v).toMatchObject({ applied: true });
  });

  it('gelombang Kilat bertarif baru + kode Kilat → 10% tarif Kilat', () => {
    const v = bundleVoucherEffect(cand({ distributionType: 'kilat', rateLockedAt: '2026-10-28T00:00:00Z', duration: 1 }), 'JFU-SUHUDENDYEAR')!;
    expect(v.applied).toBe(true);
    expect(v.label).toMatch(/potongan Rp \d/);
  });

  it('gelombang Kilat + kode Iklan-saja → tidak berlaku untuk Kilat', () => {
    const v = bundleVoucherEffect(cand({ distributionType: 'kilat', rateLockedAt: '2026-10-28T00:00:00Z' }), 'TEGARGANTENG')!;
    expect(v).toMatchObject({ applied: false });
    expect(v.label).toContain('tidak berlaku untuk Kilat Survei');
  });

  it('JFUTGRX → terpotong (tagihan dipatok Rp 1.000)', () => {
    expect(bundleVoucherEffect(cand(), 'JFUTGRX')).toMatchObject({ applied: true });
  });
});
