import { describe, it, expect } from 'vitest';
import {
  invoiceLifetimeMinutes,
  MAX_INVOICE_MINUTES,
  MIN_INVOICE_MINUTES,
} from './payment';
import {
  BOOKING_CUTOFF_HOUR_WIB,
  PAYMENT_CUTOFF_HOUR_WIB,
  isBookingClosedForDate,
} from './airing-window';

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


/*
  ═══════════════════════════════════════════════════════════════════════════
  INVARIAN CUTOFF — kaitan yang selama ini tidak tercatat di mana pun
  ═══════════════════════════════════════════════════════════════════════════

  `BOOKING_CUTOFF_HOUR_WIB = 13` dan `PAYMENT_CUTOFF_HOUR_WIB = 14`
  (airing-window.ts) berjarak PERSIS `MIN_INVOICE_MINUTES = 60` (payment.ts).

  Kebetulan itu yang membuat cabang `invoiceLifetimeMinutes(...) === null`
  MUSTAHIL DICAPAI PENELITI: pemesanan sah paling akhir untuk tayang hari-H
  adalah 12:59:59, yang selalu menyisakan lebih dari 60 menit ke 14.00. Jadi
  penolakan itu de facto GERBANG ADMIN — konsekuensi commit `920b3cb` (1 Sep
  2026) yang sengaja melonggarkan cutoff untuk admin di `ScheduleForm`
  sementara `createManualInvoice` tidak ikut dilonggarkan.

  Tiga konstanta itu hidup di DUA berkas dan tidak ada satu baris pun yang
  menyebut kaitannya. `airing-window.test.ts` menguji kedua ambang secara
  TERPISAH; tes di atas menguji lantai 60 lewat instant buatan
  (`minutesBefore(..., 59)`), bukan lewat cutoff pemesanan. Geser cutoff ke
  13.30, atau naikkan lantainya ke 90, dan jalur peneliti diam-diam mulai kena
  penolakan yang bukan untuk mereka — TANPA SATU TES PUN GAGAL.

  Blok ini yang membuatnya MERAH, bukan diam.
*/
describe('invarian cutoff: 13.00 / 14.00 / 60 menit', () => {
  const MINUTES_PER_HOUR = 60;

  it('jarak dua cutoff TIDAK BOLEH kurang dari lantai umur tagihan', () => {
    const gapMinutes = (PAYMENT_CUTOFF_HOUR_WIB - BOOKING_CUTOFF_HOUR_WIB) * MINUTES_PER_HOUR;
    expect(gapMinutes).toBeGreaterThanOrEqual(MIN_INVOICE_MINUTES);
  });

  /*
    Yang di atas menjaga ANGKANYA; yang di bawah menyatakan MAKSUDNYA. Keduanya
    perlu: seseorang bisa saja menaikkan lantai DAN cutoff bersamaan dengan
    aritmetika yang benar tapi arah yang salah.
  */
  it('pemesanan sah PALING AKHIR untuk tayang hari-H tidak pernah menghasilkan null', () => {
    const ymd = '2026-09-10';
    // 12:59:59 WIB = 05:59:59 UTC. Satu detik lagi dan `isBookingClosedForDate`
    // akan menutupnya, jadi inilah instant paling mepet yang masih bisa memesan.
    const lastLegalBooking = new Date(`${ymd}T05:59:59.000Z`);

    expect(isBookingClosedForDate(ymd, lastLegalBooking)).toBe(false);
    expect(invoiceLifetimeMinutes(ymd, lastLegalBooking)).not.toBeNull();
  });

  it('satu detik SESUDAHNYA pemesanannya memang sudah ditutup — bukan tagihannya yang menolak', () => {
    const ymd = '2026-09-10';
    const justClosed = new Date(`${ymd}T06:00:00.000Z`); // 13:00:00 WIB

    // Penjaga yang benar untuk peneliti adalah cutoff PEMESANAN...
    expect(isBookingClosedForDate(ymd, justClosed)).toBe(true);
    // ...dan pada detik itu umur tagihannya masih sah (tepat 60 menit).
    // Artinya: yang menolak peneliti SELALU cutoff pemesanan, tidak pernah
    // penolakan `null` di `invoiceLifetimeMinutes`.
    expect(invoiceLifetimeMinutes(ymd, justClosed)).toBe(MIN_INVOICE_MINUTES);
  });

  it('cabang null memang ada, tapi hanya bisa dicapai SESUDAH cutoff pemesanan (jalur admin)', () => {
    const ymd = '2026-09-10';
    const adminLate = new Date(`${ymd}T06:30:00.000Z`); // 13.30 WIB — admin saja

    expect(isBookingClosedForDate(ymd, adminLate)).toBe(true);
    expect(invoiceLifetimeMinutes(ymd, adminLate)).toBeNull();
  });
});
