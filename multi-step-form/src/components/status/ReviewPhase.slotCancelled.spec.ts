import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { translations } from '@/i18n/translations';
import type { AdScheduleEntry, FormSubmission } from '@/utils/supabase';

// Komponen SUNGGUHAN dirender; hanya konteks bahasa yang dipalsukan.
vi.mock('@/i18n/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'id',
    t: (key: keyof typeof translations.id, vars?: Record<string, string | number>) =>
      (translations.id[key] || key).replace(/\{(\w+)\}/g, (m, n) => (vars && n in vars ? String(vars[n]) : m)),
  }),
}));

import { ReviewPhase } from './ReviewPhase';

const submission = {
  id: 'e0e7ae16-0000-4000-8000-000000000000',
  title: 'Untitled form',
  survey_url: 'https://docs.google.com/forms/d/x',
  submission_method: 'google_import',
  submission_status: 'slot_cancelled',
  review_history: [],
} as unknown as FormSubmission;
const first = { reviewStatus: 'approved' } as unknown as AdScheduleEntry;

const render = (slotCancelled: Parameters<typeof ReviewPhase>[0]['slotCancelled'], hadBilledInvoice = false) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null,
      createElement(ReviewPhase, { submission, first, active: true, hadBilledInvoice, slotCancelled })),
  );

const ENDED = {
  text: translations.id.bannerSubSlotCancelled,
  step: { kind: 'new_order' as const, newOrderTo: '/dashboard/submit-iklan?product=kilat', againLabel: 'x' },
};

describe('ReviewPhase — jadwal pertama batal tampil di Fase ①', () => {
  it('chip "Dibatalkan", judul "Pesanan Dibatalkan", penyebab, dan tombol Buat Order Baru', () => {
    const html = render(ENDED);
    expect(html).toContain('Dibatalkan');
    expect(html).not.toContain(translations.id.reviewChipApproved);
    expect(html).toContain('Pesanan Dibatalkan');
    expect(html).toContain(translations.id.bannerSubSlotCancelled);
    expect(html).toContain('href="/dashboard/submit-iklan?product=kilat"');
    expect(html).toContain('direview ulang');
    expect(html).not.toMatch(/tetap lolos review/i);
  });

  it('peringatan link lama hanya bila tagihan sempat terbit', () => {
    expect(render(ENDED)).not.toContain(translations.id.cancelledStaleInvoiceWarning);
    expect(render(ENDED, true)).toContain(translations.id.cancelledStaleInvoiceWarning);
  });

  it('tanpa prop: order hidup tetap "Disetujui"', () => {
    const html = render(null);
    expect(html).toContain(translations.id.reviewChipApproved);
    expect(html).not.toContain('Pesanan Dibatalkan');
  });
});
