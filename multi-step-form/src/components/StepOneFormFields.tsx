import type { ReactNode } from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import type { SurveyFormData } from '../types';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  Gift,
  Hash,
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
import { isManualVerificationVoucher } from '../utils/cost-calculator';
import { InfoTooltip } from './status/InfoTooltip';
import type { ImportedGoogleForm } from './GoogleDriveImportSimple';
import { useSlotAvailability } from '../hooks/useSlotAvailability';
import { isBookingClosedForDate, toLocalYmd } from '../utils/airing-window';
import {
  FieldBlock,
  FieldRow,
  SectionLabel,
  fieldInputClass,
  fieldRowListClass,
} from './SurveyFieldRow';
import { DurationPicker } from './DurationPicker';
import { OrderLiveCompanion } from './order/OrderLiveCompanion';
import { RewardRecommendationHint } from './RewardRecommendationHint';
import {
  getRecommendedPrize,
  RECOMMENDED_PRIZE_VALUES as RECOMMENDED_VALUES,
} from '../utils/prizeRecommendation';
import { formatIDR } from '../utils/currency';

export type SurveyEntryPhase = 'choice' | 'import' | 'pii' | 'manual' | 'locked';

interface StepOneFormFieldsProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  onSubmit: () => void;
  onBack?: () => void;
  isGoogleImport?: boolean;
  /** Order lahir dari CTA "Sebar via Jakpat": sumber datanya form JFU, jadi
   *  field surveinya dikunci dan tautan ganti-metode disembunyikan. */
  isJfuImport?: boolean;
  onCancelOrder?: () => void;
  phase?: SurveyEntryPhase;
  onChooseImport?: () => void;
  onChooseManual?: () => void;
  onChangeEntry?: () => void;
  importSlot?: ReactNode;
  pendingImport?: ImportedGoogleForm | null;
  awaitingReimport?: boolean;
  onEditGoogleForm?: () => void;
  onAcceptManualReview?: () => void;
  onReimport?: () => void;
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

const PII_KEYWORD_KEY: Record<string, string> = {
  email: 'piiKwEmail',
  phone: 'piiKwPhone',
  'full name': 'piiKwName',
  name: 'piiKwName',
  address: 'piiKwAddress',
  'nik/id': 'piiKwNik',
  'file upload': 'piiKwFile',
  'e-wallet/hadiah': 'piiKwWallet',
  'email otomatis': 'piiKwCollectEmail',
};

function isGoogleFormUrl(url: string): boolean {
  return /docs\.google\.com\/forms|forms\.gle/i.test(url);
}

