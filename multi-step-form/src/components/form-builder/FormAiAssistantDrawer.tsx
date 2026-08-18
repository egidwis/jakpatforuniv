import React, { useState, useRef, useEffect } from 'react';
import type { QuestionBlock } from '../../utils/customForms';
import type { ChatMessage, AiAction } from '../../utils/formAiAgent';
import { sendFormAiPrompt } from '../../utils/formAiAgent';
import { extractFormInfoWithWorker, extractFormInfoFallback, isWorkerSupported } from '../../utils/worker-service';
import { useAuth } from '../../context/AuthContext';
import {
  Sparkles,
  X,
  ArrowUp,
  Loader2,
  CheckCircle2,
  PlusCircle,
  MinusCircle,
  Edit3,
  Paperclip,
  FileSpreadsheet,
  Link as LinkIcon
} from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';

// Contoh prompt yang bergantian di placeholder input kosong
const PLACEHOLDER_EXAMPLES = [
  'Buatkan aku survey tentang kepuasan pelanggan...',
  'Convert link Google Form ini jadi form JFU...',
  'Tambahkan pertanyaan rating 1-5 di akhir...'
];

const GOOGLE_FORM_LINK_REGEX = /https?:\/\/(?:docs\.google\.com\/forms|forms\.gle)\/\S+/i;

interface FormAiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  formState: { title: string; description: string; blocks: QuestionBlock[] };
  onApplyActions: (actions: AiAction[]) => void;
}

