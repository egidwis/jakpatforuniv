import { useState, useEffect, useMemo, useRef } from 'react';
import type { SurveyFormData } from '../types';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  Gift,
  Hash,
  Info,
  Link2,
  ShieldAlert,
  Trophy,
  Type,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useLanguage } from '../i18n/LanguageContext';
import { isAutoApprovalPath } from '../utils/review-path';
import { useSlotAvailability } from '../hooks/useSlotAvailability';
import { isBookingClosedForDate, toLocalYmd } from '../utils/airing-window';
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
  onBack: () => void;
  isGoogleImport?: boolean;
  onSwitchToGoogle?: () => void;
  /** Order lahir dari CTA "Sebar via Jakpat": sumber datanya form JFU, jadi
   *  field surveinya dikunci dan tautan ganti-metode disembunyikan. */
  isJfuImport?: boolean;
}

interface FormErrors {
  surveyUrl?: string;
  title?: string;
  questionCount?: string;
  criteriaResponden?: string;
  duration?: string;
  winnerCount?: string;
  prizePerWinner?: string;
}

const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Body layar isi-form Iklan Survei — dirender di dalam `AdsFlowCard`
 * (`step="fields"`, tanpa cap), dipakai dua jalur: manual dan lanjutan
 * import Google Form (`isGoogleImport`).
 */
export function ReviewInfoBanner({ formData }: { formData: SurveyFormData }) {
  const { t } = useLanguage();
  const isAutoPath = isAutoApprovalPath(formData);

  return (
    <div className="mx-auto max-w-xl mb-4 p-3.5 md:p-4 rounded-2xl bg-blue-50/80 border border-blue-100/90 flex items-start gap-3 text-xs md:text-sm leading-relaxed text-blue-900 shadow-sm">
      <Info className="w-5 h-5 mt-0.5 shrink-0 text-jfu-primary" aria-hidden="true" />
      <div>
        <p className="font-semibold text-blue-950 text-sm md:text-base">
          {isAutoPath ? t('reviewMethodAutoHint') : t('reviewMethodManualHint')}
          {' · '}
          {isAutoPath ? t('adsEntryAutoRowTime') : t('adsEntryManualRowTime')}
        </p>
        <p className="mt-1 text-blue-800/90 leading-relaxed">
          {t('adsEntryReviewNotePart1')}{' '}
          <a
            href="/homepage/terms-conditions.html"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-jfu-primary underline hover:text-jfu-dark"
          >
            {t('termsConditions')}
          </a>
          {t('adsEntryReviewNotePart2')}
        </p>
      </div>
    </div>
  );
}

