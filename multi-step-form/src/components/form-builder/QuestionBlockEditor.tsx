import React, { useState, useRef, useEffect } from 'react';
import type { QuestionBlock, QuestionType } from '../../utils/customForms';
import {
  Type,
  AlignLeft,
  CircleDot,
  CheckSquare,
  Star,
  Calendar,
  Table,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Plus,
  X,
  Zap,
  FileText,
  AtSign
} from 'lucide-react';
import { Button } from '../ui/button';
import { QuestionLogicBuilder } from './QuestionLogicBuilder';

interface QuestionBlockEditorProps {
  block: QuestionBlock;
  index: number;
  totalBlocks: number;
  allBlocks?: QuestionBlock[];
  onChange: (updatedBlock: QuestionBlock) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const QUESTION_TYPE_ICONS: Record<QuestionType, React.ReactNode> = {
  short_text: <Type className="w-4 h-4 text-blue-500" />,
  long_text: <AlignLeft className="w-4 h-4 text-indigo-500" />,
  multiple_choice: <CircleDot className="w-4 h-4 text-emerald-500" />,
  checkbox: <CheckSquare className="w-4 h-4 text-purple-500" />,
  rating: <Star className="w-4 h-4 text-amber-500" />,
  date: <Calendar className="w-4 h-4 text-rose-500" />,
  matrix: <Table className="w-4 h-4 text-cyan-500" />,
  page_break: <FileText className="w-4 h-4 text-indigo-500" />
};

// Detect an in-progress "@mention" right before the cursor, e.g. typing "@q" or "@brand"
// while the cursor sits right after it (no whitespace between "@" and cursor).
const detectMentionTrigger = (text: string, cursorPos: number): { atIndex: number; query: string } | null => {
  const uptoCursor = text.slice(0, cursorPos);
  const atIndex = uptoCursor.lastIndexOf('@');
  if (atIndex === -1) return null;
  const query = uptoCursor.slice(atIndex + 1);
  if (/\s/.test(query)) return null;
  return { atIndex, query };
};

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: 'Short Text',
  long_text: 'Long Text',
  multiple_choice: 'Multiple Choice',
  checkbox: 'Checkboxes',
  rating: 'Rating / Scale',
  date: 'Date',
  matrix: 'Matrix',
  page_break: 'Page Break'
};

