import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { onRequest } from './create-payment.js';

/*
  create-payment.js SUNGGUHAN untuk order Kilat (Phase 5 §5.7, R6).

  Yang dikunci:
    - lewat batas bayar gelombang (gelombang − 60 menit) → 409 SEBELUM
      penulisan apa pun: nol PATCH/POST ke PostgREST, nol panggilan DOKU;
    - Kilat tanpa gelombang → 409;
    - instan gelombang dihitung dari tanggal WIB + `kilat_slot_hour`, bukan
      jam cermin (kasus e56f4853: cermin 15.00, gelombang 11.00);
    - umur link DOKU dipangkas ke batas bayar, berapa pun yang diminta browser;
    - link hidup yang melewati batas tidak dipakai ulang;
    - Iklan tidak menyentuh pembacaan gelombang sama sekali.
*/

const SUB_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
// Senin 19 Okt 2026. Gelombang 11.00 WIB = 04:00Z → batas bayar 03:00Z.
const WAVE_START = '2026-10-19T04:00:00+00:00';

const env = {
  VITE_SUPABASE_URL: 'https://proyek.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-palsu',
  DOKU_CLIENT_ID: 'klien',
  DOKU_SECRET_KEY: 'rahasia',
};

const subOf = (over = {}) => ({
  id: SUB_ID,
  created_at: '2026-10-19T00:30:00Z',
  total_cost: 0,
  title: 'Survei Kilat',
  full_name: 'Peneliti',
  email: 'p@kampus.ac.id',
  phone_number: '0812',
  payment_status: 'pending',
  slot_booked_by: 'user',
  slot_reserved_at: '2026-10-19T01:00:00Z',
  question_count: 20,
  duration: 1,
  winner_count: 2,
  prize_per_winner: 25000,
  voucher_code: '',
  distribution_type: 'kilat',
  start_date: '2026-10-19',
  ...over,
});

const responseOf = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let calls;
let state;

function installFetch() {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const u = String(url);
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ url: u, method, body: init.body });
    if (u.includes('/checkout/v1/payment')) {
      return responseOf({ response: { payment: { url: 'https://doku.test/pay/baru' } } });
    }
    if (method !== 'GET') return responseOf([], { status: 201 });
    if (u.includes('/form_submissions?')) return responseOf([state.sub]);
    if (u.includes('select=id,air_on_credit_at')) return responseOf([{ id: 'sch-1', air_on_credit_at: null }]);
    if (u.includes('select=start_date,kilat_slot_hour')) return responseOf(state.wave ? [state.wave] : []);
    if (u.includes('select=rate_locked_at')) return responseOf([{ rate_locked_at: '2026-10-19T00:30:00Z' }]);
    if (u.includes('select=id,start_date')) return responseOf([{ id: 'sch-1', start_date: state.wave?.start_date ?? null }]);
    if (u.includes('status=eq.pending')) return responseOf(state.liveBills);
    if (u.includes('/invoices?payment_id=eq.')) return responseOf([{ id: 'inv-1', amount: 1 }]);
    return responseOf([]);
  }));
}

const call = (body = {}) => onRequest({
  request: new Request('https://submit.jakpatforuniv.com/api/doku/create-payment', {
    method: 'POST',
    body: JSON.stringify({ formSubmissionId: SUB_ID, origin: 'https://submit.jakpatforuniv.com', ...body }),
    headers: { 'Content-Type': 'application/json' },
  }),
  env,
});

const writes = () => calls.filter((c) => c.method !== 'GET');
const dokuCalls = () => calls.filter((c) => c.url.includes('doku.com'));

