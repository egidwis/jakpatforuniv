import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { LogOut, Eye, RefreshCw, Lock, Search, Plus, Calendar, Zap, PenLine, ShieldAlert, GraduationCap } from 'lucide-react';
import { getFormSubmissionsPaginated, updateFormStatus, supabase } from '../utils/supabase';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { CreateInvoiceModal } from './CreateInvoiceModal';
import { CopyInvoiceDropdown } from './CopyInvoiceDropdown';
import { PublishAdsModal } from './PublishAdsModal';
import { EditCriteriaModal } from './EditCriteriaModal';
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
  prize_per_winner?: number;
  winnerCount?: number;
  criteria?: string;
  duration?: number;
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

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50); // Default 50 items per page
  const [totalSubmissions, setTotalSubmissions] = useState(0);

  // Login State
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // Invoice modal state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<SurveySubmission | null>(null);
  const [invoiceRefreshTrigger, setInvoiceRefreshTrigger] = useState(0);

  // Publish Ads Modal State
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [selectedSubmissionForAds, setSelectedSubmissionForAds] = useState<SurveySubmission | null>(null);

  // Edit Criteria Modal State
  const [isEditCriteriaModalOpen, setIsEditCriteriaModalOpen] = useState(false);
  const [selectedSubmissionForCriteria, setSelectedSubmissionForCriteria] = useState<SurveySubmission | null>(null);

  // Admin Access Check
  // STRICT: Only product@jakpat.net is allowed
  const allowedEmails = ['product@jakpat.net'];
  const isAdmin = (user?.email && allowedEmails.includes(user.email)) ||
    hideAuth; // Trust parent if hideAuth is true

  useEffect(() => {
    if (isAdmin) {
      loadSubmissions();
    }
  }, [isAdmin, currentPage, searchQuery]);

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
      // Use paginated fetch
      const { data, count } = await getFormSubmissionsPaginated(currentPage, pageSize, searchQuery);

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
          payment_status: sub.payment_status || 'pending',
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
          duration: sub.duration || 0,
        }));
        setSubmissions(transformed);
        setFilteredSubmissions(transformed); // Since handle search handles querying, these are same
        setTotalSubmissions(count || 0);
      }
    } catch (error) {
      toast.error('Failed to load submissions');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (submissionId: string, newStatus: string) => {
    try {
      await updateFormStatus(submissionId, newStatus);

      const updateState = (prev: SurveySubmission[]) =>
        prev.map(s => s.id === submissionId ? { ...s, status: newStatus } : s);

      setSubmissions(updateState);
      setFilteredSubmissions(updateState);

      toast.success('Status updated successfully');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const calculateAdCost = (questionCount: number, duration: number) => {
    let dailyRate = 0;
    if (questionCount <= 15) dailyRate = 150000;
    else if (questionCount <= 30) dailyRate = 200000;
    else if (questionCount <= 50) dailyRate = 300000;
    else if (questionCount <= 70) dailyRate = 400000;
    else dailyRate = 500000;

    return {
      dailyRate,
      totalAdCost: dailyRate * duration
    };
  };

  const handleOpenInvoiceModal = (submission: SurveySubmission) => {
    setSelectedSubmission(submission);
    setIsInvoiceModalOpen(true);
  };

  const handleCloseInvoiceModal = () => {
    setIsInvoiceModalOpen(false);
    setSelectedSubmission(null);
  };

  const handleInvoiceCreated = () => {
    setInvoiceRefreshTrigger(prev => prev + 1);
    loadSubmissions();
  };

  const handleClosePublishModal = () => {
    setIsPublishModalOpen(false);
    setSelectedSubmissionForAds(null);
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Not Logged In -> Show Login Screen
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
            Your email ({user?.email}) is not authorized to access the Internal Dashboard.
          </p>
          <Button onClick={handleLogout} variant="destructive">
            Log Out
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={hideAuth ? '' : 'min-h-screen bg-background'}>
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
      <div className={hideAuth ? 'p-4 md:px-6 md:py-4' : 'max-w-[1400px] mx-auto px-4 sm:px-6 py-6'}>
        {/* Toolbar - Search & Actions */}
        <div className="flex items-center justify-between gap-4 mb-6 bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
          {/* Left: Search */}
          <div className="flex-1 max-w-3xl relative min-w-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by ID, Title, or Researcher..."
              className="w-full pl-10 bg-white border-gray-200 focus:border-blue-500 transition-all h-9"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={loadSubmissions}
              variant="outline"
              size="sm"
              disabled={loading}
              className="h-9 w-9 p-0 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-gray-200"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            {/* Filter placeholder */}
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-gray-200"
              title="Filter (Coming Soon)"
            >
              <div className="w-4 h-4 flex flex-col justify-center gap-0.5 items-center">
                <div className="w-3 h-0.5 bg-current rounded-full"></div>
                <div className="w-2 h-0.5 bg-current rounded-full"></div>
                <div className="w-1 h-0.5 bg-current rounded-full"></div>
              </div>
            </Button>
          </div>
        </div>

        {/* Search Results Counter */}
        {searchQuery && (
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              Found {filteredSubmissions.length} result{filteredSubmissions.length !== 1 ? 's' : ''} for "{searchQuery}"
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <RefreshCw className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">Loading submissions...</p>
            </div>
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
          <>
            {/* Desktop Table View - hidden on mobile */}
            <Card className="hidden md:block shadow-sm border-gray-200">
              <div className="overflow-x-auto">
                <Table className="min-w-[1200px]">
                  <TableHeader className="bg-gray-50/50">
                    <TableRow className="border-b border-gray-100">
                      <TableHead className="w-[300px] text-xs font-bold text-gray-500 uppercase tracking-wider h-10">Form Details</TableHead>
                      <TableHead className="w-[180px] text-xs font-bold text-gray-500 uppercase tracking-wider h-10">Criteria & Incentive</TableHead>
                      <TableHead className="w-[250px] text-xs font-bold text-gray-500 uppercase tracking-wider h-10">Researcher</TableHead>
                      <TableHead className="w-[100px] text-xs font-bold text-gray-500 uppercase tracking-wider h-10">Submitted</TableHead>
                      <TableHead className="w-[100px] text-xs font-bold text-gray-500 uppercase tracking-wider h-10">Status</TableHead>
                      <TableHead className="w-[180px] text-xs font-bold text-gray-500 uppercase tracking-wider h-10">Payment</TableHead>
                      <TableHead className="w-[150px] text-right text-xs font-bold text-gray-500 uppercase tracking-wider h-10 pr-6">Ad Publishing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubmissions.map((submission) => (
                      <TableRow key={submission.id} className="hover:bg-gray-50/50 transition-colors group">
                        {/* Form Details */}
                        <TableCell className="align-top py-4">
                          <div className="flex flex-col gap-2">
                            <div>
                              <span className="font-semibold text-gray-900 block mb-0.5 line-clamp-2" title={submission.formTitle}>
                                {submission.formTitle}
                              </span>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                {submission.formUrl && (
                                  <a
                                    href={submission.formUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 hover:text-blue-600 transition-colors bg-gray-100 px-1.5 py-0.5 rounded"
                                    title="Open Survey Link"
                                  >
                                    {submission.formId.substring(0, 8)}...
                                    <Eye className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {/* Method Badge */}
                              <Badge variant="secondary" className={`
                                px-1.5 py-0 text-[10px] font-medium border
                                ${submission.submission_method === 'google_import'
                                  ? 'bg-orange-50 text-orange-700 border-orange-200'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'}
                              `}>
                                {submission.submission_method === 'google_import' ? 'G-Form' : 'Manual'}
                              </Badge>

                              {/* Sensitive Badge */}
                              {(submission.detected_keywords && submission.detected_keywords.length > 0) && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="destructive" className="px-1.5 py-0 text-[10px] font-medium bg-red-50 text-red-700 border-red-200 border cursor-help">
                                        <ShieldAlert className="w-3 h-3 mr-1" />
                                        Sensitive
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Detected: {submission.detected_keywords.join(', ')}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              {/* Question Count */}
                              <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-gray-500 border-gray-200">
                                {submission.questionCount} Qs
                              </Badge>

                              {/* Duration */}
                              {submission.duration ? (
                                <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-blue-600 bg-blue-50 border-blue-100">
                                  {submission.duration} Days
                                </Badge>
                              ) : null}
                            </div>

                            {/* Ad Cost Breakdown */}
                            {submission.duration && submission.duration > 0 && (
                              <div className="flex flex-col gap-0.5 mt-1 border-t border-dashed border-gray-200 pt-1">
                                <span className="text-[10px] text-gray-500 uppercase font-medium">Est. Ad Cost</span>
                                <div className="text-[10px] text-gray-600">
                                  {(() => {
                                    const { dailyRate, totalAdCost } = calculateAdCost(submission.questionCount, submission.duration);
                                    return (
                                      <>
                                        <span>{new Intl.NumberFormat('id-ID').format(dailyRate)}/day</span>
                                        <span className="mx-1">x</span>
                                        <span>{submission.duration}d</span>
                                        <div className="font-semibold text-gray-900 mt-0.5">
                                          = Rp {new Intl.NumberFormat('id-ID').format(totalAdCost)}
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Criteria & Incentive */}
                        <TableCell className="align-top py-4">
                          <div className="flex flex-col gap-1.5">
                            {submission.criteria ? (
                              <div className="text-xs text-gray-700 bg-gray-50 px-2 py-1.5 rounded border border-gray-100 max-w-[200px] whitespace-pre-wrap">
                                {submission.criteria}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-400 italic">Target not set</div>
                            )}
                            {submission.prize_per_winner ? (
                              <div className="flex flex-col gap-1">
                                <div className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded w-fit border border-emerald-100">
                                  Rp {submission.prize_per_winner.toLocaleString('id-ID')} / user
                                </div>
                                {submission.winnerCount && submission.winnerCount > 0 && (
                                  <div className="flex flex-col gap-0.5">
                                    <div className="text-[10px] text-gray-500 font-medium">
                                      x {submission.winnerCount} Winners
                                    </div>
                                    <div className="text-xs font-bold text-gray-900">
                                      Total: Rp {((submission.prize_per_winner || 0) * submission.winnerCount).toLocaleString('id-ID')}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-400 border border-dashed border-gray-300 px-2 py-1 rounded w-fit">
                                No incentive
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] text-blue-600 hover:text-blue-700 hover:bg-blue-50 w-fit px-2 -ml-2"
                              onClick={() => handleOpenEditCriteriaModal(submission)}
                            >
                              <PenLine className="w-3 h-3 mr-1" /> Edit Criteria
                            </Button>
                          </div>
                        </TableCell>

                        {/* Researcher */}
                        <TableCell className="align-top py-4">
                          <div className="flex flex-col gap-3">
                            {/* Personal Info */}
                            <div className="flex items-start gap-3">
                              <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                                {submission.researcherName.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium text-gray-900">{submission.researcherName}</span>
                                <div className="flex flex-col text-xs text-gray-500 gap-0.5">
                                  <span className="truncate" title={submission.researcherEmail}>{submission.researcherEmail}</span>
                                  {submission.phone_number && (
                                    <a
                                      href={`https://wa.me/${submission.phone_number.replace(/^0/, '62')}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-green-600 hover:underline flex items-center gap-1 w-fit"
                                    >
                                      {submission.phone_number}
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Academic Info */}
                            <div className="bg-gray-50 p-2 rounded border border-gray-100 text-xs text-gray-600 space-y-1">
                              <div className="flex items-center gap-2">
                                <GraduationCap className="h-3.5 w-3.5 text-gray-400" />
                                <span className="font-medium text-gray-700">{submission.education || 'Researcher'}</span>
                              </div>
                              {(submission.university || submission.department) && (
                                <div className="pl-[22px]">
                                  <div className="text-gray-900">{submission.university}</div>
                                  <div className="text-gray-500 italic">{submission.department}</div>
                                </div>
                              )}
                              {submission.leads && (
                                <div className="pt-1 mt-1 border-t border-gray-200 text-[10px] text-gray-400">
                                  Lead: {submission.leads}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Submitted */}
                        <TableCell className="align-top py-4 text-xs">
                          <div className="flex flex-col text-gray-500">
                            <span className="font-medium text-gray-900">
                              {new Date(submission.submittedAt).toLocaleDateString('id-ID')}
                            </span>
                            <span>
                              {new Date(submission.submittedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="align-top py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-auto p-0 hover:bg-transparent">
                                <Badge
                                  variant="outline"
                                  className={`
                                    cursor-pointer px-2 py-1 text-[10px] uppercase tracking-wide border transition-all hover:ring-2 hover:ring-offset-1
                                    ${submission.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                                      submission.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-200' :
                                        submission.status === 'in_review' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                          'bg-gray-100 text-gray-700 border-gray-200'}
                                  `}
                                >
                                  {submission.status?.replace('_', ' ') || 'Pending'}
                                </Badge>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem onClick={() => handleStatusChange(submission.id, 'in_review')}>
                                In Review
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(submission.id, 'approved')}>
                                Approved
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(submission.id, 'rejected')} className="text-red-600">
                                Rejected
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(submission.id, 'spam')} className="text-gray-600">
                                Spam
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>

                        {/* Payment */}
                        <TableCell className="align-top py-4">
                          {/* Cost & Status */}
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <Badge
                                variant="outline"
                                className={`
                                      w-fit px-1.5 py-0.5 text-[10px] uppercase tracking-wide border
                                      ${submission.payment_status === 'paid' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}
                                    `}
                              >
                                {submission.payment_status || 'Pending'}
                              </Badge>
                            </div>

                            {(submission.total_cost || 0) > 0 && (
                              <span className="text-sm font-bold text-gray-900">
                                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(submission.total_cost || 0)}
                              </span>
                            )}

                            {/* Referral Code (Voucher) */}
                            {submission.voucher_code && (
                              <div className="flex items-center gap-1.5 bg-purple-50 px-2 py-1 rounded border border-purple-100 w-fit">
                                <Zap className="w-3 h-3 text-purple-600" />
                                <span className="text-[10px] font-medium text-purple-700 tracking-wide">{submission.voucher_code}</span>
                              </div>
                            )}

                            {/* Invoice Actions - Integrated here */}
                            <div className="flex items-center gap-1 mt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px] px-2 w-full justify-center"
                                onClick={() => handleOpenInvoiceModal(submission)}
                              >
                                {submission.payment_status === 'paid' ? 'View Invoice' : 'Create Invoice'}
                              </Button>
                              <div className="shrink-0">
                                <CopyInvoiceDropdown
                                  formSubmissionId={submission.id}
                                  refreshTrigger={invoiceRefreshTrigger}
                                  isCompact={true}
                                />
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        {/* Ad Publishing (New Column) */}
                        <TableCell className="align-top py-4 text-right pr-6">
                          <Button
                            variant={submission.status === 'scheduling' ? 'default' : 'outline'}
                            size="sm"
                            className={`
                                w-full text-xs font-medium shadow-sm transition-all
                                ${submission.status === 'scheduling'
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'text-gray-600 hover:text-blue-600 border-gray-200 hover:border-blue-200'}
                              `}
                            onClick={() => {
                              setSelectedSubmissionForAds(submission);
                              setIsPublishModalOpen(true);
                            }}
                          >
                            <Calendar className={`w-3.5 h-3.5 mr-1.5 ${submission.status === 'scheduling' ? 'text-white/90' : 'text-gray-400'}`} />
                            Schedule
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between px-4 py-4 border-t">
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
                </div>
              </div>
            </Card>

            {/* Mobile Card View - shown only on mobile */}
            <div className="md:hidden space-y-4">
              {filteredSubmissions.map((submission) => (
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
                              submission.status === 'scheduling' ? 'bg-purple-100 text-purple-700 focus:ring-purple-500' :
                                submission.status === 'publishing' ? 'bg-indigo-100 text-indigo-700 focus:ring-indigo-500' :
                                  submission.status === 'completed' ? 'bg-gray-100 text-gray-800 focus:ring-gray-500' :
                                    'bg-gray-100 text-gray-800'
                            }`}
                          value={submission.status || 'in_review'}
                          onChange={(e) => handleStatusChange(submission.id, e.target.value)}
                        >
                          <option value="spam" className="bg-white text-gray-900">Spam</option>
                          <option value="in_review" className="bg-white text-gray-900">In Review</option>
                          <option value="scheduling" className="bg-white text-gray-900">Scheduling</option>
                          <option value="publishing" className="bg-white text-gray-900">Publishing</option>
                          <option value="completed" className="bg-white text-gray-900">Completed</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-500">Payment</label>
                        <div className="flex items-center h-[30px]">
                          {submission.payment_status === 'paid' ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              Paid
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                              Pending
                            </Badge>
                          )}
                        </div>

                        {/* Ad Cost Mobile */}
                        {submission.duration && submission.duration > 0 && (
                          <div className="flex flex-col gap-0.5 mt-2 pt-2 border-t border-dashed border-gray-200">
                            <span className="text-[10px] text-gray-500 uppercase font-medium">Ad Cost</span>
                            <div className="text-[10px] text-gray-600">
                              {(() => {
                                const { dailyRate, totalAdCost } = calculateAdCost(submission.questionCount, submission.duration);
                                return (
                                  <>
                                    <span>{new Intl.NumberFormat('id-ID').format(dailyRate)}/day</span>
                                    <span className="mx-1">x</span>
                                    <span>{submission.duration}d</span>
                                    <div className="font-semibold text-gray-900 mt-0.5">
                                      = Rp {new Intl.NumberFormat('id-ID').format(totalAdCost)}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                        onClick={() => handleOpenInvoiceModal(submission)}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Invoice
                      </Button>
                      <div className="flex-1">
                        <CopyInvoiceDropdown
                          formSubmissionId={submission.id}
                          refreshTrigger={invoiceRefreshTrigger}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )
        }
      </div >

      {/* Invoice Creation Modal */}
      {
        selectedSubmission && (
          <CreateInvoiceModal
            isOpen={isInvoiceModalOpen}
            onClose={handleCloseInvoiceModal}
            formSubmissionId={selectedSubmission.id}
            defaultAmount={selectedSubmission.total_cost || 0}
            customerInfo={{
              fullName: selectedSubmission.researcherName,
              email: selectedSubmission.researcherEmail,
              phoneNumber: selectedSubmission.phone_number || ''
            }}
            onSuccess={handleInvoiceCreated}
          />
        )
      }

      {/* Publish Ads Modal */}
      {
        selectedSubmissionForAds && (
          <PublishAdsModal
            isOpen={isPublishModalOpen}
            onClose={handleClosePublishModal}
            submission={selectedSubmissionForAds as any} // Cast because wrapper types slightly differ but core fields match
            onSuccess={() => {
              loadSubmissions(); // Refresh table to show updated status
              handleClosePublishModal();
            }}
          />
        )
      }

      <EditCriteriaModal
        isOpen={isEditCriteriaModalOpen}
        onClose={handleCloseEditCriteriaModal}
        submission={selectedSubmissionForCriteria}
        onUpdate={handleCriteriaUpdated}
      />
    </div >
  );
}
