import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/*
  Jalur PRODUKSI (VITEST dimatikan) tulisan jadwal dari browser — sql/123/124.
  Fungsi SUNGGUHAN dipanggil; `fetch` dan klien supabase ditiru. Yang dikunci:
  setiap tulisan jadwal keluar lewat pintu (`/api/schedules/lock` untuk
  peneliti, `/api/admin/schedule` untuk admin) dan NOL tulisan langsung ke
  `form_submissions` / `ad_schedules` dari browser.
*/

type Call = { table: string; ops: [string, ...unknown[]][] };
let calls: Call[] = [];
let sessionEmail = 'peneliti@example.com';
/** Baris yang dipulangkan SELECT per tabel (default kosong). */
let tableRows: Record<string, unknown[]> = {};

function builderFor(table: string) {
  const call: Call = { table, ops: [] };
  calls.push(call);
  const b: any = {};
  for (const op of ['update', 'eq', 'is', 'neq', 'not', 'in', 'order', 'limit', 'or']) {
    b[op] = (...a: unknown[]) => { call.ops.push([op, ...a]); return b; };
  }
  b.select = (...a: unknown[]) => { call.ops.push(['select', ...a]); return b; };
  b.single = () => Promise.resolve({ data: { payment_status: 'pending' }, error: null });
  b.maybeSingle = b.single;
  b.then = (res: any, rej: any) => Promise.resolve({ data: tableRows[table] ?? [], error: null }).then(res, rej);
  return b;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => builderFor(table),
    rpc: vi.fn(async () => ({ data: null, error: { message: 'rpc browser dilarang' } })),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: { access_token: 'jwt', user: { email: sessionEmail } } } }),
    },
  }),
}));

const { rebookSlotForSubmission, releaseExpiredSlot, cancelSchedule, cancelOrder, createResearcherExtension } = await import('./supabase');
const { kilatWaveErrorKind } = await import('./dailyQuotaError');

let posts: { url: string; body: any }[] = [];
let reply: { status: number; body: any } = { status: 200, body: { data: { id: 'sub-1' } } };

const directWrites = () => calls.filter((c) =>
  ['form_submissions', 'ad_schedules', 'survey_pages'].includes(c.table) && c.ops.some((o) => o[0] === 'update'));

