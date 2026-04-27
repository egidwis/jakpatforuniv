import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { getFormSubmissionsByEmail, getInvoicesByFormSubmissionId, getTransactionsByFormSubmissionId, deleteFormSubmission, prepareForReschedule, type FormSubmission } from '@/utils/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, FileText, CheckCircle2, Search, PlayCircle, CreditCard, MessageCircle, AlertCircle, Trash2, Menu, Info, ExternalLink, Gift, Users, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useSearchParams, useOutletContext, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

/**
 * Normalize a schedule date string for accurate time comparison.
 * Date-only strings (e.g. "2026-04-13") are parsed as midnight UTC by JS,
 * which equals 07:00 WIB — before the intended 15:00 WIB go-live time.
 * This detects date-only values and sets the time to 08:00 UTC (= 15:00 WIB).
 */
function normalizeScheduleDate(dateStr: string): Date {
    const d = new Date(dateStr);
    if (!dateStr.includes('T')) {
        d.setUTCHours(8, 0, 0, 0);
    }
    return d;
}

// Define the status steps in order
// Define status steps dynamically inside component to access translation
const getStatusSteps = (t: any) => [
    { key: 'in_review', label: t('statusInReview'), icon: Search, helper: t('statusInReviewHelper'), completedHelper: t('statusInReviewCompletedHelper') },
    { key: 'slot', label: t('statusScheduling'), icon: Calendar, helper: t('statusSchedulingHelper'), completedHelper: t('statusSchedulingCompletedHelper') },
    { key: 'payment', label: t('statusWaitingPayment'), icon: CreditCard, helper: t('statusPaymentHelper'), completedHelper: t('statusPaymentSuccessHelper') },
    { key: 'publishing', label: t('statusPublishing'), icon: PlayCircle, helper: t('statusPublishingHelper'), liveHelper: t('statusPublishingLiveHelper'), completedHelper: t('statusPublishingCompletedHelper') },
    { key: 'completed', label: t('statusCompleted'), icon: CheckCircle2, helper: t('statusCompletedHelper'), completedHelper: t('statusCompletedHelper') },
];

// Get the current step index based on submission_status and related data
// This ensures sync between admin dashboard and user track status
function getCurrentStepIndex(submission: FormSubmission): number {
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

    // Priority logic for status sync:
    // 1. If completed (end date passed) → step 4
    // 2. If live (currently running) → step 3
    // 3. If scheduled (has dates) → step 3
    // 4. If paid → step 2 (unless already scheduled)
    // 5. Otherwise use submission_status mapping
    
    const isPaid = paymentStatus === 'paid' || status === 'paid';
    
    // TRAP: If they have dates but haven't paid, they must stay at Awaiting Payment (step 2)
    // We prioritize this over date checks (isLive/isCompleted) so unpaid slots don't jump ahead.
    // Exception: If admin explicitly set status to 'live', 'completed', or 'scheduled'.
    if (isScheduled && !isPaid && status !== 'live' && status !== 'completed' && status !== 'scheduled') {
        return 2;
    }
    
    if (isCompleted || status === 'completed') {
        return 4;
    }
    
    if (isLive || status === 'live') {
        return 3;
    }
    
    // Step 3 (Ready to Launch) requires payment to be completed, 
    // OR an explicit 'scheduled' status from the admin
    if ((isScheduled && isPaid) || status === 'scheduled') {
        return 3;
    }
    
    // If payment is paid but not yet scheduled → step 2 (payment done, waiting for page)
    if (isPaid) {
        return 2;
    }

    // Direct mapping for other statuses
    const statusToStep: Record<string, number> = {
        'in_review': 0,
        'approved': 1,    // approved, needs to select schedule
        'rejected': -1,   // special case → revision/rejected view
        'spam': -1,       // special case → hidden/revision view
        'slot_reserved': 1,
        'waiting_payment': 2,
        'expired': 1,        // payment expired → back to slot selection step
        // Legacy status support (in case migration not yet run)
        'scheduling': 1,
        'publishing': 3,
    };

    return statusToStep[status] ?? 0;
}

