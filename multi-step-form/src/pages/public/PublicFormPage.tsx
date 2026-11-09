import React, { useEffect, useState, useMemo, useRef } from 'react';
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
  Check,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import jfuIcon from '../../assets/jfu-icon.png';

export const isOtherOption = (opt: string) => /lainnya|sebutkan|other/i.test(opt);

export const getOtherDetail = (val: string | undefined, opt: string) => {
  if (!val) return '';
  const prefix = `${opt}: `;
  if (val.startsWith(prefix)) {
    return val.slice(prefix.length);
  }
  return '';
};

export const isRedundantMultiSelectHint = (desc: string | undefined): boolean => {
  if (!desc) return false;
  const trimmed = desc.trim();
  if (!trimmed) return false;
  return (
    /^(?:(?:boleh|dapat|bisa)\s+)?(?:memilih|pilih)\s+(?:lebih\s+dari\s+(?:satu|1)|banyak|beberapa)(?:\s+(?:jawaban|opsi|pilihan))?\.?$/i.test(trimmed) ||
    /^(?:select|choose)\s+(?:all\s+that\s+apply|more\s+than\s+one)\.?$/i.test(trimmed)
  );
};

export const resolveScaleConfig = (
  q: Pick<QuestionBlock, 'description' | 'maxScale' | 'minScaleLabel' | 'maxScaleLabel'>
): {
  minLabel: string;
  maxLabel: string;
  hideDescription: boolean;
} => {
  const maxScale = q.maxScale || 5;
  const desc = (q.description || '').trim();

  const hasStep1 = /(?:^|[,;\s])1\s*[.=:-]\s*/.test(desc);
  const hasStep2 = /[,;\s]2\s*[.=:-]\s*/.test(desc);
  const hasMaxStep = new RegExp(`[,;\\s]${maxScale}\\s*[.=:-]\\s*`).test(desc);
  const isScaleLegendDesc = hasStep1 && hasStep2 && hasMaxStep;

  const cleanEndpointLabel = (raw: string, isMin: boolean): string => {
    const trimmed = raw.trim().replace(/[.;,]+$/, '').trim();
    if (isMin && /\(\s*STS\s*\)/i.test(trimmed)) {
      return 'Sangat Tidak Setuju';
    }
    return trimmed.replace(/\s*\([^)]*\)\s*$/, '').trim();
  };

  let extractedMin = '';
  let extractedMax = '';
  if (isScaleLegendDesc) {
    const minMatch = desc.match(/(?:^|[,;\s])1\s*[.=:-]\s*([^,;]+?)(?=[,;\s]+2\s*[.=:-])/i);
    const maxMatch = desc.match(new RegExp(`[,;\\s]${maxScale}\\s*[.=:-]\\s*([^,;.]+)`, 'i'));
    if (minMatch?.[1]) extractedMin = cleanEndpointLabel(minMatch[1], true);
    if (maxMatch?.[1]) extractedMax = cleanEndpointLabel(maxMatch[1], false);
  }

  const rawMin = (q.minScaleLabel || '').trim() || extractedMin || 'Sangat Tidak Setuju';
  const rawMax = (q.maxScaleLabel || '').trim() || extractedMax || 'Sangat Setuju';

  const formatWithNum = (num: number, label: string) => {
    const stripped = label.replace(/^\d+\s*[.=:-]?\s*/, '').trim();
    return `${num}. ${stripped}`;
  };

  return {
    minLabel: formatWithNum(1, rawMin),
    maxLabel: formatWithNum(maxScale, rawMax),
    hideDescription: isScaleLegendDesc,
  };
};

export const getNextUnansweredMatrixRowIndex = (
  rows: { id: string; label: string }[],
  matrixAnswers: Record<string, string> | undefined,
  currentIndex: number
): number => {
  if (!rows || rows.length === 0) return -1;
  const ans = matrixAnswers || {};
  for (let i = currentIndex + 1; i < rows.length; i++) {
    if (!ans[rows[i].id]) return i;
  }
  for (let i = 0; i < currentIndex; i++) {
    if (!ans[rows[i].id]) return i;
  }
  return -1;
};

