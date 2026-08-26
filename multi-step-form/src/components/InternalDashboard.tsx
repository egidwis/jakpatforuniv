import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { LogOut, Eye, RefreshCw, Lock, Search, CreditCard, ChevronLeft, ChevronRight, X, ListFilter, ArrowDownWideNarrow, ArrowUpNarrowWide, Zap, Calendar } from 'lucide-react';
import { getFormSubmissionsPaginated, countSubmissionsByStatus, updateFormStatus, convertDistributionType, supabase } from '../utils/supabase';
import { fetchProfileNames } from '../utils/profileNames';
import { emailLocalPart } from './customers/types';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { cn, useMediaQuery } from '@/lib/utils';
import { EditCriteriaModal } from './EditCriteriaModal';
import { EditFormDetailsModal } from './EditFormDetailsModal';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageBuilderModal } from './PageBuilder/PageBuilderModal';
import { SubmissionsMobileCard } from './SubmissionsTableRow';
import type { SurveySubmission, PaymentState, ReviewHistoryEntry, ExistingPage } from './submissions/types';
import { deriveLifecycle } from './submissions/lifecycle';
import { SubmissionListRow } from './submissions/SubmissionListRow';
import { SubmissionDetailSheet } from './submissions/SubmissionDetailSheet';
import { useRowSelection } from './data-list/useRowSelection';
import { missedPaymentWindow } from '../utils/missedPaymentWindow';

/**
 * Adapter tipis ke `missedPaymentWindow`. Baris tabel admin memakai `status`
 * untuk sumbu yang sama yang disebut `submission_status` di tempat lain, jadi
 * keduanya dicoba — bukan salah satu.
 */
const isMissedPaymentWindow = (sub: {
  start_date?: string | null;
  status?: string | null;
  submission_status?: string | null;
  payment_status?: string | null;
}) => missedPaymentWindow({
  startDate: sub.start_date,
  submissionStatus: sub.submission_status || sub.status,
  paymentStatus: sub.payment_status,
});
import './InternalDashboard.css';

const EMPTY_PAYMENT_STATE: PaymentState = { hasInvoices: false, hasOpenInvoice: false, latestStatus: null, invoiceCount: 0, latestPaymentUrl: null };

// Kata "Rejected"/"Spam" dihapus dari layar; NILAI DB-nya tidak diubah.
// `rejected` bukan penolakan final — admin masih bisa meloloskannya begitu
// peneliti memperbaiki. `spam` berarti "bukan order sungguhan", dan sekarang
// terpisah dari `cancelled` ("order sah yang dihentikan").
/**
 * Status yang disaring DI SERVER dan lepas dari filter bulan (lihat `statusIn`
 * di `getFormSubmissionsPaginated`). Ketiganya adalah antrean kerja: order yang
 * belum selesai ditangani, berapa pun umurnya.
 */
const SERVER_STATUS_FILTERS = ['in_review', 'rejected', 'cancelled', 'spam'] as const;

const STATUS_FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'in_review', label: 'Need Review' },
  { id: 'rejected', label: 'Menunggu Perbaikan' },
  { id: 'approved', label: 'Approved' },
  { id: 'paid', label: 'Paid' },
  /**
   * Order yang jendela bayarnya sudah tertutup tapi masih menunggu uang.
   *
   * Prasyarat kejujuran Track B3: sejak CTA "Jadwalkan Ulang" dicabut dari
   * peneliti jalur manual, kartunya menjanjikan tim yang menjadwalkan ulang.
   * Ini permukaan yang membuat janji itu bisa ditepati — tanpanya order semacam
   * itu tenggelam di daftar `waiting_payment` dan hanya ketemu dengan menyisir
   * tanggal satu per satu.
   */
  { id: 'missed_payment', label: 'Lewat Batas Bayar' },
  { id: 'cancelled', label: 'Dibatalkan' },
  { id: 'spam', label: 'Tidak Valid' },
] as const;

interface InternalDashboardProps {
  hideAuth?: boolean;
  onLogout?: () => void;
  focusSubmission?: { id: string; createdAt: string; distributionType?: string | null } | null;
  /** Drawer → papan Jadwal. Tab Page monitoring saja sejak pekerjaan halaman
   *  pindah ke papan; ini jalannya ke sana. */
  onOpenScheduleBoard?: (bookingId: string) => void;
}

