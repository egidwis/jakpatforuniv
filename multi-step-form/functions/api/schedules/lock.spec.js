import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './lock.js';

// Handler SUNGGUHAN; jaringan dipalsukan per URL. Fokus: penjaga tutup
// reservasi mandiri (sql/125) — jalur ini menulis dengan service_role, jadi
// trigger DB tidak menjaganya; lock.js sendiri yang wajib menolak.

const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};
const USER = '11111111-1111-1111-1111-111111111111';
const ORDER = 'b7eb61ca-079a-4787-9787-be253b0a1111';

function network({ closed = false, cap = null, closuresStatus = 200 } = {}) {
  const patches = [];
  const reads = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: USER, email: 'peneliti@x.id' }), { status: 200 });
    }
    if (u.includes('/rest/v1/JFU_self_booking_closures')) {
      reads.push(u);
      if (closuresStatus !== 200) return new Response('{"message":"boom"}', { status: closuresStatus });
      return new Response(JSON.stringify(closed ? [{ closed_on: '2026-10-22' }] : []), { status: 200 });
    }
    if (u.includes('/rest/v1/form_submissions') && (init.method || 'GET') === 'GET') {
      reads.push(u);
      return new Response(JSON.stringify([{
        id: ORDER, auth_user_id: USER, email: 'peneliti@x.id', payment_status: 'pending',
        submission_status: 'approved', duration: 2, self_booking_closed_at: cap,
      }]), { status: 200 });
    }
    if (u.includes('/rest/v1/form_submissions') && init.method === 'PATCH') {
      patches.push(JSON.parse(init.body));
      return new Response(JSON.stringify([{ id: ORDER }]), { status: 200 });
    }
    return new Response('[]', { status: 404 });
  });
  return { patches, reads };
}

const call = () => onRequest({
  request: new Request('https://x.test/api/schedules/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: JSON.stringify({ submissionId: ORDER, startYmd: '2030-01-15', duration: 2 }),
  }),
  env: ENV,
});

afterEach(() => vi.restoreAllMocks());

describe('/api/schedules/lock — tutup reservasi mandiri (sql/125)', () => {
  it('saklar terbuka, order tanpa cap: tanggal dikunci seperti biasa', async () => {
    const net = network();
    const res = await call();
    expect(res.status).toBe(200);
    expect(net.patches).toHaveLength(1);
    expect(net.patches[0]).toMatchObject({ slot_booked_by: 'user', submission_status: 'waiting_payment' });
    expect(net.reads.some((u) => u.includes('self_booking_closed_at'))).toBe(true);
  });

  it('saklar tertutup: 409 self_booking_closed, nol tulisan', async () => {
    const net = network({ closed: true });
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('self_booking_closed');
    expect(net.patches).toHaveLength(0);
  });

  it('order bercap: 409 walau saklar terbuka', async () => {
    const net = network({ cap: '2026-10-22T03:00:00Z' });
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('self_booking_closed');
    expect(net.patches).toHaveLength(0);
  });

  it('status saklar gagal dibaca: kunci tetap jalan (gagal-terbuka, dicatat)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const net = network({ closuresStatus: 500 });
    const res = await call();
    expect(res.status).toBe(200);
    expect(net.patches).toHaveLength(1);
  });
});
