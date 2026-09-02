import { describe, it, expect } from 'vitest';
import {
  ADMIN_INVOICE_LIFETIME_MS,
  invoiceReadyMessage,
  normalizePhone,
  paymentDeadline,
  slotBookedMessage,
  waLink,
} from './waMessage';

// 15.00 WIB = 08:00 UTC; batas bayar 14.00 WIB = 07:00 UTC hari yang sama.
const airing = (ymd: string) => `${ymd}T08:00:00.000Z`;
const cutoff = (ymd: string) => `${ymd}T07:00:00.000Z`;

describe('normalizePhone', () => {
  it('mengubah awalan 0 jadi 62', () => {
    expect(normalizePhone('081234567890')).toBe('6281234567890');
  });

  it('membuang +, spasi, dan tanda hubung', () => {
    expect(normalizePhone('+62 812-3456-7890')).toBe('6281234567890');
    expect(normalizePhone('0812 3456 7890')).toBe('6281234567890');
  });

  it('membiarkan nomor yang sudah 62', () => {
    expect(normalizePhone('6281234567890')).toBe('6281234567890');
  });

  it('null untuk nomor kosong / tidak ada', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('-')).toBeNull();
  });

  it('null untuk potongan nomor yang terlalu pendek', () => {
    // Kolom terisi setengah. Kalau ini lolos, wa.me membuka obrolan dengan
    // orang lain alih-alih gagal — kegagalan yang menyamar jadi keberhasilan.
    expect(normalizePhone('0812')).toBeNull();
  });
});

describe('waLink', () => {
  it('menyusun url wa.me dengan pesan ter-encode', () => {
    const link = waLink('081234567890', 'Halo Kak Budi,\nApa kabar?');
    expect(link).toBe('https://wa.me/6281234567890?text=Halo%20Kak%20Budi%2C%0AApa%20kabar%3F');
  });

  it('null kalau nomornya tidak bisa dipakai', () => {
    expect(waLink('', 'apa pun')).toBeNull();
  });
});

describe('paymentDeadline', () => {
  const issued = new Date('2026-09-01T02:00:00.000Z');

  it('memilih 14.00 WIB hari tayang saat itu lebih awal dari umur 7 hari', () => {
    // Justru kasus yang paling sering: tayang lusa, tapi tagihannya "berlaku
    // 7 hari". Janji 7 hari itu dilanggar sistem sendiri 4 hari kemudian.
    const d = paymentDeadline([airing('2026-09-03')], issued);
    expect(d.toISOString()).toBe(cutoff('2026-09-03'));
  });

  it('jatuh ke umur 7 hari saat tayangnya masih jauh', () => {
    const d = paymentDeadline([airing('2026-10-01')], issued);
    expect(d.getTime()).toBe(issued.getTime() + ADMIN_INVOICE_LIFETIME_MS);
  });

  it('grup: mengambil tenggat PALING AWAL di antara bundel', () => {
    // Grupnya atomik — tidak bisa dibayar sebagian — jadi jadwal terdekat yang
    // menentukan kapan uangnya harus masuk.
    const d = paymentDeadline(
      [airing('2026-09-10'), airing('2026-09-04'), airing('2026-09-07')],
      issued,
    );
    expect(d.toISOString()).toBe(cutoff('2026-09-04'));
  });

  it('jadwal tanpa tanggal tidak menyumbang tenggat', () => {
    const d = paymentDeadline([null, undefined, ''], issued);
    expect(d.getTime()).toBe(issued.getTime() + ADMIN_INVOICE_LIFETIME_MS);
  });

  it('mengabaikan tanggal yang tidak sah alih-alih mengembalikan Invalid Date', () => {
    const d = paymentDeadline(['bukan tanggal', airing('2026-09-03')], issued);
    expect(d.toISOString()).toBe(cutoff('2026-09-03'));
  });
});

describe('invoiceReadyMessage', () => {
  const issued = new Date('2026-09-01T02:00:00.000Z');

  it('tagihan tunggal: nominal id-ID, link, dan tenggat 14.00 WIB', () => {
    const msg = invoiceReadyMessage({
      researcherName: 'Budi',
      bundles: [{ title: 'Persepsi Mahasiswa', startDate: airing('2026-09-03') }],
      amount: 1165500,
      invoiceUrl: 'https://pay.example/abc',
      issuedAt: issued,
    });
    expect(msg).toContain('Halo Kak Budi,');
    expect(msg).toContain('Rp 1.165.500');
    expect(msg).toContain('https://pay.example/abc');
    expect(msg).toContain('pukul 14.00 WIB');
    // Tunggal tidak boleh menjanjikan "dibayar sekaligus".
    expect(msg).not.toContain('sekaligus');
  });

  it('grup: menyebut SEMUA survei dan tenggat paling awal', () => {
    const msg = invoiceReadyMessage({
      researcherName: 'Budi',
      bundles: [
        { title: 'Survei A', startDate: airing('2026-09-10') },
        { title: 'Survei B', startDate: airing('2026-09-04') },
      ],
      amount: 2331000,
      invoiceUrl: 'https://pay.example/xyz',
      issuedAt: issued,
    });
    expect(msg).toContain('Survei A');
    expect(msg).toContain('Survei B');
    expect(msg).toContain('2 pesanan');
    expect(msg).toContain('sekaligus dalam satu link');
    // Tenggat 4 Sep, bukan 10 Sep — satu link tidak bisa dibayar sebagian.
    expect(msg).toContain('4 September 2026');
    expect(msg).not.toContain('10 September 2026');
  });

  it('jatuh ke sapaan netral tanpa nama', () => {
    const msg = invoiceReadyMessage({
      bundles: [{ title: 'Survei A' }],
      amount: 100000,
      invoiceUrl: 'https://pay.example/a',
      issuedAt: issued,
    });
    expect(msg).toContain('Halo Kak Peneliti,');
  });
});

describe('slotBookedMessage', () => {
  it('menyebut tanggal tayang dan kode jadwal', () => {
    const msg = slotBookedMessage({
      researcherName: 'Siti',
      title: 'Persepsi Mahasiswa',
      startDate: airing('2026-09-05'),
      bookingId: 'K3M9PQ7T',
    });
    expect(msg).toContain('Halo Kak Siti,');
    expect(msg).toContain('Persepsi Mahasiswa');
    expect(msg).toContain('5 Sep');
    expect(msg).toContain('#K3M9PQ7T');
  });

  it('TIDAK menyebut nominal atau tenggat — tagihannya belum ada', () => {
    // Angka yang dikutip sebelum tagihan terbit akan dibantah tagihannya sendiri.
    const msg = slotBookedMessage({
      title: 'Survei A',
      startDate: airing('2026-09-05'),
    });
    expect(msg).not.toMatch(/Rp/);
    expect(msg).not.toContain('14.00 WIB');
  });
});