export const FormAiAssistantDrawer: React.FC<FormAiAssistantDrawerProps> = ({
  isOpen,
  onClose,
  formState,
  onApplyActions
}) => {
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Researcher';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('AI sedang merancang form...');
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex(prev => (prev + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  if (!isOpen) return null;

  // Ambil judul/deskripsi/pertanyaan dari link Google Form publik (tanpa perlu
  // login) lewat Web Worker + proxy CORS, dengan fallback jika worker gagal.
  const scrapeGoogleForm = async (url: string) => {
    if (isWorkerSupported()) {
      try {
        return await extractFormInfoWithWorker(url);
      } catch (err) {
        console.warn('Worker extraction failed, falling back:', err);
      }
    }
    return extractFormInfoFallback(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Hanya file .csv yang didukung saat ini.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({ name: file.name, content: String(reader.result || '') });
    };
    reader.onerror = () => {
      toast.error('Gagal membaca file. Silakan coba lagi.');
    };
    reader.readAsText(file);
  };

  const handleSend = async (customText?: string) => {
    const text = (customText || inputPrompt).trim();
    const file = attachedFile;
    if ((!text && !file) || loading) return;

    const displayText = text || `Import pertanyaan dari file "${file?.name}"`;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'user',
      text: displayText,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setInputPrompt('');
    setAttachedFile(null);
    setLoading(true);
    setLoadingLabel('AI sedang merancang form...');

    try {
      let effectiveFileContext = file ? { fileName: file.name, content: file.content } : undefined;

      // Kalau user tempel link Google Form langsung di chat (bukan attach file),
      // baca isinya dulu lewat scraper publik, lalu suntikkan sebagai context AI.
      const googleFormUrl = !file ? text.match(GOOGLE_FORM_LINK_REGEX)?.[0] : undefined;
      if (googleFormUrl) {
        setLoadingLabel('Membaca Google Form...');
        try {
          const info = await scrapeGoogleForm(googleFormUrl);
          effectiveFileContext = {
            fileName: `Google Form: ${info.title || 'Untitled Form'}`,
            content: JSON.stringify(
              { title: info.title, description: info.description, questions: info.apiData?.questions || [] },
              null,
              2
            )
          };
          setLoadingLabel('AI sedang merancang form...');
        } catch (scrapeErr) {
          console.error('Google Form scrape failed:', scrapeErr);
          const errorMessage: ChatMessage = {
            id: crypto.randomUUID(),
            sender: 'ai',
            text: 'Gagal membaca link Google Form itu — mungkin form-nya tidak publik, atau linknya tidak valid. Pastikan akses form-nya "Siapa saja yang memiliki link", atau coba upload sebagai .csv.',
            timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          };
          setMessages(prev => [...prev, errorMessage]);
          setLoading(false);
          return;
        }
      }

      // Format chat history for OpenRouter
      const history = messages.map(m => ({
        role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.text
      }));
      history.push({ role: 'user', content: displayText });

      const aiResponse = await sendFormAiPrompt(
        history,
        formState,
        effectiveFileContext
      );

      const aiMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'ai',
        text: aiResponse.message,
        actions: aiResponse.actions,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, aiMessage]);

      if (aiResponse.actions && aiResponse.actions.length > 0) {
        onApplyActions(aiResponse.actions);
        toast.success('Perubahan dari AI telah diterapkan ke formulir!');

        // Di mobile/tablet (bottom sheet), auto-tutup sebentar setelah AI selesai
        // supaya user langsung lihat hasilnya di canvas — bukan harus sadar
        // sendiri untuk menutup sheet-nya secara manual.
        if (window.innerWidth < 1024) {
          setTimeout(() => onClose(), 900);
        }
      }
    } catch (err) {
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'ai',
        text: 'Maaf, terjadi kendala saat memproses permintaan Anda. Silakan coba lagi.',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const renderActionBadge = (act: AiAction, idx: number) => {
    let icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
    let text = 'Aksi diterapkan';

    if (act.type === 'ADD_BLOCK') {
      icon = <PlusCircle className="w-3.5 h-3.5 text-blue-600" />;
      text = `Added 1 block (${act.block?.type || 'question'})`;
    } else if (act.type === 'REMOVE_BLOCK') {
      icon = <MinusCircle className="w-3.5 h-3.5 text-rose-600" />;
      text = `Removed 1 block`;
    } else if (act.type === 'UPDATE_BLOCK') {
      icon = <Edit3 className="w-3.5 h-3.5 text-amber-600" />;
      text = `Updated question`;
    } else if (act.type === 'SET_TITLE') {
      icon = <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />;
      text = `Set form title`;
    } else if (act.type === 'REPLACE_ALL') {
      icon = <Sparkles className="w-3.5 h-3.5 text-emerald-600" />;
      text = `Generated ${act.blocks?.length || 0} questions`;
    }

    return (
      <div key={idx} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 font-medium">
        {icon}
        <span>{text}</span>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2 mx-auto">
          <h2 className="font-bold text-sm text-gray-900 dark:text-white">Ask JFU AI</h2>
          <span className="text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-600">
            Beta
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700 dark:hover:text-white"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Main Chat & Welcome Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {messages.length === 0 ? (
          <div className="pt-8 pb-4 flex flex-col items-center text-center space-y-4">
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Hey {userName}! ✨
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Let's build a form together.
              </p>
            </div>

            {/* Prominent Tally-style Prompt Box when empty */}
            <div className="w-full bg-white dark:bg-gray-700/50 border-2 border-blue-400 dark:border-blue-500/80 rounded-2xl p-3 shadow-sm transition-all text-left">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />

              {attachedFile && (
                <div className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[11px] font-medium px-2.5 py-1.5 rounded-lg mb-2">
                  <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1">{attachedFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedFile(null)}
                    className="p-0.5 text-blue-400 hover:text-rose-600 rounded-full transition-colors shrink-0"
                    title="Hapus lampiran"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              <textarea
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]}
                rows={3}
                className="w-full text-xs bg-transparent border-none focus:outline-none resize-none text-gray-800 dark:text-white placeholder-gray-400"
              />
              <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-600/50 mt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-7 px-2 text-gray-400 hover:text-gray-600 flex items-center gap-1.5"
                  title="Import .CSV dari form lain (G-Form, dan lainnya)"
                >
                  <Paperclip className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] font-medium">Import dari Form lain (Gform, dll) .CSV</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleSend()}
                  disabled={loading || (!inputPrompt.trim() && !attachedFile)}
                  className="h-7 w-7 p-0 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm"
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowUp className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 pt-2">
                <LinkIcon className="w-3 h-3 shrink-0" />
                Atau tempel link Google Form publik langsung di sini
              </p>
            </div>

            {/* Suggested Prompts */}
            <div className="w-full pt-4 space-y-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left px-1">
                Saran Prompt:
              </p>
              <div className="flex flex-col gap-2 text-left">
                <button
                  type="button"
                  onClick={() => handleSend('Buatkan survei evaluasi perkuliahan semester dengan 4 pertanyaan')}
                  className="text-xs bg-gray-50 dark:bg-gray-700/60 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-xl p-3 text-left transition-colors font-medium flex items-center justify-between group"
                >
                  <span>✨ Survei Evaluasi Perkuliahan</span>
                  <ArrowUp className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all" />
                </button>
                <button
                  type="button"
                  onClick={() => handleSend('Tambahkan opsi "Lainnya" (isi manual) pada pertanyaan pilihan ganda')}
                  className="text-xs bg-gray-50 dark:bg-gray-700/60 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-xl p-3 text-left transition-colors font-medium flex items-center justify-between group"
                >
                  <span>➕ Tambah Opsi "Lainnya" (Input Manual)</span>
                  <ArrowUp className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all" />
                </button>
                <button
                  type="button"
                  onClick={() => handleSend('Tambahkan pertanyaan rating kepuasan 1-5 di bagian akhir')}
                  className="text-xs bg-gray-50 dark:bg-gray-700/60 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-xl p-3 text-left transition-colors font-medium flex items-center justify-between group"
                >
                  <span>⭐ Tambah Pertanyaan Rating 1-5</span>
                  <ArrowUp className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Active Chat Thread */
          messages.map((m) => {
            const isUser = m.sender === 'user';
            return (
              <div
                key={m.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl p-3.5 text-xs leading-relaxed ${isUser
                    ? 'bg-blue-600 text-white rounded-br-none shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700/80 text-gray-800 dark:text-gray-200 rounded-bl-none border border-gray-200/60 dark:border-gray-600'
                    }`}
                >
                  <p className="whitespace-pre-line">{m.text}</p>

                  {/* Render Action Badges */}
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-gray-200 dark:border-gray-600 space-y-1.5">
                      {m.actions.map((act, idx) => renderActionBadge(act, idx))}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-gray-400 mt-1 px-1">{m.timestamp}</span>
              </div>
            );
          })
        )}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-700/40 p-3 rounded-2xl max-w-[80%]">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            <span>{loadingLabel}</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Sticky Bottom Input Bar when Chat Thread is active */}
      {messages.length > 0 && (
        <div className="shrink-0 p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-end gap-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all"
          >
            <textarea
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask me anything..."
              rows={2}
              className="flex-1 text-xs bg-transparent border-none focus:outline-none resize-none text-gray-800 dark:text-white placeholder-gray-400 p-1"
            />
            <Button
              type="submit"
              size="sm"
              disabled={loading || !inputPrompt.trim()}
              className="h-8 w-8 p-0 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-sm shrink-0"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4" />
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
};
