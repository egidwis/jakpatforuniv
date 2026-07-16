import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { getFormSubmissionsByUser, getInvoicesByFormSubmissionId, getTransactionsByFormSubmissionId, getExtendsBySubmissionIds, deleteFormSubmission, prepareForReschedule, type FormSubmission, type FormSubmissionExtend } from '@/utils/supabase';
import { SURVEY_DRAFT_KEY } from '@/utils/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, AlertCircle, RefreshCw, ChevronRight, Send, Search, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ProgressTracker, getStatusSteps, normalizeScheduleDate, type ExtendPaymentInfo } from '@/components/ProgressTracker';
import { AiringPeriodsBar } from '@/components/AiringPeriodsBar';
import { PageHeader } from '@/components/PageHeader';
import { CreateOrderCards } from '@/components/CreateOrderCards';
import { NextStepCallout } from '@/components/NextStepCallout';
import { OrderDetailsSection } from '@/components/OrderDetailsSection';
import { deriveOrderUiState, type OrderGroup } from '@/components/status/deriveOrderUiState';

type FilterValue = 'all' | OrderGroup;

export function StatusPage() {
    const { user } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    // Store payment links for each submission: { submissionId: paymentUrl }
    const [paymentLinks, setPaymentLinks] = useState<Record<string, string | null>>({});
    const [invoiceIds, setInvoiceIds] = useState<Record<string, string | null>>({});
    // Duration extensions per submission + their payment info (keyed by extend id)
    const [extendsBySubmission, setExtendsBySubmission] = useState<Record<string, FormSubmissionExtend[]>>({});
    const [extendPayments, setExtendPayments] = useState<Record<string, Record<string, ExtendPaymentInfo>>>({});
    const [searchParams, setSearchParams] = useSearchParams();

    const filterParam = searchParams.get('filter') as FilterValue | null;
    const selectedFilter: FilterValue = filterParam && ['butuh-aksi', 'berjalan', 'selesai'].includes(filterParam) ? filterParam : 'all';
    const setSelectedFilter = (value: FilterValue) => {
        setSearchParams(params => {
            if (value === 'all') params.delete('filter');
            else params.set('filter', value);
            return params;
        }, { replace: true });
    };

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

    const fetchSubmissions = useCallback(async () => {
        if (!user?.id) {
            setLoading(false);
            return;
        }
        try {
            const data = await getFormSubmissionsByUser(user.id, user.email);
            setSubmissions(data);

            // Fetch payment links for each submission
            const links: Record<string, string | null> = {};
            const invIds: Record<string, string | null> = {};
            const extPayments: Record<string, Record<string, ExtendPaymentInfo>> = {};

            // Batch-load all duration extensions for the user's submissions (readonly)
            const allSubmissionIds = data.map((s) => s.id).filter((id): id is string => !!id);

            // Run the per-submission transaction loop and the batched extends fetch together
            const [, allExtends] = await Promise.all([
                // Use Promise.all for parallel fetching to prevent blocking
                Promise.all(data.map(async (submission) => {
                    if (submission.id) {
                        let foundTransactionId: string | null = null;
                        try {
                            const transactions = await getTransactionsByFormSubmissionId(submission.id);
                            // Separate the survey's own transaction from extend transactions,
                            // which share the same form_submission_id (entity_type='extend').
                            const mainTx = transactions.filter((tx) => tx.entity_type !== 'extend');
                            const extendTx = transactions.filter((tx) => tx.entity_type === 'extend');

                            if (mainTx.length > 0) {
                                if (mainTx[0].payment_id) {
                                    foundTransactionId = mainTx[0].payment_id;
                                }
                                if (submission.payment_status !== 'paid' && mainTx[0].payment_url) {
                                    links[submission.id] = mainTx[0].payment_url;
                                }
                            }

                            // Build extend payment map (newest tx per extend wins — ordered desc)
                            const exMap: Record<string, ExtendPaymentInfo> = {};
                            extendTx.forEach((tx) => {
                                if (tx.extend_id && !exMap[tx.extend_id]) {
                                    exMap[tx.extend_id] = {
                                        paymentUrl: tx.payment_url || null,
                                        paymentId: tx.payment_id || null,
                                        status: tx.status || null,
                                        amount: tx.amount || 0,
                                    };
                                }
                            });
                            extPayments[submission.id] = exMap;
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
                                // Exclude extend invoices — only the survey's own invoice is the main link
                                const mainInvoices = invoices.filter((inv) => inv.entity_type !== 'extend');
                                if (mainInvoices.length > 0 && mainInvoices[0].invoice_url) {
                                    links[submission.id] = mainInvoices[0].invoice_url;
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
                })),
                getExtendsBySubmissionIds(allSubmissionIds),
            ]);

            // Group extends by their parent submission
            const bySub: Record<string, FormSubmissionExtend[]> = {};
            allExtends.forEach((e) => {
                if (!bySub[e.submission_id]) bySub[e.submission_id] = [];
                bySub[e.submission_id].push(e);
            });

            setExtendsBySubmission(bySub);
            setExtendPayments(extPayments);
            setPaymentLinks(links);
            setInvoiceIds(invIds);
        } catch (error) {
            console.error('Failed to fetch submissions', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchSubmissions();
    }, [fetchSubmissions]);

    // Refetch saat user kembali ke tab ini — momen khas "habis bayar di tab
    // gateway, balik ke dashboard" agar status langsung ter-update.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible') fetchSubmissions();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [fetchSubmissions]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchSubmissions();
        setRefreshing(false);
    };

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

    const handleReschedule = async (submission: FormSubmission) => {
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

            // Save to localStorage (step 2 = Jadwal pada skema step baru)
            localStorage.setItem(SURVEY_DRAFT_KEY, JSON.stringify({
                formData: recoveredData,
                currentStep: 2
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
    };

    // Warna badge = pill tint lembut ala stat-badge landing page: latar tint
    // muda + teks pekat senada, border 1px senada yang samar.
    const getStatusBadgeInfo = (currentStep: number, submission?: FormSubmission, activeStart?: string | null, activeEnd?: string | null) => {
        const steps = getStatusSteps(t, submission?.distribution_type);

        if (currentStep === -1) {
            return {
                label: t('statusRevisionNeeded'),
                color: 'bg-amber-50 text-amber-700 border-amber-200',
                icon: <AlertCircle className="w-4 h-4" />,
                style: {}
            };
        }

        const step = steps[currentStep];
        let color = 'bg-gray-50 text-gray-600 border-gray-200';
        let label = step.label;

        // Override label for publishing step based on actual status (extension-aware dates)
        if (step.key === 'publishing' && submission) {
            const now = new Date();
            const startStr = activeStart ?? submission.start_date;
            const endStr = activeEnd ?? submission.end_date;
            const startDate = startStr ? normalizeScheduleDate(startStr) : null;
            const endDate = endStr ? normalizeScheduleDate(endStr) : null;
            const isLive = startDate && endDate && startDate <= now && endDate >= now;
            const isCompleted = endDate && endDate < now;

            if (isCompleted) {
                label = 'Completed';
                color = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            } else if (isLive) {
                label = 'Live';
                color = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            } else if (startDate && startDate > now) {
                label = 'Ready to Launch';  // Scheduled but not yet live
                color = 'bg-jfu-primary/[0.08] text-jfu-primary border-jfu-primary/20';
            }
        }

        switch (step.key) {
            case 'in_review':
                color = 'bg-jfu-primary/[0.08] text-jfu-primary border-jfu-primary/20';
                break;
            case 'payment':
                color = 'bg-amber-50 text-amber-700 border-amber-200';
                break;
            case 'scheduling':
                color = 'bg-purple-50 text-purple-700 border-purple-200';
                break;
            case 'publishing':
                // Color already set above based on actual status
                if (!submission) {
                    color = 'bg-jfu-primary/[0.08] text-jfu-primary border-jfu-primary/20';
                }
                break;
            case 'completed':
                color = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                break;
        }

        return {
            label,
            color,
            icon: <step.icon className="w-4 h-4" />,
            style: {}
        };
    };

    // Satu sumber kebenaran state UI per order (chips, badge, callout, sort)
    const withUiState = submissions.map((submission) => {
        const exts = extendsBySubmission[submission.id!] || [];
        const pays = extendPayments[submission.id!] || {};
        const ui = deriveOrderUiState(submission, exts, pays, paymentLinks[submission.id!] || null);
        return { submission, exts, pays, ui };
    });

    const needsActionCount = withUiState.filter((o) => o.ui.needsAction).length;

    const filtered = withUiState
        .filter((o) => selectedFilter === 'all' || o.ui.group === selectedFilter)
        .sort((a, b) => {
            // Order butuh aksi selalu di atas, sisanya terbaru dulu
            if (a.ui.needsAction !== b.ui.needsAction) return a.ui.needsAction ? -1 : 1;
            return new Date(b.submission.created_at || 0).getTime() - new Date(a.submission.created_at || 0).getTime();
        });

    const filterChips: Array<{ value: FilterValue; label: string; count?: number }> = [
        { value: 'all', label: t('filterAll') },
        { value: 'butuh-aksi', label: t('filterNeedsAction'), count: needsActionCount },
        { value: 'berjalan', label: t('filterOngoing') },
        { value: 'selesai', label: t('filterDone') },
    ];

    if (loading) {
        return (
            <div>
                <PageHeader title={t('pageTitle')} />
                <div className="max-w-4xl mx-auto px-4 md:px-6 py-4 space-y-4">
                    <div className="flex gap-2">
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-8 w-20 rounded-full bg-gray-100" />
                        ))}
                    </div>
                    {/* Skeleton mengikuti anatomi kartu Soft DNA */}
                    {[1, 2].map((i) => (
                        <div key={i} className="border border-jfu-primary/[0.06] shadow-card overflow-hidden bg-white" style={{ borderRadius: '20px' }}>
                            <div className="p-5 space-y-2 border-b border-gray-100">
                                <div className="flex justify-between items-center">
                                    <Skeleton className="h-6 w-24 rounded-full bg-gray-100" />
                                    <Skeleton className="h-7 w-28 rounded-full bg-gray-100" />
                                </div>
                                <Skeleton className="h-6 w-3/4 bg-gray-100" />
                            </div>
                            <div className="p-5 space-y-4">
                                <Skeleton className="h-20 w-full rounded-2xl bg-gray-100" />
                                <div className="space-y-3">
                                    {[1, 2, 3].map((s) => (
                                        <div key={s} className="flex items-center gap-3">
                                            <Skeleton className="h-8 w-8 rounded-full bg-gray-100" />
                                            <Skeleton className="h-3 w-32 bg-gray-100" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                title={t('pageTitle')}
                action={
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        title={t('refresh')}
                        className="h-9 w-9 text-jfu-primary hover:bg-jfu-primary/10 hover:text-jfu-primary dark:text-gray-300"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </Button>
                }
            />

            <div className="max-w-4xl mx-auto px-4 md:px-6 py-4">
                {/* Hub produk — jalur masuk Buat Order setelah keluar dari navbar */}
                <CreateOrderCards hasOrders={submissions.length > 0} />

                {submissions.length === 0 ? (
                    /* Empty state = halaman landing user baru, rasa kartu landing page */
                    <Card className="border border-jfu-primary/[0.06] overflow-hidden shadow-card" style={{ borderRadius: '20px' }}>
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center px-6 bg-white">
                            <div className="w-14 h-14 bg-jfu-primary/[0.08] rounded-full flex items-center justify-center mb-4">
                                <span className="text-2xl" aria-hidden="true">🚀</span>
                            </div>
                            <h3 className="text-lg font-bold text-[#1a1a1a]">{t('noOrdersTitle')}</h3>
                            <p className="text-[#666] max-w-sm mt-2 mb-6 text-sm">
                                {t('noSubmissionsDesc')}
                            </p>

                            {/* Mini "cara kerjanya" */}
                            <div className="w-full max-w-sm text-left mb-6">
                                <p className="text-xs font-semibold text-[#666] mb-3">{t('howItWorksTitle')}</p>
                                <ol className="space-y-3">
                                    {[
                                        { icon: <Send className="w-4 h-4" />, label: t('howItWorksStep1') },
                                        { icon: <Search className="w-4 h-4" />, label: t('howItWorksStep2') },
                                        { icon: <Megaphone className="w-4 h-4" />, label: t('howItWorksStep3') },
                                    ].map((step, i) => (
                                        <li key={i} className="flex items-center gap-3 text-sm text-[#1a1a1a]">
                                            <span className="w-8 h-8 rounded-full bg-jfu-primary/[0.08] text-jfu-primary flex items-center justify-center shrink-0">
                                                {step.icon}
                                            </span>
                                            <span><span className="font-semibold text-gray-400 mr-1.5">{i + 1}.</span>{step.label}</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>

                            <Link to="/dashboard/submit" className="w-full max-w-sm">
                                <Button
                                    className="w-full min-h-11 rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 hover:from-jfu-primary hover:to-jfu-light transition-all"
                                >
                                    {t('createFirstOrder')}
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {/* Filter chips — satu baris scrollable */}
                        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
                            <div className="flex gap-2 w-max">
                                {filterChips.map((chip) => (
                                    <Button
                                        key={chip.value}
                                        variant={selectedFilter === chip.value ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setSelectedFilter(chip.value)}
                                        className={`rounded-full px-4 text-xs font-semibold whitespace-nowrap border ${selectedFilter === chip.value
                                            ? 'bg-jfu-primary/[0.12] text-jfu-primary border-jfu-primary/20 hover:bg-jfu-primary/[0.18] hover:text-jfu-primary'
                                            : 'bg-white text-[#666] border-gray-200 hover:border-jfu-primary/30 hover:bg-white hover:text-jfu-primary'}`}
                                    >
                                        {chip.label}
                                        {typeof chip.count === 'number' && chip.count > 0 && (
                                            <span className={`ml-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold ${selectedFilter === chip.value ? 'bg-jfu-primary/20 text-jfu-primary' : 'bg-red-100 text-red-700'}`}>
                                                {chip.count}
                                            </span>
                                        )}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {filtered.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-10">{t('noOrdersInFilter')}</p>
                        ) : (
                            <div className="space-y-4">
                                {filtered.map(({ submission, exts, pays, ui }) => {
                                    // Override badge for expired payment
                                    const badgeInfo = ui.isExpired && submission.payment_status !== 'paid'
                                        ? {
                                            label: 'Payment Expired',
                                            color: 'bg-rose-50 text-rose-700 border-rose-200',
                                            icon: <AlertCircle className="w-4 h-4" />,
                                            style: {}
                                        }
                                        : getStatusBadgeInfo(ui.currentStep, submission, ui.eff.activeStartDate, ui.eff.activeEndDate);

                                    return (
                                        /* Kartu Soft DNA (pola comparison-card landing): putih, border
                                           nyaris tak terlihat, soft shadow lebar, pemisah header tipis.
                                           borderRadius inline karena .rounded-lg legacy styles.css menang
                                           di cascade atas utilitas radius Tailwind pada <Card>. */
                                        <Card key={submission.id} className="overflow-hidden border border-jfu-primary/[0.06] shadow-card hover:shadow-xl transition-shadow" style={{ borderRadius: '20px' }}>
                                            {/* A. Header: chip layanan + badge status + judul */}
                                            <CardHeader className="bg-white pb-3 space-y-2.5 border-b border-gray-100">
                                                <div className="flex items-center justify-between gap-3">
                                                    <Chip
                                                        variant={submission.distribution_type === 'kilat' ? 'amber' : 'blue'}
                                                        size="sm"
                                                    >
                                                        {submission.distribution_type === 'kilat' ? '⚡ JFU Kilat' : 'Regular'}
                                                    </Chip>
                                                    <Badge variant="outline" className={`${badgeInfo.color} rounded-full border px-3 py-1 text-[11px] font-semibold flex items-center gap-1.5 shrink-0`} style={badgeInfo.style}>
                                                        {badgeInfo.icon}
                                                        {badgeInfo.label}
                                                    </Badge>
                                                </div>
                                                <CardTitle className="text-base md:text-lg font-bold text-[#1a1a1a] leading-snug line-clamp-2" title={submission.title}>
                                                    {submission.title}
                                                </CardTitle>
                                            </CardHeader>

                                            <CardContent className="pt-5 pb-4 bg-white">
                                                {/* B. Langkah berikutnya (elemen kunci) */}
                                                <NextStepCallout
                                                    submission={submission}
                                                    ui={ui}
                                                    invoiceId={invoiceIds[submission.id!] || null}
                                                    extendPayments={pays}
                                                    onReschedule={() => handleReschedule(submission)}
                                                    onDelete={() => handleDeleteSubmission(submission.id!)}
                                                />

                                                {/* C. Tracker 5 langkah (selalu terlihat, mode ringkas) */}
                                                {ui.currentStep !== -1 && (
                                                    <>
                                                        <div className="mt-1">
                                                            <ProgressTracker
                                                                submission={submission}
                                                                currentStep={ui.currentStep}
                                                                paymentLink={ui.finalPaymentLink}
                                                                invoiceId={invoiceIds[submission.id!] || null}
                                                                steps={getStatusSteps(t, submission.distribution_type)}
                                                                isExpired={ui.isExpired}
                                                                awaitingInvoice={ui.awaitingInvoice}
                                                                activeStartDate={ui.eff.activeStartDate}
                                                                activeEndDate={ui.eff.activeEndDate}
                                                                isExtended={ui.eff.isExtended}
                                                                compactCompleted
                                                                onReschedule={() => handleReschedule(submission)}
                                                            />
                                                        </div>

                                                        {/* D. Periode tayang (asli + perpanjangan terkonfirmasi) */}
                                                        <AiringPeriodsBar submission={submission} extends_={exts} />
                                                    </>
                                                )}

                                                {/* E. Detail order (accordion, default tertutup) */}
                                                <OrderDetailsSection
                                                    submission={submission}
                                                    extends_={exts}
                                                    extendPayments={pays}
                                                    invoiceId={invoiceIds[submission.id!] || null}
                                                    isPaid={ui.isPaid}
                                                />

                                                {/* F. Footer: baris chat penuh (deep-link ke Mimin dengan konteks order) */}
                                                <div className="border-t border-gray-100 mt-3" />
                                                <Link
                                                    to={`/dashboard/chat?message=${encodeURIComponent(`Saya ingin bertanya tentang order "${submission.title}"`)}`}
                                                    className="mt-1 -mb-1 min-h-11 flex items-center justify-between gap-2 rounded-lg px-3 -mx-1 text-sm text-[#666] hover:text-jfu-primary hover:bg-jfu-primary/[0.06] transition-colors"
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <MessageCircle className="w-4 h-4" />
                                                        {t('chatAboutOrder')}
                                                    </span>
                                                    <ChevronRight className="w-4 h-4 text-gray-300" />
                                                </Link>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
