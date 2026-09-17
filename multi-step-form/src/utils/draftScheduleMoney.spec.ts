import { describe, it, expect } from 'vitest';
import { draftScheduleMoney } from './draftScheduleMoney';
import type { DraftScheduleInput } from './draftScheduleMoney';

/*
  Estimasi untuk jadwal yang BELUM LAHIR.

  ⚠️ MODUL INI TIDAK BOLEH MENGHITUNG APA PUN SENDIRI. Ia merakit entry
  sementara lalu menyerahkannya ke `deriveScheduleMoney` — sumber yang sama
  dengan kartu jadwal & halaman bayar. Tes di bawah menjaga konsekuensinya,
  bukan rumusnya.

  ⚠️ GERBANG HADIAH ADALAH JALUR UANG. `fundsPrizePool` (sql/37): pool sebuah
  batch sudah didanai jadwal sebelumnya, jadi menagihnya lagi = penagihan ganda.
*/

const inputOf = (over: Partial<DraftScheduleInput> = {}): DraftScheduleInput => ({
  ordinal: 2,
  duration: 7,
  isNewBatch: false,
  prizePerWinner: 50000,
  winnerCount: 2,
  questionCount: 20,
  distributionType: 'regular',
  voucherCode: null,
  ...over,
});

const labels = (m: ReturnType<typeof draftScheduleMoney>) =>
  (m.lines ?? []).map((l) => l.label);

describe('draftScheduleMoney — ⚠️ gerbang hadiah', () => {
  it('perpanjangan batch LAMA: NOL baris Reward meski hadiah terisi', () => {
    /*
      Persis skenario mockup rencana: "Reward — ikut kolam hadiah batch
      berjalan". Batch lama tidak mendanai pool, jadi menawarkannya adalah
      menawarkan sesuatu yang tidak akan ditagih.
    */
    const m = draftScheduleMoney(inputOf({ isNewBatch: false }));
    expect(labels(m).some((l) => l.includes('Reward'))).toBe(false);
  });

  it('perpanjangan batch BARU: baris Reward MUNCUL', () => {
    const m = draftScheduleMoney(inputOf({ isNewBatch: true }));
    expect(labels(m).some((l) => l.includes('Reward'))).toBe(true);
  });

  it('hadiah batch lama tidak ikut menaikkan total', () => {
    // Ini bentuk terukur dari "penagihan ganda tidak terjadi".
    const lama = draftScheduleMoney(inputOf({ isNewBatch: false, prizePerWinner: 999999, winnerCount: 9 }));
    const kosong = draftScheduleMoney(inputOf({ isNewBatch: false, prizePerWinner: 0, winnerCount: 0 }));
    expect(lama.total).toBe(kosong.total);
  });

  it('ordinal 1 SELALU mendanai pool, meski isNewBatch false', () => {
    /*
      ⚠️ `is_new_period` pada jadwal pertama bernilai false di produksi — kolom
      itu lahir untuk membedakan PERPANJANGAN. Menggerbangi hanya dengan
      isNewBatch akan mencabut hadiah dari setiap order pertama.
    */
    const m = draftScheduleMoney(inputOf({ ordinal: 1, isNewBatch: false }));
    expect(labels(m).some((l) => l.includes('Reward'))).toBe(true);
  });
});

describe('draftScheduleMoney — bentuk keluaran', () => {
  it('SELALU estimasi, tidak pernah mengaku catatan', () => {
    // `recordedVsBilled`: total_cost bisa menyimpang dari invoices.amount.
    for (const over of [{}, { isNewBatch: true }, { ordinal: 1 }]) {
      expect(draftScheduleMoney(inputOf(over)).isEstimate).toBe(true);
    }
  });

  it('selalu punya baris Iklan dan PPN 11%', () => {
    const l = labels(draftScheduleMoney(inputOf()));
    expect(l).toContain('PPN 11%');
    expect(l.some((x) => x.includes('Iklan'))).toBe(true);
  });

  it('jumlah baris = total (nol baris hantu, nol yang tercecer)', () => {
    /*
      Penjaga hitung-ganda: kalau ada komponen yang terhitung dua kali, atau
      satu baris dirender tanpa masuk total, ketidakcocokannya muncul di sini.
    */
    for (const over of [
      {},
      { isNewBatch: true },
      { ordinal: 1 },
      { voucherCode: 'JFUFEB' },
      { duration: 1 },
    ]) {
      const m = draftScheduleMoney(inputOf(over));
      const jumlah = (m.lines ?? []).reduce((a, l) => a + l.amount, 0);
      expect(jumlah).toBe(m.total);
    }
  });

  it('durasi ikut mengubah harga — bukan angka beku', () => {
    const tujuh = draftScheduleMoney(inputOf({ duration: 7 }));
    const satu = draftScheduleMoney(inputOf({ duration: 1 }));
    expect(tujuh.total).toBeGreaterThan(satu.total);
  });

  it('voucher order muncul read-only sebagai baris diskon', () => {
    // Voucher melekat ke ORDER dan diwariskan; layar jadwal tidak punya input.
    const m = draftScheduleMoney(inputOf({ voucherCode: 'JFUFEB', duration: 7 }));
    const diskon = (m.lines ?? []).filter((l) => l.tone === 'discount');
    expect(diskon.length).toBeGreaterThan(0);
    expect(diskon.every((l) => l.amount < 0)).toBe(true);
  });
});