export const QuestionBlockEditor: React.FC<QuestionBlockEditorProps> = ({
  block,
  index,
  totalBlocks,
  allBlocks = [],
  onChange,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown
}) => {
  const [showLogicBuilder, setShowLogicBuilder] = useState(false);
  const ruleCount = block.logicRules?.length || 0;
  const pageNum = allBlocks.slice(0, index).filter(b => b.type === 'page_break').length + 1;
  const questionNum = allBlocks.slice(0, index).filter(b => b.type !== 'page_break').length + 1;
  const priorBlocks = allBlocks.slice(0, index).filter(b => b.type !== 'page_break');

  const labelInputRef = useRef<HTMLTextAreaElement>(null);
  const savedSelectionRef = useRef<number | null>(null);

  // Auto-grow the question-label textarea to fit its content (no horizontal clipping on mobile)
  useEffect(() => {
    const el = labelInputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [block.label]);

  // @mention autocomplete state for the question-label input
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionAtIndex, setMentionAtIndex] = useState<number | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  const mentionSuggestions = mentionQuery === null
    ? []
    : priorBlocks
        .map((b, idx) => ({ block: b, qIndex: idx }))
        .filter(({ block: b, qIndex }) =>
          !mentionQuery ||
          `q${qIndex + 1}`.includes(mentionQuery.toLowerCase()) ||
          (b.label || '').toLowerCase().includes(mentionQuery.toLowerCase())
        );

  const updateMentionState = (target: HTMLTextAreaElement) => {
    const cursorPos = target.selectionStart ?? target.value.length;
    const trigger = index > 0 ? detectMentionTrigger(target.value, cursorPos) : null;
    if (trigger) {
      setMentionQuery(trigger.query);
      setMentionAtIndex(trigger.atIndex);
      setActiveSuggestionIndex(0);
    } else {
      setMentionQuery(null);
      setMentionAtIndex(null);
    }
  };

  const selectMentionSuggestion = (qIndex: number) => {
    if (mentionAtIndex === null || mentionQuery === null) return;
    const token = `@q${qIndex + 1}`;
    const text = block.label || '';
    const cursorPos = mentionAtIndex + 1 + mentionQuery.length;
    const before = text.slice(0, mentionAtIndex);
    const after = text.slice(cursorPos);
    const updated = `${before}${token} ${after}`;

    onChange({ ...block, label: updated });
    setMentionQuery(null);
    setMentionAtIndex(null);

    setTimeout(() => {
      const input = labelInputRef.current;
      if (input) {
        input.focus();
        const newPos = before.length + token.length + 1;
        input.setSelectionRange(newPos, newPos);
        savedSelectionRef.current = newPos;
      }
    }, 0);
  };

  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSuggestionIndex(prev => (prev + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSuggestionIndex(prev => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        selectMentionSuggestion(mentionSuggestions[activeSuggestionIndex].qIndex);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        setMentionAtIndex(null);
        return;
      }
    }
    // Pertanyaan tetap satu field logis (wrap secara visual saja) — jangan sisipkan newline.
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  };

  const handleTrackCursor = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    if (target.selectionStart !== null) {
      savedSelectionRef.current = target.selectionStart;
    }
    updateMentionState(target);
  };

  // Sisipkan "@" di posisi cursor dan langsung buka popover autocomplete —
  // dipicu oleh tombol ikon @ di pojok textarea (pengganti dropdown lama).
  const handleOpenMentionPicker = () => {
    const input = labelInputRef.current;
    const currentText = block.label || '';
    const cursorIndex = savedSelectionRef.current ?? input?.selectionStart ?? currentText.length;

    const before = currentText.substring(0, cursorIndex);
    const after = currentText.substring(cursorIndex);
    const needsSpaceBefore = before && !before.endsWith(' ') ? ' ' : '';
    const atIndex = before.length + needsSpaceBefore.length;
    const updated = `${before}${needsSpaceBefore}@${after}`;

    onChange({ ...block, label: updated });
    setMentionQuery('');
    setMentionAtIndex(atIndex);
    setActiveSuggestionIndex(0);

    setTimeout(() => {
      if (input) {
        input.focus();
        const newPos = atIndex + 1;
        input.setSelectionRange(newPos, newPos);
        savedSelectionRef.current = newPos;
      }
    }, 0);
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    handleTrackCursor(e);
    onChange({ ...block, label: e.target.value });
  };

  const handleDescChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...block, description: e.target.value });
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as QuestionType;
    let defaultOptions = block.options;
    if ((newType === 'multiple_choice' || newType === 'checkbox' || newType === 'matrix') && (!defaultOptions || defaultOptions.length === 0)) {
      defaultOptions = ['Option 1', 'Option 2'];
    }
    let defaultRows = block.rows;
    if (newType === 'matrix' && (!defaultRows || defaultRows.length === 0)) {
      defaultRows = [
        { id: crypto.randomUUID(), label: 'Baris 1' },
        { id: crypto.randomUUID(), label: 'Baris 2' }
      ];
    }
    onChange({ ...block, type: newType, options: defaultOptions, rows: defaultRows });
  };

  const handleOptionChange = (optIndex: number, val: string) => {
    const updatedOpts = [...(block.options || [])];
    updatedOpts[optIndex] = val;
    onChange({ ...block, options: updatedOpts });
  };

  const handleAddOption = () => {
    const opts = block.options || [];
    onChange({ ...block, options: [...opts, `Option ${opts.length + 1}`] });
  };

  const handleRemoveOption = (optIndex: number) => {
    const opts = block.options || [];
    onChange({ ...block, options: opts.filter((_, idx) => idx !== optIndex) });
  };

  const handleRowChange = (rowIndex: number, val: string) => {
    const updatedRows = [...(block.rows || [])];
    updatedRows[rowIndex] = { ...updatedRows[rowIndex], label: val };
    onChange({ ...block, rows: updatedRows });
  };

  const handleAddRow = () => {
    const rows = block.rows || [];
    onChange({ ...block, rows: [...rows, { id: crypto.randomUUID(), label: `Baris ${rows.length + 1}` }] });
  };

  const handleRemoveRow = (rowIndex: number) => {
    const rows = block.rows || [];
    onChange({ ...block, rows: rows.filter((_, idx) => idx !== rowIndex) });
  };

  const handleRequiredToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...block, required: e.target.checked });
  };

  if (block.type === 'page_break') {
    return (
      <div id={`block-${block.id}`} className="relative my-6 group">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t-2 border-dashed border-indigo-300 dark:border-indigo-800" />
        </div>
        <div className="relative flex justify-center px-2">
          <div className="max-w-full bg-indigo-600 dark:bg-indigo-700 text-white rounded-full px-3 sm:px-5 py-2 text-xs font-bold shadow-md flex flex-wrap items-center justify-center gap-2 sm:gap-3 border border-indigo-500">
            <div className="flex items-center gap-1.5 shrink-0">
              <FileText className="w-4 h-4 text-indigo-200" />
              <span>HALAMAN {pageNum + 1}</span>
            </div>
            <input
              type="text"
              value={block.label}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
              placeholder="Judul Bagian / Halaman (Opsional)..."
              className="bg-indigo-700 dark:bg-indigo-800 text-white placeholder-indigo-300/80 px-3 py-0.5 rounded-full text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-white border border-indigo-500/80 w-32 sm:w-48 md:w-64 min-w-0"
            />
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={index === 0}
                onClick={onMoveUp}
                className="p-1 hover:bg-indigo-800 rounded-full transition-colors text-indigo-200 hover:text-white disabled:opacity-30"
                title="Pindah ke Atas"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={index === totalBlocks - 1}
                onClick={onMoveDown}
                className="p-1 hover:bg-indigo-800 rounded-full transition-colors text-indigo-200 hover:text-white disabled:opacity-30"
                title="Pindah ke Bawah"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="p-1 hover:bg-rose-600 rounded-full transition-colors text-indigo-200 hover:text-white"
                title="Hapus Pemisah Halaman"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id={`block-${block.id}`} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm space-y-2.5 hover:shadow-md transition-shadow">
      {/* Block Top Control Header */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700 pb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-5 h-5 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold text-[10px] flex items-center justify-center">
            {questionNum}
          </span>
          <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded-full border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
            Hal {pageNum}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/60 px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-600 truncate">
            {QUESTION_TYPE_ICONS[block.type]}
            {QUESTION_TYPE_LABELS[block.type]}
          </span>
        </div>

        {/* Action icons: Move Up/Down, Duplicate, Delete */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={index === 0}
            onClick={onMoveUp}
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
            title="Pindah ke Atas"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={index === totalBlocks - 1}
            onClick={onMoveDown}
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
            title="Pindah ke Bawah"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDuplicate}
            className="h-6 w-6 p-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            title="Duplikat Pertanyaan"
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-6 w-6 p-0 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
            title="Hapus Pertanyaan"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Question Fields */}
      <div className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {/* Question Text */}
          <div className="md:col-span-2 space-y-1 min-w-0">
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Pertanyaan
            </span>

            <div className="relative">
              <textarea
                ref={labelInputRef}
                value={block.label}
                onChange={handleLabelChange}
                onSelect={handleTrackCursor}
                onClick={handleTrackCursor}
                onKeyUp={handleTrackCursor}
                onKeyDown={handleLabelKeyDown}
                onBlur={() => setTimeout(() => { setMentionQuery(null); setMentionAtIndex(null); }, 150)}
                placeholder="Tuliskan pertanyaan Anda..."
                rows={1}
                className={`w-full text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-indigo-600 focus:outline-none pb-0.5 transition-all resize-none overflow-hidden leading-snug break-words ${index > 0 ? 'pr-6' : ''}`}
              />

              {index > 0 && (
                <button
                  type="button"
                  onClick={handleOpenMentionPicker}
                  title="Sisipkan Piped Text (@Jawaban)"
                  className="absolute top-0 right-0 p-1 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-400 transition-colors"
                >
                  <AtSign className="w-3.5 h-3.5" />
                </button>
              )}

              {/* @mention autocomplete popover */}
              {mentionQuery !== null && mentionSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto py-1">
                  {mentionSuggestions.map(({ block: b, qIndex }, sIdx) => (
                    <button
                      key={b.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectMentionSuggestion(qIndex);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                        sIdx === activeSuggestionIndex
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60'
                      }`}
                    >
                      <span className="font-bold shrink-0">@q{qIndex + 1}</span>
                      <span className="truncate">{b.label || 'Pertanyaan ' + (qIndex + 1)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Piped text human-readable badges with remove button */}
            {/(@answerq\d+|@q\d+|\$\{q:[a-zA-Z0-9_-]+\})/i.test(block.label || '') && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">✨ Piped Text:</span>
                {((block.label || '').match(/(@answerq\d+|@q\d+|\$\{q:[a-zA-Z0-9_-]+\})/gi) || []).map((token, tIdx) => {
                  const numMatch = token.match(/\d+/);
                  const qNumStr = numMatch ? numMatch[0] : '';
                  let targetB = allBlocks.find(b => b.id === qNumStr);
                  if (!targetB && !isNaN(Number(qNumStr))) {
                    targetB = allBlocks.filter(b => b.type !== 'page_break')[Number(qNumStr) - 1];
                  }
                  const refLabel = targetB ? `@${qNumStr}. ${targetB.label || 'Pertanyaan ' + qNumStr}` : `@${qNumStr}`;
                  return (
                    <span
                      key={tIdx}
                      className="inline-flex items-center gap-1.5 bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-semibold px-2.5 py-0.5 rounded-full border border-indigo-200/70 dark:border-indigo-800/70 shadow-2xs"
                    >
                      <code>{token}</code>
                      <span className="text-gray-400 dark:text-gray-500 font-normal">→</span>
                      <span className="underline decoration-indigo-300/80 max-w-[220px] truncate">{refLabel}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const cleaned = (block.label || '').replace(token, '').trim();
                          onChange({ ...block, label: cleaned });
                        }}
                        className="p-0.5 text-indigo-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/40 rounded-full transition-colors ml-0.5"
                        title="Hapus variabel ini"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    const cleaned = (block.label || '').replace(/(@answerq\d+|@q\d+|\$\{q:[a-zA-Z0-9_-]+\})/gi, '').trim();
                    onChange({ ...block, label: cleaned });
                  }}
                  className="text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 font-medium underline decoration-dotted"
                  title="Hapus semua piped text"
                >
                  🧹 Hapus Semua
                </button>
              </div>
            )}
          </div>

          {/* Question Type Selector */}
          <div className="min-w-0">
            <select
              value={block.type}
              onChange={handleTypeChange}
              className="w-full max-w-[200px] truncate text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md py-1.5 px-2 font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(QUESTION_TYPE_LABELS).map(([typeKey, typeName]) => (
                <option key={typeKey} value={typeKey}>
                  {typeName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Question Subtitle / Help text */}
        <div>
          <input
            type="text"
            value={block.description || ''}
            onChange={handleDescChange}
            placeholder="Help text or description (optional)..."
            className="w-full text-[11px] text-gray-500 dark:text-gray-400 bg-transparent border-b border-dashed border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:outline-none pb-0.5"
          />
        </div>

        {/* Type-Specific Options Editor */}
        {(block.type === 'multiple_choice' || block.type === 'checkbox') && (
          <div className="pt-1 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                Options Source:
              </label>
              {allBlocks.slice(0, index).filter(b => b.type !== 'page_break' && b.type !== 'matrix').length > 0 && (
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700/60 p-0.5 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => onChange({ ...block, carryForwardFromBlockId: undefined })}
                    className={`px-2.5 py-0.5 rounded-md font-medium transition-all ${
                      !block.carryForwardFromBlockId
                        ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-2xs font-semibold'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
                    }`}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const prevBlocks = allBlocks.slice(0, index).filter(b => b.type !== 'page_break' && b.type !== 'matrix');
                      const defaultPrev = prevBlocks[prevBlocks.length - 1]?.id;
                      onChange({ ...block, carryForwardFromBlockId: defaultPrev });
                    }}
                    className={`px-2.5 py-0.5 rounded-md font-semibold transition-all ${
                      block.carryForwardFromBlockId
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
                    }`}
                  >
                    ⚡ Carry Forward
                  </button>
                </div>
              )}
            </div>

            {block.carryForwardFromBlockId ? (
              <div className="bg-blue-50/70 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-blue-900 dark:text-blue-200">
                    Bawa opsi yang dipilih responden dari:
                  </span>
                </div>
                <select
                  value={block.carryForwardFromBlockId}
                  onChange={(e) => onChange({ ...block, carryForwardFromBlockId: e.target.value })}
                  className="w-full text-xs bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded-lg p-2 font-semibold text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {allBlocks.slice(0, index).filter(b => b.type !== 'page_break' && b.type !== 'matrix').map((b, idx) => (
                    <option key={b.id} value={b.id}>
                      @{idx + 1}. {b.label || 'Pertanyaan ' + (idx + 1)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-blue-700 dark:text-blue-300 italic leading-relaxed">
                  Opsi pilihan pada pertanyaan ini akan otomatis membawa opsi-opsi yang dicentang oleh responden pada pertanyaan acuan di atas.
                </p>
              </div>
            ) : (
              /* Standard Manual Options List */
              <div className="space-y-1.5">
                {(block.options || []).map((option, optIdx) => (
                  <div key={optIdx} className="flex items-center gap-1.5">
                    <span className="text-gray-400 shrink-0">
                      {block.type === 'multiple_choice' ? (
                        <CircleDot className="w-3.5 h-3.5" />
                      ) : (
                        <CheckSquare className="w-3.5 h-3.5" />
                      )}
                    </span>
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => handleOptionChange(optIdx, e.target.value)}
                      placeholder={`Option ${optIdx + 1}`}
                      className="flex-1 text-xs bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
                    />
                    {(block.options || []).length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveOption(optIdx)}
                        className="h-6 w-6 p-0 text-gray-400 hover:text-rose-500 shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddOption}
                  className="h-6 text-[11px] text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Option
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Rating Scale Config */}
        {block.type === 'rating' && (
          <div className="pt-1 flex items-center gap-2">
            <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Scale Range:
            </label>
            <select
              value={block.maxScale || 5}
              onChange={(e) => onChange({ ...block, maxScale: Number(e.target.value) })}
              className="text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md py-1 px-1.5 font-medium"
            >
              <option value={5}>1 to 5 Stars</option>
              <option value={10}>1 to 10 Scale</option>
            </select>
          </div>
        )}

        {/* Matrix Rows & Columns Editor */}
        {block.type === 'matrix' && (
          <div className="pt-1 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                Baris (Sub-Pernyataan)
              </label>
              {(block.rows || []).map((row, rowIdx) => (
                <div key={row.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) => handleRowChange(rowIdx, e.target.value)}
                    placeholder={`Baris ${rowIdx + 1}`}
                    className="flex-1 text-xs bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
                  />
                  {(block.rows || []).length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveRow(rowIdx)}
                      className="h-6 w-6 p-0 text-gray-400 hover:text-rose-500 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRow}
                className="h-6 text-[11px] text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400"
              >
                <Plus className="w-3 h-3 mr-1" /> Add Row
              </Button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                Kolom (Skala Jawaban Bersama)
              </label>
              {(block.options || []).map((option, optIdx) => (
                <div key={optIdx} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={option}
                    onChange={(e) => handleOptionChange(optIdx, e.target.value)}
                    placeholder={`Kolom ${optIdx + 1}`}
                    className="flex-1 text-xs bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
                  />
                  {(block.options || []).length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveOption(optIdx)}
                      className="h-6 w-6 p-0 text-gray-400 hover:text-rose-500 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddOption}
                className="h-6 text-[11px] text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400"
              >
                <Plus className="w-3 h-3 mr-1" /> Add Column
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Footer controls: Logic Toggle & Required Toggle */}
      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowLogicBuilder(!showLogicBuilder)}
          className={`h-6 text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
            showLogicBuilder || ruleCount > 0
              ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
              : 'text-gray-600 border-gray-200 dark:text-gray-300 dark:border-gray-700 hover:bg-gray-50'
          }`}
        >
          <Zap className={`w-3.5 h-3.5 ${ruleCount > 0 ? 'fill-amber-500 text-amber-500' : 'text-gray-500'}`} />
          <span>Logic</span>
          {ruleCount > 0 && (
            <span className="bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {ruleCount}
            </span>
          )}
        </Button>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={block.required}
            onChange={handleRequiredToggle}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
          />
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
            Required Field
          </span>
        </label>
      </div>

      {/* Inline Question Logic Builder */}
      {showLogicBuilder && (
        <QuestionLogicBuilder
          block={block}
          blockIndex={index}
          allBlocks={allBlocks}
          onChangeRules={(newRules) => onChange({ ...block, logicRules: newRules })}
          onChangeMatchMode={(mode) => onChange({ ...block, logicMatchMode: mode })}
        />
      )}
    </div>
  );
};
