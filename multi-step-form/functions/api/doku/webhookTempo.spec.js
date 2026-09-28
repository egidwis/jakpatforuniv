import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './webhook.js';

/*
  ═══════════════════════════════════════════════════════════════════════════
  WEBHOOK × TAYANG SEBELUM LUNAS (sql/102) — dijalankan, bukan dibaca
  ═══════════════════════════════════════════════════════════════════════════
  Handler SUNGGUHAN dipanggil dengan notifikasi SNAP yang lolos autentikasi;
  jaringan dipalsukan per URL dan setiap tulisan direkam. Yang dikunci:

    1. STEP 5 pada jadwal KREDIT hanya menulis uang — tahapnya (`live`,
       `completed`) tidak boleh mundur ke `paid`/`scheduled`.
    2. Jadwal BUKAN kredit tetap persis seperti dulu (penjaga regresi).
    3. Bayar telat ke link tempo yang sudah diperbarui → diambil alih kembali,
       link penggantinya DIMATIKAN, pembayarannya tercatat.
    4. Pengambilalihan yang ditolak → `paid_on_dead_bill`, NOL tulisan uang.
*/

const INVOICE = 'JFU-INV-t-1';
const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  DOKU_CLIENT_ID: 'client-id',
  DOKU_SECRET_KEY: 'secret-key',
  DOKU_WEBHOOK_SECRET: 's3cret',
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

function request(dokuStatus = 'SUCCESS') {
  return new Request(`https://submit.jakpatforuniv.com/api/doku/webhook?k=${ENV.DOKU_WEBHOOK_SECRET}`, {
    method: 'POST',
    headers: {
      'CHANNEL-ID': 'H2H',
      'X-PARTNER-ID': ENV.DOKU_CLIENT_ID,
      'X-EXTERNAL-ID': 'ext-1',
      'X-TIMESTAMP': '2026-09-29T09:00:00+07:00',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ order: { invoice_number: INVOICE, amount: 527250 }, transaction: { status: dokuStatus } }),
  });
}

/**
 * @param {{credit?: boolean, billStatus?: string, adopt?: string, tempo?: boolean|'error'}} opts
 */
function network({ credit = false, billStatus = 'pending', adopt = null, tempo = false } = {}) {
  const writes = [];
  const calls = [];
  let adopted = false;
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? (() => { try { return JSON.parse(init.body); } catch { return init.body; } })() : null;
    calls.push({ url: u, method, body });
    if (method === 'PATCH') writes.push({ url: u, body });

    if (u.includes('/rest/v1/invoices?payment_id=eq.') && u.includes('select=is_tempo')) {
      return tempo === 'error' ? json({ message: 'column does not exist' }, 400) : json([{ is_tempo: !!tempo }]);
    }
    if (u.includes('/rest/v1/invoices?payment_id=eq.') && method === 'GET') {
      const status = adopted ? 'pending' : billStatus;
      return json([{ amount: 527250, status, schedule_id: 'sched-1' }]);
    }
    if (u.endsWith('/rpc/adopt_superseded_tempo_payment')) {
      if (adopt === 'adopted') adopted = true;
      return json([{ outcome: adopt ?? 'not_superseded', successor_payment_id: 'JFU-INV-t-2', successor_request_id: 'req-2' }]);
    }
    if (u.endsWith('/checkout/v3/cancellations')) return json({ ok: true });
    if (u.endsWith('/rpc/schedule_billing')) {
      return json([{ payment_id: INVOICE, is_stale: false, is_superseded: false, billed_start_date: null }]);
    }
    if (u.includes('/rest/v1/ad_schedules?id=in.')) return json([{ id: 'sched-1', booking_id: 'AAAA1111', start_date: null }]);
    if (u.includes('/rest/v1/ad_schedules?id=eq.') && u.includes('air_on_credit_at')) {
      return json([{ air_on_credit_at: credit ? '2026-09-27T01:00:00Z' : null }]);
    }
    if (u.includes('/rest/v1/transactions?payment_id=eq.') && method === 'PATCH') {
      return json([{ form_submission_id: 'sub-1', schedule_id: 'sched-1', entity_type: null, extend_id: null }]);
    }
    if (u.includes('/rest/v1/invoices?payment_id=eq.') && method === 'PATCH') {
      return json([{ form_submission_id: 'sub-1', schedule_id: 'sched-1' }]);
    }
    if (u.includes('/rest/v1/invoices?schedule_id=eq.')) return json([{ status: 'paid', created_at: '2026-09-29' }]);
    if (u.includes('/rest/v1/form_submissions?id=eq.sub-1') && method === 'PATCH') return json([{ id: 'sub-1' }]);
    // Selebihnya (audit, voucher, kuitansi, email): jawaban kosong yang sah.
    return json([]);
  });
  return { writes, calls };
}

const ctx = (dokuStatus) => {
  const pending = [];
  return { request: request(dokuStatus), env: ENV, waitUntil: (p) => pending.push(p), pending };
};

