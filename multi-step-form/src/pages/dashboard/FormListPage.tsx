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
  Users,
  Megaphone,
  ChevronRight
} from 'lucide-react';
import emptyFormIllustration from '../../assets/illustration JFU form.png';
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
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menghapus form.');
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
    navigate(`/dashboard/submit-iklan?custom_form_id=${form.id}`);
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

  const publishedCount = useMemo(() => forms.filter(f => f.status === 'published').length, [forms]);
  const draftCount = useMemo(() => forms.filter(f => f.status === 'draft').length, [forms]);

  return (
    <div className="max-w-5xl mx-auto max-sm:px-4 sm:px-6 pt-5 sm:pt-8 pb-10 space-y-4">
      {/* Integrated Control Panel Card (Selaras dengan StatusPage / Soft DNA Dashboard Peneliti) */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.03),0_4px_12px_-2px_rgba(0,0,0,0.02)] overflow-hidden">
        {/* Top Row: Title, Badge, Subtitle & Primary CTA */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 sm:py-4">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
              JFU Form
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-jfu-primary border border-blue-200/80 shrink-0">
              BETA
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200/80 shrink-0 tabular-nums">
              {forms.length}
            </span>
            <span className="hidden md:inline-block w-px h-4 bg-slate-200 shrink-0" />
            <p className="text-xs text-slate-500 truncate hidden md:block">
              Buat kuesioner online &amp; sebarkan langsung ke responden
            </p>
          </div>

          <Button
            onClick={() => navigate('/dashboard/forms/new')}
            className="bg-jfu-primary hover:bg-jfu-dark text-white text-xs font-semibold px-3.5 sm:px-4 h-9 rounded-xl shadow-xs inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Form Baru</span>
          </Button>
        </div>

        {/* Bottom Row: Segmented Filter Tabs & Search Input */}
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* ⚠️ Gunakan `max-sm:w-full` (bukan `w-full sm:w-auto`): `.w-full` di styles.css
              dimuat setelah Tailwind dan mengalahkan `sm:w-auto`. */}
          <div className="max-sm:w-full inline-flex items-center gap-1 bg-slate-200/70 dark:bg-gray-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`max-sm:flex-1 px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer tabular-nums ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-gray-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 dark:text-gray-400 font-medium'
              }`}
            >
              Semua ({forms.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('published')}
              className={`max-sm:flex-1 px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer tabular-nums ${
                activeTab === 'published'
                  ? 'bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-400 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 dark:text-gray-400 font-medium'
              }`}
            >
              Published ({publishedCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('draft')}
              className={`max-sm:flex-1 px-3 py-1.5 text-xs rounded-lg transition-all cursor-pointer tabular-nums ${
                activeTab === 'draft'
                  ? 'bg-white dark:bg-gray-700 text-amber-700 dark:text-amber-400 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 dark:text-gray-400 font-medium'
              }`}
            >
              Draft ({draftCount})
            </button>
          </div>

          <div className="max-sm:w-full sm:w-64 flex items-center gap-2 bg-white dark:bg-gray-800 border border-slate-200/90 dark:border-gray-700 focus-within:border-jfu-primary focus-within:ring-2 focus-within:ring-jfu-primary/15 rounded-xl px-3 h-9 transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul atau deskripsi form..."
              className="w-full min-w-0 bg-transparent border-0 p-0 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-0"
            />
          </div>
        </div>
      </div>

      {/* Ramp untuk user yang sebenarnya mau order iklan, bukan membuat
          kuesioner — populasi nyasar hampir pasti belum punya form, jadi
          banner hanya tampil saat daftar form kosong. */}
      {!loading && forms.length === 0 && (
        <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50/90 via-blue-50/40 to-white dark:from-blue-950/30 dark:to-gray-800 px-4 sm:px-5 py-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5">
          <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-blue-100/80 border border-blue-200/70 text-jfu-primary flex items-center justify-center shrink-0">
              <Megaphone className="w-4 h-4" />
            </span>
            <p className="text-xs sm:text-[13px] text-slate-600 dark:text-blue-200 leading-relaxed min-w-0">
              <span className="font-bold text-slate-900 dark:text-white">Mau order iklan survei?</span>{' '}
              Kalau kuesionermu sudah jadi (misalnya di Google Form), kamu tidak
              perlu membuat form di sini.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/submit-iklan')}
            className="max-sm:w-full shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-white hover:bg-jfu-primary text-jfu-primary hover:text-white hover:border-jfu-primary text-xs font-bold px-4 h-9 shadow-2xs transition-all cursor-pointer"
          >
            <span>Order Iklan Survei</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Daftar Form / Empty State */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] flex flex-col items-center justify-center py-16">
          <Loader2 className="w-7 h-7 text-jfu-primary animate-spin mb-2.5" />
          <p className="text-xs font-medium text-slate-500">Memuat daftar form...</p>
        </div>
      ) : filteredForms.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/90 bg-white/95 dark:bg-gray-800 shadow-[0_1px_3px_0_rgba(0,0,0,0.03),0_4px_12px_-2px_rgba(0,0,0,0.02)] px-6 py-10 sm:py-12 text-center flex flex-col items-center justify-center">
          <img
            src={emptyFormIllustration}
            alt="Bikin Custom Form"
            className="w-40 sm:w-44 h-auto mx-auto mb-3"
          />
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            {searchQuery
              ? 'Form Tidak Ditemukan'
              : activeTab !== 'all'
              ? `Belum Ada Form Berstatus ${activeTab === 'published' ? 'Published' : 'Draft'}`
              : 'Belum Ada Kuesioner JFU Form'}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-gray-400 max-w-md mt-1 mb-6 leading-relaxed">
            {searchQuery
              ? `Tidak ada form yang cocok dengan kata kunci "${searchQuery}".`
              : 'Buat kuesioner interaktif yang nyaman diisi di HP responden, lengkap dengan logika lompat pertanyaan dan ekspor CSV.'}
          </p>
          {!searchQuery && (
            <button
              type="button"
              onClick={() => navigate('/dashboard/forms/new')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-jfu-primary hover:bg-jfu-dark text-white text-xs sm:text-sm font-semibold shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Form Baru</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredForms.map((form) => {
            const isPublished = form.status === 'published';
            const responseCount = form.response_count || 0;

            return (
              <div
                key={form.id}
                onClick={() => navigate(`/dashboard/forms/${form.id}/edit`)}
                className="group rounded-2xl border border-slate-200/90 dark:border-gray-700/80 bg-white dark:bg-gray-800 hover:border-slate-300 dark:hover:border-gray-600 shadow-[0_1px_3px_0_rgba(0,0,0,0.03),0_4px_12px_-2px_rgba(0,0,0,0.02)] px-4 sm:px-5 py-3.5 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4 cursor-pointer"
              >
                {/* Left Title */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-sm font-bold text-slate-900 dark:text-gray-100 group-hover:text-jfu-primary dark:group-hover:text-blue-400 truncate transition-colors">
                    {form.title || 'Untitled Form'}
                  </span>
                </div>

                {/* Right Metadata & Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 text-xs max-sm:w-full justify-between sm:justify-end">
                  {/* Status & Submissions info */}
                  <div className="flex items-center gap-2 text-slate-400 font-normal">
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                        isPublished
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {isPublished ? 'Published' : 'Draft'}
                    </span>

                    {/* Interactive Response Count Badge */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dashboard/forms/${form.id}/responses`);
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer shadow-2xs tabular-nums ${
                        responseCount > 0
                          ? 'bg-blue-50 text-jfu-primary border-blue-200/90 hover:bg-blue-100 hover:border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800'
                          : 'bg-slate-50 text-slate-600 border-slate-200/90 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700'
                      }`}
                      title="Lihat hasil respon form"
                    >
                      <Users className="w-3 h-3 text-current" />
                      <span>{responseCount} Respon</span>
                    </button>

                    <span className="text-slate-300 dark:text-gray-600">·</span>
                    <span className="text-[11px] text-slate-500 tabular-nums">{timeAgo(form.updated_at)}</span>
                  </div>

                  {/* Inline Quick Action Buttons */}
                  <div className="flex items-center gap-1 flex-wrap sm:pl-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dashboard/forms/${form.id}/edit`);
                      }}
                      className="h-7 text-xs text-slate-700 dark:text-gray-200 hover:text-jfu-primary px-2 flex items-center gap-1 font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700"
                      title="Edit Form"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Edit</span>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/dashboard/forms/${form.id}/responses`);
                      }}
                      className="h-7 text-xs text-jfu-primary dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 flex items-center gap-1 font-semibold rounded-lg"
                      title="Lihat Hasil Respon"
                    >
                      <BarChart3 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Respon</span>
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/f/${form.slug || form.id}?preview=true`, '_blank');
                      }}
                      className="h-7 w-7 p-0 text-slate-500 hover:text-jfu-primary rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700"
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
                          <Send className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Sebar</span>
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
                      className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg"
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
