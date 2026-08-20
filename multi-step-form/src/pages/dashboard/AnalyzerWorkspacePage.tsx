import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../context/AuthContext';
import type {
  AnalysisProject,
  DatasetSummary,
  CanvasBlock,
  AnalyzerChatMessage,
  AnalyzerAiAction
} from '../../components/analyzer/types';
import { calculateCrossTab } from '../../utils/surveyCrossTab';
import { generateDeepSurveyStory, generateInitialCanvasBlocks } from '../../utils/analyzerAiAgent';
import { profileSurveyDataset } from '../../utils/surveyDataProfiler';
import {
  detectSmartCleaningRules,
  getRecommendedAnalysisGoals,
  applyDataCleaning,
  type CleaningRule,
  type AnalysisGoalOption
} from '../../utils/dataCleaningEngine';
import { CsvUploadDropzone } from '../../components/analyzer/CsvUploadDropzone';
import { AnalyzerCanvas } from '../../components/analyzer/AnalyzerCanvas';
import { AnalyzerCopilotSidebar } from '../../components/analyzer/AnalyzerCopilotSidebar';
import { DataCleaningWizardModal } from '../../components/analyzer/DataCleaningWizardModal';
import {
  ArrowLeft,
  Sparkles,
  Check,
  Copy,
  Loader2,
  FileSpreadsheet,
  PanelRightClose,
  PanelRightOpen,
  BrainCircuit,
  CheckCircle2,
  Search,
  BarChart3
} from 'lucide-react';
import { toast } from 'sonner';

function resolveCrossTabBlock(
  blockData: Partial<CanvasBlock>,
  rows: Record<string, string>[],
  summary: DatasetSummary | null
): Partial<CanvasBlock> {
  if (blockData.type !== 'crosstab') return blockData;

  if (blockData.crossTabConfig?.matrix && blockData.crossTabConfig.matrix.length > 0) {
    return blockData;
  }

  if (!rows || rows.length === 0 || !summary) return blockData;

  let rowVar = blockData.crossTabConfig?.rowVariable || '';
  let colVar = blockData.crossTabConfig?.colVariable || '';

  if (!rowVar || !colVar) {
    const title = blockData.title || '';
    const cleaned = title.replace(/^Tabulasi\s*Silang\s*[:\-]?\s*/i, '');
    const parts = cleaned.split(/\s+(?:vs|antara|dengan|dan|x)\s+/i);
    if (parts.length >= 2) {
      rowVar = parts[0].trim();
      colVar = parts[1].trim();
    } else {
      const demo = summary.detectedDemographics[0] || summary.columns[0]?.label;
      const other = summary.columns.find(c => c.label !== demo)?.label || summary.columns[1]?.label;
      rowVar = demo || '';
      colVar = other || '';
    }
  }

  if (rowVar && colVar) {
    const computed = calculateCrossTab(rows, rowVar, colVar);
    return {
      ...blockData,
      crossTabConfig: computed,
      narrative: blockData.narrative || `Tabulasi silang antara variabel **${computed.rowVariable}** dan **${computed.colVariable}** (${computed.totalCount} responden terdata).`
    };
  }

  return blockData;
}

