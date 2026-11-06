import { describe, it, expect, vi, afterEach } from 'vitest';

// Tes lama menguji perilaku sesudah rilis (masa uji mati). Blok "masa uji"
// menyalakannya. Logika webinarOpenFor yang asli diuji di _access.spec.js.
const access = vi.hoisted(() => ({ preview: false }));
vi.mock('./_access.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    get WEBINAR_PREVIEW_ONLY() { return access.preview; },
    WEBINAR_PREVIEW_EMAILS: real.WEBINAR_PREVIEW_EMAILS,
    webinarPreviewOnly: () => access.preview,
    webinarLocalOpen: real.webinarLocalOpen,
    webinarOpenFor: (email) => !access.preview
      || real.WEBINAR_PREVIEW_EMAILS.includes(String(email || '').trim().toLowerCase()),
  };
});
import { buildEventView, buildListing, PUBLIC_EVENT_COLUMNS } from './_view.js';
import { onRequest as eventsHandler } from './events.js';
import { onRequest as eventHandler } from './event.js';
import { onRequest as voucherHandler } from './voucher.js';
import { onRequest as checkoutHandler } from './checkout.js';
import { onRequest as myHandler, orderDisplayStatus } from './my.js';
import { onRequest as syncHandler } from './sync.js';
import { onRequest as pageHandler } from '../../webinar/[[path]].js';
import { renderBlocks } from '../../webinar/_render-blocks.js';
import { postgrestTable } from '../_fixtures/postgrestTable.js';

const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  DOKU_CLIENT_ID: 'client',
  DOKU_SECRET_KEY: 'secret',
  MAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 'k',
  ADMIN_EMAILS: 'admin@example.test',
};
const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'Budi@Example.test' };
const ORDER_ID = '22222222-2222-4222-8222-222222222222';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const future = (ms) => new Date(Date.now() + ms).toISOString();
const DAY = 86_400_000;

