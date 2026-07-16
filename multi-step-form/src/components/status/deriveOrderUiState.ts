import type { FormSubmission, FormSubmissionExtend } from '@/utils/supabase';
import {
    getCurrentStepIndex,
    computeEffectiveExtendStatus,
    normalizeScheduleDate,
    type ExtendPaymentInfo,
    type EffectiveExtendStatus,
} from '@/components/ProgressTracker';

/**
 * Satu sumber kebenaran untuk state UI sebuah order. Dipakai oleh kartu
 * StatusPage (callout, badge, filter) dan konteks order yang disuntikkan
 * ke system prompt Mimin AI — supaya keduanya tidak pernah berbeda
 * pendapat soal "order ini butuh apa sekarang".
 */

export type OrderCalloutState =
    | 'revision'
    | 'review_manual'
    | 'review_auto'
    | 'choose_schedule'
    | 'payment'
    | 'awaiting_invoice'
    | 'expired'
    | 'extend_payment'
    | 'ready_to_launch'
    | 'live'
    | 'completed';

export type OrderGroup = 'butuh-aksi' | 'berjalan' | 'selesai';

export interface OrderUiState {
    /** Step efektif setelah koreksi expired (-1 = revisi) */
    currentStep: number;
    eff: EffectiveExtendStatus;
    isExpired: boolean;
    isUserBooked: boolean;
    isPaid: boolean;
    awaitingInvoice: boolean;
    /** Link bayar final, termasuk fallback checkout internal untuk slot user-booked */
    finalPaymentLink: string | null;
    /** Deadline bayar — HANYA untuk slot user-booked (slot_reserved_at + 1 jam) */
    paymentDeadline: Date | null;
    callout: OrderCalloutState;
    needsAction: boolean;
    group: OrderGroup;
}

/** Order lewat jalur review otomatis (import Google Form tanpa keyword data pribadi) */
export function isAutoReviewed(submission: FormSubmission): boolean {
    return (
        submission.submission_method !== 'manual' &&
        (submission.survey_url || '').includes('docs.google.com/forms') &&
        !(submission.detected_keywords && submission.detected_keywords.length > 0)
    );
}

const PAYMENT_WINDOW_MS = 3600_000; // 1 jam sejak slot_reserved_at

export function deriveOrderUiState(
    submission: FormSubmission,
    extendsList: FormSubmissionExtend[] = [],
    extendPayments: Record<string, ExtendPaymentInfo> = {},
    paymentLink: string | null = null
): OrderUiState {
    const eff = computeEffectiveExtendStatus(submission, extendsList, extendPayments);
    const rawStep = getCurrentStepIndex(submission) === -1 ? -1 : eff.effectiveStep;

    const isUserBooked = submission.slot_booked_by === 'user';
    const isPaymentExpired = submission.payment_status === 'expired';
    const isPaid =
        submission.payment_status === 'paid' ||
        ['paid', 'scheduled', 'live', 'completed'].includes(
            (submission.submission_status || '').toLowerCase()
        );
    const isExpired =
        rawStep !== -1 &&
        !isPaid &&
        (isPaymentExpired ||
            (isUserBooked &&
                !!submission.slot_reserved_at &&
                Date.now() > new Date(submission.slot_reserved_at).getTime() + PAYMENT_WINDOW_MS));

    // Slot kedaluwarsa → UI mundur ke step slot, apa pun kata DB
    const currentStep = isExpired ? 1 : rawStep;

    let finalPaymentLink = paymentLink;
    if (!finalPaymentLink && isUserBooked && !isExpired && currentStep === 2 && submission.id) {
        finalPaymentLink = `/dashboard/payment/${submission.id}`;
    }

    const awaitingInvoice = currentStep === 2 && !finalPaymentLink && !isExpired;

    const paymentDeadline =
        currentStep === 2 && !isExpired && isUserBooked && submission.slot_reserved_at
            ? new Date(new Date(submission.slot_reserved_at).getTime() + PAYMENT_WINDOW_MS)
            : null;

    const hasExtendAwaitingPayment = eff.waitingPaymentExtends.length > 0;

    let callout: OrderCalloutState;
    if (currentStep === -1) {
        callout = 'revision';
    } else if (isExpired) {
        callout = 'expired';
    } else if (hasExtendAwaitingPayment) {
        callout = 'extend_payment';
    } else if (currentStep === 0) {
        callout = isAutoReviewed(submission) ? 'review_auto' : 'review_manual';
    } else if (currentStep === 1) {
        callout = 'choose_schedule';
    } else if (currentStep === 2) {
        callout = awaitingInvoice ? 'awaiting_invoice' : 'payment';
    } else if (currentStep === 4) {
        callout = 'completed';
    } else {
        // Step 3 (publishing): bedakan sudah live vs menunggu jadwal mulai
        const now = new Date();
        const start = eff.activeStartDate ? normalizeScheduleDate(eff.activeStartDate) : null;
        const end = eff.activeEndDate ? normalizeScheduleDate(eff.activeEndDate) : null;
        const isLive =
            (submission.submission_status || '').toLowerCase() === 'live' ||
            !!(start && end && start <= now && end >= now);
        callout = isLive ? 'live' : 'ready_to_launch';
    }

    const needsAction =
        callout === 'revision' ||
        callout === 'expired' ||
        callout === 'extend_payment' ||
        callout === 'choose_schedule' ||
        (callout === 'payment' && !!finalPaymentLink);

    const group: OrderGroup = needsAction
        ? 'butuh-aksi'
        : currentStep === 4
            ? 'selesai'
            : 'berjalan';

    return {
        currentStep,
        eff,
        isExpired,
        isUserBooked,
        isPaid,
        awaitingInvoice,
        finalPaymentLink,
        paymentDeadline,
        callout,
        needsAction,
        group,
    };
}

