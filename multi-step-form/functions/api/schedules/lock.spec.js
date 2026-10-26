import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './lock.js';

// Handler SUNGGUHAN; jaringan dipalsukan per URL. Yang diuji: tulisan mana
// yang keluar, dengan kunci apa, dan identitas siapa.
const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};
const ME = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const SUB = 'b7eb61ca-079a-4787-9787-be253b0a1111';
const SRC = 'c8fc72db-18ab-4898-8898-cf364c1b2222';

function network({ row = {}, rpc = { status: 200, body: SUB }, patch = { status: 200, body: [{ id: SUB }] } } = {}) {
  const writes = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: ME, email: 'Peneliti@Example.com' }), { status: 200 });
    }
    if (u.includes('/rest/v1/rpc/')) {
      writes.push({ kind: 'rpc', fn: u.split('/rpc/')[1], body: JSON.parse(init.body), headers: init.headers });
      return new Response(JSON.stringify(rpc.body), { status: rpc.status });
    }
    if (u.includes('/rest/v1/form_submissions') && (init.method || 'GET') === 'GET') {
      return new Response(JSON.stringify([{
        id: SUB, auth_user_id: ME, email: 'peneliti@example.com', payment_status: 'pending',
        submission_status: 'approved', duration: 2, distribution_type: 'regular', ...row,
      }]), { status: 200 });
    }
    if (u.includes('/rest/v1/form_submissions') && init.method === 'PATCH') {
      writes.push({ kind: 'patch', url: u, body: JSON.parse(init.body), headers: init.headers });
      return new Response(JSON.stringify(patch.body), { status: patch.status });
    }
    return new Response('[]', { status: 404 });
  });
  return { writes };
}

const call = (body, token = 'jwt') => onRequest({
  request: new Request('https://x.test/api/schedules/lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }),
  env: ENV,
});

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('/api/schedules/lock', () => {
  it('tanpa token → 401, nol tulisan', async () => {
    global.fetch = vi.fn(async () => new Response('{}', { status: 401 }));
    const res = await call({ submissionId: SUB, startYmd: '2026-10-24', duration: 2 }, null);
    expect(res.status).toBe(401);
  });

  it('Iklan (tanpa action): PATCH service role egidwis, tanpa RPC pintu', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T02:00:00.000Z'));
    const { writes } = network();
    const res = await call({ submissionId: SUB, startYmd: '2026-10-24', duration: 2 });
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ kind: 'patch', body: { slot_booked_by: 'user', submission_status: 'waiting_payment' } });
    expect(writes[0].headers.Authorization).toBe('Bearer service-role-key');
  });

  it('Kilat: door_lock_kilat_wave dengan identitas dari /auth/v1/user, TANPA PATCH', async () => {
    const { writes } = network({ row: { distribution_type: 'kilat' } });
    const res = await call({ action: 'lock', submissionId: SUB, startYmd: '2026-10-22', duration: 1, kilatHour: 15, actor: 'palsu' });
    expect(res.status).toBe(200);
    expect(writes).toEqual([expect.objectContaining({ kind: 'rpc', fn: 'door_lock_kilat_wave' })]);
    expect(writes[0].body).toEqual({
      p_actor: ME, p_email: 'peneliti@example.com', p_submission_id: SUB, p_ymd: '2026-10-22', p_hour: 15,
    });
  });

  it('bentuk tak cocok produk → 400 tanpa tulisan apa pun', async () => {
    let { writes } = network({ row: { distribution_type: 'kilat' } });
    expect((await call({ submissionId: SUB, startYmd: '2026-10-22', duration: 1 })).status).toBe(400);
    expect(writes).toHaveLength(0);
    ({ writes } = network());
    expect((await call({ submissionId: SUB, startYmd: '2026-10-22', duration: 1, kilatHour: 15 })).status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it('bukan pemilik → 400 tanpa tulisan apa pun (semua aksi)', async () => {
    for (const body of [
      { action: 'release', submissionId: SUB },
      { action: 'cancel', submissionId: SUB, sourceId: SUB, isExtension: false },
      { action: 'lock', submissionId: SUB, startYmd: '2026-10-22', duration: 1, kilatHour: 15 },
    ]) {
      const { writes } = network({ row: { auth_user_id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', distribution_type: 'kilat' } });
      const res = await call(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Order tidak ditemukan');
      expect(writes).toHaveLength(0);
    }
  });

  it('HINT trigger diteruskan ke klien (peta galat gelombang)', async () => {
    network({
      row: { distribution_type: 'kilat' },
      rpc: { status: 400, body: { message: 'Gelombang JFU Kilat hanya Senin–Jumat.', hint: 'kilat_wave_closed', code: 'P0001' } },
    });
    const res = await call({ submissionId: SUB, startYmd: '2026-10-24', duration: 1, kilatHour: 15 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Gelombang JFU Kilat hanya Senin–Jumat.', hint: 'kilat_wave_closed', code: 'P0001' });
  });

  it('extend → door_create_extension, memulangkan source_id', async () => {
    const { writes } = network({ rpc: { status: 200, body: SRC } });
    const res = await call({
      action: 'extend', submissionId: SUB,
      startDate: '2026-10-24T08:00:00.000Z', endDate: '2026-10-25T08:00:00.000Z',
      duration: 1, prizePerWinner: 10000, winnerCount: 2, isNewPeriod: true,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(SRC);
    expect(writes[0].fn).toBe('door_create_extension');
    expect(writes[0].body).toMatchObject({ p_actor: ME, p_prize_per_winner: 10000, p_winner_count: 2, p_is_new_period: true, p_additional_prize_per_winner: 0 });
  });

  it('release & cancel → fungsi pintunya; nol baris pulang sebagai id null', async () => {
    let { writes } = network({ rpc: { status: 200, body: null } });
    let res = await call({ action: 'release', submissionId: SUB });
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBeNull();
    expect(writes[0]).toMatchObject({ fn: 'door_release_slot', body: { p_actor: ME, p_submission_id: SUB } });

    ({ writes } = network());
    res = await call({ action: 'cancel', submissionId: SUB, sourceId: SRC, isExtension: true });
    expect(res.status).toBe(200);
    expect(writes[0]).toMatchObject({ fn: 'door_cancel_schedule', body: { p_source_id: SRC, p_is_extension: true } });
  });

  it('cancel-order → door_cancel_order dengan identitas dari token, tanpa PATCH; tetap boleh saat reservasi ditutup', async () => {
    const { writes } = network({ row: { self_booking_closed_at: '2026-10-22T03:00:00Z' } });
    const res = await call({ action: 'cancel-order', submissionId: SUB });
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe(SUB);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      kind: 'rpc', fn: 'door_cancel_order',
      body: { p_actor: ME, p_email: 'peneliti@example.com', p_submission_id: SUB },
    });
  });
});
