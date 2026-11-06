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
  MAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 'resend-key',
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
let broadcasts;
let deliveries;
let rpcReply;
let dokuStatusReply;

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
  broadcasts = postgrestTable([]);
  deliveries = postgrestTable([]);
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  session = ADMIN;
  dokuReply = () => json({ ok: true });
  dokuStatusReply = () => json({ transaction: { status: 'PENDING' }, order: { amount: 50000 } });
  rpcReply = (name) => {
    if (name === 'webinar_enqueue_broadcast') return json({ outcome: 'queued', broadcast_id: 'b-1', total: 4 });
    if (name === 'webinar_claim_deliveries') return json({ token: 't', rows: [] });
    if (name === 'webinar_mark_refunded') return json({ outcome: 'ok', refunded_at: '2026-11-06T03:00:00Z' });
    if (name === 'webinar_retry_broadcast') return json(2);
    return json({});
  };
  overrideEventsPatch = null;
  calls = [];
  setup();
  vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
    const url = String(input);
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    if (url.endsWith('/auth/v1/user')) return session ? json(session) : json({}, 401);
    if (url.includes('/checkout/v3/cancellations')) return dokuReply(JSON.parse(init.body));
    if (url.includes('/orders/v1/status/')) return dokuStatusReply(url);
    if (url.includes('/rest/v1/rpc/')) return rpcReply(url.split('/rpc/')[1], init.body ? JSON.parse(init.body) : null);
    if (url.includes('/auth/v1/admin/users/')) return json({ email: 'akun@example.test' });
    if (url.includes('api.resend.com')) return json({ id: 'mail-1' });
    if (url.includes('/rest/v1/webinar_broadcast_deliveries')) return deliveries.respond(url, init);
    if (url.includes('/rest/v1/webinar_broadcasts')) return broadcasts.respond(url, init);
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

async function call(body, { method = 'POST', token = 'tok', host = 'https://submit.test', env = ENV } = {}) {
  const pending = [];
  const res = await onRequest({
    env,
    waitUntil: (p) => pending.push(p),
    request: new Request(`${host}/api/admin/webinar`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    }),
  });
  await Promise.all(pending);
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

// ── Fase 3: peserta, refund, email otomatis ─────────────────────────────────

const ORDER_PAID = '55555555-5555-4555-8555-555555555555';
const ORDER_PENDING = '66666666-6666-4666-8666-666666666666';
const ORDER_REPLAY = '77777777-7777-4777-8777-777777777777';
const LOCAL = { host: 'http://localhost:8788', env: { ...ENV, WEBINAR_LOCAL_OPEN: 'true' } };
const rpcCalls = (name) => calls.filter((c) => c.url.endsWith(`/rpc/${name}`)).map((c) => c.body);
const mails = () => calls.filter((c) => c.url.includes('api.resend.com')).map((c) => c.body);

function orderRow(over) {
  return {
    id: crypto.randomUUID(), event_id: PUB_ID, kind: 'live', status: 'paid', auth_user_id: ADMIN.id,
    buyer_name: 'Putra', buyer_email: 'putra@example.test', buyer_phone: '0812', buyer_university: 'UIU',
    buyer_major: 'Teknik', buyer_status: 'Mahasiswa', buyer_referral: null, marketing_consent: true,
    consent_at: '2026-11-05T05:40:00Z', invoice_number: 'WBN-E1642A9A-1793856539227', amount: 49000,
    subtotal: 44144, ppn_amount: 4856, discount_amount: 0, voucher_code: null, paid_at: '2026-11-05T05:47:00Z',
    paid_via: 'webhook', payment_channel: 'QRIS', payment_url: 'https://doku.test/pay', doku_request_id: 'req-9',
    payment_expires_at: '2026-11-05T06:17:00Z', hold_until: null, created_at: '2026-11-05T05:45:00Z',
    ticket_code: '7F3A91B2C4', join_token: 'a'.repeat(64), alarm_outcome: null,
    ticket_email_sent_at: '2026-11-05T05:48:00Z', ticket_email_error: null, ticket_email_claimed_at: null,
    refunded_at: null, refunded_by: null, refund_note: null, last_status_check_at: null,
    ...over,
  };
}

