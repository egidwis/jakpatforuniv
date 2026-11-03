import { describe, it, expect, vi, afterEach } from 'vitest';

// Tes lama menguji perilaku sesudah rilis (masa uji mati). Blok "masa uji"
// menyalakannya. Logika webinarOpenFor yang asli diuji di _access.spec.js.
const access = vi.hoisted(() => ({ preview: false }));
vi.mock('./_access.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    get WEBINAR_PREVIEW_ONLY() { return access.preview; },
    WEBINAR_PREVIEW_EMAILS: real.WEBINAR_PREVIEW_EMAILS,
    webinarOpenFor: (email) => !access.preview
      || real.WEBINAR_PREVIEW_EMAILS.includes(String(email || '').trim().toLowerCase()),
  };
});
import { buildEventView, buildListing, PUBLIC_EVENT_COLUMNS } from './_view.js';
import { onRequest as eventsHandler } from './events.js';
import { onRequest as eventHandler } from './event.js';
import { onRequest as checkoutHandler } from './checkout.js';
import { onRequest as myHandler, orderDisplayStatus } from './my.js';
import { onRequest as syncHandler } from './sync.js';
import { onRequest as pageHandler } from '../../webinar/[[path]].js';
import { renderBlocks } from '../../webinar/_render-blocks.js';

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

    it('jauh sebelum acara: hitung mundur, tanpa link Zoom, no-referrer', async () => {
      net([], { joinOrder: { status: 'paid', kind: 'live', event_id: 'e1' }, joinEvent: liveEvent() });
      const res = await open(`gabung/${token}`);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).not.toContain(SECRET_ZOOM);
      expect(html).toContain('data-count');
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    });

    it('30 menit sebelum: 302 ke Zoom', async () => {
      net([], { joinOrder: { status: 'paid', kind: 'live', event_id: 'e1' }, joinEvent: liveEvent({ starts_at: future(20 * 60_000) }) });
      const res = await open(`gabung/${token}`);
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe(SECRET_ZOOM);
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    });

    it('link belum diisi: pesan menunggu', async () => {
      net([], { joinOrder: { status: 'paid', kind: 'live', event_id: 'e1' }, joinEvent: liveEvent({ starts_at: future(60_000), meeting_url: null }) });
      expect(await (await open(`gabung/${token}`)).text()).toContain('Link sedang disiapkan');
    });

    it('sesudah acara: ke menu Webinar', async () => {
      net([], { joinOrder: { status: 'paid', kind: 'live', event_id: 'e1' }, joinEvent: liveEvent({ starts_at: future(-2 * DAY) }) });
      const res = await open(`gabung/${token}`);
      expect(res.headers.get('Location')).toContain('/dashboard/webinar');
    });

    it('tiket refunded dan acara batal: kalimat tanpa menyebut pengembalian dana', async () => {
      net([], { joinOrder: { status: 'refunded', kind: 'live', event_id: 'e1' } });
      let html = await (await open(`gabung/${token}`)).text();
      expect(html).toContain('Tiket tidak aktif');
      expect(html.toLowerCase()).not.toContain('refund');
      net([], { joinOrder: { status: 'paid', kind: 'live', event_id: 'e1' }, joinEvent: liveEvent({ status: 'cancelled', starts_at: future(60_000) }) });
      html = await (await open(`gabung/${token}`)).text();
      expect(html).toContain('dibatalkan');
      expect(html).not.toContain(SECRET_ZOOM);
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
    calls.push({ url: u, method, body });
    if (u.endsWith('/auth/v1/user')) return routes.user === null ? json({}, 401) : json(routes.user ?? USER);
    for (const [frag, handler] of Object.entries(routes)) {
      if (frag !== 'user' && u.includes(frag)) return handler({ url: u, method, body });
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

  it('e-tiket yang belum terkirim dicoba lagi, kecuali acara batal', async () => {
    let calls = authedNet({ '/webinar_orders': () => json([order({ ticket_email_sent_at: null })]) });
    await call();
    expect(calls.some((c) => c.method === 'PATCH' && c.url.includes('ticket_email_sent_at=is.null'))).toBe(true);
    calls = authedNet({ '/webinar_orders': () => json([order({ ticket_email_sent_at: null, webinar_events: { ...event(), status: 'cancelled' } })]) });
    await call();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('keadaan order', () => {
    expect(orderDisplayStatus({ status: 'cancelled' })).toBe('expired');
    expect(orderDisplayStatus({ status: 'refunded' })).toBe('refunded');
  });
});

describe('sync', () => {
  const pending = (over = {}) => ({ id: ORDER_ID, invoice_number: 'WBN-1', status: 'pending', created_at: future(-120_000), last_status_check_at: null, ...over });
  const call = async () => {
    const pendingWork = [];
    const res = await syncHandler({ request: authed('sync', { orderId: ORDER_ID }), env: ENV, waitUntil: (p) => pendingWork.push(p) });
    await Promise.all(pendingWork);
    return res;
  };

  const dokuPaid = () => json({ order: { amount: 50000 }, transaction: { status: 'SUCCESS' }, channel: { id: 'QRIS_DOKU' } });

  function routes(rpc = { outcome: 'ok', send_ticket: false }, first = pending(), claim = [{ id: ORDER_ID }]) {
    return {
      '/rest/v1/webinar_orders': ({ method, url }) => {
        if (method === 'PATCH') return json(claim);
        if (url.includes('select=status')) return json([{ status: 'paid' }]);
        return json([first]);
      },
      '/orders/v1/status/': dokuPaid,
      '/rpc/webinar_mark_paid': () => json(rpc),
    };
  }

  it('hanya pemilik: filter auth_user_id, order orang lain 404', async () => {
    const calls = authedNet({ '/rest/v1/webinar_orders': () => json([]) });
    expect((await call()).status).toBe(404);
    expect(calls.find((c) => c.url.includes('/webinar_orders')).url).toContain(`auth_user_id=eq.${USER.id}`);
    expect(calls.some((c) => c.url.includes('/orders/v1/status'))).toBe(false);
  });

  it('kurang dari 60 detik: tidak bertanya ke DOKU', async () => {
    const calls = authedNet(routes(undefined, pending({ created_at: future(-5000) })));
    expect((await (await call()).json()).checked).toBe(false);
    expect(calls.some((c) => c.url.includes('/orders/v1/status'))).toBe(false);
  });

  it('klaim kalah: tidak bertanya ke DOKU', async () => {
    const calls = authedNet(routes(undefined, pending(), []));
    await call();
    expect(calls.some((c) => c.url.includes('/orders/v1/status'))).toBe(false);
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
