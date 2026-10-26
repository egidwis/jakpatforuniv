import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { translations } from '@/i18n/translations';

// Komponen SUNGGUHAN dirender; hanya konteks bahasa yang dipalsukan.
vi.mock('@/i18n/LanguageContext', () => ({
  useLanguage: () => ({ language: 'id', t: (key: keyof typeof translations.id) => translations.id[key] || key }),
}));
vi.mock('../i18n/LanguageContext', () => ({
  useLanguage: () => ({ language: 'id', t: (key: keyof typeof translations.id) => translations.id[key] || key }),
}));

import { ProductCardGrid } from './CreateOrderCards';

const render = (kilatOpen: boolean) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ProductCardGrid, {
    onOpenAdsModal: () => {},
    onOpenKilatModal: kilatOpen ? () => {} : undefined,
  })));

const count = (html: string, text: string) => html.split(`>${text}<`).length - 1;

describe('Buat Order Baru — chip status produk', () => {
  it('akun yang boleh Kilat: Kilat "Baru", Iklan tetap "Tersedia"', () => {
    const html = render(true);
    expect(count(html, 'Baru')).toBe(1);
    expect(count(html, 'Tersedia')).toBe(1);
    expect(html).not.toContain('Segera Hadir');
  });

  it('akun lain: Kilat tetap "Segera Hadir", tanpa "Baru"', () => {
    const html = render(false);
    expect(count(html, 'Segera Hadir')).toBe(1);
    expect(count(html, 'Baru')).toBe(0);
    expect(count(html, 'Tersedia')).toBe(1);
  });
});
