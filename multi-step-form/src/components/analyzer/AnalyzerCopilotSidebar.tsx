import React, { useState, useRef, useEffect } from 'react';
import type { DatasetSummary, AnalyzerChatMessage, CanvasBlock } from './types';
import { sendAnalyzerAiPrompt } from '../../utils/analyzerAiAgent';
import {
  Sparkles,
  Send,
  Loader2,
  Users,
  BarChart2,
  Table as TableIcon,
  FileText,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

interface AnalyzerCopilotSidebarProps {
  datasetSummary: DatasetSummary;
  currentBlocks: CanvasBlock[];
  chatHistory: AnalyzerChatMessage[];
  onAddChatMessage: (msg: AnalyzerChatMessage) => void;
  onApplyAiActions: (actions: any[]) => void;
}

const QUICK_PROMPT_CHIPS = [
  {
    icon: Users,
    label: 'Analisis Demografi Responden',
    prompt: 'Analisis profil demografi responden (Gender, Usia, Fakultas/Jurusan) dan tampilkan grafiknya beserta narasi deskripsi sampel.'
  },
  {
    icon: BarChart2,
    label: 'Analisis Tingkat Kepuasan/Variabel Utama',
    prompt: 'Analisis pertanyaan skala likert dan variabel utama. Tampilkan grafik distribusi jawaban dan narasi akademiknya.'
  },
  {
    icon: TableIcon,
    label: 'Tabulasi Silang (Cross-tab)',
    prompt: 'Buatkan tabulasi silang (cross-tabulation) antara variabel demografi dengan variabel kepuasan/pilihan utama responden.'
  },
  {
    icon: FileText,
    label: 'Draf Pembahasan Bab 4 Skripsi',
    prompt: 'Susun draf narasi komprehensif Bab 4 Hasil dan Pembahasan berdasarkan temuan data di atas dengan gaya bahasa ilmiah akademik.'
  },
  {
    icon: HelpCircle,
    label: 'Kesimpulan & Saran (Bab 5)',
    prompt: 'Buatkan kesimpulan utama dan saran praktis untuk penelitian ini berdasarkan data yang ada untuk Bab 5.'
  }
];

export const AnalyzerCopilotSidebar: React.FC<AnalyzerCopilotSidebarProps> = ({
  datasetSummary,
  currentBlocks,
  chatHistory,
  onAddChatMessage,
  onApplyAiActions
}) => {
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, loading]);

  const handleSend = async (customPrompt?: string) => {
    const text = (customPrompt || inputPrompt).trim();
    if (!text || loading) return;

    const userMsg: AnalyzerChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };

    onAddChatMessage(userMsg);
    if (!customPrompt) setInputPrompt('');
    setLoading(true);

    try {
      const response = await sendAnalyzerAiPrompt(
        [...chatHistory, userMsg],
        datasetSummary,
        currentBlocks
      );

      const aiMsg: AnalyzerChatMessage = {
        id: `msg_${Date.now()}_ai`,
        role: 'assistant',
        content: response.message || 'Analisis telah diperbarui pada canvas.',
        timestamp: new Date().toISOString()
      };

      onAddChatMessage(aiMsg);

      if (response.actions && response.actions.length > 0) {
        onApplyAiActions(response.actions);
      }
    } catch (err: any) {
      console.error('Error sending AI prompt:', err);
      toast.error('Gagal menghubungi AI Assistant.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              Ask JFU AI <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded-full font-semibold">Beta</span>
            </h3>
            <p className="text-[11px] text-gray-500">Research & Data Analyst</p>
          </div>
        </div>
      </div>

      {/* Quick Prompts List */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/30">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Saran Analisis Cepat</p>
        <div className="flex flex-col gap-1.5">
          {QUICK_PROMPT_CHIPS.map((chip, idx) => {
            const Icon = chip.icon;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(chip.prompt)}
                disabled={loading}
                className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-700 hover:text-indigo-700 hover:bg-indigo-50/80 border border-gray-200/60 hover:border-indigo-200 transition-all disabled:opacity-50"
              >
                <Icon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="truncate">{chip.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat Messages Log */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {chatHistory.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-400">
            <p>Belum ada riwayat obrolan.</p>
            <p className="mt-1">Pilih salah satu saran prompt di atas atau ketik perintah analisismu di bawah.</p>
          </div>
        ) : (
          chatHistory.map(msg => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-gray-100 text-gray-800 rounded-bl-none'
                }`}
              >
                {msg.content}
              </div>
              <span className="text-[9px] text-gray-400 mt-1 px-1">
                {new Date(msg.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 p-3 rounded-2xl rounded-bl-none max-w-[85%] animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            <span>AI sedang menganalisis dataset &amp; menyusun canvas...</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input Box */}
      <div className="p-3.5 border-t border-gray-100 bg-white">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            disabled={loading}
            placeholder="Tanya atau suruh AI olah data..."
            className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-gray-50"
          />
          <button
            type="submit"
            disabled={!inputPrompt.trim() || loading}
            className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 shadow-xs"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* JFU Form Upsell Footer Notice */}
        <div className="mt-3 pt-2.5 border-t border-gray-100 text-center">
          <Link
            to="/dashboard/forms"
            className="group text-[11px] text-gray-500 hover:text-indigo-600 inline-flex items-center gap-1 transition-colors"
          >
            <span>💡 Mau survei langsung teranalisis tanpa upload CSV? Pakai <strong>JFU Form</strong></span>
            <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-indigo-500" />
          </Link>
        </div>
      </div>
    </div>
  );
};
