import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CustomForm, CustomFormResponse } from '../../utils/customForms';
import {
  getCustomFormById,
  getFormResponses,
  exportResponsesToCSV
} from '../../utils/customForms';
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Users,
  Send,
  Loader2,
  Calendar,
  ExternalLink
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

export const FormResponsesPage: React.FC = () => {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();

  const [form, setForm] = useState<CustomForm | null>(null);
  const [responses, setResponses] = useState<CustomFormResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');

  const loadFormAndResponses = async () => {
    if (!formId) return;
    try {
      setLoading(true);
      const formData = await getCustomFormById(formId);
      if (!formData) {
        toast.error('Form not found');
        navigate('/dashboard/forms');
        return;
      }
      setForm(formData);

      const respData = await getFormResponses(formId);
      setResponses(respData);
    } catch (err) {
      toast.error('Failed to load response data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFormAndResponses();
  }, [formId]);

  const handleExportCSV = () => {
    if (!form || !responses.length) {
      toast.error('No response data to export');
      return;
    }
    exportResponsesToCSV(form.title, form.schema, responses);
    toast.success('CSV export started!');
  };

  const handleLaunchCampaign = () => {
    if (!form) return;
    navigate(`/dashboard/submit?custom_form_id=${form.id}`);
  };

  const filteredResponses = responses.filter(r => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return Object.values(r.answers).some(val =>
      String(val).toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
        <p className="text-sm text-gray-500">Memuat hasil respon survei...</p>
      </div>
    );
  }

  if (!form) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard/forms')}
            className="h-9 w-9 p-0"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {form.title}
              </h1>
              <span className="text-xs bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-2.5 py-0.5 rounded-full font-medium">
                Hasil Respon
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Dibuat pada {new Date(form.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/f/${form.id}`, '_blank')}
            className="text-xs text-gray-700 dark:text-gray-200"
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Buka Form
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLaunchCampaign}
            className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" /> Sebar via Jakpat
          </Button>

          <Button
            size="sm"
            onClick={handleExportCSV}
            disabled={!responses.length}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export ke CSV
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Total Respon</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{responses.length}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Jumlah Pertanyaan</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{form.schema.length}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Respon Terakhir</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
              {responses.length > 0
                ? new Date(responses[0].created_at).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Responses Data Table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        {/* Table Search Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-4">
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Cari dalam jawabaan responden..."
            className="text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 w-72 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500">
            Menampilkan {filteredResponses.length} dari {responses.length} responden
          </p>
        </div>

        {responses.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="font-semibold text-sm">Belum ada respon yang masuk</p>
            <p className="text-xs text-gray-400 mt-1">
              Bagikan link form publik Anda untuk mulai mengumpulkan respon.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="p-3.5 whitespace-nowrap w-12">#</th>
                  <th className="p-3.5 whitespace-nowrap min-w-[140px]">Waktu Isian</th>
                  {form.schema.map(q => (
                    <th key={q.id} className="p-3.5 whitespace-nowrap min-w-[180px]">
                      {q.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-gray-800 dark:text-gray-200">
                {filteredResponses.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="p-3.5 font-medium text-gray-400">{idx + 1}</td>
                    <td className="p-3.5 whitespace-nowrap text-gray-500">
                      {new Date(r.created_at).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    {form.schema.map(q => {
                      const ans = r.answers[q.id];
                      let displayVal = '-';
                      if (ans !== undefined && ans !== null) {
                        displayVal = Array.isArray(ans) ? ans.join(', ') : String(ans);
                      }
                      return (
                        <td key={q.id} className="p-3.5 max-w-xs truncate" title={displayVal}>
                          {displayVal}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
