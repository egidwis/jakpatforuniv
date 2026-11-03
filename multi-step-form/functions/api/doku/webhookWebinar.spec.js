import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './webhook.js';
import { deliverWebinarTicket } from './_webinar.js';
import { buildTicketEmail, googleCalendarUrl } from './_webinar-ticket-email.js';

/*
  Handler SUNGGUHAN dipanggil dengan notifikasi yang lolos autentikasi; jaringan
  dipalsukan per URL. Isi webinar_mark_paid sendiri diuji dengan menjalankannya di
  PGlite; di sini yang dikunci adalah cara webhook bereaksi atas jawabannya.
*/

const INVOICE = 'WBN-ABCDEF12-1793657933901';
const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  DOKU_CLIENT_ID: 'client-id',
  DOKU_SECRET_KEY: 'secret-key',
  DOKU_WEBHOOK_SECRET: 's3cret',
  MAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 'resend-key',
  ADMIN_EMAILS: 'admin@example.test',
};

const ORDER = {
  id: 'order-1',
  event_id: 'event-1',
  invoice_number: INVOICE,
  buyer_name: 'Budi <b>',
  buyer_email: 'budi@example.test',
  ticket_code: 'A1B2C3D4E5',
  join_token: 'tok123',
};
const EVENT = {
  title: 'Riset Cepat',
  starts_at: '2026-11-20T12:00:00Z',
  duration_minutes: 90,
  speakers: [{ name: 'Dr. Sari', title: 'Dosen' }],
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

function request(dokuStatus = 'SUCCESS', amount = 50000, invoice = INVOICE) {
  return new Request(`https://submit.jakpatforuniv.com/api/doku/webhook?k=${ENV.DOKU_WEBHOOK_SECRET}`, {
    method: 'POST',
    headers: {
      'CHANNEL-ID': 'H2H',
      'X-PARTNER-ID': ENV.DOKU_CLIENT_ID,
      'X-EXTERNAL-ID': 'ext-1',
      'X-TIMESTAMP': '2026-11-03T09:00:00+07:00',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      order: { invoice_number: invoice, amount },
      transaction: { status: dokuStatus },
      channel: { id: 'QRIS_DOKU' },
    }),
  });
}

function network({ rpc = { outcome: 'ok', send_ticket: true }, rpcStatus = 200, claim = () => [ORDER], mailOk = true } = {}) {
  const calls = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, method, body });

    if (u.endsWith('/rpc/webinar_mark_paid')) return json(rpc, rpcStatus);
    if (u.includes('/webinar_orders') && u.includes('ticket_email_sent_at=is.null')) return json(claim());
    if (u.includes('/webinar_events')) return json([EVENT]);
    if (u.includes('api.resend.com')) {
      return mailOk ? json({ id: 'mail-1' }) : json({ message: 'ditolak' }, 422);
    }
    return json([]);
  });

  const of = (fragment) => calls.filter((c) => c.url.includes(fragment));
  const mails = () => of('api.resend.com').map((c) => c.body);
  return {
    calls,
    of,
    tickets: () => mails().filter((m) => String(m.subject).startsWith('E-tiket')),
    alarms: () => mails().filter((m) => String(m.subject).startsWith('⚠️')),
    audit: () => of('/doku_webhook_events').filter((c) => c.method === 'POST').map((c) => c.body),
    autoResolved: () => of('/doku_webhook_events').some((c) => c.method === 'PATCH'),
  };
}

