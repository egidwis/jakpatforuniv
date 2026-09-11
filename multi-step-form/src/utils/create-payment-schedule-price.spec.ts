import { describe, expect, test, afterEach, vi } from 'vitest';
// Alasan @ts-ignore & lokasinya sama dengan create-payment-select.spec.ts.
// @ts-ignore -- Pages Function tanpa deklarasi tipe
import { pricingRowForSchedule, computeTotalCostFromSubmission } from '../../functions/api/doku/create-payment.js';

/*
  KENAPA TES INI ADA.

  Sub-langkah (f) Phase 4: harga tagihan jadwal ke-2. Godaannya adalah
  "ganti `sub` dengan `schedule`" — dan itu salah di EMPAT tempat sekaligus,
  ketiganya gagal senyap (angkanya beda, tidak ada error).

  Diukur ke produksi 2026-09-11 atas 18 jadwal ordinal >=2:

    duration      18/18 terisi        -> AMAN diambil dari jadwal
    voucher_code  18/18 NULL          -> mengambilnya MENCABUT diskon
    is_new_period 7 dari 18 true      -> hadiah hanya ditagih di batch baru
    additional_*  0 dari 18 > 0       -> top-up belum pernah ada, tapi rumusnya
                                         tidak bisa dihitung dari baris ini

  Yang diuji: baris harga yang DIGABUNG, bukan fungsi harganya. `computeTotalCost`
  sendiri sudah dijaga voucher-validity.spec.ts & create-payment-select.spec.ts.
*/

// 20 Agu 2026 — order LAHIR saat JFUSUHUD masih hidup.
const ORDER_LAHIR = '2026-08-20T03:00:00Z';
// 2 Sep 2026 — JFUSUHUD sudah mati.
const SESUDAH_VOUCHER_MATI = Date.parse('2026-09-02T04:00:00Z');

const ORDER = {
  id: '11111111-1111-4111-8111-111111111111',
  created_at: ORDER_LAHIR,
  question_count: 20,          // Rp 200.000/hari
  duration: 7,                 // jadwal PERTAMA 7 hari
  winner_count: 10,
  prize_per_winner: 50_000,
  voucher_code: 'JFUSUHUD',
  distribution_type: 'regular',
  payment_status: 'paid',
};

/** Jadwal ke-2: 3 hari, batch LAMA (pool sudah didanai jadwal pertama). */
const JADWAL_BATCH_LAMA = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  source_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  submission_id: ORDER.id,
  duration: 3,
  is_new_period: false,
  prize_per_winner: 0,
  winner_count: 0,
  additional_prize_per_winner: 0,
  voucher_code: null,
};

