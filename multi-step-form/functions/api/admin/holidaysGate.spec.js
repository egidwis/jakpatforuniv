import { describe, expect, it } from 'vitest';
import { validateHoliday, holidayRow, isCalendarYmd } from './holidaysGate.js';

describe('validateHoliday', () => {
  it('meloloskan satu tanggal + saklar + label', () => {
    expect(validateHoliday({ date: '2026-12-25', isActive: true, label: 'Natal' })).toBeNull();
    expect(validateHoliday({ date: '2026-12-25', isActive: false })).toBeNull();
  });

  it('menolak tanggal yang bukan tanggal kalender', () => {
    expect(validateHoliday({ date: '2026-02-30', isActive: true })).toMatch(/Tanggal/);
    expect(validateHoliday({ date: '25-12-2026', isActive: true })).toMatch(/Tanggal/);
    expect(validateHoliday({ date: ['2026-12-25'], isActive: true })).toMatch(/Tanggal/);
  });

  it('menolak tahun di luar 2026–2030', () => {
    expect(isCalendarYmd('2025-12-25')).toBe(false);
    expect(isCalendarYmd('2031-01-01')).toBe(false);
  });

  it('saklar wajib boolean, bukan teks', () => {
    expect(validateHoliday({ date: '2026-12-25', isActive: 'true' })).toMatch(/aktif/);
    expect(validateHoliday({ date: '2026-12-25' })).toMatch(/aktif/);
  });

  it('label > 80 karakter ditolak (cermin CHECK sql/117, ikut rename sql/120)', () => {
    expect(validateHoliday({ date: '2026-12-25', isActive: true, label: 'x'.repeat(81) })).toMatch(/80/);
  });

  it('menolak body kosong', () => {
    expect(validateHoliday(null)).toMatch(/kosong/);
  });
});

describe('holidayRow', () => {
  it('memangkas label dan mencatat penulis', () => {
    expect(holidayRow({ date: '2026-12-25', isActive: true, label: '  Natal ' }, 'a@b.c', 'T')).toEqual({
      holiday_date: '2026-12-25', label: 'Natal', is_active: true, updated_at: 'T', updated_by: 'a@b.c',
    });
  });

  it('label tidak dikirim → tidak ikut (mematikan tidak mengosongkan pesan)', () => {
    expect(holidayRow({ date: '2026-12-25', isActive: false }, 'a@b.c', 'T')).not.toHaveProperty('label');
  });

  it('label_en hanya ikut bila diberikan', () => {
    expect(holidayRow({ date: '2026-12-25', isActive: true, label: 'x' }, 'a', 'T', 'Hi')).toMatchObject({ label_en: 'Hi' });
    expect(holidayRow({ date: '2026-12-25', isActive: true, label: 'x' }, 'a', 'T')).not.toHaveProperty('label_en');
  });
});
