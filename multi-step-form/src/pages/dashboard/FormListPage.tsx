import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  CustomForm,
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
  CheckCircle2
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

export const FormListPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [forms, setForms] = useState<CustomForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedFormId, setCopiedFormId] = useState<string | null>(null);

  const fetchForms = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const userForms = await getUserCustomForms(user.id);
      setForms(userForms);
    } catch (err) {
      toast.error('Failed to load forms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForms();
  }, [user?.id]);

  const handleDelete = async (formId: string, formTitle: string) => {
    if (!user) return;
    if (!window.confirm(`Are you sure you want to delete "${formTitle}"?`)) return;

    try {
      await deleteCustomForm(formId, user.id);
      toast.success('Form deleted successfully');
      setForms(prev => prev.filter(f => f.id !== formId));
    } catch (err) {
      toast.error('Failed to delete form');
    }
  };

  const handleCopyLink = (form: CustomForm) => {
    const origin = window.location.origin;
    // Prefer username subdomain or fallback path
    const url = `${origin}/f/${form.id}`;
    navigator.clipboard.writeText(url);
    setCopiedFormId(form.id);
    toast.success('Form link copied to clipboard!');
    setTimeout(() => setCopiedFormId(null), 2000);
  };

  const handleLaunchCampaign = (form: CustomForm) => {
    const origin = window.location.origin;
    const formUrl = `${origin}/f/${form.id}`;
    // Redirect to JFU Ad Order Form with auto-filled URL
    navigate(`/dashboard/submit?survey_url=${encodeURIComponent(formUrl)}&title=${encodeURIComponent(form.title)}`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileSpreadsheet className="w-7 h-7 text-blue-600" />
            Form Builder
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Buat form kustom, sebar via link publik, dan kumpulkan respon secara real-time.
          </p>
        </div>

        <Button
          onClick={() => navigate('/dashboard/forms/new')}
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Buat Form Baru
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
          <p className="text-sm text-gray-500">Memuat form Anda...</p>
        </div>
      ) : forms.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12 text-center max-w-md mx-auto my-8">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Belum Ada Form</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-6">
            Mulai buat form pertama Anda secara cepat dengan editor intuitif.
          </p>
          <Button
            onClick={() => navigate('/dashboard/forms/new')}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Buat Form Baru
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {forms.map(form => {
            const isPublished = form.status === 'published';
            return (
              <div
                key={form.id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        isPublished
                          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                      }`}
                    >
                      {isPublished ? 'Published' : 'Draft'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(form.updated_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-gray-900 dark:text-white line-clamp-1 mb-1">
                    {form.title || 'Untitled Form'}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 h-8">
                    {form.description || 'Tidak ada deskripsi.'}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-300 font-medium mb-5 bg-gray-50 dark:bg-gray-700/50 p-2.5 rounded-lg">
                    <div>
                      Pertanyaan: <span className="font-bold text-gray-900 dark:text-white">{form.schema.length}</span>
                    </div>
                    <div className="border-r border-gray-300 dark:border-gray-600 h-3" />
                    <div>
                      Respon: <span className="font-bold text-blue-600 dark:text-blue-400">{form.response_count || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-gray-700">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/dashboard/forms/${form.id}/edit`)}
                      className="text-xs text-gray-700 dark:text-gray-200 flex items-center justify-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit Form
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/dashboard/forms/${form.id}/responses`)}
                      className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 flex items-center justify-center gap-1.5"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" /> Lihat Hasil
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyLink(form)}
                        className="h-8 text-xs text-gray-600 hover:text-blue-600 px-2"
                        title="Copy Public Link"
                      >
                        {copiedFormId === form.id ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 mr-1" />
                        )}
                        Copy Link
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(`/f/${form.id}`, '_blank')}
                        className="h-8 text-xs text-gray-600 hover:text-blue-600 px-2"
                        title="Preview Public Page"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLaunchCampaign(form)}
                        className="h-8 text-xs text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 font-medium"
                        title="Sebarkan survei ini via Jakpat App"
                      >
                        <Send className="w-3.5 h-3.5 mr-1" /> Sebar Survei
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(form.id, form.title)}
                        className="h-8 w-8 p-0 text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                        title="Hapus Form"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
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
