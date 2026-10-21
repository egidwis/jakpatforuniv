import { describe, expect, test } from 'vitest';
import { buildMiminAwaySection, MIMIN_AWAY_HEADING } from './miminAway';

describe('buildMiminAwaySection', () => {
  test('tidak libur → string kosong (prompt tidak berubah sama sekali)', () => {
    expect(buildMiminAwaySection(null)).toBe('');
  });

  test('libur: judul tetap, tanggal nyala, pesan admin dikutip, larangan janji hari kerja', () => {
    const out = buildMiminAwaySection({ since: '2026-12-24', message: 'Libur Natal. Kami kembali Senin, 29 Des.', messageEn: '' });
    expect(out.startsWith(MIMIN_AWAY_HEADING)).toBe(true);
    expect(out).toContain('Kamis, 24 Desember 2026');
    expect(out).toContain('"Libur Natal. Kami kembali Senin, 29 Des."');
    expect(out).toContain('JANGAN menjanjikan');
  });

  test('tanpa pesan: tidak ada tanggal kembali yang bisa dikutip', () => {
    const out = buildMiminAwaySection({ since: '2026-12-24', message: '  ', messageEn: '' });
    expect(out).toContain('tidak menulis pesan atau tanggal kembali');
    expect(out).not.toContain('Pesan admin untuk peneliti');
  });

  test('kutip ganda di pesan tidak memutus kutipan', () => {
    expect(buildMiminAwaySection({ since: '2026-12-24', message: 'Libur "Natal"', messageEn: '' }))
      .toContain('"Libur \'Natal\'"');
  });
});
