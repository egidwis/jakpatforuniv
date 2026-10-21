import { describe, expect, it } from 'vitest';
import type { BookingState, PublicationState, ScheduleCard } from './airingPeriods';
import { orderSummaryOf } from './orderSummary';

function card(
    state: BookingState,
    over: Partial<ScheduleCard['booking']> = {},
    extra: { key?: string; kind?: 'original' | 'extend'; pub?: PublicationState; start?: Date | null } = {},
): ScheduleCard {
    const start = extra.start === undefined ? new Date('2099-01-01T08:00:00Z') : extra.start;
    return {
        key: extra.key ?? 'original',
        kind: extra.kind ?? 'original',
        dateRange: start ? '1 – 2 Jan 2099' : '',
        startDate: start,
        endDate: start,
        booking: {
            state, amount: 1, payUrl: null, isExternalLink: false, paid: 0, outstanding: 1, group: null,
            deadline: null, deadlineCause: null, staleBilledFor: null, creditPhase: null, ...over,
        },
        publication: { state: extra.pub ?? 'none', start: null, end: null },
    } as unknown as ScheduleCard;
}

const self = { canSelfReschedule: true };

describe('orderSummaryOf — ringkasan kartu ponsel', () => {
    it('order dibatalkan: abu, tanpa tombol', () => {
        expect(orderSummaryOf('cancelled', [], self)).toMatchObject({ tone: 'slate', titleKey: 'reviewTitleCancelled', action: null });
    });

    it('perlu revisi: amber, tombolnya membuka detail (tempat memperbaiki ada di dalam kartu)', () => {
        expect(orderSummaryOf('revision', [], self)).toMatchObject({ tone: 'amber', titleKey: 'reviewTitleRejected', action: { kind: 'open_detail' } });
    });

    it('tanpa kartu dan bukan order mati → tidak ada ringkasan', () => {
        expect(orderSummaryOf('review_manual', [], self)).toBeNull();
    });

    it('menunggu bayar: amber + tombol bayar + tenggat BILA ada', () => {
        const deadline = new Date('2099-01-01T07:00:00Z');
        const s = orderSummaryOf('payment', [card('waiting_payment', { payUrl: '/bayar/x', isExternalLink: true, deadline, deadlineCause: 'slot' })], self)!;
        expect(s.tone).toBe('amber');
        expect(s.titleKey).toBe('bannerTitleWaitingPayment');
        expect(s.action).toMatchObject({ kind: 'pay' });
        expect(s.detail).toEqual({ kind: 'payBefore', deadline, cause: 'slot' });
    });

    it('menunggu bayar tanpa tenggat jujur → detail jatuh ke rentang tanggal, tak mengarang jam', () => {
        const s = orderSummaryOf('payment', [card('waiting_payment', { payUrl: '/bayar/x' })], self)!;
        expect(s.detail).toEqual({ kind: 'dateRange', text: '1 – 2 Jan 2099' });
    });

    it('sebagian sudah dibayar memakai judul "sebagian"', () => {
        const s = orderSummaryOf('payment', [card('waiting_payment', { payUrl: '/bayar/x', paid: 1, outstanding: 1 })], self)!;
        expect(s.titleKey).toBe('bannerTitleWaitingPaymentPartial');
    });

    it('anggota grup non-lead: abu, tombolnya hanya tautan ke tagihan gabungan, tanpa tenggat', () => {
        const group = { isLead: false, total: 9, paymentId: 'p9', memberCount: 3 } as ScheduleCard['booking']['group'];
        const s = orderSummaryOf('payment', [card('waiting_payment', { payUrl: '/bayar/x', group, deadline: new Date(), deadlineCause: 'slot' })], self)!;
        expect(s.tone).toBe('slate');
        expect(s.titleKey).toBe('groupBillFollowerTitle');
        expect(s.action).toEqual({ kind: 'view_bill', to: '/invoices/p9' });
        expect(s.detail?.kind).toBe('dateRange');
    });

    it('jadwal batal oleh tim: abu, nol tombol (bukan jadwal ulang)', () => {
        const s = orderSummaryOf('slot_cancelled', [card('slot_cancelled', {}, { start: null })], self)!;
        expect(s).toMatchObject({ tone: 'slate', titleKey: 'bannerTitleSlotCancelled', action: null, detail: null });
    });

    it('kedaluwarsa: amber; jalur mandiri dapat tombol, jalur manual tidak', () => {
        expect(orderSummaryOf('expired', [card('expired')], self)!.action).toEqual({ kind: 'reschedule' });
        expect(orderSummaryOf('expired', [card('expired')], { canSelfReschedule: false })!.action).toBeNull();
    });

    it('lunas: yang diceritakan penayangannya', () => {
        expect(orderSummaryOf('live', [card('paid', {}, { pub: 'live' })], self)).toMatchObject({ tone: 'emerald', titleKey: 'extStatusLive' });
        expect(orderSummaryOf('ready_to_launch', [card('paid', {}, { pub: 'scheduled' })], self)).toMatchObject({ tone: 'blue', titleKey: 'extStatusScheduled' });
        expect(orderSummaryOf('completed', [card('paid', {}, { pub: 'completed' })], self)).toMatchObject({ tone: 'slate', titleKey: 'extStatusCompleted' });
    });

    it('beberapa jadwal: yang paling mendesak jadi ringkasan, sisanya dihitung', () => {
        const a = card('paid', {}, { key: 'original', pub: 'live' });
        const b = card('waiting_payment', { payUrl: '/bayar/b' }, { key: 'ext-1', kind: 'extend' });
        const c = card('expired', {}, { key: 'ext-2', kind: 'extend' }); // jadwal ke-2: tak ada tombol mandiri
        const s = orderSummaryOf('extend_payment', [a, b, c], self)!;
        expect(s.titleKey).toBe('bannerTitleWaitingPayment');
        expect(s.action).toMatchObject({ kind: 'pay', href: '/bayar/b' });
        expect(s.moreNeedAction).toBe(0); // a tak punya tombol, c tak punya tombol mandiri
    });
});
