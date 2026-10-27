import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './content.js';
import { validateAdminContent } from './contentGate.js';

/*
  Siaran Kilat lewat /api/admin/content (sql/130). Handler SUNGGUHAN
  dipanggil; jaringan dipalsukan per URL. Aturan siaran sendiri (tenggang,
  nyala lagi, gelombang berikutnya) diuji di PGlite untuk sql/130.
*/

const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  ADMIN_EMAILS: 'product@jakpat.net',
};
const SID = 'b7eb61ca-079a-4787-9787-be253b0a1111';

function network({ email = 'product@jakpat.net', rpcStatus = 200, rpcBody = { broadcast_at: 'T', pages: 1 } } = {}) {
  const rpcs = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ email }), { status: 200 });
    if (u.includes('/rest/v1/rpc/')) {
      rpcs.push({ fn: u.split('/rpc/')[1], body: JSON.parse(init.body), auth: init.headers.Authorization });
      return new Response(JSON.stringify(rpcBody), { status: rpcStatus });
    }
    return new Response('[]', { status: 404 });
  });
  return { rpcs };
}

const call = (body) => onRequest({
  request: new Request('https://x.test/api/admin/content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: JSON.stringify(body),
  }),
  env: ENV,
});

afterEach(() => vi.restoreAllMocks());

describe('broadcast-* → RPC sql/130', () => {
  it('matikan: kilat_broadcast_end dengan email admin dari JWT, bukan dari body', async () => {
    const { rpcs } = network();
    const res = await call({ action: 'broadcast-end', scheduleId: SID, by: 'palsu' });
    expect(res.status).toBe(200);
    expect(rpcs).toEqual([{ fn: 'kilat_broadcast_end', body: { p_schedule_id: SID, p_by: 'product@jakpat.net' }, auth: 'Bearer service-role-key' }]);
    expect((await res.json()).data.pages).toBe(1);
  });

  it('nyala lagi memanggil kilat_broadcast_reopen dengan email admin', async () => {
    const { rpcs } = network();
    await call({ action: 'broadcast-reopen', scheduleId: SID });
    expect(rpcs).toEqual([{ fn: 'kilat_broadcast_reopen', body: { p_schedule_id: SID, p_by: 'product@jakpat.net' }, auth: 'Bearer service-role-key' }]);
  });

  it('nyala manual & batal dicabut: 400, nol RPC', async () => {
    const { rpcs } = network();
    expect((await call({ action: 'broadcast-start', scheduleId: SID })).status).toBe(400);
    expect((await call({ action: 'broadcast-undo', scheduleId: SID })).status).toBe(400);
    expect(rpcs).toHaveLength(0);
  });

  it('galat RPC dibawa beserta HINT-nya', async () => {
    network({ rpcStatus: 400, rpcBody: { message: 'Masa tenggang 60 menit sudah lewat; siaran gelombang ini terkunci.', hint: 'broadcast_finished' } });
    const res = await call({ action: 'broadcast-reopen', scheduleId: SID });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Masa tenggang 60 menit sudah lewat; siaran gelombang ini terkunci.', hint: 'broadcast_finished' });
  });

  it('bukan admin: 401, nol RPC', async () => {
    const { rpcs } = network({ email: 'peneliti@kampus.ac.id' });
    expect((await call({ action: 'broadcast-end', scheduleId: SID })).status).toBe(401);
    expect(rpcs).toHaveLength(0);
  });

  it('gerbang menolak id yang bukan uuid', () => {
    expect(validateAdminContent({ action: 'broadcast-reopen', scheduleId: 'semua' })).toMatch(/Jadwal/);
    expect(validateAdminContent({ action: 'broadcast-end', scheduleId: [SID] })).toMatch(/Jadwal/);
    expect(validateAdminContent({ action: 'broadcast-reopen', scheduleId: SID })).toBeNull();
  });
});
