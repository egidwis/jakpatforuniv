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

/*
  ── VOUCHER ORDER HARUS DIWARISI OLEH ESTIMASI JADWAL ──────────────────────

  Terukur di produksi 17 Sep 2026, jadwal #4 `GTFBMQ6F` (order 08ef25ac…):

      layar   : Rp 666.000  ("estimasi")
      tagihan : Rp 1.110    (invoices.amount, JFU-08ef25ac-1789641135104)

  Selisih 600×, dan yang BENAR adalah tagihannya. Ordernya memakai voucher
  `jfutgrx`, tapi `ad_schedules.voucher_code` untuk jadwal itu NULL — semua 18
  baris jadwal di produksi begitu, karena jalur tulis tidak pernah menyalin
  voucher ke baris jadwal.

  Sisi server sudah menangani ini dengan benar dan menuliskan aturannya di
  `pricingRowForSchedule()` (create-payment.js:231):

      // Presedensi: voucher tagihan > voucher jadwal > voucher order. Voucher
      // jadwal yang KOSONG berarti "tidak menyatakan apa-apa", bukan "tanpa
      // diskon"

  Sisi baca memakai aturan yang berbeda — `entry.voucherCode ?? undefined` —
  jadi ia membaca NULL sebagai "tanpa diskon" dan menawarkan harga penuh atas
  order yang akan ditagih jauh lebih murah. Dua salinan aturan, satu menyimpang.
*/
describe('voucher order diwarisi saat baris jadwal tidak menyatakan voucher', () => {
  const ORDER_WITH_VOUCHER = {
    question_count: 34,
    distribution_type: 'regular',
    voucher_code: 'jfutgrx',
  };

  it('memakai voucher ORDER saat voucher jadwal kosong (regresi GTFBMQ6F)', () => {
    const money = deriveScheduleMoney(
      entryOf({ ordinal: 4, duration: 2, totalCost: 0, voucherCode: null, status: 'waiting_payment' }),
      ORDER_WITH_VOUCHER,
    );

    // JFUTGRX memangkas total biaya jadi Rp 1.000; PPN 11% → Rp 1.110.
    expect(money.total).toBe(1110);
    const discount = money.lines?.find((l) => l.tone === 'discount');
    expect(discount).toBeTruthy();
  });

  it('voucher JADWAL menang atas voucher order — presedensi sisi server', () => {
    const money = deriveScheduleMoney(
      entryOf({ ordinal: 4, duration: 2, totalCost: 0, voucherCode: 'JFUTGRX', status: 'waiting_payment' }),
      { question_count: 34, distribution_type: 'regular', voucher_code: 'KODELAIN' },
    );
    expect(money.total).toBe(1110);
  });

  it('tanpa voucher di mana pun, harganya tetap penuh', () => {
    const money = deriveScheduleMoney(
      entryOf({ ordinal: 4, duration: 2, totalCost: 0, voucherCode: null, status: 'waiting_payment' }),
      { question_count: 34, distribution_type: 'regular' },
    );
    // 34 Qs × 2 hari = Rp 600.000 + PPN 11% = Rp 666.000 — angka yang muncul
    // di layar produksi, dan yang benar HANYA kalau ordernya memang tanpa voucher.
    expect(money.total).toBe(666000);
    expect(money.lines?.find((l) => l.tone === 'discount')).toBeFalsy();
  });

  it('jadwal yang SUDAH ditagih tidak ikut berubah — yang tercatat tetap menang', () => {
    /*
      Penjaga arah sebaliknya: pewarisan voucher hanya boleh menyentuh cabang
      ESTIMASI. Jadwal ber-`total_cost` adalah catatan sejarah, dan menghitung
      ulang dengan voucher hari ini persis cacat yang sudah ditutup berkas ini.
    */
    const money = deriveScheduleMoney(
      entryOf({ ordinal: 4, duration: 2, totalCost: 999000, subtotal: 900000, ppnAmount: 99000, voucherCode: null }),
      ORDER_WITH_VOUCHER,
    );
    expect(money.total).toBe(999000);
    expect(money.isEstimate).toBe(false);
  });
});

/*
  Cabang SUDAH-DITAGIH memakai voucher untuk satu hal saja: memecah `subtotal`
  tersimpan menjadi "harga kotor" + "diskon". Totalnya tidak pernah dihitung
  ulang — `total = entry.totalCost`, apa pun hasil pemecahannya.

  Tapi pemecahan itu juga membaca `entry.voucherCode` langsung, jadi baris
  ber-voucher NULL (yaitu SEMUA baris jadwal di produksi) gagal memecah: baris
  "Diskon Voucher" hilang dan harga kotornya tercetak sama dengan nilai bersih.
  Peneliti melihat tagihan yang benar tanpa pernah melihat hematnya — dan
  "Kamu hemat" di `CostBreakdown` ikut menghilang, padahal ia yang dulu
  ditambahkan supaya total kecil tidak terbaca seperti BUG.
*/
describe('pemecahan rincian jadwal yang sudah ditagih ikut mewarisi voucher order', () => {
  it('menampilkan baris diskon untuk jadwal tertagih ber-voucher NULL', () => {
    /*
      Bentuk yang benar-benar tersimpan: 20 Qs × 1 hari = Rp 350.000 kotor,
      voucher ambassador 10% → Rp 315.000 bersih, PPN 11% → Rp 34.650.
    */
    const money = deriveScheduleMoney(
      entryOf({
        ordinal: 2,
        duration: 1,
        totalCost: 349650,
        subtotal: 315000,
        ppnAmount: 34650,
        voucherCode: null,
      }),
      { question_count: 20, distribution_type: 'regular', voucher_code: 'JFUTYR' },
    );

    expect(money.total).toBe(349650);
    expect(money.isEstimate).toBe(false);
    const discount = money.lines?.find((l) => l.tone === 'discount');
    expect(discount).toBeTruthy();
    expect(discount?.amount).toBe(-35000);
  });
});
