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
  Check
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

  // Render Piped Text dynamically (e.g. @q1, @answerq1, or ${q:1})
  const renderPipedText = (text: string | undefined): string => {
    if (!text || !form) return '';
    return text.replace(/(@answerq\d+|@q\d+|\$\{q:[a-zA-Z0-9_-]+\})/gi, (match) => {
      const numMatch = match.match(/\d+/);
      const qNumStr = numMatch ? numMatch[0] : '';
      let targetBlock = form.schema.find(b => b.id === qNumStr);
      if (!targetBlock && !isNaN(Number(qNumStr))) {
        const idx = Number(qNumStr) - 1;
        targetBlock = form.schema[idx];
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

      <div className="max-w-2xl mx-auto space-y-6 pt-6 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700/80 shadow-xs overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          <div className="p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50 text-[11px] font-bold tracking-wide">
                <span>JFU Form</span>
                <span className="bg-indigo-600 text-white text-[9px] px-1.5 py-0.2 rounded-full">BETA</span>
              </div>
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500">* Wajib diisi</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white leading-tight tracking-tight">
              {form.title}
            </h1>
            {form.description && (
              <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed border-t border-gray-100 dark:border-gray-700/80 pt-3">
                {form.description}
              </p>
            )}
          </div>
        </div>

        {/* Question Form Body */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {visibleBlocks.map((q: QuestionBlock, idx: number) => {
            const hasError = !!fieldErrors[q.id];
            return (
              <div
                key={q.id}
                id={`question-${q.id}`}
                className={`bg-white dark:bg-gray-800 rounded-2xl border p-6 sm:p-7 shadow-xs hover:shadow-md transition-all space-y-4 ${
                  hasError
                    ? 'border-rose-400 dark:border-rose-500 ring-2 ring-rose-100 dark:ring-rose-900/30'
                    : 'border-gray-200/80 dark:border-gray-700/80'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center border border-indigo-100 dark:border-indigo-800 shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="space-y-1">
                    <label className="text-base font-bold text-gray-900 dark:text-white block leading-snug">
                      {q.label} {q.required && <span className="text-rose-500 font-bold ml-0.5">*</span>}
                    </label>
                    {q.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                        {q.description}
                      </p>
                    )}
                  </div>
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
                      className="w-full text-sm bg-gray-50/60 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-xl p-3.5 text-gray-900 dark:text-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  )}

                  {/* Long Text */}
                  {q.type === 'long_text' && (
                    <textarea
                      value={answers[q.id] || ''}
                      onChange={(e) => handleInputChange(q.id, e.target.value)}
                      placeholder="Jawaban Anda..."
                      rows={3}
                      className="w-full text-sm bg-gray-50/60 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-xl p-3.5 text-gray-900 dark:text-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition-all"
                    />
                  )}

                  {/* Multiple Choice */}
                  {q.type === 'multiple_choice' && (
                    <div className="space-y-2.5">
                      {(q.options || []).map((opt, optIdx) => {
                        const isSelected = answers[q.id] === opt;
                        return (
                          <label
                            key={optIdx}
                            className={`flex items-center gap-3.5 p-3.5 rounded-xl border cursor-pointer transition-all duration-150 ${
                              isSelected
                                ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 ring-1 ring-indigo-500/20 text-indigo-950 dark:text-indigo-100 font-semibold shadow-2xs'
                                : 'border-gray-200/90 dark:border-gray-700/80 bg-gray-50/40 dark:bg-gray-750 hover:bg-white dark:hover:bg-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-gray-700 dark:text-gray-200'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                              isSelected ? 'border-indigo-600 bg-indigo-600 text-white shadow-2xs scale-105' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                            }`}>
                              {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
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
                    <div className="space-y-2.5">
                      {(q.options || []).map((opt, optIdx) => {
                        const currentArr: string[] = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                        const isChecked = currentArr.includes(opt);
                        return (
                          <label
                            key={optIdx}
                            className={`flex items-center gap-3.5 p-3.5 rounded-xl border cursor-pointer transition-all duration-150 ${
                              isChecked
                                ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 ring-1 ring-indigo-500/20 text-indigo-950 dark:text-indigo-100 font-semibold shadow-2xs'
                                : 'border-gray-200/90 dark:border-gray-700/80 bg-gray-50/40 dark:bg-gray-750 hover:bg-white dark:hover:bg-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-gray-700 dark:text-gray-200'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                              isChecked ? 'border-indigo-600 bg-indigo-600 text-white shadow-2xs scale-105' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                            }`}>
                              {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
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
                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                      {Array.from({ length: q.maxScale || 5 }, (_, i) => i + 1).map((val) => {
                        const isSelected = answers[q.id] === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => handleInputChange(q.id, val)}
                            className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl font-bold text-sm border transition-all ${
                              isSelected
                                ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20 scale-105'
                                : 'bg-gray-50/70 dark:bg-gray-750 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-400'
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
                      className="w-full sm:w-64 text-sm bg-gray-50/60 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-xl p-3.5 text-gray-900 dark:text-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
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
          </div>
        </form>

        {/* SurveyMonkey-style Authentic Powered By Footer */}
        <div className="pt-14 pb-8 text-center space-y-2 border-t border-gray-200/60 dark:border-gray-800/80 mt-12">
          <p className="text-[11px] font-semibold tracking-wider text-gray-400 dark:text-gray-500 uppercase">
            Powered by
          </p>
          <div>
            <a
              href="https://jakpatforuniv.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-gray-900 dark:text-white font-extrabold text-lg sm:text-xl hover:opacity-85 transition-opacity group"
            >
              <img src={jfuIcon} alt="Jakpat for Univ Icon" className="w-6.5 h-6.5 object-contain group-hover:scale-105 transition-transform" />
              <span className="tracking-tight font-sans">Jakpat for Univ</span>
            </a>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 pt-0.5">
            Buat survei dan kuesioner akademik dengan mudah.{' '}
            <a
              href="https://jakpatforuniv.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 dark:text-indigo-400 font-semibold underline hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              Daftar gratis.
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
