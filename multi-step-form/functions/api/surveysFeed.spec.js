import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  /api/surveys (feed aplikasi Jakpat) — handler SUNGGUHAN dijalankan dengan
  klien supabase tiruan. Menggantikan pemeriksaan teks lama sebagai bukti
  bahwa Kilat tidak pernah tampil di feed (insiden 18 Sep: sql/95 terbit
  sebelum filternya → 40 respons nyasar ke 12 halaman Kilat lama).
*/

let pages = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const q = {
      select: () => q, eq: () => q, or: () => q,
      order: () => Promise.resolve({ data: pages, error: null }),
    };
    return { from: () => q, rpc: () => Promise.resolve({ data: [], error: null }) };
  },
}));

const { onRequestGet: onRequest } = await import('./surveys.js');

const call = async () => {
  const res = await onRequest({
    request: new Request('https://jfu.test/api/surveys', { headers: { 'X-API-Key': 'k' } }),
    env: { JFU_API_KEY: 'k', VITE_SUPABASE_URL: 'https://db.test', VITE_SUPABASE_ANON_KEY: 'anon' },
  });
  return (await res.json()).data.map((d) => d.slug);
};

const page = (slug, o = {}) => ({
  id: slug, slug, title: slug, created_at: '2026-10-01T00:00:00Z', is_published: true,
  publish_start_date: null, publish_end_date: null, display_order: null, is_extra_ad: false,
  submission_id: 'sub-' + slug, form_submissions: { distribution_type: 'regular', prize_per_winner: 1, winner_count: 1 },
  ...o,
});

describe('/api/surveys — Kilat tidak pernah di feed', () => {
  beforeEach(() => { pages = []; });

  it('Iklan tampil; Kilat (objek & array) dibuang', async () => {
    pages = [
      page('iklan'),
      page('kilat-obj', { form_submissions: { distribution_type: 'kilat' } }),
      page('kilat-arr', { form_submissions: [{ distribution_type: 'kilat' }] }),
    ];
    expect(await call()).toEqual(['iklan']);
  });

  it('halaman yatim (tanpa submission_id) tetap tampil', async () => {
    pages = [page('pengumuman', { submission_id: null, form_submissions: null })];
    expect(await call()).toEqual(['pengumuman']);
  });

  it('FAIL-CLOSED: punya submission_id tapi join kosong → dibuang (tak bisa dibuktikan bukan Kilat)', async () => {
    pages = [
      page('join-null', { form_submissions: null }),
      page('join-kosong', { form_submissions: [] }),
      page('iklan'),
    ];
    expect(await call()).toEqual(['iklan']);
  });

  it('Kilat live (publish_end_date NULL) tetap dibuang', async () => {
    pages = [page('kilat-live', { form_submissions: { distribution_type: 'kilat' }, publish_start_date: '2026-10-01T00:00:00Z' })];
    expect(await call()).toEqual([]);
  });
});
