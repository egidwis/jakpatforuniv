import { describe, it, expect } from 'vitest';
import { shouldAutoMint, canRepickInPlace, billExpiryFor, type AutoMintInput } from './jadwalBayarGates';
import { isPayDeadlinePassed } from './airing-window';

const base: AutoMintInput = {
  screen: 'awaiting_payment',
  ordinal: 1,
  slotBookedBy: 'user',
  paymentStatus: 'pending',
  billingLoaded: true,
  hasOpenBill: false,
  owedOnCredit: false,
  tooLate: false,
  holdExpired: false,
};

describe('shouldAutoMint — satu-satunya pemicu tagihan otomatis', () => {
  it('reservasi mandiri ordinal 1 tanpa tagihan hidup → terbitkan', () => {
    expect(shouldAutoMint(base)).toBe(true);
  });

  it('sudah ada tagihan hidup → jangan', () => {
    expect(shouldAutoMint({ ...base, hasOpenBill: true })).toBe(false);
  });

  it('tagihan belum terbaca (gagal muat) → jangan menebak "belum ada"', () => {
    expect(shouldAutoMint({ ...base, billingLoaded: false })).toBe(false);
  });

  it('jadwal admin → tagihannya urusan admin, bukan halaman ini', () => {
    expect(shouldAutoMint({ ...base, slotBookedBy: 'admin' })).toBe(false);
    expect(shouldAutoMint({ ...base, slotBookedBy: null })).toBe(false);
  });

  it('perpanjangan → sudah diterbitkan JadwalBaruPage saat lahir', () => {
    expect(shouldAutoMint({ ...base, ordinal: 2 })).toBe(false);
  });

  it('kredit / tempo → ditagih lewat tagihan tempo', () => {
    expect(shouldAutoMint({ ...base, owedOnCredit: true })).toBe(false);
  });

  it('lewat 14.00 → menunggu peneliti memilih (tanggal lain atau tetap bayar)', () => {
    expect(shouldAutoMint({ ...base, tooLate: true })).toBe(false);
  });

  it('hold sudah habis → server menolak, jangan coba', () => {
    expect(shouldAutoMint({ ...base, holdExpired: true })).toBe(false);
  });

  it('lunas / kedaluwarsa / bukan keadaan bayar → jangan', () => {
    expect(shouldAutoMint({ ...base, paymentStatus: 'paid' })).toBe(false);
    expect(shouldAutoMint({ ...base, paymentStatus: 'completed' })).toBe(false);
    expect(shouldAutoMint({ ...base, paymentStatus: 'expired' })).toBe(false);
    expect(shouldAutoMint({ ...base, screen: 'pick' })).toBe(false);
    expect(shouldAutoMint({ ...base, screen: 'released' })).toBe(false);
    expect(shouldAutoMint({ ...base, screen: 'settled' })).toBe(false);
  });
});

describe('canRepickInPlace — pilih tanggal lain tanpa meninggalkan halaman', () => {
  const ok = {
    ordinal: 1,
    siblingCount: 1,
    submissionStatus: 'slot_reserved',
    scheduleStatus: 'requested',
    autoReviewed: true,
  };

  it('order berjadwal tunggal, jalur otomatis → boleh', () => {
    expect(canRepickInPlace(ok)).toBe(true);
    expect(canRepickInPlace({ ...ok, siblingCount: 0 })).toBe(true);
  });

  it('dibatalkan (peneliti atau admin) → TIDAK, cancelSchedule juga menulis expired', () => {
    expect(canRepickInPlace({ ...ok, submissionStatus: 'slot_cancelled' })).toBe(false);
    expect(canRepickInPlace({ ...ok, scheduleStatus: 'cancelled' })).toBe(false);
    expect(canRepickInPlace({ ...ok, scheduleStatus: 'slot_cancelled' })).toBe(false);
  });

  it('order berjadwal banyak → TIDAK, rebook berlingkup ORDER', () => {
    expect(canRepickInPlace({ ...ok, siblingCount: 2 })).toBe(false);
  });

  it('perpanjangan → TIDAK, pesan lewat Jadwal Baru', () => {
    expect(canRepickInPlace({ ...ok, ordinal: 2 })).toBe(false);
  });

  it('jalur review manual → tanggalnya milik tim', () => {
    expect(canRepickInPlace({ ...ok, autoReviewed: false })).toBe(false);
  });

  it('status order belum terbaca → TIDAK', () => {
    expect(canRepickInPlace({ ...ok, submissionStatus: null })).toBe(false);
  });
});

