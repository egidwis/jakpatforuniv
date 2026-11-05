import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequest } from './webinar.js';
import { postgrestTable } from '../_fixtures/postgrestTable.js';

// Memanggil handler sungguhan; fetch dirute ke emulator PostgREST (bukan mock
// "balas baris untuk apa pun"), DOKU, dan /auth/v1/user.

const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  DOKU_CLIENT_ID: 'client',
  DOKU_SECRET_KEY: 'secret',
  ADMIN_EMAILS: 'admin@example.test',
};
const ADMIN = { id: '11111111-1111-4111-8111-111111111111', email: 'Admin@Example.test' };
const STRANGER = { id: '44444444-4444-4444-8444-444444444444', email: 'budi@example.test' };

const DRAFT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PUB_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CANCELLED_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const DAY = 86_400_000;
const at = (ms) => new Date(Date.now() + ms).toISOString();
const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Isi' }] }] };

const READY = {
  summary: 'Ringkas', poster_url: 'https://cdn.test/p.webp', description_blocks: doc,
  speakers: [{ name: 'Dr. Sari', title: 'Dosen' }], starts_at: at(10 * DAY), duration_minutes: 90,
  price: 50000, quota: 100,
};

let clock = 0;
const stamp = () => new Date(Date.UTC(2026, 10, 5, 0, 0, 0) + (clock += 1000)).toISOString();

function eventRow(over) {
  return {
    title: 'Acara', slug: 'acara', summary: null, poster_url: null, description_blocks: null, speakers: [],
    starts_at: null, duration_minutes: null, sales_open_at: null, sales_close_at: null, price: null, quota: null,
    status: 'draft', offer_kind: 'live', sales_mode: 'coming_soon', is_listed: true, is_test: false,
    meeting_url: null, preview_token: 'f'.repeat(32), published_at: null, created_at: stamp(), updated_at: stamp(),
    ...over,
  };
}

let events;
let orders;
let offers;
let calls;
let session;
let dokuReply;
let overrideEventsPatch;