export function StepOneFormFields({
  formData,
  updateFormData,
  onSubmit,
  onBack,
  isGoogleImport = false,
  onSwitchToGoogle,
  isJfuImport = false
}: StepOneFormFieldsProps) {
  const { t } = useLanguage();
  const prevQuestionCountRef = useRef(formData.questionCount);
  const hasInitializedRef = useRef(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const surveyUrlRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const criteriaRespondenRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (surveyUrlRef.current) {
      surveyUrlRef.current.style.height = 'auto';
      surveyUrlRef.current.style.height = `${Math.max(24, surveyUrlRef.current.scrollHeight)}px`;
    }
  }, [formData.surveyUrl]);

  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.style.height = 'auto';
      titleRef.current.style.height = `${Math.max(24, titleRef.current.scrollHeight)}px`;
    }
  }, [formData.title]);

  useEffect(() => {
    if (criteriaRespondenRef.current) {
      criteriaRespondenRef.current.style.height = 'auto';
      criteriaRespondenRef.current.style.height = `${Math.max(60, criteriaRespondenRef.current.scrollHeight)}px`;
    }
  }, [formData.criteriaResponden]);

  const fieldsReadOnly = isGoogleImport || isJfuImport;
  const isBlockedByPersonalData = isJfuImport && !!formData.hasPersonalDataQuestions;

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
    } else if (!isValidUrl(formData.surveyUrl.trim())) {
      newErrors.surveyUrl = t('errorInvalidSurveyUrl');
    }

    if (!formData.title || !formData.title.trim()) {
      newErrors.title = t('errorTitleEmpty');
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
    if (isBlockedByPersonalData) return;
    setAttemptedSubmit(true);

    if (validateForm()) {
      onSubmit();
    }
  };

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

  /*
   * Antisipasi tembok "slot penuh" di ujung flow.
   *
   * Sejak Ringkasan mendahului Jadwal, ketersediaan slot baru terlihat setelah
   * user selesai mengisi semuanya — kalau durasinya panjang dan kalendernya
   * padat, penolakan datang di saat paling menyakitkan. Angka di bawah
   * memindahkan kabar itu ke tempat penyebabnya: kolom durasi.
   *
   * Hanya untuk jalur impor Google Form; entri manual tidak pernah melewati
   * langkah Jadwal, jadi menampilkannya di sana justru menyesatkan.
   */
  const availability = useSlotAvailability('regular');
  const openStartDays = useMemo(() => {
    if (!isGoogleImport || availability.isLoading) return null;
    const days = Math.max(formData.duration || 1, 1);
    if (days > 30) return null;
    const today = new Date();
    let open = 0;
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const ymd = toLocalYmd(d);
      if (!isBookingClosedForDate(ymd) && availability.isRangeAvailable(ymd, days)) open++;
    }
    return open;
  }, [isGoogleImport, availability.isLoading, availability.isRangeAvailable, formData.duration]);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
      {/* Blokir keras: form JFU yang terdeteksi meminta data pribadi responden.
          Sengaja DI LUAR kartu dan di paling atas — ini bukan catatan tambahan,
          melainkan alasan seluruh layar ini tidak bisa dilanjutkan. */}
      {isBlockedByPersonalData && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 md:p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-900">
                Survei ini belum bisa disebar — terdeteksi pertanyaan data pribadi
              </p>
              <p className="mt-1 text-xs leading-relaxed text-red-800/90">
                Form JFU ini kemungkinan meminta data pribadi responden
                {formData.detectedKeywords && formData.detectedKeywords.length > 0 && (
                  <> ({formData.detectedKeywords.join(', ')})</>
                )}
                . Edit form aslinya sampai tidak lagi meminta data pribadi, lalu klik
                “Sebar via Jakpat” sekali lagi.
              </p>
              {formData.flaggedPersonalDataQuestions && formData.flaggedPersonalDataQuestions.length > 0 && (
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  {formData.flaggedPersonalDataQuestions.map((question, idx) => (
                    <li key={idx} className="text-xs text-red-800">
                      <span className="font-medium">“{question}”</span>
                    </li>
                  ))}
                </ul>
              )}
              {formData.customFormId && (
                <Link
                  to={`/dashboard/forms/${formData.customFormId}/edit`}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                >
                  Edit Form
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CARD 1 — INFORMASI & KONFIGURASI SURVEI */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm overflow-hidden">
        {isGoogleImport && (
          <p className="mb-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            {t('successImportedFromGoogleDrive')}
          </p>
        )}

        {isJfuImport && !isBlockedByPersonalData && (
          <p className="mb-3 flex items-start gap-1.5 text-xs font-medium text-emerald-600">
            <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Diisi otomatis dari JFU Form — link, judul, dan jumlah pertanyaan
              disinkronkan dari form aslinya. Ubah di form JFU kalau perlu diperbarui.
            </span>
          </p>
        )}

        {/* SEKSI 1 — INFORMASI SURVEY */}
        <SectionLabel>{t('surveyInformation')}</SectionLabel>

        <div className={fieldRowListClass}>
          <FieldRow
            icon={Link2}
            label={isGoogleImport ? t('googleFormLink') : t('surveyLinkLabel')}
            htmlFor="surveyUrl"
            required
            error={attemptedSubmit ? errors.surveyUrl : undefined}
            readOnly={fieldsReadOnly}
          >
            <textarea
              id="surveyUrl"
              ref={surveyUrlRef}
              rows={1}
              className={`${fieldInputClass} resize-none overflow-hidden leading-relaxed py-0.5 min-h-[24px]`}
              placeholder={isGoogleImport ? t('googleFormLinkPlaceholder') : t('surveyLinkPlaceholder')}
              value={formData.surveyUrl}
              onChange={(e) => {
                if (!fieldsReadOnly) {
                  updateFormData({ surveyUrl: e.target.value, isManualEntry: true });
                  if (attemptedSubmit && errors.surveyUrl) {
                    setErrors({ ...errors, surveyUrl: undefined });
                  }
                }
              }}
              readOnly={fieldsReadOnly}
            />
          </FieldRow>

          <FieldRow
            icon={Type}
            label={t('surveyTitle')}
            htmlFor="title"
            required
            error={attemptedSubmit ? errors.title : undefined}
            readOnly={fieldsReadOnly}
          >
            <textarea
              id="title"
              ref={titleRef}
              rows={1}
              maxLength={100}
              className={`${fieldInputClass} resize-none overflow-hidden leading-relaxed py-0.5 min-h-[24px]`}
              placeholder={t('surveyTitlePlaceholder')}
              value={formData.title}
              onChange={(e) => {
                if (!fieldsReadOnly) {
                  updateFormData({ title: e.target.value });
                  if (attemptedSubmit && errors.title) {
                    setErrors({ ...errors, title: undefined });
                  }
                }
              }}
              readOnly={fieldsReadOnly}
            />
          </FieldRow>

          <FieldRow
            icon={Hash}
            label={t('questionCount')}
            htmlFor="questionCount"
            required
            compact
            error={attemptedSubmit ? errors.questionCount : undefined}
            readOnly={fieldsReadOnly}
          >
            <input
              id="questionCount"
              type="number"
              className={fieldInputClass}
              placeholder={t('questionCountPlaceholder')}
              value={formData.questionCount || ''}
              onChange={(e) => {
                if (!fieldsReadOnly) {
                  updateFormData({ questionCount: parseInt(e.target.value) || 0 });
                  if (attemptedSubmit && errors.questionCount) {
                    setErrors({ ...errors, questionCount: undefined });
                  }
                }
              }}
              readOnly={fieldsReadOnly}
              min={1}
            />
            <span className="ml-1.5 shrink-0 text-sm lowercase text-gray-400">items</span>
          </FieldRow>
        </div>

        {/* SEKSI 2 — KONFIGURASI IKLAN */}
        <div className="mt-6">
          <SectionLabel>{t('surveyConfiguration')}</SectionLabel>
        </div>

        <div className={fieldRowListClass}>
          <FieldRow
            icon={CalendarDays}
            label={t('surveyDurationLabel')}
            htmlFor="duration"
            required
            compact
            error={
              durationHasError
                ? formData.duration > 30
                  ? t('errorDurationMax')
                  : t('errorDurationZero')
                : undefined
            }
            /* Jangkar historis, bukan janji — angkanya membantu memilih durasi
               tanpa pernah menjadi target yang bisa ditagih. */
            hint={
              <span className="flex flex-col gap-1">
                <span className="flex items-start gap-1.5 text-gray-500">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
                  <span>{t('surveyDurationHint')}</span>
                </span>
                {openStartDays !== null && (
                  <span
                    className={`pl-5 font-medium ${openStartDays <= 2 ? 'text-amber-600' : 'text-gray-600'}`}
                  >
                    {openStartDays === 0
                      ? t('slotOutlookNone', { days: `${Math.max(formData.duration || 1, 1)} ${t('days').toLowerCase()}` })
                      : t('slotOutlook', {
                          days: `${Math.max(formData.duration || 1, 1)} ${t('days').toLowerCase()}`,
                          open: openStartDays,
                        })}
                  </span>
                )}
              </span>
            }
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

          <FieldBlock
            icon={Users}
            label={t('respondentCriteriaLabel')}
            htmlFor="criteriaResponden"
            required
            counter={`${formData.criteriaResponden?.length || 0}/300`}
            error={attemptedSubmit ? errors.criteriaResponden : undefined}
            hint={
              <span className="flex items-start gap-1.5 text-gray-500">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
                <span>
                  {t('respondentCriteriaHelp')
                    .split('*')
                    .map((part, index) =>
                      index % 2 === 1 ? (
                        <strong key={index} className="font-semibold text-gray-600">{part}</strong>
                      ) : (
                        part
                      )
                    )}
                </span>
              </span>
            }
          >
            <textarea
              id="criteriaResponden"
              ref={criteriaRespondenRef}
              rows={2}
              className={`${fieldInputClass} resize-none overflow-hidden leading-relaxed py-0.5 min-h-[60px]`}
              placeholder={t('respondentCriteriaPlaceholder')}
              value={formData.criteriaResponden}
              onChange={(e) => {
                updateFormData({ criteriaResponden: e.target.value });
                if (attemptedSubmit && errors.criteriaResponden) {
                  setErrors({ ...errors, criteriaResponden: undefined });
                }
              }}
              maxLength={300}
            />
          </FieldBlock>
        </div>

        {/* Switch to Google Form — jika mode manual */}
        {!isGoogleImport && onSwitchToGoogle && (
          <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-center gap-x-1 text-xs md:text-sm text-gray-500">
            <span>{t('troubleFillingManual')}</span>
            <button
              type="button"
              onClick={onSwitchToGoogle}
              className="font-semibold text-jfu-primary hover:underline"
            >
              {t('importFromGoogleForm')}
            </button>
          </div>
        )}
      </div>

      {/* CARD 2 — PENGATURAN INSENTIF */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm overflow-hidden">
        {/* SEKSI 3 — PENGATURAN INSENTIF */}
        <SectionLabel>{t('incentiveSettings')}</SectionLabel>

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
            /* Menjelaskan PERAN hadiah, bukan cuma nominalnya — itu yang
               membuat angka rekomendasi di bawahnya masuk akal. */
            hint={
              <span className="flex flex-col gap-1 text-gray-500">
                <span className="flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
                  <span>{t('prizePerWinnerHint')}</span>
                </span>
                {formData.prizePerWinner >= 25000 && formData.questionCount > 0 && (
                  <span className="pl-5 font-medium text-gray-600">
                    {t('recommendation')}: Rp{' '}
                    {getRecommendedPrize(formData.questionCount).toLocaleString('id-ID')}
                    {t('perWinner')}
                  </span>
                )}
              </span>
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
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('backButton')}
        </button>
        <button
          type="submit"
          disabled={isBlockedByPersonalData}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-jfu-primary"
        >
          {t('continueToSummary')}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </form>
  );
}