function seedOps() {
  setup({
    orderSeed: [
      orderRow({ id: ORDER_PAID }),
      orderRow({ id: ORDER_PENDING, status: 'pending', invoice_number: 'WBN-BBBBBBBB-1793856539227', paid_at: null, ticket_code: null, join_token: null, ticket_email_sent_at: null, created_at: at(-10 * 60_000), payment_expires_at: at(20 * 60_000) }),
      orderRow({ id: ORDER_REPLAY, kind: 'replay', invoice_number: 'WBN-CCCCCCCC-1793856539227' }),
    ],
  });
}

describe('participants', () => {
  it('order live acara ini; link gabung hanya untuk lunas; tanpa link bayar, request DOKU, atau token mentah', async () => {
    seedOps();
    broadcasts.rows.push({ id: 'b-1', event_id: PUB_ID, kind: 'reminder_day', event_starts_at: READY.starts_at, recipient_total: 1, skipped_reason: null, created_by: null, created_at: '2026-11-16T01:30:00Z' });
    deliveries.rows.push({ broadcast_id: 'b-1', order_id: ORDER_PAID, status: 'sent', attempts: 1, sent_at: '2026-11-16T01:31:00Z', error: null, claimed_at: null, retry_after: null });
    const r = await call({ action: 'participants', id: PUB_ID });
    expect(r.status).toBe(200);
    expect(r.body.orders.map((o) => o.id).sort()).toEqual([ORDER_PAID, ORDER_PENDING].sort());
    const paid = r.body.orders.find((o) => o.id === ORDER_PAID);
    expect(paid.join_url).toBe(`https://submit.jakpatforuniv.com/webinar/gabung/${'a'.repeat(64)}`);
    expect(r.body.orders.find((o) => o.id === ORDER_PENDING).join_url).toBeNull();
    const text = JSON.stringify(r.body);
    expect(text).not.toContain('doku.test/pay');
    expect(text).not.toContain('req-9');
    expect(text).not.toContain('zoom.us');
    expect(paid.join_token).toBeUndefined();
    expect(r.body.event.has_meeting_url).toBe(true);
    expect(r.body.broadcasts).toEqual([expect.objectContaining({ id: 'b-1', kind: 'reminder_day', counts: { queued: 0, sending: 0, sent: 1, failed: 0, skipped: 0 } })]);
    expect(r.body.deliveries).toEqual([expect.objectContaining({ broadcast_id: 'b-1', order_id: ORDER_PAID, status: 'sent' })]);
  });

  it('acara tak ada → 404', async () => {
    const r = await call({ action: 'participants', id: '99999999-9999-4999-8999-999999999999' });
    expect(r.status).toBe(404);
  });

  it('boleh dibuka dari uji lokal (baca saja)', async () => {
    seedOps();
    expect((await call({ action: 'participants', id: PUB_ID }, LOCAL)).status).toBe(200);
  });
});

describe('buyers (Fase 4: pembeli webinar di Customers)', () => {
  const OTHER = '88888888-8888-4888-8888-888888888888';
  function seedBuyers() {
    setup({
      orderSeed: [
        orderRow({ id: ORDER_PAID }),
        orderRow({ id: OTHER, status: 'refunded', auth_user_id: STRANGER.id, event_id: CANCELLED_ID, invoice_number: 'WBN-DDDDDDDD-1793856539227', refunded_at: '2026-11-07T03:02:00Z', refund_note: 'Bentrok' }),
        orderRow({ id: ORDER_PENDING, status: 'pending', paid_at: null }),
        orderRow({ id: ORDER_REPLAY, kind: 'replay', status: 'expired' }),
        orderRow({ id: crypto.randomUUID(), auth_user_id: null }),
      ],
    });
    rowOf(CANCELLED_ID).is_test = true;
  }

  it('bukan admin → 401 tanpa satu pun panggilan REST', async () => {
    seedBuyers();
    session = STRANGER;
    expect((await call({ action: 'buyers' })).status).toBe(401);
    expect(restCalls()).toHaveLength(0);
  });

  it('hanya tiket lunas/refund yang punya akun, dengan judul & jadwal acara', async () => {
    seedBuyers();
    const r = await call({ action: 'buyers' });
    expect(r.status).toBe(200);
    expect(r.body.tickets).toHaveLength(2);
    const byOrder = Object.fromEntries(r.body.tickets.map((t) => [t.order_id, t]));
    expect(byOrder[ORDER_PAID]).toEqual({
      order_id: ORDER_PAID, auth_user_id: ADMIN.id, kind: 'live', status: 'paid', amount: 49000,
      paid_at: '2026-11-05T05:47:00Z', invoice_number: 'WBN-E1642A9A-1793856539227',
      event_title: 'Statistik', event_starts_at: READY.starts_at, is_test: false,
    });
    expect(byOrder[OTHER]).toMatchObject({ status: 'refunded', auth_user_id: STRANGER.id, event_title: 'Batal', is_test: true });
  });

  it('tanpa data pribadi pembeli, token, link bayar, atau link Zoom', async () => {
    seedBuyers();
    const text = JSON.stringify((await call({ action: 'buyers' })).body);
    for (const leak of ['putra@example.test', '0812', 'Putra', 'a'.repeat(64), 'doku.test/pay', 'req-9', 'zoom.us', 'Bentrok']) {
      expect(text).not.toContain(leak);
    }
  });

  it('dibaca per halaman 1000 dengan urutan stabil, dan boleh dari uji lokal', async () => {
    seedBuyers();
    expect((await call({ action: 'buyers' }, LOCAL)).status).toBe(200);
    const read = calls.find((c) => c.url.includes('/rest/v1/webinar_orders'));
    expect(read.url).toContain('limit=1000&offset=0');
    expect(read.url).toMatch(/order=paid_at\.desc[^&]*,id\.asc/);
    expect(read.method).toBe('GET');
  });
});

