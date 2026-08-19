import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../context/AuthContext';
import type { AnalysisProject } from '../../components/analyzer/types';
import {
  Sparkles,
  BarChart3,
  Plus,
  Trash2,
  Clock,
  FileSpreadsheet,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export const AnalyzerListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState<AnalysisProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchProjects = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('survey_analyses')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        // If table doesn't exist yet or other query error, gracefully fallback
        console.warn('Could not fetch survey_analyses:', error);
        setProjects([]);
      } else {
        setProjects(data as AnalysisProject[] || []);
      }
    } catch (err) {
      console.error('Error fetching survey analyses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [user]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Hapus project analisis ini?')) return;

    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('survey_analyses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setProjects(prev => prev.filter(p => p.id !== id));
      toast.success('Project analisis berhasil dihapus.');
    } catch (err) {
      console.error('Error deleting project:', err);
      toast.error('Gagal menghapus project.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 text-white p-6 md:p-8 mb-8 shadow-lg">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-indigo-200 mb-3 border border-white/10">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>JFU Survey Data Analyzer · AI Copilot</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mb-2">
              Olah Data Survei &amp; Buat Bab 4 Skripsi Instan
            </h1>
            <p className="text-sm text-indigo-100/80 leading-relaxed">
              Upload file CSV kuesioner Anda, dapatkan tabulasi silang, visualisasi grafik, dan draf narasi akademik Bab 4 yang siap di-copy ke laporan penelitian.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/dashboard/analyzer/new')}
            className="px-5 py-3 rounded-2xl bg-white text-indigo-900 hover:bg-indigo-50 font-bold text-sm shadow-md transition-all flex items-center gap-2 shrink-0 active:scale-95"
          >
            <Plus className="w-4 h-4 text-indigo-600" />
            <span>Mulai Analisis Baru</span>
          </button>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Projects Section */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Project Analisis Saya</h2>
          <p className="text-xs text-gray-500">Daftar canvas data survei yang pernah Anda buat</p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-xs">Memuat daftar analisis...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mx-auto mb-4">
            <BarChart3 className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-gray-900 mb-1">Belum Ada Project Analisis</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto mb-6">
            Upload file CSV kuesioner Anda untuk mulai menganalisis korelasi, membuat tabulasi silang, dan menyusun draf narasi skripsi dengan AI.
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/analyzer/new')}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-500/20 transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Upload CSV &amp; Mulai Analisis
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map(p => {
            const summary = p.dataset_summary;
            const blockCount = p.canvas_blocks?.length || 0;
            return (
              <div
                key={p.id}
                onClick={() => navigate(`/dashboard/analyzer/${p.id}`)}
                className="group relative bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs hover:shadow-lg hover:border-indigo-300 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
                      <FileSpreadsheet className="w-3 h-3" />
                      {p.source_type === 'custom_form' ? 'JFU Form' : 'CSV Dataset'}
                    </span>
                    <button
                      type="button"
                      disabled={deletingId === p.id}
                      onClick={(e) => handleDelete(e, p.id)}
                      className="text-gray-300 hover:text-red-600 p-1 rounded-md transition-colors"
                      title="Hapus Project"
                    >
                      {deletingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <h3 className="font-bold text-base text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-1 mb-1">
                    {p.title || 'Untitled Analysis'}
                  </h3>

                  <p className="text-xs text-gray-500 line-clamp-1 mb-4">
                    {summary?.fileName || 'Dataset Survei'}
                  </p>
                </div>

                <div className="pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between text-[11px] text-gray-500 mb-2">
                    <span>{summary?.totalRows || 0} Responden</span>
                    <span>•</span>
                    <span>{summary?.totalColumns || 0} Variabel</span>
                    <span>•</span>
                    <span className="font-medium text-indigo-600">{blockCount} Widget</span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(p.updated_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="font-semibold text-indigo-600 flex items-center gap-0.5 group-hover:translate-x-1 transition-transform">
                      Buka Canvas <ArrowRight className="w-3 h-3" />
                    </span>
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
