import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest as watchHandler } from './watch.js';
import { onRequest as materialHandler, materialFileName } from './material.js';
import { onRequest as myHandler, buildOrderView } from './my.js';
import { onRequest as eventsHandler } from './events.js';
import { recordingAccess, watermarkText } from './_recordingAccess.js';
import { PUBLIC_EVENT_COLUMNS } from './_view.js';

/*
  Fase 5A: rekaman hanya untuk pemilik tiket. Masa uji asli (_access.js) dipakai:
  akun uji = tegar@jakpat.net, yang memang ada di daftar izin.
*/

const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'AKID',
  R2_SECRET_ACCESS_KEY: 'SECRET',
  R2_RECORDINGS_BUCKET: 'rek',
};
const OWNER = { id: '11111111-1111-4111-8111-111111111111', email: 'Tegar@Jakpat.net' };
const OTHER = { id: '99999999-9999-4999-8999-999999999999', email: 'tegar@jakpat.net' };
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '8ea66d4e-429f-4e98-a716-4bbc92b6ee39';
const KEY = `rekaman/${EVENT_ID}/olah-data-a1b2c3d4.mp4`;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const eventRow = (over = {}) => ({
  id: EVENT_ID, slug: 'olah-data', title: 'Olah Data', summary: 'Ringkas', poster_url: 'https://cdn.test/p.webp',
  speakers: [{ name: 'Dr. Sari', title: 'Dosen' }], starts_at: '2026-11-17T01:30:00Z', duration_minutes: 90,
  price: 49000, status: 'published', offer_kind: 'live', sales_mode: 'closed', is_listed: true, is_test: false,
  recording_minutes: 88, recording_published_at: '2026-11-18T02:30:00Z', recording_object_key: KEY,
  materials_path: `${EVENT_ID}/materi-spss-1a2b.pdf`, meeting_url: 'https://zoom.us/j/1',
  ...over,
});
const orderRow = (over = {}) => ({
  id: ORDER_ID, kind: 'live', status: 'paid', ticket_code: '7f3a91b2c4', auth_user_id: OWNER.id,
  amount: 49000, invoice_number: 'WBN-1', buyer_email: 'b@t.test', join_token: 'f'.repeat(64),
  payment_url: null, payment_expires_at: null, ticket_email_sent_at: '2026-11-05T00:00:00Z',
  webinar_events: eventRow(),
  ...over,
});

let calls;
function net({ user = OWNER, order = orderRow(), sign = () => json({ signedURL: `/object/sign/webinar-materials/${EVENT_ID}/materi-spss-1a2b.pdf?token=abc` }) } = {}) {
  calls = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: (init.method || 'GET').toUpperCase(), body: init.body });
    if (u.endsWith('/auth/v1/user')) return user ? json(user) : json({}, 401);
    if (u.includes('/rest/v1/webinar_orders')) {
      // Pemilik dicek lewat auth_user_id di filter, seperti PostgREST.
      const owner = new URL(u).searchParams.get('auth_user_id');
      return json(order && owner === `eq.${order.auth_user_id}` ? [order] : []);
    }
    if (u.includes('/storage/v1/object/sign/')) return sign();
    if (u.includes('/rest/v1/webinar_events')) return json([]);
    return json([]);
  });
}

