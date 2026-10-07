import { describe, it, expect } from 'vitest';
import { isDailyQuotaFullError } from './dailyQuotaError';

describe('isDailyQuotaFullError', () => {
  it('mengenali HINT sql/111 walau pesannya berubah', () => {
    expect(isDailyQuotaFullError({ message: 'apa pun', hint: 'daily_quota_full', code: 'P0001' })).toBe(true);
  });

  it('mengenali teks "sudah penuh" (sql/110 tanpa HINT)', () => {
    expect(
      isDailyQuotaFullError({
        message: 'Kuota iklan reguler pada 06 Okt 2026 sudah penuh (4 dari 4). Pilih tanggal lain.',
        details: null,
        hint: null,
      })
    ).toBe(true);
  });

  it('mengenali Error biasa yang membawa pesan database', () => {
    expect(isDailyQuotaFullError(new Error('Kuota iklan tambahan pada 07 Okt 2026 sudah penuh (4 dari 4).'))).toBe(true);
  });

  it('menolak galat lain', () => {
    expect(isDailyQuotaFullError({ message: 'Jendela tayang 91 hari melebihi batas 90 hari.', hint: 'schedule_window_too_long' })).toBe(false);
    expect(isDailyQuotaFullError({ message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(isDailyQuotaFullError(null)).toBe(false);
    expect(isDailyQuotaFullError('sudah penuh')).toBe(false);
  });
});
