import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import type { CustomForm, QuestionBlock } from '../../utils/customForms';
import {
  getCustomFormBySlugOrId,
  submitFormResponse
} from '../../utils/customForms';
import { getSubdomainUsername } from '../../utils/subdomain';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Star,
  Check,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import jfuIcon from '../../assets/jfu-icon.png';

export const PublicFormPage: React.FC = () => {
  const { formId, username, slug } = useParams<{ formId?: string; username?: string; slug?: string }>();
  const [form, setForm] = useState<CustomForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  useEffect(() => {
    loadPublicForm();
  }, [formId, username, slug]);

  const loadPublicForm = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      // Check subdomain username
      const subdomainUser = getSubdomainUsername();
      const targetUser = username || subdomainUser;

      let fetchedForm: CustomForm | null = null;

      if (targetUser && (slug || formId)) {
        fetchedForm = await getCustomFormBySlugOrId(targetUser, slug || formId);
      } else if (formId) {
        fetchedForm = await getCustomFormBySlugOrId(formId);
      }

      const searchParams = new URLSearchParams(window.location.search);
      const isPreviewMode = searchParams.get('preview') === 'true' || searchParams.get('mode') === 'preview';

      if (!fetchedForm) {
        setErrorMsg('Form tidak ditemukan.');
      } else if (fetchedForm.status !== 'published' && !isPreviewMode) {
        setErrorMsg('Form ini saat ini dalam status draf dan belum dipublikasikan. Tambahkan ?preview=true pada link atau buka via tombol Preview di Dashboard untuk melihat draf.');
      } else {
        setForm(fetchedForm);
      }
    } catch (err) {
      setErrorMsg('Gagal memuat form. Silakan periksa koneksi internet Anda.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
    if (fieldErrors[questionId]) {
      setFieldErrors(prev => {
        const updated = { ...prev };
        delete updated[questionId];
        return updated;
      });
    }
  };

  const handleCheckboxToggle = (questionId: string, optionValue: string) => {
    const currentList: string[] = Array.isArray(answers[questionId]) ? answers[questionId] : [];
    let updated: string[];
    if (currentList.includes(optionValue)) {
      updated = currentList.filter(o => o !== optionValue);
    } else {
      updated = [...currentList, optionValue];
    }
    handleInputChange(questionId, updated);
  };

  const handleMatrixChange = (questionId: string, rowId: string, option: string) => {
    handleInputChange(questionId, { ...(answers[questionId] || {}), [rowId]: option });
  };

  // Logic Rules Evaluator
  const evaluateRuleCondition = (rule: any, currentAnswers: Record<string, any>): boolean => {
    const val = currentAnswers[rule.sourceBlockId];
    if (rule.operator === 'is_answered') {
      return val !== undefined && val !== null && val !== '' && (!Array.isArray(val) || val.length > 0);
    }
    if (rule.operator === 'is_empty') {
      return val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
    }
    if (rule.operator === 'equals') {
      if (Array.isArray(val)) return val.includes(rule.value);
      return String(val || '') === String(rule.value || '');
    }
    if (rule.operator === 'not_equals') {
      if (Array.isArray(val)) return !val.includes(rule.value);
      return String(val || '') !== String(rule.value || '');
    }
    if (rule.operator === 'contains') {
      if (Array.isArray(val)) return val.some(v => String(v).toLowerCase().includes(String(rule.value || '').toLowerCase()));
      return String(val || '').toLowerCase().includes(String(rule.value || '').toLowerCase());
    }
    return false;
  };

  // Render Piped Text dynamically (e.g. @q1, @answerq1, or ${q:1})
  const renderPipedText = (text: string | undefined): string => {
    if (!text || !form) return '';
    return text.replace(/(@answerq\d+|@q\d+|\$\{q:[a-zA-Z0-9_-]+\})/gi, (match) => {
      const numMatch = match.match(/\d+/);
      const qNumStr = numMatch ? numMatch[0] : '';
      let targetBlock = form.schema.find(b => b.id === qNumStr);
      if (!targetBlock && !isNaN(Number(qNumStr))) {
        const idx = Number(qNumStr) - 1;
        targetBlock = form.schema.filter(b => b.type !== 'page_break')[idx];
      }
      if (!targetBlock) return match;
      const val = answers[targetBlock.id];
      if (val === undefined || val === null || val === '') return '';
      if (Array.isArray(val)) return val.join(', ');
      return String(val);
    });
  };

  // Compute processed & visible question blocks based on active logic rules & piped text
  const visibleBlocks = useMemo(() => {
    if (!form) return [];

    const blocks = form.schema;
    const result: QuestionBlock[] = [];
    let skipUntilBlockId: string | null = null;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];

      // If a previous skip logic jumped over this block
      if (skipUntilBlockId) {
        if (skipUntilBlockId === 'submit') {
          break; // Stop rendering remaining questions
        }
        if (b.id === skipUntilBlockId) {
          skipUntilBlockId = null; // Reached jump target
        } else {
          continue; // Skip this block
        }
      }

      // Check Display Logic / Hide Rules attached to this block
      const rules = b.logicRules || [];
      const showRules = rules.filter(r => r.action === 'show');
      const hideRules = rules.filter(r => r.action === 'hide');
      const matchMode = b.logicMatchMode || 'ALL';

      let isVisible = true;
      if (showRules.length > 0) {
        if (matchMode === 'ANY') {
          isVisible = showRules.some(r => evaluateRuleCondition(r, answers));
        } else {
          isVisible = showRules.every(r => evaluateRuleCondition(r, answers));
        }
      }
      if (hideRules.length > 0) {
        if (matchMode === 'ANY') {
          if (hideRules.some(r => evaluateRuleCondition(r, answers))) isVisible = false;
        } else {
          if (hideRules.every(r => evaluateRuleCondition(r, answers))) isVisible = false;
        }
      }

      if (!isVisible) continue;

      // Carry Forward Logic: Dynamic Options from explicit carryForwardFromBlockId
      let effectiveOptions = b.options;
      if (b.carryForwardFromBlockId) {
        const sourceVal = answers[b.carryForwardFromBlockId];
        if (Array.isArray(sourceVal) && sourceVal.length > 0) {
          effectiveOptions = sourceVal;
        } else if (typeof sourceVal === 'string' && sourceVal.trim()) {
          effectiveOptions = [sourceVal];
        }
      }

      const processedBlock: QuestionBlock = {
        ...b,
        label: renderPipedText(b.label),
        description: renderPipedText(b.description),
        options: effectiveOptions
      };

      result.push(processedBlock);

      // Check Skip Logic / Jump To Rules attached to this block
      const jumpRules = rules.filter(r => r.action === 'jump_to');
      for (const jRule of jumpRules) {
        if (evaluateRuleCondition(jRule, answers) && jRule.targetBlockId) {
          skipUntilBlockId = jRule.targetBlockId;
          break;
        }
      }
    }

    return result;
  }, [form, answers]);

  // Group visible blocks into pages separated by page_break blocks
  const formPages = useMemo(() => {
    if (!visibleBlocks || visibleBlocks.length === 0) return [];
    const result: { pageIndex: number; pageTitle?: string; blocks: QuestionBlock[] }[] = [];
    let currentBlocks: QuestionBlock[] = [];
    let currentTitle: string | undefined = undefined;

    for (const b of visibleBlocks) {
      if (b.type === 'page_break') {
        if (currentBlocks.length > 0 || result.length === 0) {
          result.push({
            pageIndex: result.length,
            pageTitle: currentTitle,
            blocks: currentBlocks
          });
          currentBlocks = [];
        }
        currentTitle = b.label || undefined;
      } else {
        currentBlocks.push(b);
      }
    }

    if (currentBlocks.length > 0 || result.length === 0) {
      result.push({
        pageIndex: result.length,
        pageTitle: currentTitle,
        blocks: currentBlocks
      });
    }

    return result;
  }, [visibleBlocks]);

  const activePageIndex = Math.min(currentPageIndex, Math.max(0, formPages.length - 1));
  const currentPage = formPages[activePageIndex] || { pageIndex: 0, blocks: [] };

  // Calculate overall question index offset for active page
  const questionNumberOffset = useMemo(() => {
    const allNonBreakBlocks = visibleBlocks.filter(b => b.type !== 'page_break');
    const firstBlockOfPage = currentPage.blocks[0];
    if (!firstBlockOfPage) return 0;
    const pageFirstIdx = allNonBreakBlocks.findIndex(b => b.id === firstBlockOfPage.id);
    return pageFirstIdx !== -1 ? pageFirstIdx : 0;
  }, [visibleBlocks, currentPage]);

  const validatePageBlocks = (blocks: QuestionBlock[]): boolean => {
    const errors: Record<string, string> = {};
    let firstErrId: string | null = null;

    for (const q of blocks.filter(b => b.type !== 'page_break')) {
      if (q.required) {
        const val = answers[q.id];
        let isEmpty = false;
        if (q.type === 'matrix') {
          isEmpty = !q.rows || q.rows.length === 0 || q.rows.some(row => !val || !val[row.id]);
        } else {
          if (val === undefined || val === null || val === '') isEmpty = true;
          if (Array.isArray(val) && val.length === 0) isEmpty = true;
        }
        if (isEmpty) {
          errors[q.id] = 'Pertanyaan ini wajib diisi.';
          if (!firstErrId) firstErrId = q.id;
        }
      }
    }

    setFieldErrors(errors);

    if (firstErrId) {
      const elem = document.getElementById(`question-${firstErrId}`);
      elem?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  };

  const handleNextPage = () => {
    if (validatePageBlocks(currentPage.blocks)) {
      setCurrentPageIndex(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevPage = () => {
    setCurrentPageIndex(prev => Math.max(0, prev - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (!form) return;

    if (!validatePageBlocks(currentPage.blocks)) return;

    // Draft preview: don't actually submit, just show confirmation
    if (form.status === 'draft') {
      alert('✅ Pratinjau berhasil! Jawaban Anda valid. Publikasikan form ini terlebih dahulu agar responden dapat mengirim jawaban.');
      return;
    }

    try {
      setSubmitting(true);
      await submitFormResponse(form.id, answers);
      setSubmitted(true);
    } catch (err) {
      alert('Gagal mengirimkan jawaban. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
        <p className="text-sm text-gray-500">Memuat form...</p>
      </div>
    );
  }

  if (errorMsg || !form) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 max-w-md w-full text-center shadow-sm space-y-4">
          <div className="w-14 h-14 bg-rose-50 dark:bg-rose-900/30 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Tidak Dapat Memuat Form</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-t-8 border-t-emerald-600 border-x border-b border-gray-200 dark:border-gray-700 p-8 max-w-md w-full text-center shadow-md space-y-4">
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Terima Kasih!</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Jawaban Anda telah berhasil terkirim dan tercatat secara aman.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-10">
      {/* Draft Preview Banner */}
      {form.status === 'draft' && (
        <div className="bg-amber-500 text-white text-xs font-bold py-2.5 px-4 text-center sticky top-0 z-50 shadow-md flex items-center justify-center gap-2">
          <span>👁️ MODE PRATINJAU DRAF</span>
          <span className="font-normal opacity-90 hidden sm:inline">— Anda sedang melihat draf survei.</span>
        </div>
      )}

      <div className="max-w-2xl mx-auto space-y-8 pt-6 px-4">
        {/* Header */}
        <div className="space-y-3 pb-6 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold tracking-wide uppercase">
              <span>JFU Form</span>
              <span className="bg-indigo-600 text-white text-[9px] px-1.5 py-0.2 rounded-full normal-case">BETA</span>
            </div>
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">* Wajib diisi</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
            {form.title}
          </h1>
          {form.description && (
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 whitespace-pre-line leading-relaxed">
              {form.description}
            </p>
          )}
        </div>

        {/* Multi-step Page Progress Bar */}
        {formPages.length > 1 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                📄 Halaman {activePageIndex + 1} dari {formPages.length}
                {currentPage.pageTitle && <span className="text-gray-400 dark:text-gray-500 font-medium">• {currentPage.pageTitle}</span>}
              </span>
              <span>{Math.round(((activePageIndex + 1) / formPages.length) * 100)}% Selesai</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 rounded-full"
                style={{ width: `${((activePageIndex + 1) / formPages.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Question Form Body for Active Page */}
        <div className="space-y-10 sm:space-y-12">
          {currentPage.blocks.map((q: QuestionBlock, idx: number) => {
            const overallNum = questionNumberOffset + idx + 1;
            const hasError = !!fieldErrors[q.id];
            return (
              <div
                key={q.id}
                id={`question-${q.id}`}
                className={`space-y-4 pb-8 border-b border-gray-100 dark:border-gray-800 last:border-b-0 transition-colors ${
                  hasError ? 'border-l-2 border-l-rose-400 pl-4 -ml-4' : ''
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-indigo-500 dark:text-indigo-400 shrink-0">
                      {overallNum}.
                    </span>
                    <label className="text-lg sm:text-2xl font-semibold text-gray-900 dark:text-white leading-snug">
                      {q.label} {q.required && <span className="text-rose-500 ml-1">*</span>}
                    </label>
                  </div>
                  {q.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed pl-6">
                      {q.description}
                    </p>
                  )}
                </div>

                {/* Render Question Inputs */}
                <div className="pl-6">
                  {/* Short Text */}
                  {q.type === 'short_text' && (
                    <input
                      type="text"
                      value={answers[q.id] || ''}
                      onChange={(e) => handleInputChange(q.id, e.target.value)}
                      placeholder="Jawaban Anda..."
                      className="w-full text-lg bg-transparent border-0 border-b-2 border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:outline-none rounded-none px-0 py-2 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 transition-colors"
                    />
                  )}

                  {/* Long Text */}
                  {q.type === 'long_text' && (
                    <textarea
                      value={answers[q.id] || ''}
                      onChange={(e) => handleInputChange(q.id, e.target.value)}
                      placeholder="Jawaban Anda..."
                      rows={3}
                      className="w-full text-lg bg-transparent border-0 border-b-2 border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:outline-none rounded-none px-0 py-2 text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 resize-none transition-colors"
                    />
                  )}

                  {/* Multiple Choice */}
                  {q.type === 'multiple_choice' && (
                    <div className="space-y-2">
                      {(q.options || []).map((opt, optIdx) => {
                        const letter = String.fromCharCode(65 + optIdx);
                        const isSelected = answers[q.id] === opt;
                        return (
                          <label
                            key={optIdx}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-150 ${
                              isSelected
                                ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-100 font-semibold'
                                : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-gray-700 dark:text-gray-200'
                            }`}
                          >
                            <span className={`w-7 h-7 shrink-0 rounded-md border flex items-center justify-center text-xs font-bold transition-all ${
                              isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                            }`}>
                              {letter}
                            </span>
                            <input
                              type="radio"
                              name={`q_${q.id}`}
                              value={opt}
                              checked={isSelected}
                              onChange={() => handleInputChange(q.id, opt)}
                              className="sr-only"
                            />
                            <span className="text-sm font-medium">{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Checkboxes */}
                  {q.type === 'checkbox' && (
                    <div className="space-y-2">
                      {(q.options || []).map((opt, optIdx) => {
                        const letter = String.fromCharCode(65 + optIdx);
                        const currentArr: string[] = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                        const isChecked = currentArr.includes(opt);
                        return (
                          <label
                            key={optIdx}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-150 ${
                              isChecked
                                ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-950 dark:text-indigo-100 font-semibold'
                                : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-gray-700 dark:text-gray-200'
                            }`}
                          >
                            <span className={`w-7 h-7 shrink-0 rounded-md border flex items-center justify-center text-xs font-bold transition-all ${
                              isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                            }`}>
                              {isChecked ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : letter}
                            </span>
                            <input
                              type="checkbox"
                              value={opt}
                              checked={isChecked}
                              onChange={() => handleCheckboxToggle(q.id, opt)}
                              className="sr-only"
                            />
                            <span className="text-sm font-medium">{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Rating / Scale */}
                  {q.type === 'rating' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {Array.from({ length: q.maxScale || 5 }, (_, i) => i + 1).map((val) => {
                        const isSelected = answers[q.id] === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => handleInputChange(q.id, val)}
                            className={`flex flex-col items-center justify-center w-11 h-11 rounded-lg font-bold text-sm border transition-all ${
                              isSelected
                                ? 'bg-amber-500 text-white border-amber-500 scale-105'
                                : 'bg-transparent text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-amber-400'
                            }`}
                          >
                            <Star className={`w-3.5 h-3.5 ${isSelected ? 'fill-white' : 'text-amber-400'}`} />
                            <span>{val}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Date */}
                  {q.type === 'date' && (
                    <input
                      type="date"
                      value={answers[q.id] || ''}
                      onChange={(e) => handleInputChange(q.id, e.target.value)}
                      className="w-full sm:w-64 text-lg bg-transparent border-0 border-b-2 border-gray-200 dark:border-gray-700 focus:border-indigo-500 focus:outline-none rounded-none px-0 py-2 text-gray-900 dark:text-white transition-colors"
                    />
                  )}

                  {/* Matrix */}
                  {q.type === 'matrix' && (
                    <>
                      {/* Desktop: table layout */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr>
                              <th className="text-left" />
                              {(q.options || []).map((col, colIdx) => (
                                <th key={colIdx} className="text-center font-semibold text-gray-600 dark:text-gray-300 pb-3 px-2 text-xs">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(q.rows || []).map((row) => (
                              <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
                                <td className="py-3 pr-4 text-sm font-medium text-gray-800 dark:text-gray-100 whitespace-nowrap">
                                  {row.label}
                                </td>
                                {(q.options || []).map((col, colIdx) => {
                                  const isSelected = answers[q.id]?.[row.id] === col;
                                  return (
                                    <td key={colIdx} className="text-center py-3 px-2">
                                      <button
                                        type="button"
                                        onClick={() => handleMatrixChange(q.id, row.id, col)}
                                        aria-label={`${row.label}: ${col}`}
                                        className={`w-5 h-5 rounded-full border-2 mx-auto transition-all ${
                                          isSelected
                                            ? 'border-indigo-600 bg-indigo-600'
                                            : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                                        }`}
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile: stacked rows with choice pills */}
                      <div className="sm:hidden space-y-5">
                        {(q.rows || []).map((row) => (
                          <div key={row.id} className="space-y-2">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{row.label}</p>
                            <div className="flex flex-wrap gap-2">
                              {(q.options || []).map((col, colIdx) => {
                                const isSelected = answers[q.id]?.[row.id] === col;
                                return (
                                  <button
                                    key={colIdx}
                                    type="button"
                                    onClick={() => handleMatrixChange(q.id, row.id, col)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                                      isSelected
                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                                    }`}
                                  >
                                    {col}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {hasError && (
                  <p className="text-xs font-semibold text-rose-500 pl-6">
                    {fieldErrors[q.id]}
                  </p>
                )}
              </div>
            );
          })}

          {/* Navigation Controls: Kembali, Lanjut, Kirim */}
          <div className="pt-6 flex items-center justify-between gap-3">
            {activePageIndex > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={handlePrevPage}
                className="px-6 py-3 rounded-xl font-bold border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-750 flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Kembali
              </Button>
            ) : <div />}

            {activePageIndex < formPages.length - 1 ? (
              <Button
                type="button"
                onClick={handleNextPage}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3.5 rounded-xl font-bold shadow-md shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center gap-2"
              >
                Lanjut <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="w-full sm:w-auto bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-9 py-3.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Mengirim...
                  </>
                ) : (
                  'Kirim Jawaban'
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Minimalist Powered By Footer */}
        <div className="pt-8 pb-6 text-center space-y-1.5 border-t border-gray-200/60 dark:border-gray-800/80 mt-10">
          <p className="text-[10px] font-bold tracking-wider text-gray-400 dark:text-gray-500 uppercase">
            Powered by
          </p>
          <div className="flex items-center justify-center">
            <a
              href="https://jakpatforuniv.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-gray-900 dark:text-white font-bold text-sm hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors group"
            >
              <img src={jfuIcon} alt="Jakpat for Univ Icon" className="w-5 h-5 object-contain group-hover:scale-110 transition-transform" />
              <span className="tracking-tight font-sans">Jakpat for Univ</span>
            </a>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Buat survei akademik dengan mudah.{' '}
            <a
              href="https://jakpatforuniv.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 dark:text-indigo-400 font-medium underline hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              Daftar gratis
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
