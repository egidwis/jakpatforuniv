import { useLanguage } from '@/i18n/LanguageContext';
import { type FormSubmission, type FormSubmissionExtend } from '@/utils/supabase';
import { CheckCircle2, FileText, ExternalLink, Calendar, CreditCard, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

// Define the status steps in order
// Define status steps dynamically inside component to access translation
export const getStatusSteps = (t: any, distributionType?: string) => {
    const isKilat = distributionType === 'kilat';
    return [
        { key: 'in_review', label: t('statusInReview'), icon: FileText, helper: t('statusInReviewHelper'), completedHelper: t('statusInReviewCompletedHelper') },
        { key: 'slot', label: isKilat ? t('statusKilatSlot') : t('statusScheduling'), icon: Calendar, helper: isKilat ? t('statusKilatSlotHelper') : t('statusSchedulingHelper'), completedHelper: isKilat ? t('statusKilatSlotCompletedHelper') : t('statusSchedulingCompletedHelper') },
        { key: 'payment', label: t('statusWaitingPayment'), icon: CreditCard, helper: t('statusPaymentHelper'), completedHelper: t('statusPaymentSuccessHelper') },
        { key: 'publishing', label: isKilat ? t('statusKilatPublishing') : t('statusPublishing'), icon: PlayCircle, helper: isKilat ? t('statusKilatPublishingHelper') : t('statusPublishingHelper'), liveHelper: isKilat ? t('statusKilatPublishingLiveHelper') : t('statusPublishingLiveHelper'), completedHelper: isKilat ? t('statusKilatPublishingCompletedHelper') : t('statusPublishingCompletedHelper') },
        { key: 'completed', label: t('statusCompleted'), icon: CheckCircle2, helper: t('statusCompletedHelper'), completedHelper: t('statusCompletedHelper') },
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

// Progress Bar Component
export function ProgressTracker({
    submission,
    currentStep,
    paymentLink,
    invoiceId,
    steps,
    isExpired,
    awaitingInvoice,
    onReschedule,
    activeStartDate,
    activeEndDate,
    isExtended
}: {
    submission: FormSubmission;
    currentStep: number;
    paymentLink?: string | null;
    invoiceId?: string | null;
    steps: any[];
    isExpired?: boolean;
    awaitingInvoice?: boolean;
    onReschedule?: () => void;
    activeStartDate?: string | null;
    activeEndDate?: string | null;
    isExtended?: boolean;
}) {
    const { t } = useLanguage();

    // Airing dates for the Publishing step — follow the active extension when present.
    const pubStart = activeStartDate ?? submission.start_date;
    const pubEnd = activeEndDate ?? submission.end_date;

    // Dynamic subtitle override logic
    const getDynamicHelper = (step: any, isCompleted: boolean) => {
        // Admin-booked slot reserved but no payment link issued yet — the ball is
        // in the admin's court, not the user's. Override the misleading
        // "waiting for your payment" helper with an honest message.
        if (step.key === 'payment' && awaitingInvoice && !isCompleted) {
            return t('statusAwaitingInvoiceHelper');
        }
        // Special 3-state logic for the publishing step
        if (step.key === 'publishing') {
            if (isCompleted) {
                // Step 4 (completed) is active — publishing is done
                return step.completedHelper;
            }
            const now = new Date();
            const submissionStatus = (submission.submission_status || '').toLowerCase();
            // Condition 3: ad explicitly completed by admin
            if (submissionStatus === 'completed') {
                return step.completedHelper;
            }
            // Condition 2: ad is live (status is 'live', or between start and end date)
            if (
                submissionStatus === 'live' ||
                (submission.start_date && normalizeScheduleDate(submission.start_date) <= now && 
                 submission.end_date && normalizeScheduleDate(submission.end_date) >= now)
            ) {
                return step.liveHelper;
            }
            // Condition 1: payment done & slot reserved, waiting for start date
            return step.helper;
        }
        if (isCompleted && step.completedHelper) {
            return step.completedHelper;
        }
        return step.helper;
    };
    return (
        <div className="w-full py-4">
            {/* Desktop Progress Bar */}
            <div className="hidden md:block">
                <div className="relative">
                    {/* Background Line */}
                    <div className="absolute top-5 left-0 w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />

                    {/* Progress Line */}
                    <div
                        className="absolute top-5 left-0 h-1 rounded-full transition-all duration-500"
                        style={{ width: `${(currentStep / (steps.length - 1)) * 100}%`, backgroundColor: '#0091ff' }}
                    />

                    {/* Step Circles */}
                    <div className="relative flex justify-between">
                        {steps.map((step, index) => {
                            const Icon = step.icon;
                            const isCompleted = index < currentStep;
                            const isCurrent = index === currentStep;

                            return (
                                <div key={step.key} className="flex flex-col items-center">
                                    {/* Circle */}
                                    <div
                                        className={`
                                            w-10 h-10 rounded-full flex items-center justify-center z-10 transition-all duration-300
                                            ${isCompleted
                                                ? 'text-white ring-4 ring-blue-100 dark:ring-blue-900'
                                                : isCurrent
                                                    ? 'text-white ring-4 ring-blue-200 dark:ring-blue-800 animate-pulse'
                                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                                            }
                                        `}
                                        style={isCompleted || isCurrent ? { backgroundColor: '#0091ff' } : {}}
                                    >
                                        {isCompleted ? (
                                            <CheckCircle2 className="w-5 h-5" />
                                        ) : (
                                            <Icon className="w-5 h-5" />
                                        )}
                                    </div>

                                    {/* Label */}
                                    <div className="text-center mt-3 relative">
                                        <span
                                            className={`
                                                text-xs font-semibold block
                                                ${isCompleted || isCurrent
                                                    ? 'text-gray-900 dark:text-gray-100'
                                                    : 'text-gray-400 dark:text-gray-500'
                                                }
                                            `}
                                        >
                                            {step.label}
                                        </span>
                                        {/* Helper text / schedule info / pay button */}
                                        <div className="flex flex-col items-center gap-1 mt-1">
                                            {((isCurrent && !paymentLink) || isCurrent || isCompleted) && (
                                                <span className="text-[11px] text-gray-400 dark:text-gray-500 max-w-[120px] leading-tight block">
                                                    {getDynamicHelper(step, isCompleted)}
                                                </span>
                                            )}

                                            {/* Schedule Date (under scheduling step) */}
                                            {(isCurrent || isCompleted) && step.key === 'slot' && submission.start_date && (
                                                <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mt-0.5 inline-block leading-tight">
                                                    {normalizeScheduleDate(submission.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - {submission.end_date ? normalizeScheduleDate(submission.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '...'}
                                                </span>
                                            )}

                                            {/* Expired Slot Reschedule Button */}
                                            {isCurrent && step.key === 'slot' && isExpired && onReschedule && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-6 mt-1 text-[10px] px-2 text-red-600 border-red-200 hover:bg-red-50"
                                                    onClick={onReschedule}
                                                >
                                                    {t('rescheduleSlot')}
                                                </Button>
                                            )}

                                            {/* New Slot Schedule Button (when status is approved) */}
                                            {isCurrent && step.key === 'slot' && !submission.start_date && !isExpired && onReschedule && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-6 mt-1 text-[10px] px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                                                    onClick={onReschedule}
                                                >
                                                    {t('chooseSchedule')}
                                                </Button>
                                            )}

                                            {/* Live Date Badge (under publishing step) */}
                                            {(isCurrent || isCompleted) && step.key === 'publishing' && pubStart && (() => {
                                                const now = new Date();
                                                const isLive = !!(pubStart && pubEnd &&
                                                    normalizeScheduleDate(pubStart) <= now && normalizeScheduleDate(pubEnd) >= now);
                                                const extLabel = isExtended ? ` (${t('extendedLabel')})` : '';
                                                return isLive ? (
                                                    <span className="text-[11px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full mt-0.5 inline-block leading-tight">
                                                        {t('statusLiveUntil')} {pubEnd ? normalizeScheduleDate(pubEnd).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : ''}{extLabel}
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-gray-400 mt-0.5 inline-block leading-tight">
                                                        Scheduled: {normalizeScheduleDate(pubStart).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, {normalizeScheduleDate(pubStart).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB{extLabel}
                                                    </span>
                                                );
                                            })()}

                                            {/* Pay Now Button (Desktop) */}
                                            {isCurrent && step.key === 'payment' && paymentLink && (
                                                <a
                                                    href={paymentLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 mt-1 px-3 py-1 text-xs font-semibold text-white rounded-full hover:opacity-90 transition-opacity shadow-sm"
                                                    style={{ backgroundColor: '#0091ff' }}
                                                >
                                                    <CreditCard className="w-3 h-3" />
                                                    {t('payNow')}
                                                    <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
                                                </a>
                                            )}

                                            {/* Invoice/Receipt Link (Desktop) */}
                                            {step.key === 'payment' && invoiceId && (() => {
                                                const isPaidVal = (submission.payment_status || '').toLowerCase() === 'paid' || 
                                                                  (submission.submission_status || '').toLowerCase() === 'paid' ||
                                                                  ['scheduled', 'live', 'completed'].includes((submission.submission_status || '').toLowerCase());
                                                if (isPaidVal) {
                                                    return (
                                                        <a
                                                            href={`/invoices/${invoiceId}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[10px] text-blue-600 hover:text-blue-700 underline flex items-center gap-0.5 mt-1 font-medium"
                                                        >
                                                            <FileText className="w-3 h-3 mr-1.5" />
                                                            {t('downloadReceipt')}
                                                        </a>
                                                    );
                                                }
                                                if (isCurrent && paymentLink) {
                                                    return (
                                                        <a
                                                            href={`/invoices/${invoiceId}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[10px] text-gray-400 underline flex items-center gap-0.5 mt-1"
                                                        >
                                                            <FileText className="w-3 h-3 mr-1.5" />
                                                            {t('viewInvoice')}
                                                        </a>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Mobile Progress Steps */}
            <div className="md:hidden space-y-0">
                {steps.map((step, index) => {
                    const Icon = step.icon;
                    const isCompleted = index < currentStep;
                    const isCurrent = index === currentStep;
                    const isLast = index === steps.length - 1;
                    
                    return (
                        <div key={step.key} className="relative flex gap-3 items-start">
                            {/* Vertical Line + Circle */}
                            <div className="flex flex-col items-center">
                                <div
                                    className={`
                                        w-8 h-8 rounded-full flex items-center justify-center z-10 shrink-0 transition-all duration-300
                                        ${isCompleted
                                            ? 'text-white ring-2 ring-blue-100 dark:ring-blue-900'
                                            : isCurrent
                                                ? 'text-white ring-2 ring-blue-200 dark:ring-blue-800 animate-pulse'
                                                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                                        }
                                    `}
                                    style={isCompleted || isCurrent ? { backgroundColor: '#0091ff' } : {}}
                                >
                                    {isCompleted ? (
                                        <CheckCircle2 className="w-4 h-4" />
                                    ) : (
                                        <Icon className="w-4 h-4" />
                                    )}
                                </div>
                                {/* Connector Line */}
                                {!isLast && (
                                    <div
                                        className={`w-0.5 flex-1 min-h-[24px] ${isCompleted ? '' : 'bg-gray-200 dark:bg-gray-700'}`}
                                        style={isCompleted ? { backgroundColor: '#0091ff' } : {}}
                                    />
                                )}
                            </div>

                            {/* Content */}
                            <div className={`pb-6 ${isLast ? 'pb-0' : ''}`}>
                                <span
                                    className={`
                                        text-xs font-semibold block
                                        ${isCompleted || isCurrent
                                            ? 'text-gray-900 dark:text-gray-100'
                                            : 'text-gray-400 dark:text-gray-500'
                                        }
                                    `}
                                >
                                    {step.label}
                                </span>
                                {(isCurrent || isCompleted) && (
                                    <span className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight block mt-0.5">
                                        {getDynamicHelper(step, isCompleted)}
                                    </span>
                                )}

                                {/* Schedule Date (Mobile) */}
                                {(isCurrent || isCompleted) && step.key === 'slot' && submission.start_date && (
                                    <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mt-1 inline-block leading-tight">
                                        {normalizeScheduleDate(submission.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - {submission.end_date ? normalizeScheduleDate(submission.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '...'}
                                    </span>
                                )}

                                {/* Live/Schedule Date (Mobile, publishing) */}
                                {(isCurrent || isCompleted) && step.key === 'publishing' && pubStart && (() => {
                                    const now = new Date();
                                    const isLive = !!(pubStart && pubEnd &&
                                        normalizeScheduleDate(pubStart) <= now && normalizeScheduleDate(pubEnd) >= now);
                                    const extLabel = isExtended ? ` (${t('extendedLabel')})` : '';
                                    return isLive ? (
                                        <span className="text-[11px] font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full mt-1 inline-block leading-tight">
                                            {t('statusLiveUntil')} {pubEnd ? normalizeScheduleDate(pubEnd).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : ''}{extLabel}
                                        </span>
                                    ) : (
                                        <span className="text-[11px] text-gray-400 mt-1 inline-block leading-tight">
                                            Scheduled: {normalizeScheduleDate(pubStart).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, {normalizeScheduleDate(pubStart).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB{extLabel}
                                        </span>
                                    );
                                })()}

                                {/* Expired Reschedule Button (Mobile) */}
                                {isCurrent && step.key === 'slot' && isExpired && onReschedule && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 mt-1 text-[10px] px-2 text-red-600 border-red-200 hover:bg-red-50"
                                        onClick={onReschedule}
                                    >
                                        {t('rescheduleSlot')}
                                    </Button>
                                )}

                                {/* New Slot Schedule Button (Mobile) */}
                                {isCurrent && step.key === 'slot' && !submission.start_date && !isExpired && onReschedule && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 mt-1 text-[10px] px-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                                        onClick={onReschedule}
                                    >
                                        {t('chooseSchedule')}
                                    </Button>
                                )}

                                {/* Pay Now Button (Mobile) */}
                                {isCurrent && step.key === 'payment' && paymentLink && (
                                    <div className="mt-2 flex flex-col gap-1.5">
                                        <a
                                            href={paymentLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white rounded-full hover:opacity-90 transition-opacity shadow-sm w-fit"
                                            style={{ backgroundColor: '#0091ff' }}
                                        >
                                            <CreditCard className="w-3 h-3" />
                                            {t('payNow')}
                                            <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
                                        </a>
                                    </div>
                                )}

                                {/* Receipt/Invoice Link (Mobile) */}
                                {step.key === 'payment' && invoiceId && (() => {
                                    const isPaidVal = (submission.payment_status || '').toLowerCase() === 'paid' || 
                                                      (submission.submission_status || '').toLowerCase() === 'paid' ||
                                                      ['scheduled', 'live', 'completed'].includes((submission.submission_status || '').toLowerCase());
                                    if (isPaidVal) {
                                        return (
                                            <div className="mt-1">
                                                <a
                                                    href={`/invoices/${invoiceId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[10px] text-blue-600 hover:text-blue-700 underline flex items-center gap-0.5 font-medium"
                                                >
                                                    <FileText className="w-3.5 h-3.5 mr-1" />
                                                    {t('downloadReceipt')}
                                                </a>
                                            </div>
                                        );
                                    }
                                    if (isCurrent && paymentLink) {
                                        return (
                                            <div className="mt-1">
                                                <a
                                                    href={`/invoices/${invoiceId}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[10px] text-gray-400 underline flex items-center gap-0.5"
                                                >
                                                    <FileText className="w-3 h-3 mr-1.5" />
                                                    {t('viewInvoice')}
                                                </a>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