const event = (over = {}, state = 'on_sale', offer = {}) => ({
  id: 'e1', slug: 'olah-data', title: 'Olah Data', summary: 'Ringkas', description_blocks: null,
  speakers: [{ name: 'Dr. Sari', title: 'Dosen' }], poster_url: 'https://cdn.test/p.webp',
  starts_at: future(5 * DAY), duration_minutes: 90, price: 50000, status: 'published', offer_kind: 'live',
  sales_mode: 'open', is_listed: true, is_test: false,
  webinar_offer_state: { state, seats_left: 100, ...offer },
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe('_view', () => {
  it('kolom publik tidak pernah memuat link Zoom atau token pratinjau', () => {
    expect(PUBLIC_EVENT_COLUMNS).not.toMatch(/meeting_url|preview_token/);
  });

  it('sisa kursi hanya tampil saat ≤ 20 dan sedang dijual', () => {
    expect(buildEventView(event({}, 'on_sale', { seats_left: 21 })).seats_label).toBeNull();
    expect(buildEventView(event({}, 'on_sale', { seats_left: 20 })).seats_label).toBe('Sisa 20 kursi');
    expect(buildEventView(event({}, 'seats_held', { seats_left: 0 })).seats_label).toBeNull();
  });

  it('yang didapat mengikuti jenis halaman', () => {
    expect(buildEventView(event()).benefits).toEqual(['Sesi live via Zoom', 'Materi PPT', 'Rekaman video webinar']);
    expect(buildEventView(event({ offer_kind: 'replay' })).benefits).toEqual(['Rekaman video webinar', 'Materi PPT']);
  });

  it('Video kelas (Fase 5B): tanpa jadwal live; label rekaman dan jenis', () => {
    const converted = buildEventView(event({ offer_kind: 'replay', starts_at: '2026-11-17T01:30:00Z', recording_minutes: 88 }));
    expect(converted.schedule_label).toBeNull();
    expect(converted.recorded_label).toBe('Direkam Sel, 17 Nov 2026');
    expect(converted.kind_label).toBe('Video kelas · 88 menit');
    const standalone = buildEventView(event({ offer_kind: 'replay', starts_at: null, duration_minutes: null, recording_minutes: null }));
    expect(standalone.recorded_label).toBeNull();
    expect(standalone.kind_label).toBe('Video kelas');
    // Tiket live tidak berubah.
    expect(buildEventView(event())).toMatchObject({ recorded_label: null, kind_label: null });
    expect(buildEventView(event()).schedule_label).toMatch(/WIB$/);
  });

  it('tidak ada kalimat yang menyebut pengembalian dana', () => {
    for (const state of ['on_sale', 'coming_soon', 'seats_held', 'sold_out', 'closed', 'sales_ended', 'cancelled']) {
      const text = JSON.stringify(buildEventView(event({}, state)));
      expect(text.toLowerCase()).not.toMatch(/refund|pengembalian dana|uang kembali/);
    }
  });

  it('hero: dijual terdekat lebih dulu, lalu habis, segera hadir, video', () => {
    const video = event({ slug: 'v', offer_kind: 'replay', recording_published_at: future(-DAY) });
    const soon = event({ slug: 's', starts_at: future(DAY) }, 'coming_soon');
    const out = event({ slug: 'o', starts_at: future(2 * DAY) }, 'sold_out');
    const late = event({ slug: 'l', starts_at: future(9 * DAY) });
    const near = event({ slug: 'n', starts_at: future(3 * DAY) });

    const all = buildListing([video, soon, out, late, near]);
    expect(all.hero.slug).toBe('n');
    expect(all.upcoming.map((v) => v.slug)).toEqual(['l', 'o', 's']);
    expect(all.videos.map((v) => v.slug)).toEqual(['v']);
    expect(all.homepage.map((v) => v.slug)).toEqual(['n', 'l']);

    expect(buildListing([video, soon, out]).hero.slug).toBe('o');
    expect(buildListing([video, soon]).hero.slug).toBe('s');
    expect(buildListing([video]).hero.slug).toBe('v');
    expect(buildListing([]).hero).toBeNull();
  });

  it('baris beranda hanya saat ada yang bisa dibeli', () => {
    expect(buildListing([event({}, 'coming_soon')]).dashboard_row).toBeNull();
    expect(buildListing([event({}, 'sold_out')]).dashboard_row).toBeNull();
    expect(buildListing([event({ is_listed: false })]).dashboard_row).toBeNull();
    expect(buildListing([event()]).dashboard_row.slug).toBe('olah-data');
  });

  it('acara ditutup dan batal tidak masuk daftar', () => {
    const listing = buildListing([event({}, 'closed'), event({}, 'sales_ended'), event({ status: 'cancelled' }, 'cancelled')]);
    expect(listing.hero).toBeNull();
  });
});

describe('renderBlocks', () => {
  const doc = (content) => ({ type: 'doc', content });

  it('meng-escape teks dan menolak link berbahaya', () => {
    const html = renderBlocks(doc([{
      type: 'paragraph',
      content: [
        { type: 'text', text: '<script>alert(1)</script>' },
        { type: 'text', text: 'klik', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
        { type: 'text', text: 'aman', marks: [{ type: 'link', attrs: { href: 'https://a.test' } }, { type: 'bold' }] },
      ],
    }]));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('https://a.test');
    expect(html).toContain('<strong>');
  });

  it('gambar hanya https; node asing tetap menampilkan teksnya', () => {
    const html = renderBlocks(doc([
      { type: 'image', attrs: { src: 'data:image/png;base64,AAAA' } },
      { type: 'image', attrs: { src: 'http://a.test/x.png' } },
      { type: 'image', attrs: { src: 'https://a.test/x.png', alt: '"><b>' } },
      { type: 'codeBlock', content: [{ type: 'text', text: 'kode' }] },
      { type: 'nodeAsing', content: [{ type: 'text', text: 'isi' }] },
    ]));
    expect(html).not.toContain('data:image');
    expect(html).not.toContain('http://a.test');
    expect(html).toContain('https://a.test/x.png');
    expect(html).not.toContain('"><b>');
    expect(html).toContain('kode');
    expect(html).toContain('isi');
  });

  it('heading mulai dari h2, karena judul acara sudah h1', () => {
    expect(renderBlocks(doc([{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'a' }] }]))).toBe('<h2>a</h2>');
  });
});

describe('halaman publik', () => {
  const SECRET_ZOOM = 'https://zoom.us/j/rahasia';

  function net(rows = [event()], { joinOrder, joinEvent } = {}) {
    const calls = [];
    global.fetch = vi.fn(async (url) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('/webinar_orders')) return json(joinOrder ? [joinOrder] : []);
      if (u.includes('/webinar_events') && u.includes('meeting_url')) return json(joinEvent ? [joinEvent] : []);
      if (u.includes('/webinar_events')) return json(rows);
      return json([]);
    });
    return calls;
  }

  const open = (path, search = '') => pageHandler({
    request: new Request(`https://submit.jakpatforuniv.com/webinar${path ? `/${path}` : ''}${search}`),
    env: ENV,
    params: { path: path ? path.split('/') : undefined },
  });

  it('daftar menampilkan hero dan keadaan kosong', async () => {
    net();
    let html = await (await open('')).text();
    expect(html).toContain('Olah Data');
    expect(html).toContain('/dashboard/webinar/beli/olah-data');
    net([]);
    html = await (await open('')).text();
    expect(html).toContain('Webinar berikutnya sedang disiapkan');
  });

  it('detail: OG, tombol beli, dan bebas link Zoom walau barisnya memuatnya', async () => {
    const calls = net([{ ...event(), meeting_url: SECRET_ZOOM, preview_token: 'tok-rahasia' }]);
    const res = await open('olah-data');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(html).toContain('og:title');
    expect(html).toContain('rel="canonical" href="https://jakpatforuniv.com/webinar/olah-data"');
    expect(html).not.toContain(SECRET_ZOOM);
    expect(html).not.toContain('tok-rahasia');
    expect(html.toLowerCase()).not.toMatch(/refund|pengembalian dana/);
    expect(calls[0]).not.toContain('meeting_url');
  });

  it('Video kelas (Fase 5B): fakta rekaman tanpa jam live; catatan pemegang tiket hanya untuk hasil ubah jenis', async () => {
    net([event({ offer_kind: 'replay', starts_at: '2026-11-17T01:30:00Z', recording_minutes: 88, recording_published_at: future(-DAY) })]);
    let html = await (await open('olah-data')).text();
    expect(html).toContain('Video kelas · ▶ 88 menit');
    expect(html).toContain('Direkam Sel, 17 Nov 2026');
    expect(html).toContain('Tonton kapan saja di menu Webinar');
    expect(html).toContain('Beli rekaman');
    expect(html).toContain('Sudah punya tiket acara ini?');
    expect(html).not.toContain('08.30');
    expect(html).not.toContain('Online via Zoom');
    expect(html).not.toContain('Tidak bisa hadir?');
    expect(html).not.toContain('r2.cloudflarestorage.com');

    net([event({ offer_kind: 'replay', starts_at: null, duration_minutes: null, recording_minutes: 45 })]);
    html = await (await open('olah-data')).text();
    expect(html).toContain('Video kelas · ▶ 45 menit');
    expect(html).not.toContain('Direkam');
    expect(html).not.toContain('Sudah punya tiket acara ini?');
  });

  it('segera hadir: tanpa tombol beli, ada hitung mundur dari sisa detik server', async () => {
    net([event({}, 'coming_soon', { opens_at: future(DAY), seconds_until_open: 86400 })]);
    const html = await (await open('olah-data')).text();
    expect(html).not.toContain('/dashboard/webinar/beli/');
    expect(html).toContain('data-count');
    expect(html).toContain('left=86400');
  });

  it.each([['sold_out', 'Kursi live habis'], ['closed', 'Penjualan ditutup'], ['cancelled', 'Acara dibatalkan']])('%s: tanpa tombol beli', async (state, text) => {
    net([event({}, state)]);
    const html = await (await open('olah-data')).text();
    expect(html).toContain(text);
    expect(html).not.toContain('/dashboard/webinar/beli/');
  });

  it('draft 404 tanpa token; pratinjau noindex dan tombol beli mati', async () => {
    net([event({ status: 'draft' }, 'draft')]);
    expect((await open('olah-data')).status).toBe(404);
    const token = 'a'.repeat(32);
    const calls = net([event()]);
    const html = await (await open('olah-data', `?pratinjau=${token}`)).text();
    expect(calls[0]).toContain(`preview_token=eq.${token}`);
    expect(html).toContain('noindex');
    expect(html).toContain('Pratinjau');
    expect(html).not.toContain('/dashboard/webinar/beli/');
  });

  it('slug berisi filter PostgREST tidak pernah sampai database', async () => {
    const calls = net();
    expect((await open('a&select=meeting_url')).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('judul berbahaya di-escape', async () => {
    net([event({ title: '<img src=x onerror=alert(1)>' })]);
    const html = await (await open('olah-data')).text();
    expect(html).not.toContain('<img src=x');
  });

  describe('gabung', () => {
    const token = 'f'.repeat(64);
    const liveEvent = (over = {}) => ({ title: 'Olah', status: 'published', starts_at: future(DAY), duration_minutes: 60, meeting_url: SECRET_ZOOM, ...over });

    const paidOrder = { id: ORDER_ID, status: 'paid', kind: 'live', event_id: 'e1' };
    const TICKET_PAGE = `https://submit.jakpatforuniv.com/dashboard/webinar/tiket/${ORDER_ID}`;

    it('jauh sebelum acara: ke halaman tiket di dashboard, tanpa link Zoom, no-referrer', async () => {
      net([], { joinOrder: paidOrder, joinEvent: liveEvent() });
      const res = await open(`gabung/${token}`);
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe(TICKET_PAGE);
      expect(await res.text()).not.toContain(SECRET_ZOOM);
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    });

    it('30 menit sebelum sampai selesai: 302 ke Zoom tanpa login', async () => {
      net([], { joinOrder: paidOrder, joinEvent: liveEvent({ starts_at: future(20 * 60_000) }) });
      let res = await open(`gabung/${token}`);
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe(SECRET_ZOOM);
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      net([], { joinOrder: paidOrder, joinEvent: liveEvent({ starts_at: future(-30 * 60_000) }) });
      res = await open(`gabung/${token}`);
      expect(res.headers.get('Location')).toBe(SECRET_ZOOM);
    });

    it.each([
      ['link Zoom belum diisi', { joinEvent: liveEvent({ starts_at: future(60_000), meeting_url: null }) }],
      ['sesudah acara', { joinEvent: liveEvent({ starts_at: future(-2 * DAY) }) }],
      ['acara batal', { joinEvent: liveEvent({ status: 'cancelled', starts_at: future(60_000) }) }],
      ['tiket refunded', { joinOrder: { ...paidOrder, status: 'refunded' } }],
      ['rekaman', { joinOrder: { ...paidOrder, kind: 'replay' } }],
    ])('%s: ke halaman tiket, tanpa link Zoom', async (_label, over) => {
      net([], { joinOrder: paidOrder, joinEvent: liveEvent(), ...over });
      const res = await open(`gabung/${token}`);
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe(TICKET_PAGE);
    });

    it('token salah format tidak sampai database', async () => {
      const calls = net();
      expect((await open('gabung/abc')).status).toBe(404);
      expect(calls).toHaveLength(0);
    });
  });
});

describe('events', () => {
  it('membalas daftar tanpa cache dan terbuka untuk homepage', async () => {
    global.fetch = vi.fn(async () => json([event()]));
    const res = await eventsHandler({ request: new Request('https://x.test/api/webinar/events'), env: ENV });
    const body = await res.json();
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(body.hero.slug).toBe('olah-data');
    expect(JSON.stringify(body)).not.toContain('meeting_url');
  });
});

function authedNet(routes) {
  const calls = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, method, body, prefer: new Headers(init.headers || {}).get('Prefer') });
    if (u.endsWith('/auth/v1/user')) return routes.user === null ? json({}, 401) : json(routes.user ?? USER);
    for (const [frag, handler] of Object.entries(routes)) {
      if (frag !== 'user' && u.includes(frag)) return handler({ url: u, method, body, init });
    }
    return json([]);
  });
  return calls;
}