// Progress Bar Component
function ProgressTracker({ 
    submission,
    currentStep, 
    paymentLink,
    invoiceId,
    steps,
    isExpired,
    onReschedule
}: { 
    submission: FormSubmission;
    currentStep: number; 
    paymentLink?: string | null; 
    invoiceId?: string | null;
    steps: any[];
    isExpired?: boolean;
    onReschedule?: () => void;
}) {
    const { t } = useLanguage();
    
    // Dynamic subtitle override logic
    const getDynamicHelper = (step: any, isCompleted: boolean) => {
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
                                                text-xs font-medium flex items-center justify-center gap-1
                                                ${isCompleted || isCurrent
                                                    ? 'dark:text-blue-400'
                                                    : 'text-gray-400 dark:text-gray-500'
                                                }
                                            `}
                                            style={isCompleted || isCurrent ? { color: '#0091ff' } : {}}
                                        >
                                            {step.label}
                                            {step.key === 'payment' && (
                                                <div className="group relative z-20">
                                                    <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg text-left" style={{ zIndex: 100 }}>
                                                        Kuota iklan harian terbatas. Penjadwalan mengikuti urutan pembayaran. Lakukan pembayaran lebih awal untuk mengamankan slot.
                                                        <div className="absolute top-full left-1/2 -translate-x-1/2 justify-center border-4 border-transparent border-t-gray-900"></div>
                                                    </div>
                                                </div>
                                            )}
                                        </span>
                                        {/* Helper message */}
                                        <div className="min-h-[20px]">
                                            {((isCurrent && !paymentLink) || isCurrent || isCompleted) && (
                                                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 max-w-[120px] mx-auto leading-tight">
                                                    {getDynamicHelper(step, isCompleted)}
                                                </p>
                                            )}
                                        </div>
                                        
                                        {/* Step Specific Actions & Info (Desktop) */}
                                        <div className="mt-2 min-h-[28px]">
                                            
                                            {/* In Review > 3 days -> wa button */}
                                            {isCurrent && step.key === 'in_review' && submission.created_at && (Math.floor((Date.now() - new Date(submission.created_at).getTime()) / (1000 * 60 * 60 * 24)) >= 3) && (
                                                <a href="https://wa.me/628123456789" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-[10px] bg-green-50 text-green-600 border border-green-200 px-2 py-1 rounded-md hover:bg-green-100 transition-colors">
                                                    <MessageCircle className="w-3 h-3 mr-1"/> Hubungi Admin
                                                </a>
                                            )}

                                            {/* Scheduling date info */}
                                            {step.key === 'slot' && submission.start_date && !isExpired && (
                                                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 inline-block mt-0.5">
                                                    {normalizeScheduleDate(submission.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - {submission.end_date ? normalizeScheduleDate(submission.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '...'}
                                                </span>
                                            )}

                                            {/* Expired Slot Reschedule Button */}
                                            {step.key === 'slot' && isExpired && onReschedule && (
                                                <Button
                                                    size="sm"
                                                    className="mt-1 text-white shadow-sm h-7 text-[10px] px-3 break-keep"
                                                    style={{ background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)' }}
                                                    onClick={onReschedule}
                                                >
                                                    Pilih Jadwal Ulang
                                                </Button>
                                            )}

                                            {/* New Slot Schedule Button (when status is approved) */}
                                            {step.key === 'slot' && isCurrent && submission.submission_status === 'approved' && !submission.slot_reserved_at && !isExpired && onReschedule && (
                                                <Button
                                                    size="sm"
                                                    className="mt-1 text-white shadow-sm h-7 text-[10px] px-3 break-keep"
                                                    style={{ background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)' }}
                                                    onClick={onReschedule}
                                                >
                                                    Pilih Jadwal
                                                </Button>
                                            )}

                                            {/* Publishing: waiting (paid + scheduled, not yet live) */}
                                            {step.key === 'publishing' && isCurrent && submission.start_date && (() => {
                                                const now = new Date();
                                                const submissionStatus = (submission.submission_status || '').toLowerCase();
                                                const isLiveStatus = submissionStatus === 'live' || 
                                                    (normalizeScheduleDate(submission.start_date) <= now && submission.end_date && normalizeScheduleDate(submission.end_date) >= now);
                                                if (!isLiveStatus) {
                                                    return (
                                                        <span className="inline-flex items-center text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-0.5 mt-0.5">
                                                            Scheduled: {normalizeScheduleDate(submission.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, {normalizeScheduleDate(submission.start_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                                        </span>
                                                    );
                                                }
                                                return null;
                                            })()}

                                            {/* Pay Now Button (Desktop) */}
                                            {isCurrent && step.key === 'payment' && paymentLink && (
                                                    <a
                                                        href={paymentLink}
                                                        target={paymentLink.startsWith('http') ? "_blank" : undefined}
                                                        rel={paymentLink.startsWith('http') ? "noopener noreferrer" : undefined}
                                                        className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                                                        style={{ background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)' }}
                                                    >
                                                        {t('payNow')}
                                                    </a>
                                            )}
                                            {/* Paid/Invoice Button (Desktop) */}
                                            {isCompleted && step.key === 'payment' && invoiceId && (
                                                    <Link
                                                        to={`/invoices/${invoiceId}`}
                                                        target="_blank"
                                                        className="inline-flex items-center justify-center rounded-md px-2.5 py-1 text-[10px] font-semibold text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 shadow-sm transition-all mt-1"
                                                    >
                                                        <FileText className="w-3 h-3 mr-1" />
                                                        Lihat Invoice
                                                    </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Mobile Progress Bar (Vertical) */}
            <div className="md:hidden">
                <div className="relative pl-8">
                    {/* Vertical Line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />

                    {/* Progress Line */}
                    <div
                        className="absolute left-4 top-0 w-0.5 transition-all duration-500"
                        style={{ height: `${(currentStep / (steps.length - 1)) * 100}%`, backgroundColor: '#0091ff' }}
                    />

                    {/* Steps */}
                    <div className="space-y-6">
                        {steps.map((step, index) => {
                            const Icon = step.icon;
                            const isCompleted = index < currentStep;
                            const isCurrent = index === currentStep;

                            return (
                                <div key={step.key} className="relative flex items-center">
                                    {/* Circle - Centered on line (left-4 of parent) */}
                                    {/* We use absolute positioning relative to the item container */}
                                    <div
                                        className={`
                                                                    absolute -left-4 w-8 h-8 rounded-full flex items-center justify-center z-10 transition-all box-content border-4 border-white dark:border-gray-900
                                                                    ${isCompleted
                                                ? 'text-white'
                                                : isCurrent
                                                    ? 'text-white ring-2 ring-blue-200 dark:ring-blue-800'
                                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
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

                                    {/* Label & Action */}
                                    <div className="flex flex-col ml-8 w-full">
                                        <div className="flex items-center justify-between">
                                            <span
                                                className={`
                                                    text-sm font-medium flex items-center gap-1.5
                                                    ${isCompleted || isCurrent
                                                        ? 'text-gray-900 dark:text-white'
                                                        : 'text-gray-400 dark:text-gray-500'
                                                    }
                                                `}
                                            >
                                                {step.label}
                                                {step.key === 'payment' && (
                                                    <div className="group relative z-20">
                                                        <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                                                        <div className="absolute left-6 top-1/2 -translate-y-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg text-left" style={{ zIndex: 100 }}>
                                                            Kuota iklan harian terbatas. Penjadwalan mengikuti urutan pembayaran. Lakukan pembayaran lebih awal untuk mengamankan slot.
                                                            <div className="absolute top-1/2 right-full -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
                                                        </div>
                                                    </div>
                                                )}
                                            </span>
                                            
                                            {/* Publishing Link (Mobile) */}
                                            {step.key === 'publishing' && isCurrent && submission.start_date && (() => {
                                                const now = new Date();
                                                const submissionStatus = (submission.submission_status || '').toLowerCase();
                                                const isLiveStatus = submissionStatus === 'live' || 
                                                    (normalizeScheduleDate(submission.start_date) <= now && submission.end_date && normalizeScheduleDate(submission.end_date) >= now);
                                                if (!isLiveStatus) {
                                                    return (
                                                        <span className="inline-flex items-center text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-0.5 mt-1">
                                                            Scheduled: {normalizeScheduleDate(submission.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}, {normalizeScheduleDate(submission.start_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                                                        </span>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>

                                        {/* Mobile Subtitle Info */}
                                        {((isCurrent && !paymentLink) || isCurrent || isCompleted) && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-tight max-w-[200px]">
                                                {step.key === 'slot' && submission.start_date && isCurrent
                                                    ? `Dijadwalkan: ${normalizeScheduleDate(submission.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${submission.end_date ? normalizeScheduleDate(submission.end_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '...'}`
                                                    : getDynamicHelper(step, isCompleted)
                                                }
                                            </p>
                                        )}

                                        {/* Contact Admin (Mobile) */}
                                        {isCurrent && step.key === 'in_review' && submission.created_at && (Math.floor((Date.now() - new Date(submission.created_at).getTime()) / (1000 * 60 * 60 * 24)) >= 3) && (
                                            <div className="mt-2">
                                                <a href="https://wa.me/628123456789" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-[11px] bg-green-50 text-green-600 border border-green-200 px-2.5 py-1 rounded-md hover:bg-green-100 transition-colors w-fit">
                                                    <MessageCircle className="w-3.5 h-3.5 mr-1.5"/> Hubungi Admin
                                                </a>
                                            </div>
                                        )}

                                        {/* Expired Slot Reschedule Button (Mobile) */}
                                        {step.key === 'slot' && isExpired && onReschedule && (
                                            <div className="mt-3">
                                                <Button
                                                    size="sm"
                                                    className="text-white shadow-sm h-8"
                                                    style={{ background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)' }}
                                                    onClick={onReschedule}
                                                >
                                                    Pilih Jadwal Ulang
                                                </Button>
                                            </div>
                                        )}

                                        {/* New Slot Schedule Button (Mobile) */}
                                        {step.key === 'slot' && isCurrent && submission.submission_status === 'approved' && !submission.slot_reserved_at && !isExpired && onReschedule && (
                                            <div className="mt-3">
                                                <Button
                                                    size="sm"
                                                    className="text-white shadow-sm h-8"
                                                    style={{ background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)' }}
                                                    onClick={onReschedule}
                                                >
                                                    Pilih Jadwal
                                                </Button>
                                            </div>
                                        )}

                                        {/* Pay Now Button (Mobile) */}
                                        {isCurrent && step.key === 'payment' && paymentLink && (
                                            <div className="mt-2">
                                                <a
                                                    href={paymentLink}
                                                    target={paymentLink.startsWith('http') ? "_blank" : undefined}
                                                    rel={paymentLink.startsWith('http') ? "noopener noreferrer" : undefined}
                                                    className="inline-flex items-center justify-center rounded-md px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md"
                                                    style={{ background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)' }}
                                                >
                                                    {t('payNow')}
                                                </a>
                                            </div>
                                        )}
                                        {/* Paid/Invoice Button (Mobile) */}
                                        {isCompleted && step.key === 'payment' && invoiceId && (
                                            <div className="mt-2">
                                                <Link
                                                    to={`/invoices/${invoiceId}`}
                                                    target="_blank"
                                                    className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-[11px] font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors w-fit shadow-sm"
                                                >
                                                    <FileText className="w-3 h-3 mr-1.5" />
                                                    Lihat Invoice
                                                </Link>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function StatusPage() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const { toggleSidebar } = useOutletContext<{ toggleSidebar: () => void }>();
    const navigate = useNavigate();
    const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    // Store payment links for each submission: { submissionId: paymentUrl }
    const [paymentLinks, setPaymentLinks] = useState<Record<string, string | null>>({});
    const [invoiceIds, setInvoiceIds] = useState<Record<string, string | null>>({});
    const [searchParams, setSearchParams] = useSearchParams();

    // Handle query params for notifications
    useEffect(() => {
        const status = searchParams.get('status');
        const paymentStatus = searchParams.get('payment_status');

        if (status === 'survey_submitted') {
            toast.success('Survey berhasil dikirim! Menunggu review admin.');
            // Clear params
            setSearchParams(params => {
                params.delete('status');
                return params;
            });
        }

        if (paymentStatus === 'paid') {
            toast.success('Pembayaran berhasil! Survey Anda sedang diproses.');
            setSearchParams(params => {
                params.delete('payment_status');
                return params;
            });
        }

        if (paymentStatus === 'failed') {
            toast.error('Pembayaran gagal. Silakan coba lagi.');
            setSearchParams(params => {
                params.delete('payment_status');
                return params;
            });
        }
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        async function fetchSubmissions() {
            if (user?.email) {
                try {
                    const data = await getFormSubmissionsByEmail(user.email);
                    setSubmissions(data);

                    // Fetch payment links for each submission
                    const links: Record<string, string | null> = {};
                    const invIds: Record<string, string | null> = {};

                    // Use Promise.all for parallel fetching to prevent blocking
                    await Promise.all(data.map(async (submission) => {
                        if (submission.id) {
                            let foundTransactionId: string | null = null;
                            try {
                                const transactions = await getTransactionsByFormSubmissionId(submission.id);
                                if (transactions.length > 0) {
                                    if (transactions[0].payment_id) {
                                        foundTransactionId = transactions[0].payment_id;
                                    }
                                    if (submission.payment_status !== 'paid' && transactions[0].payment_url) {
                                        links[submission.id] = transactions[0].payment_url;
                                    }
                                }
                            } catch (e) {
                                console.error(`Error fetching transactions for ${submission.id}:`, e);
                            }

                            if (foundTransactionId) {
                                invIds[submission.id] = foundTransactionId;
                            }

                            // Try to get manual invoice if no transaction link is found and not yet paid
                            if (submission.payment_status !== 'paid' && !links[submission.id]) {
                                try {
                                    const invoices = await getInvoicesByFormSubmissionId(submission.id);
                                    if (invoices.length > 0 && invoices[0].invoice_url) {
                                        links[submission.id] = invoices[0].invoice_url;
                                    }
                                } catch (e) {
                                    console.error(`Error fetching invoices for ${submission.id}:`, e);
                                }
                            }

                            // No payment link found
                            if (!links[submission.id]) {
                                links[submission.id] = null;
                            }
                        }
                    }));

                    setPaymentLinks(links);
                    setInvoiceIds(invIds);
                } catch (error) {
                    console.error('Failed to fetch submissions', error);
                } finally {
                    setLoading(false);
                }
            } else {
                setLoading(false);
            }
        }

        fetchSubmissions();
    }, [user]);

    const handleDeleteSubmission = async (id: string) => {
        if (confirm(t('deleteSubmissionConfirm'))) {
            try {
                await deleteFormSubmission(id);
                setSubmissions(prev => prev.filter(s => s.id !== id));
                toast.success(t('deleteSubmissionSuccess'));
            } catch (error) {
                console.error('Failed to delete submission:', error);
                toast.error(t('deleteSubmissionError'));
            }
        }
    };

    const steps = getStatusSteps(t);

    const getStatusBadgeInfo = (currentStep: number, submission?: FormSubmission) => {
        if (currentStep === -1) {
            return {
                label: t('statusRevisionNeeded'),
                color: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
                icon: <AlertCircle className="w-4 h-4" />,
                style: {}
            };
        }

        const step = steps[currentStep];
        let color = 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
        let label = step.label;

        // Override label for publishing step based on actual status
        if (step.key === 'publishing' && submission) {
            const now = new Date();
            const startDate = submission.start_date ? normalizeScheduleDate(submission.start_date) : null;
            const endDate = submission.end_date ? normalizeScheduleDate(submission.end_date) : null;
            const isLive = startDate && endDate && startDate <= now && endDate >= now;
            const isCompleted = endDate && endDate < now;
            
            if (isCompleted) {
                label = 'Completed';
                color = 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
            } else if (isLive) {
                label = 'Live';
                color = 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
            } else if (startDate && startDate > now) {
                label = 'Ready to Launch';  // Scheduled but not yet live
                color = 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
            }
        }

        switch (step.key) {
            case 'in_review':
                // Using brand blue variations
                color = 'border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'; // Override with inline style below
                break;
            case 'payment':
                color = 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
                break;
            case 'scheduling':
                color = 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800';
                break;
            case 'publishing':
                // Color already set above based on actual status
                if (!submission) {
                    color = 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800';
                }
                break;
            case 'completed':
                color = 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
                break;
        }

        return {
            label,
            color,
            icon: <step.icon className="w-4 h-4" />,
            style: step.key === 'in_review' ? { backgroundColor: 'rgba(0, 145, 255, 0.1)', color: '#0077cc', borderColor: 'rgba(0, 145, 255, 0.2)' } : {}
        };
    };

    if (loading) {
        return (
            <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
                <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Skeleton className="h-8 w-48" />
                    </div>

                    {/* Filter Tabs Skeleton */}
                    <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <Skeleton key={i} className="h-8 w-24 rounded-full" />
                        ))}
                    </div>

                    <div className="grid gap-6">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                                <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex justify-between items-start">
                                    <div className="space-y-2">
                                        <Skeleton className="h-6 w-64" />
                                        <Skeleton className="h-4 w-40" />
                                    </div>
                                    <Skeleton className="h-8 w-32 rounded-full" />
                                </div>
                                <div className="p-6 space-y-6">
                                    {/* Progress Bar Skeleton */}
                                    <div className="w-full">
                                        <div className="flex justify-between relative">
                                            {[1, 2, 3, 4, 5].map((s) => (
                                                <div key={s} className="flex flex-col items-center gap-3 z-10">
                                                    <Skeleton className="h-10 w-10 rounded-full" />
                                                    <Skeleton className="h-3 w-16" />
                                                </div>
                                            ))}
                                            <div className="absolute top-5 left-0 w-full h-1 bg-gray-100 dark:bg-gray-800" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
            {/* Floating Mobile Header */}
            <div className="fixed top-4 left-4 right-4 z-40 md:hidden">
                <div className="backdrop-blur-md bg-white/80 border border-gray-100 shadow-sm rounded-2xl px-4 py-2.5 flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleSidebar}
                        className="-ml-2 h-9 w-9"
                    >
                        <Menu className="w-5 h-5 text-gray-700" />
                    </Button>
                    <span className="text-sm font-semibold text-gray-700">Track Status</span>
                    <div className="w-9" />
                </div>
            </div>
            <div className="h-14 md:hidden" />{/* Spacer for floating header */}
            <div className="space-y-8">
                <div className="space-y-6">
                    <div className="hidden md:flex items-center gap-2 mb-2">
                        <h1 className="text-xl font-semibold text-gray-800 dark:text-white">{t('pageTitle')}</h1>
                    </div>

                    {submissions.length === 0 ? (
                        <Card className="border-dashed">
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                                    <FileText className="w-6 h-6 text-gray-400" />
                                </div>
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('noSubmissions')}</h3>
                                <p className="text-gray-500 dark:text-gray-400 max-w-sm mt-2 mb-6">
                                    {t('noSubmissionsDesc')}
                                </p>
                                <Link to="/dashboard/submit">
                                    <Button className="text-white shadow-md hover:shadow-lg transition-all" style={{ background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)' }}>{t('createFirstSurvey')}</Button>
                                </Link>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-6">
                            {/* Status Filter Tabs */}
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant={selectedStatus === 'all' ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setSelectedStatus('all')}
                                    className={`rounded-full px-4 text-xs ${selectedStatus === 'all' ? 'text-white shadow-md border-transparent' : 'text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800'}`}
                                    style={selectedStatus === 'all' ? { background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)' } : {}}
                                >
                                    {t('statusAll')}
                                </Button>
                                {steps.map((step) => (
                                    <Button
                                        key={step.key}
                                        variant={selectedStatus === step.key ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => setSelectedStatus(step.key)}
                                        className={`rounded-full px-4 text-xs capitalize ${selectedStatus === step.key ? 'text-white shadow-md border-transparent' : 'text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800'}`}
                                        style={selectedStatus === step.key ? { background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)' } : {}}
                                    >
                                        {step.label}
                                    </Button>
                                ))}
                            </div>

                            <div className="grid gap-6">
                                {submissions
                                    .filter(submission => {
                                        if (selectedStatus === 'all') return true;

                                        const hasLink = !!paymentLinks[submission.id!];
                                        const currentStepIndex = getCurrentStepIndex(submission);
                                        // Handle revision/spam status (index = -1)
                                        if (currentStepIndex === -1) {
                                            return selectedStatus === 'revision';
                                        }

                                        const currentStepKey = steps[currentStepIndex]?.key;
                                        return currentStepKey === selectedStatus;
                                    })
                                    .map((submission) => {
                                        const hasLink = !!paymentLinks[submission.id!];
                                        const currentStepRaw = getCurrentStepIndex(submission);
                                        // Auto-approval logic
                                        const isUserBooked = submission.slot_booked_by === 'user';
                                        const isPaymentExpired = submission.payment_status === 'expired';
                                        const isExpired = isPaymentExpired || (isUserBooked && submission.slot_reserved_at && Date.now() > (new Date(submission.slot_reserved_at).getTime() + 3600_000)); // 1 hour expiration
                                        
                                        // Force UI to regress to 'slot_reserved' step if expired, regardless of what DB says
                                        const currentStep = (isExpired && submission.payment_status !== 'paid') ? 1 : currentStepRaw;
                                        
                                        // Override badge for expired payment
                                        const badgeInfo = isExpired && submission.payment_status !== 'paid'
                                            ? {
                                                label: 'Payment Expired',
                                                color: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
                                                icon: <AlertCircle className="w-4 h-4" />,
                                                style: {}
                                            }
                                            : getStatusBadgeInfo(currentStep, submission);

                                        let finalPaymentLink = paymentLinks[submission.id!];
                                        if (!finalPaymentLink && isUserBooked && !isExpired && currentStep === 2) {
                                            finalPaymentLink = `/dashboard/payment/${submission.id}`;
                                        }

                                        return (
                                            <Card key={submission.id} className="overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all rounded-xl">
                                                <CardHeader className="bg-gray-50/50 dark:bg-gray-800/50 border-b pb-4">
                                                    <div className="flex items-center justify-between flex-wrap gap-3">
                                                        <div className="space-y-2 flex-grow overflow-hidden pr-4">
                                                            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white truncate" title={submission.title}>
                                                                {submission.title}
                                                            </CardTitle>
                                                            
                                                            <div className="flex flex-col gap-2.5 mt-1">
                                                                {/* Additional Survey Info (Line 2) */}
                                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600 dark:text-gray-300">
                                                                    <div className="flex items-center gap-1.5" title="Jumlah Pertanyaan">
                                                                        <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                                        <span className="truncate">{submission.question_count} Pertanyaan</span>
                                                                    </div>
                                                                    
                                                                    {(submission.winner_count && submission.prize_per_winner) ? (
                                                                        <div className="flex items-center gap-1.5" title="Total & Insentif Pemenang">
                                                                            <Gift className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                                            <span className="truncate">
                                                                                {submission.winner_count} Pemenang ({new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(submission.prize_per_winner)}/org)
                                                                            </span>
                                                                        </div>
                                                                    ) : null}
                                                                    
                                                                    {submission.criteria_responden && (
                                                                        <div className="flex items-center gap-1.5" title={`Kriteria Responden: ${submission.criteria_responden}`}>
                                                                            <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                                            <span className="truncate max-w-[150px] sm:max-w-[200px] md:max-w-[250px]">
                                                                                {submission.criteria_responden}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                    
                                                                    {submission.survey_url && (
                                                                        <div className="flex items-center gap-1.5" title="Tautan Asli Survei">
                                                                            <LinkIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                                            <a href={submission.survey_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 hover:underline truncate max-w-[120px] sm:max-w-[180px] md:max-w-[220px]">
                                                                                Lihat Survei
                                                                            </a>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Submitted Date (Line 3) */}
                                                                <CardDescription className="text-xs">
                                                                    <span className="truncate">
                                                                        {t('submittedOn')} {new Date(submission.created_at || new Date()).toLocaleDateString('id-ID', {
                                                                            day: 'numeric', month: 'long', year: 'numeric'
                                                                        })}
                                                                    </span>
                                                                </CardDescription>
                                                            </div>
                                                        </div>
                                                        <Badge variant="outline" className={`${badgeInfo.color} px-3 py-1 flex items-center gap-1.5`} style={badgeInfo.style}>
                                                            {badgeInfo.icon}
                                                            {badgeInfo.label}
                                                        </Badge>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="pt-6 pb-6">
                                                    {/* Progress Tracker or Revision Alert */}
                                                    {currentStep === -1 ? (
                                                        <div className="rounded-lg border border-orange-100 bg-orange-50/50 p-4 dark:border-orange-900/30 dark:bg-orange-900/10">
                                                            <div className="flex gap-3">
                                                                <AlertCircle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                                                                <div className="space-y-3">
                                                                    <div>
                                                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                                                            {t('revisionNeededTitle')}
                                                                        </h4>
                                                                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                                                                            {t('revisionNeededDescPart1')} <a href="https://jakpatforuniv.com/terms-conditions" target="_blank" rel="noopener noreferrer" className="text-orange-600 underline hover:text-orange-700">{t('termsConditions')}</a>{t('revisionNeededDescPart2')}
                                                                        </p>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <Link to="/dashboard/submit">
                                                                            <Button
                                                                                size="sm"
                                                                                className="bg-white text-orange-700 border border-orange-200 hover:bg-orange-50 hover:border-orange-300 shadow-sm"
                                                                            >
                                                                                {t('resubmit')}
                                                                            </Button>
                                                                        </Link>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            onClick={() => handleDeleteSubmission(submission.id!)}
                                                                            className="bg-transparent text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300 hover:text-red-700 shadow-sm flex items-center gap-1.5"
                                                                        >
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                            {t('delete')}
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <ProgressTracker 
                                                            submission={submission}
                                                            currentStep={currentStep}
                                                            paymentLink={finalPaymentLink || null}
                                                            invoiceId={invoiceIds[submission.id!] || null}
                                                            steps={getStatusSteps(t)}
                                                            isExpired={isExpired}
                                                            onReschedule={async () => {
                                                                // Show loading toast
                                                                const loadingToast = toast.loading('Mempersiapkan jadwal ulang...');
                                                                
                                                                try {
                                                                    // First, prepare the submission for reschedule (reset slot and payment state)
                                                                    await prepareForReschedule(submission.id!);
                                                                    
                                                                    // Prepare recovered data for the form
                                                                    const recoveredData = {
                                                                        surveyUrl: submission.survey_url || '',
                                                                        title: submission.title || '',
                                                                        description: submission.description || '',
                                                                        questionCount: submission.question_count || 0,
                                                                        criteriaResponden: submission.criteria_responden || '',
                                                                        duration: submission.duration || 1,
                                                                        startDate: '',
                                                                        endDate: '',
                                                                        fullName: submission.full_name || '',
                                                                        email: submission.email || '',
                                                                        phoneNumber: submission.phone_number || '',
                                                                        university: submission.university || '',
                                                                        department: submission.department || '',
                                                                        status: submission.status || '',
                                                                        referralSource: submission.referral_source && submission.referral_source.startsWith('Lainnya: ') ? 'Lainnya' : (submission.referral_source || ''),
                                                                        referralSourceOther: submission.referral_source && submission.referral_source.startsWith('Lainnya: ') ? submission.referral_source.replace('Lainnya: ', '') : '',
                                                                        winnerCount: submission.winner_count || 0,
                                                                        prizePerWinner: submission.prize_per_winner || 0,
                                                                        voucherCode: submission.voucher_code || '',
                                                                        detectedKeywords: submission.detected_keywords || [],
                                                                        isManualEntry: submission.submission_method === 'manual',
                                                                        isReschedule: true,
                                                                        submissionIdToReplace: submission.id,
                                                                    };
                                                                    
                                                                    // Save to localStorage
                                                                    localStorage.setItem('survey_form_draft', JSON.stringify({
                                                                        formData: recoveredData,
                                                                        currentStep: 3
                                                                    }));
                                                                    
                                                                    toast.dismiss(loadingToast);
                                                                    toast.success('Silakan pilih slot baru untuk jadwal ulang');
                                                                    
                                                                    // Navigate to submit page
                                                                    navigate('/dashboard/submit');
                                                                } catch (error) {
                                                                    console.error('Error preparing for reschedule:', error);
                                                                    toast.dismiss(loadingToast);
                                                                    toast.error('Gagal mempersiapkan jadwal ulang. Silakan coba lagi.');
                                                                }
                                                            }}
                                                        />
                                                    )}




                                                    {/* Contact Admin / Support Link */}
                                                    <div className="mt-8 pt-4 border-t flex justify-end">
                                                        <Link
                                                            to="/dashboard/chat"
                                                            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                                                        >
                                                            <MessageCircle className="w-3 h-3" />
                                                            {t('contactSupport')}
                                                        </Link>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
