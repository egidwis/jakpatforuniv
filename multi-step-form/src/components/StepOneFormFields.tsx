import { useState, useEffect, useRef } from 'react';
import type { SurveyFormData } from '../types';
import {
  AlignLeft,
  CalendarDays,
  CheckCircle,
  Gift,
  Hash,
  Link2,
  Trophy,
  Type,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useLanguage } from '../i18n/LanguageContext';
import { calculateAdCostPerDay } from '../utils/cost-calculator';
import { isAutoApprovalPath } from '../utils/review-path';
import {
  FieldBlock,
  FieldRow,
  SectionLabel,
  fieldInputClass,
  fieldRowListClass,
} from './SurveyFieldRow';

// Helper function to get recommended prize based on question count
const getRecommendedPrize = (questionCount: number): number => {
  if (questionCount <= 15) return 25000;
  if (questionCount <= 30) return 30000;
  if (questionCount <= 50) return 35000;
  if (questionCount <= 70) return 50000;
  return 80000;
};

// All possible recommended values
const RECOMMENDED_VALUES = [25000, 30000, 35000, 50000, 80000];

interface StepOneFormFieldsProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  onSubmit: () => void;
  isGoogleImport?: boolean;
}

interface FormErrors {
  surveyUrl?: string;
  title?: string;
  description?: string;
  questionCount?: string;
  criteriaResponden?: string;
  duration?: string;
  winnerCount?: string;
  prizePerWinner?: string;
}

/**
 * Body layar isi-form Iklan Survei — dirender di dalam `AdsFlowCard`
 * (`step="fields"`, tanpa cap), dipakai dua jalur: manual dan lanjutan
 * import Google Form (`isGoogleImport`). Navigasi mundur untuk keduanya kini
 * hidup di `UnifiedHeader` (floating bar bawah), bukan di sini.
 *
 * Tata letaknya baris `label | input` bergaya tabel, bukan tumpukan kartu —
 * lihat `SurveyFieldRow.tsx` untuk primitifnya dan untuk jebakan cascade
 * `.flex-col` yang mengatur cara baris berganti arah.
 *
 * Barisnya SENGAJA tidak seragam. Field pendek/numerik pakai `compact`
 * (berdampingan di semua lebar); field teks panjang menumpuk di bawah `md`
 * karena URL Google Form tidak terbaca dalam ~180px di layar 360px.
 */
