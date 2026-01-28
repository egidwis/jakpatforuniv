import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getFormSubmissionsByEmail, getInvoicesByFormSubmissionId, getTransactionsByFormSubmissionId, type FormSubmission } from '@/utils/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar, FileText, AlertCircle, CheckCircle2, Search, PlayCircle, ExternalLink, MessageCircle, CreditCard, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

// Define the status steps in order
const STATUS_STEPS = [
    { key: 'payment', label: 'In Review & Waiting Payment', icon: CreditCard, helper: '' },
    { key: 'in_review', label: 'Payment Confirmation', icon: Search, helper: 'Jam Kerja: Sen - Jum, 08:00 - 17:00' },
    { key: 'scheduling', label: 'Scheduling', icon: Calendar, helper: '' },
    { key: 'publishing', label: 'Publishing', icon: PlayCircle, helper: '' },
    { key: 'completed', label: 'Completed', icon: CheckCircle2, helper: '' },
];

// Get the current step index based on submission state
function getCurrentStepIndex(submission: FormSubmission): number {
    if (submission.payment_status !== 'paid') {
        return 0; // Waiting for Payment
    }

    const status = (submission.submission_status || 'in_review').toLowerCase();

    switch (status) {
        case 'in_review':
            return 1;
        case 'scheduling':
            return 2;
        case 'publishing':
            return 3;
        case 'completed':
            return 4;
        default:
            return 1; // Default to in_review
    }
}

