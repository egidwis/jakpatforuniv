import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './_middleware.js';

/*
  ═══════════════════════════════════════════════════════════════════════════
  GERBANG /api/doku/* — DEFAULT-DENY, DAN TETAP BEGITU
  ═══════════════════════════════════════════════════════════════════════════

  Berkas ini menjaga SATU pintu untuk seluruh endpoint uang: checkout, SAC
  (payout/transfer/balance), cancel-order. Melonggarkannya satu tingkat terlalu
  jauh berarti membuka pemindahan dana ke siapa pun yang punya akun.

  2026-09-17 pintu ini dilonggarkan SEKALI, untuk `cancel-order` saja, supaya
  peneliti bisa mematikan link tagihannya sendiri saat membatalkan jadwal
  (Phase 4). Tes ini memastikan pelonggaran itu TIDAK merembet.
*/

const ENV = {
  VITE_SUPABASE_URL: 'https://db.example',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
  ADMIN_EMAILS: 'product@jakpat.net',
};

const ctx = (path, { token = 'tok', method = 'POST', env = ENV } = {}) => {
  const data = {};
  return {
    request: new Request(`https://app.example${path}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    env,
    data,
    next: vi.fn(async () => new Response('OK', { status: 200 })),
  };
};

const stubUser = (email, id = 'u1') =>
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ email, id }),
  })));

afterEach(() => { vi.unstubAllGlobals(); });

describe('gerbang /api/doku/*', () => {
  it('endpoint publik lewat tanpa sesi', async () => {
    for (const p of ['/api/doku/webhook', '/api/doku/create-payment']) {
      const c = ctx(p, { token: null });
      await onRequest(c);
      expect(c.next).toHaveBeenCalled();
    }
  });

  it('endpoint admin menolak non-admin', async () => {
    stubUser('peneliti@kampus.ac.id');
    for (const p of ['/api/doku/checkout', '/api/doku/sac/payout', '/api/doku/sac/transfer']) {
      const c = ctx(p);
      const res = await onRequest(c);
      expect(res.status).toBe(401);
      expect(c.next).not.toHaveBeenCalled();
    }
  });

  it('endpoint admin meloloskan admin, dan menandainya isAdmin', async () => {
    stubUser('product@jakpat.net');
    const c = ctx('/api/doku/checkout');
    await onRequest(c);
    expect(c.next).toHaveBeenCalled();
    expect(c.data.isAdmin).toBe(true);
  });

  it('cancel-order: PENELITI lolos gerbang, tapi ditandai BUKAN admin', async () => {
    /*
      Gerbang hanya menyatakan SIAPA pemanggilnya. Yang menyatakan dia berhak
      atas tagihan tertentu adalah `assertCallerMayCancel` di dalam endpoint —
      lihat cancelOrderOwnership.spec.js. Kalau `isAdmin` bocor jadi true di
      sini, penjaga itu akan dilewati seluruhnya.
    */
    stubUser('peneliti@kampus.ac.id', 'u-peneliti');
    const c = ctx('/api/doku/cancel-order');
    await onRequest(c);
    expect(c.next).toHaveBeenCalled();
    expect(c.data.isAdmin).toBe(false);
    expect(c.data.authEmail).toBe('peneliti@kampus.ac.id');
    expect(c.data.authUserId).toBe('u-peneliti');
  });

  it('cancel-order TETAP menolak tanpa sesi sama sekali', async () => {
    const c = ctx('/api/doku/cancel-order', { token: null });
    const res = await onRequest(c);
    expect(res.status).toBe(401);
    expect(c.next).not.toHaveBeenCalled();
  });

  it('cancel-order menolak token yang tidak sah', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));
    const c = ctx('/api/doku/cancel-order');
    const res = await onRequest(c);
    expect(res.status).toBe(401);
    expect(c.next).not.toHaveBeenCalled();
  });

  it('⚠️ pelonggarannya TIDAK merembet ke endpoint lain', async () => {
    // Kalau seseorang kelak menaruh 'sac' atau 'checkout' di OWNER_ENDPOINTS,
    // tes ini yang merah lebih dulu.
    stubUser('peneliti@kampus.ac.id');
    for (const p of ['/api/doku/sac/balance', '/api/doku/sac/create', '/api/doku/checkout']) {
      const c = ctx(p);
      const res = await onRequest(c);
      expect(res.status).toBe(401);
    }
  });

  it('GAGAL-TERTUTUP: env Supabase hilang → 401, bukan lolos', async () => {
    const c = ctx('/api/doku/cancel-order', { env: { ADMIN_EMAILS: 'product@jakpat.net' } });
    const res = await onRequest(c);
    expect(res.status).toBe(401);
    expect(c.next).not.toHaveBeenCalled();
  });
});
