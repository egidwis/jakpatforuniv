import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/i18n/LanguageContext';
import { getFormSubmissionsByUser, getInvoicesByFormSubmissionId, getTransactionsByFormSubmissionId, fetchAdSchedules, getSurveyPagesBySubmissionIds, fetchScheduleBilling, fetchInvoiceGroups, dismissSubmission, cancelOrder, type AdScheduleEntry, type FormSubmission, type InvoiceGroup } from '@/utils/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, ChevronRight, ChevronDown, ListFilter, Check, ArrowUp, Copy, ClipboardList, ListPlus } from 'lucide-react';
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
import { payLinkForBill, payLinkPath } from '@/utils/payLink';
import { Phase } from '@/components/status/PhaseRail';
import { ReviewPhase } from '@/components/status/ReviewPhase';
import { SchedulePhase } from '@/components/status/SchedulePhase';
import { OrderSummaryBar } from '@/components/status/OrderSummaryBar';
import { orderSummaryOf } from '@/components/status/orderSummary';
import { PublicationPhase } from '@/components/status/PublicationPhase';
import { buildScheduleCards } from '@/components/status/airingPeriods';
import { groupInfoFor } from '@/components/status/invoiceGroups';
import { CreateOrderCards, NewOrderFab } from '@/components/CreateOrderCards';
import { canUseKilatSelfServe } from '@/utils/kilatAccess';
import { deriveOrderUiState, getActiveDashboardPhase, type OrderGroup } from '@/components/status/deriveOrderUiState';
import { AdsEntryModal } from '@/components/AdsEntryModal';
import { AdminHolidayBanner } from '@/components/status/AdminHolidayBanner';
import { awayBlocksKilatPick } from '@/components/status/AdminAwayModal';
import { canSelfSchedule, useSelfBookingClosure } from '@/utils/selfBookingClosure';
import { ProfileCompletionSheet } from '@/components/ProfileCompletionSheet';
import { isProfileGateSatisfied } from '@/components/ProfileForm';

type FilterValue = 'all' | OrderGroup;

/**
 * Boleh membatalkan sendiri? Hanya selama BELUM ADA UANG.
 *
 * Ini lapis KETIGA, dan yang paling lemah dari ketiganya — ia cuma menentukan
 * apakah tautannya terlihat. Yang benar-benar menegakkan aturan:
 *
 *   1. Trigger `guard_payment_columns()` (sql/33) di database — menolak
 *      transisi non-admin pada order yang menyentuh paid/scheduled/live/
 *      completed. Dipanggil paksa lewat konsol pun tetap gagal.
 *   2. Penyaring `.in(...)` di `cancelOrder()`.
 *
 * Order yang sudah lunas/tayang diarahkan menghubungi tim, bukan diberi tombol
 * yang akan ditolak server.
 */
function canCancelOrder(ui: { isPaid: boolean; currentStep: number; callout: string }): boolean {
    if (ui.isPaid) return false;
    if (ui.currentStep >= 3) return false;
    return ['review_manual', 'revision', 'choose_schedule', 'awaiting_admin_schedule',
        'payment', 'awaiting_invoice', 'expired', 'too_late_today'].includes(ui.callout);
}

/**
 * Nomor order, gaya nomor faktur: label kecil + kode mono yang lebih besar dan kontras,
 * tombol salin SELALU terlihat. Ini kode yang dikutip peneliti ke admin (pencarian admin
 * mencocokkan 8 hex pertama id submission — lihat `submissionIdsForBookingId`), jadi harus
 * mudah ditemukan & disalin, tapi tetap di bawah judul survei dalam hierarki.
 *
 * Sengaja berbeda dari "Booking ID" (kode per JADWAL, di dalam tiket): dua kode, dua nama.
 */
function CopyOrderIdBadge({ id }: { id: string }) {
    const { t } = useLanguage();
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(id);
            setCopied(true);
            toast.success(t('submissionIdCopied'));
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard API fallback */
        }
    };

    return (
        <button
            type="button"
            onClick={handleCopy}
            className="group/id ml-auto -mr-2 inline-flex items-center gap-2 h-8 px-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title={`${t('copySubmissionId')}: ${id}`}
            aria-label={`${t('copySubmissionId')}: ${id}`}
        >
            <span className="text-xs font-medium text-slate-500">{t('orderIdLabel')}</span>
            <span className="font-mono text-sm font-semibold tracking-tight text-slate-800">#{id.slice(0, 8)}</span>
            {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400 group-hover/id:text-jfu-primary shrink-0 transition-colors" />
            )}
        </button>
    );
}

/** Desktop yang cukup tinggi untuk bingkai daftar order bergulir sendiri. Di bawah ini
 *  (ponsel, layar pendek) halaman menggulir seperti biasa — bingkai bertinggi tetap di
 *  layar pendek lebih menyiksa daripada berguna. */
const FRAME_QUERY = '(min-width: 1024px) and (min-height: 700px)';
/** Jarak bingkai ke tepi bawah layar. */
const FRAME_BOTTOM_GUTTER = 24;

