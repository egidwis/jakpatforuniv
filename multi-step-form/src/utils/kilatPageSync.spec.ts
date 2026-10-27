import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: { access_token: 'jwt-admin' } } }),
    },
  }),
}));

const { updateKilatSchedule } = await import('./supabase');

const pageWrites = () => calls.filter((c) => c.table === 'survey_pages' && c.ops.some((o) => o[0] === 'update'));
const patchOf = (c: Call) => c.ops.find((o) => o[0] === 'update')![1] as Record<string, string>;

describe('updateKilatSchedule — sinkron jendela halaman', () => {
  beforeEach(() => { calls = []; pages = []; paymentStatus = 'paid'; });

  it('sql/130: halaman jadi [gelombang − 60 menit, NULL) — live sampai dimatikan', async () => {
    pages = [{ id: 'pg-1', publish_end_date: '2026-10-17T04:00:00Z' }];
    await updateKilatSchedule('sub-1', '2026-10-20', 11);
    const [w] = pageWrites();
    expect(patchOf(w).publish_start_date).toBe('2026-10-20T03:00:00.000Z');
    expect(patchOf(w).publish_end_date).toBeNull();
    expect(w.ops).toContainEqual(['eq', 'id', 'pg-1']);
    expect(w.ops).toContainEqual(['is', 'auto_closed_at', null]);
  });

  it('halaman yang sudah terbuka (publish_end NULL) diperlakukan sama', async () => {
    pages = [{ id: 'pg-old', publish_end_date: null }];
    await updateKilatSchedule('sub-1', '2026-10-20', 15);
    const patch = patchOf(pageWrites()[0]);
    expect(patch.publish_start_date).toBe('2026-10-20T07:00:00.000Z');
    expect(patch.publish_end_date).toBeNull();
  });

  it('pembacaan halaman menyaring auto_closed_at (halaman ditutup sistem tidak disentuh)', async () => {
    await updateKilatSchedule('sub-1', '2026-10-20', 11);
    const read = calls.find((c) => c.table === 'survey_pages' && !c.ops.some((o) => o[0] === 'update'))!;
    expect(read.ops).toContainEqual(['eq', 'submission_id', 'sub-1']);
    expect(read.ops).toContainEqual(['is', 'auto_closed_at', null]);
    expect(pageWrites()).toHaveLength(0);
  });
});

/*
  Jalur PRODUKSI (bukan VITEST): tulisan form_submissions lewat
  /api/admin/schedule (sql/119_order_fields menolak JWT browser Product),
  lalu jendela halaman lewat /api/admin/content. Saat merge seri keamanan
  19 Okt, versi gabungan langsung `return true` sesudah /api/admin/schedule
  sehingga halaman tidak pernah ikut gelombang — tes ini menguncinya.
*/
describe('updateKilatSchedule — jalur produksi lewat Pages Function', () => {
  let posts: { url: string; body: any }[] = [];
  beforeEach(() => {
    calls = []; posts = [];
    pages = [{ id: 'pg-1', publish_end_date: '2026-10-17T04:00:00Z' }];
    vi.stubEnv('VITEST', '');
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      posts.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ data: [{ id: 'x' }] }), { status: 200 });
    }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('aksi kilat lalu patch-pages, nol tulisan langsung ke tabel', async () => {
    await updateKilatSchedule('sub-1', '2026-10-20', 11);
    expect(posts.map((p) => [p.url, p.body.action])).toEqual([
      ['/api/admin/schedule', 'kilat'],
      ['/api/admin/content', 'patch-pages'],
    ]);
    expect(posts[0].body).toMatchObject({ submissionId: 'sub-1', ymd: '2026-10-20', endYmd: '2026-10-21', hour: 11 });
    expect(posts[1].body.patch).toMatchObject({
      publish_start_date: '2026-10-20T03:00:00.000Z',
      publish_end_date: null,
    });
    expect(calls.filter((c) => c.ops.some((o) => o[0] === 'update'))).toHaveLength(0);
  });

  it('aksi kilat ditolak → halaman tidak disentuh', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      posts.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }));
    await expect(updateKilatSchedule('sub-1', '2026-10-20', 11)).rejects.toThrow('Unauthorized');
    expect(posts.map((p) => p.url)).toEqual(['/api/admin/schedule']);
  });
});
