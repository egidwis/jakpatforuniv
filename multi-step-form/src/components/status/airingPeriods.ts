import type { FormSubmission, FormSubmissionExtend } from '@/utils/supabase';
import type { TranslationKey } from '@/i18n/translations';
import {
    getCurrentStepIndex,
    normalizeScheduleDate,
    type ExtendPaymentInfo,
} from '@/components/ProgressTracker';
import { extendStatusLabelKey } from '@/utils/extend-ui';
import type { OrderUiState } from './deriveOrderUiState';

type TFn = (key: TranslationKey) => string;

export type BookingState =
    | 'choose_schedule'
    | 'awaiting_invoice'
    | 'waiting_payment'
    | 'expired'
    | 'paid'
    | 'cancelled';

export type PublicationState = 'none' | 'scheduled' | 'live' | 'completed';

export interface IncentiveInfo {
    mode: 'plain' | 'new_pool' | 'accumulated' | 'none_same_period';
    winnerCount?: number;
    prizePerWinner?: number;
    additionalPrize?: number;
}

/**
 * Satu jadwal iklan (jendela tayang) — jadwal asli maupun perpanjangan —
 * sebagai unit setara membawa tiga blok data sendiri: Info (administrasi),
 * Booking & Pembayaran, dan Penayangan. Menggantikan model stepper: tidak
 * ada lagi konsep "langkah" abstrak, tiap fakta membawa rumahnya sendiri.
 */
export interface ScheduleCard {
    key: string; // 'original' | extend.id
    kind: 'original' | 'extend';
    label: string;
    /** 1, 2, 3, ... — dipakai di trigger accordion sebagai "#1" dkk, supaya
     * tidak mengulang kata "Jadwal Iklan" yang sudah jadi judul fase. */
    ordinal: number;
    dateRange: string;
    startDate: Date | null;
    endDate: Date | null;
    /** Key gaya chip ringkasan baris (kosakata extend-ui) */
    chipStatus: string;
    chipLabel: string;
    info: {
        id: string;
        createdAt: string | null;
        duration: number;
        periodBatch: string | null;
        incentive: IncentiveInfo | null;
        voucherCode: string | null;
    };
    booking: {
        state: BookingState;
        amount: number;
        payUrl: string | null;
        isExternalLink: boolean;
        /** Deadline bayar — hanya untuk slot user-booked jadwal asli */
        deadline: Date | null;
        invoicePaymentId: string | null;
        isPaidForLabel: boolean; // menentukan label "Invoice" vs "Kwitansi"
    };
    publication: {
        state: PublicationState;
        start: Date | null;
        end: Date | null;
    };
}

const fmtShort = (d: Date | null) =>
    d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '—';

function buildIncentive(ext: FormSubmissionExtend | undefined, submission: FormSubmission): IncentiveInfo | null {
    if (ext) {
        if (ext.is_new_month && ext.prize_per_winner && ext.prize_per_winner > 0) {
            return { mode: 'new_pool', winnerCount: ext.winner_count, prizePerWinner: ext.prize_per_winner };
        }
        if (ext.additional_prize_per_winner && ext.additional_prize_per_winner > 0) {
            return { mode: 'accumulated', additionalPrize: ext.additional_prize_per_winner };
        }
        return { mode: 'none_same_period' };
    }
    if (submission.winner_count && submission.prize_per_winner) {
        return { mode: 'plain', winnerCount: submission.winner_count, prizePerWinner: submission.prize_per_winner };
    }
    return null;
}

/**
 * Susun daftar jadwal iklan (asli + tiap perpanjangan) sebagai unit setara.
 * Jadwal asli hanya muncul setelah order lolos review (step >= 1) — sebelum
 * itu, kartu order masih di Fase Review, belum ada jadwal untuk ditampilkan.
 */