export function StepOneFormFields({
  formData,
  updateFormData,
  onSubmit,
  onBack: _onBack,
  isGoogleImport = false,
  isJfuImport = false,
  onCancelOrder,
  phase = 'manual',
  onChooseImport,
  onChooseManual,
  onChangeEntry,
  importSlot,
  pendingImport,
  awaitingReimport = false,
  onEditGoogleForm,
  onAcceptManualReview,
  onReimport,
}: StepOneFormFieldsProps) {
  const { t } = useLanguage();
  const prevQuestionCountRef = useRef(formData.questionCount);
  const hasInitializedRef = useRef(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const surveyCardRef = useRef<HTMLDivElement>(null);
  const [pathError, setPathError] = useState<string | undefined>();
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

      // Set default duration if not set or <= 0
      if (!formData.duration || formData.duration <= 0) {
        updates.duration = 2;
      }

      // Set default winner count if 0
      if (currentWinnerCount === 0) {
        updates.winnerCount = 2;
      }

      // Set recommended prize if questionCount is valid, or default to 25000 if 0
      if (currentQuestionCount > 0 && (currentPrize === 0 || RECOMMENDED_VALUES.includes(currentPrize))) {
        updates.prizePerWinner = getRecommendedPrize(currentQuestionCount);
      } else if (!currentPrize || currentPrize === 0) {
        updates.prizePerWinner = 25000;
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
    if (phase === 'choice' || phase === 'import' || phase === 'pii') {
      setPathError(phase === 'pii' ? t('surveyEntryPiiPending') : t('surveyEntryChooseFirst'));
      surveyCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setPathError(undefined);
    setAttemptedSubmit(true);

    if (validateForm()) {
      onSubmit();
    }
  };

  const showConfig = phase === 'manual' || phase === 'locked';
  const isAuto = isAutoApprovalPath(formData);
  const voucherManual = isManualVerificationVoucher(formData.voucherCode);
  const pathLabel = isAuto
    ? t('surveyPathAuto')
    : formData.hasPersonalDataQuestions
      ? t('surveyPathManualPii')
      : voucherManual
        ? t('surveyPathManualVoucher')
        : t('surveyPathManual');
  const pathTip = isAuto
    ? t('surveyPathAutoTip')
    : formData.hasPersonalDataQuestions
      ? t('surveyPathManualPiiTip')
      : voucherManual
        ? t('surveyPathManualVoucherTip')
        : t('surveyPathManualTip');

  const winnerTooltip = (
    <span className="leading-relaxed">
      {t('maxWinnerWarning')}{' '}
      <Link to="/dashboard/chat" target="_blank" className="font-semibold underline hover:text-gray-200">
        {t('contactAdmin')}
      </Link>
      .
    </span>
  );

  const durationTooltip = (
    <span className="leading-relaxed">
      {t('surveyDurationHint')}
    </span>
  );

  const criteriaTooltip = (
    <span className="leading-relaxed">
      {t('respondentCriteriaHelp')
        .split('*')
        .map((part, index) =>
          index % 2 === 1 ? (
            <strong key={index} className="font-semibold text-white">{part}</strong>
          ) : (
            part
          )
        )}
    </span>
  );

  const prizeTooltip = (
    <span className="leading-relaxed">
      {t('prizePerWinnerHint')}
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
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Kolom Kiri: Form Isian (order-1 pada mobile, 7 kolom pada desktop) */}
        <div className="order-1 lg:col-span-7 space-y-4">
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

      <div
        ref={surveyCardRef}
        className="rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-xs p-5 md:p-6 shadow-[0_4px_20px_-2px_rgba(24,124,255,0.06),0_12px_32px_-4px_rgba(0,0,0,0.04)] overflow-hidden"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <SectionLabel>{t('surveyInformation')}</SectionLabel>
          {showConfig && onChangeEntry && (
            <button
              type="button"
              onClick={onChangeEntry}
              className="shrink-0 text-xs font-semibold text-jfu-primary hover:underline cursor-pointer"
            >
              {t('surveyEntryChange')}
            </button>
          )}
        </div>

        {phase === 'choice' && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{t('surveyEntryPrompt')}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                {t('surveyEntryReviewNote')}
                <InfoTooltip content={t('surveyEntryReviewTip')} />
              </p>
            </div>
            <button
              type="button"
              onClick={onChooseImport}
              className="w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-blue-200 hover:bg-blue-50/40 cursor-pointer"
            >
              <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 inline-flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{t('surveyEntryImportGoogle')}</span>
                <span className="mt-0.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1 min-w-0">
                    {t('surveyEntryImportGoogleTag')}
                    <InfoTooltip content={t('surveyEntryImportGoogleTip')} />
                  </span>
                  <span className="shrink-0 font-medium text-slate-700">{t('surveyEntryImportGoogleSub')}</span>
                </span>
              </span>
            </button>

            <div aria-disabled="true" className="w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left opacity-70">
              <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 inline-flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5" viewBox="0 0 21 21" aria-hidden="true">
                  <path fill="#f25022" d="M1 1h9v9H1z" />
                  <path fill="#00a4ef" d="M1 11h9v9H1z" />
                  <path fill="#7fba00" d="M11 1h9v9h-9z" />
                  <path fill="#ffb900" d="M11 11h9v9h-9z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-500">{t('surveyEntryMsForms')}</span>
                  <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {t('surveyEntryMsSoon')}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1 min-w-0">
                    {t('surveyEntryImportGoogleTag')}
                    <InfoTooltip content={t('surveyEntryImportGoogleTip')} />
                  </span>
                  <span className="shrink-0 font-medium text-slate-500">{t('surveyEntryImportGoogleSub')}</span>
                </span>
              </span>
            </div>

            <button
              type="button"
              onClick={onChooseManual}
              className="w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-blue-200 hover:bg-blue-50/40 cursor-pointer"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{t('surveyEntryManual')}</span>
                <span className="mt-0.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1 min-w-0">
                    {t('surveyEntryManualTag')}
                    <InfoTooltip content={t('surveyEntryManualTip')} />
                  </span>
                  <span className="shrink-0 font-medium text-slate-700">{t('surveyEntryManualSub')}</span>
                </span>
              </span>
            </button>

            {pathError && <p className="text-xs font-medium text-rose-700">{pathError}</p>}

            <p className="pt-2 text-center text-xs text-slate-500">
              {t('surveyEntryNoForm')}{' '}
              <Link to="/dashboard/forms" className="font-semibold text-jfu-primary hover:underline">
                {t('surveyEntryJfu')}
              </Link>
            </p>
          </div>
        )}

        {phase === 'import' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={onChangeEntry}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-jfu-primary cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              {t('surveyEntryBackToMethods')}
            </button>
            {importSlot}
          </div>
        )}

        {phase === 'pii' && pendingImport && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-950">
              {t('piiDetectedTitle')}
              <InfoTooltip content={t('piiDetectedTip')} />
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {pendingImport.detectedKeywords.map((keyword) => (
                <span key={keyword} className="rounded-full bg-white border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                  {PII_KEYWORD_KEY[keyword] ? t(PII_KEYWORD_KEY[keyword] as 'piiKwEmail') : keyword}
                </span>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2">
              {awaitingReimport ? (
                <p className="text-sm text-amber-950">
                  {t('piiReimportPrompt')}{' '}
                  <button type="button" onClick={onReimport} className="font-semibold text-jfu-primary hover:underline cursor-pointer">
                    {t('piiReimportAction')}
                  </button>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={onEditGoogleForm}
                  className="inline-flex items-center justify-center rounded-xl bg-jfu-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-jfu-dark cursor-pointer"
                >
                  {t('piiEditGoogle')}
                </button>
              )}
              <button
                type="button"
                onClick={onAcceptManualReview}
                className="text-sm font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                {t('piiContinueManual')}
              </button>
            </div>
            {pathError && <p className="mt-2 text-xs font-medium text-rose-700">{pathError}</p>}
          </div>
        )}

        {showConfig && (
          <>
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

        {!isBlockedByPersonalData && (
          <p className="mb-3 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
            {pathLabel}
            <InfoTooltip content={pathTip} />
          </p>
        )}

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

        {phase === 'manual' && isGoogleFormUrl(formData.surveyUrl) && (
          <p className="mt-3 text-xs text-slate-500">
            {t('surveyGoogleLinkHint')}{' '}
            <button type="button" onClick={onChooseImport} className="font-semibold text-jfu-primary hover:underline cursor-pointer">
              {t('surveyGoogleLinkAction')}
            </button>
          </p>
        )}

        {phase === 'locked' && formData.hasPersonalDataQuestions && onEditGoogleForm && (
          <p className="mt-3 text-xs text-slate-500">
            <button type="button" onClick={onEditGoogleForm} className="font-semibold text-jfu-primary hover:underline cursor-pointer">
              {t('piiEditAgain')}
            </button>
          </p>
        )}
          </>
        )}
      </div>

      {showConfig && (
      <div className="rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-xs p-5 md:p-6 shadow-[0_4px_20px_-2px_rgba(24,124,255,0.06),0_12px_32px_-4px_rgba(0,0,0,0.04)] overflow-hidden">
        {/* SEKSI 2 — KONFIGURASI IKLAN */}
        <SectionLabel>{t('surveyConfiguration')}</SectionLabel>

        <div className={fieldRowListClass}>
          <FieldBlock
            icon={CalendarDays}
            label={t('surveyDurationLabel')}
            htmlFor="duration"
            required
            tooltip={durationTooltip}
            contentClassName="pl-0 sm:pl-6"
            error={
              durationHasError
                ? formData.duration > 30
                  ? t('errorDurationMax')
                  : t('errorDurationZero')
                : undefined
            }
            hint={
              openStartDays !== null ? (
                <span
                  className={`font-medium ${openStartDays <= 2 ? 'text-amber-600' : 'text-gray-500'}`}
                >
                  {openStartDays === 0
                    ? t('slotOutlookNone', { days: `${Math.max(formData.duration || 1, 1)} ${t('days').toLowerCase()}` })
                    : t('slotOutlook', {
                        days: `${Math.max(formData.duration || 1, 1)} ${t('days').toLowerCase()}`,
                        open: openStartDays,
                      })}
                </span>
              ) : undefined
            }
          >
            <DurationPicker
              value={formData.duration || 2}
              onChange={(val) => {
                updateFormData({ duration: val });
                if (attemptedSubmit && errors.duration) {
                  setErrors({ ...errors, duration: undefined });
                }
              }}
            />
          </FieldBlock>

          <FieldBlock
            icon={Users}
            label={t('respondentCriteriaLabel')}
            htmlFor="criteriaResponden"
            required
            counter={`${formData.criteriaResponden?.length || 0}/300`}
            tooltip={criteriaTooltip}
            error={attemptedSubmit ? errors.criteriaResponden : undefined}
          >
            <textarea
              id="criteriaResponden"
              ref={criteriaRespondenRef}
              rows={2}
              className={`${fieldInputClass} resize-none overflow-hidden leading-relaxed py-0.5 min-h-[72px]`}
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

        {/* SEKSI 3 — PENGATURAN INSENTIF */}
        <div className="border-t border-slate-100/90 mt-7 mb-5" />
        <SectionLabel>{t('incentiveSettings')}</SectionLabel>

        <div className={fieldRowListClass}>
          <FieldRow
            icon={Trophy}
            label={t('winnerCountLabel')}
            htmlFor="winnerCount"
            required
            compact
            tooltip={winnerTooltip}
            error={
              attemptedSubmit && errors.winnerCount
                ? errors.winnerCount
                : formData.winnerCount > 0 && (formData.winnerCount < 2 || formData.winnerCount > 5)
                ? formData.winnerCount < 2
                  ? t('errorMinWinners')
                  : t('errorMaxWinners')
                : undefined
            }
          >
            <input
              id="winnerCount"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className={fieldInputClass}
              placeholder={t('winnerCountPlaceholder')}
              value={formData.winnerCount || ''}
              onChange={(e) => {
                const val = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0;
                updateFormData({ winnerCount: val });
                if (attemptedSubmit && errors.winnerCount) {
                  if (val >= 2 && val <= 5) {
                    setErrors({ ...errors, winnerCount: undefined });
                  }
                }
              }}
            />
            <span className="ml-1.5 shrink-0 text-sm font-medium text-slate-500">{t('respondentUnit')}</span>
          </FieldRow>

          <FieldRow
            icon={Gift}
            label={t('prizePerWinnerLabel')}
            htmlFor="prizePerWinner"
            required
            compact
            tooltip={prizeTooltip}
            error={
              attemptedSubmit && errors.prizePerWinner
                ? errors.prizePerWinner
                : formData.prizePerWinner > 0 && formData.prizePerWinner < 25000
                ? t('errorMinPrize')
                : undefined
            }
            hint={
              <RewardRecommendationHint
                value={formData.prizePerWinner}
                onChange={(val) => {
                  updateFormData({ prizePerWinner: val });
                  if (attemptedSubmit && errors.prizePerWinner && val >= 25000) {
                    setErrors({ ...errors, prizePerWinner: undefined });
                  }
                }}
                questionCount={formData.questionCount}
              />
            }
          >
            <span className="mr-1.5 shrink-0 text-sm font-semibold text-slate-500">Rp</span>
            <input
              id="prizePerWinner"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className={fieldInputClass}
              placeholder={t('prizePerWinnerPlaceholder')}
              value={formData.prizePerWinner ? formData.prizePerWinner.toLocaleString('id-ID') : ''}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                const num = parseInt(val, 10) || 0;
                updateFormData({ prizePerWinner: num });
                if (attemptedSubmit && errors.prizePerWinner) {
                  if (num >= 25000) {
                    setErrors({ ...errors, prizePerWinner: undefined });
                  }
                }
              }}
            />
            <span className="ml-1.5 shrink-0 text-sm font-medium text-slate-500">{t('perWinner')}</span>
          </FieldRow>

          {formData.prizePerWinner > 0 && formData.winnerCount > 0 && (
            <div className="mt-1 px-4 py-3 rounded-xl bg-slate-50/80 border border-slate-200/80 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-800 font-semibold text-xs sm:text-sm">
                    {t('totalRewardTitle')}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-blue-50 text-jfu-primary border border-blue-200/80">
                    {t('billedInInvoiceBadge')}
                  </span>
                </div>
                <span className="font-bold text-slate-900 font-mono text-sm sm:text-base shrink-0">
                  {formatIDR(formData.prizePerWinner * formData.winnerCount)}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                {t('totalRewardDetailNote', {
                  winners: formData.winnerCount,
                  prize: formatIDR(formData.prizePerWinner),
                })}
              </p>
            </div>
          )}
        </div>
      </div>
      )}
      </div>

      {/* Kolom Kanan: Live Order Assistant & Cost Estimator (order-2 pada mobile, 5 kolom sticky pada desktop) */}
      <div className="order-2 lg:col-span-5 space-y-4 lg:sticky lg:top-24">
        <OrderLiveCompanion
          formData={formData}
          step={1}
          onCancelOrder={onCancelOrder}
          quotePending={!showConfig}
        />

        {/* Tombol Lanjut ke Ringkasan / Detail Pembayaran */}
        <div className="pt-1 pb-6 lg:pb-0">
          <button
            type="submit"
            disabled={isBlockedByPersonalData}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-3.5 text-sm font-bold text-white transition-all hover:bg-jfu-dark shadow-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-jfu-primary"
          >
            {t('continueToSummary')}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  </form>
  );
}