async function call(dokuStatus, amount, invoice) {
  const pending = [];
  const res = await onRequest({
    request: request(dokuStatus, amount, invoice),
    env: ENV,
    waitUntil: (p) => pending.push(p),
  });
  await Promise.all(pending);
  return res;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('webhook × webinar: lunas', () => {
  it('sukses: RPC dipanggil dengan data notifikasi, e-tiket terkirim, alarm tertutup', async () => {
    const net = network();
    const res = await call();
    expect(res.status).toBe(200);
    const [rpc] = net.of('/rpc/webinar_mark_paid');
    expect(rpc.body).toEqual({ p_invoice: INVOICE, p_amount: 50000, p_channel: 'QRIS_DOKU', p_via: 'webhook' });
    expect(net.audit()[0]).toMatchObject({ invoice_number: INVOICE, outcome: 'ok', http_status: 200 });
    expect(net.autoResolved()).toBe(true);
    expect(net.tickets()).toHaveLength(1);
    expect(net.alarms()).toHaveLength(0);
  });

  it('nominal desimal SNAP dikirim sebagai angka', async () => {
    const net = network();
    await call('SUCCESS', '50000.00');
    expect(net.of('/rpc/webinar_mark_paid')[0].body.p_amount).toBe(50000);
  });

  it('notifikasi ulang: RPC idempoten, tanpa e-tiket bila sudah terkirim', async () => {
    const net = network({ rpc: { outcome: 'ok', newly_paid: false, send_ticket: false } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(net.tickets()).toHaveLength(0);
  });

  it('notifikasi ulang saat e-tiket belum terkirim: dicoba lagi', async () => {
    const net = network({ rpc: { outcome: 'ok', newly_paid: false, send_ticket: true } });
    await call();
    expect(net.tickets()).toHaveLength(1);
  });

  it('tidak menyentuh tabel iklan dan tidak mengirim kuitansi iklan', async () => {
    const net = network();
    await call();
    expect(net.of('/rest/v1/invoices')).toHaveLength(0);
    expect(net.of('/rest/v1/transactions')).toHaveLength(0);
    expect(net.of('/rest/v1/form_submissions')).toHaveLength(0);
    expect(net.of('/rest/v1/ad_schedules')).toHaveLength(0);
  });
});

describe('webhook × webinar: alarm', () => {
  it.each([
    ['webinar_over_quota', true, 1],
    ['webinar_duplicate_paid', true, 1],
    ['webinar_paid_on_cancelled', false, 0],
  ])('%s: HTTP 200, tercatat, alarm ke admin, e-tiket sesuai keputusan RPC', async (outcome, send_ticket, tickets) => {
    const net = network({ rpc: { outcome, newly_paid: true, send_ticket } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(net.audit()[0].outcome).toBe(outcome);
    expect(net.alarms()).toHaveLength(1);
    expect(net.tickets()).toHaveLength(tickets);
  });

  it('webinar_not_found: HTTP 200, alarm, tanpa e-tiket', async () => {
    const net = network({ rpc: { outcome: 'webinar_not_found' } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(net.audit()[0]).toMatchObject({ outcome: 'webinar_not_found' });
    expect(net.audit()[0].error_message).toContain('webinar_orders');
    expect(net.alarms()).toHaveLength(1);
    expect(net.tickets()).toHaveLength(0);
  });

  it('amount_mismatch: HTTP 200, alasan tercatat, tanpa e-tiket', async () => {
    const net = network({ rpc: { outcome: 'amount_mismatch', message: 'Tagihan Rp50000, notifikasi Rp1.' } });
    const res = await call('SUCCESS', 1);
    expect(res.status).toBe(200);
    expect(net.audit()[0]).toMatchObject({ outcome: 'amount_mismatch', error_message: 'Tagihan Rp50000, notifikasi Rp1.' });
    expect(net.alarms()).toHaveLength(1);
    expect(net.tickets()).toHaveLength(0);
  });

  it('alarm tersimpan yang diulang RPC tidak menutup baris alarm lama', async () => {
    const net = network({ rpc: { outcome: 'webinar_duplicate_paid', newly_paid: false, send_ticket: false } });
    await call();
    expect(net.autoResolved()).toBe(false);
  });

  it('notifikasi ulang untuk order refunded: ok, tanpa e-tiket', async () => {
    const net = network({ rpc: { outcome: 'ok', newly_paid: false, send_ticket: false } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(net.tickets()).toHaveLength(0);
  });

  it('RPC gagal: 500 supaya DOKU mengulang, write_failed tercatat, tanpa e-tiket', async () => {
    const net = network({ rpc: { message: 'boom' }, rpcStatus: 500 });
    const res = await call();
    expect(res.status).toBe(500);
    expect(net.audit()[0]).toMatchObject({ outcome: 'write_failed', http_status: 500 });
    expect(net.tickets()).toHaveLength(0);
  });

  it('RPC membalas bentuk asing: diperlakukan gagal, bukan sukses', async () => {
    const net = network({ rpc: null });
    const res = await call();
    expect(res.status).toBe(500);
    expect(net.audit()[0].outcome).toBe('write_failed');
  });
});

describe('webhook × webinar: gerbang autentikasi', () => {
  it('secret salah, enforcement env mati: tetap ditolak sebelum RPC, nol tulisan webinar', async () => {
    const net = network();
    const good = request();
    const res = await onRequest({
      request: new Request(good.url.replace(ENV.DOKU_WEBHOOK_SECRET, 'salah'), {
        method: 'POST', headers: good.headers, body: await good.text(),
      }),
      env: ENV,
      waitUntil: () => {},
    });
    expect(res.status).toBe(401);
    expect(net.of('/rpc/webinar_mark_paid')).toHaveLength(0);
    expect(net.of('/webinar_orders')).toHaveLength(0);
    expect(net.tickets()).toHaveLength(0);
    expect(net.audit()[0]).toMatchObject({ outcome: 'rejected_auth', http_status: 401 });
  });

  it('secret salah pada invoice iklan: perilaku lama tidak berubah', async () => {
    const net = network();
    const good = request('SUCCESS', 50000, 'JFU-INV-t-1');
    const res = await onRequest({
      request: new Request(good.url.replace(ENV.DOKU_WEBHOOK_SECRET, 'salah'), {
        method: 'POST', headers: good.headers, body: await good.text(),
      }),
      env: ENV,
      waitUntil: () => {},
    });
    expect(res.status).toBe(200);
    expect(net.audit()[0].outcome).not.toBe('rejected_auth');
  });
});

describe('webhook × webinar: bukan lunas', () => {
  it('FAILED: hanya baris pending yang menjadi expired', async () => {
    const net = network();
    const res = await call('FAILED');
    expect(res.status).toBe(200);
    const patches = net.of('/webinar_orders').filter((c) => c.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toContain('status=eq.pending');
    expect(patches[0].body).toEqual({ status: 'expired' });
    expect(net.of('/rpc/webinar_mark_paid')).toHaveLength(0);
    expect(net.tickets()).toHaveLength(0);
  });

  it('status lain: nol tulisan', async () => {
    const net = network();
    await call('PENDING');
    expect(net.of('/webinar_orders')).toHaveLength(0);
    expect(net.of('/rpc/webinar_mark_paid')).toHaveLength(0);
  });
});

describe('invoice bukan webinar', () => {
  it('tidak pernah masuk cabang webinar', async () => {
    const net = network();
    await call('SUCCESS', 50000, 'JFU-INV-t-1');
    expect(net.of('/rpc/webinar_mark_paid')).toHaveLength(0);
    expect(net.of('/webinar_orders')).toHaveLength(0);
  });
});

describe('deliverWebinarTicket', () => {
  const sb = { url: ENV.VITE_SUPABASE_URL, headers: {} };
  const sbFetch = async (url, init, label) => {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
    return res;
  };
  const deliver = () => deliverWebinarTicket({ env: ENV, sb, sbFetch, invoiceNumber: INVOICE });

  it('webhook dan Check Status bersamaan: hanya pemenang klaim yang mengirim', async () => {
    let free = true;
    const net = network({ claim: () => { if (free) { free = false; return [ORDER]; } return []; } });
    const results = await Promise.all([deliver(), deliver()]);
    expect(net.tickets()).toHaveLength(1);
    expect(results.filter((r) => r.sent)).toHaveLength(1);
  });

  it('klaim hanya untuk tiket live lunas yang belum terkirim, dan klaim basi bisa diambil alih', async () => {
    const net = network({ claim: () => [] });
    await deliver();
    const { url } = net.calls[0];
    expect(url).toContain('status=eq.paid');
    expect(url).toContain('kind=eq.live');
    expect(url).toContain('ticket_email_sent_at=is.null');
    expect(url).toContain('or=(ticket_email_claimed_at.is.null,ticket_email_claimed_at.lt.');
  });

  it('terkirim: sent_at dicatat', async () => {
    const net = network();
    expect(await deliver()).toEqual({ sent: true });
    const last = net.of('/webinar_orders').at(-1);
    expect(last.body.ticket_email_sent_at).toBeTruthy();
    expect(last.body.ticket_email_error).toBeNull();
  });

  it('provider menolak: klaim dilepas, galat dicatat, alarm ke admin, tidak melempar', async () => {
    const net = network({ mailOk: false });
    const result = await deliver();
    expect(result).toEqual({ sent: false, reason: 'failed' });
    const last = net.of('/webinar_orders').at(-1);
    expect(last.body.ticket_email_claimed_at).toBeNull();
    expect(last.body.ticket_email_error).toBeTruthy();
    expect(net.of('api.resend.com').at(-1).body.subject).toContain('e-tiket gagal terkirim');
  });

  it('klaim gagal karena database: tidak melempar dan tetap memberi alarm', async () => {
    global.fetch = vi.fn(async (url) => (String(url).includes('api.resend.com') ? json({ id: 'm' }) : json({}, 500)));
    await expect(deliver()).resolves.toEqual({ sent: false, reason: 'failed' });
    expect(global.fetch.mock.calls.some(([u]) => String(u).includes('api.resend.com'))).toBe(true);
  });
});

describe('isi e-tiket', () => {
  const email = () => buildTicketEmail({ order: ORDER, event: { ...EVENT, meeting_url: 'https://zoom.us/j/rahasia' } });

  it('memuat yang dibutuhkan pembeli, dengan jadwal WIB', () => {
    const { subject, html } = email();
    expect(subject).toBe('E-tiket: Riset Cepat');
    expect(html).toContain('A1B2C3D4E5');
    expect(html).toContain('/webinar/gabung/tok123');
    expect(html).toContain('19.00 WIB');
    expect(html).toContain('Dr. Sari, Dosen');
    expect(html).toContain('calendar.google.com');
    expect(html).toContain('budi@example.test');
    expect(html).toContain('product@jakpat.net');
  });

  it('tidak pernah menyebut pengembalian dana dan tidak membocorkan link Zoom', () => {
    const { html } = email();
    expect(html.toLowerCase()).not.toMatch(/refund|pengembalian dana|uang kembali/);
    expect(html).not.toContain('zoom.us');
  });

  it('isi dari database di-escape', () => {
    expect(email().html).toContain('Budi &lt;b&gt;');
    const { html } = buildTicketEmail({ order: ORDER, event: { ...EVENT, title: '<script>x</script>' } });
    expect(html).not.toContain('<script>');
  });

  it('kalender memakai jam UTC dan durasi acara', () => {
    const url = new URL(googleCalendarUrl({ title: 'A', startsAt: EVENT.starts_at, durationMinutes: 90, joinUrl: 'https://x.test/j' }));
    expect(url.searchParams.get('dates')).toBe('20261120T120000Z/20261120T133000Z');
  });
});
