import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './holidays.js';

// Handler SUNGGUHAN dipanggil; jaringan dipalsukan per URL.
const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  ADMIN_EMAILS: 'product@jakpat.net',
};

function network(email = 'product@jakpat.net') {
  const writes = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ email }), { status: 200 });
    }
    if (u.includes('/rest/v1/JFU_operational_holidays')) {
      const body = JSON.parse(init.body);
      writes.push({ url: u, method: init.method, headers: init.headers, body });
      return new Response(JSON.stringify([body]), { status: 201 });
    }
    return new Response('[]', { status: 404 });
  });
  return { writes };
}

const call = (body, token = 'jwt') => onRequest({
  request: new Request('https://x.test/api/admin/holidays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }),
  env: ENV,
});

afterEach(() => vi.restoreAllMocks());

describe('/api/admin/holidays', () => {
  it('admin: satu upsert service_role dengan kunci konflik holiday_date', async () => {
    const { writes } = network();
    const res = await call({ date: '2026-12-25', isActive: true, label: 'Natal' });
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(1);
    const [w] = writes;
    expect(w.method).toBe('POST');
    expect(new URL(w.url).searchParams.get('on_conflict')).toBe('holiday_date');
    expect(w.headers.Authorization).toBe('Bearer service-role-key');
    expect(w.headers.Prefer).toContain('merge-duplicates');
    expect(w.body).toMatchObject({ holiday_date: '2026-12-25', label: 'Natal', is_active: true, updated_by: 'product@jakpat.net' });
    expect((await res.json()).data.holiday_date).toBe('2026-12-25');
  });

  it('menyalakan menulis label_en (tidak menyisakan terjemahan pesan lama)', async () => {
    const { writes } = network();
    await call({ date: '2026-12-24', isActive: true, label: 'Libur Natal' });
    expect(writes[0].body).toHaveProperty('label_en');
  });

  it('mematikan: label dan label_en TIDAK dikirim, supaya merge tidak mengosongkannya', async () => {
    const { writes } = network();
    const res = await call({ date: '2026-12-24', isActive: false });
    expect(res.status).toBe(200);
    expect(writes[0].body).toEqual(expect.objectContaining({ holiday_date: '2026-12-24', is_active: false }));
    expect(writes[0].body).not.toHaveProperty('label');
    expect(writes[0].body).not.toHaveProperty('label_en');
  });

  it('bukan admin: 401 dan nol tulisan', async () => {
    const { writes } = network('peneliti@kampus.ac.id');
    const res = await call({ date: '2026-12-25', isActive: true });
    expect(res.status).toBe(401);
    expect(writes).toHaveLength(0);
  });

  it('tanpa token: 401', async () => {
    const { writes } = network();
    const res = await call({ date: '2026-12-25', isActive: true }, null);
    expect(res.status).toBe(401);
    expect(writes).toHaveLength(0);
  });

  it('body tak valid: 400 sebelum menyentuh DB', async () => {
    const { writes } = network();
    const res = await call({ date: '2026-12-25', isActive: 'ya' });
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });
});
