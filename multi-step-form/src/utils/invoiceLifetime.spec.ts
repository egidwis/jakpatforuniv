import { describe, it, expect } from 'vitest';
import {
  invoiceLifetimeMinutes,
  MAX_INVOICE_MINUTES,
  MIN_INVOICE_MINUTES,
} from './payment';

/*
  Umur link DOKU harus mengikuti jadwal yang dibiayainya.

  Order af004b84 (2026-09-02): tagihan terbit 10.25 WIB, jadwalnya dibatalkan
  10.44, dan link-nya masih menagih sampai 9 Sep karena `payment_due_date`
  dipatok 60*24*7. Peneliti membayarnya jam 20.10 keesokan harinya — Rp 444.000
  masuk ke jadwal yang sudah tidak ada.

  Batas bawahnya SENGAJA menolak, bukan meng-clamp: link yang lahir sekarat
  lebih buruk daripada penolakan yang jelas.
*/

// 14.00 WIB = 07:00 UTC pada hari yang sama.
const cutoffUtc = (ymd: string) => new Date(`${ymd}T07:00:00.000Z`);
const minutesBefore = (ymd: string, mins: number) =>
  new Date(cutoffUtc(ymd).getTime() - mins * 60000);

describe('invoiceLifetimeMinutes', () => {
  it('tanpa tanggal tayang jatuh ke batas atas 7 hari (jalur warisan)', () => {
    expect(invoiceLifetimeMinutes(undefined)).toBe(MAX_INVOICE_MINUTES);
  });

  it('jadwal jauh hari tetap dibatasi 7 hari, tidak lebih', () => {
    // Cutoff 30 hari lagi — tanpa batas atas, link hidup sebulan.
    const now = new Date('2026-09-04T07:00:00.000Z');
    expect(invoiceLifetimeMinutes('2026-10-04', now)).toBe(MAX_INVOICE_MINUTES);
  });

  it('jadwal dekat memakai sisa waktu sampai cutoff 14.00 WIB', () => {
    expect(invoiceLifetimeMinutes('2026-09-04', minutesBefore('2026-09-04', 600))).toBe(600);
  });

  it('tepat di lantai 60 menit masih diterbitkan', () => {
    expect(invoiceLifetimeMinutes('2026-09-04', minutesBefore('2026-09-04', MIN_INVOICE_MINUTES)))
      .toBe(MIN_INVOICE_MINUTES);
  });

  it('kurang dari 60 menit lagi → null, dan pemanggil WAJIB menolak', () => {
    // Ini titik keputusannya: meng-clamp ke 60 menit akan menerbitkan link yang
    // hidup melewati cutoff — menagih untuk jadwal yang haknya sudah lewat.
    expect(invoiceLifetimeMinutes('2026-09-04', minutesBefore('2026-09-04', 59))).toBeNull();
  });

  it('cutoff yang sudah lewat → null, bukan angka negatif', () => {
    // Tanpa penjaga ini `payment_due_date` negatif dikirim ke DOKU.
    expect(invoiceLifetimeMinutes('2026-09-04', new Date('2026-09-04T09:00:00.000Z'))).toBeNull();
    expect(invoiceLifetimeMinutes('2026-09-01', new Date('2026-09-04T00:00:00.000Z'))).toBeNull();
  });

  it('sadar-WIB, bukan sadar-jam-device', () => {
    // Mesin admin tidak selalu di WIB. Instant yang sama harus menghasilkan
    // angka yang sama apa pun offset lokalnya — `paymentCutoffInstant` yang
    // menjaminnya, jadi yang diuji di sini instant-nya, bukan string lokal.
    const sameInstant = new Date(1788505200000); // fixed epoch
    expect(invoiceLifetimeMinutes('2026-09-10', sameInstant))
      .toBe(invoiceLifetimeMinutes('2026-09-10', new Date(sameInstant.getTime())));
  });

  it('lantainya sama dengan default create-payment.js', () => {
    // `const dueDate = Number(paymentDueDate) > 0 ? … : 60` — konvensi berkas
    // ini. Dua angka berbeda berarti dua definisi "terlalu pendek".
    expect(MIN_INVOICE_MINUTES).toBe(60);
  });
});