// Progress Bar Component
function ProgressTracker({ currentStep }: { currentStep: number; submission: FormSubmission }) {
    return (
        <div className="w-full py-4">
            {/* Desktop Progress Bar */}
            <div className="hidden md:block">
                <div className="relative">
                    {/* Background Line */}
                    <div className="absolute top-5 left-0 w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />

                    {/* Progress Line */}
                    <div
                        className="absolute top-5 left-0 h-1 bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${(currentStep / (STATUS_STEPS.length - 1)) * 100}%` }}
                    />

                    {/* Step Circles */}
                    <div className="relative flex justify-between">
                        {STATUS_STEPS.map((step, index) => {
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
                                                ? 'bg-blue-500 text-white ring-4 ring-blue-100 dark:ring-blue-900'
                                                : isCurrent
                                                    ? 'bg-blue-500 text-white ring-4 ring-blue-200 dark:ring-blue-800 animate-pulse'
                                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                                            }
                                        `}
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
                                                    ? 'text-blue-600 dark:text-blue-400'
                                                    : 'text-gray-400 dark:text-gray-500'
                                                }
                                            `}
                                        >
                                            {step.label}
                                        </span>
                                        {step.helper && isCurrent && (
                                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 max-w-[80px] mx-auto">
                                                {step.helper}
                                            </p>
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
                        className="absolute left-4 top-0 w-0.5 bg-blue-500 transition-all duration-500"
                        style={{ height: `${(currentStep / (STATUS_STEPS.length - 1)) * 100}%` }}
                    />

                    {/* Steps */}
                    <div className="space-y-6">
                        {STATUS_STEPS.map((step, index) => {
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
                                                ? 'bg-blue-500 text-white'
                                                : isCurrent
                                                    ? 'bg-blue-500 text-white ring-2 ring-blue-200 dark:ring-blue-800'
                                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                                            }
                                                                `}
                                    >
                                        {isCompleted ? (
                                            <CheckCircle2 className="w-4 h-4" />
                                        ) : (
                                            <Icon className="w-4 h-4" />
                                        )}
                                    </div>

                                    {/* Label - Push right to avoid overlap */}
                                    <span
                                        className={`
                                                                    ml-8 text-sm font-medium
                                                                    ${isCompleted || isCurrent
                                                ? 'text-gray-900 dark:text-white'
                                                : 'text-gray-400 dark:text-gray-500'
                                            }
                                                                `}
                                    >
                                        {step.label}
                                    </span>
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
    const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    // Store payment links for each submission: { submissionId: paymentUrl }
    const [paymentLinks, setPaymentLinks] = useState<Record<string, string | null>>({});

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

    const getStatusBadgeInfo = (submission: FormSubmission) => {
        if (submission.payment_status !== 'paid') {
            return {
                label: 'Waiting for Payment',
                color: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
                icon: <AlertCircle className="w-4 h-4" />,
            };
        }

        const status = submission.submission_status || 'in_review';

        switch (status.toLowerCase()) {
            case 'in_review':
                return {
                    label: 'In Review',
                    color: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
                    icon: <Clock className="w-4 h-4" />,
                };
            case 'scheduling':
                return {
                    label: 'Scheduling',
                    color: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
                    icon: <Calendar className="w-4 h-4" />,
                };
            case 'publishing':
                return {
                    label: 'Publishing',
                    color: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800',
                    icon: <FileText className="w-4 h-4" />,
                };
            case 'completed':
                return {
                    label: 'Completed',
                    color: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
                    icon: <CheckCircle2 className="w-4 h-4" />,
                };
            default:
                return {
                    label: `Processing (${status})`, // Show actual status for debugging
                    color: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
                    icon: <Loader2 className="w-4 h-4" />,
                };
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
            <div className="space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Track Status</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">
                        Monitor the progress of your survey submissions in real-time.
                    </p>
                </div>

                {submissions.length === 0 ? (
                    <Card className="border-dashed">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                                <FileText className="w-6 h-6 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No submissions yet</h3>
                            <p className="text-gray-500 dark:text-gray-400 max-w-sm mt-2 mb-6">
                                You haven't submitted any surveys yet. Create your first survey to get started.
                            </p>
                            <Link to="/dashboard/submit">
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white">Create New Survey</Button>
                            </Link>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-6">
                        {submissions.map((submission) => {
                            const badgeInfo = getStatusBadgeInfo(submission);
                            const currentStep = getCurrentStepIndex(submission);

                            return (
                                <Card key={submission.id} className="overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
                                    <CardHeader className="bg-gray-50/50 dark:bg-gray-800/50 border-b pb-4">
                                        <div className="flex items-center justify-between flex-wrap gap-3">
                                            <div className="space-y-1">
                                                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                                                    {submission.title}
                                                </CardTitle>
                                                <CardDescription>
                                                    Submitted on {new Date(submission.created_at || new Date()).toLocaleDateString('id-ID', {
                                                        day: 'numeric', month: 'long', year: 'numeric'
                                                    })}
                                                </CardDescription>
                                            </div>
                                            <Badge variant="outline" className={`${badgeInfo.color} px-3 py-1 flex items-center gap-1.5`}>
                                                {badgeInfo.icon}
                                                {badgeInfo.label}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-6 pb-4">
                                        {/* Progress Tracker */}
                                        <ProgressTracker currentStep={currentStep} submission={submission} />

                                        {/* Action Button */}
                                        {submission.payment_status !== 'paid' && submission.id && (
                                            <div className="mt-6 flex flex-col items-center md:items-end gap-2">
                                                {paymentLinks[submission.id] ? (
                                                    <a
                                                        href={paymentLinks[submission.id]!}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-400 transition-colors"
                                                    >
                                                        <CreditCard className="w-4 h-4 mr-2" />
                                                        Pay Now
                                                        <ExternalLink className="w-3 h-3 ml-2" />
                                                    </a>
                                                ) : paymentLinks[submission.id] === null ? (
                                                    <div className="text-center md:text-right">
                                                        <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                                                            <Clock className="w-4 h-4" />
                                                            Menunggu Invoice dari Admin
                                                        </p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                            Kami akan segera menghubungi Anda
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <Button disabled className="bg-gray-400">
                                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                        Memuat...
                                                    </Button>
                                                )}
                                            </div>
                                        )}

                                        {/* Paid / In Review - Contact Admin Button */}
                                        {submission.payment_status === 'paid' && currentStep === 1 && (
                                            <div className="mt-6 flex justify-end">
                                                <Button
                                                    className="bg-green-600 hover:bg-green-700 text-white"
                                                    asChild
                                                >
                                                    <a
                                                        href={`https://wa.me/6287759153120?text=${encodeURIComponent(
                                                            `Halo min aku ${submission.full_name || user?.user_metadata?.full_name || 'User'} (${submission.email || user?.email}), aku sudah submit survey "${submission.title}" dan sudah melakukan payment, mohon info lebih lanjut`
                                                        )}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        <MessageCircle className="w-4 h-4 mr-2" />
                                                        Contact Admin
                                                    </a>
                                                </Button>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
