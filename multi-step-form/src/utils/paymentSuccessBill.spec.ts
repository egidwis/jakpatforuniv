import { describe, it, expect } from 'vitest';
import { pickSuccessBill, type SuccessBillEvent } from './paymentSuccessBill';

/*
  ═══════════════════════════════════════════════════════════════════════════
  HALAMAN KONFIRMASI TIDAK BOLEH MENCETAK ANGKA ORDER SEBAGAI "TOTAL PEMBAYARAN"
  ═══════════════════════════════════════════════════════════════════════════

  Sampai 2026-09-10 `PaymentSuccess` membaca `form_submissions.total_cost` —
  biaya ORDER — dan mencetaknya di bawah judul "Total Pembayaran". Terukur di
  produksi: halaman kami Rp 277.500, DOKU menagih Rp 1.110.

  Normalnya kedua angka sama. Justru itu yang membuatnya berbahaya: ia benar
  cukup lama untuk dipercaya, lalu berbohong tepat pada kasus yang jarang —
  tagihan susulan, top-up hadiah, harga yang di-reprice.
*/

const ev = (over: Partial<SuccessBillEvent> = {}): SuccessBillEvent => ({
  scheduleId: 'sched-1',
  paymentId: 'JFU-INV-aaa-1',
  amount: 233_100,
  createdAt: '2026-09-08T02:00:00.000Z',
  isPaid: false,
  isOpen: true,
  ...over,
});

describe('pickSuccessBill', () => {
  it('satu tagihan terbuka → itu yang ditampilkan', () => {
    const pick = pickSuccessBill([ev()]);
    expect(pick.bill?.amount).toBe(233_100);
    expect(pick.scheduleId).toBe('sched-1');
  });

  it('tagihan TERBUKA menang atas yang lunas, walau lebih tua', () => {
    /*
      Kalau order masih menyisakan tagihan yang menunggu dibayar, itulah yang
      sedang dihadapi orangnya — bukan kuitansi jadwal lain yang kebetulan
      dibayar belakangan.
    */
    const pick = pickSuccessBill([
      ev({ scheduleId: 'sched-2', paymentId: 'lunas', isPaid: true, isOpen: false, amount: 1_110_000, createdAt: '2026-09-09T02:00:00.000Z' }),
      ev({ scheduleId: 'sched-1', paymentId: 'terbuka', amount: 1_110, createdAt: '2026-09-08T02:00:00.000Z' }),
    ]);
    expect(pick.bill?.paymentId).toBe('terbuka');
    expect(pick.scheduleId).toBe('sched-1');
  });

  it('semuanya lunas → yang TERBARU, karena itu yang barusan dibayar', () => {
    const pick = pickSuccessBill([
      ev({ paymentId: 'lama', isPaid: true, isOpen: false, amount: 100, createdAt: '2026-09-01T02:00:00.000Z' }),
      ev({ paymentId: 'baru', isPaid: true, isOpen: false, amount: 200, createdAt: '2026-09-09T02:00:00.000Z' }),
    ]);
    expect(pick.bill?.paymentId).toBe('baru');
  });

  it('dua tagihan terbuka → yang terbaru, bukan yang kebetulan pertama di array', () => {
    const pick = pickSuccessBill([
      ev({ paymentId: 'lama', createdAt: '2026-09-01T02:00:00.000Z' }),
      ev({ paymentId: 'baru', createdAt: '2026-09-09T02:00:00.000Z' }),
    ]);
    expect(pick.bill?.paymentId).toBe('baru');
  });

  it('tagihan MATI / tersusul / basi diabaikan — bukan itu yang ditagihkan DOKU', () => {
    const pick = pickSuccessBill([
      ev({ paymentId: 'mati', isPaid: false, isOpen: false, amount: 999_999 }),
    ]);
    expect(pick.bill).toBeNull();
  });

  it('nol tagihan berarti → blok nominal DISEMBUNYIKAN, bukan diisi angka order', () => {
    expect(pickSuccessBill([]).bill).toBeNull();
    expect(pickSuccessBill([], 'sched-1').bill).toBeNull();
  });

  it('tombol TETAP menunjuk jadwal ordinal 1 walau tidak ada tagihan sama sekali', () => {
    // Keputusan pemilik produk: tombolnya tetap ada, `/bayar/` yang menjelaskan.
    expect(pickSuccessBill([], 'sched-1').scheduleId).toBe('sched-1');
  });

  it('tanpa tagihan DAN tanpa jadwal → tidak ada yang bisa ditunjuk, dan itu jujur', () => {
    expect(pickSuccessBill([]).scheduleId).toBeNull();
  });

  it('tidak mengubah urutan array masukan', () => {
    const arr = [ev({ paymentId: 'a', createdAt: '2026-09-01T02:00:00.000Z' }),
                 ev({ paymentId: 'b', createdAt: '2026-09-09T02:00:00.000Z' })];
    pickSuccessBill(arr);
    expect(arr[0].paymentId).toBe('a');
  });
});
