import React, { useState, useRef, useEffect } from 'react';
import type { QuestionBlock } from '../../utils/customForms';
import type { ChatMessage, AiAction } from '../../utils/formAiAgent';
import { sendFormAiPrompt } from '../../utils/formAiAgent';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  CheckCircle2,
  PlusCircle,
  MinusCircle,
  Edit3,
  Bot
} from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';

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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Halo! Saya JFU AI Assistant. Ada yang bisa saya bantu untuk membuat atau menyempurnakan formulir Anda hari ini?',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (customText?: string) => {
    const text = customText || inputPrompt;
    if (!text.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
    setInputPrompt('');
    setLoading(true);

    try {
      // Format chat history for OpenRouter
      const history = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({
          role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.text
        }));
      history.push({ role: 'user', content: text.trim() });

      const aiResponse = await sendFormAiPrompt(history, formState);

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
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col transition-transform duration-200 animate-in slide-in-from-right">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-sm">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-bold text-sm text-gray-900 dark:text-white">Ask AI</h2>
              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                Beta
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Asisten pembuat form otomatis JFU</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0 text-gray-500 hover:text-gray-900 dark:hover:text-white"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => {
          const isUser = m.sender === 'user';
          return (
            <div
              key={m.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-br-none shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none border border-gray-200/60 dark:border-gray-600'
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
        })}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 dark:bg-gray-700/40 p-3 rounded-2xl max-w-[70%]">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            <span>AI sedang berpikir & menyusun form...</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Quick Prompt Chips */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-100 dark:border-gray-700 overflow-x-auto whitespace-nowrap scrollbar-none flex gap-1.5">
        <button
          type="button"
          onClick={() => handleSend('Buatkan survei kepuasan mahasiswa dengan 4 pertanyaan')}
          className="text-[11px] bg-white dark:bg-gray-700 hover:bg-blue-50 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-full px-2.5 py-1 transition-colors shrink-0"
        >
          ✨ Survei Kepuasan Mahasiswa
        </button>
        <button
          type="button"
          onClick={() => handleSend('Tambahkan opsi "Lainnya" pada semua pertanyaan pilihan ganda')}
          className="text-[11px] bg-white dark:bg-gray-700 hover:bg-blue-50 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-full px-2.5 py-1 transition-colors shrink-0"
        >
          ➕ Tambah Opsi "Lainnya"
        </button>
        <button
          type="button"
          onClick={() => handleSend('Tambahkan pertanyaan rating kepuasan di bagian akhir')}
          className="text-[11px] bg-white dark:bg-gray-700 hover:bg-blue-50 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-full px-2.5 py-1 transition-colors shrink-0"
        >
          ⭐ Tambah Pertanyaan Rating
        </button>
      </div>

      {/* Input Box Footer */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
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
            placeholder="Tanyakan atau instruksikan AI (misal: Buatkan form survei produk...)"
            rows={2}
            className="flex-1 text-xs bg-transparent border-none focus:outline-none resize-none text-gray-800 dark:text-white placeholder-gray-400 p-1"
          />
          <Button
            type="submit"
            size="sm"
            disabled={loading || !inputPrompt.trim()}
            className="h-8 w-8 p-0 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm shrink-0"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};
