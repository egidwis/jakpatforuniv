import { describe, it, expect } from 'vitest';
import { shouldAutoMint, canRepickInPlace, billExpiryFor, type AutoMintInput } from './jadwalBayarGates';

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
