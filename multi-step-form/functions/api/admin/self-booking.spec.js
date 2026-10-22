import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './self-booking.js';

// Handler SUNGGUHAN dipanggil; jaringan dipalsukan per URL.
const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  ADMIN_EMAILS: 'product@jakpat.net',
  OPENROUTER_API_KEY: 'or-key',
};

function network(email = 'product@jakpat.net', { translation = { status: 200, text: 'Adjusting schedules.' }, write = { status: 201 } } = {}) {
  const writes = [];
  const translations = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ email }), { status: 200 });
    }
    if (u.startsWith('https://openrouter.ai/')) {
      translations.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: translation.text } }] }), { status: translation.status });
    }
    if (u.includes('/rest/v1/JFU_self_booking_closures')) {
      const body = JSON.parse(init.body);
      writes.push({ url: u, method: init.method, headers: init.headers, body });
      if (write.status >= 400) return new Response(JSON.stringify({ message: 'boom' }), { status: write.status });
      return new Response(JSON.stringify([body]), { status: write.status });
    }
    return new Response('[]', { status: 404 });
  });
  return { writes, translations };
}

const call = (body, token = 'jwt') => onRequest({
  request: new Request('https://x.test/api/admin/self-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }),
  env: ENV,
});

afterEach(() => vi.restoreAllMocks());

describe('/api/admin/self-booking (sql/125)', () => {
  it('menutup: upsert service-role ke "JFU_self_booking_closures" dengan label + terjemahan', async () => {
    const net = network();
    const res = await call({ date: '2026-10-22', isActive: true, label: ' Penyesuaian jadwal ' });
    expect(res.status).toBe(200);
    expect(net.writes).toHaveLength(1);
    const w = net.writes[0];
    expect(w.url).toContain('/rest/v1/JFU_self_booking_closures?on_conflict=closed_on');
    expect(w.method).toBe('POST');
    expect(w.headers.Authorization).toBe('Bearer service-role-key');
    expect(w.headers.Prefer).toContain('resolution=merge-duplicates');
    expect(w.body).toMatchObject({
      closed_on: '2026-10-22', is_active: true, label: 'Penyesuaian jadwal',
      label_en: 'Adjusting schedules.', updated_by: 'product@jakpat.net',
    });
    expect(net.translations[0].messages[1].content).toBe('Penyesuaian jadwal');
    expect((await res.json()).data.closed_on).toBe('2026-10-22');
  });

  it('membuka: hanya is_active=false, tanpa label & tanpa memanggil penerjemah', async () => {
    const net = network();
    const res = await call({ date: '2026-10-22', isActive: false });
    expect(res.status).toBe(200);
    expect(net.translations).toHaveLength(0);
    expect(net.writes[0].body).toEqual(expect.objectContaining({ closed_on: '2026-10-22', is_active: false }));
    expect('label' in net.writes[0].body).toBe(false);
    expect('label_en' in net.writes[0].body).toBe(false);
  });

  it('terjemahan gagal: saklar TETAP tertutup, label_en kosong', async () => {
    const net = network('product@jakpat.net', { translation: { status: 500, text: '' } });
    const res = await call({ date: '2026-10-22', isActive: true, label: 'Penyesuaian' });
    expect(res.status).toBe(200);
    expect(net.writes[0].body.label_en).toBe('');
  });

  it('bukan admin atau tanpa token: 401, nol tulisan', async () => {
    const net = network('peneliti@x.id');
    expect((await call({ date: '2026-10-22', isActive: true })).status).toBe(401);
    expect((await call({ date: '2026-10-22', isActive: true }, '')).status).toBe(401);
    expect(net.writes).toHaveLength(0);
  });

  it('body salah: 400, nol tulisan', async () => {
    const net = network();
    const res = await call({ date: 'besok', isActive: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Tanggal tidak valid');
    expect(net.writes).toHaveLength(0);
  });

  it('PostgREST menolak: 400 dengan pesannya', async () => {
    network('product@jakpat.net', { write: { status: 409 } });
    const res = await call({ date: '2026-10-22', isActive: false });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('boom');
  });
});
