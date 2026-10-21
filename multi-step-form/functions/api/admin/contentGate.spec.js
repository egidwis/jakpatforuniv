import { describe, expect, it } from 'vitest';
import { pageFilterQuery, validateAdminContent } from './contentGate.js';

const id = 'b7eb61ca-079a-4787-9787-be253b0a1111';

describe('validateAdminContent', () => {
  it('meloloskan hapus satu bukti', () => {
    expect(validateAdminContent({ action: 'clear-proof', respondentId: id })).toBeNull();
  });

  it('menolak bukti tanpa target tunggal', () => {
    expect(validateAdminContent({ action: 'clear-proof', respondentId: id, pageId: id })).toMatch(/bukti/);
  });

  it('meloloskan tautan kampanye', () => {
    expect(validateAdminContent({ action: 'create-link', sourceName: 'ig-story' })).toBeNull();
  });

  it('menolak nama sumber yang bisa jadi filter', () => {
    expect(validateAdminContent({ action: 'create-link', sourceName: 'a,b' })).toMatch(/sumber/);
  });

  it('menolak kolom halaman di luar daftar', () => {
    expect(validateAdminContent({
      action: 'patch-pages',
      patch: { views_count: 10 },
      filters: [{ col: 'id', op: 'eq', val: id }],
    })).toMatch(/Kolom/);
  });

  it('menolak tambal seluruh tabel', () => {
    expect(validateAdminContent({
      action: 'patch-pages',
      patch: { is_hidden: true },
      filters: [{ col: 'publish_end_date', op: 'gt', val: '2026-01-01T00:00:00Z' }],
    })).toMatch(/Filter/);
  });

  it('menyusun filter yang tertambat ke satu order', () => {
    expect(pageFilterQuery([
      { col: 'submission_id', op: 'eq', val: id },
      { col: 'auto_closed_at', op: 'is', val: null },
    ])).toBe(`submission_id=eq.${id}&auto_closed_at=is.null`);
  });
});

describe('reorder-pages (Simpan urutan Live Feed)', () => {
  const a = 'b7eb61ca-079a-4787-9787-be253b0a1111';
  const b = 'c8fc72db-18ab-4898-8898-cf364c1b2222';

  it('larik uuid unik saja', async () => {
    const { validateAdminContent } = await import('./contentGate.js');
    expect(validateAdminContent({ action: 'reorder-pages', orderedIds: [a, b] })).toBeNull();
    expect(validateAdminContent({ action: 'reorder-pages', orderedIds: [] })).toMatch(/Urutan/);
    expect(validateAdminContent({ action: 'reorder-pages', orderedIds: [a, a] })).toMatch(/Urutan/);
    expect(validateAdminContent({ action: 'reorder-pages', orderedIds: [a, 'x'] })).toMatch(/Urutan/);
  });

  it('membaca ulang: halaman yang tidak mendarat di urutannya terlapor', async () => {
    const { reorderMismatch } = await import('./contentGate.js');
    expect(reorderMismatch([a, b], [{ id: a, display_order: 0 }, { id: b, display_order: 1 }])).toEqual([]);
    expect(reorderMismatch([a, b], [{ id: a, display_order: 5 }, { id: b, display_order: 1 }])).toEqual([a]);
    expect(reorderMismatch([a, b], [])).toEqual([a, b]);
  });
});
