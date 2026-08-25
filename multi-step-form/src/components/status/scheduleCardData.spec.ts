import { describe, it, expect } from 'vitest';
import { buildScheduleCards } from './airingPeriods';
import type { OrderUiState } from './deriveOrderUiState';
import type { SchedulePaymentMap } from './scheduleAxes';
import type { AdScheduleEntry, FormSubmission } from '@/utils/supabase';

/*
  Yang dijaga di sini adalah tiga janji Track D yang semuanya bisa rusak tanpa
  membuat satu pun tes lain merah — karena ketiganya soal ANGKA & LABEL yang
  ditampilkan, bukan soal alur:

    1. Aturan emas — Kilat yang gelombangnya belum ditetapkan tidak boleh
       memasok jam tayang ke layar (`start_date`-nya 00:00 WIB penampung).
    2. Uang jadwal dibaca dari yang ditagih, bukan dihitung ulang dari tarif
       hari ini — fungsi yang sama dengan kartu drawer admin.
    3. `paid`/`outstanding` benar-benar sampai ke kartu, supaya jadwal yang
       sudah dibayar sebagian berhenti menyebut harga penuh.
*/

const scheduleOf = (over: Partial<AdScheduleEntry> = {}): AdScheduleEntry => ({
    id: 'sched-1',
    submissionId: 'sub-1',
    ordinal: 1,
    isExtension: false,
    bookingId: 'K3M9PQ7T',
    sourceId: 'sub-1',
    startDate: '2026-09-03T08:00:00.000Z',
    endDate: '2026-09-04T08:00:00.000Z',
    duration: 1,
    status: 'waiting_payment',
    reviewStatus: 'approved',
    paymentStatus: 'pending',
    distributionType: 'regular',
    kilatSlotHour: null,
    totalCost: 233_100,
    subtotal: 210_000,
    ppnAmount: 23_100,
    voucherCode: null,
    prizePerWinner: 30_000,
    winnerCount: 2,
    additionalPrizePerWinner: 0,
    isNewPeriod: false,
    periodBatch: null,
    slotBookedBy: 'user',
    slotReservedAt: '2026-09-02T01:00:00.000Z',
    title: 'Kuesioner uji',
    researcherName: 'Peneliti',
    university: null,
    submissionCreatedAt: '2026-09-01T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
    pageStatus: 'none',
    isExtraAd: false,
    pageBannerIsPlaceholder: false,
    ...over,
});

const submissionOf = (over: Partial<FormSubmission> = {}): FormSubmission => ({
    id: 'sub-1',
    question_count: 20,
    distribution_type: 'regular',
    ...over,
} as FormSubmission);

const uiOf = (first: AdScheduleEntry, later: AdScheduleEntry[] = []): OrderUiState => ({
    currentStep: 2,
    eff: {
        effectiveStep: 2,
        activeStart: null,
        activeEnd: null,
        activeSchedule: null,
        hasLaterAiring: false,
        waitingPayment: [],
    },
    first,
    later,
    isExpired: false,
    isSlotCancelled: false,
    isUserBooked: true,
    isPaid: false,
    awaitingInvoice: false,
    finalPaymentLink: 'https://pay.example/abc',
    paymentDeadline: new Date('2026-09-02T02:00:00.000Z'),
    paymentDeadlineCause: 'slot',
    isTooLateToday: false,
    callout: 'payment',
    needsAction: true,
    group: 'butuh-aksi',
});

const t = ((key: string) => key) as never;

describe('buildScheduleCards — aturan emas jam tayang', () => {
    it('Kilat tanpa gelombang TIDAK memasok jam tayang ke kartu', () => {
        const first = scheduleOf({
            distributionType: 'kilat',
            kilatSlotHour: null,
            // 00:00 WIB — nilai penampung, bukan jadwal.
            startDate: '2026-09-02T17:00:00.000Z',
        });
        const [card] = buildScheduleCards(uiOf(first), {}, null, t, submissionOf({ distribution_type: 'kilat' }));

        expect(card.info.isKilat).toBe(true);
        expect(card.info.kilatSlotHour).toBeNull();
    });

    it('Kilat yang gelombangnya SUDAH ditetapkan membawa jamnya', () => {
        const first = scheduleOf({ distributionType: 'kilat', kilatSlotHour: 11 });
        const [card] = buildScheduleCards(uiOf(first), {}, null, t, submissionOf({ distribution_type: 'kilat' }));

        expect(card.info.isKilat).toBe(true);
        expect(card.info.kilatSlotHour).toBe(11);
    });

    it('iklan reguler tidak pernah ditandai Kilat', () => {
        const [card] = buildScheduleCards(uiOf(scheduleOf()), {}, null, t, submissionOf());
        expect(card.info.isKilat).toBe(false);
    });
});

describe('buildScheduleCards — uang dibaca, bukan dihitung ulang', () => {
    it('memakai `total_cost` yang tersimpan, bukan tarif hari ini', () => {
        // Harga warisan yang TIDAK mungkin keluar dari rumus hari ini.
        const first = scheduleOf({ totalCost: 1_110_000, subtotal: 1_000_000, ppnAmount: 110_000 });
        const [card] = buildScheduleCards(uiOf(first), {}, null, t, submissionOf());

        expect(card.money.total).toBe(1_110_000);
        expect(card.money.isEstimate).toBe(false);
    });

    it('menandai ESTIMASI hanya untuk jadwal yang belum pernah ditagih', () => {
        const first = scheduleOf({ totalCost: 0, subtotal: null, ppnAmount: null });
        const [card] = buildScheduleCards(uiOf(first), {}, null, t, submissionOf());

        expect(card.money.isEstimate).toBe(true);
        expect(card.money.total).toBeGreaterThan(0);
    });
});

describe('buildScheduleCards — sebagian dibayar', () => {
    const payments: SchedulePaymentMap = {
        'sub-1': {
            paymentUrl: 'https://pay.example/abc',
            paymentId: 'pay-1',
            status: 'pending',
            amount: 233_100,
            paid: 100_000,
            outstanding: 133_100,
            staleBilledFor: null,
        },
    };

    it('membawa `paid` dan `outstanding` apa adanya ke kartu', () => {
        const [card] = buildScheduleCards(uiOf(scheduleOf()), payments, null, t, submissionOf());

        expect(card.booking.paid).toBe(100_000);
        expect(card.booking.outstanding).toBe(133_100);
        // `amount` tetap yang DITAGIH — dua angka berbeda, jangan tertukar.
        expect(card.booking.amount).toBe(233_100);
    });

    it('nol-kan keduanya saat jadwal itu belum punya catatan tagihan', () => {
        const [card] = buildScheduleCards(uiOf(scheduleOf()), {}, null, t, submissionOf());

        expect(card.booking.paid).toBe(0);
        expect(card.booking.outstanding).toBe(0);
    });
});
