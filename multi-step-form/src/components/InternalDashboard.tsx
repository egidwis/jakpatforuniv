import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { LogOut, Eye, RefreshCw, Lock, Search, Plus, Calendar, CalendarCheck, Zap, PenLine, ShieldAlert, Globe, Info, MessageCircle, Mail } from 'lucide-react';
import { getFormSubmissionsPaginated, updateFormStatus, supabase } from '../utils/supabase';
import { calculateTotalAdCost, calculateIncentiveCost, calculateDiscount } from '../utils/cost-calculator';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { SchedulePaymentView } from './SchedulePaymentView';
import { EditCriteriaModal } from './EditCriteriaModal';
import { EditFormDetailsModal } from './EditFormDetailsModal';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageBuilderModal } from './PageBuilder/PageBuilderModal';
import { CreditCard, Clock } from 'lucide-react';
import './InternalDashboard.css';

interface SurveySubmission {
  id: string;
  formId: string;
  formTitle: string;
  formUrl: string;
  researcherName: string;
  researcherEmail: string;
  submittedAt: string;
  questionCount: number;
  responseCount?: number;
  status?: string;
  payment_status?: string;
  total_cost?: number;
  phone_number?: string;
  education?: string;
  university?: string;
  department?: string;
  submission_method?: string;
  detected_keywords?: string[];
  leads?: string;
  voucher_code?: string;
  has_transactions?: boolean;
  prize_per_winner?: number;
  winnerCount?: number;
  criteria?: string;
  duration?: number;
  start_date?: string;
  end_date?: string;
  slot_booked_by?: string;
  slot_reserved_at?: string;
  admin_notes?: string;
  submission_status?: string;
}

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

  const [paymentStates, setPaymentStates] = useState<Record<string, {
    hasInvoices: boolean;
    latestStatus: 'pending' | 'paid' | 'completed' | 'expired' | null;
    invoiceCount: number;
    latestPaymentUrl: string | null;
  }>>({});

  // Edit Criteria Modal State
  const [isEditCriteriaModalOpen, setIsEditCriteriaModalOpen] = useState(false);
  const [selectedSubmissionForCriteria, setSelectedSubmissionForCriteria] = useState<SurveySubmission | null>(null);

  // Edit Form Details Modal State
  const [isEditFormDetailsModalOpen, setIsEditFormDetailsModalOpen] = useState(false);
  const [selectedSubmissionForDetails, setSelectedSubmissionForDetails] = useState<SurveySubmission | null>(null);

  // Rejection Dialog State
  const [isRejectionDialogOpen, setIsRejectionDialogOpen] = useState(false);
  const [selectedSubmissionForRejection, setSelectedSubmissionForRejection] = useState<SurveySubmission | null>(null);
  const [rejectionNote, setRejectionNote] = useState('');

  // PageBuilder Modal State
  const [isPageBuilderOpen, setIsPageBuilderOpen] = useState(false);
  const [selectedSubmissionForPage, setSelectedSubmissionForPage] = useState<SurveySubmission | null>(null);
  const [pageBuilderData, setPageBuilderData] = useState<any>(null);

  // Map submission_id -> page data (slug, is_published)
  const [existingPages, setExistingPages] = useState<Record<string, { slug: string, is_published: boolean, publish_start_date: string | null, publish_end_date: string | null }>>({});

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
        endOfMonth.toISOString()
      );

      if (data) {
        const transformed: SurveySubmission[] = data.map((sub: any) => ({
          id: sub.id,
          formId: sub.id.substring(0, 8), // Mock ID from UUID
          formTitle: sub.title || 'Untitled Survey',
          formUrl: sub.survey_url,
          researcherName: sub.full_name || 'Unknown',
          researcherEmail: sub.email || 'No Email',

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
          has_transactions: false, // Default, will verify below
        }));

        // Fetch existing pages & transactions for these submissions
        if (transformed.length > 0) {
          const submissionIds = transformed.map(s => s.id);

          // 1. Fetch Pages
          const { data: pages, error: pagesError } = await supabase
            .from('survey_pages')
            .select('submission_id, slug, is_published, publish_start_date, publish_end_date')
            .in('submission_id', submissionIds);

          if (pagesError) console.error('Error fetching survey pages:', pagesError);

          if (pages) {
            const pageMap: Record<string, { slug: string, is_published: boolean, publish_start_date: string | null, publish_end_date: string | null }> = {};
            pages.forEach(p => {
              pageMap[p.submission_id] = { slug: p.slug, is_published: p.is_published, publish_start_date: p.publish_start_date, publish_end_date: p.publish_end_date };
            });
            setExistingPages(pageMap);
          }

          // 2. Fetch Transactions (Invoices) to override Supabase defaults and get true state
          const { data: transactions, error: trxError } = await supabase
            .from('transactions')
            .select('form_submission_id, status, created_at, payment_url')
            .in('form_submission_id', submissionIds)
            .order('created_at', { ascending: false });

          if (trxError) console.error('Error fetching transactions:', trxError);

          const paymentMap: Record<string, { hasInvoices: boolean, latestStatus: 'pending' | 'paid' | 'completed' | 'expired' | null, invoiceCount: number, latestPaymentUrl: string | null }> = {};

          if (transactions && transactions.length > 0) {
            transformed.forEach(sub => {
              const subTxs = transactions.filter(t => t.form_submission_id === sub.id);
              if (subTxs.length > 0) {
                sub.has_transactions = true;
                const hasPaid = subTxs.some(t => ['paid', 'completed'].includes(t.status));
                const latestStatus = hasPaid ? 'paid' : subTxs[0].status;
                // Get the latest pending payment URL for quick copy
                const latestPendingTx = subTxs.find(t => !['paid', 'completed'].includes(t.status));
                paymentMap[sub.id] = {
                  hasInvoices: true,
                  latestStatus: latestStatus,
                  invoiceCount: subTxs.length,
                  latestPaymentUrl: latestPendingTx?.payment_url || subTxs[0].payment_url || null
                };
                sub.payment_status = latestStatus;
              } else {
                paymentMap[sub.id] = { hasInvoices: false, latestStatus: null, invoiceCount: 0, latestPaymentUrl: null };
                if (sub.payment_status === 'pending') sub.payment_status = undefined;
              }
            });
          } else {
            transformed.forEach(sub => {
              paymentMap[sub.id] = { hasInvoices: false, latestStatus: null, invoiceCount: 0, latestPaymentUrl: null };
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
  }, [isAdmin, currentPage, searchQuery, currentDate]);

  const handleStatusChange = async (submissionId: string, newStatus: string) => {
    // Intercept 'rejected' status
    if (newStatus === 'rejected') {
      const submission = submissions.find(s => s.id === submissionId);
      if (submission) {
        setSelectedSubmissionForRejection(submission);
        setRejectionNote(submission.admin_notes || ''); // Pre-fill if exists
        setIsRejectionDialogOpen(true);
      }
      return;
    }

    await executeStatusUpdate(submissionId, newStatus);
  };

  const executeStatusUpdate = async (submissionId: string, newStatus: string, notes?: string) => {
    try {
      await updateFormStatus(submissionId, newStatus, notes);

      const updateState = (prev: SurveySubmission[]) =>
        prev.map(s => s.id === submissionId ? { ...s, status: newStatus, submission_status: newStatus, admin_notes: notes !== undefined ? notes : s.admin_notes } : s);

      setSubmissions(updateState);
      // filteredSubmissions will be updated by useEffect

      toast.success('Status updated successfully');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const confirmRejection = async () => {
    if (!selectedSubmissionForRejection) return;

    // Notes are optional, but recommended for rejection
    await executeStatusUpdate(selectedSubmissionForRejection.id, 'rejected', rejectionNote);

    setIsRejectionDialogOpen(false);
    setSelectedSubmissionForRejection(null);
    setRejectionNote('');
  };

  const calculateAdCost = (questionCount: number, duration: number) => {
    // Using utility function for consistency
    const totalAdCost = calculateTotalAdCost(questionCount, duration);
    const dailyRate = duration > 0 ? totalAdCost / duration : 0;

    return {
      dailyRate,
      totalAdCost
    };
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
      <div className={hideAuth ? 'p-4 pb-0 md:px-6 md:pt-4 md:pb-0 flex-1 min-h-0 flex flex-col' : 'max-w-[1400px] mx-auto w-full px-4 sm:px-6 py-6 sm:pb-0 flex-1 min-h-0 flex flex-col'}>

        <div className="bg-white p-4 rounded-xl border border-gray-100 flex flex-col gap-4 shrink-0 relative z-30 shadow-[0_4px_20px_rgb(0,0,0,0.05)]">

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
              {/* ... other code ... */}
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

        {loading ? (
          <>
            {/* Desktop Table View Skeleton - hidden on mobile */}
            <div className="hidden md:block flex-1 min-h-0 overflow-auto pb-4 pr-2">
                <Table className="min-w-[1200px] border-separate border-spacing-y-3">
                  <TableHeader className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur shadow-sm rounded-xl">
                    <TableRow className="border-none hover:bg-transparent">
                      <TableHead className="w-[80px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12 rounded-l-xl pl-4">No</TableHead>
                      <TableHead className="w-[200px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12">Contact Info</TableHead>
                      <TableHead className="w-[180px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12">Survey Page</TableHead>
                      <TableHead className="w-[150px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12">University</TableHead>
                      <TableHead className="w-[150px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12">Department</TableHead>
                      <TableHead className="w-[250px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12">Survey Topic</TableHead>
                      <TableHead className="w-[200px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12 text-center">Status</TableHead>
                      <TableHead className="w-[120px] text-xs font-bold text-gray-500 uppercase tracking-wider h-12 text-right rounded-r-xl pr-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array(5).fill(0).map((_, i) => (
                      <TableRow key={`skeleton-desktop-${i}`} className="bg-white border-none shadow-sm rounded-xl">
                        <TableCell className="align-middle py-4 border-y border-l border-gray-200 rounded-l-xl pl-4 flex items-center justify-center">
                          <div className="w-6 h-6 rounded-full bg-gray-100 animate-pulse"></div>
                        </TableCell>
                        <TableCell className="align-top py-4 border-y border-gray-200">
                          <div className="h-4 w-3/4 bg-gray-200 animate-pulse rounded mb-2"></div>
                          <div className="h-3 w-1/2 bg-gray-100 animate-pulse rounded"></div>
                        </TableCell>
                        <TableCell className="align-top py-4 border-y border-gray-200">
                          <div className="h-4 w-5/6 bg-gray-200 animate-pulse rounded mb-2"></div>
                          <div className="h-3 w-1/2 bg-gray-100 animate-pulse rounded"></div>
                        </TableCell>
                        <TableCell className="align-top py-4 border-y border-gray-200">
                          <div className="h-4 w-full bg-gray-200 animate-pulse rounded"></div>
                        </TableCell>
                        <TableCell className="align-top py-4 border-y border-gray-200">
                          <div className="h-4 w-3/4 bg-gray-200 animate-pulse rounded"></div>
                        </TableCell>
                        <TableCell className="align-top py-4 border-y border-gray-200">
                          <div className="h-4 w-full bg-gray-200 animate-pulse rounded mb-2"></div>
                          <div className="h-4 w-5/6 bg-gray-200 animate-pulse rounded"></div>
                        </TableCell>
                        <TableCell className="align-top py-4 border-y border-gray-200 text-center">
                          <div className="h-6 w-24 bg-gray-200 rounded-full animate-pulse mx-auto mb-2"></div>
                          <div className="h-3 w-16 bg-gray-100 rounded animate-pulse mx-auto"></div>
                        </TableCell>
                        <TableCell className="align-top py-4 border-y border-r border-gray-200 rounded-r-xl pr-4 text-right">
                          <div className="flex justify-end gap-2">
                            <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                            <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
            </div>

            {/* Mobile Card View Skeleton - hidden on desktop */}
            <div className="md:hidden space-y-4">
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
          </>
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
          <>
            {/* Desktop Table View - hidden on mobile */}
            <div className="hidden md:block flex-1 min-h-0 overflow-auto pb-4 pr-2">
                <Table className="min-w-[1200px] border-separate border-spacing-y-3 table-fixed">
                  <colgroup>
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '290px' }} />
                    <col style={{ width: '200px' }} />
                    <col style={{ width: '190px' }} />
                    <col style={{ width: '410px' }} />
                  </colgroup>
                  <TableHeader className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur shadow-sm rounded-xl">
                    <TableRow className="border-none hover:bg-transparent shadow-none">
                      <TableHead className="w-[110px] text-[11px] font-bold text-gray-500 uppercase tracking-wider h-10 pl-6 border-y border-l border-transparent rounded-l-xl">Submitted</TableHead>
                      <TableHead className="w-[290px] text-[11px] font-bold text-gray-500 uppercase tracking-wider h-10 border-y border-transparent">Form Details</TableHead>
                      <TableHead className="w-[200px] text-[11px] font-bold text-gray-500 uppercase tracking-wider h-10 border-y border-transparent">Criteria & Incentive</TableHead>
                      <TableHead className="w-[190px] text-[11px] font-bold text-gray-500 uppercase tracking-wider h-10 border-y border-transparent">Researcher</TableHead>
                      <TableHead className="w-[410px] text-[11px] font-bold text-gray-500 uppercase tracking-wider h-10 pl-8 pr-6 border-y border-r border-transparent rounded-r-xl">Campaign Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubmissions.map((submission) => (
                      <TableRow key={submission.id} className="bg-white hover:bg-gray-50/80 transition-shadow shadow-sm hover:shadow border-none rounded-xl group group/row">
                        {/* Submitted */}
                        <TableCell className="align-top py-4 text-xs pl-6 border-y border-l border-gray-200 rounded-l-xl">
                          <div className="flex flex-col text-gray-500">
                            <span className="font-medium text-gray-900">
                              {new Date(submission.submittedAt).toLocaleDateString('id-ID')}
                            </span>
                            <span>
                              {new Date(submission.submittedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </TableCell>

                        {/* Form Details */}
                        <TableCell className="align-top py-4 border-y border-gray-200">
                          <div className="flex flex-col gap-1.5">
                            <div>
                              <div className="flex items-start justify-between gap-2 group relative">
                                <div className="flex-1 min-w-0 pr-6">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="font-semibold text-gray-900 block mb-0.5 line-clamp-2 text-sm leading-tight cursor-help decoration-dotted decoration-gray-300 underline-offset-2 hover:underline">
                                          {submission.formTitle}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>ID: {submission.formId}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>

                                  {submission.formUrl && (
                                    <div className="flex items-center mt-0.5">
                                      <a
                                        href={submission.formUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline decoration-blue-300 underline-offset-2 transition-colors max-w-[200px]"
                                        title="Open Survey Link"
                                      >
                                        <Globe className="h-3 w-3 shrink-0" />
                                        <span className="truncate">
                                          {submission.formUrl.replace(/^https?:\/\//, '')}
                                        </span>
                                      </a>
                                    </div>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600 absolute top-0 right-0 opacity-0 group-hover/row:opacity-100 transition-opacity"
                                  onClick={() => handleOpenEditFormDetailsModal(submission)}
                                  title="Edit Form Details"
                                >
                                  <PenLine className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>

                            {/* Chips Row: Method, Qs, Duration */}
                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                              {/* Method Badge */}
                              <Badge variant="secondary" className={`
                                px-1.5 py-0 h-5 text-[10px] font-medium border rounded-full whitespace-nowrap
                                ${submission.submission_method === 'google_import'
                                  ? 'bg-orange-50 text-orange-700 border-orange-200'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'}
                              `}>
                                {submission.submission_method === 'google_import' ? 'G-Form' : 'Manual'}
                              </Badge>

                              {/* Question Count Chip */}
                              <Badge variant="outline" className="px-1.5 py-0 h-5 text-[10px] text-gray-500 bg-white border-gray-200 font-normal rounded-full whitespace-nowrap">
                                {submission.questionCount} Qs
                              </Badge>

                              {/* Duration Chip */}
                              {submission.duration ? (
                                <Badge variant="outline" className="px-1.5 py-0 h-5 text-[10px] text-gray-500 bg-white border-gray-200 font-normal rounded-full whitespace-nowrap">
                                  {submission.duration} Days
                                </Badge>
                              ) : null}

                              {/* Sensitive Badge Icon */}
                              {(submission.detected_keywords && submission.detected_keywords.length > 0) && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <ShieldAlert className="w-3.5 h-3.5 text-red-500 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Detected: {submission.detected_keywords.join(', ')}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>

                            {/* Total Ad Cost & Voucher */}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              {submission.duration && submission.duration > 0 && (
                                <div className="text-xs text-gray-900 font-medium whitespace-nowrap">
                                  <span className="text-gray-400 font-normal mr-1">Est:</span>
                                  Rp {new Intl.NumberFormat('id-ID').format(calculateAdCost(submission.questionCount, submission.duration).totalAdCost)}
                                </div>
                              )}

                              {/* Voucher Info (Moved from Payment Column) */}
                              {submission.voucher_code && (
                                <div className="flex items-center gap-1.5 animate-in slide-in-from-left-2 fade-in duration-300">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-1 text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full border border-purple-100 cursor-help hover:bg-purple-100 transition-colors">
                                          <Zap className="w-3 h-3 fill-purple-600" />
                                          <span>{submission.voucher_code}</span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <div className="space-y-1 text-xs">
                                          <p className="font-semibold text-purple-700">Voucher Applied</p>
                                          <p>Discount: <span className="font-bold text-emerald-600">-Rp {new Intl.NumberFormat('id-ID').format(
                                            calculateDiscount(
                                              submission.voucher_code,
                                              calculateTotalAdCost(submission.questionCount || 0, submission.duration || 0),
                                              calculateIncentiveCost(submission.winnerCount || 0, submission.prize_per_winner || 0),
                                              submission.duration || 0
                                            )
                                          )}</span></p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              )}
                            </div>

                            {/* Status Footer */}
                            <div className="mt-1 pt-2 border-t border-gray-100/60">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Review Status:</span>
                                {(() => {
                                  // Map post-approved & legacy schedule statuses to "approved" for display
                                  const getDisplayStatus = (status: string | undefined) => {
                                    const s = status || 'pending';
                                    if (['approved', 'slot_reserved', 'waiting_payment', 'paid', 'scheduled', 'live', 'completed'].includes(s)) return 'approved';
                                    return s;
                                  };
                                  const displayStatus = getDisplayStatus(submission.status);
                                  return (
                                    <>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" className="h-auto p-0 hover:bg-transparent">
                                            <div
                                              className={`
                                                cursor-pointer px-3 py-1 rounded-md text-[10px] items-center justify-center uppercase tracking-wide font-bold border transition-all shadow-sm hover:shadow flex gap-1.5
                                                ${displayStatus === 'approved' ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' :
                                                  displayStatus === 'rejected' ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100' :
                                                    displayStatus === 'in_review' ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100' :
                                                      'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'}
                                              `}
                                            >
                                              {displayStatus === 'in_review' ? 'Need Review' : (displayStatus.replace('_', ' '))}
                                              <ChevronDown className="w-3 h-3 opacity-70" />
                                            </div>
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start">
                                          <DropdownMenuItem onClick={() => handleStatusChange(submission.id, 'in_review')}>
                                            Need Review
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleStatusChange(submission.id, 'approved')}>
                                            Approved
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleStatusChange(submission.id, 'rejected')} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                                            Rejected
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleStatusChange(submission.id, 'spam')} className="text-gray-600">
                                            Spam / Revision
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>

                                      {/* Admin Notes Display */}
                                      {displayStatus === 'rejected' && submission.admin_notes && (
                                        <TooltipProvider>
                                          <Tooltip delayDuration={300}>
                                            <TooltipTrigger asChild>
                                              <div className="flex items-center justify-center text-xs text-red-600 bg-red-50 p-1 rounded border border-red-100 cursor-help transition-colors hover:bg-red-100 ml-1">
                                                <Info className="w-3.5 h-3.5 shrink-0" />
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-[400px] bg-white p-3 shadow-xl border-red-100 text-slate-700">
                                              <p className="font-semibold text-xs text-red-600 mb-1">Rejection Reason:</p>
                                              <p className="text-sm leading-relaxed">{submission.admin_notes}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Criteria & Incentive */}
                        <TableCell className="align-top py-4 border-y border-gray-200">
                          <div className="flex flex-col gap-2">
                            {submission.criteria ? (
                              <div className="relative group/criteria">
                                <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">Criteria:</div>
                                <p className="text-xs text-gray-600 line-clamp-3 mb-1 pr-6" title={submission.criteria}>
                                  {submission.criteria || '-'}
                                </p>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600 absolute top-0 right-0 opacity-0 group-hover/row:opacity-100 transition-opacity bg-white/80"
                                  onClick={() => handleOpenEditCriteriaModal(submission)}
                                  title="Edit Criteria"
                                >
                                  <PenLine className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between text-xs text-gray-400 italic bg-gray-50 px-2 py-1.5 rounded border border-dashed border-gray-200">
                                <span>Target not set</span>
                                <button
                                  onClick={() => handleOpenEditCriteriaModal(submission)}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  <PenLine className="w-3 h-3" />
                                </button>
                              </div>
                            )}

                            {submission.prize_per_winner ? (
                              <div className="mt-2 text-left">
                                <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">Incentive:</div>
                                <div className="flex flex-wrap gap-1.5 mb-1.5">
                                  <Badge variant="outline" className="px-1.5 py-0 h-5 text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 font-medium rounded-full whitespace-nowrap">
                                    Rp {submission.prize_per_winner.toLocaleString('id-ID')}
                                  </Badge>
                                  <Badge variant="outline" className="px-1.5 py-0 h-5 text-[10px] text-gray-500 bg-white border-gray-200 font-normal rounded-full whitespace-nowrap">
                                    {submission.winnerCount || 0} user
                                  </Badge>
                                </div>

                                <div className="text-xs text-gray-900 font-medium">
                                  <span className="text-gray-400 font-normal mr-1">Total:</span>
                                  Rp {((submission.prize_per_winner || 0) * (submission.winnerCount || 0)).toLocaleString('id-ID')}
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 text-[10px] text-gray-400 italic">
                                <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1 not-italic">Incentive:</div>
                                No incentive
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Researcher */}
                        <TableCell className="align-top py-4 border-y border-gray-200">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-semibold text-gray-900 leading-tight">
                              {submission.researcherName}
                            </span>

                            <div className="flex flex-col mt-1.5">
                              <div className="flex items-center gap-2 mb-2">
                                {submission.phone_number && (
                                  <TooltipProvider>
                                    <Tooltip delayDuration={200}>
                                      <TooltipTrigger asChild>
                                        <a
                                          href={`https://wa.me/${submission.phone_number.replace(/^0/, '62')}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center justify-center p-1.5 rounded text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 transition-colors border border-green-100"
                                        >
                                          <MessageCircle className="w-3.5 h-3.5" />
                                        </a>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        <p className="text-xs font-medium">{submission.phone_number}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}

                                {submission.researcherEmail && (
                                  <TooltipProvider>
                                    <Tooltip delayDuration={200}>
                                      <TooltipTrigger asChild>
                                        <a
                                          href={`mailto:${submission.researcherEmail}`}
                                          className="inline-flex items-center justify-center p-1.5 rounded text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-100"
                                        >
                                          <Mail className="w-3.5 h-3.5" />
                                        </a>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        <p className="text-xs font-medium">{submission.researcherEmail}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>

                              {(submission.education || submission.department || submission.university) && (
                                <div className="mt-1.5 pt-1.5 border-t border-gray-100/80 flex flex-col gap-0.5">
                                  {submission.education && (
                                    <span className="inline-flex w-fit items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-purple-50 text-purple-700 border border-purple-100 capitalize">
                                      {submission.education.replace(/_/g, ' ')}
                                    </span>
                                  )}
                                  {submission.department && (
                                    <span className="text-[10px] text-gray-500">{submission.department}</span>
                                  )}
                                  {submission.university && (
                                    <span className="text-[10px] text-gray-500">{submission.university}</span>
                                  )}
                                </div>
                              )}

                              {submission.leads && (
                                <div className="text-[10px] text-gray-400 mt-1.5 pt-1.5 border-t border-gray-100/80 leading-tight">
                                  Lead: <span className="capitalize">{submission.leads.replace(/_/g, ' ')}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Campaign Actions */}
                        <TableCell className="align-top py-4 space-y-2 pl-8 pr-6 border-y border-r border-gray-200 rounded-r-xl">
                          {(() => {
                            const hasSchedule = scheduledSubmissionIds.has(submission.id);
                            const paymentData = paymentStates[submission.id] || { hasInvoices: false, latestStatus: null, invoiceCount: 0 };
                            const isPaid = ['paid', 'completed'].includes(paymentData.latestStatus || submission.payment_status || '');
                            const isRejectedEvent = ['rejected', 'spam'].includes(submission.submission_status || '');
                            const isLegacyActive = ['live', 'completed', 'scheduled'].includes(submission.status || '');
                            // If rejected, or if slot is cleared (expired), don't show active "Waiting Payment"
                            const isPending = !isPaid && paymentData.hasInvoices && !isRejectedEvent && (hasSchedule || isLegacyActive);

                            // 1. Reserve Slot Button
                            let reserveBtn;
                            const RESERVABLE_STATUSES = ['approved', 'slot_reserved', 'waiting_payment', 'paid', 'scheduled', 'live', 'completed'];
                            const canReserveSlot = RESERVABLE_STATUSES.includes(submission.submission_status || '') || isLegacyActive;

                            if (hasSchedule || isLegacyActive) {
                              reserveBtn = (
                                <div className="flex items-center gap-1.5 w-full">
                                    <div className="flex-1 flex flex-col justify-center px-2.5 min-h-[32px] py-1 bg-gray-50/80 border border-gray-200/70 rounded-md">
                                      <div className="flex items-center gap-1.5 w-full">
                                        <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                        <CalendarCheck className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                        <span className="text-xs font-medium text-gray-700 tracking-wide truncate">
                                          {isLegacyActive && !hasSchedule ? 'Scheduled (Legacy)' : 'Slot Reserved'}
                                        </span>
                                      </div>
                                      
                                      {/* Display if booked by User along with expiration status */}
                                      {submission.slot_booked_by === 'user' && (
                                        <div className="flex items-center gap-1 pl-3.5 mt-0.5">
                                          <span className="text-[9px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded border border-blue-100 font-bold tracking-wide shadow-sm">By User</span>
                                          {submission.slot_reserved_at ? (() => {
                                            const reservedAt = new Date(submission.slot_reserved_at).getTime();
                                            const isExpired = submission.payment_status === 'expired' || Date.now() > (reservedAt + 60_000);
                                            return isExpired ? (
                                              <span className="text-[9px] text-red-600 bg-red-50 border border-red-100 px-1 py-0.5 rounded flex items-center font-bold tracking-wide">
                                                Expired
                                              </span>
                                            ) : (
                                              <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-100 px-1 py-0.5 rounded flex items-center gap-0.5 font-bold tracking-wide">
                                                <Clock className="w-2.5 h-2.5" />
                                                &lt;1h left
                                              </span>
                                            );
                                          })() : null}
                                        </div>
                                      )}
                                    </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 h-8 w-8 p-0 text-gray-500 hover:text-blue-600 border-gray-200 hover:border-blue-200 hover:bg-blue-50 transition-colors shadow-sm"
                                    onClick={() => {
                                      setActiveScheduleSubmission(submission);
                                      setScheduleInitialStep('schedule');
                                    }}
                                    title="Edit Schedule"
                                  >
                                    <PenLine className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              );
                            } else {
                              reserveBtn = (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="w-full">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={!canReserveSlot}
                                          className={`w-full justify-start h-8 text-xs font-medium shadow-sm transition-all ${
                                            canReserveSlot
                                              ? 'text-gray-600 hover:text-blue-600 border-gray-200 hover:border-blue-200 bg-white'
                                              : 'text-gray-400 border-gray-100 bg-gray-50 cursor-not-allowed'
                                          }`}
                                          onClick={() => {
                                            setActiveScheduleSubmission(submission);
                                            setScheduleInitialStep('schedule');
                                          }}
                                        >
                                          <Calendar className={`w-3.5 h-3.5 mr-2 shrink-0 ${canReserveSlot ? 'text-blue-500' : 'text-gray-400'}`} />
                                          Reserve Slot
                                        </Button>
                                      </div>
                                    </TooltipTrigger>
                                    {!canReserveSlot && (
                                      <TooltipContent side="top">
                                        <p className="text-xs">Submission was not approved yet.</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            }

                            // 2. Payment Button
                            let paymentBtn;
                            if (isPaid) {
                              paymentBtn = (
                                <div className="flex items-center gap-1.5 w-full">
                                  <div className="flex-1 flex items-center justify-start gap-1.5 px-2.5 h-8 bg-green-50/80 border border-green-200/70 rounded-md truncate">
                                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                                    <CreditCard className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                    <span className="text-xs font-medium text-green-700 tracking-wide truncate">Paid</span>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 h-8 w-8 p-0 text-gray-500 hover:text-green-600 border-gray-200 hover:border-green-200 hover:bg-green-50 transition-colors shadow-sm"
                                    onClick={() => {
                                      setActiveScheduleSubmission(submission);
                                      setScheduleInitialStep('payment');
                                    }}
                                    title="Add Additional Payment"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                </div>
                              );
                            } else if (paymentData.latestStatus === 'expired' || submission.payment_status === 'expired') {
                              // Payment Expired — user slot timed out
                              paymentBtn = (
                                <div className="flex items-center gap-1.5 w-full">
                                  <div className="flex-1 flex items-center justify-start gap-1.5 px-2.5 h-8 bg-red-50/80 border border-red-200/70 rounded-md truncate">
                                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                    <CreditCard className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                    <span className="text-xs font-medium text-red-700 tracking-wide truncate">Payment Expired</span>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 h-8 w-8 p-0 text-gray-500 hover:text-red-600 border-gray-200 hover:border-red-200 hover:bg-red-50 transition-colors shadow-sm"
                                    onClick={() => {
                                      setActiveScheduleSubmission(submission);
                                      setScheduleInitialStep('payment');
                                    }}
                                    title="View / Create New Payment"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                </div>
                              );
                            } else if (isPending) {
                              paymentBtn = (
                                <div className="flex items-center gap-1.5 w-full">
                                  <button
                                    className="flex-1 flex items-center justify-start gap-1.5 px-2.5 h-8 bg-amber-50/80 border border-amber-200/70 rounded-md truncate cursor-pointer hover:bg-amber-100/80 transition-colors"
                                    onClick={() => {
                                      const url = paymentData.latestPaymentUrl;
                                      if (url) {
                                        navigator.clipboard.writeText(url);
                                        toast.success('Payment link copied!');
                                      }
                                    }}
                                    title={paymentData.latestPaymentUrl ? 'Click to copy payment link' : 'No payment link'}
                                  >
                                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
                                    <CreditCard className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                    <span className="text-xs font-medium text-amber-700 tracking-wide truncate">Waiting Payment</span>
                                  </button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 h-8 w-8 p-0 text-gray-500 hover:text-amber-600 border-gray-200 hover:border-amber-200 hover:bg-amber-50 transition-colors shadow-sm"
                                    onClick={() => {
                                      setActiveScheduleSubmission(submission);
                                      setScheduleInitialStep('payment');
                                    }}
                                    title="Add / View Payment"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </Button>
                                </div>
                              );
                            } else {
                              const canPay = (hasSchedule || isLegacyActive) && !isRejectedEvent;
                              const payTooltip = isRejectedEvent
                                ? 'Submission was rejected.'
                                : 'Reserve a slot first.';
                              paymentBtn = (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="w-full">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={!canPay}
                                          className={`w-full justify-start h-8 text-xs font-medium shadow-sm transition-all ${canPay ? 'text-gray-600 hover:text-emerald-600 border-gray-200 hover:border-emerald-200 bg-white relative' : 'text-gray-400 border-gray-100 bg-gray-50'}`}
                                          onClick={() => {
                                            setActiveScheduleSubmission(submission);
                                            setScheduleInitialStep('payment');
                                          }}
                                        >
                                          {canPay && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />}
                                          <CreditCard className={`w-3.5 h-3.5 mr-2 shrink-0 ${canPay ? 'text-emerald-500' : 'text-gray-400'}`} />
                                          Payment
                                        </Button>
                                      </div>
                                    </TooltipTrigger>
                                    {!canPay && (
                                      <TooltipContent side="top">
                                        <p className="text-xs">{payTooltip}</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            }

                            // 3. Page Button
                            let pageBtn;
                            const canBuildPage = isPaid || isLegacyActive;
                            
                            if (existingPages[submission.id]) {
                              const page = existingPages[submission.id];
                              const now = new Date();
                              const startDate = page.publish_start_date ? new Date(page.publish_start_date) : null;
                              const endDate = page.publish_end_date ? new Date(page.publish_end_date) : null;

                              let statusLabel = 'Drafted';
                              let dotColor = 'bg-gray-400';
                              let pillStyle = 'bg-gray-50/80 border-gray-200/70 text-gray-600';
                              if (page.is_published) {
                                if (endDate && endDate < now) {
                                  statusLabel = 'Completed';
                                } else if (startDate && startDate > now) {
                                  statusLabel = 'Scheduled';
                                  dotColor = 'bg-blue-500 animate-pulse';
                                  pillStyle = 'bg-blue-50/80 border-blue-200/70 text-blue-700';
                                } else {
                                  statusLabel = 'Live';
                                  dotColor = 'bg-green-500 animate-pulse';
                                  pillStyle = 'bg-green-50/80 border-green-200/70 text-green-700';
                                }
                              }
                              pageBtn = (
                                <div className="flex items-center gap-1.5 w-full">
                                  <div className={`flex-1 flex items-center justify-start gap-1.5 px-2.5 h-8 border rounded-md truncate ${pillStyle}`}>
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                                    <Globe className="w-3.5 h-3.5 shrink-0 opacity-60" />
                                    <span className="text-xs font-medium tracking-wide truncate">{statusLabel}</span>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 h-8 w-8 p-0 text-gray-500 hover:text-indigo-600 border-gray-200 hover:border-indigo-200 hover:bg-indigo-50 transition-colors shadow-sm"
                                    onClick={() => handleOpenPageBuilder(submission)}
                                    title="Edit Page"
                                  >
                                    <PenLine className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              );
                            } else {
                              pageBtn = (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="w-full">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={!canBuildPage}
                                          className={`w-full justify-start h-8 text-xs font-medium shadow-sm transition-all ${canBuildPage ? 'text-gray-600 hover:text-indigo-600 border-gray-200 hover:border-indigo-200 bg-white relative' : 'text-gray-400 border-gray-100 bg-gray-50'}`}
                                          onClick={() => handleOpenPageBuilder(submission)}
                                        >
                                          {canBuildPage && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />}
                                          <Globe className={`w-3.5 h-3.5 mr-2 shrink-0 ${canBuildPage ? 'text-indigo-400' : ''}`} />
                                          <span className="truncate">Page</span>
                                        </Button>
                                      </div>
                                    </TooltipTrigger>
                                    {!canBuildPage && (
                                      <TooltipContent>
                                        <p>Payment required first</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            }

                            return (
                              <div className="flex flex-col gap-2 w-full max-w-[180px]">
                                {reserveBtn}
                                {paymentBtn}
                                {pageBtn}
                              </div>
                            );
                          })()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination Controls */}
                < div className="flex items-center justify-between px-4 py-4 border-t mt-4" >
                  <div className="text-sm text-gray-500">
                    Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalSubmissions)} of {totalSubmissions} results
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1 || loading}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <div className="text-sm font-medium">Page {currentPage}</div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => prev + 1)}
                      disabled={currentPage * pageSize >= totalSubmissions || loading}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div >
            </div >

            {/* Mobile Card View - shown only on mobile */}
            < div className="md:hidden space-y-4" >
              {
                filteredSubmissions.map((submission) => (
                  <Card key={submission.id} className="border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-4 space-y-4">
                      {/* Header */}
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1 flex-1">
                          <h3 className="font-semibold text-gray-900 leading-tight">
                            {submission.formTitle}
                          </h3>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                              {submission.formId.substring(0, 8)}...
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 -mt-1 -mr-2 text-gray-400"
                          onClick={() => window.open(submission.formUrl, '_blank')}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Researcher */}
                      <div className="flex items-center gap-3 py-3 border-y border-gray-100">
                        <div className="flex-1">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Researcher</p>
                          <p className="font-medium text-gray-900 text-sm">{submission.researcherName}</p>
                          <p className="text-xs text-gray-500">{submission.researcherEmail}</p>
                        </div>
                      </div>

                      {/* Mobile Stats & Status Rows */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Date</p>
                          <p className="text-sm text-gray-900">{new Date(submission.submittedAt).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right pl-4 border-l border-gray-100">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Items</p>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                              {submission.questionCount} Qs
                            </Badge>
                            {submission.duration ? (
                              <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-blue-600 bg-blue-50 border-blue-100">
                                {submission.duration} Days
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Actions Row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-500">Status</label>
                          <select
                            className={`w-full px-3 py-2 text-xs font-medium rounded-lg border-0 cursor-pointer transition-all focus:ring-2 ${submission.status === 'spam' ? 'bg-red-100 text-red-700 focus:ring-red-500' :
                              submission.status === 'in_review' ? 'bg-blue-100 text-blue-700 focus:ring-blue-500' :
                                submission.status === 'rejected' ? 'bg-red-100 text-red-700 focus:ring-red-500' :
                                  submission.status === 'approved' ? 'bg-green-100 text-green-700 focus:ring-green-500' :
                                    'bg-gray-100 text-gray-800'
                              }`}
                            value={submission.status || 'in_review'}
                            onChange={(e) => handleStatusChange(submission.id, e.target.value)}
                          >
                            <option value="spam" className="bg-white text-gray-900">Spam</option>
                            <option value="in_review" className="bg-white text-gray-900">In Review</option>
                            <option value="approved" className="bg-white text-gray-900">Approved</option>
                            <option value="rejected" className="bg-white text-gray-900">Rejected</option>
                          </select>
                        </div>
                      </div>

                      {/* Campaign Actions Area */}
                      <div className="space-y-3 mt-3 pt-3 border-t border-gray-100">
                          {(() => {
                            const hasSchedule = scheduledSubmissionIds.has(submission.id);
                            const paymentData = paymentStates[submission.id] || { hasInvoices: false, latestStatus: null, invoiceCount: 0 };
                            
                            const isPaid = ['paid', 'completed'].includes(paymentData.latestStatus || submission.payment_status || '');
                            const isRejectedEvent = ['rejected', 'spam'].includes(submission.submission_status || '');
                            const isLegacyActive = ['live', 'completed', 'scheduled'].includes(submission.status || '');
                            const isPending = !isPaid && paymentData.hasInvoices && !isRejectedEvent && (hasSchedule || isLegacyActive);

                            // 1. Reserve Slot Button
                            let reserveBtn;
                            if (hasSchedule || isLegacyActive) {
                              reserveBtn = (
                                <div className="flex items-center gap-1.5 w-full">
                                  <div className="flex-1 flex items-center justify-start gap-1.5 px-2.5 h-8 bg-gray-50/80 border border-gray-200/70 rounded-md">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                                    <CalendarCheck className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                    <span className="text-xs font-medium text-gray-700 tracking-wide truncate">{isLegacyActive && !hasSchedule ? 'Scheduled' : 'Slot Reserved'}</span>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 h-8 w-8 p-0 text-gray-500 hover:text-blue-600 border-gray-200 bg-white"
                                    onClick={() => {
                                      setActiveScheduleSubmission(submission);
                                      setScheduleInitialStep('schedule');
                                    }}
                                  >
                                    <PenLine className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              );
                            } else {
                              reserveBtn = (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full justify-center h-8 text-xs font-medium shadow-sm transition-all text-gray-600 hover:text-blue-600 border-gray-200 bg-white"
                                  onClick={() => {
                                    setActiveScheduleSubmission(submission);
                                    setScheduleInitialStep('schedule');
                                  }}
                                >
                                  <Calendar className="w-3.5 h-3.5 mr-2 shrink-0 text-blue-500" />
                                  Reserve Slot
                                </Button>
                              );
                            }

                            return (
                              <div className="flex flex-col gap-2">
                                {/* Actions Area */}
                                {reserveBtn}
                                
                                <div className="grid grid-cols-2 gap-2 w-full">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!hasSchedule && !isLegacyActive}
                                    className={`w-full justify-center h-8 text-xs font-medium shadow-sm transition-all ${
                                      (hasSchedule || isLegacyActive) ? 'text-gray-600 hover:text-emerald-600 border-gray-200 bg-white relative' : 'text-gray-400 border-gray-100 bg-gray-50'
                                    }`}
                                    onClick={() => {
                                      setActiveScheduleSubmission(submission);
                                      setScheduleInitialStep('payment');
                                    }}
                                  >
                                    <CreditCard className="w-3.5 h-3.5 mr-1" />
                                    {isPaid ? 'Paid' : (paymentData.latestStatus === 'expired' || submission.payment_status === 'expired') ? 'Expired' : isPending ? 'Pending' : 'Payment'}
                                    {!isPaid && !isPending && (hasSchedule || isLegacyActive) && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
                                  </Button>

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!isPaid && !isLegacyActive}
                                    className={`w-full justify-center h-8 text-xs font-medium shadow-sm transition-all ${
                                      (isPaid || isLegacyActive) ? 'text-gray-600 hover:text-indigo-600 border-gray-200 bg-white relative' : 'text-gray-400 border-gray-100 bg-gray-50'
                                    }`}
                                    onClick={() => handleOpenPageBuilder(submission)}
                                  >
                                    <Globe className="w-3.5 h-3.5 mr-1" />
                                    Pages
                                    {!existingPages[submission.id] && (isPaid || isLegacyActive) && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
                                  </Button>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                    </div>
                  </Card>
                ))
              }
            </div >
          </>
        )
        }
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

      {/* Rejection Note Dialog */}
      <Dialog open={isRejectionDialogOpen} onOpenChange={setIsRejectionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this submission. This note will be visible to admins.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rejection-note">Admin Notes (Reason)</Label>
              <Textarea
                id="rejection-note"
                placeholder="e.g. Duplicate submission, Invalid survey link..."
                value={rejectionNote}
                onChange={(e) => setRejectionNote(e.target.value)}
                className="h-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectionDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmRejection}>Confirm Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
