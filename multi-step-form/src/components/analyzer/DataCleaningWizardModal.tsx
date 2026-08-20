import React, { useState, useMemo } from 'react';
import type { DatasetSummary } from './types';
import type { CleaningRule, AnalysisGoalOption } from '../../utils/dataCleaningEngine';
import {
  Sparkles,
  Filter,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Layers,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  Users,
  BarChart2,
  Table as TableIcon,
  FileText
} from 'lucide-react';

interface DataCleaningWizardModalProps {
  isOpen: boolean;
  datasetSummary: DatasetSummary;
  rawRows: Record<string, string>[];
  initialRules: CleaningRule[];
  initialGoals: AnalysisGoalOption[];
  onConfirm: (
    activeRules: CleaningRule[],
    customFilters: string[],
    activeGoals: AnalysisGoalOption[]
  ) => void;
  onSkip: () => void;
}

export const DataCleaningWizardModal: React.FC<DataCleaningWizardModalProps> = ({
  isOpen,
  datasetSummary,
  rawRows,
  initialRules,
  initialGoals,
  onConfirm,
  onSkip
}) => {
  const [activeTab, setActiveTab] = useState<'cleaning' | 'goals'>('cleaning');
  const [rules, setRules] = useState<CleaningRule[]>(initialRules);
  const [goals, setGoals] = useState<AnalysisGoalOption[]>(initialGoals);
  const [customFilters, setCustomFilters] = useState<string[]>([]);
  const [newCustomInput, setNewCustomInput] = useState('');

  // Calculate live preview of cleaned rows count
  const estimatedCleanCount = useMemo(() => {
    let count = rawRows.length;
    let excluded = 0;

    rules.forEach(rule => {
      if (rule.enabled) {
        excluded += rule.affectedCount;
      }
    });

    return Math.max(0, count - excluded);
  }, [rawRows.length, rules]);

  if (!isOpen) return null;

  const toggleRule = (id: string) => {
    setRules(prev =>
      prev.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const toggleGoal = (id: string) => {
    setGoals(prev =>
      prev.map(g => (g.id === id ? { ...g, enabled: !g.enabled } : g))
    );
  };

  const addCustomFilter = () => {
    if (!newCustomInput.trim()) return;
    setCustomFilters(prev => [...prev, newCustomInput.trim()]);
    setNewCustomInput('');
  };

  const removeCustomFilter = (idx: number) => {
    setCustomFilters(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50/60 via-purple-50/30 to-white flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold mb-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>AI Data Comprehension &amp; Cleaning</span>
            </div>
            <h2 className="text-xl font-extrabold text-gray-900">
              Personalisasi Pembersihan &amp; Fokus Analisis
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              AI telah memindai <strong className="text-indigo-600 font-semibold">{datasetSummary.fileName}</strong> ({rawRows.length} respon mentah). Tentukan aturan data sebelum canvas digenerate.
            </p>
          </div>

          {/* Stat Pill */}
          <div className="hidden sm:flex flex-col items-end shrink-0 bg-white/90 border border-indigo-100 px-4 py-2 rounded-2xl shadow-2xs">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Estimasi Responden Valid</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-black text-indigo-600">{estimatedCleanCount}</span>
              <span className="text-xs text-gray-400">/ {rawRows.length} mentah</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 flex border-b border-gray-100 bg-gray-50/40">
          <button
            type="button"
            onClick={() => setActiveTab('cleaning')}
            className={`pb-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'cleaning'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>1. Pembersihan Data ({rules.filter(r => r.enabled).length} Aktif)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('goals')}
            className={`pb-3 px-4 text-xs font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'goals'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2. Target Output Canvas ({goals.filter(g => g.enabled).length} Terpilih)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {activeTab === 'cleaning' ? (
            <div className="space-y-5">
              {/* Screening & Missing Rules */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    Rekomendasi Pembersihan Otomatis oleh AI
                  </h3>
                  <span className="text-[11px] text-gray-400">Centang aturan yang ingin diterapkan</span>
                </div>

                {rules.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <strong className="block font-semibold">Data Bersih &amp; Konsisten</strong>
                      <p className="text-[11px] text-emerald-700">Tidak ditemukan indikasi anomali screening atau baris kosong yang signifikan.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rules.map(rule => (
                      <div
                        key={rule.id}
                        onClick={() => toggleRule(rule.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-4 ${
                          rule.enabled
                            ? 'bg-indigo-50/40 border-indigo-200 shadow-2xs'
                            : 'bg-gray-50/60 border-gray-200 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={() => toggleRule(rule.id)}
                            className="mt-1 w-4 h-4 text-indigo-600 rounded-md border-gray-300 focus:ring-indigo-500 cursor-pointer"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-900 text-xs">{rule.title}</span>
                              {rule.recommended && (
                                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                                  Rekomendasi AI
                                </span>
                              )}
                            </div>
                            <p className="text-gray-600 text-[11px] mt-1">{rule.description}</p>
                            <p className="text-gray-400 text-[10px] mt-1 italic">💡 {rule.reason}</p>
                          </div>
                        </div>

                        <span className="shrink-0 px-2.5 py-1 rounded-xl bg-amber-100 text-amber-800 font-bold text-[11px]">
                          -{rule.affectedCount} baris
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Custom Keyword Filters */}
              <div className="pt-2 border-t border-gray-100">
                <h4 className="font-bold text-gray-900 text-xs mb-2">Filter Tambahan (Opsional)</h4>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newCustomInput}
                    onChange={(e) => setNewCustomInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addCustomFilter(); }}
                    placeholder="Contoh: Hanya responden di pulau Jawa, atau kata kunci tertentu..."
                    className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addCustomFilter}
                    className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Tambah
                  </button>
                </div>

                {customFilters.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {customFilters.map((flt, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold"
                      >
                        <span>Filter: "{flt}"</span>
                        <button
                          type="button"
                          onClick={() => removeCustomFilter(idx)}
                          className="hover:text-red-500 p-0.5"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Target Goals Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Pilih Widget &amp; Narasi yang Ingin Digenerate ke Canvas
                </h3>
                <span className="text-[11px] text-gray-400">Centang output yang dibutuhkan</span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {goals.map(goal => (
                  <div
                    key={goal.id}
                    onClick={() => toggleGoal(goal.id)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      goal.enabled
                        ? 'bg-indigo-50/40 border-indigo-200 shadow-2xs'
                        : 'bg-gray-50/50 border-gray-200 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={goal.enabled}
                        onChange={() => toggleGoal(goal.id)}
                        className="mt-0.5 w-4 h-4 text-indigo-600 rounded-md border-gray-300 focus:ring-indigo-500 cursor-pointer"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-xs">{goal.title}</span>
                          {goal.recommended && (
                            <span className="px-2 py-0.2 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold">
                              Rekomendasi
                            </span>
                          )}
                        </div>
                        <p className="text-gray-500 text-[11px] mt-0.5">{goal.description}</p>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-xl bg-gray-100 text-gray-600 font-mono text-[10px] uppercase font-bold shrink-0">
                      {goal.blockType}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors"
          >
            Lewati Pembersihan (Gunakan Semua {rawRows.length} Data)
          </button>

          <div className="flex items-center gap-2">
            {activeTab === 'cleaning' ? (
              <button
                type="button"
                onClick={() => setActiveTab('goals')}
                className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <span>Lanjut ke Target Analisis</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('cleaning')}
                className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 text-xs font-bold transition-colors"
              >
                <span>Kembali ke Pembersihan</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onConfirm(rules, customFilters, goals)}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all hover:scale-101"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Generate Canvas ({estimatedCleanCount} Responden)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