describe('billExpiryFor — umur link DOKU', () => {
  // 10 Okt 2026 10.00 WIB
  const now = Date.parse('2026-10-10T03:00:00Z');

  it('reservasi mandiri: ikut hold 1 jam sejak dikunci', () => {
    const reserved = '2026-10-10T02:30:00Z';
    expect(billExpiryFor({ slotBookedBy: 'user', slotReservedAt: reserved, lockedYmd: '2026-10-12' }, now).toISOString())
      .toBe('2026-10-10T03:30:00.000Z');
  });

  it('jadwal admin, batas 14.00 hari tayang masih di depan → batas itu', () => {
    expect(billExpiryFor({ slotBookedBy: 'admin', slotReservedAt: null, lockedYmd: '2026-10-12' }, now).toISOString())
      .toBe('2026-10-12T07:00:00.000Z');
  });

  it('jadwal admin, batas sudah lewat atau tanpa tanggal → 7 hari', () => {
    const week = new Date(now + 7 * 24 * 3600 * 1000).toISOString();
    expect(billExpiryFor({ slotBookedBy: 'admin', slotReservedAt: null, lockedYmd: '2026-10-09' }, now).toISOString()).toBe(week);
    expect(billExpiryFor({ slotBookedBy: null, slotReservedAt: null, lockedYmd: null }, now).toISOString()).toBe(week);
  });
});

/*
  Kilat (Phase 5 §5.7, R6). Gerbangnya sama untuk kedua produk; yang berbeda
  hanya MASUKANNYA — `tooLate` dari `isPayDeadlinePassed` (gelombang − 60
  menit) dan `kilatHour` di `billExpiryFor`. Sampai 5.10 order Kilat selalu
  berjadwal tunggal.
*/
describe('Kilat — gelombang 11.00 WIB Senin 19 Okt 2026 (batas bayar 10.00)', () => {
  const YMD = '2026-10-19';
  const at = (iso: string) => new Date(iso);

  it('shouldAutoMint: terbit sampai 10.00 tepat, berhenti 10.00.01 — bukan 14.00', () => {
    const tooLateAt = (iso: string) => isPayDeadlinePassed(YMD, 11, at(iso));
    expect(shouldAutoMint({ ...base, tooLate: tooLateAt('2026-10-19T03:00:00Z') })).toBe(true);
    expect(shouldAutoMint({ ...base, tooLate: tooLateAt('2026-10-19T03:00:01Z') })).toBe(false);
    // Aturan Iklan untuk tanggal yang sama masih membuka sampai 14.00.
    expect(isPayDeadlinePassed(YMD, null, at('2026-10-19T03:00:01Z'))).toBe(false);
  });

  it('canRepickInPlace: order Kilat swalayan berjadwal tunggal → boleh pilih gelombang lain', () => {
    expect(canRepickInPlace({ ordinal: 1, siblingCount: 1, submissionStatus: 'waiting_payment', scheduleStatus: 'requested', autoReviewed: true })).toBe(true);
  });

  it('canRepickInPlace: Kilat jalur manual (gelombang ditugaskan admin) → TIDAK', () => {
    expect(canRepickInPlace({ ordinal: 1, siblingCount: 1, submissionStatus: 'slot_reserved', scheduleStatus: 'requested', autoReviewed: false })).toBe(false);
  });

  it('canRepickInPlace: gelombang dibatalkan admin → TIDAK', () => {
    expect(canRepickInPlace({ ordinal: 1, siblingCount: 1, submissionStatus: 'slot_cancelled', scheduleStatus: 'cancelled', autoReviewed: true })).toBe(false);
  });

  it('billExpiryFor: reservasi mandiri → hold (selalu ≤ batas gelombang)', () => {
    // Dikunci 08.30 WIB → hold sampai 09.30, batas bayar 10.00.
    expect(billExpiryFor({ slotBookedBy: 'user', slotReservedAt: '2026-10-19T01:30:00Z', lockedYmd: YMD, kilatHour: 11 }, Date.parse('2026-10-19T01:31:00Z')).toISOString())
      .toBe('2026-10-19T02:30:00.000Z');
  });

  it('billExpiryFor: hold yang (seandainya) lebih panjang dipangkas ke batas gelombang', () => {
    expect(billExpiryFor({ slotBookedBy: 'user', slotReservedAt: '2026-10-19T02:30:00Z', lockedYmd: YMD, kilatHour: 11 }, Date.parse('2026-10-19T02:31:00Z')).toISOString())
      .toBe('2026-10-19T03:00:00.000Z');
  });

  it('billExpiryFor: gelombang admin → batas gelombang, bukan 14.00, dan TIDAK jatuh ke +7 hari sesudahnya', () => {
    expect(billExpiryFor({ slotBookedBy: 'admin', slotReservedAt: null, lockedYmd: YMD, kilatHour: 15 }, Date.parse('2026-10-18T03:00:00Z')).toISOString())
      .toBe('2026-10-19T07:00:00.000Z');
    expect(billExpiryFor({ slotBookedBy: 'admin', slotReservedAt: null, lockedYmd: YMD, kilatHour: 11 }, Date.parse('2026-10-19T05:00:00Z')).toISOString())
      .toBe('2026-10-19T03:00:00.000Z');
  });
});
