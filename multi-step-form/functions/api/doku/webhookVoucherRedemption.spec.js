import { describe, it, expect, vi, afterEach } from 'vitest';
import { onRequest } from './webhook.js';

/*
  ═══════════════════════════════════════════════════════════════════════════
  WEBHOOK × voucher_redemptions (ILKOMUNY sekali pakai) — dijalankan, bukan dibaca
  ═══════════════════════════════════════════════════════════════════════════
  Handler SUNGGUHAN dipanggil dengan notifikasi SNAP yang lolos autentikasi;
  jaringan dipalsukan per URL (harness sama dengan webhookTempo.spec.js).

  Yang dikunci: pencatatan redemption memakai `on_conflict` = kunci UNIQUE
  (auth_user_id, voucher_code). Tanpanya PostgREST memakai PRIMARY KEY sebagai
  target ON CONFLICT, `ignore-duplicates` tak pernah menyala, dan pembayaran
  kedua dari akun yang sama berakhir 409 + peringatan di log.

  Tiruan PostgREST di bawah meniru perilaku itu: baris yang sudah ada + kunci
  konflik yang benar → 201 (DO NOTHING); kunci lain/tanpa kunci → 409.
*/

const INVOICE = 'JFU-INV-v-1';
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
      'X-EXTERNAL-ID': 'ext-v',
      'X-TIMESTAMP': '2026-10-15T09:00:00+07:00',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ order: { invoice_number: INVOICE, amount: 1110 }, transaction: { status: dokuStatus } }),
  });
}

/**
 * @param {{voucher?: string|null, alreadyRedeemed?: boolean, scheduleBill?: string}} opts
 *   scheduleBill = status tagihan jadwal yang dibaca STEP 5 untuk menurunkan
 *   payment_status order (tagihan terbaru per jadwal).
 */
function network({ voucher = 'ilkomuny', alreadyRedeemed = false, scheduleBill = 'paid' } = {}) {
  const redemptions = [];
  global.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? (() => { try { return JSON.parse(init.body); } catch { return init.body; } })() : null;

    if (u.includes('/rest/v1/voucher_redemptions')) {
      redemptions.push({ url: u, method, body, prefer: init.headers?.Prefer });
      const conflictKey = new URL(u).searchParams.get('on_conflict');
      if (alreadyRedeemed && conflictKey !== 'auth_user_id,voucher_code') {
        return json({ code: '23505', message: 'duplicate key value violates unique constraint "voucher_redemptions_auth_user_id_voucher_code_key"' }, 409);
      }
      return new Response(null, { status: 201 });
    }
    if (u.includes('/rest/v1/form_submissions?id=eq.sub-1') && u.includes('select=auth_user_id,voucher_code')) {
      return json([{ auth_user_id: 'user-1', voucher_code: voucher }]);
    }
    if (u.includes('/rest/v1/invoices?payment_id=eq.') && method === 'GET') {
      return json([{ amount: 1110, status: 'pending', schedule_id: 'sched-1' }]);
    }
    if (u.endsWith('/rpc/schedule_billing')) {
      return json([{ payment_id: INVOICE, is_stale: false, is_superseded: false, billed_start_date: null }]);
    }
    if (u.includes('/rest/v1/ad_schedules?id=in.')) return json([{ id: 'sched-1', booking_id: 'VVVV1111', start_date: null }]);
    if (u.includes('/rest/v1/ad_schedules?id=eq.') && u.includes('air_on_credit_at')) {
      return json([{ air_on_credit_at: null, payment_status: 'pending' }]);
    }
    if (u.includes('/rest/v1/transactions?payment_id=eq.') && method === 'PATCH') {
      return json([{ form_submission_id: 'sub-1', schedule_id: 'sched-1', entity_type: null, extend_id: null }]);
    }
    if (u.includes('/rest/v1/invoices?payment_id=eq.') && method === 'PATCH') {
      return json([{ form_submission_id: 'sub-1', schedule_id: 'sched-1' }]);
    }
    if (u.includes('/rest/v1/invoices?schedule_id=eq.')) return json([{ status: scheduleBill, created_at: '2026-10-15' }]);
    if (u.includes('/rest/v1/form_submissions?id=eq.sub-1') && method === 'PATCH') return json([{ id: 'sub-1' }]);
    return json([]);
  });
  return { redemptions };
}

const ctx = (dokuStatus) => ({ request: request(dokuStatus), env: ENV, waitUntil: () => {} });

const nonOkWarnings = (spy) => spy.mock.calls.filter((args) => String(args[0]).includes('voucher_redemptions insert non-OK'));

afterEach(() => { vi.restoreAllMocks(); });

describe('pencatatan redemption ILKOMUNY saat lunas', () => {
  it('satu INSERT dengan kunci konflik UNIQUE (auth_user_id, voucher_code) + ignore-duplicates', async () => {
    const { redemptions } = network();
    const res = await onRequest(ctx());
    expect(res.status).toBe(200);
    expect(redemptions).toHaveLength(1);
    const [r] = redemptions;
    expect(r.method).toBe('POST');
    expect(new URL(r.url).searchParams.get('on_conflict')).toBe('auth_user_id,voucher_code');
    expect(r.prefer).toBe('resolution=ignore-duplicates');
    expect(r.body).toEqual({ auth_user_id: 'user-1', voucher_code: 'ILKOMUNY', form_submission_id: 'sub-1' });
  });

  it('akun yang sudah tercatat membayar lagi: DO NOTHING, tanpa peringatan 409 di log', async () => {
    network({ alreadyRedeemed: true });
    const warn = vi.spyOn(console, 'warn');
    const res = await onRequest(ctx());
    expect(res.status).toBe(200);
    expect(nonOkWarnings(warn)).toHaveLength(0);
  });

  it('voucher lain tidak dicatat (hanya ILKOMUNY yang sekali pakai)', async () => {
    const { redemptions } = network({ voucher: 'JFUGITA' });
    await onRequest(ctx());
    expect(redemptions).toHaveLength(0);
  });

  it('notifikasi gagal (tagihan jadwal ikut gagal) tidak mencatat apa pun', async () => {
    const { redemptions } = network({ scheduleBill: 'failed' });
    await onRequest(ctx('FAILED'));
    expect(redemptions).toHaveLength(0);
  });
});
