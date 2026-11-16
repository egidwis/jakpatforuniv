import { describe, it, expect } from 'vitest';
import {
  ADMIN_INVOICE_LIFETIME_MS,
  invoiceReadyMessage,
  normalizeItemName,
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
    expect(msg).toContain('agar iklan bisa tayang sesuai jadwal');
    expect(msg).toContain('Judul survei: Persepsi Mahasiswa');
    expect(msg).toContain('Jadwal tayang: Kam, 3 Sep pukul 15.00 WIB');
    // Tunggal tidak boleh memakai link pembayaran gabungan.
    expect(msg).toContain('Link pembayaran: https://pay.example/abc');
    expect(msg).not.toContain('Link pembayaran gabungan:');
  });

  it('mengubah istilah Insentif / Respondent\'s Incentive ke Reward', () => {
    expect(normalizeItemName("Respondent's Incentive")).toBe('Reward Responden');
    expect(normalizeItemName('Insentif Responden')).toBe('Reward Responden');
    expect(normalizeItemName('Insentif')).toBe('Reward');
    expect(normalizeItemName("Respondent's Incentive (New Batch)")).toBe('Reward Responden (Batch Baru)');
  });

  it('menyertakan rincian biaya jika ada items, subtotal, dan ppn dengan istilah Reward', () => {
    const msg = invoiceReadyMessage({
      researcherName: 'Tri',
      bundles: [{ title: 'Survei Tri', startDate: airing('2026-11-11') }],
      items: [
        { name: 'Iklan Kuesioner', qty: 3, price: 45000, total: 135000 },
        { name: 'Insentif Responden', qty: 1, price: 50000, total: 50000 },
      ],
      subtotal: 185000,
      ppn: 20350,
      amount: 205350,
      invoiceUrl: 'https://pay.example/tri',
      issuedAt: issued,
    });
    expect(msg).toContain('Rincian biaya:');
    expect(msg).toContain('Iklan Kuesioner (3x): Rp 135.000');
    expect(msg).toContain('Reward Responden: Rp 50.000');
    expect(msg).not.toContain('• Iklan Kuesioner');
    expect(msg).not.toContain('Insentif');
    expect(msg).toContain('Subtotal: Rp 185.000');
    expect(msg).toContain('PPN (11%): Rp 20.350');
    expect(msg).toContain('Total: Rp 205.350');
    expect(msg).toContain('agar iklan bisa tayang sesuai jadwal');
  });

  it('Kilat: menyebut jam gelombang, tenggat H-1 jam, dan kalimat siaran Kilat', () => {
    const msg = invoiceReadyMessage({
      researcherName: 'Siti',
      bundles: [{
        title: 'Survei Kilat A',
        startDate: '2026-11-11T04:00:00.000Z', // 11.00 WIB
        kilatSlotHour: 11,
      }],
      amount: 350000,
      invoiceUrl: 'https://pay.example/kilat',
      issuedAt: new Date('2026-11-10T02:00:00.000Z'),
      isKilat: true,
    });
    expect(msg).toContain('gelombang Rab, 11 Nov pukul 11.00 WIB');
    // Gelombang 11.00 WIB -> batas bayar 10.00 WIB (H-1 jam)
    expect(msg).toContain('pukul 10.00 WIB');
    expect(msg).toContain('agar survei Kilat bisa disiarkan sesuai jadwal');
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
    expect(msg).toContain('Link pembayaran gabungan: https://pay.example/xyz');
    // Tenggat 4 Sep, bukan 10 Sep — satu link tidak bisa dibayar sebagian.
    expect(msg).toContain('4 September 2026');
    expect(msg).not.toContain('10 September 2026');
  });

  it('menyertakan link survei, jam tayang, dan tanggal berakhirnya iklan', () => {
    const msg = invoiceReadyMessage({
      researcherName: 'Tri Hartono Rianto',
      bundles: [{
        title: 'Survei Perilaku Konsumen',
        surveyUrl: 'https://forms.gle/abc123xyz',
        startDate: airing('2026-11-11'),
        endDate: airing('2026-11-12'),
      }],
      items: [{ name: 'Biaya Iklan', qty: 1, price: 125000, total: 125000 }],
      subtotal: 125000,
      ppn: 13750,
      amount: 138750,
      invoiceUrl: 'https://pay.example/abc',
      issuedAt: issued,
    });
    expect(msg).toContain('Judul survei: Survei Perilaku Konsumen');
    expect(msg).toContain('Jadwal tayang: Rab, 11 Nov pukul 15.00 WIB s/d Kam, 12 Nov pukul 15.00 WIB');
    expect(msg).toContain('Link survei: https://forms.gle/abc123xyz');
    // Karena hanya 1 item, tidak menduplikasi Subtotal
    expect(msg).not.toContain('Subtotal:');
    expect(msg).toContain('Biaya Iklan: Rp 125.000');
    expect(msg).toContain('PPN (11%): Rp 13.750');
    expect(msg).toContain('Total: Rp 138.750');
  });

  it('tagihan gabungan menampilkan rincian per pesanan, link survei, dan total gabungan', () => {
    const msg = invoiceReadyMessage({
      researcherName: 'Siti',
      bundles: [
        {
          title: 'Survei Satu',
          surveyUrl: 'https://forms.gle/satu',
          startDate: airing('2026-09-04'),
          items: [
            { name: 'Biaya Iklan (1 hari)', qty: 1, price: 125000, total: 125000 },
            { name: 'Insentif Responden', qty: 2, price: 30000, total: 60000 },
          ],
          subtotal: 185000,
          ppn: 20350,
          amount: 205350,
        },
        {
          title: 'Riset UMKM',
          surveyUrl: 'https://forms.gle/dua',
          startDate: airing('2026-09-10'),
          items: [
            { name: 'Biaya Iklan (2 hari)', qty: 2, price: 125000, total: 250000 },
          ],
          subtotal: 250000,
          ppn: 27500,
          amount: 277500,
        },
      ],
      subtotal: 435000,
      ppn: 47850,
      amount: 482850,
      invoiceUrl: 'https://pay.example/bulk',
      issuedAt: issued,
    });
    expect(msg).toContain('1. Survei Satu');
    expect(msg).toContain('   Jadwal tayang: Jum, 4 Sep pukul 15.00 WIB');
    expect(msg).toContain('   Link survei: https://forms.gle/satu');
    expect(msg).toContain('   Biaya Iklan (1 hari): Rp 125.000');
    expect(msg).toContain('   Reward Responden (2x): Rp 60.000');
    expect(msg).toContain('   Subtotal pesanan: Rp 185.000');
    expect(msg).toContain('2. Riset UMKM');
    expect(msg).toContain('   Jadwal tayang: Kam, 10 Sep pukul 15.00 WIB');
    expect(msg).toContain('   Link survei: https://forms.gle/dua');
    expect(msg).toContain('   Biaya Iklan (2 hari): Rp 250.000');
    expect(msg).toContain('Rincian total:');
    expect(msg).toContain('Subtotal (2 pesanan): Rp 435.000');
    expect(msg).toContain('PPN (11%): Rp 47.850');
    expect(msg).toContain('Total: Rp 482.850');
    expect(msg).toContain('Link pembayaran gabungan: https://pay.example/bulk');
    expect(msg).toContain('4 September 2026');
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
