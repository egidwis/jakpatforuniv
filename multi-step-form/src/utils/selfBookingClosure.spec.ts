import { describe, expect, test, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

const {
  canSelfSchedule,
  closureOf,
  isSelfBookingClosedError,
  selfBookingBlocked,
} = await import('./selfBookingClosure');

/*
  Tutup reservasi mandiri (sql/125). Penolakan server dibuktikan di harness
  PGlite berkas sql/125 dan lock.spec.js; di sini aturan klien.
*/

const autoOrder = {
  submission_method: 'google_import',
  survey_url: 'https://docs.google.com/forms/d/x',
  detected_keywords: [],
  voucher_code: '',
} as any;
const closure = { since: '2026-10-22', message: 'Penyesuaian', messageEn: '' };

describe('closureOf', () => {
  test('baris aktif terbaru = masa tutup yang berjalan', () => {
    expect(closureOf([])).toBeNull();
    expect(closureOf([{ date: '2026-10-20', label: 'lama', labelEn: '', isActive: false }])).toBeNull();
    expect(closureOf([
      { date: '2026-10-20', label: 'a', labelEn: '', isActive: true },
      { date: '2026-10-22', label: 'b', labelEn: 'B', isActive: true },
    ])).toEqual({ since: '2026-10-22', message: 'b', messageEn: 'B' });
  });
});

describe('selfBookingBlocked', () => {
  test('saklar tutup ATAU order bercap', () => {
    expect(selfBookingBlocked({ self_booking_closed_at: null }, null)).toBe(false);
    expect(selfBookingBlocked({ self_booking_closed_at: null }, closure)).toBe(true);
    expect(selfBookingBlocked({ self_booking_closed_at: '2026-10-22T03:00:00Z' }, null)).toBe(true);
    expect(selfBookingBlocked(null, null)).toBe(false);
  });
});

describe('canSelfSchedule', () => {
  test('review otomatis, tanpa cap, saklar buka → boleh memilih sendiri', () => {
    expect(canSelfSchedule(autoOrder, null)).toBe(true);
  });

  test('saklar tutup atau order bercap → tidak', () => {
    expect(canSelfSchedule(autoOrder, closure)).toBe(false);
    expect(canSelfSchedule({ ...autoOrder, self_booking_closed_at: '2026-10-22T03:00:00Z' }, null)).toBe(false);
  });

  test('order jalur manual tetap tidak pernah memilih sendiri', () => {
    expect(canSelfSchedule({ ...autoOrder, submission_method: 'manual' }, null)).toBe(false);
  });
});

describe('isSelfBookingClosedError', () => {
  test('kode dari lock.js (409) atau HINT trigger sql/125', () => {
    expect(isSelfBookingClosedError(Object.assign(new Error('x'), { code: 'self_booking_closed' }))).toBe(true);
    expect(isSelfBookingClosedError({ hint: 'self_booking_closed', message: 'x' })).toBe(true);
    expect(isSelfBookingClosedError(new Error('lain'))).toBe(false);
    expect(isSelfBookingClosedError(null)).toBe(false);
  });
});
