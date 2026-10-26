import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { translations } from '@/i18n/translations';
import { kilatBookingClosesAt } from '@/utils/airing-window';
import type { KilatWaveRow } from '@/utils/kilatWaves';

// Komponen SUNGGUHAN dirender; hanya konteks bahasa yang dipalsukan.
vi.mock('@/i18n/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'id',
    t: (key: keyof typeof translations.id, vars?: Record<string, string | number>) =>
      (translations.id[key] || key).replace(/\{(\w+)\}/g, (m, n) => (vars && n in vars ? String(vars[n]) : m)),
  }),
}));

import { KilatWavePicker } from './KilatWavePicker';

const row = (date: string, hour: number): KilatWaveRow => ({
  date,
  hour,
  used: 0,
  capacity: 2,
  bookingClosesAt: kilatBookingClosesAt(date, hour).toISOString(),
  isClosed: false,
  closedReason: null,
});

const render = (rows: KilatWaveRow[]) =>
  renderToStaticMarkup(
    createElement(KilatWavePicker, {
      availability: { rows, isLoading: false, isReady: true, hasError: false, adminAway: false } as any,
      value: null,
      onChange: () => {},
    }),
  );

describe('KilatWavePicker — hari ke-4 "Belum tersedia"', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T01:00:00Z')); // Senin 26 Okt, 08.00 WIB
  });
  afterEach(() => vi.useRealTimers());

  const rows = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'].flatMap((d) => [row(d, 11), row(d, 15)]);

  it('tiga hari kerja bisa dipilih, Kamis 29 Okt tampil terkunci', () => {
    const html = render(rows);
    expect(html).toContain('Belum tersedia');
    expect(html).toContain('29 Okt');
    // Tiga tombol tanggal saja — hari ke-4 bukan tombol.
    expect(html.match(/aria-label="[^"]*Oktober[^"]*"/g)).toHaveLength(4);
    expect(html.match(/<button[^>]*aria-label="[^"]*29 Oktober/)).toBeNull();
    expect(html).toContain('role="note" aria-label="Kamis, 29 Oktober — Belum tersedia"');
  });
});