describe('participant', () => {
  it('satu order + email akun pemiliknya', async () => {
    seedOps();
    const r = await call({ action: 'participant', orderId: ORDER_PAID });
    expect(r.status).toBe(200);
    expect(r.body.order).toMatchObject({ id: ORDER_PAID, buyer_email: 'putra@example.test' });
    expect(r.body.account_email).toBe('akun@example.test');
    expect(JSON.stringify(r.body)).not.toContain('doku.test/pay');
  });
  it('order tak ada → 404', async () => {
    seedOps();
    expect((await call({ action: 'participant', orderId: '99999999-9999-4999-8999-999999999999' })).status).toBe(404);
  });
});

describe('resend-ticket', () => {
  it('lunas: e-tiket dikirim lagi ke email e-tiket', async () => {
    seedOps();
    const r = await call({ action: 'resend-ticket', orderId: ORDER_PAID });
    expect(r).toMatchObject({ status: 200, body: { sent: true, email: 'putra@example.test' } });
    expect(mails().map((m) => m.to)).toEqual([['putra@example.test']]);
    expect(mails()[0].subject).toMatch(/^E-tiket/);
  });

  it('email baru: PATCH hanya ber-filter id, lalu terkirim ke alamat baru', async () => {
    seedOps();
    const r = await call({ action: 'resend-ticket', orderId: ORDER_PAID, email: '  Baru@Example.TEST ' });
    expect(r.body).toMatchObject({ sent: true, email: 'baru@example.test' });
    const patch = calls.find((c) => c.method === 'PATCH' && c.body?.buyer_email);
    expect(patch.url).toMatch(/webinar_orders\?id=eq\.[0-9a-f-]+&select=/);
    expect(patch.url).not.toContain('or=');
    expect(orders.rows.find((o) => o.id === ORDER_PAID).buyer_email).toBe('baru@example.test');
    expect(mails()[0].to).toEqual(['baru@example.test']);
  });

  it.each([
    ['email rusak', { email: 'bukan-email' }],
    ['tanpa orderId', { orderId: undefined }],
  ])('%s → 400 tanpa REST', async (_n, over) => {
    seedOps();
    const r = await call({ action: 'resend-ticket', orderId: ORDER_PAID, ...over });
    expect(r.status).toBe(400);
    expect(restCalls()).toHaveLength(0);
  });

  it('order belum lunas → 409, tanpa email', async () => {
    seedOps();
    const r = await call({ action: 'resend-ticket', orderId: ORDER_PENDING });
    expect(r).toMatchObject({ status: 409, body: { code: 'not_paid' } });
    expect(mails()).toHaveLength(0);
  });

  it('acara batal → 409, tanpa email', async () => {
    seedOps();
    rowOf(PUB_ID).status = 'cancelled';
    const r = await call({ action: 'resend-ticket', orderId: ORDER_PAID });
    expect(r).toMatchObject({ status: 409, body: { code: 'event_cancelled' } });
    expect(mails()).toHaveLength(0);
  });

  it('sedang dikirim pihak lain → 409 busy', async () => {
    seedOps();
    orders.rows.find((o) => o.id === ORDER_PAID).ticket_email_claimed_at = new Date().toISOString();
    const r = await call({ action: 'resend-ticket', orderId: ORDER_PAID });
    expect(r).toMatchObject({ status: 409, body: { code: 'busy' } });
  });
});