/**
 * Ringkasan satu order untuk blok ORDER CONTEXT di system prompt Mimin AI.
 * Format kompak, data apa adanya — bot dilarang mengarang di luar ini.
 */
export function describeOrderForChat(submission: FormSubmission, ui: OrderUiState): string {
    const fmt = (d: string | null | undefined) =>
        d
            ? normalizeScheduleDate(d).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
            })
            : null;

    const statusText: Record<OrderCalloutState, string> = {
        revision: 'perlu revisi karena belum sesuai syarat & ketentuan (mis. menanyakan data pribadi responden); user bisa ajukan ulang dari halaman Order Saya',
        review_manual: 'sedang direview admin (maksimal 2 hari kerja, hari kerja Senin-Jumat)',
        review_auto: 'sedang direview otomatis (hasil dalam beberapa menit)',
        choose_schedule: 'sudah disetujui, menunggu user memilih jadwal tayang di halaman Order Saya',
        payment: 'menunggu pembayaran dari user',
        awaiting_invoice: 'slot sudah dipesan, menunggu admin menerbitkan tagihan (maksimal 1 hari kerja)',
        expired: 'pembayaran kedaluwarsa sehingga slot dilepas; user perlu memilih jadwal baru dari halaman Order Saya (tidak perlu submit ulang)',
        extend_payment: 'perpanjangan durasi menunggu pembayaran',
        ready_to_launch: 'pembayaran diterima, menunggu jadwal tayang',
        live: 'sedang tayang (diiklankan ke responden Jakpat)',
        completed: 'masa tayang selesai',
    };

    const lines: string[] = [];
    lines.push(`Order "${submission.title}" (layanan ${submission.distribution_type === 'kilat' ? 'Kilat' : 'Regular'})`);
    lines.push(`- Status: ${statusText[ui.callout]}`);

    const start = fmt(ui.eff.activeStartDate);
    const end = fmt(ui.eff.activeEndDate);
    if (start && end) {
        lines.push(`- Jadwal tayang: ${start} (mulai 15:00 WIB) sampai ${end}`);
    } else if (start) {
        lines.push(`- Jadwal tayang mulai: ${start} (15:00 WIB)`);
    } else {
        lines.push(`- Jadwal tayang: belum ditentukan`);
    }

    if (ui.callout === 'payment' && ui.paymentDeadline) {
        lines.push(
            `- Pembayaran: menunggu, batas waktu ${ui.paymentDeadline.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB hari ini (slot dilepas jika lewat)`
        );
    } else if (ui.callout === 'payment') {
        lines.push(`- Pembayaran: menunggu (link pembayaran tersedia di halaman Order Saya)`);
    } else if (ui.isPaid) {
        lines.push(`- Pembayaran: lunas`);
    }

    if (submission.created_at) {
        lines.push(`- Diajukan: ${fmt(submission.created_at)}`);
    }

    return lines.join('\n');
}
