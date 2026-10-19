import { describe, it, expect, vi, afterEach } from 'vitest';
// @ts-ignore -- Pages Function tanpa deklarasi tipe
import { onRequest } from './order.js';
import {
  KILAT_VOUCHER_CODES, calculateDiscount, calculateIncentiveCost, calculatePpn,
  calculateTotalAdCost, kilatSubtotalAt, rateInstantOf, voucherInstantOf,
} from '../../../src/utils/cost-calculator';

/*
  "Jadikan Kilat/Iklan" pindah ke /api/admin/order (aksi `convert`, seri
  keamanan 19 Okt): harga dihitung SERVER lewat computeTotalCostFromSubmission.
  Yang dikunci di sini: angka server = rumus klien lama di
  convertDistributionType (kilatSubtotalAt / tarif × durasi − voucher), untuk
  Kilat dengan voucher ambassador, JFUTGRX, dan voucher Iklan yang tidak
  berlaku untuk Kilat. Handler SUNGGUHAN dipanggil; jaringan dipalsukan.
*/

const ENV = {
  VITE_SUPABASE_URL: 'https://db.example.test',
  VITE_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  ADMIN_EMAILS: 'product@jakpat.net',
};
const ID = 'b7eb61ca-079a-4787-9787-be253b0a1111';
const LOCKED = '2026-10-10T03:00:00Z';
const AMBASSADOR = KILAT_VOUCHER_CODES.find((c) => c !== 'JFUTGRX')!;

const orderOf = (over: Record<string, unknown> = {}) => ({
  id: ID, question_count: 40, duration: 3, winner_count: 2, prize_per_winner: 25_000,
  voucher_code: null, distribution_type: 'regular', payment_status: 'pending',
  submission_status: 'slot_reserved', created_at: '2026-10-01T00:00:00Z', ...over,
});

function network(sub: Record<string, unknown>) {
  const patches: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any = {}) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ email: 'product@jakpat.net' }));
    if (u.includes('/rest/v1/form_submissions') && init.method === 'PATCH') {
      patches.push(JSON.parse(init.body));
      return new Response(JSON.stringify([{ id: ID }]));
    }
    if (u.includes('/rest/v1/form_submissions')) return new Response(JSON.stringify([sub]));
    if (u.includes('/rest/v1/ad_schedules') && u.includes('rate_locked_at')) {
      return new Response(JSON.stringify([{ rate_locked_at: LOCKED }]));
    }
    if (u.includes('/rest/v1/ad_schedules')) return new Response(JSON.stringify([{ id: 's1' }]));
    if (u.includes('/rest/v1/survey_pages')) return new Response('[]');
    return new Response('[]', { status: 404 });
  }));
  return { patches };
}

const convert = (target: 'kilat' | 'regular') => onRequest({
  request: new Request('https://x.test/api/admin/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer jwt' },
    body: JSON.stringify({ action: 'convert', submissionId: ID, target }),
  }),
  env: ENV,
});

// Rumus klien convertDistributionType, apa adanya.
function clientMoney(sub: ReturnType<typeof orderOf>, target: 'kilat' | 'regular') {
  const rateAt = rateInstantOf(LOCKED);
  const incentive = calculateIncentiveCost(sub.winner_count, sub.prize_per_winner);
  let subtotal: number;
  if (target === 'kilat') {
    subtotal = kilatSubtotalAt(sub.question_count, rateAt, sub.voucher_code, incentive);
  } else {
    const adCost = calculateTotalAdCost(sub.question_count, sub.duration, rateAt);
    subtotal = adCost + incentive - calculateDiscount(
      sub.voucher_code ?? undefined, adCost, incentive, sub.duration, voucherInstantOf(sub.created_at),
    );
  }
  const ppn = calculatePpn(subtotal);
  return { subtotal, ppn_amount: ppn, total_cost: subtotal + ppn };
}

afterEach(() => vi.unstubAllGlobals());

describe('/api/admin/order convert — harga server = rumus klien', () => {
  it.each([
    ['Kilat tanpa voucher', 'kilat', {}],
    ['Kilat + ambassador', 'kilat', { voucher_code: AMBASSADOR }],
    ['Kilat + JFUTGRX', 'kilat', { voucher_code: 'JFUTGRX' }],
    ['Kilat + voucher Iklan (tak berlaku untuk Kilat)', 'kilat', { voucher_code: 'JFUFEB' }],
    ['kembali ke Iklan + ambassador', 'regular', { distribution_type: 'kilat', voucher_code: AMBASSADOR }],
  ] as const)('%s', async (_, target, over) => {
    const sub = orderOf(over);
    const { patches } = network(sub);
    const res = await convert(target);
    expect(res.status).toBe(200);
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      ...clientMoney(sub, target),
      distribution_type: target,
      submission_status: 'approved',
      start_date: null, end_date: null, kilat_slot_hour: null,
    });
  });

  it('JFUTGRX pada Kilat = Rp1.000 (keputusan 16 Okt, opsi A)', async () => {
    const { patches } = network(orderOf({ voucher_code: 'JFUTGRX' }));
    await convert('kilat');
    expect(patches[0].subtotal).toBe(1_000);
  });
});
