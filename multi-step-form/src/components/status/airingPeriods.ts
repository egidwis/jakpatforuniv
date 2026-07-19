import type { FormSubmission, FormSubmissionExtend } from '@/utils/supabase';
import type { TranslationKey } from '@/i18n/translations';
import {
    getCurrentStepIndex,
    getStatusSteps,
    normalizeScheduleDate,
    type ExtendPaymentInfo,
} from '@/components/ProgressTracker';
import { extendStatusLabelKey } from '@/utils/extend-ui';
import { isAutoReviewed, type OrderUiState } from './deriveOrderUiState';

type TFn = (key: TranslationKey) => string;

export interface PeriodStepDef {
    key: string;
    label: string;
}

/**
 * Satu periode tayang sebagai unit setara — periode asli maupun perpanjangan.
 * Order dan extend punya lifecycle berbeda (extend tidak pernah melewati
 * review/slot), jadi tiap periode membawa daftar step-nya sendiri.
 */
export interface AiringPeriod {
    key: string; // 'original' | extend.id
    kind: 'original' | 'extend';
    label: string;
    startDate: Date | null;
    endDate: Date | null;
    dateRange: string;
    /** Key gaya chip (kosakata extend-ui: waiting_payment/scheduled/live/completed/cancelled/expired/in_review) */
    chipStatus: string;
    chipLabel: string;
    steps: PeriodStepDef[];
    /** Index step aktif — monoton, tidak pernah ditarik mundur periode lain */
    currentStep: number;
    /** false untuk extend cancelled (baris ringkas saja, tanpa stepper) */
    expandable: boolean;
    ext?: FormSubmissionExtend;
    pay?: ExtendPaymentInfo | null;
    hasExpiredPaymentLink: boolean;
}

const fmtShort = (d: Date | null) =>
    d ? d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '—';

/** Step milik periode perpanjangan: Pembayaran → Terjadwal → Tayang → Selesai */
export function getExtendSteps(t: TFn): PeriodStepDef[] {
    return [
        { key: 'payment', label: t('extStepPayment') },
        { key: 'scheduled', label: t('extStatusScheduled') },
        { key: 'live', label: t('extStatusLive') },
        { key: 'completed', label: t('extStatusCompleted') },
    ];
}

/** Posisi step sebuah extend dari submission_status-nya (+ tanggal utk live/selesai by-date). */
export function getExtendStepIndex(ext: FormSubmissionExtend): number {
    const status = (ext.submission_status || 'waiting_payment').toLowerCase();
    if (status === 'completed') return 3;
    if (status === 'live') return 2;
    if (status === 'paid' || status === 'scheduled') {
        const now = new Date();
        const start = ext.start_date ? normalizeScheduleDate(ext.start_date) : null;
        const end = ext.end_date ? normalizeScheduleDate(ext.end_date) : null;
        if (end && end < now) return 3;
        if (start && end && start <= now && end >= now) return 2;
        return 1;
    }
    return 0; // waiting_payment / cancelled / unknown
}

/**
 * Susun daftar periode: asli dulu, lalu extend urut tanggal mulai.
 * Step periode asli dihitung langsung dari submission (tanpa hack
 * effectiveStep yang menarik mundur stepper saat ada extend aktif);
 * koreksi expired mengikuti deriveOrderUiState.
 */
