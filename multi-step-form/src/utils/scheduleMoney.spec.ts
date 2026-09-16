import { describe, it, expect } from 'vitest';
import { deriveScheduleMoney } from './scheduleMoney';
import type { MoneyLine } from './scheduleMoney';
import type { AdScheduleEntry } from './supabase';

/*
  Hadiah hanya boleh TAMPIL untuk jadwal yang benar-benar mendanai pool.

  ⚠️ KENAPA BERKAS INI ADA. Aturan "perpanjangan batch lama tidak menagih
  hadiah lagi" ditegakkan di jalur TULIS (ScheduleAgainDialog/ScheduleForm
  mengirim 0) dan di jalur TAGIH (create-payment.js:229-230). Ia TIDAK pernah
  ditegakkan di jalur BACA: `deriveScheduleMoney` mengalikan
  prizePerWinner × winnerCount tanpa syarat, dan hasilnya benar hari ini hanya
  karena kolomnya kebetulan nol.

  Satu baris batch-lama berhadiah — dibuat admin, atau lewat jalur masa depan —
  langsung menampilkan hadiah yang tidak pernah ditagih. Tes di sini mengunci
  aturannya, bukan kebetulannya.

  Asal aturan: sql/37 (penagihan ganda pool hadiah).
*/

const SUBMISSION = { question_count: 20, distribution_type: 'regular' };

const entryOf = (over: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 'sch-1',
  submissionId: 'sub-1',
  ordinal: 2,
  isExtension: true,
  bookingId: 'K3M9PQ7T',
  sourceId: 'src-1',
  startDate: '2026-09-20T08:00:00Z',
  endDate: '2026-09-21T08:00:00Z',
  duration: 1,
  status: 'paid',
  reviewStatus: 'approved',
  paymentStatus: 'paid',
  distributionType: 'regular',
  kilatSlotHour: null,
  totalCost: 0,
  subtotal: null,
  ppnAmount: null,
  voucherCode: null,
  prizePerWinner: 0,
  winnerCount: 0,
  additionalPrizePerWinner: 0,
  isNewPeriod: false,
  periodBatch: '2026-09',
  slotBookedBy: 'admin',
  slotReservedAt: null,
  title: 'Uji',
  researcherName: 'Uji',
  university: null,
  submissionCreatedAt: '2026-09-01T00:00:00Z',
  ...over,
} as AdScheduleEntry);

const rewardLineOf = (lines: MoneyLine[] | null) =>
  lines?.find((l) => l.label === 'Reward') ?? null;

