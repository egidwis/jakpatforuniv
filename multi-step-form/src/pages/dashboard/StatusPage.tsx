import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { getFormSubmissionsByEmail, getInvoicesByFormSubmissionId, getTransactionsByFormSubmissionId, deleteFormSubmission, type FormSubmission } from '@/utils/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, FileText, CheckCircle2, Search, PlayCircle, CreditCard, MessageCircle, AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

// Define the status steps in order
// Define status steps dynamically inside component to access translation
// Define status steps dynamically inside component to access translation
const getStatusSteps = (t: any) => [
    { key: 'in_review', label: t('statusInReview'), icon: Search, helper: t('statusInReviewHelper') },
    { key: 'payment', label: t('statusWaitingPayment'), icon: CreditCard, helper: t('statusPaymentHelper') },
    { key: 'scheduling', label: t('statusScheduling'), icon: Calendar, helper: t('statusSchedulingHelper') },
    { key: 'publishing', label: t('statusPublishing'), icon: PlayCircle, helper: t('statusPublishingHelper') },
    { key: 'completed', label: t('statusCompleted'), icon: CheckCircle2, helper: t('statusCompletedHelper') },
];

// Get the current step index based on submission state
function getCurrentStepIndex(submission: FormSubmission, hasPaymentLink: boolean): number {
    // Check for spam/rejected status first (Revision Needed)
    if (submission.submission_status === 'spam') {
        return -1;
    }

    // If not paid yet
    if (submission.payment_status !== 'paid') {
        // If we have a payment link/invoice, we are in Waiting Payment (Step 1)
        if (hasPaymentLink) {
            return 1;
        }
        // Otherwise we are still In Review (Step 0)
        return 0;
    }

    // If paid, check submission status
    const status = (submission.submission_status || 'scheduling').toLowerCase();

    switch (status) {
        case 'in_review':
            return 2; // If paid but still in review, move to Scheduling (Step 2)
        case 'scheduling':
            return 2;
        case 'publishing':
            return 3;
        case 'completed':
            return 4;
        default:
            return 2; // Default to Scheduling if paid but status unknown
    }
}

// Progress Bar Component
function ProgressTracker({ currentStep, paymentLink, steps }: { currentStep: number; paymentLink?: string | null; steps: any[] }) {
    const { t } = useLanguage();
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
                                    <div className="text-center mt-3">
                                        <span
                                            className={`
                                                text-xs font-medium
                                                ${isCompleted || isCurrent
                                                    ? 'dark:text-blue-400'
                                                    : 'text-gray-400 dark:text-gray-500'
                                                }
                                            `}
                                            style={isCompleted || isCurrent ? { color: '#0091ff' } : {}}
                                        >
                                            {step.label}
                                        </span>
                                        {step.helper && isCurrent && !paymentLink && (
                                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 max-w-[80px] mx-auto">
                                                {step.helper}
                                            </p>
                                        )}
                                        {/* Pay Now Button (Desktop) */}
                                        {isCurrent && step.key === 'payment' && paymentLink && (
                                            <div className="mt-2">
                                                <a
                                                    href={paymentLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center justify-center rounded-md px-3 py-1 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                                                    style={{ background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)' }}
                                                >
                                                    {t('payNow')}
                                                </a>
                                            </div>
                                        )}
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
                                    <div className="flex flex-col ml-8">
                                        <span
                                            className={`
                                                text-sm font-medium
                                                ${isCompleted || isCurrent
                                                    ? 'text-gray-900 dark:text-white'
                                                    : 'text-gray-400 dark:text-gray-500'
                                                }
                                            `}
                                        >
                                            {step.label}
                                        </span>

                                        {/* Pay Now Button (Mobile) */}
                                        {isCurrent && step.key === 'payment' && paymentLink && (
                                            <div className="mt-1">
                                                <a
                                                    href={paymentLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center justify-center rounded-md px-3 py-1 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md"
                                                    style={{ background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)' }}
                                                >
                                                    {t('payNow')}
                                                </a>
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
    const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedStatus, setSelectedStatus] = useState<string>('all');
    // Store payment links for each submission: { submissionId: paymentUrl }
    const [paymentLinks, setPaymentLinks] = useState<Record<string, string | null>>({});
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

                    // Use Promise.all for parallel fetching to prevent blocking
                    await Promise.all(data.map(async (submission) => {
                        if (submission.id && submission.payment_status !== 'paid') {
                            // Try to get invoice first (manual invoice from admin)
                            try {
                                const invoices = await getInvoicesByFormSubmissionId(submission.id);
                                if (invoices.length > 0 && invoices[0].invoice_url) {
                                    links[submission.id] = invoices[0].invoice_url;
                                    return;
                                }
                            } catch (e) {
                                console.error(`Error fetching invoices for ${submission.id}:`, e);
                            }

                            // If no invoice, try transactions (auto Mayar link)
                            try {
                                const transactions = await getTransactionsByFormSubmissionId(submission.id);
                                if (transactions.length > 0 && transactions[0].payment_url) {
                                    links[submission.id] = transactions[0].payment_url;
                                    return;
                                }
                            } catch (e) {
                                console.error(`Error fetching transactions for ${submission.id}:`, e);
                            }

                            // No payment link found
                            links[submission.id] = null;
                        }
                    }));

                    setPaymentLinks(links);
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

    const getStatusBadgeInfo = (currentStep: number) => {
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
                color = 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800';
                break;
            case 'completed':
                color = 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
                break;
        }

        return {
            label: step.label,
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
            <div className="space-y-8">
                <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
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
                                        const currentStepIndex = getCurrentStepIndex(submission, hasLink);
                                        // Handle revision/spam status (index = -1)
                                        if (currentStepIndex === -1) {
                                            return selectedStatus === 'revision';
                                        }

                                        const currentStepKey = steps[currentStepIndex]?.key;
                                        return currentStepKey === selectedStatus;
                                    })
                                    .map((submission) => {
                                        const hasLink = !!paymentLinks[submission.id!];
                                        const currentStep = getCurrentStepIndex(submission, hasLink);
                                        const badgeInfo = getStatusBadgeInfo(currentStep);

                                        return (
                                            <Card key={submission.id} className="overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all rounded-xl">
                                                <CardHeader className="bg-gray-50/50 dark:bg-gray-800/50 border-b pb-4">
                                                    <div className="flex items-center justify-between flex-wrap gap-3">
                                                        <div className="space-y-1">
                                                            <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                                                                {submission.title}
                                                            </CardTitle>
                                                            <CardDescription>
                                                                {t('submittedOn')} {new Date(submission.created_at || new Date()).toLocaleDateString('id-ID', {
                                                                    day: 'numeric', month: 'long', year: 'numeric'
                                                                })}
                                                            </CardDescription>
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
                                                        <ProgressTracker currentStep={currentStep} paymentLink={submission.payment_status !== 'paid' && hasLink ? paymentLinks[submission.id!] : null} steps={steps} />
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
