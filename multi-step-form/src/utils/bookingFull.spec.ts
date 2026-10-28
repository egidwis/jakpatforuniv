import { describe, it, expect } from 'vitest';
import { bookingBlockedReason } from './bookingFull';
import { kilatBookingClosesAt } from './airing-window';
import type { KilatWaveRow } from './kilatWaves';

/*
  Kuota penuh → tim yang menjadwalkan (keputusan 27 Okt 2026). SATU predikat
  untuk tiga layar (wizard, Jadwal & Bayar, Jadwal Baru). KOSONG BUKAN PENUH:
  data yang belum terbaca / gagal tidak pernah memunculkan kartu penuh.
*/

// Senin 19 Okt 2026, 08.00 WIB.
const NOW = new Date('2026-10-19T01:00:00Z');
const wave = (date: string, hour: number, used = 0): KilatWaveRow => ({
  date, hour, used, capacity: 2,
  bookingClosesAt: kilatBookingClosesAt(date, hour).toISOString(),
  isClosed: false, closedReason: null,
});
const fullWindow = ['2026-10-19', '2026-10-20', '2026-10-21'].flatMap((d) => [wave(d, 11, 2), wave(d, 15, 2)]);
const waves = (o: Partial<{ isReady: boolean; hasError: boolean; adminAway: boolean; rows: KilatWaveRow[] }> = {}) =>
  ({ isReady: true, hasError: false, adminAway: false, rows: fullWindow, ...o });
const ads = (o: Partial<{ isReady: boolean; hasError: boolean; isRangeAvailable: (s: string, d: number) => boolean }> = {}) =>
  ({ isReady: true, hasError: false, isRangeAvailable: () => false, ...o });

describe('bookingBlockedReason', () => {
  it('Kilat: jendela penuh → full; ada kursi → null', () => {
    expect(bookingBlockedReason({ isKilat: true, waves: waves(), availability: ads(), duration: 1, now: NOW })).toBe('full');
    const open = [...fullWindow.slice(1), wave('2026-10-19', 11, 1)];
    expect(bookingBlockedReason({ isKilat: true, waves: waves({ rows: open }), availability: ads(), duration: 1, now: NOW })).toBeNull();
  });

  it('Iklan: tidak ada tanggal yang muat → full; ada → null', () => {
    expect(bookingBlockedReason({ isKilat: false, waves: waves(), availability: ads(), duration: 7, now: NOW })).toBe('full');
    expect(bookingBlockedReason({ isKilat: false, waves: waves(), availability: ads({ isRangeAvailable: () => true }), duration: 7, now: NOW })).toBeNull();
  });

  it('KOSONG BUKAN PENUH: belum terbaca / galat → null, untuk kedua produk', () => {
    expect(bookingBlockedReason({ isKilat: true, waves: waves({ isReady: false, rows: [] }), availability: ads(), duration: 1, now: NOW })).toBeNull();
    expect(bookingBlockedReason({ isKilat: true, waves: waves({ hasError: true }), availability: ads(), duration: 1, now: NOW })).toBeNull();
    expect(bookingBlockedReason({ isKilat: false, waves: waves(), availability: ads({ isReady: false }), duration: 1, now: NOW })).toBeNull();
    expect(bookingBlockedReason({ isKilat: false, waves: waves(), availability: ads({ hasError: true }), duration: 1, now: NOW })).toBeNull();
  });

  it('mode libur Kilat punya pemberitahuannya sendiri → null', () => {
    expect(bookingBlockedReason({ isKilat: true, waves: waves({ adminAway: true }), availability: ads(), duration: 1, now: NOW })).toBeNull();
  });

  it('produk lain tidak ikut menilai: Iklan penuh tidak memblokir Kilat', () => {
    const open = [wave('2026-10-20', 11)];
    expect(bookingBlockedReason({ isKilat: true, waves: waves({ rows: open }), availability: ads(), duration: 1, now: NOW })).toBeNull();
  });
});