export function InternalDashboard({ hideAuth = false, onLogout, focusSubmission, onOpenScheduleBoard }: InternalDashboardProps = {}) {
  const { user, loading: authLoading, signOut } = useAuth();
  const [submissions, setSubmissions] = useState<SurveySubmission[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<SurveySubmission[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [distTab, setDistTab] = useState<'regular' | 'kilat'>('regular');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // Derived schedule state: Set of submission IDs that have a slot reserved (start_date set)
  const [scheduledSubmissionIds, setScheduledSubmissionIds] = useState<Set<string>>(new Set());

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50); // Default 50 items per page
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Login State
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // Schedule & Payment View State
  // Niat "buka jadwal / buka tagihan" dari baris tabel & kartu mobile. Dulu ini
  // menukar SELURUH halaman dengan SchedulePaymentView; sekarang ia cuma membuka
  // drawer pada sub-tampilan yang tepat, jadi daftar order di belakangnya tidak
  // ikut hilang.
  const [pendingSubView, setPendingSubView] = useState<'schedule' | 'payment' | null>(null);

  const [paymentStates, setPaymentStates] = useState<Record<string, PaymentState>>({});

  // Edit Criteria Modal State
  const [isEditCriteriaModalOpen, setIsEditCriteriaModalOpen] = useState(false);
  const [selectedSubmissionForCriteria, setSelectedSubmissionForCriteria] = useState<SurveySubmission | null>(null);

  // Edit Form Details Modal State
  const [isEditFormDetailsModalOpen, setIsEditFormDetailsModalOpen] = useState(false);
  const [selectedSubmissionForDetails, setSelectedSubmissionForDetails] = useState<SurveySubmission | null>(null);

  // PageBuilder Modal State
  const [isPageBuilderOpen, setIsPageBuilderOpen] = useState(false);
  const [selectedSubmissionForPage, setSelectedSubmissionForPage] = useState<SurveySubmission | null>(null);
  const [pageBuilderData, setPageBuilderData] = useState<any>(null);

  // Detail drawer state — keep only the id so the drawer always reads fresh data
  const [openSubmissionId, setOpenSubmissionId] = useState<string | null>(null);

  // Row selection (foundation for the upcoming bulk payment feature)
  const rowSelection = useRowSelection();

  // Inline reading pane needs ≥1280px; below that the modal Sheet is used
  const isXl = useMediaQuery('(min-width: 1280px)');

  // Map submission_id -> page data (slug, is_published, banner, views, etc)
  const [existingPages, setExistingPages] = useState<Record<string, ExistingPage>>({});

  // Admin Access Check
  // STRICT: Only product@jakpat.net is allowed
  const allowedEmails = ['product@jakpat.net'];
  const isAdmin = (user?.email && allowedEmails.includes(user.email)) ||
    hideAuth; // Trust parent if hideAuth is true



  // Filter Submissions Effect
  useEffect(() => {
    let result = submissions;

    // Status yang disaring SERVER (lihat SERVER_STATUS_FILTERS di loadSubmissions)
    // sengaja TIDAK disaring lagi di sini. Menyaring ulang tidak salah hasilnya,
    // tapi menyembunyikan kalau parameter servernya lupa dioper — kesalahannya
    // jadi tak terlihat sampai halaman kedua.
    if (statusFilter !== 'all' && !SERVER_STATUS_FILTERS.includes(statusFilter as any)) {
      result = result.filter(sub => {
        if (statusFilter === 'paid') return (sub.payment_status || '').toLowerCase() === 'paid';
        if (statusFilter === 'missed_payment') return isMissedPaymentWindow(sub);
        return true;
      });
    }

    setFilteredSubmissions(result);
  }, [submissions, statusFilter]);

  /**
   * Angka pada tab antrean. Untuk `in_review` dan `rejected` diambil dari DB
   * tanpa filter bulan — sisanya masih dihitung dari halaman yang termuat.
   *
   * Bedanya penting justru pada dua status itu: keduanya adalah antrean kerja
   * yang boleh berumur berapa pun, jadi angka yang dihitung dari 50 baris bulan
   * berjalan bukan cuma kurang tepat — ia mengukur hal yang lain sama sekali.
   * Status lain memang dibaca dalam konteks bulan yang sedang dibuka.
   */
  const [queueCounts, setQueueCounts] = useState<{ in_review: number; rejected: number }>({
    in_review: 0,
    rejected: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [inReview, rejected] = await Promise.all([
        countSubmissionsByStatus(['in_review', 'pending']),
        countSubmissionsByStatus(['rejected']),
      ]);
      if (!cancelled) setQueueCounts({ in_review: inReview, rejected });
    })();
    return () => { cancelled = true; };
  }, [submissions]);

  const statusCounts = {
    all: submissions.length,
    in_review: queueCounts.in_review,
    rejected: queueCounts.rejected,
    approved: submissions.filter(s => s.status === 'approved').length,
    paid: submissions.filter(s => (s.payment_status || '').toLowerCase() === 'paid').length,
    missed_payment: submissions.filter(isMissedPaymentWindow).length,
    cancelled: submissions.filter(s => s.status === 'cancelled').length,
    spam: submissions.filter(s => s.status === 'spam').length,
  };

  // Desktop-only view: the Regular/Kilat tab strip splits the loaded page;
  // mobile has no tab UI and must keep showing every distribution type.
  const desktopSubmissions = filteredSubmissions.filter(sub => distTab === 'kilat'
    ? sub.distribution_type === 'kilat'
    : sub.distribution_type !== 'kilat');

  // Client-side search logic removed in favor of Server-side search inside loadSubmissions
  // Reset page to 1 when search changes
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
    }
    await signOut();
  };

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      // Calculate start and end of selected month
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);

      // Use paginated fetch with date range
      const serverStatuses = SERVER_STATUS_FILTERS.includes(statusFilter as any)
        // 'in_review' juga menangkap baris lama ber-`pending` / NULL, yang di
        // seluruh UI dibaca sebagai "Need Review".
        ? (statusFilter === 'in_review' ? ['in_review', 'pending'] : [statusFilter])
        : undefined;

      const { data, count } = await getFormSubmissionsPaginated(
        currentPage,
        pageSize,
        searchQuery,
        startOfMonth.toISOString(),
        endOfMonth.toISOString(),
        sortDir === 'asc',
        serverStatuses
      );

      if (data) {
        const authNames = await fetchProfileNames(data.map((s: any) => s.auth_user_id));
        const transformed: SurveySubmission[] = data.map((sub: any) => ({
          id: sub.id,
          formId: sub.id.substring(0, 8), // Mock ID from UUID
          formTitle: sub.title || 'Untitled Survey',
          formUrl: sub.survey_url,
          researcherName: sub.auth_user_id
            ? (authNames.get(sub.auth_user_id)?.name || 'Unknown')
            : (sub.full_name || emailLocalPart(sub.email) || 'Unknown'),
          researcherEmail: sub.auth_user_id
            ? (authNames.get(sub.auth_user_id)?.email || 'No Email')
            : (sub.email || 'No Email'),
          invoiceName: sub.full_name,
          invoiceEmail: sub.email,
          invoicePhone: sub.phone_number,

          submittedAt: sub.created_at || new Date().toISOString(), // Store raw ISO string
          questionCount: sub.question_count || 0,
          responseCount: 0, // Not tracked yet
          status: (sub.submission_status || sub.status || 'in_review') === 'pending' ? 'in_review' : (sub.submission_status || sub.status || 'in_review'),
          submission_status: sub.submission_status,
          // We initially grab real payment_status, we will filter it if there are no transactions
          payment_status: sub.payment_status,
          total_cost: sub.total_cost || 0,
          phone_number: sub.phone_number,
          university: sub.university,
          education: sub.status, // Backend: status = education info (e.g. Mahasiswa S3)
          department: sub.department,
          submission_method: sub.submission_method,
          detected_keywords: sub.detected_keywords,
          leads: sub.referral_source,
          voucher_code: sub.voucher_code,
          prize_per_winner: sub.prize_per_winner,
          winnerCount: sub.winner_count,
          criteria: sub.criteria_responden,
          duration: sub.duration,
          start_date: sub.start_date,
          end_date: sub.end_date,
          slot_booked_by: sub.slot_booked_by,
          slot_reserved_at: sub.slot_reserved_at,
          admin_notes: sub.admin_notes,
          // Tanpa baris ini `review_history` tidak pernah sampai ke drawer —
          // dan History Log cuma menampilkan aksi dalam sesi browser yang
          // sedang berjalan, menguap setiap refresh.
          review_history: sub.review_history || [],
          dismissed_at: sub.dismissed_at,
          distribution_type: sub.distribution_type,
          kilat_slot_hour: sub.kilat_slot_hour,
          has_transactions: false, // Default, will verify below
        }));

        // Fetch existing pages & transactions for these submissions
        if (transformed.length > 0) {
          const submissionIds = transformed.map(s => s.id);

          // 1. Fetch Pages
          const { data: pages, error: pagesError } = await supabase
            .from('survey_pages')
            .select('id, submission_id, slug, is_published, publish_start_date, publish_end_date, title, is_extra_ad, banner_url, views_count, requires_banner_update, redirect_url, page_respondents(count)')
            .in('submission_id', submissionIds);

          if (pagesError) console.error('Error fetching survey pages:', pagesError);

          if (pages) {
            const pageMap: Record<string, ExistingPage> = {};
            pages.forEach((p: any) => {
              const respondentsCount = Array.isArray(p.page_respondents)
                ? p.page_respondents.reduce((sum: number, r: { count?: number }) => sum + (r.count || 0), 0)
                : (p.page_respondents?.count ?? 0);

              pageMap[p.submission_id] = {
                id: p.id,
                slug: p.slug,
                is_published: p.is_published,
                publish_start_date: p.publish_start_date,
                publish_end_date: p.publish_end_date,
                title: p.title,
                is_extra_ad: p.is_extra_ad,
                banner_url: p.banner_url,
                views_count: p.views_count || 0,
                respondents_count: respondentsCount,
                requires_banner_update: p.requires_banner_update,
                redirect_url: p.redirect_url,
              };
            });
            setExistingPages(pageMap);
          }

          // 2. Fetch Transactions (Invoices) to override Supabase defaults and get true state
          // Fetch from BOTH transactions and invoices tables
          const [ { data: transactions, error: trxError }, { data: invoices, error: invError } ] = await Promise.all([
            supabase
              .from('transactions')
              .select('payment_id, form_submission_id, status, created_at, payment_url, amount')
              .in('form_submission_id', submissionIds),
            supabase
              .from('invoices')
              .select('payment_id, form_submission_id, status, created_at, invoice_url, amount')
              .in('form_submission_id', submissionIds)
          ]);

          if (trxError) console.error('Error fetching transactions:', trxError);
          if (invError) console.error('Error fetching invoices:', invError);

          // Merge and deduplicate by payment_id
          const mergedTx: any[] = [];
          const seenPaymentIds = new Set<string>();

          (invoices || []).forEach(inv => {
            if (!seenPaymentIds.has(inv.payment_id)) {
              seenPaymentIds.add(inv.payment_id);
              mergedTx.push({
                payment_id: inv.payment_id,
                form_submission_id: inv.form_submission_id,
                status: inv.status,
                created_at: inv.created_at,
                payment_url: inv.invoice_url,
                amount: inv.amount
              });
            }
          });

          (transactions || []).forEach(tx => {
            if (!seenPaymentIds.has(tx.payment_id)) {
              seenPaymentIds.add(tx.payment_id);
              mergedTx.push({
                payment_id: tx.payment_id,
                form_submission_id: tx.form_submission_id,
                status: tx.status,
                created_at: tx.created_at,
                payment_url: tx.payment_url,
                amount: tx.amount
              });
            }
          });

          // Sort descending by created_at, ensuring UTC interpretation for timezone-less strings
          mergedTx.sort((a, b) => {
            const normalizeDate = (dateString: string) => {
              if (!dateString) return new Date(0).getTime();
              const normalized = dateString.endsWith('Z') || dateString.match(/[+-]\d{2}:?\d{2}$/) 
                ? dateString 
                : `${dateString}Z`;
              return new Date(normalized).getTime();
            };
            return normalizeDate(b.created_at) - normalizeDate(a.created_at);
          });

          /**
           * ⚠️ `hasEverPaid` DI SINI SENGAJA TETAP `.some(paid)` — JANGAN
           * DISERAGAMKAN DENGAN `ScheduleBilling.isSettled`.
           *
           * Namanya sama dengan yang dibuang dari `fetchSchedulePayments`
           * (Task 13), tapi pertanyaannya berbeda. Yang ini berlingkup ORDER
           * dan cuma dipakai satu hal: apakah hitung mundur "slot kedaluwarsa"
           * boleh tampil (`CampaignActions.tsx`). Pertanyaannya "apakah ada
           * uang yang pernah masuk?" — dan untuk itu `.some(paid)` memang
           * jawaban yang benar.
           *
           * Menggantinya dengan `isSettled` akan memunculkan "Expired / <1h"
           * pada order yang baru lunas sebagian, lalu slotnya dilepas padahal
           * pembayarannya sudah diterima. Itu regresi, bukan perbaikan.
           *
           * Yang berbohong dan sudah diperbaiki adalah pemakaian per-JADWAL:
           * di sana satu invoice lunas dipakai mengumumkan "Lunas" walau masih
           * ada tagihan susulan terbuka.
           */
          const paymentMap: Record<string, { hasInvoices: boolean, hasOpenInvoice: boolean, latestStatus: 'pending' | 'paid' | 'completed' | 'expired' | null, invoiceCount: number, latestPaymentUrl: string | null, latestAmount: number, hasEverPaid: boolean, latestPaymentId?: string | null }> = {};

          if (mergedTx.length > 0) {
            transformed.forEach(sub => {
              const subTxs = mergedTx.filter(t => t.form_submission_id === sub.id);
              if (subTxs.length > 0) {
                sub.has_transactions = true;
                // Make the status follow the latest invoice strictly
                const latestStatus = subTxs[0].status;
                const hasEverPaid = subTxs.some(t => ['paid', 'completed'].includes(t.status));
                
                // Get the latest pending payment URL for quick copy
                const latestPendingTx = subTxs.find(t => !['paid', 'completed'].includes(t.status));
                /**
                 * ⚠️ "PUNYA TAGIHAN" DAN "PUNYA TAGIHAN HIDUP" ITU DUA
                 * PERTANYAAN BERBEDA — dan `deriveLifecycle` menanyakan yang
                 * kedua. Baris tagihan tidak pernah dihapus, jadi sesudah
                 * peneliti menjadwalkan ulang, `hasInvoices` tetap true untuk
                 * selamanya walau satu-satunya baris yang tersisa sudah
                 * kedaluwarsa. Order d696325a memakai itu untuk mengumumkan
                 * "Invoice sudah diterbitkan, menunggu pelunasan" — padahal
                 * tidak ada satu pun link yang masih bisa dibayar.
                 */
                const hasOpenInvoice = subTxs.some(t => t.status === 'pending');

                paymentMap[sub.id] = {
                  hasInvoices: true,
                  hasOpenInvoice,
                  latestStatus: latestStatus,
                  invoiceCount: subTxs.length,
                  latestPaymentUrl: latestPendingTx?.payment_url || subTxs[0].payment_url || null,
                  latestAmount: subTxs[0].amount || 0,
                  hasEverPaid: hasEverPaid,
                  latestPaymentId: subTxs[0].payment_id || null,
                };
                sub.payment_status = latestStatus;
              } else {
                paymentMap[sub.id] = { hasInvoices: false, hasOpenInvoice: false, latestStatus: null, invoiceCount: 0, latestPaymentUrl: null, latestAmount: 0, hasEverPaid: false, latestPaymentId: null };
                if (sub.payment_status === 'pending') sub.payment_status = undefined;
              }
            });
          } else {
            transformed.forEach(sub => {
              paymentMap[sub.id] = { hasInvoices: false, hasOpenInvoice: false, latestStatus: null, invoiceCount: 0, latestPaymentUrl: null, latestAmount: 0, hasEverPaid: false, latestPaymentId: null };
              if (sub.payment_status === 'pending') sub.payment_status = undefined;
            });
          }
          setPaymentStates(paymentMap);

          // 3. Derive scheduled submission IDs from form_submissions that have start_date set
          // Exclude rejected/spam so their stale start_date doesn't activate buttons
          const scheduledIds = new Set<string>();
          transformed.forEach(sub => {
            if (sub.start_date && !['rejected', 'spam'].includes(sub.submission_status || '')) scheduledIds.add(sub.id);
          });
          setScheduledSubmissionIds(scheduledIds);

        } else {
          setExistingPages({}); // Clear pages if no submissions
        }

        setSubmissions(transformed);
        setTotalSubmissions(count || 0);
      }
    } catch (error) {
      toast.error('Failed to load submissions');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadSubmissions();
    }
    // `statusFilter` ikut di sini sejak penyaringannya pindah ke server:
    // mengubah tab kini mengubah QUERY-nya, bukan cuma menyaring hasil.
  }, [isAdmin, currentPage, searchQuery, currentDate, sortDir, statusFilter]);

  // Re-render every 60s so time-based chips (Reserved <1h / Expired) stay honest
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Clear selection when the visible dataset changes (page, month, filter, search).
  // Selection deliberately survives loadSubmissions() refreshes.
  const clearSelection = rowSelection.clear;
  useEffect(() => {
    clearSelection();
  }, [clearSelection, currentPage, currentDate, statusFilter, searchQuery, distTab, sortDir]);

  // Drawer reads fresh data by id; close it when the row leaves the dataset
  const openSubmission = openSubmissionId
    ? submissions.find((s) => s.id === openSubmissionId) ?? null
    : null;
  useEffect(() => {
    if (openSubmissionId && !loading && !openSubmission) {
      setOpenSubmissionId(null);
    }
  }, [openSubmissionId, openSubmission, loading]);

  // Deep-link dari papan jadwal: arahkan filter ke order ini dulu...
  //
  // ⚠️ TAB DISTRIBUSI DITURUNKAN DARI ORDER-NYA, TIDAK DIPATOK.
  // Sampai Phase 3 baris terakhir berbunyi `setDistTab('kilat')` tanpa syarat —
  // benar selama satu-satunya pengirim adalah KilatScheduleBoard, salah begitu
  // papan Schedule ikut mengirim order regular. `desktopSubmissions` menyaring
  // `distribution_type === 'kilat'` saat tab kilat aktif, jadi order regular
  // mendarat di daftar yang tidak memuat barisnya — drawer terbuka mengambang
  // di atas daftar kosong. Pengirim lama yang tidak mengirim field ini tetap
  // dapat perilaku lamanya.
  useEffect(() => {
    if (!focusSubmission) return;
    setCurrentDate(new Date(focusSubmission.createdAt));
    setSearchQuery(focusSubmission.id);
    setCurrentPage(1);
    setStatusFilter('all');
    const dist = focusSubmission.distributionType;
    setDistTab(dist === undefined || dist === null ? 'kilat' : dist === 'kilat' ? 'kilat' : 'regular');
  }, [focusSubmission]);

  // ...lalu baru buka drawer-nya SETELAH baris itu benar-benar termuat di
  // `submissions`. Kalau digabung dengan effect di atas dalam satu tick, guard
  // "tutup drawer kalau baris tidak ditemukan" (persis di atas effect ini) bisa
  // menutupnya lagi sebelum fetch sempat selesai.
  useEffect(() => {
    if (!focusSubmission) return;
    if (submissions.some((s) => s.id === focusSubmission.id)) {
      setOpenSubmissionId(focusSubmission.id);
    }
  }, [focusSubmission, submissions]);

  // Map of submission ID -> CustomerTier for list rows
  const clientTierMap = useMemo(() => {
    const researcherStats = new Map<string, { totalOrders: number; paidCount: number; totalSpent: number }>();

    const getKey = (sub: SurveySubmission) => {
      const email = sub.researcherEmail?.toLowerCase().trim();
      const phone = sub.phone_number?.replace(/\D/g, '');
      if (email && email !== 'no email') return `email:${email}`;
      if (phone && phone.length >= 8) return `phone:${phone}`;
      return `id:${sub.id}`;
    };

    submissions.forEach((sub) => {
      const key = getKey(sub);
      const isPaid = (sub.payment_status || '').toLowerCase() === 'paid';
      // `latestAmount`, bukan "totalPaid" — PaymentState tidak pernah punya
      // field itu, jadi ekspresi lamanya selalu jatuh ke `total_cost`.
      const paidAmount = isPaid ? (paymentStates[sub.id]?.latestAmount || sub.total_cost || 0) : 0;

      const current = researcherStats.get(key) || { totalOrders: 0, paidCount: 0, totalSpent: 0 };
      current.totalOrders += 1;
      if (isPaid) {
        current.paidCount += 1;
        current.totalSpent += paidAmount;
      }
      researcherStats.set(key, current);
    });

    const map = new Map<string, 'vvip' | 'vip' | 'returning' | 'new' | 'unpaid'>();
    submissions.forEach((sub) => {
      const key = getKey(sub);
      const stats = researcherStats.get(key);
      if (!stats || stats.paidCount === 0) {
        map.set(sub.id, 'unpaid');
      } else if (stats.paidCount >= 5 && stats.totalSpent >= 5_000_000) {
        map.set(sub.id, 'vvip');
      } else if (stats.paidCount >= 3 && stats.totalSpent >= 1_000_000) {
        map.set(sub.id, 'vip');
      } else if (stats.paidCount >= 2) {
        map.set(sub.id, 'returning');
      } else {
        map.set(sub.id, 'new');
      }
    });

    return map;
  }, [submissions, paymentStates]);

  // Client tier: fetched async against full Supabase history (not just current-month page)
  const [clientTier, setClientTier] = useState<'vvip' | 'vip' | 'returning' | 'new' | 'unpaid' | undefined>(undefined);

  useEffect(() => {
    if (!openSubmission) { setClientTier(undefined); return; }

    const email = openSubmission.researcherEmail?.toLowerCase();
    const rawPhone = openSubmission.phone_number;
    const normPhone = rawPhone ? rawPhone.replace(/\D/g, '').replace(/^0/, '62') : '';

    async function fetchTier() {
      // Build OR filter by email and/or normalized phone
      const orParts: string[] = [];
      if (email && email !== 'no email') orParts.push(`email.eq.${email}`);
      if (normPhone.length >= 10) {
        // Try both stored formats: with leading 0 and with 62 prefix
        const withZero = '0' + normPhone.slice(2);
        orParts.push(`phone_number.eq.${rawPhone}`);
        orParts.push(`phone_number.eq.${normPhone}`);
        orParts.push(`phone_number.eq.${withZero}`);
      }
      if (!orParts.length) { setClientTier('unpaid'); return; }

      const { data: subData } = await supabase
        .from('form_submissions')
        .select('id, payment_status')
        .or(orParts.join(','));

      if (!subData?.length) { setClientTier('unpaid'); return; }

      const ids = subData.map((s: any) => s.id);

      // Fetch actual paid amounts from transactions (same logic as CustomersPage)
      const { data: txData } = await supabase
        .from('transactions')
        .select('form_submission_id, amount, status')
        .in('form_submission_id', ids);

      const paidMap = new Map<string, number>();
      (txData || []).forEach((tx: any) => {
        if (['paid', 'completed'].includes(tx.status)) {
          paidMap.set(tx.form_submission_id, (paidMap.get(tx.form_submission_id) || 0) + tx.amount);
        }
      });

      let paidCount = 0;
      let totalSpent = 0;
      subData.forEach((s: any) => {
        if ((s.payment_status || '').toLowerCase() === 'paid') {
          paidCount++;
          totalSpent += paidMap.get(s.id) || 0;
        }
      });

      // Same thresholds as customerTier() in customers/types.ts
      if (paidCount === 0) setClientTier('unpaid');
      else if (paidCount >= 5 && totalSpent >= 5_000_000) setClientTier('vvip');
      else if (paidCount >= 3 && totalSpent >= 1_000_000) setClientTier('vip');
      else if (paidCount >= 2) setClientTier('returning');
      else setClientTier('new');
    }

    fetchTier();
  }, [openSubmission?.id]);

  const handleStatusChange = async (submissionId: string, newStatus: string, notes?: string) => {
    const submission = submissions.find(s => s.id === submissionId);
    if (!submission) return;

    // Build new history entry
    const newEntry: ReviewHistoryEntry = {
      action: newStatus as ReviewHistoryEntry['action'],
      // Semua yang lewat sini datang dari dashboard ADMIN. Tanpa penanda ini,
      // entri `in_review` dari tombol Reset admin dan dari "Saya Sudah
      // Perbaiki" milik peneliti tampil identik di History Log.
      actor: 'admin',
      notes: notes || undefined,
      timestamp: new Date().toISOString(),
    };

    // Append to existing history
    const updatedHistory = [
      ...(submission.review_history || []),
      newEntry,
    ];

    await executeStatusUpdate(submissionId, newStatus, notes, updatedHistory, submission.status);
  };

  /**
   * Jembatan iklan regular ↔ JFU Kilat. Setelah konversi, baris berpindah tab
   * sendiri — filter distTab membaca distribution_type dari data yang dimuat
   * ulang, jadi tidak ada state tab yang perlu disentuh di sini.
   *
   * Dialog konfirmasinya sudah menjelaskan konsekuensinya (jadwal dilepas, harga
   * dihitung ulang); yang tersisa di sini hanya menjalankan dan memuat ulang.
   */
  const handleConvertDistribution = async (submission: SurveySubmission, target: 'regular' | 'kilat') => {
    try {
      const { totalCost } = await convertDistributionType(submission.id, target);
      // Drawer ditutup: submission yang terbuka sekarang ada di tab lain, dan
      // membiarkannya terbuka menampilkan aksi milik jalur yang sudah ditinggalkan.
      setOpenSubmissionId(null);
      await loadSubmissions();
      toast.success(
        target === 'kilat'
          ? `Dipindahkan ke JFU Kilat — harga jadi Rp ${totalCost.toLocaleString('id-ID')}. Pilih slot Kilat di tab Kilat.`
          : `Dikembalikan ke iklan regular — harga jadi Rp ${totalCost.toLocaleString('id-ID')}. Reserve slot ulang di tab Iklan.`
      );
    } catch (error: any) {
      console.error('Gagal memindahkan jalur distribusi:', error);
      toast.error(error?.message || 'Gagal memindahkan jalur distribusi');
    }
  };

  /**
   * Mengabari peneliti hasil review. Endpointnya membaca ulang barisnya dari DB
   * dan hanya mengirim kalau statusnya benar-benar cocok, jadi tidak ada yang
   * perlu dititipkan dari sini selain id-nya.
   *
   * Kegagalan email TIDAK boleh membatalkan perubahan status — statusnya sudah
   * berubah di server, dan memutar balik keputusan review gara-gara SMTP jauh
   * lebih buruk daripada satu email yang tidak sampai. Admin diberi tahu lewat
   * toast terpisah supaya bisa menyusul lewat WA.
   */
  const notifyReviewResult = async (submissionId: string, newStatus: string) => {
    if (!['approved', 'rejected', 'cancelled'].includes(newStatus)) return;
    try {
      const res = await fetch('/api/notify-review-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, status: newStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error('Gagal mengirim email hasil review:', err);
      toast.warning('Status tersimpan, tapi email ke peneliti gagal terkirim. Susulkan lewat WA.');
    }
  };

  const executeStatusUpdate = async (
    submissionId: string,
    newStatus: string,
    notes?: string,
    reviewHistory?: ReviewHistoryEntry[],
    /** Status sebelum aksi ini — email hanya dikirim kalau benar-benar berubah. */
    previousStatus?: string
  ) => {
    try {
      await updateFormStatus(submissionId, newStatus, notes, reviewHistory);

      if (previousStatus !== newStatus) {
        // Sengaja tidak di-`await`: email tidak boleh menahan layar, dan
        // kegagalannya sudah ditangani di dalam.
        void notifyReviewResult(submissionId, newStatus);
      }

      const updateState = (prev: SurveySubmission[]) =>
        prev.map(s =>
          s.id === submissionId
            ? {
                ...s,
                status: newStatus,
                submission_status: newStatus,
                admin_notes: notes !== undefined ? notes : s.admin_notes,
                review_history: reviewHistory || s.review_history,
              }
            : s
        );

      setSubmissions(updateState);
      // filteredSubmissions will be updated by useEffect

      toast.success('Status updated successfully');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };


  const handleOpenEditCriteriaModal = (submission: SurveySubmission) => {
    setSelectedSubmissionForCriteria(submission);
    setIsEditCriteriaModalOpen(true);
  };

  const handleCloseEditCriteriaModal = () => {
    setIsEditCriteriaModalOpen(false);
    setSelectedSubmissionForCriteria(null);
  };

  const handleCriteriaUpdated = () => {
    loadSubmissions();
  };

  const handleOpenEditFormDetailsModal = (submission: SurveySubmission) => {
    setSelectedSubmissionForDetails(submission);
    setIsEditFormDetailsModalOpen(true);
  };

  const handleCloseEditFormDetailsModal = () => {
    setIsEditFormDetailsModalOpen(false);
    setSelectedSubmissionForDetails(null);
  };

  const handleFormDetailsUpdated = () => {
    loadSubmissions();
  };

  const handlePageBuilt = () => {
    loadSubmissions(); // Refresh to update the "Link" button availability
  };

  const handleOpenPageBuilder = async (submission: SurveySubmission) => {
    setSelectedSubmissionForPage(submission);
    // Fetch existing page data if any (optional optimization: fetch list of pages first)
    // For now, we'll try to fetch on open or inside the modal.
    // Let's rely on the modal to fetch or just pass null and let it handle initialization if needed.
    // Actually, checking if page exists here is better for UX (Edit vs Create).
    try {
      const { data } = await supabase.from('survey_pages').select('*').eq('submission_id', submission.id).single();
      setPageBuilderData(data);
    } catch (e) {
      setPageBuilderData(null);
    }
    setIsPageBuilderOpen(true);
  };

  const handleClosePageBuilder = () => {
    setIsPageBuilderOpen(false);
    setSelectedSubmissionForPage(null);
    setPageBuilderData(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }


  if (!user && !hideAuth) {
    const handleEmailLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailInput,
          password: passwordInput,
        });
        if (error) throw error;
        toast.success('Login successful');
      } catch (error: any) {
        console.error('Login error:', error);
        toast.error(error.message || 'Failed to login');
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-center rounded-t-lg">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4 mx-auto">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl text-white">Internal Dashboard</CardTitle>
            <CardDescription className="text-blue-100">Login with Admin Credentials</CardDescription>
          </CardHeader>
          <CardContent className="pt-8 pb-8 px-8">
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">Email</label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@jakpat.net"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">Password</label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not Admin -> Access Denied
  if (!isAdmin && !hideAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 px-4">
        <Card className="w-full max-w-md text-center p-8">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">
            Your email ({user ? user.email : 'Unknown'}) is not authorized to access the Internal Dashboard.
          </p>
          <Button onClick={handleLogout} variant="destructive">
            Log Out
          </Button>
        </Card>
      </div>
    );
  }

  // Selection helpers for the current page of rows (desktop-scoped: Regular/Kilat tab split)
  const pageIds = desktopSubmissions.map((s) => s.id);
  const pageAllSelected = rowSelection.allSelected(pageIds);
  const pageSomeSelected = rowSelection.someSelected(pageIds);



  const detailProps = {
    submission: openSubmission,
    paymentData: openSubmission ? (paymentStates[openSubmission.id] || EMPTY_PAYMENT_STATE) : EMPTY_PAYMENT_STATE,
    existingPage: openSubmission ? existingPages[openSubmission.id] : undefined,
    isScheduled: openSubmission ? scheduledSubmissionIds.has(openSubmission.id) : false,
    clientTier,
    onOpenChange: (open: boolean) => { if (!open) setOpenSubmissionId(null); },
    onStatusChange: handleStatusChange,
    onEditFormDetails: handleOpenEditFormDetailsModal,
    onEditCriteria: handleOpenEditCriteriaModal,
    onOpenScheduleBoard,
    initialSubView: pendingSubView,
    onInitialSubViewConsumed: () => setPendingSubView(null),
    onConvertDistribution: handleConvertDistribution,
    onExtendCreated: loadSubmissions,
  };

  return (
    <div className={hideAuth ? 'h-full flex flex-col' : 'min-h-screen flex flex-col bg-background'}>
      {/* Header - Only show if not using sidebar layout */}
      {!hideAuth && (
        <div className="bg-card border-b border-border">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center font-bold text-lg text-white flex-shrink-0">
                  J
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">Internal Dashboard</h1>
                  <p className="text-sm text-muted-foreground hidden sm:block">Jakpat for Universities</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                <Button
                  onClick={loadSubmissions}
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  title="Refresh data"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="ml-2 hidden sm:inline">Refresh</span>
                </Button>

                <Button
                  onClick={handleLogout}
                  variant="secondary"
                  size="sm"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className={hideAuth ? 'p-4 md:p-6 flex-1 min-h-0 flex flex-col gap-4' : 'max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-6 flex-1 min-h-0 flex flex-col gap-4'}>

        {/* Mobile-only filter card. Legacy src/styles.css loads after Tailwind and
            redefines `.flex`, which overrides `md:hidden` — so this element must not
            use `flex` for its own layout (space-y keeps the same vertical stack). */}
        <div className="md:hidden bg-white p-4 rounded-xl border border-gray-100 space-y-4 shrink-0 relative z-30 shadow-[0_4px_20px_rgb(0,0,0,0.05)]">

          {/* Top Row: Month Selector & Actions */}
          <div className="flex flex-row items-center gap-4 w-full">
            {/* Left: Month Selector */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-600">Periode</span>
              <div className="flex items-center gap-3 bg-gray-50/80 p-1.5 rounded-lg border border-gray-200/50">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-white hover:shadow-sm"
                  onClick={() => {
                    const newDate = new Date(currentDate);
                    newDate.setMonth(newDate.getMonth() - 1);
                    setCurrentDate(newDate);
                    setCurrentPage(1);
                  }}
                >
                  <ChevronLeft className="h-4 w-4 text-gray-600" />
                </Button>
                <h2 className="text-sm font-semibold min-w-[140px] text-center text-gray-700 select-none">
                  {currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-white hover:shadow-sm"
                  onClick={() => {
                    const newDate = new Date(currentDate);
                    newDate.setMonth(newDate.getMonth() + 1);
                    setCurrentDate(newDate);
                    setCurrentPage(1);
                  }}
                >
                  <ChevronRight className="h-4 w-4 text-gray-600" />
                </Button>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <Button
                onClick={loadSubmissions}
                variant="outline"
                size="sm"
                disabled={loading}
                className="h-8 w-8 p-0 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-gray-200"
                title="Refresh data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          <div className="h-px bg-gray-100 w-full" />

          {/* Bottom Row: Search & Filters */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Left: Search */}
            <div className="flex-1 min-w-[300px] max-w-md relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search..."
                className="w-full pl-9 bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 transition-all h-9 text-sm"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>

            {/* Right: Status Filters */}
            <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
              {[
                { id: 'all', label: 'All', count: statusCounts.all, color: 'bg-gray-100 text-gray-700' },
                { id: 'in_review', label: 'Need Review', count: statusCounts.in_review, color: 'bg-blue-50 text-blue-700' },
                { id: 'rejected', label: 'Menunggu Perbaikan', count: statusCounts.rejected, color: 'bg-amber-50 text-amber-700' },
                { id: 'approved', label: 'Approved', count: statusCounts.approved, color: 'bg-green-50 text-green-700' },
                { id: 'paid', label: 'Paid', count: statusCounts.paid, color: 'bg-emerald-50 text-emerald-700' },
                { id: 'spam', label: 'Revision / Spam', count: statusCounts.spam, color: 'bg-orange-50 text-orange-700' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setStatusFilter(tab.id); setCurrentPage(1); }}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap h-9
                    ${statusFilter === tab.id
                      ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-200'
                      : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-900'}
                  `}
                >
                  {tab.label}
                  {/* Angka hanya untuk dua antrean kerja — keduanya dihitung
                      dari DB tanpa filter bulan (lihat `queueCounts`). */}
                  {['in_review', 'rejected'].includes(tab.id) && (
                    <span className={`
                      px-1.5 py-0.5 rounded-md text-[10px] font-bold min-w-[18px] text-center
                      ${statusFilter === tab.id
                        ? 'bg-white/20 text-white'
                        : tab.color}
                    `}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {searchQuery && (
            <>
              <div className="h-px bg-gray-100 w-full" />
              <p className="text-sm text-gray-500">
                Found {filteredSubmissions.length} result{filteredSubmissions.length !== 1 ? 's' : ''} for "{searchQuery}"
              </p>
            </>
          )}
        </div>

        {/* Desktop: Tab DI LUAR kartu, seperti di Schedule Board */}
        <div className="hidden md:flex shrink-0 items-center border-b border-gray-200 -mb-2">
          {([
            ['regular', 'Iklan', Calendar],
            ['kilat', 'Kilat', Zap]
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setDistTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 -mb-px text-sm font-semibold border-b-2 transition-colors',
                distTab === id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Desktop: unified list surface — toolbar, column header, rows, pagination in one card */}
        <div className="hidden md:flex flex-1 min-h-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col">
          {/* Toolbar row: Periode · search · filter · sort · refresh */}
          <div className="shrink-0 flex items-center gap-4 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  const newDate = new Date(currentDate);
                  newDate.setMonth(newDate.getMonth() - 1);
                  setCurrentDate(newDate);
                  setCurrentPage(1);
                }}
              >
                <ChevronLeft className="h-4 w-4 text-gray-600" />
              </Button>
              <h2 className="text-sm font-semibold min-w-[120px] text-center text-gray-700 select-none">
                {currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  const newDate = new Date(currentDate);
                  newDate.setMonth(newDate.getMonth() + 1);
                  setCurrentDate(newDate);
                  setCurrentPage(1);
                }}
              >
                <ChevronRight className="h-4 w-4 text-gray-600" />
              </Button>
            </div>
            <div className="flex-1 max-w-md relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Cari judul survey, researcher, atau ID submission..."
                className="w-full pl-9 bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 transition-all h-9 text-sm"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
            {searchQuery && (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {desktopSubmissions.length} result{desktopSubmissions.length !== 1 ? 's' : ''}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              {statusFilter !== 'all' && (
                <button
                  onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
                  className="flex items-center gap-1 rounded-full bg-slate-800 text-white text-xs font-medium pl-2.5 pr-1.5 py-1 mr-1"
                  title="Clear status filter"
                >
                  {STATUS_FILTER_OPTIONS.find(o => o.id === statusFilter)?.label}
                  <X className="w-3 h-3" />
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-gray-900" title="Filter status">
                    <ListFilter className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.id}
                      onClick={() => { setStatusFilter(opt.id); setCurrentPage(1); }}
                      className={cn('flex items-center justify-between text-sm cursor-pointer', statusFilter === opt.id && 'font-semibold text-blue-700')}
                    >
                      {opt.label}
                      <span className="text-xs text-gray-400">{statusCounts[opt.id]}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-500 hover:text-gray-900"
                onClick={() => { setSortDir(d => (d === 'desc' ? 'asc' : 'desc')); setCurrentPage(1); }}
                title={sortDir === 'desc' ? 'Terbaru dulu — klik untuk terlama' : 'Terlama dulu — klik untuk terbaru'}
              >
                {sortDir === 'desc' ? <ArrowDownWideNarrow className="w-4 h-4" /> : <ArrowUpNarrowWide className="w-4 h-4" />}
              </Button>
              <Button
                onClick={loadSubmissions}
                variant="ghost"
                size="icon"
                disabled={loading}
                className="h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                title="Refresh data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Bulk Selection Bar (Yahoo Mail style — only rendered when rows are selected) */}
          {rowSelection.count > 0 && (
            <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-blue-50/95 border-b border-gray-200 min-h-[44px]">
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-blue-900">
                  {rowSelection.count} selected
                </span>
                <span className="h-4 w-px bg-blue-200" aria-hidden="true" />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled
                  className="h-7 px-2.5 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-100/50"
                  title="Coming soon"
                >
                  <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Create Bulk Payment
                  <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide bg-blue-100/80 rounded px-1 py-0.5">Soon</span>
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={rowSelection.clear}
                className="h-7 px-2.5 text-xs font-medium text-blue-700 hover:bg-blue-100/50 hover:text-blue-900"
              >
                <X className="w-3.5 h-3.5 mr-1" /> Clear
              </Button>
            </div>
          )}

          {/* Scrollable rows region with sticky column header */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-4 h-10 flex items-center gap-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              <div className="shrink-0 flex items-center">
                <Checkbox
                  checked={pageAllSelected ? true : pageSomeSelected ? 'indeterminate' : false}
                  onCheckedChange={() => rowSelection.toggleAll(pageIds)}
                  aria-label="Select all on this page"
                />
              </div>
              <span className="hidden sm:block w-[60px] shrink-0">Date</span>
              <span className="hidden md:block w-[100px] shrink-0">ID</span>
              <span className="hidden md:block w-[65px] shrink-0">Review</span>
              <span className="flex-1">Survey</span>
              <span className="w-5 shrink-0" />
              <span className="w-4 shrink-0" /> {/* Spacer to align with chevron */}
            </div>

            {loading ? (
              <div className="divide-y divide-gray-100">
                {Array(8).fill(0).map((_, i) => (
                  <div key={`skeleton-desktop-${i}`} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-4 h-4 rounded bg-gray-100 animate-pulse shrink-0" />
                    <div className="w-[76px] shrink-0 space-y-1">
                      <div className="h-3 w-14 bg-gray-200 animate-pulse rounded" />
                      <div className="h-2.5 w-10 bg-gray-100 animate-pulse rounded" />
                    </div>
                    <div className="h-4 w-[84px] bg-gray-100 animate-pulse rounded shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="h-4 w-3/5 bg-gray-200 animate-pulse rounded" />
                      <div className="h-2.5 w-2/5 bg-gray-100 animate-pulse rounded" />
                    </div>
                    <div className="h-2.5 w-2.5 bg-gray-200 animate-pulse rounded-full shrink-0" />
                  </div>
                ))}
              </div>
            ) : desktopSubmissions.length === 0 ? (
              <div className="py-16 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-muted rounded-full mb-3">
                  {submissions.length === 0
                    ? <Eye className="w-7 h-7 text-muted-foreground" />
                    : <Search className="w-7 h-7 text-muted-foreground" />}
                </div>
                <h3 className="text-lg font-semibold mb-1 text-foreground">
                  {submissions.length === 0 ? 'No Submissions Yet' : 'No Results Found'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {submissions.length === 0
                    ? 'Survey submissions will appear here once researchers start submitting their forms.'
                    : searchQuery
                      ? `No submissions match your search query "${searchQuery}".`
                      : 'No submissions match the current filter.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {desktopSubmissions.map((submission) => (
                  <SubmissionListRow
                    key={submission.id}
                    submission={submission}
                    lifecycle={deriveLifecycle(
                      submission,
                      paymentStates[submission.id] || EMPTY_PAYMENT_STATE,
                      existingPages[submission.id],
                      scheduledSubmissionIds.has(submission.id)
                    )}
                    existingPage={existingPages[submission.id]}
                    selected={rowSelection.isSelected(submission.id)}
                    onSelectToggle={rowSelection.toggle}
                    onOpen={setOpenSubmissionId}
                    active={isXl && submission.id === openSubmissionId}
                    clientTier={clientTierMap.get(submission.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Pagination footer */}
          <div className="shrink-0 flex items-center justify-between border-t border-gray-200 px-4 py-2.5 bg-white">
            <div className="text-xs text-gray-400">
              Showing {totalSubmissions === 0 ? 0 : ((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalSubmissions)} of {totalSubmissions} results
            </div>
            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-lg border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1 || loading}
                title="Previous Page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <div className="text-xs font-semibold text-gray-700 min-w-[70px] text-center">
                Page {currentPage} of {Math.ceil(totalSubmissions / pageSize) || 1}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-lg border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => setCurrentPage(prev => prev + 1)}
                disabled={currentPage * pageSize >= totalSubmissions || loading}
                title="Next Page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          </div>

          {/* Inline reading pane (Outlook split view) */}
          {isXl && openSubmission && (
            <SubmissionDetailSheet variant="pane" {...detailProps} />
          )}
        </div>

        {/* Mobile: unchanged card view */}
        <div className="md:hidden">
          {loading ? (
            <div className="space-y-4">
              {Array(3).fill(0).map((_, i) => (
                <Card key={`skeleton-mobile-${i}`} className="overflow-hidden mb-4 shadow-sm border-0">
                  <div className="p-4 border-b bg-gray-50/50 flex justify-between items-start">
                    <div>
                      <div className="h-5 w-40 bg-gray-200 rounded animate-pulse mb-2"></div>
                      <div className="h-4 w-32 bg-gray-100 rounded animate-pulse"></div>
                    </div>
                    <div className="h-6 w-16 rounded-full bg-gray-200 animate-pulse"></div>
                  </div>
                  <CardContent className="p-4 space-y-4">
                    <div className="space-y-2">
                      <div className="h-3 w-16 bg-gray-100 rounded animate-pulse"></div>
                      <div className="h-4 w-48 bg-gray-200 rounded animate-pulse"></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="h-3 w-16 bg-gray-100 rounded animate-pulse"></div>
                        <div className="h-4 w-full bg-gray-200 rounded animate-pulse"></div>
                      </div>
                      <div className="space-y-2">
                        <div className="h-3 w-20 bg-gray-100 rounded animate-pulse"></div>
                        <div className="h-4 w-full bg-gray-200 rounded animate-pulse"></div>
                      </div>
                    </div>
                    <div className="pt-4 flex justify-end gap-2">
                      <div className="h-9 w-full bg-gray-200 rounded animate-pulse"></div>
                      <div className="h-9 w-full bg-gray-200 rounded animate-pulse"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-full mb-4">
                <Eye className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">No Submissions Yet</h3>
              <p className="text-muted-foreground">
                Survey submissions will appear here once researchers start submitting their forms.
              </p>
            </Card>
          ) : filteredSubmissions.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-full mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-foreground">No Results Found</h3>
              <p className="text-muted-foreground">
                No submissions match your search query "{searchQuery}".
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredSubmissions.map((submission) => (
                <SubmissionsMobileCard
                  key={submission.id}
                  submission={submission}
                  paymentData={paymentStates[submission.id] || EMPTY_PAYMENT_STATE}
                  existingPage={existingPages[submission.id]}
                  isScheduled={scheduledSubmissionIds.has(submission.id)}
                  onStatusChange={handleStatusChange}
                  onEditFormDetails={handleOpenEditFormDetailsModal}
                  onEditCriteria={handleOpenEditCriteriaModal}
                  onOpenPageBuilder={handleOpenPageBuilder}
                  onOpenSchedule={(sub) => {
                    setOpenSubmissionId(sub.id);
                    setPendingSubView('schedule');
                  }}
                  onOpenPayment={(sub) => {
                    setOpenSubmissionId(sub.id);
                    setPendingSubView('payment');
                  }}
                  onOpenReview={(sub) => setOpenSubmissionId(sub.id)}
                  onExtendCreated={loadSubmissions}
                />
              ))}
            </div>
          )}
        </div>
      </div >


      <EditCriteriaModal
        isOpen={isEditCriteriaModalOpen}
        onClose={handleCloseEditCriteriaModal}
        submission={selectedSubmissionForCriteria}
        onSuccess={handleCriteriaUpdated}
        submissionTitle={selectedSubmissionForCriteria?.formTitle || ''}
      />
      {/* Edit Form Details Modal */}
      <EditFormDetailsModal
        isOpen={isEditFormDetailsModalOpen}
        onClose={handleCloseEditFormDetailsModal}
        submission={selectedSubmissionForDetails}
        onUpdate={handleFormDetailsUpdated}
      />

      {/* Page Builder Modal */}
      <PageBuilderModal
        isOpen={isPageBuilderOpen}
        onClose={handleClosePageBuilder}
        submissionId={selectedSubmissionForPage?.id || ''}
        initialData={pageBuilderData}
        onSuccess={handlePageBuilt}
        submissionTitle={selectedSubmissionForPage?.formTitle || ''}
        submissionStartDate={selectedSubmissionForPage?.start_date}
        submissionEndDate={selectedSubmissionForPage?.end_date}
        submissionPrizePerWinner={selectedSubmissionForPage?.prize_per_winner}
        submissionWinnerCount={selectedSubmissionForPage?.winnerCount}
        submissionCriteria={selectedSubmissionForPage?.criteria}
      />

      {/* Detail drawer (narrow screens) — ≥1280px uses the inline pane instead */}
      {!isXl && <SubmissionDetailSheet {...detailProps} />}

    </div>
  );
}
