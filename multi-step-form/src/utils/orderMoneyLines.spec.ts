import { describe, it, expect } from 'vitest';
import { orderMoneyLines } from './orderMoneyLines';
import type { CostCalculation } from '../types';

/*
  Jembatan `CostCalculation` → `MoneyLine[]`, supaya Ringkasan dan kartu jadwal
  merender lewat SATU jalur.

  ⚠️ KENAPA BERKAS INI ADA. Ringkasan menghitung dengan `calculateTotalCost`
  (bentuk `CostCalculation`) sementara kartu jadwal memakai `deriveScheduleMoney`
  (bentuk `MoneyLine[]`). Keduanya menggambar baris rincian sendiri-sendiri,
  jadi urutan baris, tanda minus diskon, dan label bisa menyimpang tanpa ada
  yang menyadarinya.

  Modul ini TIDAK menghitung apa pun — ia hanya memetakan bentuk. Setiap angka
  datang apa adanya dari `CostCalculation`; menghitung ulang di sini akan
  melahirkan sumber kebenaran ketiga, persis yang sedang ditutup.
*/

const calcOf = (over: Partial<CostCalculation> = {}): CostCalculation => ({
  adCost: 300_000,
  incentiveCost: 100_000,
  subtotal: 400_000,
  ppn: 44_000,
  totalCost: 444_000,
  discount: 0,
  ...over,
});

const labels = (lines: ReturnType<typeof orderMoneyLines>) => lines.map((l) => l.label);

describe('orderMoneyLines — baris dasar', () => {
  it('iklan & reward selalu ada, PPN selalu terakhir', () => {
    const lines = orderMoneyLines(calcOf(), { questionCount: 20, duration: 7 });
    expect(labels(lines)).toEqual(['Iklan', 'Reward', 'Subtotal (DPP)', 'PPN 11%']);
  });

  it('angkanya diteruskan APA ADANYA, tidak dihitung ulang', () => {
    const lines = orderMoneyLines(
      calcOf({ adCost: 777_000, incentiveCost: 123_000, ppn: 99_000 }),
      { questionCount: 20, duration: 7 },
    );
    expect(lines.find((l) => l.label === 'Iklan')?.amount).toBe(777_000);
    expect(lines.find((l) => l.label === 'Reward')?.amount).toBe(123_000);
    expect(lines.find((l) => l.label === 'PPN 11%')?.amount).toBe(99_000);
  });

  it('reward nol → barisnya dilewati, bukan ditampilkan 0', () => {
    const lines = orderMoneyLines(calcOf({ incentiveCost: 0 }), { questionCount: 20, duration: 7 });
    expect(labels(lines)).not.toContain('Reward');
  });
});

describe('orderMoneyLines — diskon NEGATIF, sama seperti deriveScheduleMoney', () => {
  it('diskon muncul sebagai angka negatif ber-tone discount', () => {
    // Kalau tandanya positif, `CostBreakdown` merendernya tanpa "-" dan
    // diskon terbaca seperti biaya tambahan.
    const lines = orderMoneyLines(
      calcOf({ discount: 60_000 }),
      { questionCount: 20, duration: 7, voucherCode: 'JFUFEB' },
    );
    const d = lines.find((l) => l.tone === 'discount');
    expect(d?.amount).toBe(-60_000);
    expect(d?.label).toContain('JFUFEB');
  });

  it('diskon nol → tidak ada baris diskon', () => {
    const lines = orderMoneyLines(calcOf({ discount: 0 }), { questionCount: 20, duration: 7 });
    expect(lines.some((l) => l.tone === 'discount')).toBe(false);
  });
});