export const PublicFormPage: React.FC = () => {
  const { formId, username, slug } = useParams<{ formId?: string; username?: string; slug?: string }>();
  const [form, setForm] = useState<CustomForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [matrixActiveRow, setMatrixActiveRow] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  const questionsTopRef = useRef<HTMLDivElement>(null);
  const matrixAdvanceTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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

  // Restore draft answers from localStorage on form load
  useEffect(() => {
    if (!form?.id) return;
    try {
      const saved = localStorage.getItem(`jfu_answers_${form.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.answers && typeof parsed.answers === 'object') {
          setAnswers(prev => ({ ...parsed.answers, ...prev }));
          if (typeof parsed.pageIndex === 'number' && parsed.pageIndex > 0) {
            setCurrentPageIndex(parsed.pageIndex);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to restore draft from localStorage', e);
    }
  }, [form?.id]);

  // Debounced auto-save draft to localStorage
  useEffect(() => {
    if (!form?.id || submitted) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          `jfu_answers_${form.id}`,
          JSON.stringify({ answers, pageIndex: currentPageIndex, updatedAt: Date.now() })
        );
      } catch (e) {}
    }, 600);
    return () => clearTimeout(timer);
  }, [form?.id, answers, currentPageIndex, submitted]);

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

  const handleChoiceSelect = (questionId: string, opt: string) => {
    if (isOtherOption(opt)) {
      const currentDetail = otherTexts[`${questionId}_${opt}`] || '';
      const finalVal = currentDetail.trim() ? `${opt}: ${currentDetail.trim()}` : opt;
      handleInputChange(questionId, finalVal);
    } else {
      handleInputChange(questionId, opt);
    }
  };

  const handleOtherChoiceDetail = (questionId: string, opt: string, text: string) => {
    setOtherTexts(prev => ({ ...prev, [`${questionId}_${opt}`]: text }));
    const finalVal = text.trim() ? `${opt}: ${text.trim()}` : opt;
    handleInputChange(questionId, finalVal);
  };

  const handleCheckboxToggle = (questionId: string, opt: string) => {
    const currentList: string[] = Array.isArray(answers[questionId]) ? answers[questionId] : [];
    const isOther = isOtherOption(opt);
    const existingIndex = currentList.findIndex(item => item === opt || item.startsWith(`${opt}: `));

    if (existingIndex !== -1) {
      // Uncheck
      const updated = currentList.filter((_, i) => i !== existingIndex);
      handleInputChange(questionId, updated);
    } else {
      // Check
      const currentDetail = isOther ? (otherTexts[`${questionId}_${opt}`] || '') : '';
      const entry = currentDetail.trim() ? `${opt}: ${currentDetail.trim()}` : opt;
      handleInputChange(questionId, [...currentList, entry]);
    }
  };

  const handleOtherCheckboxDetail = (questionId: string, opt: string, text: string) => {
    setOtherTexts(prev => ({ ...prev, [`${questionId}_${opt}`]: text }));
    const currentList: string[] = Array.isArray(answers[questionId]) ? answers[questionId] : [];
    const existingIndex = currentList.findIndex(item => item === opt || item.startsWith(`${opt}: `));
    const entry = text.trim() ? `${opt}: ${text.trim()}` : opt;

    if (existingIndex !== -1) {
      const updated = [...currentList];
      updated[existingIndex] = entry;
      handleInputChange(questionId, updated);
    } else {
      handleInputChange(questionId, [...currentList, entry]);
    }
  };

  const handleMatrixChange = (questionId: string, rowId: string, option: string) => {
    handleInputChange(questionId, { ...(answers[questionId] || {}), [rowId]: option });
    if (fieldErrors[`${questionId}_${rowId}`]) {
      setFieldErrors(prev => {
        const updated = { ...prev };
        delete updated[`${questionId}_${rowId}`];
        return updated;
      });
    }
  };

  const handleMatrixStepClick = (questionId: string, targetRowIndex: number) => {
    if (matrixAdvanceTimerRef.current[questionId]) {
      clearTimeout(matrixAdvanceTimerRef.current[questionId]);
      delete matrixAdvanceTimerRef.current[questionId];
    }
    setMatrixActiveRow(prev => ({ ...prev, [questionId]: targetRowIndex }));
  };

  const handleMobileMatrixSelect = (
    questionId: string,
    rowId: string,
    option: string,
    rows: { id: string; label: string }[] = [],
    rowIndex: number
  ) => {
    const updatedRowAnswers = { ...(answers[questionId] || {}), [rowId]: option };
    handleMatrixChange(questionId, rowId, option);

    if (matrixAdvanceTimerRef.current[questionId]) {
      clearTimeout(matrixAdvanceTimerRef.current[questionId]);
    }

    // Auto-advance Focus Card Stepper to next unanswered matrix row after brief visual feedback
    const nextUnansweredIdx = getNextUnansweredMatrixRowIndex(rows, updatedRowAnswers, rowIndex);
    if (nextUnansweredIdx !== -1 && nextUnansweredIdx !== rowIndex) {
      matrixAdvanceTimerRef.current[questionId] = setTimeout(() => {
        setMatrixActiveRow(prev => ({ ...prev, [questionId]: nextUnansweredIdx }));
        delete matrixAdvanceTimerRef.current[questionId];
      }, 220);
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
      if (Array.isArray(val)) {
        return val.some(v => v === rule.value || (typeof v === 'string' && v.startsWith(`${rule.value}: `)));
      }
      return String(val || '').startsWith(`${rule.value}: `) || String(val || '') === String(rule.value || '');
    }
    if (rule.operator === 'not_equals') {
      if (Array.isArray(val)) {
        return !val.some(v => v === rule.value || (typeof v === 'string' && v.startsWith(`${rule.value}: `)));
      }
      return !String(val || '').startsWith(`${rule.value}: `) && String(val || '') !== String(rule.value || '');
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

  // Total answerable questions across the entire form
  const totalAnswerableCount = useMemo(() => {
    return visibleBlocks.filter(b => b.type !== 'page_break' && b.type !== 'image').length;
  }, [visibleBlocks]);

  // Number of answered questions
  const answeredCount = useMemo(() => {
    if (!visibleBlocks) return 0;
    return visibleBlocks
      .filter(b => b.type !== 'page_break' && b.type !== 'image')
      .filter(b => {
        const val = answers[b.id];
        if (val === undefined || val === null || val === '') return false;
        if (Array.isArray(val)) return val.length > 0;
        if (b.type === 'matrix') {
          return b.rows && b.rows.length > 0 && b.rows.every(r => val && val[r.id]);
        }
        return true;
      }).length;
  }, [visibleBlocks, answers]);

  const overallProgressPercent = totalAnswerableCount > 0
    ? Math.round((answeredCount / totalAnswerableCount) * 100)
    : 0;

  const scrollToQuestionsTop = () => {
    if (questionsTopRef.current) {
      questionsTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const validatePageBlocks = (blocks: QuestionBlock[]): boolean => {
    const errors: Record<string, string> = {};
    let firstErrId: string | null = null;
    const nextMatrixSteps: Record<string, number> = {};

    for (const q of blocks.filter(b => b.type !== 'page_break' && b.type !== 'image')) {
      const val = answers[q.id];

      if (q.required) {
        let isEmpty = false;
        if (q.type === 'matrix') {
          const rows = q.rows || [];
          const missingRows = rows.filter(row => !val || !val[row.id]);
          if (missingRows.length > 0) {
            isEmpty = true;
            missingRows.forEach(r => {
              errors[`${q.id}_${r.id}`] = 'Pernyataan ini wajib diisi.';
            });
            const firstMissingIdx = rows.findIndex(row => !val || !val[row.id]);
            if (firstMissingIdx !== -1) {
              nextMatrixSteps[q.id] = firstMissingIdx;
            }
          }
        } else {
          if (val === undefined || val === null || val === '') isEmpty = true;
          if (Array.isArray(val) && val.length === 0) isEmpty = true;
        }
        if (isEmpty) {
          errors[q.id] = 'Pertanyaan ini wajib diisi.';
          if (!firstErrId) firstErrId = q.id;
        }
      }

      // Check if "Lainnya" was chosen but left empty
      if (q.type === 'multiple_choice' && typeof val === 'string' && isOtherOption(val) && !val.includes(': ')) {
        errors[q.id] = 'Mohon sebutkan rincian jawaban Anda untuk opsi Lainnya.';
        if (!firstErrId) firstErrId = q.id;
      }

      if (q.type === 'checkbox' && Array.isArray(val)) {
        const incompleteOther = val.find(item => isOtherOption(item) && !item.includes(': '));
        if (incompleteOther) {
          errors[q.id] = 'Mohon sebutkan rincian jawaban Anda untuk opsi Lainnya.';
          if (!firstErrId) firstErrId = q.id;
        }
      }
    }

    if (Object.keys(nextMatrixSteps).length > 0) {
      setMatrixActiveRow(prev => ({ ...prev, ...nextMatrixSteps }));
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
      setTimeout(scrollToQuestionsTop, 60);
    }
  };

  const handlePrevPage = () => {
    setCurrentPageIndex(prev => Math.max(0, prev - 1));
    setTimeout(scrollToQuestionsTop, 60);
  };

  const handleSubmit = async () => {
    if (!form) return;

    if (!validatePageBlocks(currentPage.blocks)) return;

    // Draft preview: don't actually submit, just show toast confirmation
    if (form.status === 'draft') {
      toast.success('Pratinjau berhasil! Jawaban Anda valid. Publikasikan form ini terlebih dahulu agar responden dapat mengirim jawaban.');
      return;
    }

    try {
      setSubmitting(true);
      await submitFormResponse(form.id, answers);
      try {
        localStorage.removeItem(`jfu_answers_${form.id}`);
      } catch (e) {}
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengirimkan jawaban. Silakan coba lagi.');
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
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 max-w-md w-full text-center shadow-md space-y-4">
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
    <div className="min-h-screen bg-slate-100/80 dark:bg-gray-900 pb-12">
      {/* Draft Preview Banner */}
      {form.status === 'draft' && (
        <div className="bg-amber-500 text-white text-xs font-bold py-2 px-4 text-center sticky top-0 z-50 shadow-md flex items-center justify-center gap-2">
          <span>👁️ MODE PRATINJAU DRAF</span>
          <span className="font-normal opacity-90 hidden sm:inline">— Anda sedang melihat draf survei.</span>
        </div>
      )}

      {/* Sticky Progress Header */}
      <div className={`sticky ${form.status === 'draft' ? 'top-8' : 'top-0'} z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200/80 dark:border-gray-800 shadow-2xs py-2 max-sm:px-4 sm:px-8`}>
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-gray-900 dark:text-white truncate">
              {formPages.length > 1
                ? `Bagian ${activePageIndex + 1} dari ${formPages.length}${currentPage.pageTitle ? ` • ${currentPage.pageTitle}` : ''}`
                : (form.title || 'Survei')}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
              {overallProgressPercent}% Selesai
            </span>
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-1.5 w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
            style={{ width: `${Math.max(4, overallProgressPercent)}%` }}
          />
        </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-4 pt-5 max-sm:px-4 sm:px-8">
        {/* Header Hero Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/90 dark:border-gray-700 p-5 sm:p-6 shadow-2xs space-y-3.5">
          {form.header_image_url && (
            <img
              src={form.header_image_url}
              alt=""
              className="w-full max-h-64 object-cover rounded-xl shadow-xs"
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold tracking-wide uppercase">
              <span>JFU Form</span>
              <span className="bg-indigo-600 text-white text-[9px] px-1.5 py-0.2 rounded-full normal-case">BETA</span>
            </div>
            <span className="text-xs font-medium text-gray-400 dark:text-gray-500">* Wajib diisi</span>
          </div>

          <h1 className="max-sm:text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
            {form.title}
          </h1>
          {form.description && (
            <div className="bg-slate-50/90 dark:bg-gray-900/60 border border-slate-200/80 dark:border-gray-700/80 rounded-xl p-3.5">
              <p className="max-sm:text-sm sm:text-base text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed">
                {form.description}
              </p>
            </div>
          )}
        </div>

        {/* Section Target Anchor for Smooth Page Navigation */}
        <div ref={questionsTopRef} className="scroll-mt-20">
          {currentPage.pageTitle && formPages.length > 1 && (
            <div className="bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/70 dark:border-indigo-800/60 rounded-xl px-4 py-3">
              <span className="text-[11px] font-bold tracking-wider uppercase text-indigo-600 dark:text-indigo-400">
                Bagian {activePageIndex + 1}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                {currentPage.pageTitle}
              </h2>
            </div>
          )}
        </div>

        {/* Question Form Body for Active Page */}
        <div className="space-y-4">
          {currentPage.blocks.map((q: QuestionBlock) => {
            const hasError = !!fieldErrors[q.id];

            // Image blocks are decorative — no number, no required state, no answer.
            if (q.type === 'image') {
              return (
                <div key={q.id} id={`question-${q.id}`} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/90 dark:border-gray-700 p-4 shadow-2xs space-y-2">
                  {q.imageUrl && (
                    <img src={q.imageUrl} alt={q.label || ''} className="w-full rounded-xl" />
                  )}
                  {q.label && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">{q.label}</p>
                  )}
                </div>
              );
            }

            const checkedCount = q.type === 'checkbox' && Array.isArray(answers[q.id])
              ? answers[q.id].length
              : 0;
            const scaleConfig = q.type === 'rating' ? resolveScaleConfig(q) : null;
            const showDescription =
              !!q.description &&
              !(q.type === 'checkbox' && isRedundantMultiSelectHint(q.description)) &&
              !(q.type === 'rating' && scaleConfig?.hideDescription);

            return (
              <div
                key={q.id}
                id={`question-${q.id}`}
                className={`bg-white dark:bg-gray-800 rounded-2xl border p-5 sm:p-6 shadow-2xs space-y-3.5 transition-colors ${
                  hasError
                    ? 'border-rose-300 dark:border-rose-700'
                    : 'border-gray-200/90 dark:border-gray-700'
                }`}
              >
                <div className="space-y-1.5">
                  <label className="block text-base sm:text-lg font-medium text-gray-900 dark:text-white leading-relaxed">
                    {q.label} {q.required && <span className="text-rose-500 ml-0.5">*</span>}
                  </label>
                  {showDescription && (
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                      {q.description}
                    </p>
                  )}
                  {q.type === 'checkbox' && (
                    <div className="pt-0.5">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
                          checkedCount > 0
                            ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-800/70'
                            : 'bg-gray-100/90 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200/80 dark:border-gray-700'
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 ${
                            checkedCount > 0
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-gray-400 dark:border-gray-500 bg-white dark:bg-gray-700'
                          }`}
                        >
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                        <span className="tabular-nums">
                          {checkedCount > 0
                            ? `${checkedCount} dipilih • Boleh pilih lebih dari satu`
                            : 'Boleh pilih lebih dari satu'}
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Render Question Inputs */}
                <div>
                  {/* Short Text */}
                  {q.type === 'short_text' && (
                    <input
                      type="text"
                      value={answers[q.id] || ''}
                      onChange={(e) => handleInputChange(q.id, e.target.value)}
                      placeholder="Jawaban Anda..."
                      className="w-full text-base bg-gray-50/70 dark:bg-gray-900/40 focus:bg-white dark:focus:bg-gray-800 border border-gray-200/90 dark:border-gray-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all"
                    />
                  )}

                  {/* Long Text */}
                  {q.type === 'long_text' && (
                    <textarea
                      value={answers[q.id] || ''}
                      onChange={(e) => {
                        handleInputChange(q.id, e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      placeholder="Jawaban Anda..."
                      rows={3}
                      className="w-full text-base bg-gray-50/70 dark:bg-gray-900/40 focus:bg-white dark:focus:bg-gray-800 border border-gray-200/90 dark:border-gray-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 rounded-xl p-3.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-all resize-none leading-relaxed overflow-hidden"
                    />
                  )}

                  {/* Multiple Choice (Radio — Circular Indicator) */}
                  {q.type === 'multiple_choice' && (
                    <div className="space-y-2">
                      {(q.options || []).map((opt, optIdx) => {
                        const isOther = isOtherOption(opt);
                        const isSelected = typeof answers[q.id] === 'string' && (
                          answers[q.id] === opt || answers[q.id].startsWith(`${opt}: `)
                        );
                        const otherDetail = isOther ? getOtherDetail(answers[q.id], opt) : '';

                        return (
                          <div
                            key={optIdx}
                            className={`rounded-xl border transition-all duration-150 ${
                              isSelected
                                ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/35 text-indigo-950 dark:text-indigo-100 shadow-2xs'
                                : 'border-gray-200/80 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40 hover:bg-white dark:hover:bg-gray-750 hover:border-indigo-300 dark:hover:border-indigo-700 text-gray-700 dark:text-gray-200'
                            }`}
                          >
                            <label
                              className="flex items-center gap-3 p-3.5 min-h-[48px] cursor-pointer active:scale-[0.99] transition-transform"
                            >
                              <span
                                className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
                                  isSelected
                                    ? 'border-indigo-600 bg-indigo-600'
                                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                                }`}
                              >
                                {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                              </span>
                              <input
                                type="radio"
                                name={`q_${q.id}`}
                                value={opt}
                                checked={isSelected}
                                onChange={() => handleChoiceSelect(q.id, opt)}
                                className="sr-only"
                              />
                              <span className="text-sm font-medium flex-1">{opt}</span>
                            </label>

                            {/* Inline Other Input when selected */}
                            {isOther && isSelected && (
                              <div className="px-3.5 pb-3.5 pt-0">
                                <input
                                  type="text"
                                  autoFocus
                                  value={otherDetail}
                                  onChange={(e) => handleOtherChoiceDetail(q.id, opt, e.target.value)}
                                  placeholder="Tuliskan jawaban Anda di sini..."
                                  className="w-full text-base sm:text-sm bg-white dark:bg-gray-850 border border-indigo-300 dark:border-indigo-600 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 rounded-lg px-3.5 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 shadow-2xs"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Checkboxes (Multi-Select — Square Indicator) */}
                  {q.type === 'checkbox' && (
                    <div className="space-y-2">
                      {(q.options || []).map((opt, optIdx) => {
                        const isOther = isOtherOption(opt);
                        const currentArr: string[] = Array.isArray(answers[q.id]) ? answers[q.id] : [];
                        const matchingItem = currentArr.find(item => item === opt || item.startsWith(`${opt}: `));
                        const isChecked = !!matchingItem;
                        const otherDetail = isOther && matchingItem ? getOtherDetail(matchingItem, opt) : '';

                        return (
                          <div
                            key={optIdx}
                            className={`rounded-xl border transition-all duration-150 ${
                              isChecked
                                ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/35 text-indigo-950 dark:text-indigo-100 shadow-2xs'
                                : 'border-gray-200/80 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/40 hover:bg-white dark:hover:bg-gray-750 hover:border-indigo-300 dark:hover:border-indigo-700 text-gray-700 dark:text-gray-200'
                            }`}
                          >
                            <label
                              className="flex items-center gap-3 p-3.5 min-h-[48px] cursor-pointer active:scale-[0.99] transition-transform"
                            >
                              <span
                                className={`w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-all ${
                                  isChecked
                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                                }`}
                              >
                                {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                              </span>
                              <input
                                type="checkbox"
                                value={opt}
                                checked={isChecked}
                                onChange={() => handleCheckboxToggle(q.id, opt)}
                                className="sr-only"
                              />
                              <span className="text-sm font-medium flex-1">{opt}</span>
                            </label>

                            {/* Inline Other Input when checked */}
                            {isOther && isChecked && (
                              <div className="px-3.5 pb-3.5 pt-0">
                                <input
                                  type="text"
                                  autoFocus
                                  value={otherDetail}
                                  onChange={(e) => handleOtherCheckboxDetail(q.id, opt, e.target.value)}
                                  placeholder="Tuliskan jawaban Anda di sini..."
                                  className="w-full text-base sm:text-sm bg-white dark:bg-gray-850 border border-indigo-300 dark:border-indigo-600 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 rounded-lg px-3.5 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 shadow-2xs"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Linear Scale (Clean Numbered Scale without Stars) */}
                  {q.type === 'rating' && scaleConfig && (
                    <div className="space-y-2 pt-1">
                      <div className={`grid gap-2 ${q.maxScale === 10 ? 'grid-cols-5 sm:grid-cols-10' : 'grid-cols-5'}`}>
                        {Array.from({ length: q.maxScale || 5 }, (_, i) => i + 1).map((val) => {
                          const isSelected = answers[q.id] === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() => handleInputChange(q.id, val)}
                              className={`flex items-center justify-center h-12 rounded-xl font-semibold text-base border transition-all active:scale-95 tabular-nums cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs ring-2 ring-indigo-500/25'
                                  : 'bg-gray-50/70 dark:bg-gray-900/40 hover:bg-white dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 border-gray-200/90 dark:border-gray-700 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400'
                              }`}
                            >
                              <span>{val}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1 pt-0.5 font-medium">
                        <span>{scaleConfig.minLabel}</span>
                        <span>{scaleConfig.maxLabel}</span>
                      </div>
                    </div>
                  )}

                  {/* Date */}
                  {q.type === 'date' && (
                    <input
                      type="date"
                      value={answers[q.id] || ''}
                      onChange={(e) => handleInputChange(q.id, e.target.value)}
                      className="max-sm:w-full sm:w-64 text-base bg-gray-50/70 dark:bg-gray-900/40 focus:bg-white dark:focus:bg-gray-800 border border-gray-200/90 dark:border-gray-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 rounded-xl px-4 py-3 text-gray-900 dark:text-white transition-all"
                    />
                  )}

                  {/* Matrix */}
                  {q.type === 'matrix' && (() => {
                    const rows = q.rows || [];
                    const totalRows = rows.length;
                    const rawActiveIdx = matrixActiveRow[q.id] ?? 0;
                    const activeRowIdx = totalRows > 0 ? Math.min(Math.max(0, rawActiveIdx), totalRows - 1) : 0;
                    const activeRow = rows[activeRowIdx];
                    const answeredRowsCount = rows.filter(r => answers[q.id]?.[r.id]).length;
                    const isAllRowsAnswered = totalRows > 0 && answeredRowsCount === totalRows;

                    return (
                      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xs overflow-hidden">
                        {/* Stepper Header: Full-width Interactive Numbered Step Pills */}
                        <div className="px-3.5 py-3 bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-200/80 dark:border-gray-700">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {rows.map((r, rIdx) => {
                              const isRowDone = !!answers[q.id]?.[r.id];
                              const isCurrent = rIdx === activeRowIdx;
                              const rowErr = !!fieldErrors[`${q.id}_${r.id}`];

                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => handleMatrixStepClick(q.id, rIdx)}
                                  aria-label={`Pernyataan ${rIdx + 1}: ${r.label}`}
                                  className={`h-7 min-w-[30px] px-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1 transition-all tabular-nums cursor-pointer ${
                                    isCurrent
                                      ? 'bg-indigo-600 text-white shadow-2xs ring-2 ring-indigo-500/25'
                                      : rowErr
                                      ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-700'
                                      : isRowDone
                                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:border-indigo-300'
                                  }`}
                                >
                                  {isCurrent ? (
                                    <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
                                  ) : isRowDone ? (
                                    <Check className="w-3 h-3 stroke-[3] shrink-0" />
                                  ) : null}
                                  <span>{rIdx + 1}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Active Statement Card Body */}
                        {activeRow && (
                          <div className="p-4 space-y-3.5">
                            <div className="max-sm:text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                              {activeRow.label}
                            </div>

                            <div className="space-y-2">
                              {(q.options || []).map((col, colIdx) => {
                                const isSelected = answers[q.id]?.[activeRow.id] === col;
                                return (
                                  <button
                                    key={colIdx}
                                    type="button"
                                    onClick={() => handleMobileMatrixSelect(q.id, activeRow.id, col, rows, activeRowIdx)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all active:scale-[0.99] min-h-[44px] cursor-pointer ${
                                      isSelected
                                        ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100 shadow-2xs font-medium'
                                        : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 hover:bg-white dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 hover:border-indigo-300'
                                    }`}
                                  >
                                    <span
                                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                        isSelected
                                          ? 'border-indigo-600 bg-indigo-600'
                                          : 'border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800'
                                      }`}
                                    >
                                      {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                                    </span>
                                    <span className="text-sm leading-snug flex-1">{col}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {fieldErrors[`${q.id}_${activeRow.id}`] && (
                              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                                {fieldErrors[`${q.id}_${activeRow.id}`]}
                              </p>
                            )}

                            {/* Stepper Footer Navigation & Completion Status */}
                            {totalRows > 1 && (
                              <div className="pt-2.5 border-t border-gray-100 dark:border-gray-700/70 flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  disabled={activeRowIdx === 0}
                                  onClick={() => handleMatrixStepClick(q.id, Math.max(0, activeRowIdx - 1))}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-35 disabled:pointer-events-none py-1.5 px-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors cursor-pointer"
                                >
                                  <ArrowLeft className="w-3.5 h-3.5" /> Sebelumnya
                                </button>

                                <span
                                  className={`inline-flex items-center gap-1 text-xs tabular-nums ${
                                    isAllRowsAnswered
                                      ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                                      : 'font-medium text-gray-400 dark:text-gray-500'
                                  }`}
                                >
                                  {isAllRowsAnswered && <Check className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />}
                                  <span>
                                    {isAllRowsAnswered
                                      ? `${answeredRowsCount}/${totalRows} selesai`
                                      : `${answeredRowsCount}/${totalRows} terjawab`}
                                  </span>
                                </span>

                                <button
                                  type="button"
                                  disabled={activeRowIdx >= totalRows - 1}
                                  onClick={() => handleMatrixStepClick(q.id, Math.min(totalRows - 1, activeRowIdx + 1))}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 disabled:opacity-35 disabled:pointer-events-none py-1.5 px-2.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
                                >
                                  Selanjutnya <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {hasError && (
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800/60">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{fieldErrors[q.id]}</span>
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
                className="h-12 px-5 sm:px-6 rounded-xl font-bold border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 shrink-0 text-sm active:scale-[0.98] transition-all"
              >
                <ArrowLeft className="w-4 h-4" /> Kembali
              </Button>
            ) : <div />}

            {activePageIndex < formPages.length - 1 ? (
              <Button
                type="button"
                onClick={handleNextPage}
                className="h-12 max-sm:flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-7 sm:px-8 rounded-xl font-bold shadow-md shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 max-sm:text-sm sm:text-base ml-auto"
              >
                Lanjut <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="h-12 max-sm:flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-8 sm:px-9 rounded-xl font-bold shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 max-sm:text-sm sm:text-base ml-auto"
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