export function buildScheduleCards(
    submission: FormSubmission,
    ui: OrderUiState,
    extendsList: FormSubmissionExtend[],
    payments: Record<string, ExtendPaymentInfo>,
    invoiceId: string | null,
    t: TFn
): ScheduleCard[] {
    const now = new Date();
    const cards: ScheduleCard[] = [];
    const rawStep = getCurrentStepIndex(submission);
    const totalPeriods = 1 + extendsList.length;

    if (rawStep >= 1 || ui.isExpired) {
        const step = ui.isExpired ? 1 : rawStep;
        const oStart = submission.start_date ? normalizeScheduleDate(submission.start_date) : null;
        const oEnd = submission.end_date ? normalizeScheduleDate(submission.end_date) : null;

        let bookingState: BookingState;
        if (ui.isExpired) bookingState = 'expired';
        else if (step === 1) bookingState = 'choose_schedule';
        else if (step === 2) bookingState = ui.finalPaymentLink ? 'waiting_payment' : 'awaiting_invoice';
        else bookingState = 'paid'; // step 3 atau 4

        let pubState: PublicationState = 'none';
        if (bookingState === 'paid') {
            if (step === 4) pubState = 'completed';
            else {
                const isLive =
                    (submission.submission_status || '').toLowerCase() === 'live' ||
                    !!(oStart && oEnd && oStart <= now && oEnd >= now);
                pubState = isLive ? 'live' : 'scheduled';
            }
        }

        let chipStatus: string;
        let chipLabel: string;
        if (bookingState === 'expired') {
            chipStatus = 'expired';
            chipLabel = t(extendStatusLabelKey('expired'));
        } else if (pubState === 'completed' || pubState === 'live' || pubState === 'scheduled') {
            chipStatus = pubState;
            chipLabel = t(extendStatusLabelKey(pubState));
        } else if (bookingState === 'waiting_payment') {
            chipStatus = 'waiting_payment';
            chipLabel = t(extendStatusLabelKey('waiting_payment'));
        } else {
            chipStatus = 'in_review';
            chipLabel = bookingState === 'choose_schedule' ? 'Pilih Jadwal' : 'Menunggu Tagihan';
        }

        cards.push({
            key: 'original',
            kind: 'original',
            label: totalPeriods > 1 ? `${t('airingPeriodLabel')} 1` : t('airingPeriodLabel'),
            ordinal: 1,
            dateRange: oStart || oEnd ? `${fmtShort(oStart)}–${fmtShort(oEnd)}` : '—',
            startDate: oStart,
            endDate: oEnd,
            chipStatus,
            chipLabel,
            info: {
                id: submission.id || '',
                createdAt: submission.created_at || null,
                duration: submission.duration,
                periodBatch: null,
                incentive: buildIncentive(undefined, submission),
                voucherCode: submission.voucher_code || null,
            },
            booking: {
                state: bookingState,
                amount: submission.total_cost,
                payUrl: bookingState === 'waiting_payment' ? ui.finalPaymentLink : null,
                isExternalLink: !!ui.finalPaymentLink && !ui.finalPaymentLink.startsWith('/dashboard'),
                deadline: ui.paymentDeadline,
                invoicePaymentId: invoiceId,
                isPaidForLabel: ui.isPaid,
            },
            publication: {
                state: pubState,
                start: oStart,
                end: oEnd,
            },
        });
    }

    const sorted = [...extendsList].sort((a, b) => {
        const as = a.start_date
            ? normalizeScheduleDate(a.start_date).getTime()
            : a.created_at ? new Date(a.created_at).getTime() : 0;
        const bs = b.start_date
            ? normalizeScheduleDate(b.start_date).getTime()
            : b.created_at ? new Date(b.created_at).getTime() : 0;
        return as - bs;
    });

    sorted.forEach((ext, i) => {
        const pay = ext.id ? payments[ext.id] || null : null;
        const status = (ext.submission_status || 'waiting_payment').toLowerCase();
        const start = ext.start_date ? normalizeScheduleDate(ext.start_date) : null;
        const end = ext.end_date ? normalizeScheduleDate(ext.end_date) : null;

        let bookingState: BookingState;
        if (status === 'cancelled') bookingState = 'cancelled';
        else if (status === 'waiting_payment') {
            if (pay?.status === 'expired') bookingState = 'expired';
            else if (pay?.status === 'pending' && pay.paymentUrl) bookingState = 'waiting_payment';
            else bookingState = 'awaiting_invoice'; // admin belum menerbitkan tagihan perpanjangan
        } else {
            bookingState = 'paid';
        }

        let pubState: PublicationState = 'none';
        if (bookingState === 'paid') {
            if (status === 'completed') pubState = 'completed';
            else if (status === 'live') pubState = 'live';
            else if (end && end < now) pubState = 'completed';
            else if (start && end && start <= now && end >= now) pubState = 'live';
            else pubState = 'scheduled';
        }

        let chipStatus: string;
        let chipLabel: string;
        if (bookingState === 'cancelled') {
            chipStatus = 'cancelled';
            chipLabel = t(extendStatusLabelKey('cancelled'));
        } else if (bookingState === 'expired') {
            chipStatus = 'expired';
            chipLabel = t(extendStatusLabelKey('expired'));
        } else if (pubState === 'completed' || pubState === 'live' || pubState === 'scheduled') {
            chipStatus = pubState;
            chipLabel = t(extendStatusLabelKey(pubState));
        } else if (bookingState === 'waiting_payment') {
            chipStatus = 'waiting_payment';
            chipLabel = t(extendStatusLabelKey('waiting_payment'));
        } else {
            chipStatus = 'in_review';
            chipLabel = 'Menunggu Tagihan';
        }

        cards.push({
            key: ext.id || `ext-${i}`,
            kind: 'extend',
            label: `${t('airingPeriodLabel')} ${i + 2}`,
            ordinal: i + 2,
            dateRange: start || end ? `${fmtShort(start)}–${fmtShort(end)}` : '—',
            startDate: start,
            endDate: end,
            chipStatus,
            chipLabel,
            info: {
                id: ext.id || '',
                createdAt: ext.created_at || null,
                duration: ext.duration,
                periodBatch: ext.period_batch || null,
                incentive: buildIncentive(ext, submission),
                voucherCode: ext.voucher_code || null,
            },
            booking: {
                state: bookingState,
                amount: pay?.amount || ext.total_cost,
                payUrl: bookingState === 'waiting_payment' ? pay?.paymentUrl || null : null,
                isExternalLink: true,
                deadline: null,
                invoicePaymentId: pay?.paymentId || null,
                isPaidForLabel: bookingState === 'paid',
            },
            publication: {
                state: pubState,
                start,
                end,
            },
        });
    });

    return cards;
}

/**
 * Kartu yang terbuka default: yang paling butuh perhatian user sekarang.
 * Prioritas: butuh bayar > sedang tayang > terjadwal terdekat > selesai
 * terakhir > kartu pertama yang belum dibatalkan.
 */
export function pickDefaultExpandedKey(cards: ScheduleCard[]): string {
    const needsPay = cards.find((c) => c.booking.state === 'waiting_payment' || c.booking.state === 'expired');
    if (needsPay) return needsPay.key;

    const live = cards.find((c) => c.publication.state === 'live');
    if (live) return live.key;

    const now = Date.now();
    const upcoming = cards
        .filter((c) => c.publication.state === 'scheduled' && c.startDate && c.startDate.getTime() > now)
        .sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime())[0];
    if (upcoming) return upcoming.key;

    const lastCompleted = cards
        .filter((c) => c.publication.state === 'completed' && c.endDate)
        .sort((a, b) => b.endDate!.getTime() - a.endDate!.getTime())[0];
    if (lastCompleted) return lastCompleted.key;

    return cards.find((c) => c.booking.state !== 'cancelled')?.key || cards[0]?.key || 'original';
}