function setup({ eventSeed, orderSeed = [] } = {}) {
  offers = {};
  events = postgrestTable(eventSeed ?? [
    eventRow({ id: DRAFT_ID, title: 'Olah Data', slug: 'olah-data' }),
    eventRow({
      id: PUB_ID, title: 'Statistik', slug: 'statistik', status: 'published', sales_mode: 'open',
      published_at: '2026-11-01T00:00:00.000Z', meeting_url: 'https://zoom.us/j/999', ...READY,
    }),
    eventRow({ id: CANCELLED_ID, title: 'Batal', slug: 'batal', status: 'cancelled', published_at: '2026-10-01T00:00:00.000Z' }),
  ], {
    computed: {
      webinar_offer_state: (row) => offers[row.id]
        ?? { state: row.status === 'draft' ? 'draft' : row.status === 'cancelled' ? 'cancelled' : 'on_sale', sold: 0, held: 0, seats_left: row.quota },
    },
    unique: ['slug'],
    defaults: () => ({
      id: crypto.randomUUID(), status: 'draft', offer_kind: 'live', sales_mode: 'coming_soon', speakers: [],
      is_listed: true, is_test: false, meeting_url: null, preview_token: 'e'.repeat(32), published_at: null,
      created_at: stamp(), updated_at: stamp(),
    }),
    restrictDelete: (row) => orders.rows.some((o) => o.event_id === row.id),
    onUpdate: (row) => { row.updated_at = stamp(); },
  });
  orders = postgrestTable(orderSeed);
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  session = ADMIN;
  dokuReply = () => json({ ok: true });
  overrideEventsPatch = null;
  calls = [];
  setup();
  vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    if (url.endsWith('/auth/v1/user')) return session ? json(session) : json({}, 401);
    if (url.includes('/checkout/v3/cancellations')) return dokuReply(JSON.parse(init.body));
    if (url.includes('/rest/v1/webinar_events')) {
      if (method === 'PATCH' && overrideEventsPatch) return overrideEventsPatch();
      return events.respond(url, init);
    }
    if (url.includes('/rest/v1/webinar_orders')) return orders.respond(url, init);
    throw new Error(`fetch tak terduga: ${method} ${url}`);
  }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function call(body, { method = 'POST', token = 'tok' } = {}) {
  const res = await onRequest({
    env: ENV,
    request: new Request('https://submit.test/api/admin/webinar', {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const restCalls = () => calls.filter((c) => c.url.includes('/rest/v1/'));
const eventPatches = () => calls.filter((c) => c.method === 'PATCH' && c.url.includes('/rest/v1/webinar_events'));
const rowOf = (id) => events.rows.find((r) => r.id === id);

describe('gerbang admin', () => {
  it('bukan admin → 401 tanpa satu pun panggilan REST', async () => {
    session = STRANGER;
    const r = await call({ action: 'list' });
    expect(r.status).toBe(401);
    expect(restCalls()).toHaveLength(0);
  });

  it('tanpa sesi → 401', async () => {
    const r = await call({ action: 'list' }, { token: null });
    expect(r.status).toBe(401);
    expect(restCalls()).toHaveLength(0);
  });

  it('GET → 405; body tak sah → 400 tanpa REST', async () => {
    expect((await call(null, { method: 'GET' })).status).toBe(405);
    const r = await call({ action: 'save', id: DRAFT_ID, patch: { status: 'published' } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/status/);
    expect(restCalls()).toHaveLength(0);
  });
});

describe('list & get', () => {
  it('daftar tidak memuat link Zoom dan deskripsi, tapi menandai Zoom kosong dan membawa badge pengunjung', async () => {
    const r = await call({ action: 'list' });
    expect(r.status).toBe(200);
    const pub = r.body.events.find((e) => e.id === PUB_ID);
    expect(JSON.stringify(r.body)).not.toContain('zoom.us');
    expect(pub.description_blocks).toBeUndefined();
    expect(pub.has_meeting_url).toBe(true);
    expect(pub.view.badge).toBe('Dijual');
    expect(r.body.events.find((e) => e.id === DRAFT_ID).has_meeting_url).toBe(false);
  });

  it('get memuat baris lengkap termasuk link Zoom dan token pratinjau', async () => {
    const r = await call({ action: 'get', id: PUB_ID });
    expect(r.body.event.meeting_url).toBe('https://zoom.us/j/999');
    expect(r.body.event.preview_token).toHaveLength(32);
    expect(r.body.event.webinar_offer_state.state).toBe('on_sale');
  });

  it('acara tak ada → 404', async () => {
    const r = await call({ action: 'get', id: '99999999-9999-4999-8999-999999999999' });
    expect(r.status).toBe(404);
  });
});

describe('create', () => {
  it('draft baru dengan slug dari judul; bentrok mendapat akhiran', async () => {
    const r = await call({ action: 'create', patch: { title: '  Olah Data  ' } });
    expect(r.status).toBe(200);
    expect(r.body.event).toMatchObject({ title: 'Olah Data', slug: 'olah-data-2', status: 'draft', sales_mode: 'coming_soon' });
  });

  it('judul gabung tidak pernah mendapat slug gabung', async () => {
    const r = await call({ action: 'create', patch: { title: 'Gabung' } });
    expect(r.body.event.slug).toBe('gabung-2');
  });

  it('judul wajib', async () => {
    const r = await call({ action: 'create', patch: { summary: 'x' } });
    expect(r).toMatchObject({ status: 400, body: { field: 'title' } });
  });
});

describe('save', () => {
  it('draft: slug ikut judul, dan PATCH hanya memfilter id', async () => {
    const r = await call({ action: 'save', id: DRAFT_ID, patch: { title: 'Statistik' } });
    expect(r.status).toBe(200);
    expect(r.body.event.slug).toBe('statistik-2');
    for (const p of eventPatches()) {
      const params = [...new URL(p.url).searchParams.keys()].filter((k) => k !== 'select');
      expect(params).toEqual(['id']);
      expect(p.url).toContain(`id=eq.${p.url.match(/id=eq\.([0-9a-f-]+)/)[1]}`);
      expect(p.url).not.toMatch(/[?&](or|and)=/);
    }
  });

  it('terbit: slug terkunci walau judul berubah', async () => {
    const r = await call({ action: 'save', id: PUB_ID, patch: { title: 'Statistik Lanjut' } });
    expect(r.body.event).toMatchObject({ title: 'Statistik Lanjut', slug: 'statistik' });
  });

  it('expectedUpdatedAt berbeda → 409 stale tanpa menulis', async () => {
    const r = await call({ action: 'save', id: DRAFT_ID, expectedUpdatedAt: '2020-01-01T00:00:00Z', patch: { summary: 'x' } });
    expect(r).toMatchObject({ status: 409, body: { code: 'stale' } });
    expect(eventPatches()).toHaveLength(0);
  });

  it('expectedUpdatedAt sama → tersimpan dan versi baru dikembalikan', async () => {
    const before = rowOf(DRAFT_ID).updated_at;
    const r = await call({ action: 'save', id: DRAFT_ID, expectedUpdatedAt: before, patch: { summary: 'Baru' } });
    expect(r.status).toBe(200);
    expect(r.body.event.updated_at).not.toBe(before);
  });

  it('acara batal tidak bisa diubah', async () => {
    const r = await call({ action: 'save', id: CANCELLED_ID, patch: { summary: 'x' } });
    expect(r).toMatchObject({ status: 409, body: { code: 'cancelled' } });
  });

  it('acara terbit yang dijual: isian wajib tidak boleh dikosongkan', async () => {
    const r = await call({ action: 'save', id: PUB_ID, patch: { price: null, summary: '' } });
    expect(r).toMatchObject({ status: 400, body: { code: 'missing_fields', fields: ['summary', 'price'], field: 'summary' } });
  });

  it('kuota tidak boleh di bawah terjual + ditahan', async () => {
    offers[PUB_ID] = { state: 'on_sale', sold: 7, held: 1 };
    const r = await call({ action: 'save', id: PUB_ID, patch: { quota: 5 } });
    expect(r).toMatchObject({ status: 400, body: { field: 'quota' } });
    expect(r.body.error).toMatch(/minimal 8/);
  });

  it('jadwal berubah padahal sudah terjual → 409 confirm_schedule + sold; dengan konfirmasi tersimpan', async () => {
    offers[PUB_ID] = { state: 'on_sale', sold: 4, held: 0 };
    const newStart = at(12 * DAY);
    const first = await call({ action: 'save', id: PUB_ID, patch: { starts_at: newStart } });
    expect(first).toMatchObject({ status: 409, body: { code: 'confirm_schedule', sold: 4 } });
    const second = await call({ action: 'save', id: PUB_ID, patch: { starts_at: newStart }, confirmScheduleChange: true });
    expect(second.status).toBe(200);
    expect(Date.parse(second.body.event.starts_at)).toBe(Date.parse(newStart));
  });

  it('jadwal sama dalam format lain tidak dianggap berubah', async () => {
    offers[PUB_ID] = { state: 'on_sale', sold: 4, held: 0 };
    const same = rowOf(PUB_ID).starts_at.replace('Z', '+00:00');
    const r = await call({ action: 'save', id: PUB_ID, patch: { starts_at: same } });
    expect(r.status).toBe(200);
  });

  it('pindah dari Pada tanggal ke Belum ditentukan mengosongkan tanggal buka', async () => {
    rowOf(DRAFT_ID).sales_mode = 'open';
    rowOf(DRAFT_ID).sales_open_at = at(DAY);
    const r = await call({ action: 'save', id: DRAFT_ID, patch: { sales_mode: 'coming_soon' } });
    expect(r.body.event.sales_open_at).toBeNull();
    expect(eventPatches()[0].body).toEqual({ sales_mode: 'coming_soon', sales_open_at: null });
  });

  it('tanggal buka sesudah acara mulai ditolak di isian tanggal buka', async () => {
    const r = await call({ action: 'save', id: PUB_ID, patch: { sales_open_at: at(11 * DAY) } });
    expect(r).toMatchObject({ status: 400, body: { field: 'sales_open_at' } });
  });

  it('PATCH yang membalas [] → 500, bukan sukses palsu', async () => {
    overrideEventsPatch = () => json([]);
    const r = await call({ action: 'save', id: DRAFT_ID, patch: { summary: 'x' } });
    expect(r.status).toBe(500);
  });

  it('patch kosong tidak menulis apa pun', async () => {
    const r = await call({ action: 'save', id: DRAFT_ID, patch: {} });
    expect(r.status).toBe(200);
    expect(eventPatches()).toHaveLength(0);
  });
});

describe('publish', () => {
  it('isian kurang → 400 missing_fields berurutan menurut form', async () => {
    const r = await call({ action: 'publish', id: DRAFT_ID, patch: { sales_mode: 'open' } });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('missing_fields');
    expect(r.body.fields).toEqual(['summary', 'poster_url', 'description_blocks', 'speakers', 'starts_at', 'duration_minutes', 'price', 'quota']);
    expect(rowOf(DRAFT_ID).status).toBe('draft');
  });

  it('Belum ditentukan cukup judul, ringkasan, poster', async () => {
    const r = await call({ action: 'publish', id: DRAFT_ID, patch: { summary: 'S', poster_url: 'https://cdn.test/a.webp' } });
    expect(r.status).toBe(200);
    expect(r.body.event).toMatchObject({ status: 'published', sales_mode: 'coming_soon' });
    expect(r.body.event.published_at).toBeTruthy();
  });

  it('dijual sekarang: lengkap → terbit dengan published_at', async () => {
    const r = await call({ action: 'publish', id: DRAFT_ID, patch: { ...READY, sales_mode: 'open' } });
    expect(r.status).toBe(200);
    expect(r.body.event.status).toBe('published');
    expect(rowOf(DRAFT_ID).published_at).toBeTruthy();
  });

  it('pilihan Ditutup ditolak saat terbit', async () => {
    const r = await call({ action: 'publish', id: DRAFT_ID, patch: { ...READY, sales_mode: 'closed' } });
    expect(r).toMatchObject({ status: 400, body: { field: 'sales_open_at' } });
  });

  it('hanya dari draft', async () => {
    const r = await call({ action: 'publish', id: PUB_ID });
    expect(r).toMatchObject({ status: 409, body: { code: 'not_draft' } });
  });
});

describe('close-sales', () => {
  it('menulis closed dan mengosongkan tanggal buka', async () => {
    const r = await call({ action: 'close-sales', id: PUB_ID });
    expect(r.status).toBe(200);
    expect(eventPatches()[0].body).toEqual({ sales_mode: 'closed', sales_open_at: null });
    expect(rowOf(PUB_ID).sales_mode).toBe('closed');
  });

  it('draft ditolak', async () => {
    expect((await call({ action: 'close-sales', id: DRAFT_ID })).status).toBe(409);
  });
});

describe('cancel', () => {
  const pending = (over) => ({
    id: crypto.randomUUID(), event_id: PUB_ID, status: 'pending', invoice_number: 'WBN-AAAAAAAA-1',
    doku_request_id: 'req-1', payment_expires_at: at(20 * 60_000), ...over,
  });

  it('acara batal, link DOKU yang masih hidup dimatikan, order pending dibatalkan', async () => {
    setup({
      eventSeed: [eventRow({ id: PUB_ID, slug: 'statistik', status: 'published', sales_mode: 'open', ...READY })],
      orderSeed: [
        pending({ invoice_number: 'WBN-LIVE0001-1' }),
        pending({ invoice_number: 'WBN-EXPD0001-1', payment_expires_at: at(-60_000) }),
        { id: crypto.randomUUID(), event_id: PUB_ID, status: 'paid', invoice_number: 'WBN-PAID0001-1' },
      ],
    });
    const r = await call({ action: 'cancel', id: PUB_ID });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ pending_cancelled: 2, doku_cancelled: 1, doku_failed: [] });
    expect(rowOf(PUB_ID).status).toBe('cancelled');
    const dokuCalls = calls.filter((c) => c.url.includes('/cancellations'));
    expect(dokuCalls.map((c) => c.body.order.invoice_number)).toEqual(['WBN-LIVE0001-1']);
    expect(orders.rows.map((o) => o.status).sort()).toEqual(['cancelled', 'cancelled', 'paid']);
  });

  it('DOKU gagal dikumpulkan; memanggil ulang hanya membersihkan', async () => {
    setup({
      eventSeed: [eventRow({ id: PUB_ID, slug: 'statistik', status: 'published', sales_mode: 'open', ...READY })],
      orderSeed: [pending({ invoice_number: 'WBN-LIVE0002-1' })],
    });
    dokuReply = () => json({ error: 'down' }, 500);
    const first = await call({ action: 'cancel', id: PUB_ID });
    expect(first.body.doku_failed).toEqual([{ invoice: 'WBN-LIVE0002-1', reason: expect.stringContaining('HTTP 500') }]);

    calls = [];
    const again = await call({ action: 'cancel', id: PUB_ID });
    expect(again.status).toBe(200);
    expect(eventPatches()).toHaveLength(0);
    expect(again.body.pending_cancelled).toBe(0);
  });

  it('draft tidak dibatalkan (dihapus)', async () => {
    expect((await call({ action: 'cancel', id: DRAFT_ID })).body.code).toBe('draft');
  });
});

describe('delete', () => {
  it('draft tanpa order terhapus', async () => {
    const r = await call({ action: 'delete', id: DRAFT_ID });
    expect(r).toMatchObject({ status: 200, body: { deleted: DRAFT_ID } });
    expect(rowOf(DRAFT_ID)).toBeUndefined();
  });

  it('acara terbit tidak bisa dihapus', async () => {
    const r = await call({ action: 'delete', id: PUB_ID });
    expect(r).toMatchObject({ status: 409, body: { code: 'not_draft' } });
    expect(rowOf(PUB_ID)).toBeDefined();
  });

  it('draft yang punya order → 409', async () => {
    setup({
      eventSeed: [eventRow({ id: DRAFT_ID })],
      orderSeed: [{ id: crypto.randomUUID(), event_id: DRAFT_ID, status: 'expired' }],
    });
    const r = await call({ action: 'delete', id: DRAFT_ID });
    expect(r).toMatchObject({ status: 409, body: { code: 'has_orders' } });
  });
});