describe('deriveScheduleMoney — cabang SUDAH DITAGIH', () => {
  /*
    Baris berbahaya: perpanjangan batch LAMA yang kolom hadiahnya terisi.
    Nol baris seperti ini di produksi hari ini (diukur 2026-09-16) — tes ini
    menjaga supaya tetap mustahil ditampilkan, bukan mustahil ada.
  */
  it('batch lama berhadiah: NOL baris Reward', () => {
    const money = deriveScheduleMoney(entryOf({
      totalCost: 333_000, subtotal: 300_000, ppnAmount: 33_000,
      isNewPeriod: false, prizePerWinner: 50_000, winnerCount: 2,
    }), SUBMISSION);

    expect(rewardLineOf(money.lines)).toBeNull();
  });

  it('batch lama berhadiah: iklan TIDAK dikurangi hadiah', () => {
    // netAdCost = subtotal − insentif. Kalau insentifnya tidak dinolkan, baris
    // "Iklan" berbunyi 200.000 untuk jadwal yang iklannya 300.000.
    const money = deriveScheduleMoney(entryOf({
      totalCost: 333_000, subtotal: 300_000, ppnAmount: 33_000,
      isNewPeriod: false, prizePerWinner: 50_000, winnerCount: 2,
    }), SUBMISSION);

    const iklan = money.lines?.find((l) => l.label === 'Iklan');
    expect(iklan?.amount).toBe(300_000);
  });

  it('batch BARU berhadiah: baris Reward tetap muncul', () => {
    const money = deriveScheduleMoney(entryOf({
      totalCost: 388_500, subtotal: 350_000, ppnAmount: 38_500,
      isNewPeriod: true, prizePerWinner: 25_000, winnerCount: 2,
    }), SUBMISSION);

    expect(rewardLineOf(money.lines)?.amount).toBe(50_000);
  });

  it('jadwal PERTAMA berhadiah: baris Reward tetap muncul', () => {
    // ⚠️ Jadwal pertama SELALU mendanai poolnya, dan `is_new_period` pada
    // ordinal 1 bernilai false di produksi. Menggerbangi hanya dengan
    // isNewPeriod akan mencabut hadiah dari SETIAP order pertama.
    const money = deriveScheduleMoney(entryOf({
      ordinal: 1, isExtension: false, isNewPeriod: false,
      totalCost: 999_000, subtotal: 900_000, ppnAmount: 99_000,
      prizePerWinner: 100_000, winnerCount: 5,
    }), SUBMISSION);

    expect(rewardLineOf(money.lines)?.amount).toBe(500_000);
  });

  it('total tidak pernah berubah — ia catatan, bukan hitungan', () => {
    const money = deriveScheduleMoney(entryOf({
      totalCost: 333_000, subtotal: 300_000, ppnAmount: 33_000,
      isNewPeriod: false, prizePerWinner: 50_000, winnerCount: 2,
    }), SUBMISSION);

    expect(money.total).toBe(333_000);
    expect(money.isEstimate).toBe(false);
  });

  it('top-up tetap menolak memecah rincian (regresi)', () => {
    // Alasannya BERBEDA dari aturan batch: jumlah pemenang pool berjalan tidak
    // tersimpan di baris ini. Jangan digabung dengan gerbang isNewPeriod.
    const money = deriveScheduleMoney(entryOf({
      totalCost: 444_000, subtotal: 400_000, ppnAmount: 44_000,
      additionalPrizePerWinner: 10_000,
    }), SUBMISSION);

    expect(rewardLineOf(money.lines)).toBeNull();
  });
});

describe('deriveScheduleMoney — cabang ESTIMASI', () => {
  it('batch lama berhadiah: hadiah TIDAK masuk subtotal', () => {
    const batchLama = deriveScheduleMoney(entryOf({
      totalCost: 0, isNewPeriod: false, prizePerWinner: 50_000, winnerCount: 2,
    }), SUBMISSION);

    const tanpaHadiah = deriveScheduleMoney(entryOf({
      totalCost: 0, isNewPeriod: false, prizePerWinner: 0, winnerCount: 0,
    }), SUBMISSION);

    expect(batchLama.isEstimate).toBe(true);
    expect(batchLama.total).toBe(tanpaHadiah.total);
    expect(rewardLineOf(batchLama.lines)).toBeNull();
  });

  it('batch BARU berhadiah: hadiah ikut subtotal', () => {
    const batchBaru = deriveScheduleMoney(entryOf({
      totalCost: 0, isNewPeriod: true, prizePerWinner: 50_000, winnerCount: 2,
    }), SUBMISSION);

    const tanpaHadiah = deriveScheduleMoney(entryOf({
      totalCost: 0, isNewPeriod: true, prizePerWinner: 0, winnerCount: 0,
    }), SUBMISSION);

    expect(batchBaru.total).toBeGreaterThan(tanpaHadiah.total);
    expect(rewardLineOf(batchBaru.lines)?.amount).toBe(100_000);
  });

  it('jadwal pertama berhadiah: hadiah ikut subtotal', () => {
    const money = deriveScheduleMoney(entryOf({
      ordinal: 1, isExtension: false, totalCost: 0, isNewPeriod: false,
      prizePerWinner: 25_000, winnerCount: 2,
    }), SUBMISSION);

    expect(rewardLineOf(money.lines)?.amount).toBe(50_000);
  });

  it('jadwal dibatalkan tetap diam (regresi af004b84)', () => {
    const money = deriveScheduleMoney(entryOf({
      totalCost: 0, status: 'cancelled', isNewPeriod: true,
      prizePerWinner: 50_000, winnerCount: 2,
    }), SUBMISSION);

    expect(money.total).toBe(0);
    expect(money.lines).toBeNull();
  });
});
