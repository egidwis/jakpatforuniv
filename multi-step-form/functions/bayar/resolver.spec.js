import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './[id].js';

/*
  Yang dijaga di sini: resolver TIDAK BOLEH PUNYA PENDAPAT SENDIRI.

  Seluruh keputusan "tagihan mana yang berwenang" datang dari
  `authoritative_payment_url()` (sql/85). Tes ini karena itu tidak menguji
  predikat kehidupan tagihan — itu punya rumahnya di SQL — melainkan bahwa
  resolver menuruti jawabannya, dan bahwa dua aturan yang HANYA hidup di sini
  benar-benar berlaku:

    1. anggota grup yang bukan lead TIDAK PERNAH dilempar ke DOKU (link grup
       menagih total seluruh grup);
    2. halaman kalimatnya tidak membocorkan apa pun — halaman ini terbuka tanpa
       login, jadi menebak UUID tidak boleh bisa memanen data.
*/

const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

const UUID = '11111111-2222-4333-8444-555555555555';

const ctx = (id, env = ENV) => ({ params: { id }, env });

const rpcReturns = (row) => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify(row ? [row] : []), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
};

afterEach(() => { vi.restoreAllMocks(); });

describe('/bayar/<id> — bentuk URL', () => {
  it('bukan UUID → halaman kalimat 404, dan RPC tidak pernah dipanggil', async () => {
    global.fetch = vi.fn();
    const res = await onRequest(ctx('5AGPY3QV'));
    expect(res.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('UUID yang tidak ada → 404, bukan 302 ke mana pun', async () => {
    rpcReturns({ reason: 'not_found', payment_url: null, payment_id: null, is_group: false, is_lead: true });
    const res = await onRequest(ctx(UUID));
    expect(res.status).toBe(404);
    expect(res.headers.get('Location')).toBeNull();
  });
});

describe('/bayar/<id> — meneruskan', () => {
  it('tagihan hidup solo → 302 ke URL DOKU', async () => {
    rpcReturns({
      reason: 'live', payment_url: 'https://sandbox.doku.com/checkout/link/abc',
      payment_id: 'JFU-INV-1', is_group: false, is_lead: true,
    });
    const res = await onRequest(ctx(UUID));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://sandbox.doku.com/checkout/link/abc');
  });

  it('lead sebuah grup tetap ke DOKU — dialah yang menagih seluruh bundel', async () => {
    rpcReturns({
      reason: 'live', payment_url: 'https://sandbox.doku.com/checkout/link/grp',
      payment_id: 'JFU-INV-G', is_group: true, is_lead: true,
    });
    const res = await onRequest(ctx(UUID));
    expect(res.headers.get('Location')).toBe('https://sandbox.doku.com/checkout/link/grp');
  });

  it('anggota grup BUKAN lead → /invoices/<payment_id>, TIDAK PERNAH ke DOKU', async () => {
    rpcReturns({
      reason: 'live', payment_url: 'https://sandbox.doku.com/checkout/link/grp',
      payment_id: 'JFU-INV-G', is_group: true, is_lead: false,
    });
    const res = await onRequest(ctx(UUID));
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/invoices/JFU-INV-G');
    expect(res.headers.get('Location')).not.toContain('doku.com');
  });

  it('meneruskan tanpa membocorkan URL kita sebagai Referer', async () => {
    rpcReturns({
      reason: 'live', payment_url: 'https://sandbox.doku.com/checkout/link/abc',
      payment_id: 'JFU-INV-1', is_group: false, is_lead: true,
    });
    const res = await onRequest(ctx(UUID));
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('tidak boleh di-cache — jawabannya berubah seiring keadaan tagihan', async () => {
    rpcReturns({
      reason: 'live', payment_url: 'https://sandbox.doku.com/checkout/link/abc',
      payment_id: 'JFU-INV-1', is_group: false, is_lead: true,
    });
    const res = await onRequest(ctx(UUID));
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });
});

describe('/bayar/<id> — tidak ada tagihan berwenang', () => {
  for (const reason of ['paid', 'cancelled', 'stale', 'expired', 'none', 'no_url']) {
    it(`${reason} → halaman kalimat, bukan penerusan`, async () => {
      rpcReturns({ reason, payment_url: null, payment_id: null, is_group: false, is_lead: true });
      const res = await onRequest(ctx(UUID));
      expect(res.status).toBe(200);
      expect(res.headers.get('Location')).toBeNull();
      const html = await res.text();
      expect(html).toContain('Buka Dashboard');
    });
  }

  it('halaman kalimat DUA BAHASA — link email tidak selalu dibuka penutur Indonesia', async () => {
    rpcReturns({ reason: 'cancelled', payment_url: null, payment_id: null, is_group: false, is_lead: true });
    const html = await (await onRequest(ctx(UUID))).text();
    expect(html).toContain('Jadwal ini sudah dibatalkan.');
    expect(html).toContain('This schedule has been cancelled.');
  });

  it('tidak diindeks mesin pencari', async () => {
    rpcReturns({ reason: 'expired', payment_url: null, payment_id: null, is_group: false, is_lead: true });
    const res = await onRequest(ctx(UUID));
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
  });

  it('reason "live" tanpa payment_url TIDAK meneruskan ke string kosong', async () => {
    rpcReturns({ reason: 'live', payment_url: null, payment_id: 'JFU-X', is_group: false, is_lead: true });
    const res = await onRequest(ctx(UUID));
    expect(res.status).toBe(200);
    expect(res.headers.get('Location')).toBeNull();
  });
});

describe('/bayar/<id> — kegagalan tidak boleh sunyi', () => {
  it('RPC gagal → 502 halaman kalimat, bukan crash', async () => {
    global.fetch = vi.fn(async () => new Response('boom', { status: 500 }));
    const res = await onRequest(ctx(UUID));
    expect(res.status).toBe(502);
  });

  it('env tidak lengkap → 500, dan tidak menembak jaringan', async () => {
    global.fetch = vi.fn();
    const res = await onRequest(ctx(UUID, { VITE_SUPABASE_URL: 'https://db.example.test' }));
    expect(res.status).toBe(500);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('/bayar/<id> — tidak membocorkan data', () => {
  it('halaman kalimat tidak memuat nominal, judul, nama, atau email', async () => {
    rpcReturns({ reason: 'stale', payment_url: null, payment_id: null, is_group: false, is_lead: true });
    const html = await (await onRequest(ctx(UUID))).text();
    expect(html).not.toMatch(/Rp\s?\d/);
    expect(html).not.toContain('@');
    // UUID-nya sendiri pun tidak dipantulkan kembali ke halaman.
    expect(html).not.toContain(UUID);
  });
});
