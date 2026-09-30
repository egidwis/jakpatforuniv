import { describe, it, expect } from 'vitest';
import { isDetailVisible, savingOf, introUntilOf, localizeDateVars } from './CostBreakdown';

/*
  Satu komponen, dua kedalaman — dan kedalamannya tidak boleh mengubah ISI.

  ⚠️ KENAPA BERKAS INI ADA. Sebelum `CostBreakdown` lahir, rincian biaya muncul
  di empat tempat dengan TIGA cara berbeda: Ringkasan menghitung lewat
  `calculateTotalCost`, halaman bayar memajang `submission.total_cost` mentah,
  dan kartu jadwal memakai `deriveScheduleMoney`. Tiga cara berarti tiga
  kesempatan untuk berselisih diam-diam.

  Yang dikunci di sini cuma keputusan yang bisa salah TANPA terlihat: kapan
  rinciannya terbuka. Proyek ini menguji logika murni — nol `@testing-library`
  di `package.json` — jadi keputusan itu tinggal sebagai fungsi, bukan di dalam
  badan komponen tempat tes tidak bisa menjangkaunya.
*/

describe('isDetailVisible — `full` tidak bisa ditutup', () => {
  it('full + tertutup → TETAP terlihat', () => {
    // Ringkasan adalah tempat angkanya masih bisa diubah (durasi, hadiah,
    // voucher). Rincian yang bisa tersembunyi di sana menyembunyikan justru
    // yang sedang diputuskan.
    expect(isDetailVisible('full', false)).toBe(true);
  });

  it('full + terbuka → terlihat', () => {
    expect(isDetailVisible('full', true)).toBe(true);
  });
});

describe('isDetailVisible — `compact` mengikuti state', () => {
  it('compact + tertutup → tersembunyi', () => {
    // Di halaman jadwal harganya sudah ditetapkan; yang diputuskan TANGGAL.
    // Rincian penuh di sana cuma bersaing dengan kalender.
    expect(isDetailVisible('compact', false)).toBe(false);
  });

  it('compact + terbuka → terlihat', () => {
    expect(isDetailVisible('compact', true)).toBe(true);
  });

  it('compact `defaultOpen` setara compact terbuka — BUKAN varian ketiga', () => {
    /*
      ⚠️ Perpanjangan memakai `compact` + `defaultOpen`, bukan `full`.
      Bedanya: `defaultOpen` hanya menentukan keadaan AWAL — peneliti tetap
      bisa menutupnya. Kalau perpanjangan memakai `full`, tombolnya hilang dan
      rinciannya tidak bisa ditutup sama sekali.

      Yang harus sama persis adalah ISI saat terbuka, dan itu dijamin oleh
      satu `BreakdownLine` yang sama — bukan oleh varian.
    */
    expect(isDetailVisible('compact', true)).toBe(isDetailVisible('full', true));
  });
});

describe('chip hemat vs chip harga perkenalan (keputusan 29 Sep 2026)', () => {
  const lines = [
    { label: 'Iklan', amount: 1_950_000 },
    { label: 'Harga perkenalan', amount: -750_000, tone: 'discount' as const, kind: 'intro' as const, hintVars: { date: '2026-11-30' } },
    { label: 'Diskon voucher', amount: -300_000, tone: 'discount' as const },
  ];

  it('"Kamu hemat" hanya menjumlah voucher — bukan selisih harga katalog', () => {
    expect(savingOf(lines)).toBe(300_000);
  });

  it('tanpa voucher, tidak ada klaim hemat sama sekali', () => {
    expect(savingOf(lines.slice(0, 2))).toBe(0);
  });

  it('chip perkenalan membaca tanggal akhirnya dari baris', () => {
    expect(introUntilOf(lines)).toBe('2026-11-30');
    expect(introUntilOf([lines[0]])).toBeNull();
  });

  it('tanggal dilokalkan per bahasa, tanpa bergeser sehari', () => {
    expect(localizeDateVars({ date: '2026-12-31' }, 'id')?.date).toMatch(/31 Des 2026/);
    expect(localizeDateVars({ date: '2026-12-31' }, 'en')?.date).toMatch(/31 Dec 2026/);
    expect(localizeDateVars({ d: 3 }, 'id')).toEqual({ d: 3 });
  });
});
