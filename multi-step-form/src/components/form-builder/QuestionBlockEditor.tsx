import React from 'react';
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
  X
} from 'lucide-react';
import { Button } from '../ui/button';

interface QuestionBlockEditorProps {
  block: QuestionBlock;
  index: number;
  totalBlocks: number;
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
  onChange,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown
}) => {
  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...block, label: e.target.value });
  };

  const handleDescChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...block, description: e.target.value });
  };

  const handleRequiredToggle = () => {
    onChange({ ...block, required: !block.required });
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as QuestionType;
    let newOptions = block.options;

    if ((newType === 'multiple_choice' || newType === 'checkbox') && (!newOptions || !newOptions.length)) {
      newOptions = ['Option 1', 'Option 2'];
    }

    onChange({
      ...block,
      type: newType,
      options: newOptions,
      minScale: newType === 'rating' ? 1 : undefined,
      maxScale: newType === 'rating' ? (block.maxScale || 5) : undefined
    });
  };

  // Option management for Multiple Choice / Checkbox
  const handleOptionChange = (optionIndex: number, value: string) => {
    const updatedOptions = [...(block.options || [])];
    updatedOptions[optionIndex] = value;
    onChange({ ...block, options: updatedOptions });
  };

  const handleAddOption = () => {
    const options = block.options || [];
    onChange({
      ...block,
      options: [...options, `Option ${options.length + 1}`]
    });
  };

  const handleRemoveOption = (optionIndex: number) => {
    const options = (block.options || []).filter((_, i) => i !== optionIndex);
    onChange({ ...block, options });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md transition-shadow group relative">
      {/* Header controls: Question Number & Reorder/Action Buttons */}
      <div className="flex items-center justify-between mb-4 border-b pb-3 border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center">
            {index + 1}
          </span>
          <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/60 px-2.5 py-1 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300">
            {QUESTION_TYPE_ICONS[block.type]}
            <span>{QUESTION_TYPE_LABELS[block.type]}</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onMoveUp}
            disabled={index === 0}
            className="h-8 w-8 p-0"
            title="Move Up"
          >
            <ChevronUp className="w-4 h-4 text-gray-500" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onMoveDown}
            disabled={index === totalBlocks - 1}
            className="h-8 w-8 p-0"
            title="Move Down"
          >
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDuplicate}
            className="h-8 w-8 p-0"
            title="Duplicate Question"
          >
            <Copy className="w-4 h-4 text-gray-500" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-8 w-8 p-0 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20"
            title="Delete Question"
          >
            <Trash2 className="w-4 h-4 text-gray-500 hover:text-rose-600" />
          </Button>
        </div>
      </div>

      {/* Main Question Inputs */}
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Question Label */}
          <div className="md:col-span-3">
            <input
              type="text"
              value={block.label}
              onChange={handleLabelChange}
              placeholder="Question Title / Prompt..."
              className="w-full text-base font-semibold text-gray-900 dark:text-white bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:outline-none pb-1.5"
            />
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
          <div className="pt-2 space-y-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
              Options:
            </label>
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

      {/* Footer controls: Required Toggle */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-2">
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
    </div>
  );
};
