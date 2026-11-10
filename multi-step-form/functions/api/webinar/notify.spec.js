import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildWebinarNotifyEmail, formatWibRange } from './_notify-email.js';
import { sendOrderNotification } from './_notify.js';
import { onRequestPost } from '../notify-webinar.js';

/*
  Email otomatis ke peserta: templat tetap (Fase 3). Sejak Iterasi 4 tanpa antrean:
  cron memanggil Function per peserta (sql/136b). Di sini dikunci: isi templat, pengirim
  per order (baca → periksa keadaan → kirim → catat galat), dan gerbang endpoint cron.
*/

const EVENT = {
  id: 'ev-1',
  title: 'Olah Data SPSS untuk Skripsi',
  starts_at: '2026-11-17T01:30:00Z', // Selasa 17 Nov 08.30 WIB
  duration_minutes: 90,
  speakers: [{ name: 'Dr. Sari', title: 'Dosen' }],
  status: 'published',
};
const RECIPIENT = { buyer_name: 'Putra', ticket_code: '7F3A91B2C4', join_token: 'a'.repeat(64) };
const JOIN = `https://submit.jakpatforuniv.com/webinar/gabung/${'a'.repeat(64)}`;
const FORBIDDEN = /refund|pengembalian dana|uang kembali|zoom\.us|meeting_url/i;

describe('formatWibRange', () => {
  it('hari, tanggal, jam mulai–selesai dalam WIB', () => {
    expect(formatWibRange(EVENT.starts_at, 90)).toBe('Selasa, 17 November 2026 · 08.30–10.00 WIB');
  });
  it('tanpa durasi: hanya jam mulai', () => {
    expect(formatWibRange(EVENT.starts_at, null)).toBe('Selasa, 17 November 2026 · 08.30 WIB');
  });
});

describe('templat email otomatis', () => {
  const build = (kind, over = {}) => buildWebinarNotifyEmail({ kind, event: { ...EVENT, ...over.event }, recipient: { ...RECIPIENT, ...over.recipient } });

  it('pengingat H-1: subjek bertanggal, link gabung pribadi, kode tiket, jadwal WIB', () => {
    const m = build('reminder_day');
    expect(m.subject).toBe('Pengingat: Olah Data SPSS untuk Skripsi · Sel, 17 Nov, 08.30 WIB');
    expect(m.html).toContain('Halo Putra');
    expect(m.html).toContain('Selasa, 17 November 2026 · 08.30–10.00 WIB');
    expect(m.html).toContain(JOIN);
    expect(m.html).toContain('7F3A91B2C4');
    expect(m.html).toContain('Dr. Sari, Dosen');
    expect(m.html).toContain('Ruang dibuka 30 menit sebelum acara');
    expect(m.html).toContain('calendar.google.com');
    expect(m.html).toContain('product@jakpat.net');
  });

  it('jadwal berubah: jadwal terbaru, tiket tetap berlaku, link gabung tetap', () => {
    const m = build('schedule_change');
    expect(m.subject).toBe('Jadwal baru: Olah Data SPSS untuk Skripsi');
    expect(m.html).toContain('Ini jadwal terbarunya');
    expect(m.html).toContain('Tiketmu tetap berlaku untuk jadwal baru ini');
    expect(m.html).toContain(JOIN);
    expect(m.html).toContain('calendar.google.com');
  });

  it('pembatalan: tanpa tombol gabung dan kalender, arahkan ke admin', () => {
    const m = build('cancellation');
    expect(m.subject).toBe('Webinar dibatalkan: Olah Data SPSS untuk Skripsi');
    expect(m.html).toContain('dibatalkan');
    expect(m.html).toContain('Selasa, 17 November 2026 · 08.30–10.00 WIB');
    expect(m.html).toContain('(kode 7F3A91B2C4)');
    expect(m.html).not.toContain('/webinar/gabung/');
    expect(m.html).not.toContain('calendar.google.com');
    expect(m.html).toContain('product@jakpat.net');
  });

  it.each(['reminder_day', 'schedule_change', 'cancellation'])('%s: tanpa kata refund dan tanpa link Zoom', (kind) => {
    const m = build(kind, { event: { meeting_url: 'https://zoom.us/j/123' } });
    expect(`${m.subject} ${m.html}`).not.toMatch(FORBIDDEN);
  });

  it('nama kosong → "Kak"; isi dari database di-escape', () => {
    const m = build('reminder_day', { recipient: { buyer_name: null }, event: { title: '<script>x</script>' } });
    expect(m.html).toContain('Halo Kak');
    expect(m.html).not.toContain('<script>x');
    expect(m.html).toContain('&lt;script&gt;');
    const n = build('reminder_day', { recipient: { buyer_name: '<b>Budi</b>' } });
    expect(n.html).toContain('Halo &lt;b&gt;Budi&lt;/b&gt;');
  });

  it('jenis tak dikenal melempar', () => {
    expect(() => build('promosi')).toThrow();
  });

  it('rekaman tersedia (Fase 5A): link tonton per order, tanpa URL video/R2, tanpa refund', () => {
    const ORDER = '55555555-5555-4555-8555-555555555555';
    const m = build('recording_ready', { recipient: { order_id: ORDER } });
    expect(m.subject).toBe('Rekaman tersedia: Olah Data SPSS untuk Skripsi');
    expect(m.html).toContain('Halo Putra');
    expect(m.html).toContain('Selasa, 17 November 2026');
    expect(m.html).toContain(`https://submit.jakpatforuniv.com/dashboard/webinar/tonton/${ORDER}`);
    expect(m.html).toContain('Tonton rekaman');
    expect(m.html).toContain('Materi presentasi bisa diunduh');
    expect(m.html).toContain('jangan disebarkan');
    expect(m.html).toContain('product@jakpat.net');
    expect(m.html).not.toMatch(/r2\.cloudflarestorage\.com|X-Amz-|\.mp4|gabung/);
    expect(m.html).not.toMatch(FORBIDDEN);

    const x = build('recording_ready', { recipient: { order_id: ORDER }, event: { title: '<script>x</script>' } });
    expect(x.html).not.toContain('<script>x');
    expect(() => build('recording_ready')).toThrow(/order_id/);
  });
});