export const AnalyzerWorkspacePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Deep Scanning State on Import
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [scanProgress, setScanProgress] = useState(10);

  // Wizard State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [pendingSummary, setPendingSummary] = useState<DatasetSummary | null>(null);
  const [pendingRawRows, setPendingRawRows] = useState<Record<string, string>[]>([]);
  const [wizardRules, setWizardRules] = useState<CleaningRule[]>([]);
  const [wizardGoals, setWizardGoals] = useState<AnalysisGoalOption[]>([]);

  // Project state
  const [projectTitle, setProjectTitle] = useState('Analisis Data Survei');
  const [datasetSummary, setDatasetSummary] = useState<DatasetSummary | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [canvasBlocks, setCanvasBlocks] = useState<CanvasBlock[]>([]);
  const [chatHistory, setChatHistory] = useState<AnalyzerChatMessage[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedAll, setCopiedAll] = useState(false);

  const isNew = id === 'new';
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Load project from Supabase if not new
  useEffect(() => {
    if (isNew) {
      setLoading(false);
      return;
    }

    const loadProject = async () => {
      try {
        const { data, error } = await supabase
          .from('survey_analyses')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          toast.error('Project tidak ditemukan');
          navigate('/dashboard/analyzer');
          return;
        }

        const project = data as AnalysisProject;
        setProjectTitle(project.title || 'Analisis Data Survei');
        setDatasetSummary(project.dataset_summary || null);
        setCanvasBlocks(project.canvas_blocks || []);
        setChatHistory(project.chat_history || []);
        setRawRows(project.raw_data_sample || []);
        setLastSaved(new Date(project.updated_at));
      } catch (err) {
        console.error('Error loading project:', err);
        toast.error('Gagal memuat project');
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [id, isNew, navigate]);

  // 2. Auto-save project changes when state changes
  const saveProjectToSupabase = async (
    title = projectTitle,
    summary = datasetSummary,
    blocks = canvasBlocks,
    history = chatHistory,
    sampleRows = rawRows
  ) => {
    if (!user || !summary || isNew) return;

    setSaving(true);
    try {
      const payload = {
        title,
        dataset_summary: summary,
        canvas_blocks: blocks,
        chat_history: history,
        raw_data_sample: sampleRows.slice(0, 100), // store up to 100 sample rows
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('survey_analyses')
        .update(payload)
        .eq('id', id);

      if (error) throw error;
      setLastSaved(new Date());
    } catch (err) {
      console.error('Error auto-saving:', err);
    } finally {
      setSaving(false);
    }
  };

  const scheduleSave = (
    title = projectTitle,
    summary = datasetSummary,
    blocks = canvasBlocks,
    history = chatHistory,
    sample = rawRows
  ) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveProjectToSupabase(title, summary, blocks, history, sample);
    }, 1200);
  };

  // 3. Handle initial CSV Data Upload -> Opens Personalization Wizard
  const handleCsvLoaded = async (summary: DatasetSummary, rows: Record<string, string>[]) => {
    setPendingSummary(summary);
    setPendingRawRows(rows);

    const rules = detectSmartCleaningRules(summary, rows);
    const goals = getRecommendedAnalysisGoals(summary);

    setWizardRules(rules);
    setWizardGoals(goals);
    setIsWizardOpen(true);
  };

  // 4. Execute Analysis Pipeline (with Cleaned Data & Selected Goals)
  const executeAnalysisPipeline = async (
    finalSummary: DatasetSummary,
    finalRows: Record<string, string>[],
    cleaningNotes: string[] = []
  ) => {
    setDatasetSummary(finalSummary);
    setRawRows(finalRows);

    const initialTitle = finalSummary.fileName
      ? `Analisis ${finalSummary.fileName.replace(/\.csv$/i, '').replace(/[-_]/g, ' ')}`
      : 'Analisis Data Survei';
    setProjectTitle(initialTitle);

    // Start animated AI Deep Scanning
    setIsScanning(true);
    setScanStep(0);
    setScanProgress(15);

    const timer1 = setTimeout(() => { setScanStep(1); setScanProgress(40); }, 900);
    const timer2 = setTimeout(() => { setScanStep(2); setScanProgress(70); }, 2200);
    const timer3 = setTimeout(() => { setScanStep(3); setScanProgress(90); }, 3800);

    try {
      const { blocks, welcomeMessage } = await generateDeepSurveyStory(finalSummary, finalRows);

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      const hydratedBlocks = blocks.map(b => resolveCrossTabBlock(b, finalRows, finalSummary) as CanvasBlock);

      setScanStep(3);
      setScanProgress(100);

      setTimeout(async () => {
        setCanvasBlocks(hydratedBlocks);

        let welcomeContent = welcomeMessage;
        if (cleaningNotes.length > 0 && cleaningNotes[0] !== 'Seluruh data mentah digunakan tanpa proses filter eliminasi.') {
          welcomeContent = `Halo! Saya telah melakukan pembersihan data (${finalRows.length} responden valid) dan menyusun canvas analisis lengkap di sebelah kiri.\n\n*Catatan Pembersihan:*\n` +
            cleaningNotes.map(n => `• ${n}`).join('\n') +
            `\n\nSilakan jelajahi grafik di canvas atau ajukan instruksi analisis lanjutan lewat chat ini!`;
        }

        const welcomeMsg: AnalyzerChatMessage = {
          id: `msg_welcome_${Date.now()}`,
          role: 'assistant',
          content: welcomeContent,
          timestamp: new Date().toISOString()
        };
        const newChat = [welcomeMsg];
        setChatHistory(newChat);
        setIsScanning(false);

        // If on /new route, create entry in Supabase and replace URL
        if (user && isNew) {
          try {
            const { data, error } = await supabase
              .from('survey_analyses')
              .insert({
                user_id: user.id,
                title: initialTitle,
                source_type: 'csv_upload',
                dataset_summary: finalSummary,
                raw_data_sample: finalRows.slice(0, 100),
                canvas_blocks: hydratedBlocks,
                chat_history: newChat
              })
              .select('id')
              .single();

            if (!error && data?.id) {
              navigate(`/dashboard/analyzer/${data.id}`, { replace: true });
            }
          } catch (e) {
            console.error('Error creating new analysis project:', e);
          }
        }
      }, 700);
    } catch (err) {
      console.error('Error during deep analysis:', err);
      setIsScanning(false);
    }
  };

  // 5. Wizard Actions
  const handleConfirmWizard = (
    activeRules: CleaningRule[],
    customFilters: string[],
    activeGoals: AnalysisGoalOption[]
  ) => {
    if (!pendingSummary || pendingRawRows.length === 0) return;

    setIsWizardOpen(false);

    // Apply cleaning rules
    const { cleanedRows, excludedCount, cleaningSummaryNotes } = applyDataCleaning(
      pendingRawRows,
      activeRules,
      customFilters
    );

    if (excludedCount > 0) {
      toast.success(`Pembersihan data selesai: ${cleanedRows.length} responden valid (${excludedCount} dieleminasi).`);
    }

    // Reprofile summary with cleaned rows
    const headers = pendingSummary.columns.map(c => c.label);
    const cleanedSummary = profileSurveyDataset(pendingSummary.fileName, headers, cleanedRows);

    executeAnalysisPipeline(cleanedSummary, cleanedRows, cleaningSummaryNotes);
  };

  const handleSkipWizard = () => {
    if (!pendingSummary || pendingRawRows.length === 0) return;
    setIsWizardOpen(false);
    executeAnalysisPipeline(pendingSummary, pendingRawRows);
  };

  // 4. Block Manipulations
  const handleRemoveBlock = (blockId: string) => {
    const updated = canvasBlocks.filter(b => b.id !== blockId);
    setCanvasBlocks(updated);
    scheduleSave(projectTitle, datasetSummary, updated, chatHistory, rawRows);
    toast.success('Widget berhasil dihapus');
  };

  const handleMoveBlock = (blockId: string, direction: 'up' | 'down') => {
    const idx = canvasBlocks.findIndex(b => b.id === blockId);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === canvasBlocks.length - 1) return;

    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const updated = [...canvasBlocks];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;

    setCanvasBlocks(updated);
    scheduleSave(projectTitle, datasetSummary, updated, chatHistory, rawRows);
  };

  const handleUpdateBlockNarrative = (blockId: string, newNarrative: string) => {
    const updated = canvasBlocks.map(b =>
      b.id === blockId ? { ...b, narrative: newNarrative } : b
    );
    setCanvasBlocks(updated);
    scheduleSave(projectTitle, datasetSummary, updated, chatHistory, rawRows);
  };

  // Auto-hydrate any existing crosstab blocks with missing matrix
  useEffect(() => {
    if (rawRows.length > 0 && canvasBlocks.some(b => b.type === 'crosstab' && (!b.crossTabConfig?.matrix || b.crossTabConfig.matrix.length === 0))) {
      const repaired = canvasBlocks.map(b => {
        if (b.type === 'crosstab' && (!b.crossTabConfig?.matrix || b.crossTabConfig.matrix.length === 0)) {
          const resolved = resolveCrossTabBlock(b, rawRows, datasetSummary);
          return { ...b, ...resolved } as CanvasBlock;
        }
        return b;
      });
      setCanvasBlocks(repaired);
      scheduleSave(projectTitle, datasetSummary, repaired, chatHistory, rawRows);
    }
  }, [rawRows, datasetSummary]);

  // 5. Apply AI Actions to Canvas
  const handleApplyAiActions = (actions: AnalyzerAiAction[]) => {
    let updatedBlocks = [...canvasBlocks];

    actions.forEach(action => {
      if (action.action === 'add_block' && action.block) {
        const rawBlock = resolveCrossTabBlock(action.block, rawRows, datasetSummary);
        const blockToAdd: CanvasBlock = {
          id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: rawBlock.type || 'narrative',
          title: rawBlock.title || 'Temuan Analisis',
          narrative: rawBlock.narrative,
          chartConfig: rawBlock.chartConfig,
          crossTabConfig: rawBlock.crossTabConfig,
          metricConfig: rawBlock.metricConfig,
          createdAt: new Date().toISOString()
        };
        updatedBlocks.push(blockToAdd);
      } else if (action.action === 'replace_all_blocks' && action.block) {
        const rawBlock = resolveCrossTabBlock(action.block, rawRows, datasetSummary);
        updatedBlocks = [{
          id: `block_${Date.now()}`,
          type: rawBlock.type || 'narrative',
          title: rawBlock.title || 'Laporan Analisis Baru',
          narrative: rawBlock.narrative,
          chartConfig: rawBlock.chartConfig,
          crossTabConfig: rawBlock.crossTabConfig,
          metricConfig: rawBlock.metricConfig,
          createdAt: new Date().toISOString()
        }];
      } else if (action.action === 'remove_block' && action.blockId) {
        updatedBlocks = updatedBlocks.filter(b => b.id !== action.blockId);
      }
    });

    setCanvasBlocks(updatedBlocks);
    scheduleSave(projectTitle, datasetSummary, updatedBlocks, chatHistory, rawRows);
    toast.success('Canvas telah diperbarui oleh AI');
  };

  const handleAddChatMessage = (msg: AnalyzerChatMessage) => {
    const updated = [...chatHistory, msg];
    setChatHistory(updated);
    scheduleSave(projectTitle, datasetSummary, canvasBlocks, updated, rawRows);
  };

  // 6. Copy All Narasi
  const handleCopyAllNarratives = () => {
    const narratives = canvasBlocks
      .filter(b => b.narrative)
      .map(b => `### ${b.title}\n\n${b.narrative}`)
      .join('\n\n---\n\n');

    if (!narratives) {
      toast.error('Belum ada narasi pada canvas untuk disalin.');
      return;
    }

    navigator.clipboard.writeText(narratives)
      .then(() => {
        setCopiedAll(true);
        toast.success('Seluruh draf narasi laporan riset berhasil disalin!');
        setTimeout(() => setCopiedAll(false), 2500);
      })
      .catch(() => toast.error('Gagal menyalin teks'));
  };

  if (loading) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center text-gray-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-xs">Memuat workspace analisis...</p>
      </div>
    );
  }

  // 7. If scanning in progress
  if (isScanning && datasetSummary) {
    const scanSteps = [
      'Membaca struktur kolom & profil demografi responden...',
      'Menganalisis frekuensi, tabulasi silang & korelasi data...',
      'Menemukan pola anomali & key findings paling signifikan...',
      'Menyusun narasi akademis Bab 4 & visualisasi interaktif...'
    ];

    return (
      <div className="min-h-[85vh] flex items-center justify-center p-6 bg-gradient-to-b from-indigo-50/40 via-white to-gray-50/50">
        <div className="w-full max-w-lg bg-white rounded-3xl border border-indigo-100/80 p-8 shadow-xl text-center relative overflow-hidden">
          {/* Top glow decoration */}
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-48 bg-indigo-500/15 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center">
            {/* Pulsing AI Icon Orb */}
            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 animate-pulse">
                <BrainCircuit className="w-10 h-10" />
              </div>
              <div className="absolute -inset-1.5 rounded-3xl bg-indigo-400/20 animate-ping -z-10" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-3 border border-indigo-100">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Ask JFU AI · Deep Data Scanning</span>
            </div>

            <h2 className="text-xl font-bold text-gray-900 mb-1.5">
              Menganalisis Pola &amp; Menemukan Insight Data
            </h2>
            <p className="text-xs text-gray-500 max-w-sm mb-6">
              AI sedang memproses <strong className="text-indigo-600 font-semibold">{datasetSummary.totalRows} responden</strong> dan <strong className="text-indigo-600 font-semibold">{datasetSummary.totalColumns} variabel</strong> untuk menyusun storytelling analisis secara otomatis.
            </p>

            {/* Progress Bar */}
            <div className="w-full bg-gray-100 rounded-full h-2.5 mb-6 overflow-hidden p-0.5 border border-gray-200/60">
              <div
                className="bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${scanProgress}%` }}
              />
            </div>

            {/* Stepper Checklist */}
            <div className="w-full space-y-2.5 text-left bg-gray-50/70 p-4 rounded-2xl border border-gray-100">
              {scanSteps.map((stepText, idx) => {
                const isPassed = scanStep > idx;
                const isCurrent = scanStep === idx;

                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-2.5 text-xs transition-colors ${
                      isPassed
                        ? 'text-emerald-700 font-medium'
                        : isCurrent
                        ? 'text-indigo-700 font-bold animate-pulse'
                        : 'text-gray-400'
                    }`}
                  >
                    {isPassed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-gray-300 shrink-0" />
                    )}
                    <span className="truncate">{stepText}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If no dataset loaded yet (e.g. on /new)
  if (!datasetSummary) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <button
          type="button"
          onClick={() => navigate('/dashboard/analyzer')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar Project</span>
        </button>

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            JFU Survey Data Analyzer
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900">
            Upload Data Respon Survei untuk Memulai
          </h1>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
            Data Anda diproses secara aman di sisi klien browser dan siap diolah bersama AI Copilot.
          </p>
        </div>

        <CsvUploadDropzone onDataLoaded={handleCsvLoaded} />

        {pendingSummary && (
          <DataCleaningWizardModal
            isOpen={isWizardOpen}
            datasetSummary={pendingSummary}
            rawRows={pendingRawRows}
            initialRules={wizardRules}
            initialGoals={wizardGoals}
            onConfirm={handleConfirmWizard}
            onSkip={handleSkipWizard}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-50/50">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between gap-4 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/dashboard/analyzer')}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors shrink-0"
            title="Kembali ke Daftar Project"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <input
              type="text"
              value={projectTitle}
              onChange={(e) => {
                setProjectTitle(e.target.value);
                scheduleSave(e.target.value, datasetSummary, canvasBlocks, chatHistory, rawRows);
              }}
              className="font-bold text-sm text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-500 focus:outline-none px-1 py-0.5 max-w-[240px] sm:max-w-xs truncate"
              placeholder="Nama Project Analisis"
            />

            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px] font-mono shrink-0">
              <FileSpreadsheet className="w-3 h-3 text-indigo-500" />
              {datasetSummary.totalRows} resp · {datasetSummary.totalColumns} var
            </span>
          </div>
        </div>

        {/* Action Header Buttons */}
        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex text-[11px] text-gray-400 items-center gap-1">
            {saving ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                <span>Menyimpan...</span>
              </>
            ) : lastSaved ? (
              <>
                <Check className="w-3 h-3 text-emerald-500" />
                <span>Tersimpan</span>
              </>
            ) : null}
          </span>

          <button
            type="button"
            onClick={handleCopyAllNarratives}
            className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-all inline-flex items-center gap-1.5 shrink-0 border border-indigo-200/50"
          >
            {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedAll ? 'Tersalin' : 'Copy Semua Narasi'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-2 rounded-xl border text-xs font-medium transition-colors shrink-0 ${
              sidebarOpen
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
            title={sidebarOpen ? 'Tutup AI Copilot' : 'Buka AI Copilot'}
          >
            {sidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Workspace: Left Canvas + Right Copilot Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left / Center Canvas Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <AnalyzerCanvas
            blocks={canvasBlocks}
            onRemoveBlock={handleRemoveBlock}
            onMoveBlock={handleMoveBlock}
            onUpdateBlockNarrative={handleUpdateBlockNarrative}
          />
        </main>

        {/* Right AI Copilot Sidebar */}
        {sidebarOpen && (
          <aside className="w-80 md:w-96 shrink-0 h-full">
            <AnalyzerCopilotSidebar
              datasetSummary={datasetSummary}
              currentBlocks={canvasBlocks}
              chatHistory={chatHistory}
              onAddChatMessage={handleAddChatMessage}
              onApplyAiActions={handleApplyAiActions}
            />
          </aside>
        )}
      </div>
    </div>
  );
};
