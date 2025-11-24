import type { SurveyFormData } from '../types';
import { ArrowLeft } from 'lucide-react';
import { GoogleDriveImportSimple } from './GoogleDriveImportSimple';
import { useLanguage } from '../i18n/LanguageContext';

interface StepOneGoogleFormProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  onBack: () => void;
  onSwitchMethod: () => void;
  onFormReady: () => void;
}

export function StepOneGoogleForm({
  formData,
  updateFormData,
  onBack,
  onSwitchMethod,
  onFormReady
}: StepOneGoogleFormProps) {
  const { t } = useLanguage();

  const handleFormDataLoaded = () => {
    // Setelah data diimport, langsung ke form fields
    onFormReady();
  };

  return (
    <div className="google-form-flow-container">
      {/* Header with Back Button */}
      <div className="flow-header">
        <button onClick={onBack} className="back-button">
          <ArrowLeft size={20} />
          <span>{t('backButton')}</span>
        </button>
        <h1 className="flow-title">{t('googleFormImportTitle')}</h1>
        <p className="flow-subtitle">{t('googleFormImportDescription')}</p>
      </div>

      {/* Google Drive Import Component */}
      <div className="flow-content">
        <div className="google-drive-section-wrapper">
          <GoogleDriveImportSimple
            formData={formData}
            updateFormData={updateFormData}
            onFormDataLoaded={handleFormDataLoaded}
          />
        </div>

        {/* Privacy Notice */}
        <div className="privacy-notice-compact">
          <svg className="privacy-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <p className="privacy-text">
            {t('byContinuingAgree')}{' '}
            <a
              href="https://jakpatforuniv.com/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="privacy-link"
            >
              {t('privacyPolicy')}
            </a>
            {' '}{t('andText')}{' '}
            <a
              href="https://jakpatforuniv.com/terms-conditions"
              target="_blank"
              rel="noopener noreferrer"
              className="privacy-link"
            >
              {t('termsConditions')}
            </a>
          </p>
        </div>

        {/* Switch Method Link */}
        <div className="switch-method-section">
          <p className="switch-method-text">{t('noGoogleForm')}</p>
          <button onClick={onSwitchMethod} className="switch-method-link">
            {t('fillManualOnly')}
          </button>
        </div>
      </div>
    </div>
  );
}
