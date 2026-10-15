import { describe, it, expect, beforeEach, vi } from 'vitest';

/*
  updateKilatSchedule → jendela halaman ikut gelombang baru (Phase 5 §5.4, R4).
  Fungsi SUNGGUHAN dipanggil dengan klien supabase tiruan yang mencatat rantai
  query per tabel. Di VITEST `adminContent` memakai jalur langsung, jadi yang
  diuji di sini isi patch dan filternya — gerbang Pages Function-nya diuji
  terpisah di contentGate.spec.js.
*/

type Call = { table: string; ops: [string, ...unknown[]][] };
let calls: Call[] = [];
let pages: any[] = [];
let paymentStatus = 'paid';

function builderFor(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const result = () => {
    const isUpdate = call.ops.some((o) => o[0] === 'update');
    if (table === 'survey_pages' && !isUpdate) return { data: pages, error: null };
    if (table === 'survey_pages') return { data: [{ id: 'p' }], error: null };
    return { data: [{ id: 'sub-1' }], error: null };
  };
  const b: any = {};
  for (const op of ['update', 'eq', 'is', 'neq', 'not', 'in', 'order', 'limit']) {
    b[op] = (...a: unknown[]) => { call.ops.push([op, ...a]); return b; };
  }
  b.select = (...a: unknown[]) => { call.ops.push(['select', ...a]); return b; };
  b.single = () => Promise.resolve({ data: { payment_status: paymentStatus }, error: null });
  b.maybeSingle = b.single;
  b.then = (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => builderFor(table),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) },
  }),
}));

const { updateKilatSchedule } = await import('./supabase');

const pageWrites = () => calls.filter((c) => c.table === 'survey_pages' && c.ops.some((o) => o[0] === 'update'));
const patchOf = (c: Call) => c.ops.find((o) => o[0] === 'update')![1] as Record<string, string>;

describe('updateKilatSchedule — sinkron jendela halaman', () => {
  beforeEach(() => { calls = []; pages = []; paymentStatus = 'paid'; });

  it('halaman berjendela: [gelombang, +24 jam) menurut WIB', async () => {
    pages = [{ id: 'pg-1', publish_end_date: '2026-10-17T04:00:00Z' }];
    await updateKilatSchedule('sub-1', '2026-10-20', 11);
    const [w] = pageWrites();
    expect(patchOf(w).publish_start_date).toBe('2026-10-20T04:00:00.000Z');
    expect(patchOf(w).publish_end_date).toBe('2026-10-21T04:00:00.000Z');
    expect(w.ops).toContainEqual(['eq', 'id', 'pg-1']);
    expect(w.ops).toContainEqual(['is', 'auto_closed_at', null]);
  });

  it('halaman Kilat LAMA (tanpa tanggal akhir): hanya awalnya yang digeser', async () => {
    pages = [{ id: 'pg-old', publish_end_date: null }];
    await updateKilatSchedule('sub-1', '2026-10-20', 15);
    const patch = patchOf(pageWrites()[0]);
    expect(patch.publish_start_date).toBe('2026-10-20T08:00:00.000Z');
    expect('publish_end_date' in patch).toBe(false);
  });

  it('pembacaan halaman menyaring auto_closed_at (halaman ditutup sistem tidak disentuh)', async () => {
    await updateKilatSchedule('sub-1', '2026-10-20', 11);
    const read = calls.find((c) => c.table === 'survey_pages' && !c.ops.some((o) => o[0] === 'update'))!;
    expect(read.ops).toContainEqual(['eq', 'submission_id', 'sub-1']);
    expect(read.ops).toContainEqual(['is', 'auto_closed_at', null]);
    expect(pageWrites()).toHaveLength(0);
  });
});
