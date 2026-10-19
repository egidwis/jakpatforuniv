import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './distribution.js';
import { validateConvertWrite } from './distributionGate.js';
import { calculatePpn } from '../../../src/utils/cost-calculator';

// Handler SUNGGUHAN dipanggil; jaringan dipalsukan per URL.
const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  ADMIN_EMAILS: 'product@jakpat.net',
};
const ID = 'b7eb61ca-079a-4787-9787-be253b0a1111';
const OK = { action: 'convert-release', submissionId: ID, target: 'kilat', subtotal: 850_000, ppnAmount: 93_500, totalCost: 943_500 };

function network({ email = 'product@jakpat.net', rows = [{ id: ID }] } = {}) {
  const writes = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ email }), { status: 200 });
    if (u.includes('/rest/v1/form_submissions')) {
      writes.push({ url: new URL(u), method: init.method, headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    return new Response('[]', { status: 404 });
  });
  return { writes };
}

const call = (body, token = 'jwt') => onRequest({
  request: new Request('https://x.test/api/admin/distribution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }),
  env: ENV,
});

afterEach(() => vi.restoreAllMocks());

describe('/api/admin/distribution', () => {
  it('admin: satu PATCH service_role, bentuk tulisan dikunci server', async () => {
    const { writes } = network();
    const res = await call({ ...OK, start_date: '2026-10-20', payment_status: 'paid' });
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(1);
    const [w] = writes;
    expect(w.method).toBe('PATCH');
    expect(w.headers.Authorization).toBe('Bearer service-role-key');
    expect(w.body).toEqual({
      distribution_type: 'kilat', total_cost: 943_500, subtotal: 850_000, ppn_amount: 93_500,
      start_date: null, end_date: null, kilat_slot_hour: null, slot_booked_by: null, slot_reserved_at: null,
      submission_status: 'approved', updated_at: expect.any(String),
    });
    // Kolom tambahan dari browser tidak pernah ikut.
    expect(w.body).not.toHaveProperty('payment_status');
  });

  it('syarat guard_payment_columns ditegakkan ulang di filter PATCH', async () => {
    const { writes } = network();
    await call(OK);
    const q = writes[0].url.searchParams;
    expect(q.get('id')).toBe(`eq.${ID}`);
    expect(q.get('submission_status')).toBe('in.(slot_reserved,waiting_payment)');
    expect(q.get('or')).toBe('(payment_status.is.null,payment_status.not.in.(paid,completed))');
  });

  it('nol baris cocok (sudah lunas / status berubah): 409', async () => {
    network({ rows: [] });
    const res = await call(OK);
    expect(res.status).toBe(409);
  });

  it('bukan admin: 401 dan nol tulisan', async () => {
    const { writes } = network({ email: 'peneliti@kampus.ac.id' });
    expect((await call(OK)).status).toBe(401);
    expect(writes).toHaveLength(0);
  });

  it('tanpa token: 401', async () => {
    const { writes } = network();
    expect((await call(OK, null)).status).toBe(401);
    expect(writes).toHaveLength(0);
  });

  it.each([
    ['tindakan lain', { action: 'decision' }],
    ['id bukan UUID', { submissionId: 'abc' }],
    ['jalur asing', { target: 'premium' }],
    ['harga negatif', { subtotal: -1 }],
    ['harga pecahan', { subtotal: 850_000.5 }],
    ['PPN tak cocok', { ppnAmount: 1 }],
    ['total tak cocok', { totalCost: 1 }],
  ])('body tak valid (%s): 400 sebelum menyentuh DB', async (_, over) => {
    const { writes } = network();
    expect((await call({ ...OK, ...over })).status).toBe(400);
    expect(writes).toHaveLength(0);
  });
});

describe('validateConvertWrite — PPN = calculatePpn klien', () => {
  it.each([0, 1, 5, 99_999, 375_000, 1_234_567])('subtotal %i', (subtotal) => {
    const ppnAmount = calculatePpn(subtotal);
    expect(validateConvertWrite({ ...OK, subtotal, ppnAmount, totalCost: subtotal + ppnAmount })).toBeNull();
  });
});