const authed = (path, body, method = 'POST') => new Request(`https://submit.jakpatforuniv.com/api/webinar/${path}`, {
  method,
  headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

const PROFILE = { full_name: 'Budi', phone_number: '0812-3', university: 'UGM', department: 'Psikologi', status: 'S1', referral_source: null };

describe('checkout', () => {
  const created = { result: 'created', order_id: ORDER_ID, invoice_number: 'WBN-ABCDEF12-1', amount: 50000, item_name: 'Olah Data' };
  const call = (body = { slug: 'olah-data', termsAccepted: true }) => checkoutHandler({ request: authed('checkout', body), env: ENV });
  const doku = (ok = true) => () => (ok ? json({ response: { payment: { url: 'https://pay.test/1' } } }) : json({ error: 'x' }, 400));

  it('tanpa sesi: 401, nol tulisan', async () => {
    const calls = authedNet({ user: null });
    expect((await call()).status).toBe(401);
    expect(calls.some((c) => c.url.includes('/rpc/'))).toBe(false);
  });

  it('uji lokal: bayar ditolak sebelum kursi ditahan atau DOKU dipanggil', async () => {
    const calls = authedNet({ '/profiles': () => json([PROFILE]) });
    const request = new Request('http://localhost:8788/api/webinar/checkout', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'olah-data', termsAccepted: true }),
    });
    const res = await checkoutHandler({ request, env: { ...ENV, WEBINAR_LOCAL_OPEN: 'true' } });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('local_test');
    expect(calls.some((c) => c.url.includes('/rest/v1/') || c.url.includes('/checkout/v1/'))).toBe(false);
  });

  it('tanpa S&K dan slug aneh: 400 sebelum database', async () => {
    const calls = authedNet({});
    expect((await call({ slug: 'olah-data' })).status).toBe(400);
    expect((await call({ slug: 'a&b', termsAccepted: true })).status).toBe(400);
    expect(calls.some((c) => c.url.includes('/rest/v1/'))).toBe(false);
  });

  it('profil belum lengkap: 409, tanpa kursi', async () => {
    const calls = authedNet({ '/profiles': () => json([{ ...PROFILE, university: ' ' }]) });
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('profile_incomplete');
    expect(calls.some((c) => c.url.includes('/rpc/'))).toBe(false);
  });

  it('voucher sah: diteruskan ke RPC sebagai persen dari katalog, bukan dari body', async () => {
    const calls = authedNet({
      '/profiles': () => json([PROFILE]),
      '/rpc/webinar_reserve_seat': () => json({ ...created, amount: 40000 }),
      '/checkout/v1/payment': doku(),
      '/webinar_orders': () => json([{ id: ORDER_ID }]),
    });
    const res = await call({ slug: 'olah-data', termsAccepted: true, voucherCode: ' tegarganteng ', percent: 99, amount: 1 });
    expect(res.status).toBe(200);
    const rpc = calls.find((c) => c.url.endsWith('/rpc/webinar_reserve_seat')).body;
    expect(rpc.p_voucher).toEqual({ code: 'TEGARGANTENG', percent: 20 });
    const dokuBody = calls.find((c) => c.url.includes('/checkout/v1/payment')).body;
    expect(dokuBody.order.amount).toBe(40000);
    expect(dokuBody.order.line_items[0].price).toBe(40000);
  });

  it('tanpa voucher: RPC tidak menerima p_voucher', async () => {
    const calls = authedNet({
      '/profiles': () => json([PROFILE]),
      '/rpc/webinar_reserve_seat': () => json(created),
      '/checkout/v1/payment': doku(),
      '/webinar_orders': () => json([{ id: ORDER_ID }]),
    });
    await call({ slug: 'olah-data', termsAccepted: true, voucherCode: '  ' });
    expect('p_voucher' in calls.find((c) => c.url.endsWith('/rpc/webinar_reserve_seat')).body).toBe(false);
  });

  it.each([
    ['JFUFEB', 'tidak bisa digunakan pada produk ini'],
    ['ASAL123', 'tidak dikenal'],
    ['JAKPATUNIV2025', 'sudah habis'],
  ])('voucher %s ditolak 400 sebelum database', async (code, text) => {
    const calls = authedNet({});
    const res = await call({ slug: 'olah-data', termsAccepted: true, voucherCode: code });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('voucher_invalid');
    expect(body.error).toContain(text);
    expect(calls.some((c) => c.url.includes('/rest/v1/'))).toBe(false);
  });

  it('kontak khusus: e-tiket ke email itu, pemilik tetap akun login, kampus dari profil', async () => {
    const calls = authedNet({
      '/profiles': () => json([PROFILE]),
      '/rpc/webinar_reserve_seat': () => json(created),
      '/checkout/v1/payment': doku(),
      '/webinar_orders': () => json([{ id: ORDER_ID }]),
    });
    const res = await call({
      slug: 'olah-data', termsAccepted: true,
      contact: { name: ' Sinta ', email: ' Sinta@Kampus.AC.id ', phone: '+62 812-3456-7890' },
    });
    expect(res.status).toBe(200);
    const rpc = calls.find((c) => c.url.endsWith('/rpc/webinar_reserve_seat')).body;
    expect(rpc.p_auth_user_id).toBe(USER.id);
    expect(rpc.p_buyer_email).toBe('sinta@kampus.ac.id');
    expect(rpc.p_buyer).toMatchObject({ name: 'Sinta', phone: '+62 812-3456-7890', university: 'UGM', major: 'Psikologi' });
    const dokuBody = calls.find((c) => c.url.includes('/checkout/v1/payment')).body;
    expect(dokuBody.customer.email).toBe('sinta@kampus.ac.id');
  });

  it.each([
    ['nama kosong', { name: ' ', email: 'a@b.co', phone: '08123456789' }],
    ['email salah', { name: 'A', email: 'bukan-email', phone: '08123456789' }],
    ['telepon pendek', { name: 'A', email: 'a@b.co', phone: '0812' }],
    ['telepon berhuruf', { name: 'A', email: 'a@b.co', phone: '0812abc45678' }],
    ['bukan objek', 'a@b.co'],
  ])('kontak khusus tidak sah (%s): 400 sebelum database', async (_label, contact) => {
    const calls = authedNet({});
    const res = await call({ slug: 'olah-data', termsAccepted: true, contact });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('contact_invalid');
    expect(calls.some((c) => c.url.includes('/rest/v1/'))).toBe(false);
  });

  it('identitas dan biodata dari server; body tidak bisa memalsukan', async () => {
    const calls = authedNet({
      '/profiles': () => json([PROFILE]),
      '/rpc/webinar_reserve_seat': () => json(created),
      '/checkout/v1/payment': doku(),
      '/webinar_orders': () => json([{ id: ORDER_ID }]),
    });
    const res = await call({
      slug: 'olah-data', termsAccepted: true, marketingConsent: true,
      email: 'palsu@x.test', auth_user_id: 'palsu', amount: 1, price: 1, buyer: { name: 'Palsu' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: 'created', orderId: ORDER_ID, paymentUrl: 'https://pay.test/1' });
    const rpc = calls.find((c) => c.url.endsWith('/rpc/webinar_reserve_seat')).body;
    expect(rpc.p_auth_user_id).toBe(USER.id);
    expect(rpc.p_buyer_email).toBe('budi@example.test');
    expect(rpc.p_buyer.name).toBe('Budi');
    expect(rpc.p_marketing_consent).toBe(true);
    expect(rpc.p_consent_version).toBeTruthy();
    const dokuBody = calls.find((c) => c.url.includes('/checkout/v1/payment')).body;
    expect(dokuBody.order.amount).toBe(50000);
    expect(dokuBody.order.callback_url).toBe(`https://submit.jakpatforuniv.com/dashboard/webinar/tiket/${ORDER_ID}`);
    expect(dokuBody.payment).toEqual({ payment_due_date: 30, payment_method_types: ['QRIS'] });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch.url).toContain('status=eq.pending');
    expect(patch.body.payment_url).toBe('https://pay.test/1');
  });

  it.each([
    [{ result: 'already_owned', order_id: ORDER_ID }, 200],
    [{ result: 'reused', order_id: ORDER_ID, payment_url: 'https://pay.test/2' }, 200],
    [{ result: 'preparing', order_id: ORDER_ID }, 409],
    [{ result: 'rejected', state: 'sold_out' }, 409],
    [{ result: 'not_found' }, 404],
  ])('%j: tanpa link DOKU baru', async (seat, status) => {
    const calls = authedNet({ '/profiles': () => json([PROFILE]), '/rpc/webinar_reserve_seat': () => json(seat) });
    expect((await call()).status).toBe(status);
    expect(calls.some((c) => c.url.includes('/checkout/v1/payment'))).toBe(false);
  });

  it('DOKU menolak: kursi dilepas, 502', async () => {
    const calls = authedNet({
      '/profiles': () => json([PROFILE]),
      '/rpc/webinar_reserve_seat': () => json(created),
      '/checkout/v1/payment': doku(false),
      '/webinar_orders': () => json([{ id: ORDER_ID }]),
    });
    expect((await call()).status).toBe(502);
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch.body).toEqual({ status: 'cancelled' });
    expect(patch.url).toContain('status=eq.pending');
  });

  it('DOKU menolak bentuk lengkap (4xx): dicoba sekali dengan bentuk dasar iklan, lalu berhasil', async () => {
    let n = 0;
    const calls = authedNet({
      '/profiles': () => json([PROFILE]),
      '/rpc/webinar_reserve_seat': () => json({ ...created, item_name: '[UJI] Olah Data' }),
      '/checkout/v1/payment': () => (++n === 1
        ? json({ error: { message: 'line_items.name invalid' } }, 400)
        : json({ response: { payment: { url: 'https://pay.test/2' } } })),
      '/webinar_orders': () => json([{ id: ORDER_ID }]),
    });
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentUrl).toBe('https://pay.test/2');
    expect(body.dokuFallback).toEqual({ status: 400, message: 'line_items.name invalid' });
    const [full, basic] = calls.filter((c) => c.url.includes('/checkout/v1/payment')).map((c) => c.body);
    expect(full.order.line_items[0].name).toBe('UJI Olah Data');
    expect(full.payment.payment_method_types).toEqual(['QRIS']);
    expect(basic.order.line_items).toBeUndefined();
    expect(basic.payment).toEqual({ payment_due_date: 30 });
    expect(basic.order.invoice_number).toBe(full.order.invoice_number);
    expect(calls.some((c) => c.method === 'PATCH' && c.body?.status === 'cancelled')).toBe(false);
  });

  it('DOKU 5xx: tidak dicoba ulang; alasan DOKU ikut di respons 502', async () => {
    const calls = authedNet({
      '/profiles': () => json([PROFILE]),
      '/rpc/webinar_reserve_seat': () => json(created),
      '/checkout/v1/payment': () => json({ message: 'down' }, 503),
      '/webinar_orders': () => json([{ id: ORDER_ID }]),
    });
    const res = await call();
    expect(res.status).toBe(502);
    expect((await res.json()).doku).toEqual({ first: null, last: { status: 503, message: 'down' } });
    expect(calls.filter((c) => c.url.includes('/checkout/v1/payment'))).toHaveLength(1);
  });

  it('link tidak tersimpan (0 baris): dianggap gagal', async () => {
    authedNet({
      '/profiles': () => json([PROFILE]),
      '/rpc/webinar_reserve_seat': () => json(created),
      '/checkout/v1/payment': doku(),
      '/webinar_orders': () => json([]),
    });
    expect((await call()).status).toBe(500);
  });
});

