import { describe, it, expect } from 'vitest';
import { verifyDokuAuth, sniffInvoiceNumber, REJECT_OUTCOMES, onRequest, collectPaidTargets, deadBillOutcome, isDeadBillStatus } from './webhook.js';

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

// ============================================================================
// Tagihan yang sudah mati tidak boleh menggerakkan jadwal (sql/80)
// ============================================================================
//
// Order af004b84 (2026-09-02): peneliti membayar lewat link DOKU milik jadwal
// yang dibatalkan 20 menit sesudah tagihannya terbit. STEP 5 mencoba
// menghidupkan kembali jadwal batal itu; penjaga irisan sql/75 menolak, dan
// kita membalas 500 tiga kali. Penjaga irisan itu KEBETULAN ada — untuk ordinal
// 1 tidak ada yang akan menangkap apa pun, dan jadwal yang sengaja dibatalkan
// akan hidup lagi tanpa satu pun tanda.
describe('deadBillOutcome — uang sah, tagihan mati', () => {
    const args = (rows) => ({
        billRows: rows, billTable: 'invoices',
        invoiceNumber: 'JFU-INV-af004b-1788319498664', amount: 444000,
    });

    it('tagihan pending TIDAK dicegat — jalur lama harus utuh', () => {
        expect(deadBillOutcome(args([{ status: 'pending', amount: 444000 }]))).toBeNull();
    });

    it('tagihan lunas TIDAK dicegat — pembayaran ulang/idempoten tetap lewat', () => {
        expect(deadBillOutcome(args([{ status: 'paid', amount: 444000 }]))).toBeNull();
    });

    it('tagihan cancelled dicegat sebagai paid_on_dead_bill', () => {
        const v = deadBillOutcome(args([{ status: 'cancelled', amount: 444000 }]));
        expect(v?.outcome).toBe('paid_on_dead_bill');
    });

    it('expired dan failed juga mati — rank 2 di payment_status_rank (sql/53)', () => {
        expect(deadBillOutcome(args([{ status: 'expired', amount: 1 }]))?.outcome).toBe('paid_on_dead_bill');
        expect(deadBillOutcome(args([{ status: 'failed', amount: 1 }]))?.outcome).toBe('paid_on_dead_bill');
    });

    it('grup CAMPURAN hidup+mati juga dicegat', () => {
        // Ini justru yang paling tidak boleh diterapkan otomatis: kita tidak
        // bisa tahu porsi mana yang dimaksud peneliti.
        const v = deadBillOutcome(args([
            { status: 'pending', amount: 200000 },
            { status: 'cancelled', amount: 244000 },
        ]));
        expect(v?.outcome).toBe('paid_on_dead_bill');
    });

    it('pesannya membawa nominal DAN status per baris', () => {
        // Sesudah sql/80 tidak ada tulisan sama sekali, jadi baris audit ini
        // satu-satunya yang menanggung uangnya. Pesan tanpa angka = admin harus
        // membuka DOKU untuk tahu apa yang terjadi.
        const v = deadBillOutcome(args([
            { status: 'pending', amount: 200000 },
            { status: 'cancelled', amount: 244000 },
        ]));
        expect(v.errorMessage).toContain('444000');
        expect(v.errorMessage).toContain('JFU-INV-af004b-1788319498664');
        expect(v.errorMessage).toContain('cancelled Rp 244000');
        expect(v.errorMessage).toContain('pending Rp 200000');
    });

    it('nol baris = bukan tagihan mati, itu urusan no_submission_found', () => {
        expect(deadBillOutcome(args([]))).toBeNull();
        expect(deadBillOutcome({ ...args([]), billRows: undefined })).toBeNull();
    });

    it('kosakata "mati" mengikuti payment_status_rank, bukan daftar sendiri', () => {
        // sql/53: paid/completed=3, expired/failed/cancelled=2, pending=1.
        // Dua definisi yang menyimpang = uang sungguhan salah rute.
        expect(isDeadBillStatus('CANCELLED')).toBe(true);
        expect(isDeadBillStatus('completed')).toBe(false);
        expect(isDeadBillStatus('pending')).toBe(false);
        expect(isDeadBillStatus(null)).toBe(false);
        expect(isDeadBillStatus(undefined)).toBe(false);
    });
});

