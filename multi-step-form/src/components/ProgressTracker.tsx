import { type FormSubmission, type FormSubmissionExtend } from '@/utils/supabase';
import { CheckCircle2, FileText, Calendar, CreditCard, PlayCircle } from 'lucide-react';

/**
 * Normalize a schedule date string for accurate time comparison.
 * Date-only strings (e.g. "2026-04-13") are parsed as midnight UTC by JS,
 * which equals 07:00 WIB — before the intended 15:00 WIB go-live time.
 * This detects date-only values and sets the time to 08:00 UTC (= 15:00 WIB).
 */
export function normalizeScheduleDate(dateStr: string | null | undefined): Date {
    if (!dateStr || typeof dateStr !== 'string') {
        return new Date();
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
        return new Date();
    }
    if (!dateStr.includes('T')) {
        d.setUTCHours(8, 0, 0, 0);
    }
    return d;
}

// Step lifecycle order asli (5 langkah). Tanpa helper text — teks "sekarang
// gimana" milik PeriodActionPanel; stepper (PeriodStepper) hanya label + posisi.
// Field icon dipakai badge status di StatusPage (getStatusBadgeInfo).
export const getStatusSteps = (t: any, distributionType?: string) => {
    const isKilat = distributionType === 'kilat';
    return [
        { key: 'in_review', label: t('statusInReview'), icon: FileText },
        { key: 'slot', label: isKilat ? t('statusKilatSlot') : t('statusScheduling'), icon: Calendar },
        { key: 'payment', label: t('statusWaitingPayment'), icon: CreditCard },
        { key: 'publishing', label: isKilat ? t('statusKilatPublishing') : t('statusPublishing'), icon: PlayCircle },
        { key: 'completed', label: t('statusCompleted'), icon: CheckCircle2 },
    ];
};

// Get the current step index based on submission_status and related data
// This ensures sync between admin dashboard and user track status
export function getCurrentStepIndex(submission: FormSubmission): number {
    const status = (submission.submission_status || 'in_review').toLowerCase();
    const paymentStatus = (submission.payment_status || 'pending').toLowerCase();
    
    // Check if page is scheduled (has start_date and end_date)
    // This happens when admin has created and scheduled the page
    const isScheduled = submission.start_date && submission.end_date;
    const now = new Date();
    const startDate = submission.start_date ? normalizeScheduleDate(submission.start_date) : null;
    const endDate = submission.end_date ? normalizeScheduleDate(submission.end_date) : null;
    const isLive = isScheduled && startDate && endDate && startDate <= now && endDate >= now;
    const isCompleted = isScheduled && endDate && endDate < now;

    const isPaid = paymentStatus === 'paid' || status === 'paid';
    
    // TRAP: If they have dates but haven't paid, they must stay at Awaiting Payment (step 2)
    if (isScheduled && !isPaid && status !== 'live' && status !== 'completed' && status !== 'scheduled') {
        return 2;
    }
    
    if (isCompleted || status === 'completed') {
        return 4;
    }
    
    if (isLive || status === 'live') {
        return 3;
    }
    
    if ((isScheduled && isPaid) || status === 'scheduled') {
        return 3;
    }
    
    if (isPaid) {
        return 2;
    }

    const statusToStep: Record<string, number> = {
        'in_review': 0,
        'approved': 1,
        'rejected': -1,
        'spam': -1,
        'slot_reserved': 1,
        'waiting_payment': 2,
        'expired': 1,
        'scheduling': 1,
        'publishing': 3,
    };

    return statusToStep[status] ?? 0;
}

// Payment info for a single extend (derived from its `entity_type='extend'` transaction)
export interface ExtendPaymentInfo {
    paymentUrl: string | null;
    paymentId: string | null;
    status: string | null; // transaction status: pending | paid | expired | failed
    amount: number;
}

export interface EffectiveExtendStatus {
    effectiveStep: number;
    activeStartDate: string | null;
    activeEndDate: string | null;
    isExtended: boolean;
    waitingPaymentExtends: FormSubmissionExtend[];
}

// Extend statuses that mean the perpanjangan is confirmed/paid (will air or has aired)
const CONFIRMED_EXTEND_STATUSES = ['paid', 'scheduled', 'live', 'completed'];

/**
 * Compute the effective publishing status of a survey taking confirmed (paid)
 * duration extensions into account. Keeps the user's track-status coherent:
 * an extended survey stays Live/Scheduled instead of flipping to Completed,
 * and the displayed airing date follows the active extension.
 */
export function computeEffectiveExtendStatus(
    submission: FormSubmission,
    extendsList: FormSubmissionExtend[] = [],
    payments: Record<string, ExtendPaymentInfo> = {}
): EffectiveExtendStatus {
    const baseStep = getCurrentStepIndex(submission);
    const now = new Date();

    const confirmed = extendsList.filter((e) =>
        CONFIRMED_EXTEND_STATUSES.includes((e.submission_status || '').toLowerCase())
    );

    const isExtLive = (e: FormSubmissionExtend) => {
        const status = (e.submission_status || '').toLowerCase();
        if (status === 'live') return true;
        if (status === 'completed' || status === 'cancelled' || status === 'waiting_payment') return false;
        const s = e.start_date ? normalizeScheduleDate(e.start_date) : null;
        const en = e.end_date ? normalizeScheduleDate(e.end_date) : null;
        return !!(s && en && s <= now && en >= now);
    };

    const liveExtend = confirmed.find(isExtLive) || null;

    const upcomingScheduled = confirmed
        .filter((e) => {
            const s = e.start_date ? normalizeScheduleDate(e.start_date) : null;
            return s && s > now;
        })
        .sort(
            (a, b) =>
                normalizeScheduleDate(a.start_date!).getTime() - normalizeScheduleDate(b.start_date!).getTime()
        )[0] || null;

    let effectiveStep = baseStep;
    let activeStartDate: string | null = submission.start_date || null;
    let activeEndDate: string | null = submission.end_date || null;
    let isExtended = false;

    if (liveExtend) {
        effectiveStep = 3;
        activeStartDate = liveExtend.start_date || activeStartDate;
        activeEndDate = liveExtend.end_date || activeEndDate;
        isExtended = true;
    } else if (upcomingScheduled) {
        effectiveStep = 3;
        activeStartDate = upcomingScheduled.start_date || activeStartDate;
        activeEndDate = upcomingScheduled.end_date || activeEndDate;
        isExtended = true;
    } else if (confirmed.length > 0) {
        // No live/upcoming extend, but a past confirmed one — surface the latest
        // airing window so a "Completed" survey reflects the extended end date.
        const latest = confirmed.reduce<FormSubmissionExtend | null>((acc, e) => {
            if (!e.end_date) return acc;
            if (!acc || normalizeScheduleDate(e.end_date) > normalizeScheduleDate(acc.end_date!)) return e;
            return acc;
        }, null);
        const parentEnd = submission.end_date ? normalizeScheduleDate(submission.end_date) : null;
        if (latest?.end_date && (!parentEnd || normalizeScheduleDate(latest.end_date) > parentEnd)) {
            activeStartDate = latest.start_date || activeStartDate;
            activeEndDate = latest.end_date;
            isExtended = true;
        }
    }

    const waitingPaymentExtends = extendsList.filter((e) => {
        if ((e.submission_status || '').toLowerCase() !== 'waiting_payment') return false;
        const pay = e.id ? payments[e.id] : null;
        return !!(pay && pay.paymentUrl && pay.status === 'pending');
    });

    return { effectiveStep, activeStartDate, activeEndDate, isExtended, waitingPaymentExtends };
}

