import { describe, it, expect } from 'vitest';
import {
  planCardActions, cardStateOf, isLateForSchedule, isEntryHoldLapsed, cardMoneyOf,
} from './scheduleCardActions';
import { planBulkInvoice } from '@/components/schedule/bulkInvoiceCandidates';
import { manualInvoiceLifetimeMinutes, MAX_INVOICE_MINUTES } from '@/utils/payment';
import { isOwedOnCredit } from '@/components/status/airingPeriods';
import { creditPhaseOf } from '@/components/status/scheduleAxes';
import { deriveOrderUiState, describeOrderForChat } from '@/components/status/deriveOrderUiState';
import type { FormSubmission } from '@/utils/supabase';
import { isTempoBillLocked, type AdScheduleEntry, type ScheduleBilling, type ScheduleInvoice } from '@/utils/supabase';

/*
  ═══════════════════════════════════════════════════════════════════════════
  TAYANG SEBELUM LUNAS + TAGIHAN TEMPO (sql/102)
  ═══════════════════════════════════════════════════════════════════════════
  Keputusan produk 28 Sep 2026 (K1–K10). Yang dikunci di sini adalah janji
  yang paling mudah patah diam-diam:
    • jadwal kredit tidak pernah terbaca "lewat batas bayar" / "kedaluwarsa";
    • utangnya tetap terhitung walau link DOKU-nya habis, dan walau iklannya
      dihentikan sesudah tayang (K6);
    • "Tayangkan Dulu" tidak pernah ditawarkan sebelum review lolos;
    • tagihan tempo terkunci dari pembatalan begitu ada yang tayang (K8).
*/

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-29T09:00:00Z'); // 16.00 WIB
const past = new Date(NOW - 2 * DAY).toISOString();
const future = new Date(NOW + 3 * DAY).toISOString();

const entry = (o: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
  id: 's1', submissionId: 'o1', ordinal: 1, isExtension: false, bookingId: 'AAAA1111',
  sourceId: 'o1', startDate: past, endDate: new Date(NOW + DAY).toISOString(),
  duration: 3, status: 'scheduled', reviewStatus: 'approved', paymentStatus: 'pending',
  distributionType: 'regular', kilatSlotHour: null, totalCost: 527_250, subtotal: 475_000,
  ppnAmount: 52_250, voucherCode: null, prizePerWinner: 0, winnerCount: 0,
  additionalPrizePerWinner: 0, isNewPeriod: false, periodBatch: null, createdAt: null,
  slotBookedBy: 'admin', slotReservedAt: null, title: 'T', researcherName: 'R',
  airOnCreditAt: past, airOnCreditNote: 'pelanggan rutin',
  ...o,
} as unknown as AdScheduleEntry);

const tempoInvoice = (o: Partial<ScheduleInvoice> = {}): ScheduleInvoice => ({
  paymentId: 'JFU-INV-t-1', amount: 527_250, status: 'pending', paymentUrl: 'https://doku/x',
  createdAt: past, source: 'invoice', voucherCode: null, attempts: 0, isSuperseded: false,
  paymentMethod: null, paymentChannel: null, isPaid: false, isDead: false, isPending: true,
  billedStartDate: past, expiresAt: past, isExpired: false, isStale: false,
  isTempo: true, tempoLinkLapsed: true,
  ...o,
});

const billingWith = (inv: ScheduleInvoice | null): ScheduleBilling => ({
  sourceId: 'o1',
  invoices: inv ? [inv] : [],
  billed: inv?.amount ?? 0,
  paid: 0,
  outstanding: inv?.amount ?? 0,
  isSettled: false,
  openInvoice: inv,
  paymentMethod: null,
  paymentChannel: null,
  staleInvoice: null,
});

const ALL = { markPaid: true, unmarkPaid: true, cancelSchedule: true, createInvoice: true, tempoInvoice: true };

