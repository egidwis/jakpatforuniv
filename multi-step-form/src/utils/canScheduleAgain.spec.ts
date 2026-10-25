import { describe, it, expect } from 'vitest';
import { canScheduleAgain, kilatWaveClashesOwn, scheduleAgainBlock } from './canScheduleAgain';
import type { AdScheduleEntry } from './supabase';

/*
  Gerbang tombol "Jadwalkan Iklan Lagi".

  ⚠️ DIUKUR DARI KUOTA, BUKAN DARI TAGIHAN. Jadwal `waiting_payment` yang
  belum dibayar TETAP memakan kuota harian (assert_daily_ad_quota_free kaki 2
  menghitung status, bukan pembayaran). Kalau gerbang ini memakai "ada tagihan
  hidup", peneliti bisa menumpuk jadwal waiting_payment tanpa tagihan di
  tanggal-tanggal berbeda dan menghabiskan kapasitas peneliti lain.
*/

const HOUR = 3_600_000;
const NOW = Date.parse('2026-09-12T10:00:00+07:00');

const entryOf = (over: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 'sch-1',
  submissionId: 'sub-1',
  ordinal: 1,
  isExtension: false,
  bookingId: 'K3M9PQ7T',
  sourceId: 'src-1',
  startDate: '2026-09-20T08:00:00Z',
  endDate: '2026-09-27T08:00:00Z',
  duration: 7,
  status: 'waiting_payment',
  reviewStatus: 'approved',
  paymentStatus: null,
  distributionType: 'ads',
  kilatSlotHour: null,
  totalCost: 100000,
  subtotal: null,
  ppnAmount: null,
  voucherCode: null,
  prizePerWinner: 0,
  winnerCount: 0,
  additionalPrizePerWinner: 0,
  isNewPeriod: false,
  periodBatch: null,
  slotBookedBy: null,
  slotReservedAt: null,
  title: 'Uji',
  researcherName: 'Uji',
  university: null,
  submissionCreatedAt: '2026-09-01T00:00:00Z',
  // Instan tarif DIKUNCI (sql/103) — tanpa ini fixture jatuh ke "sekarang"
  // dan hasilnya berubah sendiri saat kalender melewati 1 Okt 2026.
  rateLockedAt: '2026-09-01T00:00:00Z',
  ...over,
} as AdScheduleEntry);

const orderOf = (over: Partial<{ distribution_type: string; submission_status: string }> = {}) => ({
  distribution_type: 'ads',
  submission_status: 'approved',
  ...over,
}) as any;

describe('canScheduleAgain', () => {
  it('order approved tanpa jadwal yang menahan kuota → boleh', () => {
    const selesai = entryOf({ status: 'completed', paymentStatus: 'paid' });
    expect(canScheduleAgain(orderOf(), [selesai], NOW)).toBe(true);
    expect(scheduleAgainBlock(orderOf(), [selesai], NOW)).toBeNull();
  });

  it('order Kilat, pintu tertutup (bawaan) → tidak boleh', () => {
    expect(canScheduleAgain(orderOf({ distribution_type: 'kilat' }), [], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf({ distribution_type: 'kilat' }), [], NOW)).toBe('kilat');
  });

  it('order in_review → tidak boleh (kasus pemicu spec ini)', () => {
    expect(canScheduleAgain(orderOf({ submission_status: 'in_review' }), [], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf({ submission_status: 'in_review' }), [], NOW)).toBe('order_inactive');
  });

  it('order slot_cancelled → tidak boleh, meski sumbu review-nya approved', () => {
    expect(canScheduleAgain(orderOf({ submission_status: 'slot_cancelled' }), [], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf({ submission_status: 'slot_cancelled' }), [], NOW)).toBe('order_inactive');
  });

  /*
    ⚠️ TES YANG MEMBEDAKAN GERBANG KUOTA DARI GERBANG TAGIHAN.
    Jadwal ini TIDAK punya tagihan sama sekali. Gerbang berbasis "tagihan
    hidup" akan meloloskannya; gerbang kuota harus menolak.
  */
  it('jadwal waiting_payment TANPA tagihan apa pun → tetap menahan kuota, tidak boleh', () => {
    const menahan = entryOf({ status: 'waiting_payment', paymentStatus: null });
    expect(canScheduleAgain(orderOf(), [menahan], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf(), [menahan], NOW)).toBe('quota_held');
  });

  it('jadwal dibatalkan tidak menahan kuota → boleh lagi', () => {
    const batal = entryOf({ status: 'cancelled' });
    expect(canScheduleAgain(orderOf(), [batal], NOW)).toBe(true);
  });

  it('hold peneliti yang sudah basi (>1 jam) tidak lagi menahan kuota', () => {
    const basi = entryOf({
      status: 'waiting_payment',
      slotBookedBy: 'user',
      slotReservedAt: new Date(NOW - 2 * HOUR).toISOString(),
    });
    expect(canScheduleAgain(orderOf(), [basi], NOW)).toBe(true);
  });

  it('hold ADMIN tidak pernah basi — tetap menahan kuota selamanya', () => {
    const adminHold = entryOf({
      status: 'waiting_payment',
      slotBookedBy: 'admin',
      slotReservedAt: new Date(NOW - 2 * HOUR).toISOString(),
    });
    expect(canScheduleAgain(orderOf(), [adminHold], NOW)).toBe(false);
    expect(scheduleAgainBlock(orderOf(), [adminHold], NOW)).toBe('quota_held');
  });

  it('jadwal LUNAS yang masih tayang tidak memblokir jadwal berikutnya', () => {
    const lunas = entryOf({ status: 'paid', paymentStatus: 'paid' });
    expect(canScheduleAgain(orderOf(), [lunas], NOW)).toBe(true);
  });

  it('order Kilat menang atas sebab lain selama pintu tertutup (presedens)', () => {
    const menahan = entryOf({ status: 'waiting_payment' });
    expect(scheduleAgainBlock(orderOf({ distribution_type: 'kilat' }), [menahan], NOW)).toBe('kilat');
  });
});

