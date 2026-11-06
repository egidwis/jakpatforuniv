import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './webhook.js';
import { deliverWebinarTicket } from './_webinar.js';
import { buildReplayEmail, buildTicketEmail, buildTicketReceipt, googleCalendarUrl } from './_webinar-ticket-email.js';
import { postgrestTable } from '../_fixtures/postgrestTable.js';

/*
  Handler SUNGGUHAN dipanggil dengan notifikasi yang lolos autentikasi; jaringan
  dipalsukan per URL. Isi webinar_mark_paid sendiri diuji dengan menjalankannya di
  PGlite; di sini yang dikunci adalah cara webhook bereaksi atas jawabannya.

  Tabel webinar_orders dijawab emulator PostgREST (`_fixtures/postgrestTable.js`),
  bukan mock yang selalu mengembalikan baris: mock seperti itu meloloskan klaim
  e-tiket yang di produksi selalu kosong (insiden 3 & 5 Nov 2026).
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
// Baris order lunas yang e-tiketnya belum terkirim, seperti sesudah webinar_mark_paid.
const PAID_ROW = {
  ...ORDER,
  status: 'paid',
  kind: 'live',
  auth_user_id: null,
  ticket_email_sent_at: null,
  ticket_email_claimed_at: null,
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

function network({ rpc = { outcome: 'ok', send_ticket: true }, rpcStatus = 200, row = PAID_ROW, mailOk = true } = {}) {
  const calls = [];
  const orders = postgrestTable(row ? [row] : []);
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, method, body, prefer: new Headers(init.headers || {}).get('Prefer') });

    if (u.endsWith('/rpc/webinar_mark_paid')) return json(rpc, rpcStatus);
    if (u.includes('/rest/v1/webinar_orders')) return orders.respond(u, init);
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
    orders,
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
  const T = Date.parse('2026-11-05T05:47:04.630Z');
  const MIN = 60_000;
  const iso = (ms) => new Date(ms).toISOString();
  const deliver = (at = T) => deliverWebinarTicket({ env: ENV, sb, sbFetch, invoiceNumber: INVOICE, now: () => new Date(at) });

  it('webhook dan Check Status bersamaan: hanya pemenang klaim yang mengirim', async () => {
    const net = network();
    const results = await Promise.all([deliver(T), deliver(T + 1)]);
    expect(results.filter((r) => r.sent)).toHaveLength(1);
    expect(results.filter((r) => r.reason === 'not_claimed')).toHaveLength(1);
    expect(net.tickets()).toHaveLength(1);
  });

  it('klaim: PATCH return=minimal bersyarat, lalu baca-balik bertoken (bukan balasan PATCH)', async () => {
    const net = network();
    await deliver();
    const [patch, readBack] = net.of('/webinar_orders');
    expect(patch.method).toBe('PATCH');
    expect(patch.prefer).toBe('return=minimal');
    expect(patch.url).toContain('status=eq.paid');
    // Fase 5B: tiket live dan Video kelas sama-sama dikirimi email pembelian.
    expect(patch.url).not.toContain('kind=');
    expect(patch.url).toContain('ticket_email_sent_at=is.null');
    expect(patch.url).toContain('or=(ticket_email_claimed_at.is.null,ticket_email_claimed_at.lt.');
    expect(patch.body.ticket_email_claimed_at).toMatch(/\.\d{6}Z$/);
    expect(readBack.method).toBe('GET');
    expect(readBack.url).toContain(`ticket_email_claimed_at=eq.${encodeURIComponent(patch.body.ticket_email_claimed_at)}`);
  });

  it.each([
    ['order belum lunas', { status: 'pending' }, false],
    ['e-tiket sudah terkirim', { ticket_email_sent_at: '2026-11-05T05:00:00.000Z' }, false],
    ['klaim 5 menit lalu masih dipegang', { ticket_email_claimed_at: iso(T - 5 * MIN) }, false],
    ['klaim 11 menit lalu basi dan diambil alih', { ticket_email_claimed_at: iso(T - 11 * MIN) }, true],
  ])('%s', async (_name, over, sends) => {
    const net = network({ row: { ...PAID_ROW, ...over } });
    const result = await deliver();
    expect(result.sent).toBe(sends);
    expect(net.tickets()).toHaveLength(sends ? 1 : 0);
  });

  it('Video kelas: dikirim dengan templat "Rekamanmu siap", bukan e-tiket (Fase 5B)', async () => {
    const net = network({ row: { ...PAID_ROW, kind: 'replay' } });
    expect((await deliver()).sent).toBe(true);
    expect(net.tickets()).toHaveLength(0);
    expect(net.of('api.resend.com').map((c) => c.body.subject)).toEqual(['Rekamanmu siap: Riset Cepat']);
  });

  it('terkirim: sent_at dicatat di baris', async () => {
    const net = network();
    expect(await deliver()).toEqual({ sent: true });
    const [row] = net.orders.rows;
    expect(row.ticket_email_sent_at).toBeTruthy();
    expect(row.ticket_email_error).toBeNull();
  });

  it('provider menolak: klaim sendiri dilepas, galat dicatat, alarm ke admin, tidak melempar', async () => {
    const net = network({ mailOk: false });
    const result = await deliver();
    expect(result).toEqual({ sent: false, reason: 'failed', error: expect.stringContaining('resend') });
    expect(net.of('/webinar_orders').at(-1).url).toContain('ticket_email_claimed_at=eq.');
    const [row] = net.orders.rows;
    expect(row.ticket_email_claimed_at).toBeNull();
    expect(row.ticket_email_error).toBeTruthy();
    expect(net.of('api.resend.com').at(-1).body.subject).toContain('e-tiket gagal terkirim');
  });

  describe('kirim ulang dari admin (resend)', () => {
    const SENT_ROW = { ...PAID_ROW, ticket_email_sent_at: '2026-11-05T05:00:00.000Z', ticket_email_claimed_at: null };
    const resend = (at = T) => deliverWebinarTicket({ env: ENV, sb, sbFetch, invoiceNumber: INVOICE, now: () => new Date(at), resend: true });

    it('mengirim lagi walau e-tiket sudah pernah terkirim', async () => {
      const net = network({ row: SENT_ROW });
      expect((await resend()).sent).toBe(true);
      expect(net.tickets()).toHaveLength(1);
      expect(net.of('/webinar_orders')[0].url).not.toContain('ticket_email_sent_at=is.null');
    });

    it('klik ganda: dua resend bersamaan hanya satu email', async () => {
      const net = network({ row: SENT_ROW });
      const results = await Promise.all([resend(T), resend(T + 1)]);
      expect(results.filter((r) => r.sent)).toHaveLength(1);
      expect(net.tickets()).toHaveLength(1);
    });

    it('sesudah terkirim, klaim dilepas sehingga resend berikutnya langsung bisa', async () => {
      const net = network({ row: SENT_ROW });
      await resend(T);
      expect(net.orders.rows[0].ticket_email_claimed_at).toBeNull();
      expect((await resend(T + 1000)).sent).toBe(true);
      expect(net.tickets()).toHaveLength(2);
    });

    it.each([
      ['order belum lunas', { status: 'pending' }],
      ['tiket refund', { status: 'refunded' }],
    ])('%s: tidak dikirim', async (_n, over) => {
      const net = network({ row: { ...SENT_ROW, ...over } });
      expect((await resend()).sent).toBe(false);
      expect(net.tickets()).toHaveLength(0);
    });

    it('Video kelas: bukti pembelian dikirim ulang dengan templatnya sendiri', async () => {
      const net = network({ row: { ...SENT_ROW, kind: 'replay' } });
      expect((await resend()).sent).toBe(true);
      expect(net.of('api.resend.com').map((c) => c.body.subject)).toEqual(['Rekamanmu siap: Riset Cepat']);
    });

    it('jalur biasa tetap tidak mengirim ulang tiket yang sudah terkirim', async () => {
      const net = network({ row: SENT_ROW });
      expect((await deliver()).sent).toBe(false);
      expect(net.tickets()).toHaveLength(0);
    });
  });

  it('klaim gagal karena database: tidak melempar dan tetap memberi alarm', async () => {
    global.fetch = vi.fn(async (url) => (String(url).includes('api.resend.com') ? json({ id: 'm' }) : json({}, 500)));
    await expect(deliver()).resolves.toMatchObject({ sent: false, reason: 'failed' });
    expect(global.fetch.mock.calls.some(([u]) => String(u).includes('api.resend.com'))).toBe(true);
  });
});

describe('kwitansi e-tiket', () => {
  const receiptOrder = { ...ORDER, amount: 1110, subtotal: 1000, ppn_amount: 110, payment_channel: 'QRIS_DOKU', paid_at: '2026-11-03T02:00:00Z' };
  const pdfText = (content) => atob(content);

  it('uji Rp 1.110: Subtotal 1.000, PPN 110, label webinar', () => {
    const receipt = buildTicketReceipt({ order: receiptOrder, event: EVENT });
    expect(receipt.filename).toBe('Kwitansi-ABCDEF12.pdf');
    const text = pdfText(receipt.content);
    expect(text).toContain('%PDF');
    expect(text).toContain('Jadwal Acara');
    expect(text).not.toContain('Jadwal Tayang');
    expect(text).toMatch(/Rp\s?1\.000/);
    expect(text).toMatch(/Rp\s?110/);
    expect(text).toMatch(/Rp\s?1\.110/);
  });

  it('PDF gagal: tiket tetap terkirim, tanpa lampiran', async () => {
    const bad = buildTicketReceipt({ order: receiptOrder, event: { ...EVENT, title: Symbol('x') } });
    expect(bad).toBeNull();
  });

  it('e-tiket membawa lampiran kwitansi', async () => {
    const net = network({ row: { ...PAID_ROW, ...receiptOrder } });
    await call();
    expect(net.tickets()[0].attachments[0].filename).toBe('Kwitansi-ABCDEF12.pdf');
  });
});

describe('isi e-tiket', () => {
  const email = (accountEmail = 'budi@example.test') => buildTicketEmail({ order: ORDER, event: { ...EVENT, meeting_url: 'https://zoom.us/j/rahasia' }, accountEmail });

  it('kalimat akun memakai email akun pemilik, bukan email kontak khusus', () => {
    const custom = buildTicketEmail({ order: { ...ORDER, buyer_email: 'lain@kontak.test' }, event: EVENT, accountEmail: 'akun@login.test' });
    expect(custom.html).toContain('Masuk dengan akun <strong>akun@login.test</strong>');
    expect(email(null).html).toContain('Masuk dengan akun yang kamu pakai saat membeli');
  });

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

describe('Video kelas (Fase 5B): email pembelian "Rekamanmu siap"', () => {
  const REPLAY_ROW = {
    ...PAID_ROW, kind: 'replay', amount: 1110, subtotal: 1000, ppn_amount: 110,
    payment_channel: 'QRIS_DOKU', paid_at: '2026-11-21T03:00:00Z',
  };
  const replayOrder = { ...ORDER, kind: 'replay' };

  it('webhook: pembeli video menerima "Rekamanmu siap" + kwitansi (bukan e-tiket), lalu sent_at dicatat', async () => {
    const net = network({ row: REPLAY_ROW });
    await call();
    const mails = net.of('api.resend.com').map((c) => c.body);
    expect(mails.map((m) => m.subject)).toEqual(['Rekamanmu siap: Riset Cepat']);
    expect(mails[0].attachments[0].filename).toBe('Kwitansi-ABCDEF12.pdf');
    expect(net.orders.rows[0].ticket_email_sent_at).toBeTruthy();
  });

  it('isi: link tonton per order dan akun pemilik; tanpa link gabung, kalender, URL rekaman, atau kata refund', () => {
    const { subject, html } = buildReplayEmail({
      order: replayOrder, event: { ...EVENT, recording_minutes: 88 }, accountEmail: 'akun@login.test',
    });
    expect(subject).toBe('Rekamanmu siap: Riset Cepat');
    expect(html).toContain('https://submit.jakpatforuniv.com/dashboard/webinar/tonton/order-1');
    expect(html).toContain('88 menit');
    expect(html).toContain('Masuk dengan akun <strong>akun@login.test</strong>');
    expect(html).toContain('penggunaan pribadi');
    expect(html).toContain('product@jakpat.net');
    expect(html).not.toContain('/webinar/gabung/');
    expect(html).not.toContain('calendar.google.com');
    expect(html).not.toContain('r2.cloudflarestorage.com');
    expect(html.toLowerCase()).not.toMatch(/refund|pengembalian dana|uang kembali/);
  });

  it('isi dari database di-escape', () => {
    const { html } = buildReplayEmail({ order: replayOrder, event: { ...EVENT, title: '<script>x</script>' } });
    expect(html).not.toContain('<script>');
    expect(html).toContain('Budi &lt;b&gt;');
    expect(html).toContain('Masuk dengan akun yang kamu pakai saat membeli');
  });

  it('kwitansi: "Video kelas: …" dengan tanggal beli; tanpa tanggal acara tidak tercetak 1970', () => {
    const receipt = buildTicketReceipt({ order: { ...ORDER, ...REPLAY_ROW }, event: { ...EVENT, starts_at: null } });
    const text = atob(receipt.content);
    expect(text).toContain('Video kelas: Riset Cepat');
    expect(text).toContain('Tanggal Beli');
    expect(text).not.toContain('Jadwal Acara');
    expect(text).toContain('21 Nov 2026');
    expect(text).not.toContain('1970');
  });

  it('kwitansi tiket live tanpa tanggal acara juga tidak tercetak 1970', () => {
    const receipt = buildTicketReceipt({
      order: { ...ORDER, amount: 1110, subtotal: 1000, ppn_amount: 110, paid_at: '2026-11-03T02:00:00Z' },
      event: { ...EVENT, starts_at: null },
    });
    expect(atob(receipt.content)).not.toContain('1970');
  });
});
