import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './[id].js';

/*
  ═══════════════════════════════════════════════════════════════════════════
  PEMBARUAN OTOMATIS TAGIHAN TEMPO DI `/bayar/<jadwal>` (sql/102)
  ═══════════════════════════════════════════════════════════════════════════
  Yang dikunci:
    1. TANPA LOGIN — pembayar pelanggan tepercaya sering bagian keuangan kampus.
    2. IDEMPOTEN — link hidup dipakai, tidak dicetak yang kedua.
    3. Link DOKU YATIM selalu dibatalkan: kalah balapan, atau pencatatan gagal.
    4. Peneliti TIDAK PERNAH melihat "kedaluwarsa" — gagal = "coba lagi".
  Jaringan dipalsukan per URL; yang diuji handler SUNGGUHAN (memori proyek:
  "verifikasi bentuk ≠ menjalankan").
*/

const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  DOKU_CLIENT_ID: 'client-id',
  DOKU_SECRET_KEY: 'secret-key',
};
const UUID = '11111111-2222-4333-8444-555555555555';
const ctx = () => ({
  params: { id: UUID },
  env: ENV,
  request: new Request(`https://submit.jakpatforuniv.com/bayar/${UUID}`),
});

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

const RENEWABLE = { reason: 'tempo_renewable', payment_url: null, payment_id: 'OLD-1', is_group: false, is_lead: true };
const LIVE = { reason: 'live', payment_url: 'https://doku.test/pay/NEW', payment_id: 'NEW', is_group: false, is_lead: true };
const CANDIDATE = {
  old_payment_id: 'OLD-1', amount: 527250, member_count: 1,
  live_payment_id: null, live_url: null,
  lead_submission_id: 'abcdef12-0000-4000-8000-000000000000', lead_schedule_id: UUID,
  customer_name: 'Peneliti', customer_email: 'p@kampus.ac.id', customer_phone: '0812',
};

/**
 * Router jaringan palsu. `resolver` = antrean jawaban authoritative_payment_url.
 * Mengembalikan log panggilan supaya urutan & isi bisa diperiksa.
 */
function network({ resolver, candidate = CANDIDATE, doku = { ok: true }, renew = { outcome: 'renewed' }, renewFails = false }) {
  const calls = [];
  const queue = [...resolver];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: u, body });
    if (u.endsWith('/rpc/authoritative_payment_url')) return json([queue.shift()]);
    if (u.endsWith('/rpc/tempo_renewal_candidate')) return json([candidate]);
    if (u.endsWith('/rpc/renew_tempo_bill')) {
      return renewFails ? json({ message: 'boom' }, 500) : json([{ ...renew, payment_id: body.p_new_payment_id, invoice_url: body.p_invoice_url }]);
    }
    if (u.endsWith('/checkout/v1/payment')) {
      return doku.ok
        ? json({ response: { order: { invoice_number: body.order.invoice_number }, payment: { url: 'https://doku.test/pay/NEW' } } })
        : json({ error: 'nope' }, 400);
    }
    if (u.endsWith('/checkout/v3/cancellations')) return json({ ok: true });
    throw new Error(`panggilan tak terduga: ${u}`);
  });
  return calls;
}

const hit = (calls, suffix) => calls.filter((c) => c.url.endsWith(suffix));

afterEach(() => { vi.restoreAllMocks(); });

describe('/bayar/ — tagihan tempo yang link-nya habis', () => {
  it('diperbarui TANPA login lalu diteruskan ke link DOKU baru', async () => {
    const calls = network({ resolver: [RENEWABLE, LIVE] });
    const res = await onRequest(ctx());
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://doku.test/pay/NEW');
    expect(hit(calls, '/checkout/v1/payment')).toHaveLength(1);
    expect(hit(calls, '/checkout/v3/cancellations')).toHaveLength(0);
  });

  it('nominalnya Σ porsi lama (K10), umurnya 7 hari, dan request_id ikut dicatat', async () => {
    const calls = network({ resolver: [RENEWABLE, LIVE] });
    await onRequest(ctx());
    const checkout = hit(calls, '/checkout/v1/payment')[0].body;
    expect(checkout.order.amount).toBe(527250);
    expect(checkout.payment.payment_due_date).toBe(60 * 24 * 7);
    const renew = hit(calls, '/rpc/renew_tempo_bill')[0].body;
    expect(renew.p_amount).toBe(527250);
    expect(renew.p_old_payment_id).toBe('OLD-1');
    expect(renew.p_doku_request_id).toBeTruthy();
  });

  it('IDEMPOTEN: sudah ada link tempo hidup → nol link baru', async () => {
    const calls = network({
      resolver: [RENEWABLE, LIVE],
      candidate: { ...CANDIDATE, live_payment_id: 'NEW', live_url: 'https://doku.test/pay/NEW' },
    });
    const res = await onRequest(ctx());
    expect(res.status).toBe(302);
    expect(hit(calls, '/checkout/v1/payment')).toHaveLength(0);
  });

  it('kalah balapan → link pemenang dipakai, link kita DIBATALKAN', async () => {
    const calls = network({ resolver: [RENEWABLE, LIVE], renew: { outcome: 'already_renewed' } });
    const res = await onRequest(ctx());
    expect(res.status).toBe(302);
    expect(hit(calls, '/checkout/v3/cancellations')).toHaveLength(1);
  });

  it('pencatatan gagal → link yatim dibatalkan, peneliti diminta coba lagi (BUKAN "kedaluwarsa")', async () => {
    const calls = network({ resolver: [RENEWABLE], renewFails: true });
    const res = await onRequest(ctx());
    expect(res.status).toBe(503);
    expect(hit(calls, '/checkout/v3/cancellations')).toHaveLength(1);
    const html = await res.text();
    expect(html).toContain('disiapkan ulang');
    expect(html).not.toMatch(/kedaluwarsa|sudah lewat/i);
  });

  it('DOKU menolak → coba lagi, dan TIDAK ADA yang dicatat', async () => {
    const calls = network({ resolver: [RENEWABLE], doku: { ok: false } });
    const res = await onRequest(ctx());
    expect(res.status).toBe(503);
    expect(hit(calls, '/rpc/renew_tempo_bill')).toHaveLength(0);
  });

  it('resolver masih meminta pembaruan sesudah sukses → tidak berputar', async () => {
    const calls = network({ resolver: [RENEWABLE, RENEWABLE] });
    const res = await onRequest(ctx());
    expect(res.status).toBe(503);
    expect(hit(calls, '/rpc/authoritative_payment_url')).toHaveLength(2);
  });
});

describe('/bayar/ — bill_expired', () => {
  it('jadwal masih bisa dikejar → kalimat MENUNGGU, bukan jadwalkan ulang', async () => {
    network({ resolver: [{ reason: 'bill_expired', payment_url: null, payment_id: 'G-1', is_group: true, is_lead: false }] });
    const res = await onRequest(ctx());
    const html = await res.text();
    expect(html).toContain('tagihan baru akan dikirimkan');
    expect(html).not.toMatch(/menjadwalkan ulang atau/i);
  });
});