export function buildAiringPeriods(
    submission: FormSubmission,
    ui: OrderUiState,
    extendsList: FormSubmissionExtend[],
    payments: Record<string, ExtendPaymentInfo>,
    t: TFn
): AiringPeriod[] {
    const now = new Date();
    const periods: AiringPeriod[] = [];

    // — Periode asli —
    const rawStep = getCurrentStepIndex(submission);
    const origStep = ui.isExpired ? 1 : Math.max(rawStep, 0);
    const origSteps = getStatusSteps(t, submission.distribution_type)
        .map((s: { key: string; label: string }) => ({ key: s.key, label: s.label }));
    const oStart = submission.start_date ? normalizeScheduleDate(submission.start_date) : null;
    const oEnd = submission.end_date ? normalizeScheduleDate(submission.end_date) : null;

    let origChipStatus: string;
    let origChipLabel: string;
    if (ui.isExpired) {
        origChipStatus = 'expired';
        origChipLabel = t('extStatusExpired');
    } else if (origStep === 4) {
        origChipStatus = 'completed';
        origChipLabel = t('extStatusCompleted');
    } else if (origStep === 3) {
        const isLive =
            (submission.submission_status || '').toLowerCase() === 'live' ||
            !!(oStart && oEnd && oStart <= now && oEnd >= now);
        origChipStatus = isLive ? 'live' : 'scheduled';
        origChipLabel = isLive ? t('extStatusLive') : t('extStatusScheduled');
    } else if (origStep === 2) {
        origChipStatus = 'waiting_payment';
        origChipLabel = t('extStatusWaitingPayment');
    } else {
        // Review / slot: netral abu-abu, label mengikuti step aktifnya
        origChipStatus = 'in_review';
        origChipLabel = origSteps[origStep]?.label || t('statusInReview');
    }

    // Semua periode berlabel "Periode Iklan" (dinomori saat >1) — tanpa
    // istilah "Asli"/"Perpanjangan" (keputusan product owner 2026-07-19).
    const totalPeriods = 1 + extendsList.length;
    const periodLabel = (n: number) =>
        totalPeriods > 1 ? `${t('airingPeriodLabel')} ${n}` : t('airingPeriodLabel');

    periods.push({
        key: 'original',
        kind: 'original',
        label: periodLabel(1),
        startDate: oStart,
        endDate: oEnd,
        dateRange: oStart || oEnd ? `${fmtShort(oStart)}–${fmtShort(oEnd)}` : '—',
        chipStatus: origChipStatus,
        chipLabel: origChipLabel,
        steps: origSteps,
        currentStep: origStep,
        expandable: true,
        hasExpiredPaymentLink: false,
    });

    // — Periode perpanjangan —
    const sorted = [...extendsList].sort((a, b) => {
        const as = a.start_date ? normalizeScheduleDate(a.start_date).getTime() : 0;
        const bs = b.start_date ? normalizeScheduleDate(b.start_date).getTime() : 0;
        return as - bs;
    });

    sorted.forEach((ext, i) => {
        const pay = ext.id ? payments[ext.id] || null : null;
        const status = (ext.submission_status || 'waiting_payment').toLowerCase();
        const hasExpiredPaymentLink = status === 'waiting_payment' && pay?.status === 'expired';
        const stepIdx = getExtendStepIndex(ext);
        // Chip confirmed extend ikut posisi step (by-date, pola AiringPeriodsBar
        // lama): extend 'paid'/'scheduled' yang masa tayangnya lewat ber-chip
        // Selesai, bukan Lunas.
        let displayStatus: string;
        if (hasExpiredPaymentLink) displayStatus = 'expired';
        else if (status === 'cancelled' || status === 'waiting_payment') displayStatus = status;
        else displayStatus = stepIdx === 3 ? 'completed' : stepIdx === 2 ? 'live' : 'scheduled';
        const start = ext.start_date ? normalizeScheduleDate(ext.start_date) : null;
        const end = ext.end_date ? normalizeScheduleDate(ext.end_date) : null;

        periods.push({
            key: ext.id || `ext-${i}`,
            kind: 'extend',
            label: periodLabel(i + 2),
            startDate: start,
            endDate: end,
            dateRange: start || end ? `${fmtShort(start)}–${fmtShort(end)}` : '—',
            chipStatus: displayStatus,
            chipLabel: t(extendStatusLabelKey(displayStatus)),
            steps: getExtendSteps(t),
            currentStep: stepIdx,
            expandable: status !== 'cancelled',
            ext,
            pay,
            hasExpiredPaymentLink,
        });
    });

    return periods;
}

export type OriginalPanelState =
    | 'review_manual'
    | 'review_auto'
    | 'choose_schedule'
    | 'payment'
    | 'awaiting_invoice'
    | 'expired'
    | 'ready_to_launch'
    | 'live'
    | 'completed';

/**
 * State panel aksi milik PERIODE ASLI — dihitung dari step mentah submission
 * dan tanggal aslinya, BUKAN dari ui.callout/eff: callout bisa dibajak state
 * extend (extend_payment, atau 'live' saat perpanjangan tayang padahal
 * periode asli sudah selesai). Panel tiap periode harus bercerita tentang
 * periodenya sendiri.
 */
export function getOriginalPanelState(submission: FormSubmission, ui: OrderUiState): OriginalPanelState | null {
    if (getCurrentStepIndex(submission) === -1) return null; // revisi → banner card-level
    if (ui.isExpired) return 'expired';

    const step = Math.max(getCurrentStepIndex(submission), 0);
    if (step === 0) return isAutoReviewed(submission) ? 'review_auto' : 'review_manual';
    if (step === 1) return 'choose_schedule';
    if (step === 2) return ui.finalPaymentLink ? 'payment' : 'awaiting_invoice';
    if (step === 4) return 'completed';

    const now = new Date();
    const start = submission.start_date ? normalizeScheduleDate(submission.start_date) : null;
    const end = submission.end_date ? normalizeScheduleDate(submission.end_date) : null;
    const isLive =
        (submission.submission_status || '').toLowerCase() === 'live' ||
        !!(start && end && start <= now && end >= now);
    return isLive ? 'live' : 'ready_to_launch';
}

/**
 * Periode yang terbuka default: yang paling butuh perhatian user sekarang.
 * Prioritas: extend butuh bayar > sedang tayang > terjadwal terdekat >
 * selesai terakhir > asli.
 */
export function pickDefaultExpandedKey(periods: AiringPeriod[]): string {
    const candidates = periods.filter((p) => p.expandable);

    const needsPay = candidates.find(
        (p) => p.kind === 'extend' && (p.chipStatus === 'waiting_payment' || p.chipStatus === 'expired')
    );
    if (needsPay) return needsPay.key;

    const live = candidates.find((p) => p.chipStatus === 'live');
    if (live) return live.key;

    const now = Date.now();
    const upcoming = candidates
        .filter((p) => p.chipStatus === 'scheduled' && p.startDate && p.startDate.getTime() > now)
        .sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime())[0];
    if (upcoming) return upcoming.key;

    const lastCompleted = candidates
        .filter((p) => p.chipStatus === 'completed' && p.endDate)
        .sort((a, b) => b.endDate!.getTime() - a.endDate!.getTime())[0];
    if (lastCompleted) return lastCompleted.key;

    return 'original';
}