// ============================================================================
// Tagihan gabungan: satu pembayaran, N jadwal
// ============================================================================
//
// Satu `payment_id` boleh dipakai N baris `invoices`/`transactions`. STEP 1a &
// STEP 2 memang sudah mem-PATCH semuanya sejak dulu; yang dulu hanya membaca
// baris [0] adalah STEP 3-5. Tanpa fan-out, N-1 jadwal terdampar `pending`
// dengan uang yang sudah masuk.
describe('collectPaidTargets — satu tugas per jadwal', () => {
    const txn = (o) => ({ form_submission_id: 'o1', schedule_id: 's1', entity_type: null, extend_id: null, ...o });

    it('N=1 menghasilkan tepat satu tugas (regresi jalur lama)', () => {
        const t = collectPaidTargets([txn()], [{ form_submission_id: 'o1', schedule_id: 's1' }], 'o1');
        expect(t).toHaveLength(1);
        expect(t[0].form_submission_id).toBe('o1');
        expect(t[0].schedule_id).toBe('s1');
    });

    it('N jadwal berbeda menghasilkan N tugas', () => {
        const t = collectPaidTargets([
            txn({ form_submission_id: 'o1', schedule_id: 's1' }),
            txn({ form_submission_id: 'o2', schedule_id: 's2' }),
            txn({ form_submission_id: 'o3', schedule_id: 's3' }),
        ], [], 'o1');
        expect(t.map((x) => x.schedule_id)).toEqual(['s1', 's2', 's3']);
        expect(t.map((x) => x.form_submission_id)).toEqual(['o1', 'o2', 'o3']);
    });

    it('baris invoices dan pasangan transaksinya tidak dihitung dua kali', () => {
        const t = collectPaidTargets(
            [txn({ schedule_id: 's1' }), txn({ form_submission_id: 'o2', schedule_id: 's2' })],
            [{ form_submission_id: 'o1', schedule_id: 's1' }, { form_submission_id: 'o2', schedule_id: 's2' }],
            'o1',
        );
        expect(t).toHaveLength(2);
    });

    it('baris transactions MENANG — hanya ia yang membawa rute extend', () => {
        // Kalau baris invoices yang menang, `entity_type` hilang dan pembayaran
        // perpanjangan salah rute: form_submissions yang di-PATCH, bukan jadwalnya.
        const t = collectPaidTargets(
            [txn({ schedule_id: 's9', entity_type: 'extend', extend_id: 'ext-9' })],
            [{ form_submission_id: 'o1', schedule_id: 's9', entity_type: null, extend_id: null }],
            'o1',
        );
        expect(t).toHaveLength(1);
        expect(t[0].entity_type).toBe('extend');
        expect(t[0].extend_id).toBe('ext-9');
    });

    it('jadwal yang hanya punya baris invoices tetap ikut (Skenario B)', () => {
        const t = collectPaidTargets([], [{ form_submission_id: 'o5', schedule_id: 's5' }], 'o5');
        expect(t).toHaveLength(1);
        expect(t[0].schedule_id).toBe('s5');
    });

    it('baris pra-sql/51 ber-schedule_id NULL dikunci per ORDER, seperti dulu', () => {
        const t = collectPaidTargets([
            txn({ form_submission_id: 'o7', schedule_id: null }),
            txn({ form_submission_id: 'o7', schedule_id: null }),
        ], [], 'o7');
        expect(t).toHaveLength(1);
        expect(t[0].schedule_id).toBeNull();
    });

    it('tidak pernah pulang kosong selama ordernya diketahui', () => {
        const t = collectPaidTargets([], [], 'o1');
        expect(t).toHaveLength(1);
        expect(t[0].form_submission_id).toBe('o1');
    });

    it('baris tanpa form_submission_id memakai id order dari STEP 1', () => {
        const t = collectPaidTargets([{ schedule_id: 's4' }], [], 'o4');
        expect(t[0].form_submission_id).toBe('o4');
    });
});