export function StatusPage() {
    const { user } = useAuth();
    /** Reservasi mandiri ditutup (sql/125) — kartu ringkas menahan CTA pilih tanggal. */
    const selfBookingClosure = useSelfBookingClosure();
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
    /**
     * Tagihan gabungan yang menaungi jadwal-jadwal peneliti ini, dikunci
     * `payment_id`.
     *
     * ⚠️ HIDUP DI TINGKAT HALAMAN, BUKAN DI DALAM KARTU ORDER, dan itu memang
     * satu-satunya tempat yang mungkin: anggota sebuah tagihan gabungan tersebar
     * di ORDER-ORDER YANG BERBEDA. Komponen yang cuma memegang satu order tidak
     * akan pernah bisa menjawab "berapa pesanan yang ditanggung tagihan ini" —
     * ia selalu menjawab 1, tepat pada kasus yang pertanyaannya diajukan.
     */
    const [invoiceGroups, setInvoiceGroups] = useState<Map<string, InvoiceGroup>>(new Map());
    // Halaman iklan per submission (slug + views) — blok order-level di bawah list jadwal
    const [surveyPages, setSurveyPages] = useState<Record<string, { views: number; slug: string | null }>>({});
    const [searchParams, setSearchParams] = useSearchParams();
    const [showScrollTop, setShowScrollTop] = useState(false);

    /* Kartu order yang DIBUKA di ponsel (id submission). Di ponsel kartu default ringkas; di desktop
       kartu selalu terbuka (`lg:`) dan state ini tak berpengaruh. */
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
    const setOrderExpanded = (id: string, open?: boolean) =>
        setExpandedOrders((prev) => {
            const next = new Set(prev);
            const shouldOpen = open ?? !next.has(id);
            if (shouldOpen) next.add(id); else next.delete(id);
            return next;
        });

    /*
      Bingkai daftar order. Di desktop yang cukup tinggi (`FRAME_QUERY`) halaman TIDAK
      menggulir: kepala "My Order" diam, dan hanya bingkai di bawahnya yang menggulir.
      Tingginya DIUKUR (sisa layar di bawah posisi atasnya), bukan dihitung dari angka
      navbar — banner "Profil belum lengkap" menggeser semuanya dan angka tetap pasti
      meleset. `frameHeight === null` = mode biasa: halaman menggulir seperti semula
      (ponsel, lg yang pendek). Callback-ref karena bingkai baru ada setelah skeleton
      pemuatan diganti isi.
    */
    const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
    const [frameHeight, setFrameHeight] = useState<number | null>(null);
    useLayoutEffect(() => {
        if (!frameEl) return;
        const mq = window.matchMedia(FRAME_QUERY);
        const measure = () => {
            if (!mq.matches) { setFrameHeight(null); return; }
            // Atas KOLOM, bukan atas bingkai: di mode bingkai kepala melayang di atas bingkai
            // sehingga posisi atas bingkai sendiri berubah antara sebelum & sesudah diukur.
            const top = (frameEl.parentElement ?? frameEl).getBoundingClientRect().top + window.scrollY;
            setFrameHeight(Math.floor(window.innerHeight - top - FRAME_BOTTOM_GUTTER));
        };
        measure();
        mq.addEventListener('change', measure);
        window.addEventListener('resize', measure);
        // Banner profil / skeleton yang muncul belakangan menggeser posisi atas bingkai.
        const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        ro?.observe(document.body);
        return () => {
            mq.removeEventListener('change', measure);
            window.removeEventListener('resize', measure);
            ro?.disconnect();
        };
    }, [frameEl]);
    const framed = frameHeight !== null;

    // Modal Pintu Masuk Iklan Survei (2-Step Modal)
    // Satu modal pintu masuk untuk kedua produk; `null` = tertutup.
    const [entryProduct, setEntryProduct] = useState<'ads' | 'kilat' | null>(null);
    const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false);
    const [pendingContinue, setPendingContinue] = useState<'ads' | 'kilat' | null>(null);
    // Pintu Kilat dibuka bertahap (Phase 5 §5.6): admin & akun uji dulu.
    const kilatOpen = canUseKilatSelfServe(user?.email);

    // Jenis order ditetapkan oleh pintu yang dipakai — wizard membaca `?product`.
    const openSurveyOrder = (product: 'ads' | 'kilat') => {
        navigate(product === 'kilat' ? '/dashboard/submit-iklan?product=kilat' : '/dashboard/submit-iklan');
    };

    const handleContinueEntry = async () => {
        const product = entryProduct ?? 'ads';
        setEntryProduct(null);
        const isProfileSatisfied = await isProfileGateSatisfied();
        if (!isProfileSatisfied) {
            setPendingContinue(product);
            setIsProfileSheetOpen(true);
            return;
        }
        openSurveyOrder(product);
    };

    const handleProfileCompleted = () => {
        setIsProfileSheetOpen(false);
        if (!pendingContinue) return;
        const product = pendingContinue;
        setPendingContinue(null);
        openSurveyOrder(product);
    };

    useEffect(() => {
        // Dua kemungkinan penggulir: halaman (mode biasa) atau bingkai (desktop tinggi).
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 300 || (frameEl?.scrollTop ?? 0) > 300);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        frameEl?.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', handleScroll);
            frameEl?.removeEventListener('scroll', handleScroll);
        };
    }, [frameEl]);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        frameEl?.scrollTo({ top: 0, behavior: 'smooth' });
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

    // Ganti filter = daftar baru; bingkai yang masih tergulir jauh akan tampak kosong/salah tempat.
    useEffect(() => {
        frameEl?.scrollTo({ top: 0 });
    }, [selectedFilter, frameEl]);

    // Handle query params for notifications
    useEffect(() => {
        const status = searchParams.get('status');
        const paymentStatus = searchParams.get('payment_status');

        if (status === 'survey_submitted') {
            // Tanpa toast: modal "Order Berhasil Dikirim" sudah mengumumkannya
            // sesaat sebelum peneliti diantar ke sini. Param tetap dibersihkan.
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
            // DUA penyaring, dua sebab yang berbeda:
            //
            //  `dismissed_at`  — PEMILIKNYA menyingkirkan order ini dari daftarnya
            //                    (sql/69). Preferensi tampilan; datanya tetap ada
            //                    untuk penelusuran saat ia menghubungi bantuan.
            //                    Dulu perannya dipegang `submission_status='cancelled'`,
            //                    yang membuat kata "cancelled" tidak bisa dipakai
            //                    untuk pembatalan yang sesungguhnya.
            //
            //  `spam`          — admin menandainya BUKAN ORDER SUNGGUHAN. Sebelum ini
            //                    `reviewStateOf` melipatnya jadi `rejected`, jadi order
            //                    spam justru BERTERIAK di dashboard peneliti menyuruhnya
            //                    memperbaiki kuesioner — dan ia bisa menghidupkannya
            //                    sendiri lewat "Saya Sudah Perbaiki", berulang kali.
            //
            // `cancelled` sengaja TIDAK disaring: order yang dibatalkan HARUS tetap
            // terlihat (tab "Selesai"), supaya peneliti tahu apa yang terjadi alih-alih
            // ordernya lenyap tanpa jejak.
            const data = fetched.filter(
                (s) => !s.dismissed_at && s.submission_status !== 'spam'
            );
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
                        let payMapAnswered = false;
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
                                /*
                                  ⚠️ CABANG INI DULU MEMASANG LINK BAYAR DARI
                                  `transactions`, DAN SEKARANG TIDAK LAGI.

                                  Ia menyaring `status === 'pending'` — PENDING,
                                  BUKAN BELUM-KEDALUWARSA. Dan `transactions`
                                  tidak punya kolom `expires_at` sama sekali
                                  (diverifikasi produksi, dicatat di sql/83),
                                  jadi jalur ini BUTA SECARA STRUKTURAL: tidak
                                  ada cara memperbaikinya di tempatnya.

                                  ⚠️ JANGAN "MEMPERBAIKINYA" DENGAN MENAMBAH
                                  KOLOM `expires_at` KE `transactions`.
                                  `buildInvoiceRows` menyusun baris invoice DAN
                                  transaksi dari objek `shared` yang sama, dan
                                  `expires_at` di sana pernah membuat INSERT
                                  transaksi ditolak 400 — yang menggagalkan
                                  SELURUH tagihan.

                                  Yang menjawab sekarang `schedule_billing_bulk`
                                  lewat `payMap` di bawah, dengan predikat
                                  `live` yang sama dengan layar admin. Di sana
                                  `pending` di `transactions` memang sengaja
                                  TIDAK dianggap piutang: itu checkout yang
                                  DITINGGALKAN, bukan tagihan. Yang hilang cuma
                                  tombol untuk beberapa checkout telantar —
                                  peneliti yang benar-benar ingin membayar
                                  mendapat tagihan baru dari `create-payment`.

                                  `foundTransactionId` di atas TETAP diambil:
                                  ia cuma menamai invoice di layar, tidak
                                  menagih apa pun.
                                */
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
                                billings.forEach((b, scheduleId) => {
                                    const shown = b.openInvoice ?? b.invoices.find((i) => i.isPaid) ?? null;
                                    payMap[b.sourceId] = {
                                        paymentUrl: b.openInvoice?.paymentUrl || null,
                                        paymentId: shown?.paymentId || null,
                                        // Kunci Map-nya `ad_schedules.id`; kunci payMap-nya
                                        // `sourceId`. Keduanya beda untuk jadwal ke-2 dst.
                                        scheduleId,
                                        // `isSettled`, bukan "ada yang pernah lunas":
                                        // jadwal yang masih menyisakan tagihan
                                        // susulan harus tetap terbaca menunggu bayar.
                                        status: b.isSettled ? 'paid' : (shown?.status || null),
                                        amount: b.billed || shown?.amount || 0,
                                        // Sisa tagihan, bukan harga penuh (D4). `outstanding`
                                        // sudah dihitung `fetchScheduleBilling` dengan aturan
                                        // yang sama persis dengan layar admin — jangan
                                        // menguranginya lagi di sini.
                                        paid: b.paid,
                                        outstanding: b.outstanding,
                                        isExpired: !!b.openInvoice?.isExpired,
                                        expiresAt: b.openInvoice?.expiresAt ?? null,
                                        staleBilledFor: b.openInvoice ? null : (b.staleInvoice?.billedStartDate ?? null),
                                    };
                                });
                            } catch (e) {
                                console.error(`Gagal memuat tagihan per jadwal untuk ${submission.id}:`, e);
                            }
                            schedPayments[submission.id] = payMap;

                            // ⚠️ JADWAL PERTAMA MEMAKAI JALUR DATA YANG LAIN — dan itu
                            // yang membuat perbaikan di atas sempat tidak terasa.
                            // `airingPeriods` membaca `payments[sourceId]` HANYA untuk
                            // jadwal ke-2 dst.; kartu jadwal pertama memakai `links`
                            // yang dirakit tangan dari transaksi/invoice terbaru.
                            //
                            // Untuk ordinal 1, `sourceId` MEMANG id submission-nya, jadi
                            // peta yang sama sudah memuat jawabannya. Pakai itu, dan
                            // biarkan `schedule_billing` jadi satu-satunya yang memutuskan
                            // tagihan mana yang masih terbuka — bukan aturan keempat
                            // yang dirakit di sini.
                            const ownBilling = payMap[submission.id];
                            if (ownBilling) {
                                payMapAnswered = true;
                                /*
                                  ⚠️ LINK YANG SUDAH KEDALUWARSA TIDAK DIPASANG.
                                  `is_expired` (sql/83) dihitung di DB dari
                                  `expires_at`; barisnya sendiri tetap `pending`
                                  karena tidak ada cron yang mematikannya. Tanpa
                                  penjaga ini kartu ordinal 1 menawarkan "Bayar
                                  Sekarang" ke halaman DOKU yang menolaknya —
                                  peneliti tidak diberi tahu apa pun soal
                                  kenapa, dan admin tidak pernah tahu ia mencoba.

                                  ⚠️ CADANGAN `?? links[...]` SUDAH DIBUANG.
                                  Ia dulu mempertahankan transaksi `pending`
                                  yang dirakit di cabang warisan di atas —
                                  cabang yang kini tidak lagi memasang link
                                  karena `transactions` buta terhadap
                                  kedaluwarsa. Membiarkan `??` berarti
                                  menyediakan pintu belakang bagi nilai yang
                                  tidak akan pernah datang lagi, dan pembaca
                                  berikutnya akan mengira jalur itu masih hidup.

                                  Ordinal 1 memakai link perantara juga —
                                  `sourceId` untuk ordinal 1 memang id
                                  submission-nya, tapi resolver butuh
                                  `ad_schedules.id`, jadi ia diambil dari
                                  `scheduleId` yang dibawa `payMap`.

                                  ⚠️ GERBANGNYA PERNAH DITUKAR DI SINI, DAN ITU
                                  MEMBUAT PENELITI TERDAMPAR. Nilai ini dibaca
                                  di hulu sebagai PENANDA KEBERADAAN — kartu
                                  jadwal memilih `waiting_payment` vs
                                  `awaiting_invoice` dari ada/tidaknya ia. Saat
                                  isinya diganti `payLinkPath(scheduleId)`
                                  polos, ia berhenti bisa `null` (`scheduleId`
                                  selalu ada — ia kunci Map `fetchScheduleBilling`),
                                  jadi kartunya selamanya menawarkan "Bayar
                                  Sekarang" untuk jadwal yang seluruh tagihannya
                                  sudah dibatalkan.

                                  ⚠️ `isExpired` SENDIRIAN TIDAK MENJAGA APA PUN
                                  di jalur ini: `openInvoice` sudah disaring
                                  `isLiveInvoice()`, yang mensyaratkan
                                  `!isExpired` untuk tagihan `pending`. Yang
                                  benar-benar menjawab "ada yang bisa dibayar?"
                                  adalah `paymentUrl`. Aturannya kini tinggal di
                                  `payLinkForBill` supaya bisa dikunci tes —
                                  komponen ini tidak bisa.
                                */
                                links[submission.id] = payLinkForBill(ownBilling);
                                if (ownBilling.paymentId) foundTransactionId = ownBilling.paymentId;
                            }
                        } catch (e) {
                            console.error(`Error fetching transactions for ${submission.id}:`, e);
                        }

                        // Cadangan untuk order yang TIDAK punya baris jadwal sama sekali
                        // (15 order per Task 11 — belum bertanggal, jadi tak ada
                        // `ad_schedules` untuk dihitung). Kalau `schedule_billing` sudah
                        // menjawab, jangan ditimpa dari sini: jawabannya sudah benar,
                        // termasuk saat jawabannya "tidak ada tagihan terbuka".
                        const billingAnswered = !!payMapAnswered;
                        if (!billingAnswered && (!foundTransactionId || (submission.payment_status !== 'paid' && !links[submission.id]))) {
                            try {
                                const invoices = await getInvoicesByFormSubmissionId(submission.id);
                                // Exclude extend invoices — only the survey's own invoice is the main link
                                const mainInvoices = invoices.filter((inv) => inv.entity_type !== 'extend');
                                if (mainInvoices.length > 0) {
                                    if (!foundTransactionId && mainInvoices[0].payment_id) {
                                        foundTransactionId = mainInvoices[0].payment_id;
                                    }
                                    /*
                                      ⚠️ `mainInvoices[0]` DULU DIPASANG TANPA CEK APA PUN —
                                      invoice pertama, apa pun statusnya, apa pun umurnya.

                                      Cabang ini hanya melayani order yang TIDAK punya baris
                                      jadwal sama sekali (15 per Task 11), jadi
                                      `schedule_billing` tidak bisa menjawabnya. Tapi
                                      `invoices` PUNYA `expires_at` — tidak seperti
                                      `transactions` di atas — jadi di sini gerbangnya bisa
                                      dipasang langsung, dan predikatnya dibuat sama dengan
                                      `live` (sql/83): masih `pending`, dan belum lewat
                                      `expires_at`. NULL `expires_at` = tidak diketahui,
                                      bukan mati (aturan sql/60 yang sama).
                                    */
                                    const payable = mainInvoices.find((inv) =>
                                        String(inv.status || '').toLowerCase() === 'pending'
                                        && !!inv.invoice_url
                                        && (!inv.expires_at || new Date(inv.expires_at).getTime() > Date.now())
                                    );
                                    if (submission.payment_status !== 'paid' && payable && !links[submission.id]) {
                                        /*
                                          ⚠️ TANPA CADANGAN `: payable.invoice_url`.
                                          Cabang ini melayani order yang tidak punya baris
                                          jadwal sama sekali, jadi justru DI SINI-lah
                                          `schedule_id` paling mungkin kosong — dan justru
                                          di situ URL DOKU mentah paling tidak bisa
                                          dijamin masih berwenang. Tanpa jadwal, resolver
                                          tidak punya apa pun untuk ditanyakan; yang benar
                                          adalah tidak menawarkan tombol, bukan menawarkan
                                          tombol yang tak bisa dijaga.
                                        */
                                        links[submission.id] = payable.schedule_id
                                            ? payLinkPath(payable.schedule_id)
                                            : null;
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

            /*
              Anggota tiap tagihan ditanyakan langsung ke `invoices`, BUKAN
              dirakit dari `schedPayments` di atas. Peta itu hanya memuat order
              yang lolos filter halaman ini (yang `dismissed_at`/`spam` sudah
              dibuang), jadi grup yang salah satu anggotanya tersaring akan
              menghasilkan total yang LEBIH KECIL daripada yang ditagih link
              DOKU-nya — persis kelas cacat yang perbaikan ini ada untuk menutup.
            */
            const allPaymentIds = Object.values(schedPayments)
                .flatMap((m) => Object.values(m).map((p) => p.paymentId));
            setInvoiceGroups(await fetchInvoiceGroups(allPaymentIds));

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

    /** Order yang sedang dikonfirmasi untuk DIBATALKAN — beda dari disingkirkan:
     * yang ini mengubah keadaan pesanannya, bukan cuma tampilannya. */
    const [pendingCancel, setPendingCancel] = useState<FormSubmission | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);

    const confirmCancelOrder = async () => {
        const target = pendingCancel;
        if (!target?.id) return;
        setIsCancelling(true);
        try {
            // Riwayat `actor: 'researcher'` (yang memilih kalimat pelaku di
            // banner) dan penutupan tagihan ditulis pintu `door_cancel_order`
            // dalam transaksi yang sama — tidak lagi terpisah dari browser.
            await cancelOrder(target.id);
            setPendingCancel(null);
            toast.success(t('cancelOrderSuccess'));
            await fetchSubmissions();
        } catch (error) {
            // Daftar TIDAK disentuh kalau server menolak — pelajaran dari bug
            // dismiss lama, yang membuang baris dari state lalu menampilkan
            // toast sukses sehingga ordernya "hidup lagi" saat refresh.
            console.error('Failed to cancel order:', error);
            toast.error(t('cancelOrderError'));
        } finally {
            setIsCancelling(false);
        }
    };

    const confirmDismissSubmission = async () => {
        const target = pendingDismiss;
        if (!target?.id) return;
        setIsDismissing(true);
        try {
            await dismissSubmission(target.id);
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

    /**
     * "Pilih Jadwal" / "Jadwalkan Ulang" → halaman Jadwal & Bayar order itu.
     *
     * ⚠️ TIDAK LAGI MELEPAS SLOT DULU, DAN TIDAK LAGI MENULIS DRAFT WIZARD.
     * Versi lama memanggil `prepareForReschedule` (mengosongkan tanggal,
     * mematikan tagihan) SEBELUM peneliti memilih apa pun, lalu menulis draft
     * `isReschedule` ke localStorage dan melempar ke wizard langkah 3. Dua
     * akibatnya: peneliti yang berubah pikiran sudah kehilangan slotnya, dan
     * draft berniat-reschedule yang tertinggal pernah menimpa survei LAIN
     * (insiden Tri/NISMA).
     *
     * Sekarang slot lama baru berganti saat tanggal baru BERHASIL dikunci di
     * halaman itu (`rebookSlotForSubmission`), dan tagihannya terbit lewat
     * pemicu tunggal di sana. `?pilih=1` membuka kalender langsung untuk
     * keadaan lewat 14.00; keadaan waktu habis dan belum bertanggal memang
     * sudah berkalender.
     */
    const handleReschedule = (submission: FormSubmission) => {
        // Mode libur (sql/122): pemilih gelombang Kilat tidak dibuka — modal F, tetap di sini.
        if (submission.distribution_type === 'kilat' && awayBlocksKilatPick({ leave: false })) return;
        navigate(`/dashboard/payment/${submission.id}?pilih=1`);
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
            <div className="max-w-5xl mx-auto px-4 md:px-6 pt-5 md:pt-8 pb-10">
                <div className="grid lg:grid-cols-12 gap-6 items-start">
                    {/* Skeleton kartu aksi: kepala + 2 kartu aksi produk + kaki Chat Mimin */}
                    <div className="lg:col-span-4 rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
                        <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 sm:pb-3.5 border-b border-slate-100 space-y-2">
                            <Skeleton className="h-5 w-36 bg-slate-100" />
                            <Skeleton className="h-3 w-48 bg-slate-100" />
                        </div>
                        <div className="p-3 sm:p-4 space-y-2.5">
                            {[1, 2].map((i) => (
                                <div key={i} className="p-3.5 sm:p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <Skeleton className="h-8 w-8 rounded-lg bg-slate-200 shrink-0" />
                                            <Skeleton className="h-4 w-24 bg-slate-200" />
                                        </div>
                                        <Skeleton className="h-6 w-16 rounded-lg bg-slate-200" />
                                    </div>
                                    <Skeleton className="h-3 w-full bg-slate-100" />
                                </div>
                            ))}
                        </div>
                        <div className="px-4 sm:px-5 py-3 bg-slate-50/50 border-t border-slate-100">
                            <Skeleton className="h-3 w-40 bg-slate-100" />
                        </div>
                    </div>

                    <div className="lg:col-span-8 min-w-0 space-y-4">
                        {/* Skeleton Control Panel Card */}
                        <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)]">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <Skeleton className="h-6 w-32 bg-slate-200 rounded-lg" />
                                        <Skeleton className="h-5 w-8 bg-slate-100 rounded-full" />
                                    </div>
                                    <Skeleton className="h-3 w-56 bg-slate-100" />
                                </div>
                                <div className="flex gap-2">
                                    <Skeleton className="h-9 w-24 sm:w-28 rounded-xl bg-slate-100" />
                                    <Skeleton className="h-9 w-9 sm:w-20 rounded-xl bg-slate-100" />
                                </div>
                            </div>
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
            </div>
        );
    }

    return (
        <div>
            {/* Dua kolom mengikuti formulir order (grid 12, satu kolom menempel).
                Kartu aksi di KIRI dan lebih dulu di DOM — urutan yang sama benar
                untuk ponsel (di atas My Order) dan desktop (di kiri), jadi tanpa
                kelas `order-*`. ⚠️ Jangan beri `relative` pada <aside>: `.relative`
                di styles.css dimuat setelah Tailwind dan mengalahkan `lg:sticky`. */}
            {/* Mode bingkai: halaman harus pas setinggi layar. `-mb-10` meniadakan `pb-10` <main> milik
                layout bersama (satu-satunya yang tak bisa diubah dari sini); jarak bawah diganti
                `FRAME_BOTTOM_GUTTER`. */}
            {/* Ponsel + sudah punya order: nol padding atas, supaya toolbar langsung rata di bawah navbar tanpa
                celah (kartu aksi yang tadinya jadi pengisi ruang itu disembunyikan). Belum punya order →
                kartu Create tampil, jadi jarak atas tetap. */}
            <div className={`max-w-5xl mx-auto px-4 md:px-6 ${submissions.length > 0 ? 'pt-0 lg:pt-8' : 'pt-5 md:pt-8'} grid lg:grid-cols-12 gap-6 items-start ${framed ? 'pb-6 -mb-10' : 'pb-10'}`}>
                {/* Ponsel + sudah punya order: kartu Create disembunyikan (ia memakan ±55% layar
                    pertama padahal peneliti yang kembali mau melihat status). Penggantinya: FAB
                    "Order baru" dan ikon Chat Mimin di toolbar. Belum punya order → tetap penuh,
                    karena membuat order satu-satunya yang perlu ia lakukan. */}
                <aside className={`lg:col-span-4 lg:sticky lg:top-24 ${submissions.length > 0 ? 'max-lg:hidden' : ''}`}>
                    <CreateOrderCards
                        onOpenAdsModal={() => setEntryProduct('ads')}
                        onOpenKilatModal={kilatOpen ? () => setEntryProduct('kilat') : undefined}
                    />
                </aside>

                {/* Daftar order — kolom lebar di kanan (desktop), di bawah kartu aksi (ponsel) */}
                <div className="relative lg:col-span-8 min-w-0 space-y-4">
                    {/* Integrated Control Bar: My Order, Counter, Subtitle & Toolbar */}
                    {/* Tinggi 65px di desktop = kepala kiri (`lg:h-16` + 1px border kartu), jadi tepi
                        bawah dua kepala sejajar. Mode bingkai: kepala MELAYANG di atas bingkai
                        (absolute) — bingkai mulai dari atas kolom dan isinya digulir di bawah
                        kepala. Kepala berupa KACA (bg putih 70% + blur): kartu yang digulir tampak
                        terselip di bawah panel, bukan memudar jadi hantu di bawahnya — dulu mask
                        65→81px memperlihatkan chip & garis tepi kartu setengah pudar tepat di bawah
                        sudut membulat, dan itulah yang terbaca sebagai glitch. */}
                    {/* Toolbar PONSEL (di bawah lg): menempel di bawah navbar, selebar layar, bukan kartu
                        melayang — di sini halaman menggulir biasa, jadi toolbar rata navbar tak
                        menyisakan celah tempat kartu mengintip. Berisi judul + filter (dropdown, sama
                        seperti desktop) + ikon aksi. Di lg+ pembungkus ini `static` dan tak berpenampilan apa pun. */}
                    <div className="sticky top-14 md:top-16 z-20 -mx-4 md:-mx-6 px-4 md:px-6 bg-white/90 backdrop-blur-md border-b border-slate-200/80 lg:static lg:z-auto lg:mx-0 lg:px-0 lg:bg-transparent lg:backdrop-blur-none lg:border-b-0">
                    <div className={`flex items-center lg:h-[65px] lg:rounded-2xl lg:border lg:border-slate-200/90 lg:px-5 py-3 sm:py-3.5 ${
                        framed
                            ? 'absolute top-0 inset-x-0 z-10 bg-white/70 backdrop-blur-xl backdrop-saturate-150 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.16),0_1px_3px_rgba(15,23,42,0.05)]'
                            : 'lg:bg-white lg:shadow-[0_1px_3px_0_rgba(0,0,0,0.03),0_4px_12px_-2px_rgba(0,0,0,0.02)]'
                    }`}>
                        <div className="flex w-full items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                {/* `truncate` (bukan shrink-0): di layar sangat sempit judul yang mengalah, tak
                                    pernah ditimpa dropdown di kanannya. */}
                                <h1 className="text-base font-bold text-slate-900 dark:text-white min-w-0 truncate">
                                    {t('pageTitle')}
                                </h1>
                                {submissions.length > 0 && (
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-jfu-primary border border-blue-200/80 shadow-2xs shrink-0 ${
                                        /* Ponsel + filter aktif: dropdown butuh lebar untuk namanya, dan angka total ini
                                           toh bukan jumlah yang sedang ditampilkan. */
                                        selectedFilter !== 'all' ? 'max-sm:hidden' : ''
                                    }`}>
                                        {submissions.length}
                                    </span>
                                )}
                                {/* Subjudul hanya di md (satu kolom, lebar penuh). Di lg kolomnya
                                    ±650px dan subjudul selalu terpotong "…" — lebih baik tak ada. */}
                                <span className="hidden md:inline-block lg:hidden w-px h-4 bg-slate-200 shrink-0" />
                                <p className="text-xs text-slate-500 truncate hidden md:block lg:hidden">
                                    {t('orderListSubtitle')}
                                </p>
                            </div>

                            {submissions.length > 0 && (
                                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger
                                            aria-label={t('filterAll')}
                                            className={`relative inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 h-9 rounded-xl border text-xs font-semibold transition-all outline-none shadow-2xs cursor-pointer ${
                                                selectedFilter !== 'all'
                                                    ? 'bg-jfu-primary text-white border-jfu-primary shadow-xs'
                                                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                                            }`}
                                        >
                                            <ListFilter className="w-3.5 h-3.5 shrink-0 max-sm:hidden" />
                                            <span className="truncate max-lg:max-w-[96px]">
                                                {filterChips.find((c) => c.value === selectedFilter)?.label || t('filterAll')}
                                            </span>
                                            {needsActionCount > 0 && (
                                                <span
                                                    className={`inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold ${
                                                        selectedFilter !== 'all'
                                                            ? 'bg-white text-jfu-primary'
                                                            : 'bg-red-500 text-white'
                                                    }`}
                                                >
                                                    {needsActionCount}
                                                </span>
                                            )}
                                            <ChevronDown className="w-3 h-3 opacity-60 ml-0.5 shrink-0" />
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48">
                                            {filterChips.map((chip) => (
                                                <DropdownMenuItem
                                                    key={chip.value}
                                                    onClick={() => setSelectedFilter(chip.value)}
                                                    className="cursor-pointer justify-between py-2 text-xs"
                                                >
                                                    <span className={selectedFilter === chip.value ? 'font-semibold text-jfu-primary' : ''}>
                                                        {chip.label}
                                                        {typeof chip.count === 'number' && chip.count > 0 && (
                                                            <span className="ml-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                                                                {chip.count}
                                                            </span>
                                                        )}
                                                    </span>
                                                    {selectedFilter === chip.value && <Check className="w-4 h-4 text-jfu-primary" />}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleRefresh}
                                        disabled={refreshing}
                                        title={t('refresh')}
                                        className="h-9 max-lg:h-10 max-lg:min-w-10 px-2.5 sm:px-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:text-jfu-primary hover:bg-slate-100 shadow-2xs text-xs font-semibold"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                                        <span className="hidden sm:inline ml-1 font-medium">{t('refresh')}</span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    </div>

                    {/* Bingkai daftar order. Desktop tinggi: tinggi diukur & menggulir sendiri, mulai dari
                        atas kolom DI BAWAH kepala kaca yang melayang. `pt-[81px]` = tinggi kepala 65 +
                        jarak 16, jadi kartu pertama berhenti 16px di bawah kepala saat belum digulir.
                        Mask atas (transparan 0–14px, penuh di 30px) hanya menyembunyikan isi di dua
                        takik sudut membulat kepala — di bawah itu isi terlihat penuh, terblur lewat
                        kaca. Ujung bawah memudar 20px (`pb-5` supaya kartu terakhir tetap utuh).
                        `-mx-2 px-2` memberi ruang bayangan/hover kartu. `overscroll-contain` mencegah
                        roda mouse melompat ke halaman di ujung bingkai. */}
                    <div
                        ref={setFrameEl}
                        style={framed ? { height: frameHeight } : undefined}
                        className={framed ? '!mt-0 overflow-y-auto overscroll-contain -mx-2 px-2 pt-[81px] pb-5 [scrollbar-width:thin] [scrollbar-color:rgb(203_213_225)_transparent] [mask-image:linear-gradient(to_bottom,transparent_14px,black_30px,black_calc(100%_-_20px),transparent)]' : undefined}
                    >
                    {/* Hari libur tim admin (Phase 5 §5.4b) — hanya pada tanggal libur aktif. Di DALAM
                        bingkai (bukan di atas kepala kaca) supaya kepala tetap menempel di atas kolom. */}
                    <AdminHolidayBanner className="mb-4" />
                    {submissions.length === 0 ? (
                        /* Modern, Clean & Elevated Empty State Card */
                        <Card className="border border-slate-200/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] bg-white/95 rounded-2xl overflow-hidden">
                            <CardContent className="flex flex-col items-center justify-center py-10 md:py-12 px-6 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-blue-50/80 border border-blue-100 flex items-center justify-center text-jfu-primary mb-4 shadow-xs">
                                    <ClipboardList className="w-7 h-7 stroke-[1.75]" />
                                </div>
                                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                                    {t('noOrdersTitle')}
                                </h3>
                                <p className="text-xs sm:text-sm text-slate-500 max-w-md mt-1.5 mb-6 leading-relaxed">
                                    {t('noSubmissionsDesc')}
                                </p>

                                {/* Secondary Action Links */}
                                <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setEntryProduct('ads')}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-jfu-primary text-white text-xs sm:text-sm font-semibold shadow-xs hover:bg-jfu-dark transition-all cursor-pointer"
                                    >
                                        <span>Pasang Iklan Survei</span>
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                    <Link
                                        to="/dashboard/forms/new"
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs sm:text-sm font-semibold transition-all"
                                    >
                                        <ListPlus className="w-4 h-4 text-slate-500" />
                                        <span>Buat Kuesioner Baru</span>
                                    </Link>
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
                                        const cards = buildScheduleCards(
                                            ui, pays, invoiceIds[submission.id!] || null, t, submission,
                                            (sourceId) => groupInfoFor(invoiceGroups, pays[sourceId]?.paymentId, sourceId),
                                        );
                                        const pageInfo = submission.id ? surveyPages[submission.id] : undefined;
                                        const activePhase = getActiveDashboardPhase(ui.currentStep);
                                        /**
                                         * `?? 3` berarti "order tuntas, nyalakan ketiganya" — dan itu
                                         * BENAR hanya untuk order yang selesai tayang. Untuk order yang
                                         * DIBATALKAN, `getActiveDashboardPhase` juga bisa kehabisan fase
                                         * aktif, dan jatuhnya ke 3 membuat kartu pesanan batal terbaca
                                         * seolah sudah tuntas — persis kebalikan dari yang terjadi.
                                         *
                                         * Order batal berhenti di Fase ①: di situ bannernya, dan itu
                                         * satu-satunya fase yang benar-benar pernah dilalui.
                                         */
                                        const isCancelled = ui.callout === 'cancelled';
                                        const reachedPhase = isCancelled ? 1 : (activePhase ?? 3);
                                        const isDead = isCancelled || ui.callout === 'revision';
                                        const orderId = submission.id!;
                                        const isExpanded = expandedOrders.has(orderId);
                                        // Aturan tombol datang dari `primaryActionOf` — fungsi yang SAMA dengan
                                        // banner di dalam kartu, jadi kartu ringkas tak punya aturan uang sendiri.
                                        const summary = orderSummaryOf(ui.callout, cards, { canSelfReschedule: canSelfSchedule(submission, selfBookingClosure) });
                                        return (
                                            <Card key={submission.id} className="overflow-hidden border border-slate-200/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.03),0_4px_12px_-2px_rgba(0,0,0,0.02)] hover:border-slate-300 transition-colors duration-150 rounded-2xl">
                                                <CardHeader className="bg-white p-5 md:p-6 pb-4 md:pb-5 space-y-2.5 border-b border-slate-100">
                                                    {/* Chip produk di kiri, nomor order di kanan (gaya faktur). Judul di
                                                        baris SENDIRI dan selebar kartu — judul panjang tidak berebut
                                                        tempat dengan nomor, cukup membungkus (maks 2 baris). */}
                                                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                                        <Chip
                                                            variant={submission.distribution_type === 'kilat' ? 'amber' : 'blue'}
                                                            size="sm"
                                                        >
                                                            {submission.distribution_type === 'kilat' ? `⚡ ${t('productKilatTitle')}` : t('productAdsTitle')}
                                                        </Chip>
                                                        {submission.id && (
                                                            <CopyOrderIdBadge id={submission.id} />
                                                        )}
                                                    </div>
                                                    <CardTitle className="text-lg md:text-xl font-bold tracking-tight text-slate-900 leading-snug line-clamp-2" title={submission.title}>
                                                        {submission.title}
                                                    </CardTitle>
                                                </CardHeader>

                                                {/* Ponsel: ringkasan + aksi utama. Isi lengkap di bawahnya disembunyikan
                                                    (CSS, bukan di-unmount: state fase tetap utuh) sampai Detail dibuka. */}
                                                <OrderSummaryBar
                                                    summary={summary}
                                                    expanded={isExpanded}
                                                    onToggle={() => setOrderExpanded(orderId)}
                                                    onExpand={() => setOrderExpanded(orderId, true)}
                                                    onReschedule={() => handleReschedule(submission)}
                                                />

                                                <CardContent className={`p-5 md:p-6 pt-5 bg-white ${isExpanded ? '' : 'max-lg:hidden'}`}>
                                                    <Phase number={1} title={t('phaseReviewTitle')} active={reachedPhase >= 1} lineActive={reachedPhase >= 2}>
                                                        <ReviewPhase
                                                            submission={submission}
                                                            first={ui.first}
                                                            onDataUpdated={fetchSubmissions}
                                                            active={isCancelled || activePhase === 1}
                                                            hadBilledInvoice={!!ui.finalPaymentLink}
                                                        />
                                                    </Phase>

                                                    <Phase number={2} title={t(submission.distribution_type === 'kilat' ? 'airingPeriodLabelKilat' : 'airingPeriodLabel')} active={reachedPhase >= 2} lineActive={reachedPhase >= 3}>
                                                        <SchedulePhase
                                                            submission={submission}
                                                            kilatOpen={kilatOpen}
                                                            cards={cards}
                                                            entries={[ui.first, ...ui.later]}
                                                            onReschedule={() => handleReschedule(submission)}
                                                            onDataUpdated={fetchSubmissions}
                                                            // Kredit (sql/102) ada di fase ③ menurut sumbu tayang,
                                                            // tapi tombol bayarnya di sini — buka kartunya.
                                                            active={activePhase === 2 || ui.owesOnCredit}
                                                        />
                                                    </Phase>

                                                    <Phase number={3} title={t('sectionPublication')} active={reachedPhase >= 3} isLast>
                                                        <PublicationPhase cards={cards} pageInfo={pageInfo} isCancelled={isCancelled} />
                                                    </Phase>

                                                    {/* F. Footer — hanya tautan TERSIER.

                                                        "Batalkan Pesanan" hidup DI SINI, bukan di dalam
                                                        banner Fase ①, dan sengaja jadi teks polos abu-abu
                                                        tanpa border/latar/ikon: kami tidak mendorong
                                                        peneliti membatalkan pesanan. Ia harus ADA —
                                                        buntu tanpa jalan keluar lebih buruk — tapi tidak
                                                        mengundang. Bukan merah: merah menarik mata dan
                                                        terbaca sebagai peringatan.

                                                        `min-h-10` menjaga area sentuh tetap layak di
                                                        ponsel. "Tidak didorong" tidak boleh berubah jadi
                                                        "sulit ditekan"; yang mencegah salah pencet adalah
                                                        dialog konfirmasinya, bukan ukuran tombolnya.

                                                        Satu tautan melayani SEMUA status pra-lunas,
                                                        alih-alih disalin ke tiap fase.

                                                        "Tanya Mimin" yang dulu di kanan sudah dicabut:
                                                        pintu masuk Chat Mimin kini satu, di kaki kartu
                                                        "Buat Order Baru". Tanpa tautan yang berlaku,
                                                        footer tidak dirender sama sekali — tidak ada
                                                        garis pemisah yang menggantung. */}
                                                    {(isDead || canCancelOrder(ui)) && (
                                                        <>
                                                            <div className="border-t border-slate-100 mt-4 pt-3" />
                                                            <button
                                                                type="button"
                                                                onClick={() => (isDead ? setPendingDismiss(submission) : setPendingCancel(submission))}
                                                                className="min-h-10 inline-flex items-center rounded-xl px-2 text-xs text-slate-400 hover:text-slate-600 hover:underline underline-offset-2 transition-colors"
                                                            >
                                                                {isDead ? t('btnDeleteForm') : t('btnCancelOrder')}
                                                            </button>
                                                        </>
                                                    )}
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
            </div>

            {/* FAB "Order baru" — hanya ponsel & hanya bila sudah punya order (yang belum punya
                melihat kartu Create penuh). Langsung ke produk bila hanya satu yang tersedia,
                lembar pilihan bila lebih. Tombol "ke atas" digeser naik supaya tak bertumpuk. */}
            {submissions.length > 0 && (
                <NewOrderFab
                    onOpenAdsModal={() => setEntryProduct('ads')}
                    onOpenKilatModal={kilatOpen ? () => setEntryProduct('kilat') : undefined}
                />
            )}

            {/* Floating move to top button */}
            <button
                type="button"
                onClick={scrollToTop}
                aria-label="Kembali ke atas"
                title="Kembali ke atas"
                className={`fixed bottom-6 ${submissions.length > 0 ? 'max-lg:bottom-[5.5rem]' : ''} right-6 z-50 p-3 rounded-full bg-white text-jfu-primary shadow-xl border border-jfu-primary/20 hover:bg-jfu-primary hover:text-white transition-all duration-300 transform ${showScrollTop ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'}`}
            >
                <ArrowUp className="w-5 h-5" />
            </button>

            {/* Konfirmasi PEMBATALAN. Terpisah dari dialog "singkirkan" di bawah
                karena dua aksi ini punya akibat yang berbeda: yang ini
                menghentikan pesanannya, yang itu cuma menyembunyikan kartunya.
                Dialog inilah pengaman sesungguhnya — bukan ukuran tombolnya. */}
            <Dialog open={pendingCancel !== null} onOpenChange={(open) => { if (!open && !isCancelling) setPendingCancel(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('cancelOrderConfirmTitle')}</DialogTitle>
                        <DialogDescription className="pt-1 leading-relaxed">
                            <strong className="font-semibold text-gray-900">{pendingCancel?.title || t('untitledSurvey')}</strong>
                            {' — '}{t('cancelOrderConfirmBody')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setPendingCancel(null)}
                            disabled={isCancelling}
                            className="max-md:w-full rounded-full"
                        >
                            {t('cancel')}
                        </Button>
                        <Button
                            onClick={confirmCancelOrder}
                            disabled={isCancelling}
                            className="max-md:w-full rounded-full bg-slate-700 hover:bg-slate-800 text-white font-semibold"
                        >
                            {t('cancelOrderConfirmAction')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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

            {/* Modal Pintu Masuk Iklan Survei (Awareness + Review Method) */}
            <AdsEntryModal
                isOpen={entryProduct !== null}
                product={entryProduct ?? 'ads'}
                onClose={() => setEntryProduct(null)}
                onContinue={handleContinueEntry}
            />

            {/* Sheet Kelengkapan Profil */}
            <ProfileCompletionSheet
                open={isProfileSheetOpen}
                onOpenChange={setIsProfileSheetOpen}
                onCompleted={handleProfileCompleted}
            />
        </div>
    );
}
