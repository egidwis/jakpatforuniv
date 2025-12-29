import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { LogOut, Eye, Download, RefreshCw, Lock, CheckCircle, XCircle } from 'lucide-react';
import { getFormResponseCount, getFormResponses, exportResponsesToCSV } from '../utils/google-forms-responses';
import { getAllFormSubmissions, type FormSubmission } from '../utils/supabase';
import { simpleGoogleAuth } from '../utils/google-auth-simple';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Alert, AlertDescription } from './ui/alert';
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
}

export function InternalDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [submissions, setSubmissions] = useState<SurveySubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);

  useEffect(() => {
    // Check if already authenticated in session
    const auth = sessionStorage.getItem('internal_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
      loadSubmissions();
      checkGoogleConnection();
    }
  }, []);

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
        responseCount: undefined
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center font-bold text-lg text-white">
                J
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Internal Dashboard</h1>
                <p className="text-sm text-muted-foreground">Jakpat for Universities</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Google Connection Status */}
              {isGoogleConnected ? (
                <div className="flex items-center gap-3">
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
                </div>
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
              <Button
                onClick={handleLogout}
                variant="secondary"
                size="sm"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1400px] mx-auto px-6 py-6">
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
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Form Title</TableHead>
                    <TableHead>Researcher</TableHead>
                    <TableHead className="text-center">Questions</TableHead>
                    <TableHead className="text-center">Responses</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((submission, index) => (
                    <TableRow key={submission.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold">{submission.formTitle}</span>
                          <span className="text-sm text-muted-foreground font-mono">ID: {submission.formId.substring(0, 12)}...</span>
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
                      <TableCell className="text-center">
                        <Badge variant="outline" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 font-bold text-lg w-12 h-12 flex items-center justify-center">
                          {submission.responseCount ?? '-'}
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
                        <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">
                          Active
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                            title="View Form"
                          >
                            <a
                              href={submission.formUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fetchResponseCount(submission.formId, index)}
                            title="Fetch Responses"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => exportResponses(submission.formId, submission.formTitle)}
                            disabled={!submission.responseCount || submission.responseCount === 0}
                            title="Export CSV"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