describe('my', () => {
  const order = (over = {}) => ({
    id: ORDER_ID, kind: 'live', status: 'paid', amount: 50000, invoice_number: 'WBN-1', ticket_code: 'KODE', buyer_email: 'b@t.test',
    join_token: 'f'.repeat(64), payment_url: 'https://pay.test/1', payment_expires_at: future(60_000), ticket_email_sent_at: future(-1000),
    webinar_events: event(),
    ...over,
  });
  const call = async () => {
    const pendingWork = [];
    const res = await myHandler({ request: authed('my', null, 'GET'), env: ENV, waitUntil: (p) => pendingWork.push(p) });
    await Promise.all(pendingWork);
    return res;
  };

  it('hanya memfilter auth_user_id, tanpa cadangan email', async () => {
    const calls = authedNet({ '/webinar_orders': () => json([order()]) });
    await call();
    const q = calls.find((c) => c.url.includes('/webinar_orders')).url;
    expect(q).toContain(`auth_user_id=eq.${USER.id}`);
    expect(q).not.toContain('buyer_email=');
  });

  it('bebas link Zoom; link gabung hanya untuk paid; link bayar hanya pending hidup', async () => {
    authedNet({ '/webinar_orders': () => json([order({ webinar_events: { ...event(), meeting_url: 'https://zoom.us/j/x' } })]) });
    const paid = await (await call()).json();
    expect(JSON.stringify(paid)).not.toContain('zoom.us');
    expect(paid.orders[0].join_url).toContain('/webinar/gabung/');
    expect(paid.orders[0].payment_url).toBeNull();

    authedNet({ '/webinar_orders': () => json([order({ status: 'pending' })]) });
    const pending = await (await call()).json();
    expect(pending.orders[0].join_url).toBeNull();
    expect(pending.orders[0].payment_url).toBe('https://pay.test/1');

    authedNet({ '/webinar_orders': () => json([order({ status: 'pending', payment_expires_at: future(-1000) })]) });
    const dead = await (await call()).json();
    expect(dead.orders[0].status).toBe('expired');
    expect(dead.orders[0].payment_url).toBeNull();
  });

  it('e-tiket yang belum terkirim dicoba lagi lewat klaim bertoken, kecuali acara batal', async () => {
    // Daftar order memakai embed acara; klaim (PATCH) dan baca-baliknya dijawab seperti PostgREST.
    const unsent = (over = {}) => ({
      '/webinar_orders': ({ url, method }) => {
        if (method === 'PATCH') return new Response(null, { status: 204 });
        if (url.includes('webinar_events(')) return json([order({ ticket_email_sent_at: null, ...over })]);
        return json([]);
      },
    });
    let calls = authedNet(unsent());
    await call();
    const claim = calls.find((c) => c.method === 'PATCH' && c.url.includes('ticket_email_sent_at=is.null'));
    expect(claim.prefer).toBe('return=minimal');
    expect(calls.some((c) => c.method === 'GET' && c.url.includes('ticket_email_claimed_at=eq.'))).toBe(true);

    calls = authedNet(unsent({ webinar_events: { ...event(), status: 'cancelled' } }));
    await call();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('Video kelas (Fase 5B): tanpa link gabung; email pembelian yang tertunda dicoba lagi', async () => {
    const replay = (over = {}) => order({ kind: 'replay', webinar_events: event({ offer_kind: 'replay' }), ...over });
    authedNet({ '/webinar_orders': () => json([replay()]) });
    const [view] = (await (await call()).json()).orders;
    expect(view.join_url).toBeNull();
    expect(view.join).toBeNull();

    const calls = authedNet({
      '/webinar_orders': ({ url, method }) => {
        if (method === 'PATCH') return new Response(null, { status: 204 });
        if (url.includes('webinar_events(')) return json([replay({ ticket_email_sent_at: null })]);
        return json([]);
      },
    });
    await call();
    expect(calls.some((c) => c.method === 'PATCH' && c.url.includes('ticket_email_sent_at=is.null'))).toBe(true);
  });

  it('jendela gabung dari jam server, tanpa link Zoom di respons', async () => {
    authedNet({ '/webinar_orders': () => json([order({ webinar_events: { ...event(), starts_at: future(DAY), duration_minutes: 60, meeting_url: 'https://zoom.us/j/x' } })]) });
    const before = (await (await call()).json()).orders[0];
    expect(before.join.phase).toBe('before');
    expect(before.join.opens_in_seconds).toBeGreaterThan(DAY / 1000 - 30 * 60 - 5);
    expect(before.join.opens_in_seconds).toBeLessThanOrEqual(DAY / 1000 - 30 * 60);
    expect(before.join.opens_label).toMatch(/^\d{2}\.\d{2} WIB$/);
    expect(before.join.meeting_ready).toBe(true);
    expect(JSON.stringify(before)).not.toContain('zoom.us');

    authedNet({ '/webinar_orders': () => json([order({ webinar_events: { ...event(), starts_at: future(10 * 60_000), duration_minutes: 60, meeting_url: null } })]) });
    const open = (await (await call()).json()).orders[0];
    expect(open.join).toMatchObject({ phase: 'open', opens_in_seconds: 0, meeting_ready: false });

    authedNet({ '/webinar_orders': () => json([order({ status: 'pending' })]) });
    expect((await (await call()).json()).orders[0].join).toBeNull();
  });

  it('keadaan order', () => {
    expect(orderDisplayStatus({ status: 'cancelled' })).toBe('expired');
    expect(orderDisplayStatus({ status: 'refunded' })).toBe('refunded');
  });
});

describe('sync', () => {
  const pending = (over = {}) => ({
    id: ORDER_ID, auth_user_id: USER.id, invoice_number: 'WBN-1', status: 'pending',
    created_at: future(-120_000), last_status_check_at: null, ...over,
  });
  const call = async () => {
    const pendingWork = [];
    const res = await syncHandler({ request: authed('sync', { orderId: ORDER_ID }), env: ENV, waitUntil: (p) => pendingWork.push(p) });
    await Promise.all(pendingWork);
    return res;
  };

  const dokuPaid = () => json({ order: { amount: 50000 }, transaction: { status: 'SUCCESS' }, channel: { id: 'QRIS_DOKU' } });

  // webinar_orders dijawab emulator PostgREST: klaim ber-`or=` tidak bisa lagi lolos
  // hanya karena mock mengembalikan baris (insiden 5 Nov).
  function routes(rpc = { outcome: 'ok', send_ticket: false }, first = pending()) {
    const orders = postgrestTable([first]);
    return {
      '/rest/v1/webinar_orders': ({ url, init }) => orders.respond(url, init),
      '/orders/v1/status/': dokuPaid,
      '/rpc/webinar_mark_paid': () => {
        if (rpc.outcome === 'ok') orders.rows[0].status = 'paid';
        return json(rpc);
      },
    };
  }
  const askedDoku = (calls) => calls.some((c) => c.url.includes('/orders/v1/status'));

  it('hanya pemilik: filter auth_user_id, order orang lain 404', async () => {
    const calls = authedNet(routes(undefined, pending({ auth_user_id: '99999999-9999-4999-8999-999999999999' })));
    expect((await call()).status).toBe(404);
    expect(calls.find((c) => c.url.includes('/webinar_orders')).url).toContain(`auth_user_id=eq.${USER.id}`);
    expect(askedDoku(calls)).toBe(false);
  });

  it('kurang dari 60 detik: tidak bertanya ke DOKU', async () => {
    const calls = authedNet(routes(undefined, pending({ created_at: future(-5000) })));
    expect((await (await call()).json()).checked).toBe(false);
    expect(askedDoku(calls)).toBe(false);
  });

  it('klaim kalah (dicek 10 detik lalu): tidak bertanya ke DOKU', async () => {
    const calls = authedNet(routes(undefined, pending({ last_status_check_at: future(-10_000) })));
    expect((await (await call()).json()).checked).toBe(false);
    expect(askedDoku(calls)).toBe(false);
  });

  it('cek terakhir lebih dari 60 detik lalu: diklaim ulang lewat token dan bertanya ke DOKU', async () => {
    const calls = authedNet(routes(undefined, pending({ last_status_check_at: future(-61_000) })));
    expect((await (await call()).json()).checked).toBe(true);
    expect(askedDoku(calls)).toBe(true);
    const claim = calls.find((c) => c.method === 'PATCH' && c.url.includes('/webinar_orders'));
    expect(claim.prefer).toBe('return=minimal');
    expect(claim.body.last_status_check_at).toMatch(/\.\d{6}Z$/);
  });

  it('belum pernah dicek: bertanya ke DOKU walau balasan PATCH ber-or= kosong (insiden 5 Nov)', async () => {
    const calls = authedNet(routes({ outcome: 'ok', send_ticket: false }, pending()));
    expect((await (await call()).json()).checked).toBe(true);
    expect(askedDoku(calls)).toBe(true);
  });

  it('DOKU SUCCESS: lewat mark_paid dengan nominal dari DOKU, via status_check', async () => {
    const calls = authedNet(routes());
    expect((await (await call()).json()).status).toBe('paid');
    expect(calls.find((c) => c.url.endsWith('/rpc/webinar_mark_paid')).body).toEqual({
      p_invoice: 'WBN-1', p_amount: 50000, p_channel: 'QRIS_DOKU', p_via: 'status_check',
    });
  });

  it('DOKU belum SUCCESS: nol tulisan uang', async () => {
    const calls = authedNet({ ...routes(), '/orders/v1/status/': () => json({ transaction: { status: 'PENDING' } }) });
    await call();
    expect(calls.some((c) => c.url.includes('/rpc/webinar_mark_paid'))).toBe(false);
  });

  it('alarm: tercatat di banner dan email admin', async () => {
    const calls = authedNet(routes({ outcome: 'webinar_over_quota', send_ticket: false }));
    await call();
    const audit = calls.find((c) => c.method === 'POST' && c.url.includes('/doku_webhook_events'));
    expect(audit.body.outcome).toBe('webinar_over_quota');
    expect(calls.some((c) => c.url.includes('api.resend.com'))).toBe(true);
  });
});

describe('masa uji: hanya akun di daftar izin', () => {
  const TEGAR = { id: '33333333-3333-4333-8333-333333333333', email: 'Tegar@Jakpat.net' };
  afterEach(() => { access.preview = false; });

  it('checkout, my, sync menolak akun lain dengan 403 sebelum database', async () => {
    access.preview = true;
    const calls = authedNet({});
    const checkout = await checkoutHandler({ request: authed('checkout', { slug: 'olah-data', termsAccepted: true }), env: ENV });
    expect(checkout.status).toBe(403);
    expect((await checkout.json()).code).toBe('not_open');
    expect((await myHandler({ request: authed('my', null, 'GET'), env: ENV })).status).toBe(403);
    expect((await syncHandler({ request: authed('sync', { orderId: ORDER_ID }), env: ENV })).status).toBe(403);
    expect((await voucherHandler({ request: authed('voucher?slug=olah-data&code=JFUTYR', null, 'GET'), env: ENV })).status).toBe(403);
    expect(calls.some((c) => c.url.includes('/rest/v1/'))).toBe(false);
  });

  it('akun yang diizinkan lolos gerbang (huruf besar tidak berpengaruh)', async () => {
    access.preview = true;
    authedNet({ user: TEGAR, '/webinar_orders': () => json([]) });
    const res = await myHandler({ request: authed('my', null, 'GET'), env: ENV });
    expect(res.status).toBe(200);
    expect((await res.json()).orders).toEqual([]);
  });

  it('events: tanpa sesi atau akun lain mendapat daftar kosong + open:false tanpa kueri acara', async () => {
    access.preview = true;
    const calls = authedNet({ '/webinar_events': () => json([event()]) });
    const anon = await (await eventsHandler({ request: new Request('https://x.test/api/webinar/events'), env: ENV })).json();
    expect(anon.open).toBe(false);
    expect(anon.hero).toBeNull();
    const other = await (await eventsHandler({ request: authed('events', null, 'GET'), env: ENV })).json();
    expect(other.open).toBe(false);
    expect(calls.some((c) => c.url.includes('/webinar_events'))).toBe(false);
  });

  it('events: akun yang diizinkan melihat isi + open:true', async () => {
    access.preview = true;
    authedNet({ user: TEGAR, '/webinar_events': () => json([event()]) });
    const body = await (await eventsHandler({ request: authed('events', null, 'GET'), env: ENV })).json();
    expect(body.open).toBe(true);
    expect(body.hero.slug).toBe('olah-data');
  });

  it('sesudah rilis events selalu open:true untuk homepage', async () => {
    global.fetch = vi.fn(async () => json([event()]));
    const body = await (await eventsHandler({ request: new Request('https://x.test/api/webinar/events'), env: ENV })).json();
    expect(body.open).toBe(true);
  });

  it('event (API checkout): 404 untuk akun lain, 200 untuk yang diizinkan', async () => {
    access.preview = true;
    authedNet({ '/webinar_events': () => json([event()]) });
    expect((await eventHandler({ request: authed('event?slug=olah-data', null, 'GET'), env: ENV })).status).toBe(404);
    authedNet({ user: TEGAR, '/webinar_events': () => json([event()]) });
    expect((await eventHandler({ request: authed('event?slug=olah-data', null, 'GET'), env: ENV })).status).toBe(200);
  });

  describe('halaman publik', () => {
    const page = (path, rows) => {
      global.fetch = vi.fn(async (url) => (String(url).includes('/webinar_events') ? json(rows) : json([])));
      return pageHandler({
        request: new Request(`https://submit.jakpatforuniv.com/webinar${path ? `/${path}` : ''}`),
        env: ENV,
        params: { path: path ? path.split('/') : undefined },
      });
    };

    it('daftar /webinar: 404', async () => {
      access.preview = true;
      expect((await page('', [event()])).status).toBe(404);
    });

    it('detail acara sungguhan: 404; acara uji: tampil', async () => {
      access.preview = true;
      expect((await page('olah-data', [event()])).status).toBe(404);
      const res = await page('olah-data', [event({ is_test: true })]);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('Olah Data');
    });
  });
});

describe('voucher (pratinjau)', () => {
  const preview = (q) => voucherHandler({ request: authed(`voucher?${q}`, null, 'GET'), env: ENV });

  it('menghitung total dari harga acara di database', async () => {
    authedNet({ '/webinar_events': () => json([{ price: 50000 }]) });
    const body = await (await preview('slug=olah-data&code=jfutyr')).json();
    expect(body).toMatchObject({ valid: true, code: 'JFUTYR', discount: 5000, total: 45000, total_label: 'Rp 45.000' });
  });

  it('kode khusus iklan: kalimat produk, tanpa kueri acara', async () => {
    const calls = authedNet({ '/webinar_events': () => json([{ price: 50000 }]) });
    const body = await (await preview('slug=olah-data&code=ILKOMUNY')).json();
    expect(body).toMatchObject({ valid: false, reason: 'not_for_product' });
    expect(body.message).toBe('Kode voucher tidak bisa digunakan pada produk ini.');
    expect(calls.some((c) => c.url.includes('/webinar_events'))).toBe(false);
  });

  it('tanpa sesi: 401', async () => {
    authedNet({ user: null });
    expect((await preview('slug=olah-data&code=JFUTYR')).status).toBe(401);
  });
});