describe('keadaan kartu jadwal kredit', () => {
  it('kredit + belum lunas = airing_on_credit, walau statusnya `scheduled`', () => {
    expect(cardStateOf(entry(), billingWith(tempoInvoice()))).toBe('airing_on_credit');
  });

  it('bukan kredit: `scheduled` + `pending` (order lama dibayar di luar sistem) TIDAK ikut', () => {
    // Bentuk yang sama dimiliki order lama — hanya `airOnCreditAt` yang membedakan.
    expect(cardStateOf(entry({ airOnCreditAt: null }), billingWith(null))).not.toBe('airing_on_credit');
  });

  it('K6: dihentikan SESUDAH tayang dengan tagihan tempo hidup → utangnya tetap terlihat', () => {
    expect(cardStateOf(entry({ status: 'cancelled' }), billingWith(tempoInvoice()))).toBe('airing_on_credit');
  });

  it('dibatalkan SEBELUM tayang (tagihannya ikut tertutup) → kembali `cancelled`', () => {
    expect(cardStateOf(entry({ status: 'cancelled' }), billingWith(null))).toBe('cancelled');
  });

  it('lunas mengalahkan kredit', () => {
    expect(cardStateOf(entry({ paymentStatus: 'paid' }), { ...billingWith(null), isSettled: true, billed: 1, paid: 1 }))
      .toBe('paid');
  });

  it('tidak pernah «lewat batas bayar» / «kedaluwarsa», tanggal tayangnya sudah lewat sekalipun', () => {
    const e = entry({ slotBookedBy: 'user', slotReservedAt: past });
    expect(isEntryHoldLapsed(e, NOW)).toBe(false);
    expect(isLateForSchedule(e, 'airing_on_credit', new Date(NOW))).toBe(false);
  });

  it('utang tempo dihitung walau link DOKU-nya sedang habis', () => {
    const money = cardMoneyOf(entry(), 'airing_on_credit', billingWith(tempoInvoice()), NOW);
    expect(money).toEqual({ billed: 527_250, paid: 0 });
  });
});

describe('aksi kartu', () => {
  const planFor = (state: Parameters<typeof planCardActions>[0]['state'], e: AdScheduleEntry, b: ScheduleBilling) =>
    planCardActions({ state, entry: e, billing: b, isLate: false, can: ALL });

  it('kredit tanpa tagihan: aksi utama "Buat Tagihan (tempo)"', () => {
    expect(planFor('airing_on_credit', entry(), billingWith(null)).primary?.id).toBe('tempo_invoice');
  });

  it('kredit bertagihan: aksi utama Tandai Lunas, dan TIDAK ada "Ganti Tanggal"', () => {
    const p = planFor('airing_on_credit', entry(), billingWith(tempoInvoice()));
    expect(p.primary?.id).toBe('mark_paid');
    expect(p.menu.map((a) => a.id)).not.toContain('schedule');
  });

  it('"Hentikan Tayang" merusak, di dasar menu', () => {
    const p = planFor('airing_on_credit', entry(), billingWith(tempoInvoice()));
    const last = p.menu[p.menu.length - 1];
    expect(last?.id).toBe('cancel_schedule');
    expect(last?.destructive).toBe(true);
  });

  it('"Tayangkan Dulu" ditawarkan di awaiting_invoice / waiting_payment / hold_lapsed', () => {
    const plain = entry({ airOnCreditAt: null, status: 'waiting_payment' });
    for (const s of ['awaiting_invoice', 'waiting_payment', 'hold_lapsed'] as const) {
      expect(planFor(s, plain, billingWith(null)).menu.map((a) => a.id)).toContain('tempo_invoice');
    }
  });

  it('"Tayangkan Dulu" TIDAK ditawarkan sebelum review lolos atau tanpa tanggal', () => {
    const inReview = entry({ airOnCreditAt: null, reviewStatus: 'in_review' });
    const noDate = entry({ airOnCreditAt: null, startDate: null });
    expect(planFor('awaiting_invoice', inReview, billingWith(null)).menu.map((a) => a.id)).not.toContain('tempo_invoice');
    expect(planFor('awaiting_invoice', noDate, billingWith(null)).menu.map((a) => a.id)).not.toContain('tempo_invoice');
  });

  it('tanpa handler tempo, aksinya tidak muncul sama sekali', () => {
    const p = planCardActions({
      state: 'awaiting_invoice', entry: entry({ airOnCreditAt: null }), billing: billingWith(null),
      isLate: false, can: { ...ALL, tempoInvoice: false },
    });
    expect(p.menu.map((a) => a.id)).not.toContain('tempo_invoice');
  });
});

