import { describe, it, expect } from 'vitest';
import { validateSelfBooking, selfBookingRow } from './selfBookingGate.js';

describe('validateSelfBooking (sql/125)', () => {
  it('menerima tanggal kalender + status aktif, label opsional ≤80', () => {
    expect(validateSelfBooking({ date: '2026-10-22', isActive: true })).toBeNull();
    expect(validateSelfBooking({ date: '2026-10-22', isActive: true, label: 'Penyesuaian jadwal' })).toBeNull();
    expect(validateSelfBooking({ date: '2026-10-22', isActive: false })).toBeNull();
  });

  it('menolak bentuk yang salah', () => {
    expect(validateSelfBooking(null)).toBe('Body kosong');
    expect(validateSelfBooking({ date: '2026-02-30', isActive: true })).toBe('Tanggal tidak valid');
    expect(validateSelfBooking({ date: '2026-10-22' })).toBe('Status aktif wajib true/false');
    expect(validateSelfBooking({ date: '2026-10-22', isActive: true, label: 5 })).toBe('Label harus teks');
    expect(validateSelfBooking({ date: '2026-10-22', isActive: true, label: 'x'.repeat(81) })).toBe('Label maksimal 80 karakter');
  });
});

describe('selfBookingRow', () => {
  it('menyalakan: label dirapikan, label_en ikut bila diberikan', () => {
    expect(selfBookingRow({ date: '2026-10-22', isActive: true, label: '  Penyesuaian  ' }, 'product@jakpat.net', 'T', 'Adjusting')).toEqual({
      closed_on: '2026-10-22', is_active: true, updated_at: 'T', updated_by: 'product@jakpat.net',
      label: 'Penyesuaian', label_en: 'Adjusting',
    });
  });

  it('membuka: tanpa label & label_en — upsert tidak boleh mengosongkan pesannya', () => {
    const row = selfBookingRow({ date: '2026-10-22', isActive: false }, 'product@jakpat.net', 'T', undefined);
    expect(row).toEqual({ closed_on: '2026-10-22', is_active: false, updated_at: 'T', updated_by: 'product@jakpat.net' });
    expect('label' in row).toBe(false);
    expect('label_en' in row).toBe(false);
  });
});
