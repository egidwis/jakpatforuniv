import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildKilatPaidAlert, sendKilatPaidAlert } from './_kilat-paid-alert.js';

/*
  Email ke admin saat gelombang Kilat LUNAS (keputusan 26 Okt 2026, sebelum
  Push B). Tanpa ini satu-satunya tanda adalah badge — siaran terlewat bila
  dashboard tidak dibuka. Jalur ini fail-safe: tidak boleh mengganggu webhook.
*/

const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  ADMIN_EMAILS: 'product@jakpat.net',
  RESEND_API_KEY: 'resend-key',
};
const SUB = {
  id: '3a432277-0000-4000-8000-000000000000',
  title: 'Survei Kopi',
  email: 'peneliti@kampus.ac.id',
  distribution_type: 'kilat',
  kilat_slot_hour: 15,
  start_date: '2026-10-27',
};

function network({ tx = [{ form_submission_id: SUB.id, extend_id: null, form_submissions: SUB }], inv = [], sched = [{ source_id: SUB.id, distribution_type: 'kilat', kilat_slot_hour: 15, start_date: '2026-10-27T08:00:00+00:00' }] } = {}) {
  const mails = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.includes('/rest/v1/transactions')) return new Response(JSON.stringify(tx), { status: 200 });
    if (u.includes('/rest/v1/invoices')) return new Response(JSON.stringify(inv), { status: 200 });
    if (u.includes('/rest/v1/ad_schedules')) return new Response(JSON.stringify(sched), { status: 200 });
    if (u.includes('api.resend.com')) {
      mails.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: 'm1' }), { status: 200 });
    }
    return new Response('[]', { status: 404 });
  });
  return { mails };
}

afterEach(() => vi.restoreAllMocks());

describe('buildKilatPaidAlert', () => {
  it('subjek & isi menyebut gelombang WIB, judul, order, dan langkah siaran', () => {
    const m = buildKilatPaidAlert({
      invoiceNumber: 'JFU-3a432277-1',
      amount: 1110,
      waves: [{ orderId: SUB.id, title: 'Survei <Kopi>', researcher: SUB.email, ymd: '2026-10-27', hour: 15 }],
    });
    expect(m.subject).toBe('Kilat lunas — Gelombang 15.00 WIB, 27 Okt 2026 (#3a432277)');
    expect(m.html).toContain('Survei &lt;Kopi&gt;');
    expect(m.html).toContain('#3a432277');
    expect(m.html).toContain('Rp 1.110');
    expect(m.html).toContain('toggle siaran');
    expect(m.html).toContain('/internal-dash');
  });
});

describe('sendKilatPaidAlert', () => {
  it('jadwal Kilat lunas → satu email ke ADMIN_EMAILS', async () => {
    const net = network();
    const res = await sendKilatPaidAlert(ENV, { invoiceNumber: 'JFU-3a432277-1', amount: 1110 });
    expect(res.ok).toBe(true);
    expect(net.mails).toHaveLength(1);
    expect(net.mails[0].to).toEqual(['product@jakpat.net']);
    expect(net.mails[0].subject).toContain('Gelombang 15.00 WIB, 27 Okt 2026');
  });

  it('jam gelombang dibaca dari tanggal WIB jadwal, bukan jam UTC', async () => {
    // Gelombang 11.00 WIB = 04:00Z; tanggalnya tetap 2 Nov.
    const net = network({ sched: [{ source_id: SUB.id, distribution_type: 'kilat', kilat_slot_hour: 11, start_date: '2026-11-02T04:00:00+00:00' }] });
    await sendKilatPaidAlert(ENV, { invoiceNumber: 'JFU-x', amount: 1 });
    expect(net.mails[0].subject).toContain('Gelombang 11.00 WIB, 2 Nov 2026');
  });

  it('tagihan Iklan → tidak ada email', async () => {
    const net = network({
      tx: [{ form_submission_id: SUB.id, extend_id: null, form_submissions: { ...SUB, distribution_type: 'regular' } }],
      sched: [{ source_id: SUB.id, distribution_type: 'regular', kilat_slot_hour: null, start_date: '2026-10-27T08:00:00+00:00' }],
    });
    const res = await sendKilatPaidAlert(ENV, { invoiceNumber: 'JFU-x', amount: 1 });
    expect(res).toMatchObject({ ok: true, skipped: true });
    expect(net.mails).toHaveLength(0);
  });

  it('gelombang tambahan (extend) dikenali lewat extend_id', async () => {
    const ext = '9e9e9e9e-0000-4000-8000-000000000000';
    const net = network({
      tx: [{ form_submission_id: SUB.id, extend_id: ext, form_submissions: SUB }],
      sched: [{ source_id: ext, distribution_type: 'kilat', kilat_slot_hour: 11, start_date: '2026-10-28T04:00:00+00:00' }],
    });
    await sendKilatPaidAlert(ENV, { invoiceNumber: 'JFU-INV-x', amount: 1 });
    expect(net.mails[0].subject).toContain('Gelombang 11.00 WIB, 28 Okt 2026');
  });

  it('fallback ke invoices bila transaksi tak ada', async () => {
    const net = network({ tx: [], inv: [{ form_submission_id: SUB.id, extend_id: null, form_submissions: SUB }] });
    await sendKilatPaidAlert(ENV, { invoiceNumber: 'JFU-INV-y', amount: 1 });
    expect(net.mails).toHaveLength(1);
  });

  it('tidak pernah melempar (Supabase mati)', async () => {
    global.fetch = vi.fn(async () => { throw new Error('down'); });
    await expect(sendKilatPaidAlert(ENV, { invoiceNumber: 'JFU-x', amount: 1 })).resolves.toMatchObject({ ok: false });
  });
});
