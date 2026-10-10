import { describe, it, expect } from 'vitest';
import { wibHorizonYmds, lockedDateFitsHorizon, SCHEDULE_HORIZON_DAYS } from './scheduleHorizon';

// 10 Okt 2026 00.30 WIB = 9 Okt 17.30 UTC. Perangkat berzona barat UTC masih
// melihat 9 Okt — kalendernya harus tetap mulai 10 Okt.
const JUST_AFTER_WIB_MIDNIGHT = new Date('2026-10-09T17:30:00Z');
// 9 Okt 2026 23.59 WIB.
const JUST_BEFORE_WIB_MIDNIGHT = new Date('2026-10-09T16:59:00Z');

describe('wibHorizonYmds', () => {
  it('mulai dari hari WIB, bukan hari perangkat', () => {
    const days = wibHorizonYmds(JUST_AFTER_WIB_MIDNIGHT);
    expect(days[0]).toBe('2026-10-10');
    expect(wibHorizonYmds(JUST_BEFORE_WIB_MIDNIGHT)[0]).toBe('2026-10-09');
  });

  it('14 hari berurutan tanpa celah', () => {
    const days = wibHorizonYmds(JUST_AFTER_WIB_MIDNIGHT);
    expect(days).toHaveLength(SCHEDULE_HORIZON_DAYS);
    expect(days[13]).toBe('2026-10-23');
    expect(new Set(days).size).toBe(14);
  });

  it('melewati pergantian bulan', () => {
    const days = wibHorizonYmds(new Date('2026-10-25T03:00:00Z'));
    expect(days[0]).toBe('2026-10-25');
    expect(days).toContain('2026-10-31');
    expect(days).toContain('2026-11-01');
    expect(days[13]).toBe('2026-11-07');
  });
});

describe('lockedDateFitsHorizon', () => {
  const now = JUST_AFTER_WIB_MIDNIGHT; // hari ini WIB = 2026-10-10

  it('tanpa tanggal → kartu cadangan', () => {
    expect(lockedDateFitsHorizon(null, now)).toBe(false);
    expect(lockedDateFitsHorizon(undefined, now)).toBe(false);
    expect(lockedDateFitsHorizon('', now)).toBe(false);
  });

  it('bentuk selain YYYY-MM-DD ditolak, bukan ditebak', () => {
    expect(lockedDateFitsHorizon('2026-10-12T08:00:00Z', now)).toBe(false);
    expect(lockedDateFitsHorizon('12 Okt', now)).toBe(false);
  });

  it('hari ini dan hari ke-14 masih tergambar', () => {
    expect(lockedDateFitsHorizon('2026-10-10', now)).toBe(true);
    expect(lockedDateFitsHorizon('2026-10-23', now)).toBe(true);
  });

  it('di luar jendela atau sudah lewat → kartu cadangan', () => {
    expect(lockedDateFitsHorizon('2026-10-24', now)).toBe(false);
    expect(lockedDateFitsHorizon('2026-11-30', now)).toBe(false);
    expect(lockedDateFitsHorizon('2026-10-09', now)).toBe(false);
  });

  it('memakai hari WIB: 9 Okt sudah lewat walau perangkat masih 9 Okt', () => {
    expect(lockedDateFitsHorizon('2026-10-09', JUST_AFTER_WIB_MIDNIGHT)).toBe(false);
    expect(lockedDateFitsHorizon('2026-10-09', JUST_BEFORE_WIB_MIDNIGHT)).toBe(true);
  });
});