describe('orderMoneyLines — Kilat', () => {
  it('add-on muncul ber-tone addon', () => {
    const lines = orderMoneyLines(
      calcOf({ kilatAddonCost: 150_000 }),
      { questionCount: 20, duration: 1, isKilat: true },
    );
    const a = lines.find((l) => l.tone === 'addon');
    expect(a?.amount).toBe(150_000);
  });

  it('Kilat: hint iklan TIDAK menyebut durasi', () => {
    // Kilat selesai ~2 jam; "× 1 hari" mengesankan durasi yang tidak berlaku.
    const lines = orderMoneyLines(
      calcOf({ kilatAddonCost: 150_000 }),
      { questionCount: 20, duration: 1, isKilat: true },
    );
    expect(lines.find((l) => l.label === 'Iklan')?.hint).not.toContain('hari');
  });

  it('non-Kilat: hint iklan menyebut jumlah soal & durasi', () => {
    const lines = orderMoneyLines(calcOf(), { questionCount: 20, duration: 7 });
    expect(lines.find((l) => l.label === 'Iklan')?.hint).toBe('20 Qs × 7 hari');
  });
});

describe('orderMoneyLines — Subtotal (DPP)', () => {
  it('DPP hadir, ditandai isSubtotal, dan bernilai calc.subtotal', () => {
    /*
      ⚠️ Blok lama di Ringkasan menampilkan DPP. Ia BUKAN hiasan: PPN 11%
      dihitung DARI angka ini, jadi tanpa ia peneliti tidak bisa memverifikasi
      pajaknya sendiri.
    */
    const lines = orderMoneyLines(calcOf({ subtotal: 400_000 }), { questionCount: 20, duration: 7 });
    const dpp = lines.find((l) => l.isSubtotal);
    expect(dpp?.amount).toBe(400_000);
    expect(dpp?.label).toContain('DPP');
  });

  it('DPP tepat SEBELUM PPN — pajak harus berdampingan dengan dasarnya', () => {
    const lines = orderMoneyLines(calcOf(), { questionCount: 20, duration: 7 });
    const iDpp = lines.findIndex((l) => l.isSubtotal);
    const iPpn = lines.findIndex((l) => l.label === 'PPN 11%');
    expect(iPpn).toBe(iDpp + 1);
  });

  it('⚠️ DPP + PPN = total; baris komponen TIDAK ikut dijumlah', () => {
    /*
      Jebakan menghitung ganda: menjumlahkan SELURUH baris akan melebihi total,
      karena DPP sudah merangkum baris di atasnya. Hanya baris rangkuman + PPN
      yang boleh dijumlahkan.
    */
    const calc = calcOf({ discount: 60_000, subtotal: 340_000, ppn: 37_400, totalCost: 377_400 });
    const lines = orderMoneyLines(calc, { questionCount: 20, duration: 7, voucherCode: 'JFUFEB' });

    const dpp = lines.find((l) => l.isSubtotal)!.amount;
    const ppn = lines.find((l) => l.label === 'PPN 11%')!.amount;
    expect(dpp + ppn).toBe(calc.totalCost);

    // Komponen di atas DPP harus benar-benar berjumlah DPP.
    const komponen = lines
      .filter((l) => !l.isSubtotal && l.label !== 'PPN 11%')
      .reduce((a, l) => a + l.amount, 0);
    expect(komponen).toBe(dpp);
  });
});

describe('orderMoneyLines — urutan sama dengan deriveScheduleMoney', () => {
  it('Iklan → Diskon → Add-on → Reward → PPN', () => {
    /*
      ⚠️ Urutannya sengaja dicocokkan dengan `deriveScheduleMoney`: peneliti
      melihat rincian yang sama di Ringkasan dan di kartu jadwal, dan urutan
      yang berbeda membuat keduanya terasa seperti dua tagihan.
    */
    const lines = orderMoneyLines(
      calcOf({ discount: 60_000, kilatAddonCost: 150_000 }),
      { questionCount: 20, duration: 1, isKilat: true, voucherCode: 'JFUFEB' },
    );
    expect(labels(lines)).toEqual([
      'Iklan', 'Diskon Voucher (JFUFEB)', 'Add-on JFU Kilat', 'Reward',
      'Subtotal (DPP)', 'PPN 11%',
    ]);
  });
});
