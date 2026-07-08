import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { LogOut, Eye, RefreshCw, Lock, Search, CreditCard, ChevronLeft, ChevronRight, X, ListFilter, ArrowDownWideNarrow, ArrowUpNarrowWide, Zap, Calendar } from 'lucide-react';
import { getFormSubmissionsPaginated, updateFormStatus, updatePaymentStatus, supabase } from '../utils/supabase';
import { fetchProfileNames } from '../utils/profileNames';
import { emailLocalPart } from './customers/types';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { cn, useMediaQuery } from '@/lib/utils';
import { SchedulePaymentView } from './SchedulePaymentView';
import { EditCriteriaModal } from './EditCriteriaModal';
import { EditFormDetailsModal } from './EditFormDetailsModal';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageBuilderModal } from './PageBuilder/PageBuilderModal';
import { SubmissionsMobileCard } from './SubmissionsTableRow';
import type { SurveySubmission, PaymentState, ReviewHistoryEntry } from './submissions/types';
import { deriveLifecycle } from './submissions/lifecycle';
import { SubmissionListRow } from './submissions/SubmissionListRow';
import { SubmissionDetailSheet } from './submissions/SubmissionDetailSheet';
import { useRowSelection } from './data-list/useRowSelection';
import './InternalDashboard.css';

const EMPTY_PAYMENT_STATE: PaymentState = { hasInvoices: false, latestStatus: null, invoiceCount: 0, latestPaymentUrl: null };

const STATUS_FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'in_review', label: 'Need Review' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'approved', label: 'Approved' },
  { id: 'paid', label: 'Paid' },
  { id: 'spam', label: 'Revision / Spam' },
] as const;

interface InternalDashboardProps {
  hideAuth?: boolean;
  onLogout?: () => void;
}

