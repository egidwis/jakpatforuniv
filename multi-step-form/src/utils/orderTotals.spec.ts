import { describe, it, expect } from 'vitest';
import { orderTotalOf } from './orderTotals';
import type { AdScheduleEntry } from './supabase';

/**
 * Bentuk minimal — `orderTotalOf` hanya membaca `totalCost`, dan uji ini
 * sengaja TIDAK mengisi kolom lain supaya ia gagal kalau helper-nya diam-diam
 * mulai bergantung pada sesuatu yang lain.
 */
const sched = (totalCost: unknown): AdScheduleEntry =>
  ({ totalCost } as unknown as AdScheduleEntry);

describe('orderTotalOf', () => {
  it('order berjadwal satu: totalnya harga jadwal itu', () => {
    expect(orderTotalOf([sched(233_100)])).toBe(233_100);
  });

  it('order tanpa jadwal: nol, bukan NaN', () => {
    expect(orderTotalOf([])).toBe(0);
  });

  it('MENJUMLAHKAN jadwal ke-2 — inilah yang form_submissions.total_cost lewatkan', () => {
    // Bentuk order `5e62e2eb` di produksi (2026-08-25): kolom induknya mencatat
    // 2.640.000 karena hanya menampung jadwal ke-1, sementara ordernya 5.830.000.
    const entries = [sched(2_640_000), sched(3_190_000)];
    expect(orderTotalOf(entries)).toBe(5_830_000);
    // Penjaga regresi terhadap kebiasaan lama: membaca jadwal pertama saja.
    expect(orderTotalOf(entries)).not.toBe(entries[0].totalCost);
  });

  it('lebih dari dua jadwal ikut semua', () => {
    expect(orderTotalOf([sched(100), sched(200), sched(300), sched(400)])).toBe(1_000);
  });

  it('jadwal berharga 0 tidak merusak jumlah', () => {
    // Jadwal ke-2 memang bisa bernilai 0 — harganya diketik tangan dan belum
    // punya rumus. Itu potret yang sah, bukan data rusak; jangan disaring.
    expect(orderTotalOf([sched(1_110_000), sched(0)])).toBe(1_110_000);
  });

  it('null/undefined/string dari DB dihitung sebagai 0, bukan NaN', () => {
    // `ad_schedules.total_cost` NUMERIC bisa sampai sebagai string lewat
    // PostgREST, dan baris warisan bisa NULL. Satu NaN mencemari SELURUH total.
    expect(orderTotalOf([sched(500_000), sched(null), sched(undefined)])).toBe(500_000);
    expect(orderTotalOf([sched('1500'), sched(500)])).toBe(2_000);
  });
});
