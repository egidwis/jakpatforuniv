import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './schedule.js';

// Handler SUNGGUHAN dipanggil; jaringan dipalsukan per URL.
const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  ADMIN_EMAILS: 'product@jakpat.net',
};
const ID = 'e0e7ae16-6f70-4370-9380-bb12ae0808fa';

function network(row) {
  const reads = [];
  const writes = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ email: 'product@jakpat.net' }), { status: 200 });
    if (u.includes('/rest/v1/form_submissions') && (init.method || 'GET') === 'GET') {
      reads.push(u);
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    if (u.includes('/rest/v1/form_submissions') && init.method === 'PATCH') {
      const body = JSON.parse(init.body);
      writes.push({ url: u, headers: init.headers, body });
      return new Response(JSON.stringify([{ id: ID, ...body }]), { status: 200 });
    }
    return new Response('[]', { status: 404 });
  });
  return { reads, writes };
}

const call = (body) => onRequest({
  request: new Request('https://x.test/api/admin/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: JSON.stringify(body),
  }),
  env: ENV,
});

const BODY = { action: 'kilat', submissionId: ID, ymd: '2026-11-02', endYmd: '2026-11-03', hour: 11 };

afterEach(() => vi.restoreAllMocks());

describe('/api/admin/schedule aksi kilat', () => {
  it('order Kilat yang jadwalnya pernah batal: payment_status expired → pending (kartu jadi "Buat Tagihan")', async () => {
    const net = network({ payment_status: 'expired', submission_status: 'slot_cancelled' });
    const res = await call(BODY);
    expect(res.status).toBe(200);
    expect(net.reads[0]).toContain('select=payment_status,submission_status');
    expect(net.writes).toHaveLength(1);
    expect(net.writes[0].headers.Authorization).toBe('Bearer service-role-key');
    expect(net.writes[0].body).toMatchObject({
      start_date: '2026-11-02', end_date: '2026-11-03', kilat_slot_hour: 11,
      slot_booked_by: 'admin', submission_status: 'slot_reserved', payment_status: 'pending',
    });
  });

  it('order yang sudah lunas: status tidak disentuh', async () => {
    const net = network({ payment_status: 'paid', submission_status: 'paid' });
    const res = await call(BODY);
    expect(res.status).toBe(200);
    expect(net.writes[0].body).not.toHaveProperty('submission_status');
    expect(net.writes[0].body).not.toHaveProperty('payment_status');
  });
});
