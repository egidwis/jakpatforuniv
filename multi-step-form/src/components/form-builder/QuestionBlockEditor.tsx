import React, { useState } from 'react';
import type { QuestionBlock, QuestionType } from '../../utils/customForms';
import {
  Type,
  AlignLeft,
  CircleDot,
  CheckSquare,
  Star,
  Calendar,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  Plus,
  X,
  Zap
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
  date: <Calendar className="w-4 h-4 text-rose-500" />
};

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: 'Short Text',
  long_text: 'Long Text',
  multiple_choice: 'Multiple Choice',
  checkbox: 'Checkboxes',
  rating: 'Rating / Scale',
  date: 'Date'
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

  const labelInputRef = useRef<HTMLInputElement>(null);

  const insertTokenAtCursor = (token: string) => {
    const input = labelInputRef.current;
    const currentText = block.label || '';
    if (!input) {
      onChange({ ...block, label: currentText + ' ' + token });
      return;
    }
    const start = input.selectionStart ?? currentText.length;
    const end = input.selectionEnd ?? currentText.length;
    const before = currentText.substring(0, start);
    const after = currentText.substring(end);
    const updated = `${before}${before.endsWith(' ') || !before ? '' : ' '}${token}${after.startsWith(' ') || !after ? '' : ' '}${after}`;
    onChange({ ...block, label: updated });

    setTimeout(() => {
      if (input) {
        input.focus();
        const newPos = start + token.length + 2;
        input.setSelectionRange(newPos, newPos);
      }
    }, 50);
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...block, label: e.target.value });
  };

  const handleDescChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...block, description: e.target.value });
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as QuestionType;
    let defaultOptions = block.options;
    if ((newType === 'multiple_choice' || newType === 'checkbox') && (!defaultOptions || defaultOptions.length === 0)) {
      defaultOptions = ['Option 1', 'Option 2'];
    }
    onChange({ ...block, type: newType, options: defaultOptions });
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

  const handleRequiredToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...block, required: e.target.checked });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow">
      {/* Block Top Control Header */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center">
            {index + 1}
          </span>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/60 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600">
            {QUESTION_TYPE_ICONS[block.type]}
            {QUESTION_TYPE_LABELS[block.type]}
          </span>
        </div>

        {/* Action icons: Move Up/Down, Duplicate, Delete */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={index === 0}
            onClick={onMoveUp}
            className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
            title="Pindah ke Atas"
          >
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={index === totalBlocks - 1}
            onClick={onMoveDown}
            className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
            title="Pindah ke Bawah"
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDuplicate}
            className="h-8 w-8 p-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            title="Duplikat Pertanyaan"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-8 w-8 p-0 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
            title="Hapus Pertanyaan"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main Question Fields */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Question Text */}
          <div className="md:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Pertanyaan
              </span>
              {index > 0 && (
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-indigo-500 font-semibold hidden sm:inline">✨ Sisipkan Jawaban:</span>
                  <select
                    onChange={(e) => {
                      if (!e.target.value) return;
                      if (e.target.value === '__REMOVE_ALL__') {
                        const cleaned = (block.label || '').replace(/(@answerq\d+|@q\d+|\$\{q:[a-zA-Z0-9_-]+\})/gi, '').trim();
                        onChange({ ...block, label: cleaned });
                      } else {
                        insertTokenAtCursor(e.target.value);
                      }
                      e.target.value = '';
                    }}
                    className="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-full px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-2xs"
                  >
                    <option value="">+ Piped Text (@ Jawaban)</option>
                    {/(@answerq\d+|@q\d+|\$\{q:[a-zA-Z0-9_-]+\})/i.test(block.label || '') && (
                      <option value="__REMOVE_ALL__">🧹 Hapus Semua Piped Text</option>
                    )}
                    {allBlocks.filter((_, idx) => idx < index).map((b, idx) => (
                      <option key={b.id} value={`@q${idx + 1}`}>
                        @q{idx + 1}. {b.label || 'Pertanyaan ' + (idx + 1)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <input
              ref={labelInputRef}
              type="text"
              value={block.label}
              onChange={handleLabelChange}
              placeholder="Tuliskan pertanyaan Anda... (Gunakan @q1 untuk Piped Text)"
              className="w-full text-base font-semibold text-gray-900 dark:text-white bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-blue-600 focus:outline-none pb-1"
            />

            {/* Piped text human-readable badges with remove button */}
            {/(@answerq\d+|@q\d+|\$\{q:[a-zA-Z0-9_-]+\})/i.test(block.label || '') && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/40 p-2 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                <span className="font-semibold text-indigo-700 dark:text-indigo-300">✨ Piped Variables:</span>
                {((block.label || '').match(/(@answerq\d+|@q\d+|\$\{q:[a-zA-Z0-9_-]+\})/gi) || []).map((token, tIdx) => {
                  const numMatch = token.match(/\d+/);
                  const qNumStr = numMatch ? numMatch[0] : '';
                  let targetB = allBlocks.find(b => b.id === qNumStr);
                  if (!targetB && !isNaN(Number(qNumStr))) {
                    targetB = allBlocks[Number(qNumStr) - 1];
                  }
                  const refLabel = targetB ? `@${qNumStr}. ${targetB.label || 'Pertanyaan ' + qNumStr}` : `@${qNumStr}`;
                  return (
                    <span
                      key={tIdx}
                      className="inline-flex items-center gap-1.5 bg-white dark:bg-gray-800 text-indigo-700 dark:text-indigo-300 font-bold px-2 py-0.5 rounded-md border border-indigo-200 dark:border-indigo-700 shadow-2xs"
                    >
                      <span><code>{token}</code> → <span className="underline decoration-indigo-300">{refLabel}</span></span>
                      <button
                        type="button"
                        onClick={() => {
                          const cleaned = (block.label || '').replace(token, '').trim();
                          onChange({ ...block, label: cleaned });
                        }}
                        className="p-0.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/40 rounded-full transition-colors"
                        title="Hapus variabel ini"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Question Type Selector */}
          <div>
            <select
              value={block.type}
              onChange={handleTypeChange}
              className="w-full text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2 font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="w-full text-xs text-gray-500 dark:text-gray-400 bg-transparent border-b border-dashed border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:outline-none pb-1"
          />
        </div>

        {/* Type-Specific Options Editor */}
        {(block.type === 'multiple_choice' || block.type === 'checkbox') && (
          <div className="pt-2 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                Options Source:
              </label>
              {allBlocks.filter((_, idx) => idx < index).length > 0 && (
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
                      const prevBlocks = allBlocks.filter((_, idx) => idx < index);
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
                  {allBlocks.filter((_, idx) => idx < index).map((b, idx) => (
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
              <div className="space-y-2">
                {(block.options || []).map((option, optIdx) => (
                  <div key={optIdx} className="flex items-center gap-2">
                    <span className="text-gray-400">
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
                      className="flex-1 text-sm bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
                    />
                    {(block.options || []).length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveOption(optIdx)}
                        className="h-7 w-7 p-0 text-gray-400 hover:text-rose-500"
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
                  className="text-xs text-blue-600 border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Option
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Rating Scale Config */}
        {block.type === 'rating' && (
          <div className="pt-2 flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              Scale Range:
            </label>
            <select
              value={block.maxScale || 5}
              onChange={(e) => onChange({ ...block, maxScale: Number(e.target.value) })}
              className="text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md p-1.5 font-medium"
            >
              <option value={5}>1 to 5 Stars</option>
              <option value={10}>1 to 10 Scale</option>
            </select>
          </div>
        )}
      </div>

      {/* Footer controls: Logic Toggle & Required Toggle */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowLogicBuilder(!showLogicBuilder)}
          className={`h-7 text-xs font-semibold flex items-center gap-1.5 transition-all ${
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