// ── pengirim per peserta (Iterasi 4: pola email iklan, tanpa antrean) ──

const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  MAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 'resend-key',
  CRON_NOTIFY_SECRET: 'rahasia',
};
const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-16T02:00:00Z'); // Sen 16 Nov 09.00 WIB, acara mulai besok 08.30
// Video kelas yang dikaitkan ke acara ini, rekamannya terbit (sumber rekaman pemegang tiket, Iterasi 8).
const LINKED = { id: '33333333-3333-4333-8333-333333333333', recording_published_at: '2026-11-15T03:00:00Z', recording_object_key: 'rekaman/33333333-3333-4333-8333-333333333333/a-a1b2c3d4.mp4', source_linked_at: '2026-11-15T02:00:00Z' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function network({ order = {}, event = {}, video = null, mail = () => json({ id: 'm' }), orderStatus = 200, patchRows = null } = {}) {
  const calls = [];
  const orderRow = order === null ? null : {
    id: ORDER_ID, event_id: EVENT_ID, kind: 'live', status: 'paid', buyer_name: 'Putra', buyer_email: 'putra@t.test',
    ticket_code: '7F3A91B2C4', join_token: 'a'.repeat(64), email_error: null, ...order,
  };
  const eventRow = { ...EVENT, id: EVENT_ID, offer_kind: 'live', recording_published_at: null, ...event };
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, method, body });
    if (u.includes('/rest/v1/webinar_orders') && method === 'GET') return json(orderRow ? [orderRow] : [], orderStatus);
    if (u.includes('/rest/v1/webinar_events') && method === 'GET') {
      // Video kelas terkait (Iterasi 8): dicari lewat source_event_id.
      if (u.includes('source_event_id=')) return json(video && u.includes(EVENT_ID) ? [{ source_event_id: EVENT_ID, status: 'draft', ...video }] : []);
      return json([eventRow]);
    }
    if (u.includes('/rest/v1/webinar_orders') && method === 'PATCH') return json(patchRows ?? [{ id: ORDER_ID }]);
    if (u.includes('api.resend.com')) return mail(body);
    return json({}, 404);
  });
  return {
    calls,
    mails: () => calls.filter((c) => c.url.includes('api.resend.com')).map((c) => c.body),
    patches: () => calls.filter((c) => c.method === 'PATCH'),
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('sendOrderNotification', () => {
  const sb = { url: ENV.VITE_SUPABASE_URL, headers: { apikey: 'k' } };
  const send = (kind, extra = {}) => sendOrderNotification({ env: ENV, sb, orderId: ORDER_ID, kind, now: NOW, ...extra });

  it('pengingat: satu email ke alamat order, isi dari baris terbaru, tanpa PATCH bila tak ada galat lama', async () => {
    const net = network();
    expect(await send('reminder_day')).toEqual({ sent: true });
    const [mail] = net.mails();
    expect(mail.to).toEqual(['putra@t.test']);
    expect(mail.subject).toBe('Pengingat: Olah Data SPSS untuk Skripsi · Sel, 17 Nov, 08.30 WIB');
    expect(mail.html).toContain('7F3A91B2C4');
    expect(net.patches()).toHaveLength(0);
    // Baca memfilter id saja.
    expect(net.calls[0].url).toContain(`webinar_orders?id=eq.${ORDER_ID}&select=`);
  });

  it('sukses mengosongkan email_error lama, PATCH memfilter id saja', async () => {
    const net = network({ order: { email_error: 'Pengingat H-1 · kemarin · 429' } });
    expect(await send('schedule_change')).toEqual({ sent: true });
    const [patch] = net.patches();
    expect(patch.url).toBe(`${ENV.VITE_SUPABASE_URL}/rest/v1/webinar_orders?id=eq.${ORDER_ID}&select=id`);
    expect(patch.body).toEqual({ email_error: null });
  });

  it('gagal kirim: email_error berisi jenis, waktu WIB, dan galat; PATCH memfilter id saja', async () => {
    const net = network({ mail: () => json({ message: 'rate limit' }, 429) });
    const result = await send('reminder_day');
    expect(result.sent).toBe(false);
    const [patch] = net.patches();
    expect(patch.url).toBe(`${ENV.VITE_SUPABASE_URL}/rest/v1/webinar_orders?id=eq.${ORDER_ID}&select=id`);
    expect(patch.body.email_error).toMatch(/^Pengingat H-1 · 16 Nov 09\.00 · resend HTTP 429/);
    expect(patch.body.email_error.length).toBeLessThanOrEqual(500);
  });

  it('galat tak bisa dicatat (nol baris) → melempar', async () => {
    network({ mail: () => json({ message: 'x' }, 500), patchRows: [] });
    await expect(send('reminder_day')).rejects.toThrow(/email_error/);
  });

  it.each([
    ['refund', { order: { status: 'refunded' } }, 'reminder_day', 'not_paid'],
    ['order tidak ada', { order: null }, 'reminder_day', 'not_found'],
    ['pembatalan untuk acara yang tidak batal', {}, 'cancellation', 'wrong_state'],
    ['pengingat untuk acara batal', { event: { status: 'cancelled' } }, 'reminder_day', 'wrong_state'],
    ['pengingat untuk acara yang sudah mulai', { event: { starts_at: '2026-11-16T01:00:00Z' } }, 'reminder_day', 'wrong_state'],
    ['jadwal berubah untuk acara yang sudah mulai', { event: { starts_at: '2026-11-16T01:00:00Z' } }, 'schedule_change', 'wrong_state'],
    ['rekaman yang belum terbit', {}, 'recording_ready', 'wrong_state'],
  ])('%s → dilewati tanpa email', async (_, setup, kind, reason) => {
    const net = network(setup);
    expect(await send(kind)).toEqual({ skipped: reason });
    expect(net.mails()).toHaveLength(0);
    expect(net.patches()).toHaveLength(0);
  });

  it('pembatalan: hanya untuk acara batal; rekaman: link tonton per order', async () => {
    let net = network({ event: { status: 'cancelled' } });
    expect(await send('cancellation')).toEqual({ sent: true });
    expect(net.mails()[0].subject).toBe('Webinar dibatalkan: Olah Data SPSS untuk Skripsi');

    net = network({ event: { starts_at: '2026-11-10T01:30:00Z' }, video: LINKED });
    expect(await send('recording_ready')).toEqual({ sent: true });
    expect(net.mails()[0].html).toContain(`/dashboard/webinar/tonton/${ORDER_ID}`);
    expect(net.calls.find((c) => c.url.includes('source_event_id=')).url).toContain(`source_event_id=in.(${EVENT_ID})`);
  });

  it.each([
    ['tanpa Video kelas terkait', { event: { starts_at: '2026-11-10T01:30:00Z' } }],
    ['rekaman lama di baris webinar (diabaikan)', { event: { starts_at: '2026-11-10T01:30:00Z', recording_published_at: '2026-11-15T03:00:00Z', recording_object_key: 'rekaman/x/a.mp4' } }],
    ['rekaman Video kelas belum terbit', { event: { starts_at: '2026-11-10T01:30:00Z' }, video: { ...LINKED, recording_published_at: null } }],
    ['webinar belum mulai', { video: LINKED }],
  ])('rekaman: %s → dilewati', async (_, setup) => {
    const net = network(setup);
    expect(await send('recording_ready')).toEqual({ skipped: 'wrong_state' });
    expect(net.mails()).toHaveLength(0);
  });

  it('database gagal dibaca → melempar', async () => {
    network({ orderStatus: 500 });
    await expect(send('reminder_day')).rejects.toThrow(/webinar_orders/);
  });
});

describe('POST /api/notify-webinar', () => {
  const req = (k, body = { order_id: ORDER_ID, kind: 'reminder_day' }) => new Request(
    `https://submit.jakpatforuniv.com/api/notify-webinar${k === undefined ? '' : `?k=${k}`}`,
    { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) },
  );

  it.each([[undefined], ['salah']])('rahasia %s → 401 tanpa menyentuh database', async (k) => {
    const net = network();
    const res = await onRequestPost({ request: req(k), env: ENV });
    expect(res.status).toBe(401);
    expect(net.calls).toHaveLength(0);
  });

  it('env tanpa CRON_NOTIFY_SECRET → 401 (tidak terbuka)', async () => {
    network();
    const res = await onRequestPost({ request: req('rahasia'), env: { ...ENV, CRON_NOTIFY_SECRET: '' } });
    expect(res.status).toBe(401);
  });

  it.each([
    ['bukan JSON', '{'],
    ['tanpa order_id', { kind: 'reminder_day' }],
    ['order_id bukan UUID', { order_id: 'x', kind: 'reminder_day' }],
    ['jenis tak dikenal', { order_id: ORDER_ID, kind: 'promosi' }],
    ['body kosong (tick lama)', {}],
  ])('%s → 400 tanpa menyentuh database', async (_, body) => {
    const net = network();
    const res = await onRequestPost({ request: req('rahasia', body), env: ENV });
    expect(res.status).toBe(400);
    expect(net.calls).toHaveLength(0);
  });

  it('terkirim → 200 {sent}; dilewati → 200 {skipped}', async () => {
    network();
    let res = await onRequestPost({ request: req('rahasia'), env: ENV });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: true });

    network({ order: { status: 'refunded' } });
    res = await onRequestPost({ request: req('rahasia'), env: ENV });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: 'not_paid' });
  });

  it('penyedia email gagal → 502; database gagal → 500', async () => {
    network({ mail: () => json({ message: 'x' }, 500) });
    expect((await onRequestPost({ request: req('rahasia'), env: ENV })).status).toBe(502);
    network({ orderStatus: 500 });
    expect((await onRequestPost({ request: req('rahasia'), env: ENV })).status).toBe(500);
  });
});
