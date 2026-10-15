import { describe, expect, test } from 'vitest';
import { nextWorkingDay } from './airing-window';
import { activeHolidaySet, adminHolidayOn, type OperationalHoliday } from './operationalHolidays';

/*
  Kalender libur operasional (Phase 5 §5.4b, rilis R3) — logika banner
  "admin libur". Penolakan klaim Kilat di tanggal libur ditegakkan trigger
  sql/117 dan sudah dibuktikan dengan dijalankan di berkas itu.
*/

const H = (date: string, isActive = true, label = 'Libur'): OperationalHoliday => ({ date, label, isActive });

describe('nextWorkingDay', () => {
  test('Jumat → Senin (melewati akhir pekan)', () => {
    expect(nextWorkingDay('2026-10-16', new Set())).toBe('2026-10-19');
  });

  test('melewati libur berturut-turut dan akhir pekan sekaligus', () => {
    // Kamis 24 Des libur → Jumat 25 (Natal) libur → Sabtu/Minggu → Senin 28
    expect(nextWorkingDay('2026-12-24', new Set(['2026-12-24', '2026-12-25']))).toBe('2026-12-28');
    // Senin 28 juga libur → Selasa 29
    expect(nextWorkingDay('2026-12-24', new Set(['2026-12-25', '2026-12-28']))).toBe('2026-12-29');
  });

  test('selalu SESUDAH tanggal awal, walau tanggal awal hari kerja', () => {
    expect(nextWorkingDay('2026-10-14', new Set())).toBe('2026-10-15');
  });

  test('melintasi tahun', () => {
    expect(nextWorkingDay('2026-12-31', new Set(['2027-01-01']))).toBe('2027-01-04');
  });
});

describe('adminHolidayOn', () => {
  test('hari libur aktif → label + hari kerja berikutnya', () => {
    const rows = [H('2026-12-24', true, 'Cuti bersama'), H('2026-12-25', true, 'Natal')];
    expect(adminHolidayOn('2026-12-25', rows)).toEqual({ label: 'Natal', resumesOn: '2026-12-28' });
    expect(adminHolidayOn('2026-12-24', rows)).toEqual({ label: 'Cuti bersama', resumesOn: '2026-12-28' });
  });

  test('saklar nonaktif = hari biasa, dan tidak ikut menunda hari kerja', () => {
    const rows = [H('2026-12-25', true, 'Natal'), H('2026-12-28', false)];
    expect(adminHolidayOn('2026-12-28', rows)).toBeNull();
    expect(adminHolidayOn('2026-12-25', rows)?.resumesOn).toBe('2026-12-28');
  });

  test('hari tanpa baris → null (akhir pekan biasa bukan "libur admin")', () => {
    expect(adminHolidayOn('2026-10-17', [])).toBeNull();
  });

  test('activeHolidaySet hanya memuat yang aktif', () => {
    expect([...activeHolidaySet([H('2026-12-25'), H('2026-12-26', false)])]).toEqual(['2026-12-25']);
  });
});
