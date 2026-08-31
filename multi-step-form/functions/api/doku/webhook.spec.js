import { describe, it, expect } from 'vitest';
import { verifyDokuAuth, sniffInvoiceNumber, REJECT_OUTCOMES, onRequest } from './webhook.js';

/*
  Yang dijaga di sini: SETIAP penolakan harus bisa dicatat.

  Insiden 2026-08-31 (invoice JFU-ac75fa15-1788158299791, Rp 555.000, QRIS):
  notification URL produk QRIS di dashboard DOKU menunjuk BO DOKU sendiri, jadi
  webhook kita tidak pernah dipanggil. Mendiagnosisnya butuh screenshot dashboard
  DOKU — karena dari sisi kita "DOKU tidak pernah menelepon" dan "DOKU menelepon
  lalu kita tolak" terlihat SAMA PERSIS: nol baris di doku_webhook_events.

  Sebabnya: ketiga jalan penolakan (401 secret, 401 signature, 400 payload tak
  terbaca) semuanya `return` SEBELUM recordWebhookEvent() sempat dipanggil.
  sql/54 hanya menutup kegagalan TULIS, bukan kegagalan MASUK.

  Karena itu blok autentikasi dipisah jadi fungsi murni: ia memberi VERDICT,
  bukan langsung membalas — supaya pemanggilnya wajib melewati satu titik yang
  mencatat. Tes ini menjaga verdict-nya, termasuk yang paling mudah salah:
  enforcement secret yang mati harus tetap MELOLOSKAN request (itu perilaku
  rollout stage A, dan pernah jadi satu-satunya alasan webhook lama tetap jalan).
*/

const SECRET = 'rahasia-uji';
const CLIENT_ID = 'BRN-0231-1234567890';

const envOf = (over = {}) => ({
    DOKU_WEBHOOK_SECRET: SECRET,
    WEBHOOK_ENFORCE_SECRET: 'true',
    DOKU_CLIENT_ID: CLIENT_ID,
    DOKU_SECRET_KEY: 'secret-key-jokul',
    ...over,
});

const urlWith = (secret) =>
    `https://submit.jakpatforuniv.com/api/doku/webhook${secret ? `?k=${secret}` : ''}`;

const snapHeaders = (over = {}) =>
    new Headers({
        'CHANNEL-ID': 'H2H',
        'X-PARTNER-ID': CLIENT_ID,
        'X-EXTERNAL-ID': 'ext-1',
        'X-TIMESTAMP': '2026-08-31T15:08:35+07:00',
        ...over,
    });

const call = (over = {}) =>
    verifyDokuAuth({
        headers: snapHeaders(),
        requestUrl: urlWith(SECRET),
        env: envOf(),
        rawBodyText: '{}',
        ...over,
    });

describe('verifyDokuAuth — gerbang secret ?k=', () => {
    it('menolak secret yang salah saat enforcement HIDUP', async () => {
        const res = await call({ requestUrl: urlWith('salah') });
        expect(res.ok).toBe(false);
        expect(res.httpStatus).toBe(401);
    });

    it('menolak secret yang HILANG saat enforcement hidup', async () => {
        const res = await call({ requestUrl: urlWith(null) });
        expect(res.ok).toBe(false);
        expect(res.httpStatus).toBe(401);
    });

    it('MELOLOSKAN secret yang hilang saat enforcement mati (perilaku stage A)', async () => {
        const res = await call({
            requestUrl: urlWith(null),
            env: envOf({ WEBHOOK_ENFORCE_SECRET: 'false' }),
        });
        expect(res.ok).toBe(true);
    });

    it('meloloskan secret yang benar', async () => {
        expect((await call()).ok).toBe(true);
    });
});

describe('verifyDokuAuth — SNAP (Sub Account)', () => {
    it('meloloskan X-PARTNER-ID yang cocok', async () => {
        expect((await call()).ok).toBe(true);
    });

    it('menolak X-PARTNER-ID yang tidak cocok', async () => {
        const res = await call({ headers: snapHeaders({ 'X-PARTNER-ID': 'BRN-lain' }) });
        expect(res.ok).toBe(false);
        expect(res.httpStatus).toBe(401);
    });

    it('menolak kalau DOKU_CLIENT_ID tidak diset — fail-closed', async () => {
        const res = await call({ env: envOf({ DOKU_CLIENT_ID: undefined, VITE_DOKU_CLIENT_ID: undefined }) });
        expect(res.ok).toBe(false);
    });

    it('menolak header SNAP yang tidak lengkap', async () => {
        const h = snapHeaders();
        h.delete('X-EXTERNAL-ID');
        const res = await call({ headers: h });
        expect(res.ok).toBe(false);
        expect(res.httpStatus).toBe(401);
    });
});

