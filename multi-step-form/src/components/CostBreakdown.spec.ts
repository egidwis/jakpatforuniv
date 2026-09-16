import { describe, it, expect } from 'vitest';
import { isDetailVisible } from './CostBreakdown';

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