beforeEach(() => {
  calls = [];
  posts = [];
  tableRows = {};
  sessionEmail = 'peneliti@example.com';
  reply = { status: 200, body: { data: { id: 'sub-1' } } };
  vi.stubEnv('VITEST', '');
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    posts.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('rebookSlotForSubmission', () => {
  it('Iklan → lock tanpa kilatHour, durasi ikut', async () => {
    await rebookSlotForSubmission('sub-1', '2026-10-24', 3);
    expect(posts).toEqual([{ url: '/api/schedules/lock', body: { action: 'lock', submissionId: 'sub-1', startYmd: '2026-10-24', duration: 3 } }]);
    expect(directWrites()).toHaveLength(0);
  });

  it('Kilat → lock dengan kilatHour, durasi 1 — BUKAN PATCH browser', async () => {
    await rebookSlotForSubmission('sub-1', '2026-10-22', 5, { kilatHour: 15 });
    expect(posts[0].body).toEqual({ action: 'lock', submissionId: 'sub-1', startYmd: '2026-10-22', duration: 1, kilatHour: 15 });
    expect(directWrites()).toHaveLength(0);
  });

  it('galat trigger lewat pintu tetap terbaca peta galat gelombang', async () => {
    reply = { status: 400, body: { error: 'Gelombang JFU Kilat hanya Senin–Jumat.', hint: 'kilat_wave_closed' } };
    const err = await rebookSlotForSubmission('sub-1', '2026-10-24', 1, { kilatHour: 15 }).catch((e) => e);
    expect(err.message).toBe('Gelombang JFU Kilat hanya Senin–Jumat.');
    expect(kilatWaveErrorKind(err)).toBe('closed');
  });
});

describe('createResearcherExtension', () => {
  it('extend lewat pintu, memulangkan source_id; nol RPC dari browser', async () => {
    reply = { status: 200, body: { data: { id: 'src-9' } } };
    const id = await createResearcherExtension({
      submissionId: 'sub-1', startDate: '2026-10-24T08:00:00.000Z', endDate: '2026-10-25T08:00:00.000Z',
      duration: 1, prizePerWinner: 0, winnerCount: 0, isNewPeriod: false,
    });
    expect(id).toBe('src-9');
    expect(posts[0]).toMatchObject({ url: '/api/schedules/lock', body: { action: 'extend', submissionId: 'sub-1', isNewPeriod: false } });
  });
});

describe('releaseExpiredSlot', () => {
  it('peneliti → release; pintu nol baris → tagihan TIDAK disentuh', async () => {
    reply = { status: 200, body: { data: { id: null } } };
    await releaseExpiredSlot('sub-1');
    expect(posts).toEqual([{ url: '/api/schedules/lock', body: { action: 'release', submissionId: 'sub-1' } }]);
    expect(calls.some((c) => c.table === 'transactions')).toBe(false);
    expect(directWrites()).toHaveLength(0);
  });

  it('peneliti → release berhasil → transaksi pending ikut dicari', async () => {
    await releaseExpiredSlot('sub-1');
    expect(calls.some((c) => c.table === 'transactions')).toBe(true);
    expect(directWrites()).toHaveLength(0);
  });

  it('admin → /api/admin/schedule release-slot', async () => {
    sessionEmail = 'product@jakpat.net';
    await releaseExpiredSlot('sub-1');
    expect(posts[0]).toEqual({ url: '/api/admin/schedule', body: { action: 'release-slot', submissionId: 'sub-1' } });
  });
});

describe('cancelSchedule', () => {
  const entry = { submissionId: 'sub-1', sourceId: 'src-1', isExtension: true, paymentStatus: 'pending' };

  it('peneliti, perpanjangan → cancel lewat pintu, nol tulisan langsung', async () => {
    await cancelSchedule(entry);
    expect(posts[0]).toEqual({ url: '/api/schedules/lock', body: { action: 'cancel', submissionId: 'sub-1', sourceId: 'src-1', isExtension: true } });
    expect(directWrites()).toHaveLength(0);
  });

  it('admin, ordinal 1 → cancel-schedule', async () => {
    sessionEmail = 'product@jakpat.net';
    await cancelSchedule({ ...entry, sourceId: 'sub-1', isExtension: false });
    expect(posts[0]).toEqual({ url: '/api/admin/schedule', body: { action: 'cancel-schedule', submissionId: 'sub-1', sourceId: 'sub-1', isExtension: false } });
    expect(directWrites()).toHaveLength(0);
  });

  it('pintu nol baris → galat yang menjelaskan, bukan sukses palsu', async () => {
    reply = { status: 200, body: { data: { id: null } } };
    await expect(cancelSchedule({ ...entry, sourceId: 'sub-1', isExtension: false })).rejects.toThrow(/Order ini/);
  });
});

describe('cancelOrder (sql/128 — satu pembatalan pesanan peneliti)', () => {
  it('lewat pintu `cancel-order`; nol tulisan langsung ke tabel jadwal & riwayat', async () => {
    tableRows = { ad_schedules: [{ id: 'sch-1', source_table: 'form_submissions', status: 'waiting_payment' }] };
    await cancelOrder('sub-1');
    expect(posts).toEqual([{ url: '/api/schedules/lock', body: { action: 'cancel-order', submissionId: 'sub-1' } }]);
    expect(directWrites()).toHaveLength(0);
  });

  it('DOKU dulu: tagihan pending jadwal order dicari SEBELUM pintu dipanggil', async () => {
    tableRows = { ad_schedules: [{ id: 'sch-1', source_table: 'form_submissions', status: 'waiting_payment' }] };
    await cancelOrder('sub-1');
    const inv = calls.find((c) => c.table === 'invoices');
    expect(inv?.ops).toContainEqual(['eq', 'schedule_id', 'sch-1']);
  });

  it('pintu nol baris → galat, bukan sukses diam', async () => {
    reply = { status: 200, body: { data: { id: null } } };
    await expect(cancelOrder('sub-1')).rejects.toThrow(/tidak bisa dibatalkan/);
  });

  it('perpanjangan masih hidup → ditolak SEBELUM link DOKU mana pun dimatikan', async () => {
    tableRows = { ad_schedules: [
      { id: 'sch-1', source_table: 'form_submissions', status: 'scheduled' },
      { id: 'sch-2', source_table: 'form_submissions_extend', status: 'waiting_payment' },
    ] };
    await expect(cancelOrder('sub-1')).rejects.toThrow(/jadwal lain/);
    expect(posts).toHaveLength(0);
    expect(calls.some((c) => c.table === 'invoices')).toBe(false);
  });
});
