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
  Star
} from 'lucide-react';
import { Button } from '../../components/ui/button';

export const PublicFormPage: React.FC = () => {
  const { formId, username, slug } = useParams<{ formId?: string; username?: string; slug?: string }>();
  const [form, setForm] = useState<CustomForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

      if (!fetchedForm) {
        setErrorMsg('Form tidak ditemukan atau tidak dipublikasikan.');
      } else if (fetchedForm.status !== 'published') {
        setErrorMsg('Form ini saat ini dalam status draf dan belum dipublikasikan.');
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
        const copy = { ...prev };
        delete copy[questionId];
        return copy;
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

  const validateForm = (): boolean => {
    if (!form) return false;
    const errors: Record<string, string> = {};

    visibleBlocks.forEach(q => {
      if (q.required) {
        const val = answers[q.id];
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          errors[q.id] = 'Pertanyaan ini wajib diisi.';
        }
      }
    });

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    if (!validateForm()) {
      const firstErrKey = Object.keys(fieldErrors)[0];
      if (firstErrKey) {
        const elem = document.getElementById(`question-${firstErrKey}`);
        elem?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
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
      return String(val || '').trim().toLowerCase() === String(rule.value || '').trim().toLowerCase();
    }
    if (rule.operator === 'not_equals') {
      if (Array.isArray(val)) return !val.includes(rule.value);
      return String(val || '').trim().toLowerCase() !== String(rule.value || '').trim().toLowerCase();
    }
    if (rule.operator === 'contains') {
      if (Array.isArray(val)) return val.some(v => String(v).toLowerCase().includes(String(rule.value || '').toLowerCase()));
      return String(val || '').toLowerCase().includes(String(rule.value || '').toLowerCase());
    }
    return false;
  };

  // Render Piped Text dynamically (e.g. ${q:1} or ${q:block_id})
  const renderPipedText = (text: string | undefined): string => {
    if (!text || !form) return '';
    return text.replace(/\$\{q:([a-zA-Z0-9_-]+)\}/g, (_, targetId) => {
      let targetBlock = form.schema.find(b => b.id === targetId);
      if (!targetBlock && !isNaN(Number(targetId))) {
        const idx = Number(targetId) - 1;
        targetBlock = form.schema[idx];
      }
      if (!targetBlock) return '';
      const val = answers[targetBlock.id];
      if (val === undefined || val === null) return '';
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header Title Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-t-8 border-t-blue-600 border-x border-b border-gray-200 dark:border-gray-700 p-6 sm:p-8 shadow-sm space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight">
            {form.title}
          </h1>
          {form.description && (
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed">
              {form.description}
            </p>
          )}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between text-xs text-gray-400">
            <span>* Wajib diisi</span>
            <span>Powered by Jakpat for Univ</span>
          </div>
        </div>

        {/* Question Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {visibleBlocks.map((q: QuestionBlock, idx: number) => {
            const hasError = !!fieldErrors[q.id];
            return (
              <div
                key={q.id}
                id={`question-${q.id}`}
                className={`bg-white dark:bg-gray-800 rounded-xl border p-6 shadow-sm transition-all space-y-3 ${
                  hasError
                    ? 'border-rose-400 dark:border-rose-500 ring-2 ring-rose-100 dark:ring-rose-900/30'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div>
                  <label className="text-base font-semibold text-gray-900 dark:text-white block">
                    {idx + 1}. {q.label} {q.required && <span className="text-rose-500">*</span>}
                  </label>
                  {q.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {q.description}
                    </p>
                  )}
                </div>

                {/* Render Question Inputs */}
                <div className="pt-1">
                  {/* Short Text */}
                  {q.type === 'short_text' && (
                    <input
                      type="text"
                      value={answers[q.id] || ''}
                      onChange={(e) => handleInputChange(q.id, e.target.value)}
                      placeholder="Jawaban Anda..."
                      className="w-full text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}

                  {/* Long Text */}
                  {q.type === 'long_text' && (
                    <textarea
                      value={answers[q.id] || ''}
                      onChange={(e) => handleInputChange(q.id, e.target.value)}
                      placeholder="Jawaban Anda..."
                      rows={3}
                      className="w-full text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                  )}

                  {/* Multiple Choice */}
                  {q.type === 'multiple_choice' && (
                    <div className="space-y-2">
                      {(q.options || []).map((opt, optIdx) => (
                        <label
                          key={optIdx}
                          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/30 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors"
                        >
                          <input
                            type="radio"
                            name={`q_${q.id}`}
                            value={opt}
                            checked={answers[q.id] === opt}
                            onChange={() => handleInputChange(q.id, opt)}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                          />
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {opt}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Checkboxes */}
                  {q.type === 'checkbox' && (
                    <div className="space-y-2">
                      {(q.options || []).map((opt, optIdx) => {
                        const currentArr: string[] = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                        const isChecked = currentArr.includes(opt);
                        return (
                          <label
                            key={optIdx}
                            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/30 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              value={opt}
                              checked={isChecked}
                              onChange={() => handleCheckboxToggle(q.id, opt)}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                            />
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                              {opt}
                            </span>
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
                            className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl font-bold text-sm border transition-all ${
                              isSelected
                                ? 'bg-amber-500 text-white border-amber-600 shadow-md scale-105'
                                : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                            }`}
                          >
                            <Star className={`w-3.5 h-3.5 ${isSelected ? 'fill-white' : 'text-amber-500'}`} />
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
                      className="w-full sm:w-64 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>

                {hasError && (
                  <p className="text-xs font-semibold text-rose-500 pt-1">
                    {fieldErrors[q.id]}
                  </p>
                )}
              </div>
            );
          })}

          <div className="pt-4 flex justify-end">
            <Button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold shadow-md"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Mengirim...
                </>
              ) : (
                'Kirim Jawaban'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
