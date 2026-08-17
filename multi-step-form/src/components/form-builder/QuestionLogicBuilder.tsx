import React from 'react';
import type { QuestionBlock, LogicRule, LogicOperator, LogicAction, LogicMatchMode } from '../../utils/customForms';
import { Plus, Trash2, Zap } from 'lucide-react';
import { Button } from '../ui/button';

interface QuestionLogicBuilderProps {
  block: QuestionBlock;
  blockIndex: number;
  allBlocks: QuestionBlock[];
  onChangeRules: (rules: LogicRule[]) => void;
  onChangeMatchMode?: (matchMode: LogicMatchMode) => void;
}

export const QuestionLogicBuilder: React.FC<QuestionLogicBuilderProps> = ({
  block,
  blockIndex,
  allBlocks,
  onChangeRules,
  onChangeMatchMode
}) => {
  const rules = block.logicRules || [];
  const matchMode = block.logicMatchMode || 'ALL';

  // Available source blocks (blocks BEFORE current block). Matrix is excluded —
  // its answer is a per-row object, not the flat string/array these rules compare against.
  const availableSourceBlocks = allBlocks.filter((b, idx) => idx < blockIndex && b.type !== 'matrix');
  // All blocks for jump_to target
  const availableTargetBlocks = allBlocks.filter(b => b.id !== block.id);

  const handleAddRule = () => {
    const defaultSource = availableSourceBlocks.length > 0
      ? availableSourceBlocks[availableSourceBlocks.length - 1].id
      : (allBlocks[0]?.id || '');

    const newRule: LogicRule = {
      id: 'rule_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      sourceBlockId: defaultSource,
      operator: 'equals',
      value: '',
      action: 'show'
    };

    onChangeRules([...rules, newRule]);
  };

  const handleUpdateRule = (ruleId: string, updatedFields: Partial<LogicRule>) => {
    const updated = rules.map(rule => {
      if (rule.id === ruleId) {
        return { ...rule, ...updatedFields };
      }
      return rule;
    });
    onChangeRules(updated);
  };

  const handleDeleteRule = (ruleId: string) => {
    const filtered = rules.filter(r => r.id !== ruleId);
    onChangeRules(filtered);
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/70 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
            <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            <span>Conditional Logic ({rules.length})</span>
          </div>

          {/* AND / OR Combinator Toggle when multiple rules exist */}
          {rules.length > 1 && (
            <div className="flex items-center gap-0.5 bg-amber-100 dark:bg-amber-900/40 p-0.5 rounded-lg text-[10px] font-bold">
              <button
                type="button"
                onClick={() => onChangeMatchMode?.('ALL')}
                className={`px-2 py-0.5 rounded transition-all ${
                  matchMode === 'ALL'
                    ? 'bg-amber-600 text-white shadow-2xs font-extrabold'
                    : 'text-amber-800 dark:text-amber-300 hover:text-amber-900'
                }`}
                title="Semua kondisi harus terpenuhi (AND)"
              >
                AND (Match ALL)
              </button>
              <button
                type="button"
                onClick={() => onChangeMatchMode?.('ANY')}
                className={`px-2 py-0.5 rounded transition-all ${
                  matchMode === 'ANY'
                    ? 'bg-amber-600 text-white shadow-2xs font-extrabold'
                    : 'text-amber-800 dark:text-amber-300 hover:text-amber-900'
                }`}
                title="Salah satu kondisi cukup terpenuhi (OR)"
              >
                OR (Match ANY)
              </button>
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddRule}
          className="h-7 text-[11px] text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2.5 rounded-lg"
        >
          <Plus className="w-3 h-3 mr-1" /> Add Rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic">
          Belum ada aturan logika. Klik "+ Add Rule" untuk menambah alur dinamis.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, rIdx) => {
            const sourceBlock = allBlocks.find(b => b.id === rule.sourceBlockId);

            return (
              <React.Fragment key={rule.id}>
                {/* AND / OR Combinator Badge between rules */}
                {rIdx > 0 && (
                  <div className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest text-center py-0.5 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200/60 dark:border-amber-800/60 w-24 mx-auto">
                    {matchMode === 'ANY' ? '— OR —' : '— AND —'}
                  </div>
                )}

                <div
                  className="bg-gray-50/80 dark:bg-gray-750 border border-gray-200 dark:border-gray-700/80 rounded-xl p-3 text-xs space-y-2 relative group"
                >
                  {/* Delete rule button */}
                  <button
                    type="button"
                    onClick={() => handleDeleteRule(rule.id)}
                    className="absolute top-2.5 right-2.5 text-gray-400 hover:text-rose-500 transition-colors p-1"
                    title="Hapus Rule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* WHEN Clause */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      When
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Source Question Select */}
                      <select
                        value={rule.sourceBlockId}
                        onChange={(e) => handleUpdateRule(rule.id, { sourceBlockId: e.target.value, value: '' })}
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[200px] truncate"
                      >
                        {allBlocks.map((b, idx) => (
                          <option key={b.id} value={b.id}>
                            @{idx + 1}. {b.label || 'Pertanyaan ' + (idx + 1)}
                          </option>
                        ))}
                      </select>

                      {/* Operator Select */}
                      <select
                        value={rule.operator}
                        onChange={(e) => handleUpdateRule(rule.id, { operator: e.target.value as LogicOperator })}
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="equals">Is (Sama Dengan)</option>
                        <option value="not_equals">Is Not (Beda)</option>
                        <option value="contains">Contains (Berisi)</option>
                        <option value="is_answered">Is Answered (Diisi)</option>
                        <option value="is_empty">Is Empty (Kosong)</option>
                      </select>

                      {/* Value Input or Select */}
                      {rule.operator !== 'is_answered' && rule.operator !== 'is_empty' && (
                        sourceBlock && sourceBlock.options && sourceBlock.options.length > 0 ? (
                          <select
                            value={rule.value || ''}
                            onChange={(e) => handleUpdateRule(rule.id, { value: e.target.value })}
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[160px] truncate"
                          >
                            <option value="">-- Pilih Opsi --</option>
                            {sourceBlock.options.map((opt, oIdx) => (
                              <option key={oIdx} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={rule.value || ''}
                            onChange={(e) => handleUpdateRule(rule.id, { value: e.target.value })}
                            placeholder="Masukkan nilai..."
                            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1 text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-32"
                          />
                        )
                      )}
                    </div>
                  </div>

                  {/* THEN Clause */}
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      Then
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={rule.action}
                        onChange={(e) => handleUpdateRule(rule.id, { action: e.target.value as LogicAction })}
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="show">Show this question (Tampilkan)</option>
                        <option value="hide">Hide this question (Sembunyikan)</option>
                        <option value="jump_to">Jump to (Lompat ke)</option>
                      </select>

                      {/* Target Select for jump_to */}
                      {rule.action === 'jump_to' && (
                        <select
                          value={rule.targetBlockId || ''}
                          onChange={(e) => handleUpdateRule(rule.id, { targetBlockId: e.target.value })}
                          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[200px] truncate"
                        >
                          <option value="">-- Pilih Tujuan --</option>
                          <option value="submit">🏁 Submit Form (Selesaikan)</option>
                          {availableTargetBlocks.map((b) => (
                            <option key={b.id} value={b.id}>
                              @{allBlocks.findIndex(item => item.id === b.id) + 1}. {b.label || 'Pertanyaan'}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};
