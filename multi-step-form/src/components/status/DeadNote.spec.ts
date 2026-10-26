import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { translations } from '@/i18n/translations';

// Komponen SUNGGUHAN dirender; hanya konteks bahasa yang dipalsukan (tak ada
// localStorage di lingkungan node) dengan `t` asli dari tabel terjemahan.
vi.mock('@/i18n/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'id',
    t: (key: keyof typeof translations.id, vars?: Record<string, string | number>) =>
      (translations.id[key] || key).replace(/\{(\w+)\}/g, (m, n) => (vars && n in vars ? String(vars[n]) : m)),
  }),
}));

import { DeadNote, type DeadStep } from './SchedulePhase';

const render = (step: Partial<DeadStep>) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(DeadNote, {
        text: 'Tim Jakpat membatalkan tanggal tayang pesanan ini.',
        step: { kind: null, newOrderTo: '/dashboard/submit-iklan', againLabel: 'Perpanjang Iklan', ...step },
      }),
    ),
  );

describe('DeadNote — langkah peneliti sesudah jadwal batal', () => {
  it('order mati → kalimat langkah + tombol Buat Order Baru; TANPA Chat Mimin', () => {
    const html = render({ kind: 'new_order' });
    expect(html).toContain('Tim Jakpat membatalkan');
    expect(html).toContain('Untuk tayang di tanggal lain, buat order baru.');
    expect(html).toContain('href="/dashboard/submit-iklan"');
    expect(html).toContain('Buat Order Baru');
    expect(html).not.toContain('/dashboard/chat');
    expect(html).not.toContain('Chat Mimin');
  });

  it('order Kilat dari akun yang boleh Kilat → tombol membawa ?product=kilat', () => {
    const html = render({ kind: 'new_order', newOrderTo: '/dashboard/submit-iklan?product=kilat' });
    expect(html).toContain('href="/dashboard/submit-iklan?product=kilat"');
  });

  it('order masih hidup → hanya menunjuk tombol jadwal-lagi di bawah, tanpa tombol baru', () => {
    const html = render({ kind: 'pick_again', againLabel: 'Pesan gelombang' });
    expect(html).toContain('Pilih tanggal baru lewat «Pesan gelombang» di bawah.');
    expect(html).not.toContain('<a ');
  });

  it('jadwal lain menahan kuota → hanya kalimat sebabnya, tanpa langkah dan tanpa Mimin', () => {
    const html = render({ kind: null });
    expect(html).toContain('Tim Jakpat membatalkan');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('Chat Mimin');
  });
});
