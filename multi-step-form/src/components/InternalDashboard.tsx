import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { LogOut, Eye, Download, RefreshCw, Lock, CheckCircle, XCircle, Search, Plus } from 'lucide-react';
import { getFormResponseCount, getFormResponses, exportResponsesToCSV } from '../utils/google-forms-responses';
import { getAllFormSubmissions, updateFormStatus, type FormSubmission } from '../utils/supabase';
import { simpleGoogleAuth } from '../utils/google-auth-simple';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Alert, AlertDescription } from './ui/alert';
import { CreateInvoiceModal } from './CreateInvoiceModal';
import { CopyInvoiceDropdown } from './CopyInvoiceDropdown';
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
  const [isAuthenticated, setIsAuthenticated] = useState(hideAuth);
  const [password, setPassword] = useState('');
  const [submissions, setSubmissions] = useState<SurveySubmission[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<SurveySubmission[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);

  // Invoice modal state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<SurveySubmission | null>(null);
  const [invoiceRefreshTrigger, setInvoiceRefreshTrigger] = useState(0);

  useEffect(() => {
    if (hideAuth) {
      // If hideAuth is true, we're already authenticated via parent component
      setIsAuthenticated(true);
      loadSubmissions();
      checkGoogleConnection();
    } else {
      // Check if already authenticated in session
      const auth = sessionStorage.getItem('internal_auth');
      if (auth === 'true') {
        setIsAuthenticated(true);
        loadSubmissions();
        checkGoogleConnection();
      }
    }
  }, [hideAuth]);

  // Filter submissions based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredSubmissions(submissions);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = submissions.filter(submission => {
      return (
        submission.formTitle.toLowerCase().includes(query) ||
        submission.researcherName.toLowerCase().includes(query) ||
        submission.researcherEmail.toLowerCase().includes(query) ||
        submission.formId.toLowerCase().includes(query) ||
        submission.status?.toLowerCase().includes(query) ||
        submission.payment_status?.toLowerCase().includes(query)
      );
    });

    setFilteredSubmissions(filtered);
  }, [searchQuery, submissions]);

  const checkGoogleConnection = () => {
    const connected = simpleGoogleAuth.isAuthenticated();
    setIsGoogleConnected(connected);
  };

  const connectGoogle = async () => {
    setIsConnectingGoogle(true);
    try {
      // Check if already authenticated from homepage
      if (simpleGoogleAuth.isAuthenticated()) {
        setIsGoogleConnected(true);
        toast.success('Already connected to Google!');
        setIsConnectingGoogle(false);
        return;
      }

      toast.info('Opening Google authentication popup...');

      // Initialize and request access
      await simpleGoogleAuth.loadGoogleScript();
      const initialized = await simpleGoogleAuth.initialize();

      if (!initialized) {
        throw new Error('Failed to initialize Google authentication');
      }

      const result = await simpleGoogleAuth.requestAccessToken();

      if (result.success) {
        setIsGoogleConnected(true);
        toast.success('Connected to Google successfully!');
      } else {
        toast.error(result.error || 'Failed to connect to Google');
      }
    } catch (error: any) {
      console.error('Error connecting to Google:', error);
      toast.error(error.message || 'Failed to connect to Google. Please try again.');
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const disconnectGoogle = () => {
    simpleGoogleAuth.revoke();
    setIsGoogleConnected(false);
    toast.info('Disconnected from Google');
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'jakpat2025') {
      setIsAuthenticated(true);
      sessionStorage.setItem('internal_auth', 'true');
      setError('');
      loadSubmissions();
    } else {
      setError('Invalid password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('internal_auth');
    setPassword('');
  };

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      // Fetch from Supabase
      const data = await getAllFormSubmissions();

      // Transform Supabase data to SurveySubmission format
      const transformedData: SurveySubmission[] = data.map((submission: FormSubmission) => ({
        id: submission.id || '',
        formId: extractFormId(submission.survey_url),
        formTitle: submission.title,
        formUrl: submission.survey_url,
        researcherName: submission.full_name || 'Unknown',
        researcherEmail: submission.email || 'N/A',
        submittedAt: submission.created_at || new Date().toISOString(),
        questionCount: submission.question_count,
        responseCount: undefined,
        status: submission.status || 'verified',
        payment_status: submission.payment_status || 'pending',
        total_cost: submission.total_cost,
        phone_number: submission.phone_number
      }));

      setSubmissions(transformedData);
      toast.success(`Loaded ${transformedData.length} submissions`);
    } catch (err) {
      console.error('Error loading submissions:', err);
      toast.error('Failed to load submissions from database');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to extract Google Form ID from URL
  const extractFormId = (url: string): string => {
    const match = url.match(/\/forms\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : '';
  };

  const fetchResponseCount = async (formId: string, index: number) => {
    if (!isGoogleConnected) {
      toast.error('Please connect your Google account first');
      return;
    }

    try {
      toast.info('Fetching response count...');
      const count = await getFormResponseCount(formId);

      // Update the submission with response count
      setSubmissions(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], responseCount: count };
        return updated;
      });

      toast.success(`Found ${count} responses`);
    } catch (error) {
      console.error('Error fetching response count:', error);
      toast.error('Failed to fetch response count. Please try reconnecting to Google.');
    }
  };

  const exportResponses = async (formId: string, formTitle: string) => {
    if (!isGoogleConnected) {
      toast.error('Please connect your Google account first');
      return;
    }

    try {
      toast.info('Fetching responses for export...');
      const { responses } = await getFormResponses(formId);

      if (responses.length === 0) {
        toast.warning('No responses to export');
        return;
      }

      exportResponsesToCSV(responses, formTitle);
      toast.success(`Exported ${responses.length} responses to CSV`);
    } catch (error) {
      console.error('Error exporting responses:', error);
      toast.error('Failed to export responses. Please try reconnecting to Google.');
    }
  };

  const handleStatusChange = async (submissionId: string, newStatus: string, index: number) => {
    try {
      await updateFormStatus(submissionId, newStatus);

      // Update local state
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
    // Refresh the invoice dropdown by incrementing the trigger
    setInvoiceRefreshTrigger(prev => prev + 1);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-center rounded-t-lg">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4 mx-auto">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl text-white">Internal Dashboard</CardTitle>
            <CardDescription className="text-blue-100">Jakpat for Universities</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-semibold">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                  required
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full">
                Login
              </Button>
            </form>
          </CardContent>
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
                {/* Refresh Button */}
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
      <div className={hideAuth ? '' : 'max-w-[1400px] mx-auto px-4 sm:px-6 py-6'}>
        {/* Toolbar - Search & Google Connect */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex-1 max-w-2xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search submissions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-full"
              />
            </div>
          </div>

          {/* Google Connection Status */}
          <div className="flex items-center gap-3">
            {isGoogleConnected ? (
              <>
                <Badge variant="outline" className="bg-green-500/10 border-green-500/20 text-green-400">
                  <CheckCircle className="w-3 h-3 mr-1.5" />
                  Google Connected
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={disconnectGoogle}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                onClick={connectGoogle}
                disabled={isConnectingGoogle}
                size="sm"
              >
                {isConnectingGoogle ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 mr-2" />
                    Connect Google
                  </>
                )}
              </Button>
            )}
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
            <Card className="hidden md:block">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Form Title</TableHead>
                      <TableHead>Researcher</TableHead>
                      <TableHead className="text-center">Questions</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Payment Status</TableHead>
                      <TableHead className="text-center">Invoice Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubmissions.map((submission, index) => (
                      <TableRow key={submission.id}>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <div className="flex flex-col flex-1">
                              <span className="font-semibold">{submission.formTitle}</span>
                              <span className="text-sm text-muted-foreground font-mono">ID: {submission.formId.substring(0, 12)}...</span>
                            </div>
                            <button
                              onClick={() => window.open(submission.formUrl, '_blank')}
                              className="mt-1 p-1.5 hover:bg-muted rounded-md transition-colors flex-shrink-0"
                              title="Buka survey di tab baru"
                            >
                              <Eye className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">{submission.researcherName}</span>
                            <span className="text-xs text-muted-foreground">{submission.researcherEmail}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-bold text-lg w-12 h-12 flex items-center justify-center">
                            {submission.questionCount}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">
                              {new Date(submission.submittedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(submission.submittedAt).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <select
                            className="px-2 py-1 text-xs rounded-md border border-border bg-background"
                            value={submission.status || 'verified'}
                            onChange={(e) => handleStatusChange(submission.id, e.target.value, index)}
                          >
                            <option value="spam">Spam</option>
                            <option value="verified">Verified</option>
                            <option value="process">Process</option>
                            <option value="publishing">Publishing</option>
                          </select>
                        </TableCell>
                        <TableCell className="text-center">
                          {submission.payment_status === 'paid' ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                              Paid
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                              Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenInvoiceModal(submission)}
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Create Invoice
                            </Button>
                            <CopyInvoiceDropdown
                              formSubmissionId={submission.id}
                              refreshTrigger={invoiceRefreshTrigger}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Mobile Card View - shown only on mobile */}
            <div className="md:hidden space-y-4">
              {filteredSubmissions.map((submission, index) => (
                <Card key={submission.id} className="p-4">
                  {/* Header with Title and Eye Icon */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-base leading-tight mb-1">{submission.formTitle}</h3>
                      <p className="text-xs text-muted-foreground font-mono">ID: {submission.formId.substring(0, 12)}...</p>
                    </div>
                    <button
                      onClick={() => window.open(submission.formUrl, '_blank')}
                      className="p-2 hover:bg-muted rounded-md transition-colors flex-shrink-0"
                      title="Buka survey"
                    >
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>

                  {/* Researcher Info */}
                  <div className="mb-3 pb-3 border-b border-border">
                    <p className="text-sm font-medium">{submission.researcherName}</p>
                    <p className="text-xs text-muted-foreground">{submission.researcherEmail}</p>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Questions</p>
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-bold">
                        {submission.questionCount}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Submitted</p>
                      <p className="text-xs font-medium">
                        {new Date(submission.submittedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(submission.submittedAt).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Status Controls */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Status</p>
                      <select
                        className="w-full px-2 py-1.5 text-xs rounded-md border border-border bg-background"
                        value={submission.status || 'verified'}
                        onChange={(e) => handleStatusChange(submission.id, e.target.value, index)}
                      >
                        <option value="spam">Spam</option>
                        <option value="verified">Verified</option>
                        <option value="process">Process</option>
                        <option value="publishing">Publishing</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Payment</p>
                      {submission.payment_status === 'paid' ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                          Paid
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                          Pending
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Invoice Actions */}
                  <div className="pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">Invoice Actions</p>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenInvoiceModal(submission)}
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create Invoice
                      </Button>
                      <CopyInvoiceDropdown
                        formSubmissionId={submission.id}
                        refreshTrigger={invoiceRefreshTrigger}
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Invoice Creation Modal */}
      {selectedSubmission && (
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
      )}
    </div>
  );
}
