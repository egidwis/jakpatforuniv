import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { LogOut, Eye, Download, RefreshCw, Lock, CheckCircle, XCircle } from 'lucide-react';
import { getFormResponseCount, getFormResponses, exportResponsesToCSV } from '../utils/google-forms-responses';
import { getAllFormSubmissions, type FormSubmission } from '../utils/supabase';
import { simpleGoogleAuth } from '../utils/google-auth-simple';

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
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white">Internal Dashboard</h1>
              <p className="text-blue-100 mt-2">Jakpat for Universities</p>
            </div>

            <div className="p-8">
              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold mb-2 text-gray-700 dark:text-gray-300">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-gray-400"
                    placeholder="Enter your password"
                    autoFocus
                    required
                  />
                </div>
                {error && (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
                  </div>
                )}
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3.5 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  Login
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1419] text-white">
      {/* Header */}
      <div className="bg-[#1a1f2e] border-b border-gray-800">
        <div className="max-w-[1400px] mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center font-bold text-lg">
                J
              </div>
              <div>
                <h1 className="text-xl font-bold">Internal Dashboard</h1>
                <p className="text-sm text-gray-400">Jakpat for Universities</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Google Connection Status */}
              {isGoogleConnected ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-green-400 font-medium">Google Connected</span>
                  </div>
                  <button
                    onClick={disconnectGoogle}
                    className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={connectGoogle}
                  disabled={isConnectingGoogle}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isConnectingGoogle ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" />
                      Connect Google
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm font-medium"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-400 font-medium">Loading submissions...</p>
            </div>
          </div>
        ) : submissions.length === 0 ? (
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-800 rounded-full mb-4">
              <Eye className="w-8 h-8 text-gray-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No Submissions Yet</h3>
            <p className="text-gray-400">
              Survey submissions will appear here once researchers start submitting their forms.
            </p>
          </div>
        ) : (
          <div className="bg-[#1a1f2e] rounded-xl border border-gray-800 overflow-hidden">
            {/* Table Header */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800 bg-[#151a24]">
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Form Title
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Researcher
                    </th>
                    <th className="text-center px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Questions
                    </th>
                    <th className="text-center px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Responses
                    </th>
                    <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Submitted
                    </th>
                    <th className="text-center px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {submissions.map((submission, index) => (
                    <tr key={submission.id} className="hover:bg-[#151a24] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-white">{submission.formTitle}</span>
                          <span className="text-sm text-gray-500 font-mono">ID: {submission.formId.substring(0, 12)}...</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-white">{submission.researcherName}</span>
                          <span className="text-xs text-gray-500">{submission.researcherEmail}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-blue-500/10 text-blue-400 font-bold text-lg">
                          {submission.questionCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-500/10 text-indigo-400 font-bold text-lg">
                          {submission.responseCount ?? '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-white">
                            {new Date(submission.submittedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(submission.submittedAt).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                          Active
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={submission.formUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                            title="View Form"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => fetchResponseCount(submission.formId, index)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
                            title="Fetch Responses"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => exportResponses(submission.formId, submission.formTitle)}
                            disabled={!submission.responseCount || submission.responseCount === 0}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Export CSV"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