const MONEY_WRITE = /\/(transactions|invoices|form_submissions|ad_schedules)\?/;

afterEach(() => { vi.restoreAllMocks(); });

describe('STEP 5 — jadwal kredit hanya menerima uang', () => {
  it('kredit: form_submissions hanya mendapat payment_status, TANPA submission_status', async () => {
    const { writes } = network({ credit: true });
    const res = await onRequest(ctx());
    expect(res.status).toBe(200);
    const patch = writes.find((w) => w.url.includes('/form_submissions?id=eq.sub-1'));
    expect(patch?.body).toEqual({ payment_status: 'paid' });
  });

  it('bukan kredit: persis seperti dulu — submission_status ikut jadi paid', async () => {
    const { writes } = network({ credit: false });
    await onRequest(ctx());
    const patch = writes.find((w) => w.url.includes('/form_submissions?id=eq.sub-1'));
    expect(patch?.body).toEqual({ payment_status: 'paid', submission_status: 'paid' });
  });
});

describe('STEP 0a — bayar telat ke link tempo yang sudah diperbarui', () => {
  it('diambil alih kembali: link pengganti dimatikan, pembayaran tercatat', async () => {
    const { writes, calls } = network({ billStatus: 'cancelled', adopt: 'adopted' });
    const res = await onRequest(ctx());
    const out = await res.json();
    expect(out.outcome).toBe('ok');
    const cancels = calls.filter((c) => c.url.endsWith('/checkout/v3/cancellations'));
    expect(cancels).toHaveLength(1);
    expect(cancels[0].body.order.invoice_number).toBe('JFU-INV-t-2');
    expect(writes.some((w) => w.url.includes('/form_submissions?id=eq.sub-1'))).toBe(true);
  });

  it('tidak bisa diambil alih → paid_on_dead_bill, NOL tulisan uang', async () => {
    const { writes } = network({ billStatus: 'cancelled', adopt: 'not_adoptable' });
    const res = await onRequest(ctx());
    const out = await res.json();
    expect(out.outcome).toBe('paid_on_dead_bill');
    expect(writes.filter((w) => /\/(transactions|invoices|form_submissions|ad_schedules)\?/.test(w.url))).toHaveLength(0);
  });

  it('tagihan biasa yang dibatalkan admin (bukan tempo) → tetap paid_on_dead_bill seperti dulu', async () => {
    const { writes, calls } = network({ billStatus: 'cancelled', adopt: 'not_superseded' });
    const out = await (await onRequest(ctx())).json();
    expect(out.outcome).toBe('paid_on_dead_bill');
    expect(calls.filter((c) => c.url.endsWith('/checkout/v3/cancellations'))).toHaveLength(0);
    expect(writes.filter((w) => /\/(transactions|invoices|form_submissions)\?/.test(w.url))).toHaveLength(0);
  });
});

describe('STEP 0t — notifikasi FAILED/EXPIRED tidak pernah menghapus utang tempo', () => {
  it('link tempo yang masih hidup: nol tulisan, utangnya tetap pending', async () => {
    const { writes } = network({ tempo: true });
    const out = await (await onRequest(ctx('EXPIRED'))).json();
    expect(out.outcome).toBe('ok');
    expect(writes.filter((w) => MONEY_WRITE.test(w.url))).toHaveLength(0);
  });

  it('link tempo lama yang sudah diganti: TIDAK diadopsi, link pengganti TIDAK dimatikan', async () => {
    const { writes, calls } = network({ tempo: true, billStatus: 'cancelled', adopt: 'adopted' });
    await onRequest(ctx('FAILED'));
    expect(calls.filter((c) => c.url.endsWith('/rpc/adopt_superseded_tempo_payment'))).toHaveLength(0);
    expect(calls.filter((c) => c.url.endsWith('/checkout/v3/cancellations'))).toHaveLength(0);
    expect(writes.filter((w) => MONEY_WRITE.test(w.url))).toHaveLength(0);
  });

  it('is_tempo tak terbaca: adopsi TETAP tidak jalan untuk notifikasi non-sukses (lapis kedua)', async () => {
    const { calls } = network({ tempo: 'error', billStatus: 'cancelled', adopt: 'adopted' });
    await onRequest(ctx('EXPIRED'));
    expect(calls.filter((c) => c.url.endsWith('/rpc/adopt_superseded_tempo_payment'))).toHaveLength(0);
    expect(calls.filter((c) => c.url.endsWith('/checkout/v3/cancellations'))).toHaveLength(0);
  });

  it('tagihan BUKAN tempo: FAILED tetap ditulis seperti dulu (penjaga regresi)', async () => {
    const { writes } = network({ tempo: false });
    await onRequest(ctx('FAILED'));
    const inv = writes.find((w) => w.url.includes('/rest/v1/invoices?payment_id=eq.'));
    expect(inv?.body?.status).toBe('failed');
  });
});
