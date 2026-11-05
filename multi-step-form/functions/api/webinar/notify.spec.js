import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildWebinarNotifyEmail, formatWibRange } from './_notify-email.js';
import { dispatchWebinarNotifications } from './_notify.js';
import { onRequestPost } from '../notify-webinar.js';

/*
  Email otomatis ke peserta (Fase 3, 6 Nov): templat tetap, antrean di database
  (sql/135). Di sini dikunci: isi ketiga templat, cara pengirim memakai antrean
  (claim → kirim → catat), dan gerbang rahasia endpoint cron.
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
});

// ── pengirim antrean ──

const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  MAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 'resend-key',
  CRON_NOTIFY_SECRET: 'rahasia',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const row = (i, kind = 'reminder_day') => ({
  broadcast_id: 'b-1', order_id: `o-${i}`, kind, email: `p${i}@t.test`,
  buyer_name: `Peserta ${i}`, ticket_code: `CODE${i}`, join_token: String(i).repeat(64).slice(0, 64), event: EVENT,
});

function network({ rows = [row(1), row(2)], mail = () => json({ id: 'm' }), claimStatus = 200 } = {}) {
  const calls = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, body });
    if (u.endsWith('/rpc/webinar_claim_deliveries')) return json({ token: 'tok-1', rows }, claimStatus);
    if (u.endsWith('/rpc/webinar_record_deliveries')) return json(body.p_results.length);
    if (u.includes('api.resend.com')) return mail(body);
    return json({}, 404);
  });
  return {
    calls,
    rpc: (name) => calls.filter((c) => c.url.endsWith(`/rpc/${name}`)).map((c) => c.body),
    mails: () => calls.filter((c) => c.url.includes('api.resend.com')).map((c) => c.body),
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('dispatchWebinarNotifications', () => {
  const sb = { url: ENV.VITE_SUPABASE_URL, headers: { apikey: 'k' } };

  it('claim → satu email per peserta ke alamatnya sendiri → catat hasil dengan token klaim', async () => {
    const net = network();
    const result = await dispatchWebinarNotifications({ env: ENV, sb, limit: 20 });
    expect(net.rpc('webinar_claim_deliveries')).toEqual([{ p_limit: 20 }]);
    const mails = net.mails();
    expect(mails.map((m) => m.to)).toEqual([['p1@t.test'], ['p2@t.test']]);
    expect(mails[0].html).toContain('Halo Peserta 1');
    expect(mails[1].html).toContain('CODE2');
    const [record] = net.rpc('webinar_record_deliveries');
    expect(record.p_token).toBe('tok-1');
    expect(record.p_results).toEqual([
      { broadcast_id: 'b-1', order_id: 'o-1', ok: true },
      { broadcast_id: 'b-1', order_id: 'o-2', ok: true },
    ]);
    expect(result).toEqual({ claimed: 2, sent: 2, failed: 0 });
  });

  it('antrean kosong: tidak mengirim dan tidak mencatat', async () => {
    const net = network({ rows: [] });
    expect(await dispatchWebinarNotifications({ env: ENV, sb })).toEqual({ claimed: 0, sent: 0, failed: 0 });
    expect(net.mails()).toHaveLength(0);
    expect(net.rpc('webinar_record_deliveries')).toHaveLength(0);
  });

  it('galat sementara vs bounce permanen tercatat berbeda', async () => {
    const net = network({
      mail: (b) => (b.to[0] === 'p1@t.test' ? json({ message: 'rate limit' }, 429) : json({ message: 'x' }, 500)),
    });
    // resend tidak punya permanent_bounces; jadikan p2 bounce lewat provider cloudflare di tes berikutnya
    await dispatchWebinarNotifications({ env: ENV, sb });
    const [record] = net.rpc('webinar_record_deliveries');
    expect(record.p_results[0]).toMatchObject({ order_id: 'o-1', ok: false, permanent: false });
    expect(record.p_results[0].error).toContain('429');
  });

  it('bounce permanen Cloudflare: permanent=true', async () => {
    const env = { ...ENV, MAIL_PROVIDER: 'cloudflare', CF_EMAIL_API_TOKEN: 't', CF_ACCOUNT_ID: 'acc' };
    const calls = [];
    global.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url);
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ url: u, body });
      if (u.endsWith('/rpc/webinar_claim_deliveries')) return json({ token: 'tok-1', rows: [row(1)] });
      if (u.endsWith('/rpc/webinar_record_deliveries')) return json(1);
      if (u.includes('api.cloudflare.com')) return json({ success: true, result: { delivered: [], queued: [], permanent_bounces: ['p1@t.test'] } });
      return json({}, 404);
    });
    await dispatchWebinarNotifications({ env, sb });
    const record = calls.find((c) => c.url.endsWith('/rpc/webinar_record_deliveries')).body;
    expect(record.p_results[0]).toMatchObject({ ok: false, permanent: true });
  });

  it('templat gagal dirender untuk satu baris: baris itu gagal permanen, sisanya tetap terkirim', async () => {
    const net = network({ rows: [{ ...row(1), kind: 'promosi' }, row(2)] });
    const result = await dispatchWebinarNotifications({ env: ENV, sb });
    expect(net.mails()).toHaveLength(1);
    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1 });
    expect(net.rpc('webinar_record_deliveries')[0].p_results[0]).toMatchObject({ ok: false, permanent: true });
  });

  it('claim gagal: melempar (endpoint membalas 500)', async () => {
    network({ claimStatus: 500 });
    await expect(dispatchWebinarNotifications({ env: ENV, sb })).rejects.toThrow(/webinar_claim_deliveries/);
  });
});

describe('POST /api/notify-webinar', () => {
  const req = (k) => new Request(`https://submit.jakpatforuniv.com/api/notify-webinar${k === undefined ? '' : `?k=${k}`}`, { method: 'POST', body: '{}' });

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

  it('rahasia benar → kirim satu batch dan laporkan jumlahnya', async () => {
    network();
    const res = await onRequestPost({ request: req('rahasia'), env: ENV });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claimed: 2, sent: 2, failed: 0 });
  });

  it('database gagal → 500', async () => {
    network({ claimStatus: 500 });
    const res = await onRequestPost({ request: req('rahasia'), env: ENV });
    expect(res.status).toBe(500);
  });
});
