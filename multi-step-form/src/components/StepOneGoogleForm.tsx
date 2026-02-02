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