export function InternalDashboard({ hideAuth = false, onLogout }: InternalDashboardProps = {}) {
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
  const [activeScheduleSubmission, setActiveScheduleSubmission] = useState<SurveySubmission | null>(null);
  const [scheduleInitialStep, setScheduleInitialStep] = useState<'schedule' | 'payment'>('schedule');

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

  // Map submission_id -> page data (slug, is_published)
  const [existingPages, setExistingPages] = useState<Record<string, { slug: string, is_published: boolean, publish_start_date: string | null, publish_end_date: string | null, title?: string, is_extra_ad?: boolean }>>({});

  // Admin Access Check
  // STRICT: Only product@jakpat.net is allowed
  const allowedEmails = ['product@jakpat.net'];
  const isAdmin = (user?.email && allowedEmails.includes(user.email)) ||
    hideAuth; // Trust parent if hideAuth is true



  // Filter Submissions Effect
  useEffect(() => {
    let result = submissions;

    // Filter by Status
    if (statusFilter !== 'all') {
      result = result.filter(sub => {
        if (statusFilter === 'spam') return sub.status === 'spam';
        if (statusFilter === 'rejected') return sub.status === 'rejected';
        if (statusFilter === 'approved') return sub.status === 'approved';
        if (statusFilter === 'in_review') return sub.status === 'in_review';
        if (statusFilter === 'paid') return (sub.payment_status || '').toLowerCase() === 'paid';
        return true;
      });
    }

    setFilteredSubmissions(result);
  }, [submissions, statusFilter]);

  // Calculate Status Counts
  const statusCounts = {
    all: submissions.length,
    in_review: submissions.filter(s => s.status === 'in_review').length,
    rejected: submissions.filter(s => s.status === 'rejected').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    paid: submissions.filter(s => (s.payment_status || '').toLowerCase() === 'paid').length,
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
      const { data, count } = await getFormSubmissionsPaginated(
        currentPage,
        pageSize,
        searchQuery,
        startOfMonth.toISOString(),
        endOfMonth.toISOString(),
        sortDir === 'asc'
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
          distribution_type: sub.distribution_type,
          has_transactions: false, // Default, will verify below
        }));

        // Fetch existing pages & transactions for these submissions
        if (transformed.length > 0) {
          const submissionIds = transformed.map(s => s.id);

          // 1. Fetch Pages
          const { data: pages, error: pagesError } = await supabase
            .from('survey_pages')
            .select('submission_id, slug, is_published, publish_start_date, publish_end_date, title, is_extra_ad')
            .in('submission_id', submissionIds);

          if (pagesError) console.error('Error fetching survey pages:', pagesError);

          if (pages) {
            const pageMap: Record<string, { slug: string, is_published: boolean, publish_start_date: string | null, publish_end_date: string | null, title?: string, is_extra_ad?: boolean }> = {};
            pages.forEach(p => {
              pageMap[p.submission_id] = { slug: p.slug, is_published: p.is_published, publish_start_date: p.publish_start_date, publish_end_date: p.publish_end_date, title: p.title, is_extra_ad: p.is_extra_ad };
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

          const paymentMap: Record<string, { hasInvoices: boolean, latestStatus: 'pending' | 'paid' | 'completed' | 'expired' | null, invoiceCount: number, latestPaymentUrl: string | null, latestAmount: number, hasEverPaid: boolean }> = {};

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
                paymentMap[sub.id] = {
                  hasInvoices: true,
                  latestStatus: latestStatus,
                  invoiceCount: subTxs.length,
                  latestPaymentUrl: latestPendingTx?.payment_url || subTxs[0].payment_url || null,
                  latestAmount: subTxs[0].amount || 0,
                  hasEverPaid: hasEverPaid
                };
                sub.payment_status = latestStatus;
              } else {
                paymentMap[sub.id] = { hasInvoices: false, latestStatus: null, invoiceCount: 0, latestPaymentUrl: null, latestAmount: 0, hasEverPaid: false };
                if (sub.payment_status === 'pending') sub.payment_status = undefined;
              }
            });
          } else {
            transformed.forEach(sub => {
              paymentMap[sub.id] = { hasInvoices: false, latestStatus: null, invoiceCount: 0, latestPaymentUrl: null, latestAmount: 0, hasEverPaid: false };
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
  }, [isAdmin, currentPage, searchQuery, currentDate, sortDir]);

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

  // Client tier: fetched async against full Supabase history (not just current-month page)
  const [clientTier, setClientTier] = useState<'vvip' | 'vip' | 'returning' | 'new' | undefined>(undefined);

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
      if (!orParts.length) { setClientTier('new'); return; }

      const { data: subData } = await supabase
        .from('form_submissions')
        .select('id, payment_status')
        .or(orParts.join(','));

      if (!subData?.length) { setClientTier('new'); return; }

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

      const totalOrders = subData.length;
      let paidCount = 0;
      let totalSpent = 0;
      subData.forEach((s: any) => {
        if ((s.payment_status || '').toLowerCase() === 'paid') {
          paidCount++;
          totalSpent += paidMap.get(s.id) || 0;
        }
      });

      // Same thresholds as customerTier() in customers/types.ts
      if (paidCount >= 5 && totalSpent >= 5_000_000) setClientTier('vvip');
      else if (paidCount >= 3 && totalSpent >= 1_000_000) setClientTier('vip');
      else if (totalOrders >= 2) setClientTier('returning');
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
      notes: notes || undefined,
      timestamp: new Date().toISOString(),
    };

    // Append to existing history
    const updatedHistory = [
      ...(submission.review_history || []),
      newEntry,
    ];

    await executeStatusUpdate(submissionId, newStatus, notes, updatedHistory);
  };

  const handlePaymentStatusChange = async (submissionId: string, newStatus: string) => {
    try {
      await updatePaymentStatus(submissionId, newStatus);
      
      const updateState = (prev: SurveySubmission[]) =>
        prev.map(s => s.id === submissionId ? { ...s, payment_status: newStatus } : s);

      setSubmissions(updateState);
      setFilteredSubmissions(updateState);
      
      // Update local payment state for UI changes
      setPaymentStates(prev => {
        const curr = prev[submissionId];
        if (!curr) return prev;
        return {
          ...prev,
          [submissionId]: {
            ...curr,
            latestStatus: newStatus as any,
          }
        };
      });
      
      toast.success(`Payment status marked as ${newStatus}`);
    } catch (error) {
      toast.error('Failed to update payment status');
    }
  };

  const executeStatusUpdate = async (
    submissionId: string,
    newStatus: string,
    notes?: string,
    reviewHistory?: ReviewHistoryEntry[]
  ) => {
    try {
      await updateFormStatus(submissionId, newStatus, notes, reviewHistory);

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

  // Modals replaced by SchedulePaymentView

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

  // Fullscreen Schedule & Payment View
  if (activeScheduleSubmission) {
    return (
      <div className={hideAuth ? 'h-full flex flex-col' : 'min-h-screen flex flex-col bg-background'}>
        <SchedulePaymentView
          submission={activeScheduleSubmission}
          existingPageSlug={existingPages[activeScheduleSubmission.id]?.slug}
          initialStep={scheduleInitialStep}
          onBack={() => {
            setActiveScheduleSubmission(null);
            loadSubmissions(); // Refresh data
          }}
        />
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
    onPaymentStatusChange: handlePaymentStatusChange,
    onEditFormDetails: handleOpenEditFormDetailsModal,
    onEditCriteria: handleOpenEditCriteriaModal,
    onOpenPageBuilder: handleOpenPageBuilder,
    onOpenSchedule: (sub: SurveySubmission) => { setActiveScheduleSubmission(sub); setScheduleInitialStep('schedule'); },
    onOpenPayment: (sub: SurveySubmission) => { setActiveScheduleSubmission(sub); setScheduleInitialStep('payment'); },
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
                { id: 'rejected', label: 'Rejected', count: statusCounts.rejected, color: 'bg-red-50 text-red-700' },
                { id: 'approved', label: 'Approved', count: statusCounts.approved, color: 'bg-green-50 text-green-700' },
                { id: 'paid', label: 'Paid', count: statusCounts.paid, color: 'bg-emerald-50 text-emerald-700' },
                { id: 'spam', label: 'Revision / Spam', count: statusCounts.spam, color: 'bg-orange-50 text-orange-700' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap h-9
                    ${statusFilter === tab.id
                      ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-200'
                      : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 hover:text-gray-900'}
                  `}
                >
                  {tab.label}
                  {/* Only show counter for 'Need Review' and 'Rejected' */}
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

        {/* Desktop: unified list surface — toolbar, column header, rows, pagination in one card */}
        <div className="hidden md:flex flex-1 min-h-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col">
          {/* Toolbar row 1: Periode · search · refresh */}
          <div className="shrink-0 flex items-center gap-4 px-4 py-3">
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
            <Button
              onClick={loadSubmissions}
              variant="ghost"
              size="icon"
              disabled={loading}
              className="ml-auto h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Toolbar row 2: Regular/Kilat tabs + filter & sort icons (Outlook-style) */}
          <div className="shrink-0 flex items-center justify-between px-4 border-b border-gray-200 relative min-h-[44px]">
            {/* Bulk Selection Overlay (Yahoo Mail style) */}
            {rowSelection.count > 0 && (
              <div className="absolute inset-0 z-20 flex items-center justify-between bg-blue-50/95 px-4 backdrop-blur-[2px] transition-all">
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
            <div className="flex">
              {([
                ['regular', 'Regular Ads', Calendar],
                ['kilat', 'Kilat', Zap]
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => setDistTab(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 -mb-px text-sm font-medium border-b-2 transition-colors',
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
            <div className="flex items-center gap-1 pb-1">
              {statusFilter !== 'all' && (
                <button
                  onClick={() => setStatusFilter('all')}
                  className="flex items-center gap-1 rounded-full bg-slate-800 text-white text-xs font-medium pl-2.5 pr-1.5 py-1"
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
                      onClick={() => setStatusFilter(opt.id)}
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
            </div>
          </div>

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
              <span className="w-[76px] shrink-0">Submitted</span>
              <span className="w-[84px] shrink-0">ID</span>
              <span className="flex-1">Survey</span>
              <span className="w-[120px] shrink-0 text-right">Status</span>
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
                    <div className="h-5 w-20 bg-gray-100 animate-pulse rounded-full shrink-0" />
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
                    selected={rowSelection.isSelected(submission.id)}
                    onSelectToggle={rowSelection.toggle}
                    onOpen={setOpenSubmissionId}
                    active={isXl && submission.id === openSubmissionId}
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
                  paymentData={paymentStates[submission.id] || { hasInvoices: false, latestStatus: null, invoiceCount: 0, latestPaymentUrl: null }}
                  existingPage={existingPages[submission.id]}
                  isScheduled={scheduledSubmissionIds.has(submission.id)}
                  onStatusChange={handleStatusChange}
                  onPaymentStatusChange={handlePaymentStatusChange}
                  onEditFormDetails={handleOpenEditFormDetailsModal}
                  onEditCriteria={handleOpenEditCriteriaModal}
                  onOpenPageBuilder={handleOpenPageBuilder}
                  onOpenSchedule={(sub) => {
                    setActiveScheduleSubmission(sub);
                    setScheduleInitialStep('schedule');
                  }}
                  onOpenPayment={(sub) => {
                    setActiveScheduleSubmission(sub);
                    setScheduleInitialStep('payment');
                  }}
                  onExtendCreated={loadSubmissions}
                />
              ))}
            </div>
          )}
        </div>
      </div >

      {/* Modals removed and replaced by SchedulePaymentView */}

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