/** Jadwal ke-2 yang MEMBUKA batch baru: hadiahnya ditagih. */
const JADWAL_BATCH_BARU = {
  ...JADWAL_BATCH_LAMA,
  is_new_period: true,
  prize_per_winner: 25_000,
  winner_count: 4,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('kolom mana dari mana (sub-langkah f)', () => {
  test('duration datang dari JADWAL, bukan order', () => {
    const row = pricingRowForSchedule(ORDER, JADWAL_BATCH_LAMA, null);
    expect(row.duration).toBe(3);
    expect(row.duration).not.toBe(ORDER.duration);
  });

  test('question_count & distribution_type tetap dari ORDER', () => {
    // Kuesionernya satu; jadwal ke-2 menayangkan survei yang sama.
    const row = pricingRowForSchedule(ORDER, JADWAL_BATCH_LAMA, null);
    expect(row.question_count).toBe(20);
    expect(row.distribution_type).toBe('regular');
  });

  test('created_at tetap dari ORDER — voucher dinilai saat order LAHIR', () => {
    // ⚠️ Jebakan paling halus. `orderInstant()` membaca `created_at`; kalau
    // baris jadwal dioper apa adanya, voucher dinilai pada tanggal JADWAL
    // dibuat. Itu persis bug yang ditutup create-payment-select.spec.ts,
    // dilahirkan kembali lewat pintu lain.
    const row = pricingRowForSchedule(ORDER, JADWAL_BATCH_LAMA, null);
    expect(row.created_at).toBe(ORDER_LAHIR);
  });

  test('voucher NULL di jadwal TIDAK mencabut voucher order', () => {
    // 18/18 jadwal produksi ber-voucher NULL. Mengambilnya apa adanya membuat
    // setiap jadwal ke-2 kehilangan diskon tanpa satu pun error.
    const row = pricingRowForSchedule(ORDER, JADWAL_BATCH_LAMA, null);
    expect(row.voucher_code).toBe('JFUSUHUD');
  });

  test('voucher TAGIHAN tetap menang kalau ada', () => {
    // Presedensi lama dipertahankan: voucher tagihan > voucher order.
    const row = pricingRowForSchedule(ORDER, JADWAL_BATCH_LAMA, 'ILKOMUNY');
    expect(row.voucher_code).toBe('ILKOMUNY');
  });

  test('voucher JADWAL menang kalau memang diisi', () => {
    const row = pricingRowForSchedule(
      ORDER, { ...JADWAL_BATCH_LAMA, voucher_code: 'JFUFEB' }, null,
    );
    expect(row.voucher_code).toBe('JFUFEB');
  });
});

describe('hadiah hanya ditagih saat batch BARU', () => {
  test('batch lama: nol hadiah, walau ordernya punya', () => {
    // Pool batch itu sudah didanai jadwal pertama. Menagihnya lagi adalah
    // penagihan ganda yang diperbaiki sql/37.
    const row = pricingRowForSchedule(ORDER, JADWAL_BATCH_LAMA, null);
    expect(row.winner_count).toBe(0);
    expect(row.prize_per_winner).toBe(0);
  });

  test('batch baru: hadiah JADWAL yang ditagih, bukan hadiah order', () => {
    const row = pricingRowForSchedule(ORDER, JADWAL_BATCH_BARU, null);
    expect(row.winner_count).toBe(4);
    expect(row.prize_per_winner).toBe(25_000);
  });

  test('top-up tidak bisa dihargai dari baris jadwal — ditolak, bukan dikarang', () => {
    // Jumlah pemenang pool berjalan TIDAK tersimpan di baris ini; mengalikannya
    // dengan winner_count baris ini menghasilkan angka karangan.
    // `storedIncentive()` (scheduleMoney.ts:57) menolak karena alasan yang sama.
    expect(() =>
      pricingRowForSchedule(
        ORDER, { ...JADWAL_BATCH_LAMA, additional_prize_per_winner: 10_000 }, null,
      ),
    ).toThrow();
  });
});

describe('angka akhirnya', () => {
  test('batch lama = iklan saja, 3 hari, diskon voucher order', () => {
    vi.setSystemTime(SESUDAH_VOUCHER_MATI);
    const row = pricingRowForSchedule(ORDER, JADWAL_BATCH_LAMA, null);
    const { subtotal } = computeTotalCostFromSubmission(row);
    // 200.000/hari x 3 hari = 600.000; JFUSUHUD 10% (sah, order lahir 20 Agu)
    // -> 540.000. Nol hadiah karena batch lama.
    expect(subtotal).toBe(540_000);
  });

  test('batch baru = iklan + hadiah jadwal', () => {
    vi.setSystemTime(SESUDAH_VOUCHER_MATI);
    const row = pricingRowForSchedule(ORDER, JADWAL_BATCH_BARU, null);
    const { subtotal } = computeTotalCostFromSubmission(row);
    // iklan 600.000 - diskon 60.000 = 540.000, + hadiah 25.000 x 4 = 100.000.
    expect(subtotal).toBe(640_000);
  });

  test('harganya BERBEDA dari harga order — pembuktian (f) benar-benar bekerja', () => {
    vi.setSystemTime(SESUDAH_VOUCHER_MATI);
    const hargaOrder = computeTotalCostFromSubmission(ORDER).total;
    const hargaJadwal = computeTotalCostFromSubmission(
      pricingRowForSchedule(ORDER, JADWAL_BATCH_LAMA, null),
    ).total;
    // Tanpa (f), keduanya identik — dan peneliti ditagih harga jadwal PERTAMA
    // (7 hari + hadiah 10 orang) untuk jadwal ke-2 yang cuma 3 hari.
    expect(hargaJadwal).not.toBe(hargaOrder);
    expect(hargaJadwal).toBeLessThan(hargaOrder);
  });

  test('tanpa jadwal, barisnya order apa adanya — ordinal 1 tidak berubah', () => {
    vi.setSystemTime(SESUDAH_VOUCHER_MATI);
    const row = pricingRowForSchedule(ORDER, null, null);
    expect(computeTotalCostFromSubmission(row).total).toBe(
      computeTotalCostFromSubmission(ORDER).total,
    );
  });
});
