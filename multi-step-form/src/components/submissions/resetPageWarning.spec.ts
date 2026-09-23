import { describe, expect, it } from 'vitest';
import { resetPageWarningOf } from './resetPageWarning';
import type { ExistingPage } from './types';

const NOW = Date.parse('2026-09-23T06:30:00Z');
const page = (over: Partial<ExistingPage> = {}): ExistingPage => ({
  slug: 'asda',
  is_published: true,
  publish_start_date: null,
  publish_end_date: null,
  respondents_count: 11,
  ...over,
});

describe('resetPageWarningOf', () => {
  it('tanpa halaman: tanpa peringatan (Reset langsung jalan)', () => {
    expect(resetPageWarningOf(undefined, NOW)).toBeNull();
  });

  it('"asda" hari ini: tersembunyi, 11 responden', () => {
    expect(resetPageWarningOf(page({ is_hidden: true }), NOW)).toEqual({ slug: 'asda', state: 'hidden', respondents: 11 });
  });

  it('terbit tanpa tanggal & tidak tersembunyi = MASIH TAYANG (kasus terburuk)', () => {
    expect(resetPageWarningOf(page(), NOW)?.state).toBe('open');
  });

  it('ditutup sistem (sql/99)', () => {
    const w = resetPageWarningOf(page({ publish_end_date: '2026-09-21T06:13:00Z', auto_closed_at: '2026-09-21T06:13:00Z' }), NOW);
    expect(w?.state).toBe('auto_closed');
  });

  it('draft menang atas segalanya', () => {
    expect(resetPageWarningOf(page({ is_published: false, is_hidden: true }), NOW)?.state).toBe('draft');
  });

  it('jendela yang berakhir normal', () => {
    expect(resetPageWarningOf(page({ publish_end_date: '2026-09-15T08:00:00Z' }), NOW)?.state).toBe('ended');
  });
});
