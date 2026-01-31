import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { LogOut, Eye, RefreshCw, Lock, Search, Plus, Calendar, Trash2 } from 'lucide-react';
import { getFormSubmissionsPaginated, updateFormStatus, getScheduledAdsBySubmission, deleteScheduledAd, supabase } from '../utils/supabase';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { CreateInvoiceModal } from './CreateInvoiceModal';
import { CopyInvoiceDropdown } from './CopyInvoiceDropdown';
import { PublishAdsModal } from './PublishAdsModal';
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

  // Admin Access Check
  // STRICT: Only product@jakpat.net is allowed
  const allowedEmails = ['product@jakpat.net'];
  const isAdmin = (user?.email && allowedEmails.includes(user.email)) ||
    hideAuth; // Trust parent if hideAuth is true

  useEffect(() => {
    if (isAdmin) {
      loadSubmissions();
    }
  }, [isAdmin]);

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
          submittedAt: new Date(sub.created_at).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          }),
          questionCount: sub.question_count || 0,
          responseCount: 0, // Not tracked yet
          status: (sub.submission_status || sub.status || 'in_review') === 'pending' ? 'in_review' : (sub.submission_status || sub.status || 'in_review'),
          payment_status: sub.payment_status || 'pending',
          total_cost: sub.total_cost || 0,
          phone_number: sub.phone_number
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

  // Debounced search effect or separate effect for page changes
  useEffect(() => {
    if (isAdmin) {
      loadSubmissions();
    }
  }, [isAdmin, currentPage, searchQuery]); // Re-fetch on page/search change

  // Remove the old client-side filter effect since we do server-side search now
  // Kept filteredSubmissions state for compatibility but it mirrors submissions now

  const handleStatusChange = async (submissionId: string, newStatus: string, index: number) => {
    try {
      await updateFormStatus(submissionId, newStatus);
      setSubmissions(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], status: newStatus };
        return updated;
      });
      toast.success('Status updated successfully');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
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
  };

  const handleOpenPublishModal = (submission: SurveySubmission) => {
    setSelectedSubmissionForAds(submission);
    setIsPublishModalOpen(true);
  };

  const handleClosePublishModal = () => {
    setIsPublishModalOpen(false);
    setSelectedSubmissionForAds(null);
  };

  const handleRemoveAds = async (submissionId: string) => {
    if (!confirm('Are you sure you want to remove all scheduled ads for this submission?')) {
      return;
    }

    try {
      // Get all scheduled ads for this submission
      const scheduledAds = await getScheduledAdsBySubmission(submissionId);

      // Delete from Supabase
      for (const ad of scheduledAds) {
        await deleteScheduledAd(ad.id);
      }

      // Update status back to scheduling
      await updateFormStatus(submissionId, 'scheduling');

      // Refresh the list
      loadSubmissions();
      toast.success('Scheduled ads removed successfully');
    } catch (error: any) {
      console.error('Error removing ads:', error);
      toast.error('Failed to remove scheduled ads');
    }
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
      <div className={hideAuth ? 'p-4 md:p-8' : 'max-w-[1400px] mx-auto px-4 sm:px-6 py-6'}>
        {/* Toolbar - Search & Google Connect */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex-1 max-w-2xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search or ID..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
          </div>

          {/* Refresh Button */}
          <div className="flex items-center gap-3">
            {!hideAuth && (
              <Button
                onClick={loadSubmissions}
                variant="outline"
                size="sm"
                disabled={loading}
                title="Refresh data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            )}
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
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow>
                      <TableHead className="w-[300px] font-semibold text-gray-900">Form Title</TableHead>
                      <TableHead className="font-semibold text-gray-900">Researcher</TableHead>
                      <TableHead className="text-center font-semibold text-gray-900">Questions</TableHead>
                      <TableHead className="font-semibold text-gray-900">Submitted</TableHead>
                      <TableHead className="font-semibold text-gray-900">Status</TableHead>
                      <TableHead className="font-semibold text-gray-900">Payment Status</TableHead>
                      <TableHead className="font-semibold text-gray-900">Ads Actions</TableHead>
                      <TableHead className="font-semibold text-gray-900">Invoice Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubmissions.map((submission, index) => (
                      <TableRow key={submission.id} className="hover:bg-gray-50/50 transition-colors">
                        <TableCell className="align-top py-4">
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col gap-1 flex-1">
                              <span className="font-semibold text-gray-900 line-clamp-2" title={submission.formTitle}>
                                {submission.formTitle}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                                  {submission.formId.substring(0, 8)}...
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-gray-400 hover:text-blue-600"
                                  onClick={() => window.open(submission.formUrl, '_blank')}
                                  title="Open survey"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top py-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-gray-900">{submission.researcherName}</span>
                            <span className="text-xs text-muted-foreground">{submission.researcherEmail}</span>
                            {submission.phone_number && (
                              <a
                                href={`https://wa.me/${submission.phone_number.replace(/^0/, '62').replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1 mt-0.5 hover:underline"
                                title="Chat via WhatsApp"
                              >
                                <span>📱</span> {submission.phone_number}
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top py-4 text-center">
                          <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100 font-medium w-10 h-8 flex items-center justify-center mx-auto text-sm">
                            {submission.questionCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-top py-4">
                          <div className="flex flex-col text-sm">
                            <span className="font-medium text-gray-900">
                              {new Date(submission.submittedAt).toLocaleDateString('id-ID', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(submission.submittedAt).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="align-top py-4">
                          <div className="relative">
                            <select
                              className={`appearance-none w-full pl-3 pr-8 py-2 text-xs font-medium rounded-full border-0 cursor-pointer transition-all focus:ring-2 focus:ring-offset-1 ${submission.status === 'spam' ? 'bg-red-100 text-red-700 hover:bg-red-200 focus:ring-red-500' :
                                submission.status === 'in_review' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 focus:ring-blue-500' :
                                  submission.status === 'scheduling' ? 'bg-purple-100 text-purple-700 hover:bg-purple-200 focus:ring-purple-500' :
                                    submission.status === 'publishing' ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 focus:ring-indigo-500' :
                                      submission.status === 'completed' ? 'bg-gray-100 text-gray-800 hover:bg-gray-200 focus:ring-gray-500' :
                                        'bg-gray-100 text-gray-800'
                                }`}
                              value={submission.status || 'in_review'}
                              onChange={(e) => handleStatusChange(submission.id, e.target.value, index)}
                            >
                              <option value="spam" className="bg-white text-gray-900">Spam</option>
                              <option value="in_review" className="bg-white text-gray-900">In Review</option>
                              <option value="scheduling" className="bg-white text-gray-900">Scheduling</option>
                              <option value="publishing" className="bg-white text-gray-900">Publishing</option>
                              <option value="completed" className="bg-white text-gray-900">Completed</option>
                            </select>
                            <div className={`pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 ${submission.status === 'spam' ? 'text-red-600' :
                              submission.status === 'in_review' ? 'text-blue-600' :
                                submission.status === 'scheduling' ? 'text-purple-600' :
                                  submission.status === 'publishing' ? 'text-indigo-600' :
                                    submission.status === 'completed' ? 'text-gray-600' :
                                      'text-gray-500'
                              }`}>
                              <svg className="h-3 w-3 fill-current" viewBox="0 0 20 20">
                                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                              </svg>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${submission.payment_status?.toLowerCase() === 'paid'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            }`}>
                            {submission.payment_status === 'paid' ? 'Paid' : 'Pending'}
                          </span>
                        </TableCell>
                        <TableCell className="align-top py-4">
                          {submission.payment_status?.toLowerCase() === 'paid' ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 border-dashed text-xs"
                                onClick={() => handleOpenPublishModal(submission)}
                              >
                                <Calendar className="w-3 h-3 mr-1.5" />
                                {submission.status === 'publishing' ? 'Extend Ads' : 'Publish Ads'}
                              </Button>
                              {submission.status === 'publishing' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => handleRemoveAds(submission.id)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="align-top py-4">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="default"
                              size="icon"
                              className="h-8 w-8 bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={() => {
                                setSelectedSubmission(submission);
                                setIsInvoiceModalOpen(true);
                              }}
                              title="Create Invoice"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>

                            <CopyInvoiceDropdown
                              formSubmissionId={submission.id}
                              refreshTrigger={submission.payment_status === 'paid' ? 1 : 0}
                              isCompact={true}
                            />
                          </div>
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
              {filteredSubmissions.map((submission, index) => (
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
                      <div className="text-right pl-4 border-l border-gray-100">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Items</p>
                        <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                          {submission.questionCount} Qs
                        </Badge>
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
                          onChange={(e) => handleStatusChange(submission.id, e.target.value, index)}
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
      {selectedSubmissionForAds && (
        <PublishAdsModal
          isOpen={isPublishModalOpen}
          onClose={handleClosePublishModal}
          submission={selectedSubmissionForAds as any} // Cast because wrapper types slightly differ but core fields match
          onSuccess={() => {
            loadSubmissions(); // Refresh table to show updated status
            handleClosePublishModal();
          }}
        />
      )}
    </div >
  );
}
