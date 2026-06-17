import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { getFormSubmissionsByUser, getInvoicesByFormSubmissionId, getTransactionsByFormSubmissionId, deleteFormSubmission, prepareForReschedule, type FormSubmission } from '@/utils/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, MessageCircle, AlertCircle, Trash2, Menu, Gift, Users, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useSearchParams, useOutletContext, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ProgressTracker, getStatusSteps, getCurrentStepIndex, normalizeScheduleDate } from '@/components/ProgressTracker';

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
            if (user?.id) {
                try {
                    const data = await getFormSubmissionsByUser(user.id, user.email);
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

                                        const currentStepIndex = getCurrentStepIndex(submission);
                                        // Handle revision/spam status (index = -1)
                                        if (currentStepIndex === -1) {
                                            return selectedStatus === 'revision';
                                        }

                                        const currentStepKey = steps[currentStepIndex]?.key;
                                        return currentStepKey === selectedStatus;
                                    })
                                    .map((submission) => {
                                        const currentStepRaw = getCurrentStepIndex(submission);
                                        // Auto-approval logic
                                        const isUserBooked = submission.slot_booked_by === 'user';
                                        const isPaymentExpired = submission.payment_status === 'expired';
                                        const isPaidOrBeyond = submission.payment_status === 'paid' || ['paid', 'scheduled', 'live', 'completed'].includes((submission.submission_status || '').toLowerCase());
                                        const isExpired = !isPaidOrBeyond && (isPaymentExpired || (isUserBooked && !!submission.slot_reserved_at && Date.now() > (new Date(submission.slot_reserved_at).getTime() + 3600_000))); // 1 hour expiration
                                        
                                        // Force UI to regress to 'slot_reserved' step if expired, regardless of what DB says
                                        const currentStep = isExpired ? 1 : currentStepRaw;
                                        
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
                                                                            {t('revisionNeededDescPart1')} <a href="/terms-conditions.html" target="_blank" rel="noopener noreferrer" className="text-orange-600 underline hover:text-orange-700">{t('termsConditions')}</a>{t('revisionNeededDescPart2')}
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
