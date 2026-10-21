import { describe, expect, it } from 'vitest';
import type { BookingState, ScheduleCard } from './airingPeriods';
import { primaryActionOf } from './orderAction';

type BookingOverrides = Partial<ScheduleCard['booking']>;

function card(state: BookingState, over: BookingOverrides = {}, kind: 'original' | 'extend' = 'original'): ScheduleCard {
    return {
        key: kind === 'original' ? 'original' : 'ext-1',
        kind,
        booking: {
            state,
            amount: 100_000,
            payUrl: null,
            isExternalLink: false,
            paid: 0,
            outstanding: 100_000,
            group: null,
            ...over,
        },
    } as unknown as ScheduleCard;
}

const self = { canSelfReschedule: true };
const team = { canSelfReschedule: false };

describe('primaryActionOf — aturan tombol untuk satu jadwal', () => {
    describe('choose_schedule', () => {
        it('selalu menawarkan pilih tanggal', () => {
            expect(primaryActionOf(card('choose_schedule'), self)).toEqual({ kind: 'choose_schedule' });
        });
    });

    describe('expired / too_late_today', () => {
        it.each(['expired', 'too_late_today'] as const)('%s: jadwal pertama jalur mandiri → jadwal ulang', (state) => {
            expect(primaryActionOf(card(state), self)).toEqual({ kind: 'reschedule' });
        });

        it.each(['expired', 'too_late_today'] as const)('%s: jalur manual (tanggal milik admin) → tanpa tombol', (state) => {
            expect(primaryActionOf(card(state), team)).toBeNull();
        });

        it.each(['expired', 'too_late_today'] as const)('%s: jadwal ke-2 dst. tak punya alur mandiri → tanpa tombol', (state) => {
            expect(primaryActionOf(card(state, {}, 'extend'), self)).toBeNull();
        });
    });

    describe('pembayaran', () => {
        const pay = { payUrl: '/bayar/abc', isExternalLink: true };

        it('tagihan biasa dengan link → bayar penuh, mengikuti jenis tautan', () => {
            expect(primaryActionOf(card('waiting_payment', pay), self)).toEqual({
                kind: 'pay', href: '/bayar/abc', external: true, label: 'full', groupTotal: undefined,
            });
            expect(primaryActionOf(card('waiting_payment', { payUrl: '/dashboard/payment/x', isExternalLink: false }), self))
                .toMatchObject({ kind: 'pay', external: false });
        });

        it('sebagian sudah dibayar → label "bayar sisa"', () => {
            expect(primaryActionOf(card('waiting_payment', { ...pay, paid: 40_000, outstanding: 60_000 }), self))
                .toMatchObject({ kind: 'pay', label: 'partial' });
        });

        it('lunas sebagian TANPA sisa tidak dihitung sebagian', () => {
            expect(primaryActionOf(card('waiting_payment', { ...pay, paid: 100_000, outstanding: 0 }), self))
                .toMatchObject({ label: 'full' });
        });

        it('tanpa link bayar → tanpa tombol (tagihan belum siap), bukan tombol mati', () => {
            expect(primaryActionOf(card('waiting_payment', { payUrl: null }), self)).toBeNull();
        });

        it('tagihan gabungan, lead → bayar dengan angka TOTAL GRUP', () => {
            const group = { isLead: true, total: 333_000, paymentId: 'p1', memberCount: 3 } as ScheduleCard['booking']['group'];
            expect(primaryActionOf(card('waiting_payment', { ...pay, group }), self))
                .toMatchObject({ kind: 'pay', label: 'group', groupTotal: 333_000 });
        });

        it('tagihan gabungan, BUKAN lead → tak pernah tombol bayar, hanya tautan ke tagihan gabungan', () => {
            const group = { isLead: false, total: 333_000, paymentId: 'p1', memberCount: 3 } as ScheduleCard['booking']['group'];
            // sekalipun kartu ini kebetulan membawa payUrl
            expect(primaryActionOf(card('waiting_payment', { ...pay, group }), self))
                .toEqual({ kind: 'view_bill', to: '/invoices/p1' });
        });

        it('tayang sebelum lunas (kredit) memakai aturan yang sama dengan waiting_payment', () => {
            expect(primaryActionOf(card('airing_on_credit', pay), self)).toMatchObject({ kind: 'pay', label: 'full' });
            expect(primaryActionOf(card('airing_on_credit', { payUrl: null }), self)).toBeNull();
        });
    });

    describe('keadaan tanpa langkah milik peneliti', () => {
        it.each([
            'in_review', 'awaiting_admin_schedule', 'awaiting_invoice', 'paid', 'cancelled',
        ] as const)('%s → tanpa tombol', (state) => {
            // sengaja diberi payUrl: kartu yang bukan keadaan bayar tak boleh menampilkannya
            expect(primaryActionOf(card(state, { payUrl: '/bayar/abc' }), self)).toBeNull();
        });

        it('slot_cancelled → TANPA tombol jadwal-ulang (itu menghidupkan kembali jadwal yang dibatalkan tim)', () => {
            expect(primaryActionOf(card('slot_cancelled', { payUrl: '/bayar/abc' }), self)).toBeNull();
        });
    });
});
