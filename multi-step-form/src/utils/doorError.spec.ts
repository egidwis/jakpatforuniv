import { describe, it, expect } from 'vitest';
import { doorError, isDailyQuotaFullError, kilatWaveErrorKind } from './dailyQuotaError';

describe('doorError', () => {
  it('HINT trigger ikut, jadi peta galat gelombang & kuota tetap bekerja', () => {
    const wave = doorError({ error: 'Gelombang JFU Kilat … sudah penuh (2 dari 2).', hint: 'kilat_wave_full', code: 'P0001' }, 'x');
    expect(wave.message).toContain('sudah penuh');
    expect(kilatWaveErrorKind(wave)).toBe('full');
    expect(wave.code).toBe('P0001');
    expect(isDailyQuotaFullError(doorError({ error: 'penuh', hint: 'daily_quota_full' }, 'x'))).toBe(true);
  });

  it('badan kosong / bukan JSON → kalimat cadangan, tanpa hint', () => {
    const e = doorError(null, 'Gagal mengunci tanggal (HTTP 502)');
    expect(e.message).toBe('Gagal mengunci tanggal (HTTP 502)');
    expect(e.hint).toBeUndefined();
  });
});