describe('K8 — tagihan tempo terkunci begitu ada anggota yang tayang', () => {
  const group = (starts: (string | null)[], isTempo = true) => ({
    isTempo,
    members: starts.map((startDate) => ({ startDate })) as any,
  });

  it('ada anggota yang sudah mulai tayang → terkunci', () => {
    expect(isTempoBillLocked(group([future, past]), NOW)).toBe(true);
  });

  it('semua belum tayang → masih boleh dibatalkan (membetulkan salah nominal)', () => {
    expect(isTempoBillLocked(group([future, future]), NOW)).toBe(false);
  });

  it('tagihan biasa tidak pernah terkunci oleh aturan ini', () => {
    expect(isTempoBillLocked(group([past], false), NOW)).toBe(false);
  });
});

describe('umur link tagihan tempo', () => {
  it('tempo = 7 hari, tanpa melempar untuk tanggal yang SUDAH lewat', () => {
    expect(manualInvoiceLifetimeMinutes({ tempo: true, airingStartYmd: '2026-09-01' }, new Date(NOW)))
      .toBe(MAX_INVOICE_MINUTES);
  });

  it('bukan tempo: tanggal lampau tetap DITOLAK (null) — perilaku lama tidak berubah', () => {
    expect(manualInvoiceLifetimeMinutes({ airingStartYmd: '2026-09-01' }, new Date(NOW))).toBeNull();
  });
});

describe('tagihan gabungan dengan tempo', () => {
  const sub = { id: 'o1', formTitle: 'T', submittedAt: past, questionCount: 20 };
  const lapsed = entry({ airOnCreditAt: null, status: 'waiting_payment', slotBookedBy: 'admin' });

  it('jadwal lewat batas bayar DITOLAK tagihan biasa…', () => {
    const plan = planBulkInvoice({ submissions: [sub], entries: [lapsed], billings: new Map() });
    expect(plan.candidates).toHaveLength(0);
  });

  it('…dan DITERIMA tagihan tempo', () => {
    const plan = planBulkInvoice({ submissions: [sub], entries: [lapsed], billings: new Map(), tempo: true });
    expect(plan.candidates.map((c) => c.entry.id)).toEqual(['s1']);
  });

  it('tempo tetap menolak order yang belum lolos review', () => {
    const plan = planBulkInvoice({
      submissions: [sub],
      entries: [entry({ airOnCreditAt: null, reviewStatus: 'in_review', status: 'requested' })],
      billings: new Map(),
      tempo: true,
    });
    expect(plan.candidates).toHaveLength(0);
  });

  it('jadwal kredit yang SUDAH punya tagihan tempo tidak ditagih dua kali', () => {
    const plan = planBulkInvoice({
      submissions: [sub], entries: [entry()], billings: new Map([['s1', billingWith(tempoInvoice())]]), tempo: true,
    });
    expect(plan.candidates).toHaveLength(0);
  });
});

describe('dashboard peneliti — isOwedOnCredit', () => {
  const pay = (o: Partial<{ paymentUrl: string | null; paid: number; outstanding: number }> = {}) =>
    ({ paymentUrl: '/bayar/s1', paid: 0, outstanding: 527_250, ...o });

  it('kredit belum lunas → berutang (kartunya TIDAK boleh berbunyi "Lunas")', () => {
    expect(isOwedOnCredit(entry(), pay())).toBe(true);
  });

  it('lunas → tidak berutang', () => {
    expect(isOwedOnCredit(entry({ paymentStatus: 'paid' }), pay())).toBe(false);
    expect(isOwedOnCredit(entry(), pay({ paid: 527_250, outstanding: 0 }))).toBe(false);
  });

  it('dihentikan sesudah tayang dengan tagihan terbuka → tetap berutang (K6)', () => {
    expect(isOwedOnCredit(entry({ status: 'cancelled' }), pay())).toBe(true);
  });

  it('dibatalkan sebelum tayang tanpa tagihan → tidak berutang', () => {
    expect(isOwedOnCredit(entry({ status: 'cancelled' }), pay({ paymentUrl: null }))).toBe(false);
  });

  it('bukan kredit → tidak pernah', () => {
    expect(isOwedOnCredit(entry({ airOnCreditAt: null }), pay())).toBe(false);
  });
});