export function StepOneFormFields({
  formData,
  updateFormData,
  onSubmit,
  isGoogleImport = false
}: StepOneFormFieldsProps) {
  const { t } = useLanguage();
  const prevQuestionCountRef = useRef(formData.questionCount);
  const hasInitializedRef = useRef(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Auto-update prizePerWinner when component mounts or questionCount changes
  useEffect(() => {
    const prevQuestionCount = prevQuestionCountRef.current;
    const currentQuestionCount = formData.questionCount;
    const currentPrize = formData.prizePerWinner;
    const currentWinnerCount = formData.winnerCount;

    // On initial mount, set defaults if not set
    if (!hasInitializedRef.current) {
      const updates: Partial<SurveyFormData> = {};

      // Set default winner count if 0
      if (currentWinnerCount === 0) {
        updates.winnerCount = 2;
      }

      // Set recommended prize if questionCount is valid and prize is 0 or recommended value
      if (currentQuestionCount > 0 && (currentPrize === 0 || RECOMMENDED_VALUES.includes(currentPrize))) {
        updates.prizePerWinner = getRecommendedPrize(currentQuestionCount);
      }

      if (Object.keys(updates).length > 0) {
        updateFormData(updates);
      }

      hasInitializedRef.current = true;
    }
    // On subsequent changes, update if questionCount changed
    else if (currentQuestionCount > 0 && currentQuestionCount !== prevQuestionCount) {
      const newRecommended = getRecommendedPrize(currentQuestionCount);
      // Only auto-update if current value is one of the recommended values
      // This preserves custom values set by the user
      if (RECOMMENDED_VALUES.includes(currentPrize)) {
        updateFormData({ prizePerWinner: newRecommended });
      }
    }

    prevQuestionCountRef.current = currentQuestionCount;
  }, [formData.questionCount, formData.prizePerWinner, updateFormData]);

  // Validation function
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.surveyUrl || !formData.surveyUrl.trim()) {
      newErrors.surveyUrl = t('errorSurveyLinkEmpty');
    }

    if (!formData.title || !formData.title.trim()) {
      newErrors.title = t('errorTitleEmpty');
    }

    if (!formData.description || !formData.description.trim()) {
      newErrors.description = t('errorDescriptionEmpty');
    }

    if (formData.questionCount <= 0) {
      newErrors.questionCount = t('errorQuestionCountInvalid');
    }

    if (!formData.criteriaResponden || !formData.criteriaResponden.trim()) {
      newErrors.criteriaResponden = t('errorRespondentCriteriaRequired');
    }

    if (formData.duration <= 0) {
      newErrors.duration = t('errorDurationZero');
    } else if (formData.duration > 30) {
      newErrors.duration = t('errorDurationMax');
    }

    if (formData.winnerCount < 2) {
      newErrors.winnerCount = t('errorMinWinners');
    } else if (formData.winnerCount > 5) {
      newErrors.winnerCount = t('errorMaxWinners');
    }

    if (formData.prizePerWinner < 25000) {
      newErrors.prizePerWinner = t('errorMinPrize');
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      toast.error(t('errorCompleteAllFields') || t('errorFixFields'));
      return false;
    }

    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptedSubmit(true);

    if (validateForm()) {
      onSubmit();
    }
  };

  // Jalur review dibaca dari predikat bersama, BUKAN dari `isGoogleImport`:
  // Google Form yang memicu deteksi PII tetap masuk antrean admin, jadi janji
  // "hitungan detik" di sini akan bohong kalau disandarkan pada metode impor.
  const isAutoPath = isAutoApprovalPath(formData);

  const reviewPathTooltip = (
    <span className="block leading-relaxed">
      <span className="block font-semibold">
        {isAutoPath ? t('reviewMethodAutoHint') : t('reviewMethodManualHint')}
        {' · '}
        {isAutoPath ? t('adsEntryAutoRowTime') : t('adsEntryManualRowTime')}
      </span>
      <span className="block mt-1">
        {t('adsEntryReviewNotePart1')}{' '}
        <a
          href="/homepage/terms-conditions.html"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-200"
        >
          {t('termsConditions')}
        </a>
        {t('adsEntryReviewNotePart2')}
      </span>
    </span>
  );

  const incentiveTooltip = <span className="leading-relaxed">{t('incentiveDistributionInfo')}</span>;

  const winnerTooltip = (
    <span className="leading-relaxed">
      {t('maxWinnerWarning')}{' '}
      <Link to="/dashboard/chat" target="_blank" className="font-semibold underline hover:text-gray-200">
        {t('contactAdmin')}
      </Link>
      .
    </span>
  );

  // Durasi memakai kondisi ganda milik desain lama: error tampil dari state
  // `errors` SETELAH submit, tapi juga langsung saat angka di luar 1–30.
  const durationOutOfRange =
    formData.duration !== undefined && (formData.duration < 1 || formData.duration > 30);
  const durationHasError = (errors.duration && attemptedSubmit) || durationOutOfRange;

  return (
    <form onSubmit={handleSubmit} noValidate>
      {isGoogleImport && (
        <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
          {t('successImportedFromGoogleDrive')}
        </p>
      )}

      {/* SEKSI 1 — INFORMASI SURVEY */}
      <SectionLabel tooltip={reviewPathTooltip}>{t('surveyInformation')}</SectionLabel>

      <div className={fieldRowListClass}>
        <FieldRow
          icon={Link2}
          label={isGoogleImport ? t('googleFormLink') : t('surveyLinkLabel')}
          htmlFor="surveyUrl"
          required
          error={attemptedSubmit ? errors.surveyUrl : undefined}
          hint={isGoogleImport ? t('surveyTitleFromGoogleDrive') : undefined}
        >
          <input
            id="surveyUrl"
            type="url"
            className={fieldInputClass}
            placeholder={isGoogleImport ? t('googleFormLinkPlaceholder') : t('surveyLinkPlaceholder')}
            value={formData.surveyUrl}
            onChange={(e) => {
              if (!isGoogleImport) {
                updateFormData({ surveyUrl: e.target.value, isManualEntry: true });
                if (attemptedSubmit && errors.surveyUrl) {
                  setErrors({ ...errors, surveyUrl: undefined });
                }
              }
            }}
            readOnly={isGoogleImport}
          />
        </FieldRow>

        <FieldRow
          icon={Type}
          label={t('surveyTitle')}
          htmlFor="title"
          required
          error={attemptedSubmit ? errors.title : undefined}
        >
          <input
            id="title"
            type="text"
            className={fieldInputClass}
            placeholder={t('surveyTitlePlaceholder')}
            value={formData.title}
            onChange={(e) => {
              if (!isGoogleImport) {
                updateFormData({ title: e.target.value });
                if (attemptedSubmit && errors.title) {
                  setErrors({ ...errors, title: undefined });
                }
              }
            }}
            readOnly={isGoogleImport}
          />
        </FieldRow>

        <FieldRow
          icon={Hash}
          label={t('questionCount')}
          htmlFor="questionCount"
          required
          compact
          error={attemptedSubmit ? errors.questionCount : undefined}
          hint={
            formData.questionCount > 0 ? (
              <>
                Rp {calculateAdCostPerDay(formData.questionCount).toLocaleString('id-ID')}/hari{' '}
                <span className="text-gray-400">({t('priceExcludesTax')})</span>
              </>
            ) : undefined
          }
        >
          <input
            id="questionCount"
            type="number"
            className={fieldInputClass}
            placeholder={t('questionCountPlaceholder')}
            value={formData.questionCount || ''}
            onChange={(e) => {
              if (!isGoogleImport) {
                updateFormData({ questionCount: parseInt(e.target.value) || 0 });
                if (attemptedSubmit && errors.questionCount) {
                  setErrors({ ...errors, questionCount: undefined });
                }
              }
            }}
            readOnly={isGoogleImport}
            min={1}
          />
        </FieldRow>

        <FieldBlock
          icon={AlignLeft}
          label={t('surveyDescription')}
          htmlFor="description"
          required
          counter={`${formData.description.length}/500`}
          error={attemptedSubmit ? errors.description : undefined}
        >
          <textarea
            id="description"
            className={`${fieldInputClass} min-h-[88px] resize-y leading-relaxed`}
            placeholder={t('surveyDescriptionPlaceholder')}
            value={formData.description}
            onChange={(e) => {
              if (!isGoogleImport) {
                updateFormData({ description: e.target.value });
                if (attemptedSubmit && errors.description) {
                  setErrors({ ...errors, description: undefined });
                }
              }
            }}
            readOnly={isGoogleImport}
            rows={4}
            maxLength={500}
          />
        </FieldBlock>
      </div>

      {/* SEKSI 2 — KONFIGURASI IKLAN */}
      <div className="mt-6">
        <SectionLabel>{t('surveyConfiguration')}</SectionLabel>
      </div>

      <div className={fieldRowListClass}>
        <FieldBlock
          icon={Users}
          label={t('respondentCriteriaLabel')}
          htmlFor="criteriaResponden"
          required
          counter={`${formData.criteriaResponden?.length || 0}/200`}
          error={attemptedSubmit ? errors.criteriaResponden : undefined}
          // Panduan ini SENGAJA tetap terlihat, tidak jadi tooltip: ia mengoreksi
          // ekspektasi keliru ("kriteria = penargetan") tepat saat user mengetik,
          // dan yang salah paham justru tidak akan membuka tooltip.
          hint={t('respondentCriteriaHelp')
            .split('*')
            .map((part, index) =>
              index % 2 === 1 ? (
                <strong key={index} className="font-semibold text-gray-600">{part}</strong>
              ) : (
                part
              )
            )}
        >
          <textarea
            id="criteriaResponden"
            className={`${fieldInputClass} min-h-[72px] resize-y leading-relaxed`}
            placeholder={t('respondentCriteriaPlaceholder')}
            value={formData.criteriaResponden}
            onChange={(e) => {
              updateFormData({ criteriaResponden: e.target.value });
              if (attemptedSubmit && errors.criteriaResponden) {
                setErrors({ ...errors, criteriaResponden: undefined });
              }
            }}
            rows={3}
            maxLength={200}
          />
        </FieldBlock>

        <FieldRow
          icon={CalendarDays}
          label={t('surveyDurationLabel')}
          htmlFor="duration"
          required
          compact
          labelWidth="w-[150px] md:w-[320px]"
          error={
            durationHasError
              ? formData.duration > 30
                ? t('errorDurationMax')
                : t('errorDurationZero')
              : undefined
          }
          hint={durationHasError ? undefined : t('surveyDurationHelp')}
        >
          <input
            id="duration"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className={fieldInputClass}
            placeholder={t('surveyDurationPlaceholder')}
            value={formData.duration === 0 || Number.isNaN(formData.duration) ? '' : formData.duration}
            onChange={(e) => {
              const val = e.target.value;
              const intVal = parseInt(val);
              updateFormData({ duration: isNaN(intVal) ? 0 : intVal });
              if (attemptedSubmit && errors.duration) {
                setErrors({ ...errors, duration: undefined });
              }
            }}
          />
          <span className="ml-1.5 shrink-0 text-sm lowercase text-gray-400">{t('days')}</span>
        </FieldRow>
      </div>

      {/* SEKSI 3 — PENGATURAN INSENTIF */}
      <div className="mt-6">
        <SectionLabel tooltip={incentiveTooltip}>{t('incentiveSettings')}</SectionLabel>
      </div>

      <div className={fieldRowListClass}>
        <FieldRow
          icon={Gift}
          label={t('prizePerWinnerLabel')}
          htmlFor="prizePerWinner"
          required
          compact
          labelWidth="w-[150px] md:w-[320px]"
          error={
            formData.prizePerWinner > 0 && formData.prizePerWinner < 25000
              ? t('errorMinPrize')
              : undefined
          }
          hint={
            formData.prizePerWinner >= 25000 && formData.questionCount > 0 ? (
              <>
                {t('recommendation')}: Rp{' '}
                {getRecommendedPrize(formData.questionCount).toLocaleString('id-ID')}
                {t('perWinner')}
              </>
            ) : undefined
          }
        >
          <span className="mr-1.5 shrink-0 text-sm text-gray-400">Rp</span>
          <input
            id="prizePerWinner"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className={fieldInputClass}
            placeholder={t('prizePerWinnerPlaceholder')}
            value={formData.prizePerWinner}
            onChange={(e) => {
              updateFormData({ prizePerWinner: parseInt(e.target.value) || 0 });
              if (attemptedSubmit && errors.prizePerWinner) {
                setErrors({ ...errors, prizePerWinner: undefined });
              }
            }}
          />
        </FieldRow>

        <FieldRow
          icon={Trophy}
          label={t('winnerCountLabel')}
          htmlFor="winnerCount"
          required
          compact
          labelWidth="w-[150px] md:w-[320px]"
          tooltip={winnerTooltip}
          error={
            formData.winnerCount > 0 && formData.winnerCount < 2 ? t('errorMinWinners') : undefined
          }
        >
          <input
            id="winnerCount"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className={fieldInputClass}
            placeholder={t('winnerCountPlaceholder')}
            value={formData.winnerCount}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0;
              updateFormData({ winnerCount: Math.min(val, 5) });
              if (attemptedSubmit && errors.winnerCount) {
                setErrors({ ...errors, winnerCount: undefined });
              }
            }}
          />
        </FieldRow>

        {formData.winnerCount >= 2 && formData.prizePerWinner >= 25000 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
            <span className="text-sm text-gray-600">{t('totalIncentiveRequired')}</span>
            <span className="text-sm font-bold tabular-nums text-[#1a1a1a]">
              Rp {(formData.winnerCount * formData.prizePerWinner).toLocaleString('id-ID')}
            </span>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark"
        >
          {t('continue')}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}
