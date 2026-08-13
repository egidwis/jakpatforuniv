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
  Edit3,
  Copy,
  Trash2,
  ExternalLink,
  Send,
  Loader2,
  CheckCircle2,
  Search,
  BarChart3,
  FileSpreadsheet
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../../components/ui/dropdown-menu';
import { toast } from 'sonner';

export const FormListPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [forms, setForms] = useState<CustomForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedFormId, setCopiedFormId] = useState<string | null>(null);
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

  const handleCopyLink = (form: CustomForm, e: React.MouseEvent) => {
    e.stopPropagation();
    const origin = window.location.origin;
    const url = `${origin}/f/${form.id}`;
    navigator.clipboard.writeText(url);
    setCopiedFormId(form.id);
    toast.success('Link survei disalin ke clipboard!');
    setTimeout(() => setCopiedFormId(null), 2000);
  };

  const handleLaunchCampaign = (form: CustomForm, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/dashboard/submit?custom_form_id=${form.id}`);
  };

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

  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    const years = Math.floor(months / 12);
    return `${years}y`;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-5xl mx-auto space-y-6">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            JFU Form
            <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
              BETA
            </span>
          </h1>
          <span className="text-xs font-semibold text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">
            {forms.length}
          </span>
        </div>

        <Button
          onClick={() => navigate('/dashboard/forms/new')}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-xs flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          New form
        </Button>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'all'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-2xs font-semibold'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
            }`}
          >
            Semua ({forms.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('published')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'published'
                ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
            }`}
          >
            Published ({forms.filter(f => f.status === 'published').length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('draft')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
              activeTab === 'draft'
                ? 'bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-2xs font-semibold'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
            }`}
          >
            Draft ({forms.filter(f => f.status === 'draft').length})
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari form..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Tally-Style Compact Minimalist Form List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-7 h-7 text-blue-600 animate-spin mb-2" />
          <p className="text-xs text-gray-400">Memuat form...</p>
        </div>
      ) : filteredForms.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
          <FileSpreadsheet className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {searchQuery ? 'Form tidak ditemukan.' : 'Belum ada form. Klik "+ New form" untuk membuat baru.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredForms.map((form) => {
            const isPublished = form.status === 'published';
            const responseCount = form.response_count || 0;

            return (
              <div
                key={form.id}
                onClick={() => navigate(`/dashboard/forms/${form.id}/edit`)}
                className="group relative bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 border border-gray-200/80 dark:border-gray-700/80 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl px-4 py-3 transition-all flex items-center justify-between gap-4 cursor-pointer shadow-2xs"
              >
                {/* Left Title */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate transition-colors">
                    {form.title || 'Untitled Form'}
                  </span>
                </div>

                {/* Right Metadata & Action Buttons */}
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  {/* Status & Submissions info */}
                  <div className="flex items-center gap-1.5 text-gray-400 font-normal">
                    <span
                      className={`font-semibold ${
                        isPublished
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {isPublished ? 'Published' : 'Draft'}
                    </span>
                    <span>·</span>
                    <span>{responseCount} submissions</span>
                    <span>·</span>
                    <span>{timeAgo(form.updated_at)}</span>
                  </div>

                  {/* Inline Quick Action Buttons (Show on Hover / Desktop) */}
                  <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity bg-white dark:bg-gray-800 pl-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dashboard/forms/${form.id}/edit`);
                      }}
                      className="h-7 text-xs text-gray-700 dark:text-gray-200 hover:text-blue-600 px-2 flex items-center gap-1 font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Edit Form"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dashboard/forms/${form.id}/responses`);
                      }}
                      className="h-7 w-7 p-0 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Lihat Hasil Respon"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/f/${form.slug || form.id}?preview=true`, '_blank');
                      }}
                      className="h-7 w-7 p-0 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Preview Form"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => e.stopPropagation()}
                          className="h-7 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 px-2 flex items-center gap-1 font-semibold rounded-lg"
                          title="Sebarkan survei"
                        >
                          <Send className="w-3.5 h-3.5" /> Sebar
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={(e) => handleLaunchCampaign(form, e)} className="cursor-pointer">
                          <Send className="w-3.5 h-3.5 mr-2" /> Sebar via Jakpat
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => handleCopyLink(form, e)} className="cursor-pointer">
                          {copiedFormId === form.id ? (
                            <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 mr-2" />
                          )}
                          Copy Link Publik
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(form.id, form.title);
                      }}
                      className="h-7 w-7 p-0 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg"
                      title="Hapus Form"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
