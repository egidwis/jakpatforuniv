import { useState } from 'react';
import type { SurveyFormData } from '../types';
import { CheckCircle } from 'lucide-react';
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
      <div className="section-card">
        <div className="section-header">
          <span className="section-icon">📋</span>
          <h3 className="section-title">DETAIL SURVEY</h3>
          {formData.title && formData.description && formData.questionCount > 0 && (
            <span className="section-badge">✓</span>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="surveyUrl" className="form-label">
            Link Survey <span className="text-red-500">*</span>
            {isGoogleImport && <span className="text-xs text-gray-500 ml-2">(dari Google Drive)</span>}
          </label>
          <div className="input-wrapper">
            <input
              id="surveyUrl"
              type="url"
              className={`form-input input-with-validation ${isGoogleImport ? 'bg-gray-50 text-gray-700' : ''} ${errors.surveyUrl && attemptedSubmit ? 'border-red-500' : ''}`}
              placeholder="https://docs.google.com/forms/... atau https://forms.gle/..."
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
            {formData.surveyUrl && !errors.surveyUrl && <CheckCircle className="validation-icon valid" />}
          </div>
          {errors.surveyUrl && attemptedSubmit && (
            <span className="helper-text error mt-2">⚠️ {errors.surveyUrl}</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="form-group">
            <label htmlFor="title" className="form-label">
              {t('surveyTitle')} <span className="text-red-500">*</span>
              {isGoogleImport && <span className="text-xs text-gray-500 ml-2">{t('surveyTitleFromGoogleDrive')}</span>}
            </label>
            <div className="input-wrapper">
              <input
                id="title"
                type="text"
                className={`form-input input-with-validation ${isGoogleImport ? 'bg-gray-50 text-gray-700' : ''} ${errors.title && attemptedSubmit ? 'border-red-500' : ''}`}
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
              {formData.title && !errors.title && <CheckCircle className="validation-icon valid" />}
            </div>
            {errors.title && attemptedSubmit ? (
              <span className="helper-text error">⚠️ {errors.title}</span>
            ) : (
              <span className="helper-text">e.g., Customer Satisfaction Survey</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="questionCount" className="form-label">
              {t('questionCount')} <span className="text-red-500">*</span>
              {isGoogleImport && <span className="text-xs text-gray-500 ml-2">{t('surveyTitleFromGoogleDrive')}</span>}
            </label>
            <div className="input-wrapper">
              <input
                id="questionCount"
                type="number"
                className={`form-input input-with-validation ${isGoogleImport ? 'bg-gray-50 text-gray-700' : ''} ${errors.questionCount && attemptedSubmit ? 'border-red-500' : ''}`}
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
              {formData.questionCount > 0 && !errors.questionCount && <CheckCircle className="validation-icon valid" />}
            </div>
            {errors.questionCount && attemptedSubmit ? (
              <span className="helper-text error">⚠️ {errors.questionCount}</span>
            ) : formData.questionCount > 0 ? (
              <span className="helper-text">
                💰 Rp {formData.questionCount <= 15 ? '150.000' : formData.questionCount <= 30 ? '200.000' : formData.questionCount <= 50 ? '300.000' : formData.questionCount <= 70 ? '400.000' : '500.000'}/hari
              </span>
            ) : null}
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="description" className="form-label">
            {t('surveyDescription')} <span className="text-red-500">*</span>
            {isGoogleImport && <span className="text-xs text-gray-500 ml-2">{t('surveyTitleFromGoogleDrive')}</span>}
          </label>
          <textarea
            id="description"
            className={`form-input ${isGoogleImport ? 'bg-gray-50 text-gray-700' : ''} ${errors.description && attemptedSubmit ? 'border-red-500' : ''}`}
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
          />
          <div className="char-counter">
            {formData.description.length}/500 characters
          </div>
          {errors.description && attemptedSubmit && (
            <span className="helper-text error mt-2">⚠️ {errors.description}</span>
          )}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8">
        {onBack && (
          <button
            type="button"
            className="button button-secondary"
            onClick={onBack}
          >
            ← Kembali
          </button>
        )}
        <button
          type="submit"
          className={`button button-primary ${!onBack ? 'ml-auto' : ''}`}
        >
          {t('continue')}
        </button>
      </div>
    </form>
  );
}