describe('verifyDokuAuth — Jokul (HMAC legacy)', () => {
    const jokulHeaders = (signature) =>
        new Headers({
            'Client-Id': CLIENT_ID,
            'Request-Id': 'req-1',
            'Request-Timestamp': '2026-08-31T08:08:35Z',
            Signature: signature,
        });

    it('menolak signature yang salah', async () => {
        const res = await call({
            headers: jokulHeaders('HMACSHA256=jelas-salah'),
            rawBodyText: '{"order":{"invoice_number":"JFU-x-1"}}',
        });
        expect(res.ok).toBe(false);
        expect(res.httpStatus).toBe(401);
    });

    it('menolak kalau header Jokul tidak lengkap', async () => {
        const h = jokulHeaders('HMACSHA256=apa-saja');
        h.delete('Request-Id');
        const res = await call({ headers: h });
        expect(res.ok).toBe(false);
    });
});

describe('sniffInvoiceNumber — supaya penolakan pun punya nama', () => {
    it('membaca bentuk Jokul', () => {
        expect(sniffInvoiceNumber('{"order":{"invoice_number":"JFU-abc-1"}}')).toBe('JFU-abc-1');
    });

    it('membaca bentuk SNAP', () => {
        expect(sniffInvoiceNumber('{"trxId":"JFU-def-2"}')).toBe('JFU-def-2');
    });

    it('membaca bentuk payout', () => {
        expect(sniffInvoiceNumber('{"payout":{"invoice_number":"PO-1"}}')).toBe('PO-1');
    });

    it('mengembalikan null untuk badan yang bukan JSON — tidak boleh melempar', () => {
        expect(sniffInvoiceNumber('<html>bukan json</html>')).toBeNull();
        expect(sniffInvoiceNumber('')).toBeNull();
        expect(sniffInvoiceNumber(undefined)).toBeNull();
    });

    it('mengembalikan null untuk JSON tanpa nomor invoice', () => {
        expect(sniffInvoiceNumber('{"halo":"dunia"}')).toBeNull();
    });
});

describe('onRequest — kabelnya, bukan cuma verdictnya', () => {
    /*
      Fungsi murni yang benar tidak ada gunanya kalau pemanggilnya lupa memakai
      titik pencatatan. Di sini Supabase SENGAJA tidak dikonfigurasi: pencatatan
      pasti gagal, dan balasan ke DOKU tetap harus utuh. `recordWebhookEvent`
      memang menelan errornya sendiri — properti itu yang dijaga di sini, karena
      kalau ia melempar, satu Supabase yang down berubah jadi webhook 500 untuk
      SEMUA pembayaran.
    */
    // Header SNAP yang sah ikut dikirim: tanpa itu request jatuh ke cabang
    // Jokul dan ditolak 401 di autentikasi, jadi tes payload di bawah tidak
    // akan pernah menguji apa yang dikiranya diuji.
    const ctxWith = (url, body = '{"order":{"invoice_number":"JFU-x-1"}}', method = 'POST') => ({
        request: new Request(
            url,
            method === 'POST'
                ? { method, body, headers: snapHeaders() }
                : { method, headers: snapHeaders() },
        ),
        env: {
            DOKU_WEBHOOK_SECRET: SECRET,
            WEBHOOK_ENFORCE_SECRET: 'true',
            DOKU_CLIENT_ID: CLIENT_ID,
            // Supabase sengaja kosong → resolveSupabase() fail-closed.
        },
    });

    it('membalas 401 untuk secret salah, tanpa melempar walau Supabase mati', async () => {
        const res = await onRequest(ctxWith(urlWith('salah')));
        expect(res.status).toBe(401);
    });

    it('membalas 400 untuk badan yang bukan JSON', async () => {
        const res = await onRequest(ctxWith(urlWith(SECRET), 'bukan json sama sekali'));
        expect(res.status).toBe(400);
    });

    it('membalas 400 untuk payload tanpa nomor invoice', async () => {
        const res = await onRequest(ctxWith(urlWith(SECRET), '{"halo":"dunia"}'));
        expect(res.status).toBe(400);
    });

    it('menolak metode selain POST', async () => {
        const res = await onRequest(ctxWith(urlWith(SECRET), null, 'GET'));
        expect(res.status).toBe(405);
    });
});

describe('taksonomi outcome penolakan', () => {
    it('nilainya HARUS ada di CHECK constraint doku_webhook_events (sql/77)', () => {
        // Kalau ini berubah tanpa migrasi, setiap penolakan gagal dicatat
        // dengan 400 dari PostgREST — persis kebutaan yang mau ditutup.
        expect(REJECT_OUTCOMES.auth).toBe('rejected_auth');
        expect(REJECT_OUTCOMES.payload).toBe('rejected_payload');
        expect(REJECT_OUTCOMES.crash).toBe('handler_crashed');
    });
});
