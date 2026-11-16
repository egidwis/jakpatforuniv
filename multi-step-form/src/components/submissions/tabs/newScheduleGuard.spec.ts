import { describe, it, expect } from 'vitest';
import { newScheduleGuardOf, newScheduleGuardCopy } from './newScheduleGuard';
import { formatIDR } from '@/utils/currency';
import type { AdScheduleEntry } from '@/utils/supabase';

/*
  Pengaman ganda "Jadwal Iklan Baru" (admin). Insiden Mun#07–Mun12, 16 Nov 2026:
  admin bermaksud MEMINDAH tanggal, tapi membuat jadwal #2 — perpanjangan Rp 0
  tanpa reward, sementara #1 batal. Peneliti tidak akan pernah bisa melakukan
  ini (`scheduleAgainBlock`); admin bisa, dan sekarang harus sadar dua kali.
*/

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-16T09:00:00Z'); // 16.00 WIB
const iso = (d: number) => new Date(NOW + d * DAY).toISOString();

const e = (o: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 's1', submissionId: 'o1', ordinal: 1, isExtension: false, bookingId: 'KH7QQM9T',
  sourceId: 'o1', startDate: iso(1), endDate: iso(2), duration: 1, status: 'scheduled',
  reviewStatus: 'approved', paymentStatus: 'pending', distributionType: 'regular', kilatSlotHour: null,
  totalCost: 493_950, subtotal: 445_000, ppnAmount: 48_950, voucherCode: 'JFU-SUHUDENDYEAR',
  prizePerWinner: 35_000, winnerCount: 5, additionalPrizePerWinner: 0, isNewPeriod: false,
  periodBatch: '2026-11', createdAt: null, slotBookedBy: 'admin', slotReservedAt: null,
  title: 'Mun#07', researcherName: 'R', airOnCreditAt: null,
  ...o,
} as unknown as AdScheduleEntry);

const sub = (submission_status: string, distribution_type = 'regular') => ({ submission_status, distribution_type });

const e1Paid = e({ status: 'paid', paymentStatus: 'paid' });
const e1Cancelled = e({ status: 'cancelled', paymentStatus: 'expired', cancelledBy: 'admin' as any });
const e1CreditPending = e({ startDate: iso(-0.05), endDate: iso(0.95), airOnCreditAt: iso(-0.2) });
const e1WaitingPayment = e({ status: 'waiting_payment' });

describe('newScheduleGuardOf', () => {
  it('#1 lunas → null', () => expect(newScheduleGuardOf(sub('paid'), [e1Paid], NOW)).toBeNull());
  it('Kilat lunas → null', () => expect(newScheduleGuardOf(sub('paid', 'kilat'), [e1Paid], NOW)).toBeNull());

  it('order slot_cancelled, #1 batal → parent_cancelled, parent = #1', () => {
    const g = newScheduleGuardOf(sub('slot_cancelled'), [e1Cancelled], NOW)!;
    expect(g.cause).toBe('parent_cancelled');
    expect(g.parent.ordinal).toBe(1);
  });

  it('#1 tayang kredit belum lunas → parent_on_credit', () => {
    expect(newScheduleGuardOf(sub('scheduled'), [e1CreditPending], NOW)!.cause).toBe('parent_on_credit');
  });

  it('#1 menahan slot, belum lunas, bukan kredit → parent_unpaid', () => {
    expect(newScheduleGuardOf(sub('scheduled'), [e1WaitingPayment], NOW)!.cause).toBe('parent_unpaid');
  });

  it('parent = jadwal ber-ordinal TERKECIL yang menahan slot dan belum lunas', () => {
    const e2 = e({ id: 's2', ordinal: 2, isExtension: true, bookingId: 'EXT2', status: 'waiting_payment', startDate: iso(3), endDate: iso(4) });
    const g = newScheduleGuardOf(sub('paid'), [e2, e1Paid], NOW)!;
    expect(g.parent.bookingId).toBe('EXT2');
  });
});

describe('newScheduleGuardCopy', () => {
  it('parent_cancelled', () => {
    const c = newScheduleGuardCopy({ cause: 'parent_cancelled', parent: e1Cancelled });
    expect(c.title).toBe('Jadwal #1 (#KH7QQM9T) sudah dibatalkan');
    expect(c.lines[0]).toBe('Peneliti tidak bisa membuat jadwal baru di keadaan ini. Pastikan ini memang yang dimaksud.');
    expect(c.lines[1]).toContain(formatIDR(493_950));
    expect(c.lines[1]).toContain(`5 × ${formatIDR(35_000)}`);
    expect(c.lines[1]).toContain('Jadwal baru dicatat sebagai PERPANJANGAN');
    expect(c.lines.join(' ')).toContain('Jadwal #1 TIDAK ikut pindah ke tanggal baru');
    expect(c.confirmLabel).toBe('Tetap buat jadwal baru');
    expect(c.ackLabel).toBe('Saya paham: jadwal ini perpanjangan tanpa reward, dan jadwal sebelumnya tidak ikut pindah.');
  });

  it('parent_on_credit menunjuk ke Terbitkan Ulang Tagihan Tempo', () => {
    const c = newScheduleGuardCopy({ cause: 'parent_on_credit', parent: e1CreditPending });
    expect(c.title).toBe('Jadwal #1 (#KH7QQM9T) sedang tayang sebelum lunas');
    expect(c.lines.join(' ')).toContain('"Terbitkan Ulang Tagihan Tempo"');
  });

  it('parent_unpaid menunjuk ke Ganti Tanggal', () => {
    const c = newScheduleGuardCopy({ cause: 'parent_unpaid', parent: e1WaitingPayment });
    expect(c.title).toBe('Jadwal #1 (#KH7QQM9T) belum lunas');
    expect(c.lines.join(' ')).toContain('"Ganti Tanggal"');
  });

  it('parent tanpa reward → kalimat reward tidak disebut', () => {
    const c = newScheduleGuardCopy({ cause: 'parent_unpaid', parent: e({ status: 'waiting_payment', winnerCount: 0, prizePerWinner: 0 }) });
    expect(c.lines[1]).not.toContain('×');
    expect(c.lines[1]).toContain('Harga Tercatat');
  });
});
