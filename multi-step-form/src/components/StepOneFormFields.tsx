import { useState, useEffect, useRef } from 'react';
import type { SurveyFormData } from '../types';
import { CheckCircle, AlertCircle, Settings, Gift, Info, Lightbulb } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

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
  onBack?: () => void;
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

export function StepOneFormFields({
  formData,
  updateFormData,
  onSubmit,
  onBack,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Success Banner for Google Import */}
      {isGoogleImport && (
        <div className="info-box success mb-4">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">{t('successImportedFromGoogleDrive')}</p>
              <p className="text-xs text-green-700 mt-1">
                Judul, deskripsi, dan jumlah pertanyaan telah diisi otomatis berdasarkan form Google Anda.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION: SURVEY INFORMATION */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 145, 255, 0.1)', color: '#0091ff' }}>
              <Info size={18} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{t('surveyInformation')}</h3>
          </div>
          {formData.surveyUrl && formData.title && formData.description && formData.questionCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
              <CheckCircle size={12} />
              <span>Complete</span>
            </div>
          )}
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label htmlFor="surveyUrl" className="text-sm font-medium text-gray-700 flex items-center gap-1">
              {t('googleFormLink')} <span className="text-red-500">*</span>
              {isGoogleImport && <span className="text-xs font-normal text-gray-500 ml-1">{t('surveyTitleFromGoogleDrive')}</span>}
            </label>
            <div className="relative">
              <input
                id="surveyUrl"
                type="url"
                className={`w-full px-4 py-2.5 rounded-lg border text-sm transition-all duration-200 
                  ${errors.surveyUrl && attemptedSubmit
                    ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                    : 'border-gray-200 hover:border-gray-300'
                  }
                  ${isGoogleImport ? 'bg-gray-50 text-gray-600' : 'bg-white'}
                `}
                style={!errors.surveyUrl || !attemptedSubmit ? { outlineColor: '#0091ff' } : {}}
                onFocus={(e) => {
                  if (!(attemptedSubmit && errors.surveyUrl)) {
                    e.target.style.borderColor = '#0091ff';
                    e.target.style.boxShadow = '0 0 0 4px rgba(0, 145, 255, 0.1)';
                  }
                }}
                onBlur={(e) => {
                  if (!(attemptedSubmit && errors.surveyUrl)) {
                    e.target.style.borderColor = '#e5e7eb';
                    e.target.style.boxShadow = 'none';
                  }
                }}
                placeholder={t('googleFormLinkPlaceholder')}
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
              {formData.surveyUrl && !errors.surveyUrl && !isGoogleImport && (
                <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 w-4 h-4" />
              )}
            </div>
            {errors.surveyUrl && attemptedSubmit ? (
              <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" /> {errors.surveyUrl}
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                Masukan link Google Form atau shortlink (forms.gle/...)
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                {t('surveyTitle')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="title"
                  type="text"
                  className={`w-full px-4 py-2.5 rounded-lg border text-sm transition-all duration-200
                    ${errors.title && attemptedSubmit
                      ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                      : 'border-gray-200 hover:border-gray-300'
                    }
                    ${isGoogleImport ? 'bg-gray-50 text-gray-600' : 'bg-white'}
                  `}
                  style={!errors.title || !attemptedSubmit ? { outlineColor: '#0091ff' } : {}}
                  onFocus={(e) => {
                    if (!(attemptedSubmit && errors.title)) {
                      e.target.style.borderColor = '#0091ff';
                      e.target.style.boxShadow = '0 0 0 4px rgba(0, 145, 255, 0.1)';
                    }
                  }}
                  onBlur={(e) => {
                    if (!(attemptedSubmit && errors.title)) {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.boxShadow = 'none';
                    }
                  }}
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
              </div>
              {errors.title && attemptedSubmit && (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {errors.title}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="questionCount" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                {t('questionCount')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="questionCount"
                  type="number"
                  className={`w-full px-4 py-2.5 rounded-lg border text-sm transition-all duration-200
                    ${errors.questionCount && attemptedSubmit
                      ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                      : 'border-gray-200 hover:border-gray-300'
                    }
                    ${isGoogleImport ? 'bg-gray-50 text-gray-600' : 'bg-white'}
                  `}
                  style={!errors.questionCount || !attemptedSubmit ? { outlineColor: '#0091ff' } : {}}
                  onFocus={(e) => {
                    if (!(attemptedSubmit && errors.questionCount)) {
                      e.target.style.borderColor = '#0091ff';
                      e.target.style.boxShadow = '0 0 0 4px rgba(0, 145, 255, 0.1)';
                    }
                  }}
                  onBlur={(e) => {
                    if (!(attemptedSubmit && errors.questionCount)) {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.boxShadow = 'none';
                    }
                  }}
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
              </div>
              {errors.questionCount && attemptedSubmit ? (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {errors.questionCount}
                </p>
              ) : formData.questionCount > 0 && (
                <p className="text-xs font-medium mt-1" style={{ color: '#0091ff' }}>
                  Est. Cost: Rp {formData.questionCount <= 15 ? '150.000' : formData.questionCount <= 30 ? '200.000' : formData.questionCount <= 50 ? '300.000' : formData.questionCount <= 70 ? '400.000' : '500.000'}/hari
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium text-gray-700 flex items-center gap-1">
              {t('surveyDescription')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <textarea
                id="description"
                className={`w-full px-4 py-2.5 rounded-lg border text-sm transition-all duration-200 min-h-[120px] resize-y
                  ${errors.description && attemptedSubmit
                    ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                    : 'border-gray-200 hover:border-gray-300'
                  }
                  ${isGoogleImport ? 'bg-gray-50 text-gray-600' : 'bg-white'}
                `}
                style={!errors.description || !attemptedSubmit ? { outlineColor: '#0091ff' } : {}}
                onFocus={(e) => {
                  if (!(attemptedSubmit && errors.description)) {
                    e.target.style.borderColor = '#0091ff';
                    e.target.style.boxShadow = '0 0 0 4px rgba(0, 145, 255, 0.1)';
                  }
                }}
                onBlur={(e) => {
                  if (!(attemptedSubmit && errors.description)) {
                    e.target.style.borderColor = '#e5e7eb';
                    e.target.style.boxShadow = 'none';
                  }
                }}
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
              <div className="absolute bottom-2 right-2 text-[10px] text-gray-400 font-medium bg-white/80 px-1.5 py-0.5 rounded">
                {formData.description.length}/500
              </div>
            </div>
            {errors.description && attemptedSubmit && (
              <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" /> {errors.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* SECTION: SURVEY CONFIGURATION */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-10">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 145, 255, 0.1)', color: '#0091ff' }}>
              <Settings size={18} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{t('surveyConfiguration')}</h3>
          </div>
          {formData.criteriaResponden && formData.duration > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
              <CheckCircle size={12} />
              <span>Complete</span>
            </div>
          )}
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label htmlFor="criteriaResponden" className="text-sm font-medium text-gray-700 flex items-center gap-1">
              {t('respondentCriteriaLabel')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <textarea
                id="criteriaResponden"
                className={`w-full px-4 py-2.5 rounded-lg border text-sm transition-all duration-200 min-h-[100px] resize-y
                  ${errors.criteriaResponden && attemptedSubmit
                    ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                    : 'border-gray-200 hover:border-gray-300'
                  }
                  bg-white
                `}
                style={!errors.criteriaResponden || !attemptedSubmit ? { outlineColor: '#0091ff' } : {}}
                onFocus={(e) => {
                  if (!(attemptedSubmit && errors.criteriaResponden)) {
                    e.target.style.borderColor = '#0091ff';
                    e.target.style.boxShadow = '0 0 0 4px rgba(0, 145, 255, 0.1)';
                  }
                }}
                onBlur={(e) => {
                  if (!(attemptedSubmit && errors.criteriaResponden)) {
                    e.target.style.borderColor = '#e5e7eb';
                    e.target.style.boxShadow = 'none';
                  }
                }}
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
              <div className="absolute bottom-2 right-2 text-[10px] text-gray-400 font-medium bg-white/80 px-1.5 py-0.5 rounded">
                {formData.criteriaResponden?.length || 0}/200
              </div>
            </div>
            {errors.criteriaResponden && attemptedSubmit ? (
              <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" /> {errors.criteriaResponden}
              </p>
            ) : (
              <p className="text-xs flex items-start gap-2 mt-1 p-2 rounded-lg border text-left" style={{ backgroundColor: 'rgba(0, 145, 255, 0.05)', borderColor: 'rgba(0, 145, 255, 0.2)', color: '#0091ff' }}>
                <Info size={14} className="mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">
                  {t('respondentCriteriaHelp').split('*').map((part, index) =>
                    index % 2 === 1 ? <strong key={index} className="font-semibold">{part}</strong> : part
                  )}
                </span>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="duration" className="text-sm font-medium text-gray-700 flex items-center gap-1">
              {t('surveyDurationLabel')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="duration"
                type="number"
                className={`w-full pl-4 pr-10 py-2.5 rounded-lg border text-sm transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                  ${(errors.duration && attemptedSubmit) || (formData.duration !== undefined && (formData.duration < 1 || formData.duration > 30))
                    ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                    : 'border-gray-200 hover:border-gray-300'
                  }
                  bg-white
                `}
                style={(!((errors.duration && attemptedSubmit) || (formData.duration !== undefined && (formData.duration < 1 || formData.duration > 30)))) ? { outlineColor: '#0091ff' } : {}}
                onFocus={(e) => {
                  if (!((errors.duration && attemptedSubmit) || (formData.duration !== undefined && (formData.duration < 1 || formData.duration > 30)))) {
                    e.target.style.borderColor = '#0091ff';
                    e.target.style.boxShadow = '0 0 0 4px rgba(0, 145, 255, 0.1)';
                  }
                }}
                onBlur={(e) => {
                  if (!((errors.duration && attemptedSubmit) || (formData.duration !== undefined && (formData.duration < 1 || formData.duration > 30)))) {
                    e.target.style.borderColor = '#e5e7eb';
                    e.target.style.boxShadow = 'none';
                  }
                }}
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
                min={1}
                max={30}
              />
              {formData.duration > 0 && formData.duration <= 30 && !errors.duration && (
                <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 w-4 h-4 pointer-events-none" />
              )}
            </div>
            {((errors.duration && attemptedSubmit) || (formData.duration !== undefined && (formData.duration < 1 || formData.duration > 30))) ? (
              <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" /> {formData.duration > 30 ? t('errorDurationMax') : t('errorDurationZero')}
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                {t('surveyDurationHelp')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* SECTION: INCENTIVE SETTINGS */}
      <div className="bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/30 rounded-xl border border-emerald-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-emerald-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Gift size={18} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{t('incentiveSettings')}</h3>
          </div>
          {formData.winnerCount >= 2 && formData.prizePerWinner >= 25000 && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-200">
              <CheckCircle size={12} />
              <span>Complete</span>
            </div>
          )}
        </div>

        <div className="p-6 space-y-6">
          <div className="p-3 rounded-lg flex items-start gap-2 border" style={{ backgroundColor: 'rgba(0, 145, 255, 0.05)', borderColor: 'rgba(0, 145, 255, 0.2)' }}>
            <Info className="w-4 h-4 mt-0.5" style={{ color: '#0091ff' }} />
            <p className="text-sm" style={{ color: '#0077cc' }}>
              {t('incentiveDistributionInfo')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="prizePerWinner" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                {t('prizePerWinnerLabel')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">Rp</div>
                <input
                  id="prizePerWinner"
                  type="number"
                  className={`w-full pl-10 pr-10 py-2.5 rounded-lg border text-sm transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                    ${errors.prizePerWinner
                      ? 'border-red-300 focus:ring-red-200 bg-red-50/30'
                      : 'border-gray-200 hover:border-gray-300'
                    }
                    bg-white
                  `}
                  placeholder={t('prizePerWinnerPlaceholder')}
                  value={formData.prizePerWinner}
                  onChange={(e) => {
                    updateFormData({ prizePerWinner: parseInt(e.target.value) || 0 });
                    if (attemptedSubmit && errors.prizePerWinner) {
                      setErrors({ ...errors, prizePerWinner: undefined });
                    }
                  }}
                  min={25000}
                  step={1000}
                />
                {formData.prizePerWinner >= 25000 && !errors.prizePerWinner && (
                  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 w-4 h-4 pointer-events-none" />
                )}
              </div>
              {formData.prizePerWinner > 0 && formData.prizePerWinner < 25000 ? (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {t('errorMinPrize')}
                </p>
              ) : (
                <>
                  {formData.prizePerWinner >= 25000 && formData.questionCount > 0 && (
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" />
                      {t('recommendation')}: Rp {getRecommendedPrize(formData.questionCount).toLocaleString('id-ID')}{t('perWinner')}
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="winnerCount" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                {t('winnerCountLabel')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="winnerCount"
                  type="number"
                  className={`w-full pl-4 pr-10 py-2.5 rounded-lg border text-sm transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                    ${errors.winnerCount ? 'border-red-300 focus:ring-red-200 bg-red-50/30' : 'border-gray-200 hover:border-gray-300'}
                     bg-white
                  `}
                  placeholder={t('winnerCountPlaceholder')}
                  value={formData.winnerCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    updateFormData({ winnerCount: Math.min(val, 5) });
                    if (attemptedSubmit && errors.winnerCount) {
                      setErrors({ ...errors, winnerCount: undefined });
                    }
                  }}
                  min={2}
                  max={5}
                />
                {formData.winnerCount >= 2 && formData.winnerCount <= 5 && !errors.winnerCount && (
                  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 w-4 h-4 pointer-events-none" />
                )}
              </div>
              {formData.winnerCount > 0 && formData.winnerCount < 2 ? (
                <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" /> {t('errorMinWinners')}
                </p>
              ) : (
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                  <span className="flex items-start gap-1">
                    <Info className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-500" />
                    <span>
                      {t('maxWinnerWarning')}{' '}
                      <Link
                        to="/dashboard/chat"
                        target="_blank"
                        className="font-semibold underline hover:no-underline"
                        style={{ color: '#0091ff' }}
                      >
                        {t('contactAdmin')}
                      </Link>.
                    </span>
                  </span>
                </p>
              )}
            </div>
          </div>

          {formData.winnerCount >= 2 && formData.prizePerWinner >= 25000 && (
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 flex items-center justify-between">
              <span className="text-sm font-medium text-emerald-800">{t('totalIncentiveRequired')}</span>
              <p className="text-lg font-bold text-emerald-700">
                💰 Rp {(formData.winnerCount * formData.prizePerWinner).toLocaleString('id-ID')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between items-center pt-4 mt-8">
        {onBack && (
          <button
            type="button"
            className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 flex items-center gap-2"
            onClick={onBack}
          >
            ← {t('backButton')}
          </button>
        )}
        <button
          type="submit"
          className={`px-6 py-2.5 rounded-xl text-white font-medium shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2 ${!onBack ? 'ml-auto' : ''}`}
          style={{ background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)', boxShadow: '0 4px 12px rgba(0, 145, 255, 0.3)' }}
        >
          {t('continue')} →
        </button>
      </div>
    </form>
  );
}