describe('check-order', () => {
  it('pending > 60 detik: tanya DOKU dengan invoice-nya, belum dibayar', async () => {
    seedOps();
    const r = await call({ action: 'check-order', orderId: ORDER_PENDING });
    expect(r).toMatchObject({ status: 200, body: { checked: true, reason: 'unpaid', dokuStatus: 'PENDING' } });
    const doku = calls.filter((c) => c.url.includes('/orders/v1/status/'));
    expect(doku.map((c) => c.url)).toEqual([expect.stringContaining('WBN-BBBBBBBB-1793856539227')]);
    const claim = calls.find((c) => c.method === 'PATCH' && c.body?.last_status_check_at);
    expect(claim.url).toContain('status=in.(pending,expired,cancelled)');
  });

  it('baru dicek < 1 menit → tanpa DOKU', async () => {
    seedOps();
    orders.rows.find((o) => o.id === ORDER_PENDING).last_status_check_at = new Date().toISOString();
    const r = await call({ action: 'check-order', orderId: ORDER_PENDING });
    expect(r.body).toMatchObject({ checked: false, reason: 'recently_checked' });
    expect(calls.some((c) => c.url.includes('/orders/v1/status/'))).toBe(false);
  });

  it('order lunas → 409', async () => {
    seedOps();
    expect((await call({ action: 'check-order', orderId: ORDER_PAID })).body.code).toBe('already_paid');
  });
});

describe('refund', () => {
  it('RPC dengan catatan dan email admin dari sesi', async () => {
    seedOps();
    const r = await call({ action: 'refund', orderId: ORDER_PAID, note: '  Bentrok jadwal kuliah ' });
    expect(r).toMatchObject({ status: 200, body: { outcome: 'ok' } });
    expect(rpcCalls('webinar_mark_refunded')).toEqual([{ p_order_id: ORDER_PAID, p_note: 'Bentrok jadwal kuliah', p_admin_email: 'admin@example.test' }]);
  });

  it('catatan kurang dari 3 karakter → 400 tanpa REST', async () => {
    const r = await call({ action: 'refund', orderId: ORDER_PAID, note: ' a ' });
    expect(r.status).toBe(400);
    expect(restCalls()).toHaveLength(0);
  });

  it('belum lunas → 409', async () => {
    rpcReply = () => json({ outcome: 'not_paid', status: 'pending' });
    const r = await call({ action: 'refund', orderId: ORDER_PENDING, note: 'catatan' });
    expect(r).toMatchObject({ status: 409, body: { code: 'not_paid' } });
  });
});

describe('email-retry', () => {
  it('antre ulang yang gagal lalu langsung mengirim batch', async () => {
    const id = '88888888-8888-4888-8888-888888888888';
    const r = await call({ action: 'email-retry', broadcastId: id });
    expect(r).toMatchObject({ status: 200, body: { requeued: 2 } });
    expect(rpcCalls('webinar_retry_broadcast')).toEqual([{ p_broadcast_id: id }]);
    expect(rpcCalls('webinar_claim_deliveries')).toHaveLength(1);
  });
});