beforeEach(() => {
  state = {
    sub: subOf(),
    wave: { start_date: WAVE_START, kilat_slot_hour: 11 },
    liveBills: [],
  };
  installFetch();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('create-payment — Kilat lewat batas bayar gelombang', () => {
  it('10.00.01 WIB untuk gelombang 11.00 → 409 kilat_pay_closed, tanpa satu penulisan pun', async () => {
    vi.setSystemTime(new Date('2026-10-19T03:00:01Z'));
    // Hold sengaja masih hidup — yang menolak harus batas gelombangnya.
    state.sub = subOf({ slot_reserved_at: '2026-10-19T02:30:00Z' });
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ kilat_pay_closed: true });
    expect(writes()).toEqual([]);
    expect(dokuCalls()).toEqual([]);
  });

  it('cermin 15.00 untuk gelombang 11.00 (e56f4853): batas dari jam gelombang, bukan jam cermin', async () => {
    // 12.00 WIB: lolos bila jam cermin (15.00 → batas 14.00) yang dibaca.
    vi.setSystemTime(new Date('2026-10-19T05:00:00Z'));
    state.sub = subOf({ slot_booked_by: 'admin', slot_reserved_at: null });
    state.wave = { start_date: '2026-10-19T08:00:00+00:00', kilat_slot_hour: 11 };
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ kilat_pay_closed: true });
    expect(dokuCalls()).toEqual([]);
  });

  it('Kilat tanpa gelombang → 409 kilat_wave_missing', async () => {
    vi.setSystemTime(new Date('2026-10-19T01:30:00Z'));
    state.wave = { start_date: WAVE_START, kilat_slot_hour: null };
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ kilat_wave_missing: true });
    expect(writes()).toEqual([]);
  });

  it('gagal membaca gelombang → 502, bukan lolos', async () => {
    vi.setSystemTime(new Date('2026-10-19T01:30:00Z'));
    const base = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url, init) =>
      String(url).includes('select=start_date,kilat_slot_hour')
        ? responseOf({ message: 'boom' }, { ok: false, status: 500 })
        : base(url, init)));
    const res = await call();
    expect(res.status).toBe(502);
    expect(dokuCalls()).toEqual([]);
  });
});

describe('create-payment — Kilat sebelum batas', () => {
  it('08.30 WIB: tagihan terbit, umur link dipangkas ke 90 menit (batas 10.00) walau browser minta 7 hari', async () => {
    vi.setSystemTime(new Date('2026-10-19T01:30:00Z'));
    const res = await call({ paymentDueDate: 60 * 24 * 7 });
    expect(res.status).toBe(200);
    const [doku] = dokuCalls();
    expect(JSON.parse(doku.body).payment.payment_due_date).toBe(90);
  });

  it('tepat di detik batas (10.00.00 WIB) masih boleh — lantai 1 menit', async () => {
    vi.setSystemTime(new Date('2026-10-19T03:00:00Z'));
    state.sub = subOf({ slot_booked_by: 'admin', slot_reserved_at: null });
    const res = await call({ paymentDueDate: 60 });
    expect(res.status).toBe(200);
    expect(JSON.parse(dokuCalls()[0].body).payment.payment_due_date).toBe(1);
  });

  it('link hidup yang melewati batas TIDAK dipakai ulang; yang di dalam batas dipakai ulang', async () => {
    vi.setSystemTime(new Date('2026-10-19T01:30:00Z'));
    const { computeTotalCostFromSubmission, pricingRowForSchedule } = await import('./create-payment.js');
    const amount = computeTotalCostFromSubmission(pricingRowForSchedule(state.sub, null, null, Date.parse('2026-10-19T00:30:00Z'))).total;
    const bill = (expires) => ({
      payment_id: 'JFU-lama', invoice_url: 'https://doku.test/pay/lama', amount,
      billed_start_date: WAVE_START, expires_at: expires, schedule_id: 'sch-1', doku_request_id: 'r',
    });

    state.liveBills = [bill('2026-10-26T01:00:00Z')];
    const late = await call();
    expect((await late.json()).reused).toBeUndefined();
    expect(dokuCalls().some((c) => c.url.includes('/checkout/v1/payment'))).toBe(true);

    installFetch();
    state.liveBills = [bill('2026-10-19T03:00:00Z')];
    const fresh = await call();
    expect(await fresh.json()).toMatchObject({ reused: true, payment_id: 'JFU-lama' });
    expect(dokuCalls()).toEqual([]);
  });
});

describe('create-payment — Iklan tidak tersentuh', () => {
  it('order regular tidak membaca gelombang dan tidak dipangkas', async () => {
    vi.setSystemTime(new Date('2026-10-19T01:30:00Z'));
    state.sub = subOf({ distribution_type: 'regular', duration: 2 });
    state.wave = { start_date: '2026-10-20T08:00:00+00:00', kilat_slot_hour: null };
    const res = await call({ paymentDueDate: 600 });
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.url.includes('select=start_date,kilat_slot_hour'))).toBe(false);
    expect(JSON.parse(dokuCalls()[0].body).payment.payment_due_date).toBe(600);
  });
});