/*
  Phase 5 §5.10 (R8) — "Pesan gelombang lagi". Pintu yang sama dengan kartu
  Kilat (`canUseKilatSelfServe`); sesudah terbuka, Kilat ikut aturan Iklan
  persis (keputusan 14 Okt).
*/
describe('canScheduleAgain — Kilat dengan pintu terbuka', () => {
  const kilat = orderOf({ distribution_type: 'kilat' });
  const open = { kilatOpen: true };
  const gelombang = (over: Partial<AdScheduleEntry> = {}) => entryOf({
    distributionType: 'kilat', kilatSlotHour: 15, duration: 1,
    startDate: '2026-09-21T08:00:00Z', endDate: '2026-09-22T08:00:00Z', ...over,
  });

  it('gelombang pertama lunas → boleh', () => {
    expect(scheduleAgainBlock(kilat, [gelombang({ status: 'paid', paymentStatus: 'paid' })], NOW, open)).toBeNull();
  });

  it('gelombang belum lunas menahan kuota → quota_held, bukan kilat', () => {
    expect(scheduleAgainBlock(kilat, [gelombang({ status: 'waiting_payment' })], NOW, open)).toBe('quota_held');
  });

  it('boleh menumpuk gelombang yang sudah lunas', () => {
    const a = gelombang({ status: 'paid', paymentStatus: 'paid' });
    const b = gelombang({ id: 'sch-2', ordinal: 2, isExtension: true, status: 'paid', paymentStatus: 'paid',
      startDate: '2026-09-23T04:00:00Z', endDate: '2026-09-24T04:00:00Z' });
    expect(canScheduleAgain(kilat, [a, b], NOW, open)).toBe(true);
  });

  it('order tidak aktif tetap order_inactive', () => {
    expect(scheduleAgainBlock(orderOf({ distribution_type: 'kilat', submission_status: 'rejected' }), [], NOW, open))
      .toBe('order_inactive');
  });

  it('Iklan tidak terpengaruh bendera', () => {
    expect(scheduleAgainBlock(orderOf(), [], NOW, { kilatOpen: false })).toBeNull();
  });
});

describe('kilatWaveClashesOwn — jarak minimal 24 jam antargelombang', () => {
  // Gelombang pertama: Senin 21 Sep 2026 15.00 WIB → [08:00Z, +24 jam).
  const pertama = entryOf({
    distributionType: 'kilat', kilatSlotHour: 15, status: 'paid', paymentStatus: 'paid',
    startDate: '2026-09-21T08:00:00Z', endDate: '2026-09-22T08:00:00Z',
  });

  it('gelombang 11.00 keesokan harinya beririsan', () => {
    expect(kilatWaveClashesOwn({ ymd: '2026-09-22', hour: 11 }, [pertama], NOW)).toBe(true);
  });

  it('gelombang 15.00 keesokan harinya bersentuhan → boleh (sama dengan server)', () => {
    expect(kilatWaveClashesOwn({ ymd: '2026-09-22', hour: 15 }, [pertama], NOW)).toBe(false);
  });

  it('gelombang sebelumnya yang irisannya di belakang juga terdeteksi', () => {
    expect(kilatWaveClashesOwn({ ymd: '2026-09-21', hour: 11 }, [pertama], NOW)).toBe(true);
  });

  it('jadwal batal tidak dihitung', () => {
    expect(kilatWaveClashesOwn({ ymd: '2026-09-22', hour: 11 }, [{ ...pertama, status: 'cancelled' }], NOW)).toBe(false);
  });
});
