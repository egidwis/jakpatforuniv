import { describe, expect, test } from 'vitest';
import { toAiringEndIso, toAiringLastDayIso } from './airing-window';

/** Tanggal WIB dari sebuah instant, sebagai YYYY-MM-DD. */
const wibYmd = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

describe('hari tayang terakhir vs akhir jendela tayang', () => {
  test('order 7 hari yang mulai 1 Sep tayang terakhir pada 7 Sep, bukan 8 Sep', () => {
    expect(wibYmd(toAiringLastDayIso('2026-09-01', 7))).toBe('2026-09-07');
  });

  test('order 1 hari mulai dan berakhir di tanggal yang sama', () => {
    expect(wibYmd(toAiringLastDayIso('2026-09-01', 1))).toBe('2026-09-01');
  });

  test('akhir jendela tetap eksklusif — ia yang ditulis ke end_date', () => {
    // Dibiarkan apa adanya: database memang menyimpan batas eksklusif.
    // Yang tidak boleh adalah MENAMPILKAN angka ini sebagai ujung rentang.
    expect(wibYmd(toAiringEndIso('2026-09-01', 7))).toBe('2026-09-08');
  });

  test('hari terakhir selalu tepat satu hari sebelum akhir jendela', () => {
    for (const days of [1, 2, 3, 7, 14, 30]) {
      const last = Date.parse(toAiringLastDayIso('2026-09-01', days));
      const end = Date.parse(toAiringEndIso('2026-09-01', days));
      expect(end - last).toBe(86_400_000);
    }
  });

  test('durasi nol atau negatif tidak menarik mundur ke sebelum tanggal mulai', () => {
    expect(wibYmd(toAiringLastDayIso('2026-09-01', 0))).toBe('2026-09-01');
    expect(wibYmd(toAiringLastDayIso('2026-09-01', -3))).toBe('2026-09-01');
  });
});