const req = (path, body, method = 'POST', host = 'https://submit.jakpatforuniv.com') => new Request(`${host}/api/webinar/${path}`, {
  method,
  headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const watch = async (body = { orderId: ORDER_ID }, env = ENV) => {
  const res = await watchHandler({ request: req('watch', body), env });
  return { status: res.status, body: await res.json() };
};
const material = async (body = { orderId: ORDER_ID }) => {
  const res = await materialHandler({ request: req('material', body), env: ENV });
  return { status: res.status, body: await res.json() };
};

afterEach(() => vi.restoreAllMocks());

describe('POST /api/webinar/watch', () => {
  it('pemilik: URL R2 3 jam + watermark dari email SESI (bukan body), tanpa kunci mentah lain', async () => {
    net();
    const r = await watch({ orderId: ORDER_ID, email: 'palsu@x.test' });
    expect(r.status).toBe(200);
    const u = new URL(r.body.video_url);
    expect(u.host).toBe('acct.r2.cloudflarestorage.com');
    expect(u.pathname).toBe(`/rek/${KEY}`);
    expect(u.searchParams.get('X-Amz-Expires')).toBe('10800');
    expect(Date.parse(r.body.expires_at) - Date.now()).toBeGreaterThan(3 * 3600 * 1000 - 5000);
    expect(r.body.watermark).toBe('tegar@jakpat.net · 7F3A');
    expect(r.body).toMatchObject({ minutes: 88, has_materials: true });
    expect(r.body.event.title).toBe('Olah Data');
    const text = JSON.stringify({ ...r.body, video_url: '' });
    expect(text).not.toContain('rekaman/');
    expect(text).not.toContain('zoom.us');
    expect(text).not.toContain('materi-spss');
  });

  it('order dicari dengan auth_user_id sesi', async () => {
    net();
    await watch();
    const q = calls.find((c) => c.url.includes('/webinar_orders')).url;
    expect(q).toContain(`id=eq.${ORDER_ID}`);
    expect(q).toContain(`auth_user_id=eq.${OWNER.id}`);
  });

  it('akun lain → 404 "untuk pemilik tiket", tanpa slug/URL', async () => {
    net({ user: OTHER });
    const r = await watch();
    expect(r).toMatchObject({ status: 404, body: { code: 'not_owner', slug: null } });
    expect(JSON.stringify(r.body)).not.toContain('r2.cloudflarestorage.com');
  });

  it('refund → 403 inactive (tanpa kata refund); pending → 404', async () => {
    net({ order: orderRow({ status: 'refunded' }) });
    const r = await watch();
    expect(r).toMatchObject({ status: 403, body: { code: 'inactive' } });
    expect(r.body.error).not.toMatch(/refund/i);
    net({ order: orderRow({ status: 'pending' }) });
    expect((await watch()).status).toBe(404);
  });

  it('Video kelas yang di-refund: pesan akses video, bukan tiket (Fase 5B)', async () => {
    net({ order: orderRow({ status: 'refunded', kind: 'replay' }) });
    const r = await watch();
    expect(r).toMatchObject({
      status: 403, body: { code: 'inactive', kind: 'replay', error: 'Akses video ini tidak aktif. Hubungi admin bila ada pertanyaan.' },
    });
  });

  it('rekaman belum terbit → 409 not_ready; acara batal → 409 cancelled', async () => {
    net({ order: orderRow({ webinar_events: eventRow({ recording_published_at: null }) }) });
    expect((await watch()).body.code).toBe('not_ready');
    net({ order: orderRow({ webinar_events: eventRow({ recording_object_key: null, recording_published_at: null }) }) });
    expect((await watch()).body.code).toBe('not_ready');
    net({ order: orderRow({ webinar_events: eventRow({ status: 'cancelled' }) }) });
    expect((await watch()).body.code).toBe('cancelled');
  });

  it('tanpa sesi 401; masa uji: akun di luar daftar → 403; orderId tak sah 400', async () => {
    net({ user: null });
    expect((await watch()).status).toBe(401);
    net({ user: { ...OWNER, email: 'budi@example.test' } });
    expect((await watch()).body.code).toBe('not_open');
    net();
    expect((await watch({ orderId: 'x' })).status).toBe(400);
    expect((await watchHandler({ request: req('watch', null, 'GET'), env: ENV })).status).toBe(405);
  });

  it('secret R2 kosong → 503', async () => {
    net();
    const r = await watch(undefined, { ...ENV, R2_SECRET_ACCESS_KEY: '' });
    expect(r).toMatchObject({ status: 503, body: { code: 'storage_unconfigured' } });
  });
});

describe('POST /api/webinar/material', () => {
  it('signed URL Supabase 10 menit dengan nama unduhan', async () => {
    net();
    const r = await material();
    expect(r.status).toBe(200);
    expect(r.body.url).toBe(`https://db.example.test/storage/v1/object/sign/webinar-materials/${EVENT_ID}/materi-spss-1a2b.pdf?token=abc&download=materi-olah-data.pdf`);
    const sign = calls.find((c) => c.url.includes('/storage/v1/object/sign/'));
    expect(sign.method).toBe('POST');
    expect(JSON.parse(sign.body)).toEqual({ expiresIn: 600 });
  });

  it('syarat sama dengan rekaman: akun lain 404, refund 403, belum terbit 409; materi kosong 404', async () => {
    net({ user: OTHER });
    expect((await material()).status).toBe(404);
    net({ order: orderRow({ status: 'refunded' }) });
    expect((await material()).status).toBe(403);
    net({ order: orderRow({ webinar_events: eventRow({ recording_published_at: null }) }) });
    expect((await material()).status).toBe(409);
    net({ order: orderRow({ webinar_events: eventRow({ materials_path: null }) }) });
    expect((await material()).body.code).toBe('no_material');
    expect(calls.some((c) => c.url.includes('/storage/'))).toBe(false);
  });

  it('nama berkas dari slug + ekstensi asli', () => {
    expect(materialFileName('olah-data', 'x/slide.PPTX')).toBe('materi-olah-data.pptx');
    expect(materialFileName(null, 'x/a')).toBe('materi-webinar.pdf');
  });
});

describe('kartu tiket (my.js) & kebocoran URL', () => {
  it('rekaman terbit: available + watch_path; tanpa URL R2, kunci, atau path materi', async () => {
    net();
    const res = await myHandler({ request: req('my', null, 'GET'), env: ENV, waitUntil: () => {} });
    const body = await res.json();
    const o = body.orders[0];
    expect(o.recording).toEqual({ available: true, minutes: 88, has_materials: true });
    expect(o.watch_path).toBe(`/dashboard/webinar/tonton/${ORDER_ID}`);
    const text = JSON.stringify(body);
    for (const leak of ['r2.cloudflarestorage.com', 'rekaman/', 'materi-spss', 'X-Amz-']) expect(text).not.toContain(leak);
  });

  it('belum terbit, refund, atau acara batal → tidak tersedia', () => {
    const view = (over) => buildOrderView(orderRow(over));
    expect(view({ webinar_events: eventRow({ recording_published_at: null }) }).recording.available).toBe(false);
    expect(view({ status: 'refunded' })).toMatchObject({ recording: { available: false, has_materials: false }, watch_path: null });
    expect(view({ webinar_events: eventRow({ status: 'cancelled' }) }).watch_path).toBeNull();
  });

  it('events.js (daftar publik) bebas URL/kunci R2', async () => {
    expect(PUBLIC_EVENT_COLUMNS).not.toMatch(/recording_object_key|materials_path|youtube_video_id/);
    global.fetch = vi.fn(async (url) => {
      if (String(url).endsWith('/auth/v1/user')) return json(OWNER);
      if (String(url).includes('/rest/v1/webinar_events')) return json([{ ...eventRow(), webinar_offer_state: { state: 'closed' } }]);
      return json([]);
    });
    const res = await eventsHandler({ request: req('events', null, 'GET'), env: ENV });
    const text = await res.text();
    for (const leak of ['r2.cloudflarestorage.com', 'rekaman/', 'materi-spss']) expect(text).not.toContain(leak);
    const q = global.fetch.mock.calls.map(([u]) => String(u)).find((u) => u.includes('/webinar_events'));
    expect(q).not.toContain('recording_object_key');
    expect(q).not.toContain('materials_path');
  });
});

describe('aturan murni', () => {
  it('recordingAccess & watermark', () => {
    expect(recordingAccess(null).code).toBe('not_owner');
    expect(recordingAccess(orderRow()).ok).toBe(true);
    expect(watermarkText('a@b.c', 'ab12cd')).toBe('a@b.c · AB12');
    expect(watermarkText('a@b.c', null)).toBe('a@b.c');
  });
});
