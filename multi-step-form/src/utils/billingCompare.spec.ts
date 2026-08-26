import { describe, it, expect } from 'vitest';
import { isLiveInvoice, recordedVsBilled, type BillingEvent } from './billingCompare';

const ev = (over: Partial<BillingEvent> = {}): BillingEvent => ({
  amount: 100, isPaid: false, isPending: true, isSuperseded: false,
  isStale: false, source: 'invoice', ...over,
});

describe('isLiveInvoice', () => {
  it('lunas selalu ikut dihitung, apa pun sisanya', () => {
    expect(isLiveInvoice(ev({ isPaid: true, isPending: false, isStale: true, isSuperseded: true })))
      .toBe(true);
  });

  it('pending dari `invoices` ikut; checkout yang ditinggalkan tidak', () => {
    expect(isLiveInvoice(ev())).toBe(true);
    // Baris `transactions` pending tanpa invoice — nol rupiah pernah ditagihkan.
    expect(isLiveInvoice(ev({ source: 'transaction' }))).toBe(false);
  });

  it('pending yang tersusul atau basi tidak ikut', () => {
    expect(isLiveInvoice(ev({ isSuperseded: true }))).toBe(false);
    expect(isLiveInvoice(ev({ isStale: true }))).toBe(false);
  });
});

describe('recordedVsBilled', () => {
  const recorded = (total: number) => ({ total, isEstimate: false });

  it('menyalakan selisih #A85YGANA: tercatat 288.600, ditagih 399.600', () => {
    // Kasus nyata yang memulai pekerjaan ini. 31 pertanyaan = Rp 300.000/hari,
    // tapi harganya dibekukan di tier <=30 (Rp 200.000).
    expect(recordedVsBilled(recorded(288_600), [ev({ amount: 399_600, isPaid: true, isPending: false })]))
      .toEqual({ billed: 399_600, recorded: 288_600, delta: 111_000 });
  });

  it('selisih ke arah sebaliknya juga disebut', () => {
    // "Kuesioner Kesehatan Mental Mahasiswa": tercatat LEBIH TINGGI dari tagihan.
    const r = recordedVsBilled(recorded(499_500), [ev({ amount: 388_500, isPaid: true, isPending: false })]);
    expect(r?.delta).toBe(-111_000);
  });

  it('diam saat cocok', () => {
    expect(recordedVsBilled(recorded(399_600), [ev({ amount: 399_600, isPaid: true })])).toBeNull();
  });

  it('diam untuk harga yang masih estimasi', () => {
    // Penawaran, bukan catatan — membandingkannya dengan tagihan tidak berarti.
    expect(recordedVsBilled({ total: 288_600, isEstimate: true }, [ev({ amount: 399_600, isPaid: true })]))
      .toBeNull();
  });

  it('diam saat tidak ada tagihan hidup sama sekali', () => {
    expect(recordedVsBilled(recorded(288_600), [])).toBeNull();
    expect(recordedVsBilled(recorded(288_600), [ev({ isPending: false, isPaid: false })])).toBeNull();
  });

  it('diam saat jadwalnya punya lebih dari satu tagihan hidup', () => {
    // Tagihan susulan itu SAH; jumlahnya memang tidak harus sama dengan harga
    // tercatat. Menyalakan peringatan di sini berarti menuduh keadaan benar.
    expect(recordedVsBilled(recorded(1_470_750), [
      ev({ amount: 1_470_750, isPaid: true, isPending: false }),
      ev({ amount: 61_050, isPaid: true, isPending: false }),
    ])).toBeNull();
  });

  it('tagihan mati tidak ikut, jadi satu tagihan hidup tetap terbaca satu', () => {
    const r = recordedVsBilled(recorded(288_600), [
      ev({ amount: 288_600, isPending: true, isSuperseded: true }), // tersusul
      ev({ amount: 399_600, isPaid: true, isPending: false }),
    ]);
    expect(r?.billed).toBe(399_600);
  });
});
