import { useState } from 'react';
import type { SurveyFormData } from '../types';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { toast } from 'sonner';

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
}

export function StepOneFormFields({
  formData,
  updateFormData,
  onSubmit,
  onBack,
  isGoogleImport = false
}: StepOneFormFieldsProps) {
  const { t } = useLanguage();
  const [errors, setErrors] = useState<FormErrors>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

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

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      toast.error(t('errorCompleteAllFields'));
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
        {/* Card Title Removed as per request (Redundant with Header) */}

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
