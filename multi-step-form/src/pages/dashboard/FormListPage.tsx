import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { CustomForm } from '../../utils/customForms';
import {
  getUserCustomForms,
  deleteCustomForm
} from '../../utils/customForms';
import {
  Plus,
  FileSpreadsheet,
  Edit3,
  Copy,
  Trash2,
  ExternalLink,
  Send,
  Loader2,
  CheckCircle2,
  Sparkles,
  Search,
  HelpCircle,
  BarChart3,
  Calendar,
  CheckCircle
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

export const FormListPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [forms, setForms] = useState<CustomForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedFormId, setCopiedFormId] = useState<string | null>(null);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'published' | 'draft'>('all');

  const fetchForms = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const userForms = await getUserCustomForms(user.id);
      setForms(userForms);
    } catch (err) {
      toast.error('Gagal memuat daftar form.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
  }, [user?.id]);

  const handleDelete = async (formId: string, formTitle: string) => {
    if (!user) return;
    if (!window.confirm(`Apakah Anda yakin ingin menghapus "${formTitle}"?`)) return;

    try {
      await deleteCustomForm(formId, user.id);
      toast.success('Form berhasil dihapus.');
      setForms(prev => prev.filter(f => f.id !== formId));
    } catch (err) {
      toast.error('Gagal menghapus form.');
    }
  };

  const handleCopyLink = (form: CustomForm) => {
    const origin = window.location.origin;
    const url = `${origin}/f/${form.id}`;
    navigator.clipboard.writeText(url);
    setCopiedFormId(form.id);
    toast.success('Link survei disalin ke clipboard!');
    setTimeout(() => setCopiedFormId(null), 2000);
  };

  const handleLaunchCampaign = (form: CustomForm) => {
    const origin = window.location.origin;
    const formUrl = `${origin}/f/${form.id}`;
    navigate(`/dashboard/submit?survey_url=${encodeURIComponent(formUrl)}&title=${encodeURIComponent(form.title)}`);
  };

  // Filtered forms list
  const filteredForms = useMemo(() => {
    return forms.filter(form => {
      const matchesTab =
        activeTab === 'all'
          ? true
          : activeTab === 'published'
          ? form.status === 'published'
          : form.status === 'draft';
      const matchesSearch =
        form.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (form.description && form.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesTab && matchesSearch;
    });
  }, [forms, activeTab, searchQuery]);

  // Statistics
  const totalForms = forms.length;
  const publishedCount = forms.filter(f => f.status === 'published').length;
  const draftCount = forms.filter(f => f.status === 'draft').length;
  const totalResponses = forms.reduce((acc, f) => acc + (f.response_count || 0), 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Branding & Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <FileSpreadsheet className="w-5.5 h-5.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                  JFU Form
                </h1>
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-xs uppercase tracking-wider">
                  BETA
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Platform kustom form cerdas dengan AI generator & integrasi langsung ke Responden Jakpat.
              </p>
            </div>
          </div>
        </div>

        <Button
          onClick={() => navigate('/dashboard/forms/new')}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold flex items-center gap-2 shadow-sm rounded-xl px-4 py-2.5 text-xs transition-all"
        >
          <Plus className="w-4 h-4" />
          Buat Form Baru
        </Button>
      </div>

      {/* Quick Summary Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Form</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white leading-none mt-0.5">{totalForms}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Published</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white leading-none mt-0.5">{publishedCount}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Draft</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white leading-none mt-0.5">{draftCount}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Respon</p>
            <p className="text-lg font-bold text-purple-600 dark:text-purple-400 leading-none mt-0.5">{totalResponses}</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-gray-800 p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xs">
        {/* Status Filter Tabs */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-700/60 p-1 rounded-lg w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-2xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Semua ({totalForms})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('published')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'published'
                ? 'bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Published ({publishedCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('draft')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'draft'
                ? 'bg-white dark:bg-gray-800 text-amber-600 dark:text-amber-400 shadow-2xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Draft ({draftCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari judul form..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Main Content List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
          <p className="text-xs text-gray-500">Memuat daftar form Anda...</p>
        </div>
      ) : filteredForms.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12 text-center max-w-md mx-auto my-6">
          <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">
            {searchQuery ? 'Form tidak ditemukan' : 'Belum ada form'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-6">
            {searchQuery ? 'Coba ubah kata kunci pencarian Anda.' : 'Mulai buat form pertama Anda dengan AI Assistant atau Editor kustom.'}
          </p>
          {!searchQuery && (
            <Button
              onClick={() => navigate('/dashboard/forms/new')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Buat Form Baru
            </Button>
          )}
        </div>
      ) : (
        /* Sleek & Compact Horizontal List View */
        <div className="space-y-3">
          {filteredForms.map(form => {
            const isPublished = form.status === 'published';
            const questionCount = form.schema?.length || 0;
            const responseCount = form.response_count || 0;
            const formattedDate = new Date(form.updated_at).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            });

            return (
              <div
                key={form.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-2xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                {/* Left Side: Icon, Title, Subtitle, & Metadata */}
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                      isPublished
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          isPublished
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {isPublished ? 'Published' : 'Draft'}
                      </span>

                      <h2
                        onClick={() => navigate(`/dashboard/forms/${form.id}/edit`)}
                        className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 cursor-pointer transition-colors"
                      >
                        {form.title || 'Untitled Form'}
                      </h2>
                    </div>

                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xl">
                      {form.description || 'Tidak ada deskripsi.'}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1 font-medium text-gray-700 dark:text-gray-300">
                        <HelpCircle className="w-3 h-3 text-gray-400" />
                        {questionCount} Pertanyaan
                      </span>
                      <span className="text-gray-300 dark:text-gray-600">•</span>
                      <span className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
                        <BarChart3 className="w-3 h-3" />
                        {responseCount} Respon
                      </span>
                      <span className="text-gray-300 dark:text-gray-600">•</span>
                      <span className="flex items-center gap-1 text-gray-400">
                        <Calendar className="w-3 h-3" />
                        Diubah {formattedDate}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Compact Action Buttons Row */}
                <div className="flex items-center flex-wrap md:flex-nowrap gap-1.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100 dark:border-gray-700">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/dashboard/forms/${form.id}/edit`)}
                    className="h-8 text-xs text-gray-700 dark:text-gray-200 hover:border-blue-500 hover:text-blue-600 px-2.5 font-medium"
                  >
                    <Edit3 className="w-3.5 h-3.5 mr-1 text-gray-500" /> Edit
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/dashboard/forms/${form.id}/responses`)}
                    className="h-8 text-xs text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2.5 font-medium"
                  >
                    <BarChart3 className="w-3.5 h-3.5 mr-1" /> Hasil
                  </Button>

                  <div className="h-4 w-px bg-gray-200 dark:bg-gray-700 mx-0.5 hidden sm:block" />

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyLink(form)}
                    className="h-8 text-xs text-gray-600 hover:text-blue-600 px-2"
                    title="Copy Public Link"
                  >
                    {copiedFormId === form.id ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(`/f/${form.id}`, '_blank')}
                    className="h-8 text-xs text-gray-600 hover:text-blue-600 px-2"
                    title="Preview Public Form"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleLaunchCampaign(form)}
                    className="h-8 text-xs text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-2.5 font-medium"
                    title="Sebarkan survei ini via Jakpat App"
                  >
                    <Send className="w-3.5 h-3.5 mr-1" /> Sebar Survei
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(form.id, form.title)}
                    className="h-8 w-8 p-0 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                    title="Hapus Form"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
