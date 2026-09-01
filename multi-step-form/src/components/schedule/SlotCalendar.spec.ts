import { describe, it, expect } from 'vitest';
import { isSlotDateClosed } from './SlotCalendar';

describe('isSlotDateClosed — aturan pemilihan tanggal admin vs non-admin', () => {
  const TODAY = '2026-09-01';
  const TOMORROW = '2026-09-02';
  const YESTERDAY = '2026-08-31';

  // WIB = UTC+7
  // 10.00 WIB = 03:00 UTC
  // 13.00 WIB = 06:00 UTC (booking cutoff non-admin)
  // 14.15 WIB = 07:15 UTC (payment cutoff non-admin)
  // 16.00 WIB = 09:00 UTC
  // 23.59 WIB = 16:59 UTC
  const atWib = (utcTime: string) => new Date(`${TODAY}T${utcTime}Z`);

  describe('Admin (isAdmin = true)', () => {
    it('dapat memilih tanggal hari ini sebelum cutoff (10.00 WIB)', () => {
      const now = atWib('03:00:00');
      expect(isSlotDateClosed(TODAY, true, now)).toBe(false);
    });

    it('dapat memilih tanggal hari ini di saat booking cutoff (13.00 WIB)', () => {
      const now = atWib('06:00:00');
      expect(isSlotDateClosed(TODAY, true, now)).toBe(false);
    });

    it('dapat memilih tanggal hari ini meskipun lewat pukul 14.00 WIB (misal 14.15 WIB)', () => {
      const now = atWib('07:15:00');
      expect(isSlotDateClosed(TODAY, true, now)).toBe(false);
    });

    it('dapat memilih tanggal hari ini sore/malam hari (16.00 WIB, 23.59 WIB)', () => {
      expect(isSlotDateClosed(TODAY, true, atWib('09:00:00'))).toBe(false);
      expect(isSlotDateClosed(TODAY, true, atWib('16:59:00'))).toBe(false);
    });

    it('dapat memilih tanggal di masa depan (besok, dsb.)', () => {
      const now = atWib('07:15:00');
      expect(isSlotDateClosed(TOMORROW, true, now)).toBe(false);
    });

    it('TETAP TIDAK dapat memilih tanggal di masa lalu (kemarin)', () => {
      const now = atWib('07:15:00');
      expect(isSlotDateClosed(YESTERDAY, true, now)).toBe(true);
    });
  });

  describe('Non-Admin (isAdmin = false)', () => {
    it('dapat memilih tanggal hari ini sebelum cutoff (10.00 WIB)', () => {
      const now = atWib('03:00:00');
      expect(isSlotDateClosed(TODAY, false, now)).toBe(false);
    });

    it('DITUTUP untuk tanggal hari ini mulai 13.00 WIB', () => {
      const now = atWib('06:00:00');
      expect(isSlotDateClosed(TODAY, false, now)).toBe(true);
    });

    it('DITUTUP untuk tanggal hari ini setelah pukul 14.00 WIB', () => {
      const now = atWib('07:15:00');
      expect(isSlotDateClosed(TODAY, false, now)).toBe(true);
    });

    it('dapat memilih tanggal di masa depan (besok, dsb.)', () => {
      const now = atWib('07:15:00');
      expect(isSlotDateClosed(TOMORROW, false, now)).toBe(false);
    });

    it('TIDAK dapat memilih tanggal di masa lalu (kemarin)', () => {
      const now = atWib('07:15:00');
      expect(isSlotDateClosed(YESTERDAY, false, now)).toBe(true);
    });
  });
});