describe('dashboard peneliti — creditPhaseOf (kalimat chip kredit)', () => {
  const at = new Date(NOW);
  it('belum mulai → upcoming, BUKAN "Tayang"', () => {
    expect(creditPhaseOf(entry({ startDate: future, endDate: future }), at)).toBe('upcoming');
  });
  it('di dalam jendela → live', () => {
    expect(creditPhaseOf(entry(), at)).toBe('live');
  });
  it('jendela lewat → ended', () => {
    expect(creditPhaseOf(entry({ endDate: past }), at)).toBe('ended');
  });
  it('dihentikan tim → stopped, apa pun jam dindingnya', () => {
    expect(creditPhaseOf(entry({ status: 'cancelled' }), at)).toBe('stopped');
  });
});

describe('dashboard peneliti — deriveOrderUiState & konteks Mimin untuk kredit', () => {
  // deriveOrderUiState memakai jam dinding sungguhan — tanggalnya relatif ke sekarang.
  const now = Date.now();
  const sub = { id: 'o1', title: 'Survei T', distribution_type: 'regular', created_at: new Date(now - 5 * DAY).toISOString() } as unknown as FormSubmission;
  const upcoming = entry({ startDate: new Date(now + 2 * DAY).toISOString(), endDate: new Date(now + 3 * DAY).toISOString() });
  const payOpen = { o1: { paymentUrl: '/bayar/s1', paymentId: 'JFU-INV-t-1', scheduleId: 's1', status: 'pending', amount: 527_250, paid: 0, outstanding: 527_250, isExpired: false } } as never;

  it('kredit terjadwal: masuk "Butuh Aksi" dan Mimin TIDAK diberi tahu "lunas"', () => {
    const ui = deriveOrderUiState(sub, [upcoming], payOpen);
    expect(ui.owesOnCredit).toBe(true);
    expect(ui.needsAction).toBe(true);
    expect(ui.group).toBe('butuh-aksi');
    const chat = describeOrderForChat(sub, ui);
    expect(chat).not.toMatch(/Pembayaran: lunas/);
    expect(chat).not.toMatch(/pembayaran diterima/);
    expect(chat).toMatch(/BELUM dibayar/);
  });

  it('kredit yang dihentikan sesudah tayang: Mimin TIDAK menjanjikan jadwal ulang', () => {
    const stopped = entry({
      status: 'cancelled',
      startDate: new Date(now - 2 * DAY).toISOString(),
      endDate: new Date(now + DAY).toISOString(),
    });
    const ui = deriveOrderUiState(sub, [stopped], payOpen);
    expect(ui.firstCreditStopped).toBe(true);
    const chat = describeOrderForChat(sub, ui);
    expect(chat).toMatch(/DIHENTIKAN/);
    expect(chat).not.toMatch(/akan menjadwalkan ulang/);
    expect(chat).toMatch(/BELUM dibayar/);
  });

  it('kredit yang sudah lunas: kembali seperti order biasa', () => {
    const ui = deriveOrderUiState(sub, [entry({ ...upcoming, paymentStatus: 'paid' })], payOpen);
    expect(ui.owesOnCredit).toBe(false);
    expect(describeOrderForChat(sub, ui)).toMatch(/Pembayaran: lunas/);
  });

  it('bukan kredit: tidak berubah', () => {
    const ui = deriveOrderUiState(sub, [entry({ ...upcoming, airOnCreditAt: null })], payOpen);
    expect(ui.owesOnCredit).toBe(false);
    expect(ui.firstCreditStopped).toBe(false);
  });
});
