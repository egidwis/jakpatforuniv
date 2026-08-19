import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { getFormSubmissionsByUser, getInvoicesByFormSubmissionId, getTransactionsByFormSubmissionId, fetchAdSchedules, getSurveyPagesBySubmissionIds, fetchScheduleBilling, dismissRejectedSubmission, prepareForReschedule, type AdScheduleEntry, type FormSubmission } from '@/utils/supabase';
import { SURVEY_DRAFT_KEY } from '@/utils/constants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, RefreshCw, ChevronRight, ListFilter, Check, ArrowUp } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { type SchedulePaymentMap } from '@/components/status/scheduleAxes';
import { Phase } from '@/components/status/PhaseRail';
import { ReviewPhase } from '@/components/status/ReviewPhase';
import { SchedulePhase } from '@/components/status/SchedulePhase';
import { PublicationPhase } from '@/components/status/PublicationPhase';
import { buildScheduleCards } from '@/components/status/airingPeriods';
import { PageHeader } from '@/components/PageHeader';
import { CreateOrderCards, ProductCardGrid } from '@/components/CreateOrderCards';
import { deriveOrderUiState, getActiveDashboardPhase, type OrderGroup } from '@/components/status/deriveOrderUiState';

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
    // Jadwal iklan per order, langsung dari cermin `ad_schedules` — baris yang
    // sama dengan yang dibaca papan Schedule admin (Task 9B).
    const [schedulesBySubmission, setSchedulesBySubmission] = useState<Record<string, AdScheduleEntry[]>>({});
    // Pembayaran per JADWAL, dikunci `sourceId` (= `transactions.extend_id`
    // untuk jadwal ke-2 dst.), bersarang per order.
    const [schedulePayments, setSchedulePayments] = useState<Record<string, SchedulePaymentMap>>({});
    // Halaman iklan per submission (slug + views) — blok order-level di bawah list jadwal
    const [surveyPages, setSurveyPages] = useState<Record<string, { views: number; slug: string | null }>>({});
    const [searchParams, setSearchParams] = useSearchParams();
    const [showScrollTop, setShowScrollTop] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 300);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

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
            const fetched = await getFormSubmissionsByUser(user.id, user.email);
            // Order yang sudah disingkirkan pemiliknya (lihat dismissRejectedSubmission)
            // ditandai `cancelled` dan disaring di sini, bukan dihapus dari database —
            // datanya tetap ada untuk penelusuran saat user menghubungi bantuan.
            // Di tabel ini `cancelled` HANYA berarti itu; pembatalan oleh admin hidup
            // di `form_submissions_extend`.
            const data = fetched.filter((s) => s.submission_status !== 'cancelled');
            setSubmissions(data);

            // Fetch payment links for each submission
            const links: Record<string, string | null> = {};
            const invIds: Record<string, string | null> = {};
            const schedPayments: Record<string, SchedulePaymentMap> = {};

            const allSubmissionIds = data.map((s) => s.id).filter((id): id is string => !!id);

            // Loop transaksi per order + dua pengambilan massal, sekaligus
            const [, allSchedules, pagesMap] = await Promise.all([
                // Use Promise.all for parallel fetching to prevent blocking
                Promise.all(data.map(async (submission) => {
                    if (submission.id) {
                        let foundTransactionId: string | null = null;
                        try {
                            const transactions = await getTransactionsByFormSubmissionId(submission.id);
                            // Separate the survey's own transaction from extend transactions,
                            // which share the same form_submission_id (entity_type='extend').
                            const mainTx = transactions.filter((tx) => tx.entity_type !== 'extend');

                            if (mainTx.length > 0) {
                                const paidTx = mainTx.find((tx) => tx.status === 'completed' || tx.status === 'paid');
                                const pickedTx = paidTx || mainTx[0];
                                if (pickedTx?.payment_id) {
                                    foundTransactionId = pickedTx.payment_id;
                                }
                                if (submission.payment_status !== 'paid' && mainTx[0].payment_url) {
                                    links[submission.id] = mainTx[0].payment_url;
                                }
                            }

                            // Peta pembayaran per jadwal, dikunci `sourceId`.
                            //
                            // ⚠️ DULU INI MENGAMBIL TRANSAKSI PERTAMA YANG
                            // KEBETULAN COCOK. Sejak satu jadwal boleh punya
                            // beberapa tagihan (Task 13), "yang pertama" bisa
                            // saja tagihan lama yang sudah lunas — dan tombol
                            // bayar peneliti akan menunjuk ke sana, bukan ke
                            // tagihan yang sedang menunggu dibayar.
                            //
                            // `schedule_billing_bulk` (sql/53) yang memutuskan
                            // mana yang terbuka, dengan aturan yang sama persis
                            // dengan layar admin. Peneliti tetap hanya melihat
                            // SATU tagihan — keputusan pemilik produk — tapi
                            // sekarang tagihan yang benar.
                            const payMap: SchedulePaymentMap = {};
                            try {
                                const billings = await fetchScheduleBilling(submission.id);
                                billings.forEach((b) => {
                                    const shown = b.openInvoice ?? b.invoices.find((i) => i.isPaid) ?? null;
                                    payMap[b.sourceId] = {
                                        paymentUrl: b.openInvoice?.paymentUrl || null,
                                        paymentId: shown?.paymentId || null,
                                        // `isSettled`, bukan "ada yang pernah lunas":
                                        // jadwal yang masih menyisakan tagihan
                                        // susulan harus tetap terbaca menunggu bayar.
                                        status: b.isSettled ? 'paid' : (shown?.status || null),
                                        amount: b.billed || shown?.amount || 0,
                                    };
                                });
                            } catch (e) {
                                console.error(`Gagal memuat tagihan per jadwal untuk ${submission.id}:`, e);
                            }
                            schedPayments[submission.id] = payMap;
                        } catch (e) {
                            console.error(`Error fetching transactions for ${submission.id}:`, e);
                        }

                        // Try to get manual invoice if no transaction payment_id or link is found
                        if (!foundTransactionId || (submission.payment_status !== 'paid' && !links[submission.id])) {
                            try {
                                const invoices = await getInvoicesByFormSubmissionId(submission.id);
                                // Exclude extend invoices — only the survey's own invoice is the main link
                                const mainInvoices = invoices.filter((inv) => inv.entity_type !== 'extend');
                                if (mainInvoices.length > 0) {
                                    if (!foundTransactionId && mainInvoices[0].payment_id) {
                                        foundTransactionId = mainInvoices[0].payment_id;
                                    }
                                    if (submission.payment_status !== 'paid' && mainInvoices[0].invoice_url && !links[submission.id]) {
                                        links[submission.id] = mainInvoices[0].invoice_url;
                                    }
                                }
                            } catch (e) {
                                console.error(`Error fetching invoices for ${submission.id}:`, e);
                            }
                        }

                        if (foundTransactionId) {
                            invIds[submission.id] = foundTransactionId;
                        }

                        // No payment link found
                        if (!links[submission.id]) {
                            links[submission.id] = null;
                        }
                    }
                })),
                fetchAdSchedules(allSubmissionIds),
                getSurveyPagesBySubmissionIds(allSubmissionIds),
            ]);

            const bySub: Record<string, AdScheduleEntry[]> = {};
            allSchedules.forEach((s) => {
                if (!bySub[s.submissionId]) bySub[s.submissionId] = [];
                bySub[s.submissionId].push(s);
            });

            setSchedulesBySubmission(bySub);
            setSchedulePayments(schedPayments);
            setPaymentLinks(links);
            setInvoiceIds(invIds);
            setSurveyPages(pagesMap);
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

    /** Order yang sedang dikonfirmasi untuk disingkirkan (null = dialog tertutup). */
    const [pendingDismiss, setPendingDismiss] = useState<FormSubmission | null>(null);
    const [isDismissing, setIsDismissing] = useState(false);

    const confirmDismissSubmission = async () => {
        const target = pendingDismiss;
        if (!target?.id) return;
        setIsDismissing(true);
        try {
            await dismissRejectedSubmission(target.id);
            setSubmissions(prev => prev.filter(s => s.id !== target.id));
            setPendingDismiss(null);
            toast.success(t('deleteSubmissionSuccess'));
        } catch (error) {
            // Dulu kegagalan di sini tak pernah terlihat: baris tetap dibuang dari
            // state dan toast sukses tetap tampil, sehingga order "hidup lagi" saat
            // refresh. Sekarang daftar TIDAK disentuh kalau server menolak.
            console.error('Failed to dismiss submission:', error);
            toast.error(t('deleteSubmissionError'));
        } finally {
            setIsDismissing(false);
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
                // Order ini sudah pernah disetujui S&K-nya saat dipesan. Jadwal
                // ulang mendarat langsung di langkah Jadwal — melewati Ringkasan,
                // satu-satunya tempat kotak centang itu ada — jadi tanpa baris
                // ini penguncian slot akan ditolak dan user terjebak.
                termsAccepted: true,
                isReschedule: true,
                submissionIdToReplace: submission.id,
            };

            // Step 3 = Jadwal sejak urutan flow dibalik (1 Detail, 2 Ringkasan,
            // 3 Jadwal). Salah angka di sini = user mendarat di layar yang salah.
            localStorage.setItem(SURVEY_DRAFT_KEY, JSON.stringify({
                formData: recoveredData,
                currentStep: 3
            }));

            toast.dismiss(loadingToast);
            toast.success('Silakan pilih slot baru untuk jadwal ulang');

            // Navigate to submit page
            navigate('/dashboard/submit-iklan');
        } catch (error) {
            console.error('Error preparing for reschedule:', error);
            toast.dismiss(loadingToast);
            toast.error('Gagal mempersiapkan jadwal ulang. Silakan coba lagi.');
        }
    };

    // Satu sumber kebenaran state UI per order (chips, callout, sort)
    const withUiState = submissions.map((submission) => {
        const scheds = schedulesBySubmission[submission.id!] || [];
        const pays = schedulePayments[submission.id!] || {};
        const ui = deriveOrderUiState(submission, scheds, pays, paymentLinks[submission.id!] || null);
        return { submission, pays, ui };
    });

    const needsActionCount = withUiState.filter((o) => o.ui.needsAction).length;

    const filtered = withUiState
        .filter((o) => selectedFilter === 'all' || o.ui.group === selectedFilter)
        .sort((a, b) => {
            // Urutkan murni berdasarkan tanggal order terbaru (created_at descending)
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
                        <div key={i} className="border border-slate-200/90 shadow-xs overflow-hidden bg-white rounded-2xl">
                            <div className="p-5 md:p-6 space-y-2 border-b border-slate-100">
                                <div className="flex justify-between items-center">
                                    <Skeleton className="h-6 w-24 rounded-full bg-slate-100" />
                                    <Skeleton className="h-7 w-28 rounded-full bg-slate-100" />
                                </div>
                                <Skeleton className="h-6 w-3/4 bg-slate-100" />
                            </div>
                            <div className="p-5 md:p-6 space-y-4">
                                <Skeleton className="h-20 w-full rounded-2xl bg-slate-100" />
                                <div className="space-y-3">
                                    {[1, 2, 3].map((s) => (
                                        <div key={s} className="flex items-center gap-3">
                                            <Skeleton className="h-8 w-8 rounded-full bg-slate-100" />
                                            <Skeleton className="h-3 w-32 bg-slate-100" />
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
                    <div className="flex items-center gap-1">
                        {/* Filter status pindah dari baris chips ke dropdown di header;
                            badge merah menjaga sinyal "butuh aksi" tetap terlihat tanpa klik. */}
                        {submissions.length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    aria-label={t('filterAll')}
                                    className={`relative flex items-center justify-center h-9 w-9 rounded-md transition-colors outline-none ${selectedFilter !== 'all'
                                        ? 'bg-jfu-primary/[0.12] text-jfu-primary'
                                        : 'text-jfu-primary hover:bg-jfu-primary/10 dark:text-gray-300'
                                        }`}
                                >
                                    <ListFilter className="w-4 h-4" />
                                    {needsActionCount > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                                            {needsActionCount}
                                        </span>
                                    )}
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                    {filterChips.map((chip) => (
                                        <DropdownMenuItem
                                            key={chip.value}
                                            onClick={() => setSelectedFilter(chip.value)}
                                            className="cursor-pointer justify-between"
                                        >
                                            <span className={selectedFilter === chip.value ? 'font-semibold text-jfu-primary' : ''}>
                                                {chip.label}
                                                {typeof chip.count === 'number' && chip.count > 0 && (
                                                    <span className="ml-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                                                        {chip.count}
                                                    </span>
                                                )}
                                            </span>
                                            {selectedFilter === chip.value && <Check className="w-4 h-4 text-jfu-primary" />}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
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
                    </div>
                }
            />

            <div className="max-w-4xl mx-auto px-4 md:px-6 py-4">
                {/* Hub produk — jalur masuk Buat Order setelah keluar dari navbar.
                    Saat belum ada order, empty state di bawah yang memegang kartu
                    produk (satu pintu masuk, tanpa duplikasi CTA). */}
                {submissions.length > 0 && <CreateOrderCards />}

                {submissions.length === 0 ? (
                    /* Empty state = halaman landing user baru, rasa kartu landing page */
                    <Card className="border border-slate-200/90 overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] rounded-2xl">
                        <CardContent className="flex flex-col items-center justify-center py-12 text-center px-6 bg-white">
                            <div className="w-14 h-14 bg-blue-50 text-jfu-primary rounded-2xl flex items-center justify-center mb-4 border border-blue-100">
                                <span className="text-2xl" aria-hidden="true">🚀</span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-900">{t('noOrdersTitle')}</h3>
                            <p className="text-slate-500 max-w-sm mt-2 mb-6 text-sm">
                                {t('noSubmissionsDesc')}
                            </p>

                            {/* Kartu produk menggantikan tombol generik "Buat Order
                                Pertama" — ujung alur baca langsung memilih produk.
                                Tanpa max-w agar proporsi kartu sama dengan versi
                                di CreateOrderCards (hub "Buat Order"). */}
                            <div className="w-full text-left">
                                <ProductCardGrid />
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {filtered.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-10">{t('noOrdersInFilter')}</p>
                        ) : (
                            <div className="space-y-4">
                                {filtered.map(({ submission, pays, ui }) => {
                                    const cards = buildScheduleCards(ui, pays, invoiceIds[submission.id!] || null, t);
                                    const pageInfo = submission.id ? surveyPages[submission.id] : undefined;
                                    const activePhase = getActiveDashboardPhase(ui.currentStep);
                                    const reachedPhase = activePhase ?? 3;
                                    return (
                                        <Card key={submission.id} className="overflow-hidden border border-slate-200/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.03),0_4px_12px_-2px_rgba(0,0,0,0.02)] hover:border-slate-300 transition-colors duration-150 rounded-2xl">
                                            <CardHeader className="bg-white p-5 md:p-6 pb-4 md:pb-5 space-y-2.5 border-b border-slate-100">
                                                <div>
                                                    <Chip
                                                        variant={submission.distribution_type === 'kilat' ? 'amber' : 'blue'}
                                                        size="sm"
                                                    >
                                                        {submission.distribution_type === 'kilat' ? `⚡ ${t('productKilatTitle')}` : t('productAdsTitle')}
                                                    </Chip>
                                                </div>
                                                <CardTitle className="text-base md:text-lg font-bold text-slate-900 leading-snug line-clamp-2" title={submission.title}>
                                                    {submission.title}
                                                </CardTitle>
                                            </CardHeader>

                                            <CardContent className="p-5 md:p-6 pt-5 bg-white">
                                                <Phase number={1} title={t('phaseReviewTitle')} active={reachedPhase >= 1} lineActive={reachedPhase >= 2}>
                                                    <ReviewPhase
                                                        submission={submission}
                                                        first={ui.first}
                                                        onDelete={() => setPendingDismiss(submission)}
                                                        onDataUpdated={fetchSubmissions}
                                                        active={activePhase === 1}
                                                    />
                                                </Phase>

                                                <Phase number={2} title={t('airingPeriodLabel')} active={reachedPhase >= 2} lineActive={reachedPhase >= 3}>
                                                    <SchedulePhase
                                                        submission={submission}
                                                        cards={cards}
                                                        onReschedule={() => handleReschedule(submission)}
                                                        active={activePhase === 2}
                                                    />
                                                </Phase>

                                                <Phase number={3} title={t('sectionPublication')} active={reachedPhase >= 3} isLast>
                                                    <PublicationPhase cards={cards} pageInfo={pageInfo} />
                                                </Phase>

                                                {/* F. Footer: baris chat rata kanan (deep-link ke Mimin dengan konteks order) */}
                                                <div className="border-t border-slate-100 mt-4 pt-3" />
                                                <div className="flex justify-end">
                                                    <Link
                                                        to={`/dashboard/chat?message=${encodeURIComponent(`Saya ingin bertanya tentang order "${submission.title}"`)}`}
                                                        className="min-h-10 inline-flex items-center gap-2 rounded-xl px-3 text-xs font-semibold text-slate-600 hover:text-jfu-primary hover:bg-blue-50/50 transition-colors"
                                                    >
                                                        <MessageCircle className="w-4 h-4 shrink-0 text-slate-400" />
                                                        <span>{t('chatAboutOrder')}</span>
                                                        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                                                    </Link>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Floating move to top button */}
            <button
                type="button"
                onClick={scrollToTop}
                aria-label="Kembali ke atas"
                title="Kembali ke atas"
                className={`fixed bottom-6 right-6 z-50 p-3 rounded-full bg-white text-jfu-primary shadow-xl border border-jfu-primary/20 hover:bg-jfu-primary hover:text-white transition-all duration-300 transform ${showScrollTop ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'}`}
            >
                <ArrowUp className="w-5 h-5" />
            </button>

            {/* Konfirmasi menyingkirkan order yang ditolak. Menggantikan window.confirm()
                polos — dialog ini menyebut judul surveinya supaya tidak salah sasaran,
                dan menegaskan bahwa datanya disimpan (bukan dihapus permanen). */}
            <Dialog open={pendingDismiss !== null} onOpenChange={(open) => { if (!open && !isDismissing) setPendingDismiss(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('dismissSubmissionTitle')}</DialogTitle>
                        <DialogDescription className="pt-1 leading-relaxed">
                            {t('dismissSubmissionDescPart1')}{' '}
                            <strong className="font-semibold text-gray-900">{pendingDismiss?.title || t('untitledSurvey')}</strong>{' '}
                            {t('dismissSubmissionDescPart2')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setPendingDismiss(null)}
                            disabled={isDismissing}
                            className="max-md:w-full rounded-full"
                        >
                            {t('cancel')}
                        </Button>
                        <Button
                            onClick={confirmDismissSubmission}
                            disabled={isDismissing}
                            className="max-md:w-full rounded-full bg-rose-600 text-white hover:bg-rose-700"
                        >
                            {isDismissing ? t('dismissSubmissionLoading') : t('dismissSubmissionConfirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