describe('email otomatis ikut aksi admin', () => {
  it('jadwal berubah + sudah terjual: antrekan schedule_change sesudah tersimpan, lalu kirim', async () => {
    offers[PUB_ID] = { state: 'on_sale', sold: 4, held: 0 };
    const r = await call({ action: 'save', id: PUB_ID, patch: { starts_at: at(12 * DAY) }, confirmScheduleChange: true });
    expect(r.status).toBe(200);
    expect(r.body.notified).toBe(4);
    expect(rpcCalls('webinar_enqueue_broadcast')).toEqual([{ p_event_id: PUB_ID, p_kind: 'schedule_change', p_created_by: 'admin@example.test' }]);
    expect(rpcCalls('webinar_claim_deliveries')).toHaveLength(1);
    const enqueueAt = calls.findIndex((c) => c.url.endsWith('/rpc/webinar_enqueue_broadcast'));
    const patchAt = calls.findIndex((c) => c.method === 'PATCH' && c.url.includes('/webinar_events'));
    expect(patchAt).toBeGreaterThan(-1);
    expect(enqueueAt).toBeGreaterThan(patchAt);
  });

  it('bukan perubahan jadwal → tanpa email', async () => {
    offers[PUB_ID] = { state: 'on_sale', sold: 4, held: 0 };
    await call({ action: 'save', id: PUB_ID, patch: { summary: 'Baru' } });
    expect(rpcCalls('webinar_enqueue_broadcast')).toHaveLength(0);
  });

  it('jadwal berubah tanpa tiket terjual → tanpa email', async () => {
    await call({ action: 'save', id: PUB_ID, patch: { starts_at: at(12 * DAY) } });
    expect(rpcCalls('webinar_enqueue_broadcast')).toHaveLength(0);
  });

  it('antrean gagal tidak menggagalkan simpan', async () => {
    offers[PUB_ID] = { state: 'on_sale', sold: 4, held: 0 };
    rpcReply = (name) => (name === 'webinar_enqueue_broadcast' ? json({ message: 'down' }, 500) : json({ token: 't', rows: [] }));
    const r = await call({ action: 'save', id: PUB_ID, patch: { starts_at: at(12 * DAY) }, confirmScheduleChange: true });
    expect(r.status).toBe(200);
    expect(r.body.notify_error).toBe(true);
    expect(Date.parse(rowOf(PUB_ID).starts_at)).toBe(Date.parse(r.body.event.starts_at));
  });

  it('batalkan acara yang sudah terjual: antrekan pembatalan sekali', async () => {
    offers[PUB_ID] = { state: 'on_sale', sold: 3, held: 0 };
    const r = await call({ action: 'cancel', id: PUB_ID });
    expect(r.status).toBe(200);
    expect(rpcCalls('webinar_enqueue_broadcast')).toEqual([{ p_event_id: PUB_ID, p_kind: 'cancellation', p_created_by: 'admin@example.test' }]);
    expect(r.body.notified).toBe(4);
    calls = [];
    await call({ action: 'cancel', id: PUB_ID });
    expect(rpcCalls('webinar_enqueue_broadcast')).toHaveLength(0);
  });

  it('batalkan acara tanpa tiket terjual → tanpa email', async () => {
    await call({ action: 'cancel', id: PUB_ID });
    expect(rpcCalls('webinar_enqueue_broadcast')).toHaveLength(0);
  });
});

describe('uji lokal (database produksi)', () => {
  it.each([
    ['refund', { action: 'refund', orderId: ORDER_PAID, note: 'catatan' }],
    ['resend-ticket', { action: 'resend-ticket', orderId: ORDER_PAID }],
    ['check-order', { action: 'check-order', orderId: ORDER_PENDING }],
    ['email-retry', { action: 'email-retry', broadcastId: '88888888-8888-4888-8888-888888888888' }],
  ])('%s → 403 local_test tanpa tulisan', async (_n, body) => {
    seedOps();
    const r = await call(body, LOCAL);
    expect(r).toMatchObject({ status: 403, body: { code: 'local_test' } });
    expect(calls.filter((c) => c.method !== 'GET' && c.url.includes('/rest/v1/'))).toHaveLength(0);
    expect(mails()).toHaveLength(0);
  });

  it('ubah jadwal acara yang sudah terjual → 403, acara tidak berubah', async () => {
    offers[PUB_ID] = { state: 'on_sale', sold: 4, held: 0 };
    const before = rowOf(PUB_ID).starts_at;
    const r = await call({ action: 'save', id: PUB_ID, patch: { starts_at: at(12 * DAY) }, confirmScheduleChange: true }, LOCAL);
    expect(r).toMatchObject({ status: 403, body: { code: 'local_test' } });
    expect(rowOf(PUB_ID).starts_at).toBe(before);
  });

  it('batalkan acara yang sudah terjual → 403', async () => {
    offers[PUB_ID] = { state: 'on_sale', sold: 4, held: 0 };
    const r = await call({ action: 'cancel', id: PUB_ID }, LOCAL);
    expect(r).toMatchObject({ status: 403, body: { code: 'local_test' } });
    expect(rowOf(PUB_ID).status).toBe('published');
  });

  it('ubah isi lain tetap boleh dari lokal', async () => {
    offers[PUB_ID] = { state: 'on_sale', sold: 4, held: 0 };
    expect((await call({ action: 'save', id: PUB_ID, patch: { summary: 'Baru' } }, LOCAL)).status).toBe(200);
  });
});
