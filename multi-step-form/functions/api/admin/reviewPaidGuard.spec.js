import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './review.js';

// Handler SUNGGUHAN dipanggil; jaringan dipalsukan per tabel.
const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  ADMIN_EMAILS: 'product@jakpat.net',
};
const ID = '8d12272b-0000-4000-8000-000000000001';

function network({ order = { payment_status: 'pending', submission_status: 'in_review' }, tx = [], inv = [], sched = [], failOn = null } = {}) {
  const reads = [];
  const writes = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = init.method || 'GET';
    if (u.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ email: 'product@jakpat.net' }), { status: 200 });
    if (failOn && u.includes(`/rest/v1/${failOn}`)) return new Response('{"message":"boom"}', { status: 500 });
    if (method === 'GET') {
      reads.push(u);
      if (u.includes('/rest/v1/form_submissions')) return new Response(JSON.stringify(order ? [order] : []), { status: 200 });
      if (u.includes('/rest/v1/transactions')) return new Response(JSON.stringify(tx), { status: 200 });
      if (u.includes('/rest/v1/invoices')) return new Response(JSON.stringify(inv), { status: 200 });
      if (u.includes('/rest/v1/ad_schedules')) return new Response(JSON.stringify(sched), { status: 200 });
    }
    if (method === 'PATCH' && u.includes('/rest/v1/form_submissions')) {
      const body = JSON.parse(init.body);
      writes.push({ url: u, body });
      return new Response(JSON.stringify([{ id: ID, ...body }]), { status: 200 });
    }
    return new Response('[]', { status: 404 });
  });
  return { reads, writes };
}

const call = (status) => onRequest({
  request: new Request('https://x.test/api/admin/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: JSON.stringify({ action: 'decision', submissionId: ID, status }),
  }),
  env: ENV,
});

afterEach(() => vi.restoreAllMocks());

describe('/api/admin/review — order berpembayaran lunas tidak bisa diakhiri (belum ada refund)', () => {
  it('order belum bayar: Batalkan Pesanan tetap jalan', async () => {
    const net = network();
    const res = await call('cancelled');
    expect(res.status).toBe(200);
    expect(net.writes).toHaveLength(1);
    expect(net.writes[0].body.submission_status).toBe('cancelled');
  });

  it.each([
    ['payment_status order lunas', { order: { payment_status: 'paid', submission_status: 'approved' } }],
    ['transaksi lunas', { tx: [{ id: 't1' }] }],
    ['invoice lunas', { inv: [{ id: 'i1' }] }],
    ['jadwal ke-2 lunas', { sched: [{ id: 's2' }] }],
    ['order sudah tayang / tempo', { order: { payment_status: 'pending', submission_status: 'scheduled' } }],
  ])('%s → 409, nol tulisan', async (_label, state) => {
    const net = network(state);
    const res = await call('cancelled');
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/lunas|tayang/i);
    expect(net.writes).toHaveLength(0);
  });

  it.each(['spam', 'rejected'])('status akhir lain (%s) dijaga sama', async (status) => {
    const net = network({ tx: [{ id: 't1' }] });
    const res = await call(status);
    expect(res.status).toBe(409);
    expect(net.writes).toHaveLength(0);
  });

  it('pemeriksaan gagal dibaca → ditolak (gagal tertutup), nol tulisan', async () => {
    const net = network({ failOn: 'invoices' });
    const res = await call('cancelled');
    expect(res.status).toBe(400);
    expect(net.writes).toHaveLength(0);
  });

  it('kueri uang memakai status lunas yang sama dengan door_cancel_order (sql/128)', async () => {
    const net = network();
    await call('cancelled');
    expect(net.reads.find((u) => u.includes('/transactions'))).toContain('status=in.(paid,completed,settled)');
    expect(net.reads.find((u) => u.includes('/invoices'))).toContain('status=in.(paid,completed,settled)');
    expect(net.reads.find((u) => u.includes('/ad_schedules'))).toContain('payment_status=in.(paid,completed)');
  });

  it('Approve tidak diperiksa — bukan keputusan akhir', async () => {
    const net = network({ tx: [{ id: 't1' }] });
    const res = await call('approved');
    expect(res.status).toBe(200);
    expect(net.reads).toHaveLength(0);
  });
});
