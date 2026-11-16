import { describe, it, expect } from 'vitest';
import {
  aggregateCustomers, attachWebinarTickets, customerTier, mergeProfileOnlyCustomers, webinarTicketCount, webinarTicketSummary,
  type Customer, type RawSubmission,
} from './types';
import type { WebinarBuyerTicket } from '@/utils/webinarAdminApi';

/*
  Fase 4 webinar: pembeli tiket punya akun (wajib login) tetapi tidak punya
  pesanan iklan, jadi tanpa penanda mereka tampil sebagai "Belum Paid (Rp 0)".
  Akun yang hanya membeli webinar pindah ke tier `webinar`; akun yang punya
  pesanan iklan tetap di tier lamanya dan hanya diberi chip.
*/

const sub = (over: Partial<RawSubmission>): RawSubmission => ({
  id: 'x', auth_user_id: null, full_name: null, email: null, phone_number: null,
  university: null, department: null, status: null, total_cost: 0,
  payment_status: null, submission_status: null, title: null,
  created_at: '2026-01-01T00:00:00Z', actual_paid: 0, ...over,
});

const ticket = (over: Partial<WebinarBuyerTicket> = {}): WebinarBuyerTicket => ({
  order_id: 'o-1', auth_user_id: 'acc-web', kind: 'live', status: 'paid', amount: 1000,
  paid_at: '2026-11-05T23:04:00Z', invoice_number: 'WBN-C416139F-1793919821265',
  event_title: 'Uji Webinar', event_starts_at: '2026-11-09T03:00:00Z', is_test: true, ...over,
});

const profile = (id: string) => ({
  id, full_name: `Nama ${id}`, email: `${id}@mail.com`, phone_number: null, university: null,
  department: null, status: null, referral_source: null,
});

function build(): Customer[] {
  const fromOrders = aggregateCustomers([
    sub({ id: 's1', auth_user_id: 'acc-unpaid', payment_status: 'pending' }),
    sub({ id: 's2', auth_user_id: 'acc-paid', payment_status: 'paid', actual_paid: 500_000 }),
  ], new Map());
  return mergeProfileOnlyCustomers(fromOrders, [profile('acc-unpaid'), profile('acc-paid'), profile('acc-web'), profile('acc-none')]);
}

describe('attachWebinarTickets', () => {
  it('menempelkan tiket lewat authUserId, urutan tiket dipertahankan', () => {
    const out = attachWebinarTickets(build(), [
      ticket({ order_id: 'a', auth_user_id: 'acc-web' }),
      ticket({ order_id: 'b', auth_user_id: 'acc-unpaid' }),
      ticket({ order_id: 'c', auth_user_id: 'acc-web', status: 'refunded' }),
    ]);
    const byId = new Map(out.map((c) => [c.authUserId, c]));
    expect(byId.get('acc-web')!.webinarTickets!.map((t) => t.order_id)).toEqual(['a', 'c']);
    expect(byId.get('acc-unpaid')!.webinarTickets!.map((t) => t.order_id)).toEqual(['b']);
    expect(byId.get('acc-none')!.webinarTickets).toEqual([]);
    expect(webinarTicketCount(byId.get('acc-web')!)).toBe(2);
  });

  it('tidak mengubah daftar masukan', () => {
    const input = build();
    attachWebinarTickets(input, [ticket()]);
    expect(input.every((c) => c.webinarTickets === undefined)).toBe(true);
  });

  it('tiket untuk akun yang tidak ada di daftar diabaikan, tidak membuat customer baru', () => {
    expect(attachWebinarTickets(build(), [ticket({ auth_user_id: 'tak-dikenal' })])).toHaveLength(4);
  });
});

describe('customerTier dengan webinar', () => {
  const tiers = () => {
    const out = attachWebinarTickets(build(), [
      ticket({ auth_user_id: 'acc-web' }),
      ticket({ order_id: 'b', auth_user_id: 'acc-unpaid' }),
      ticket({ order_id: 'c', auth_user_id: 'acc-paid' }),
    ]);
    return Object.fromEntries(out.map((c) => [c.authUserId, customerTier(c)]));
  };

  it('tanpa pesanan iklan + tiket → webinar (bukan Belum Paid)', () => {
    expect(tiers()['acc-web']).toBe('webinar');
  });

  it('pesanan iklan belum bayar + tiket → tetap unpaid (diberi chip saja)', () => {
    expect(tiers()['acc-unpaid']).toBe('unpaid');
  });

  it('pesanan lunas + tiket → tier lama', () => {
    expect(tiers()['acc-paid']).toBe('new');
  });

  it('tanpa pesanan dan tanpa tiket → unpaid seperti dulu', () => {
    expect(tiers()['acc-none']).toBe('unpaid');
  });
});

describe('webinarTicketSummary', () => {
  it('tanggal acara WIB · harga · status', () => {
    // 9 Nov 03.00 UTC = Sen, 9 Nov 10.00 WIB; 16 Nov 17.30 UTC = Sel, 17 Nov 00.30 WIB
    expect(webinarTicketSummary(ticket())).toMatch(/^Sen, 9 Nov 2026 · Rp\s?1\.000 · Lunas$/);
    expect(webinarTicketSummary(ticket({ event_starts_at: '2026-11-16T17:30:00Z', status: 'refunded' }))).toMatch(/^Sel, 17 Nov 2026 · .* · Refund$/);
  });

  it('video kelas dan acara tanpa jadwal', () => {
    expect(webinarTicketSummary(ticket({ kind: 'replay', event_starts_at: null }))).toMatch(/^Video kelas · Rp\s?1\.000 · Lunas$/);
  });
});
