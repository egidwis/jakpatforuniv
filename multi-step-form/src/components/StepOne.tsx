import { useState } from 'react';
import type { SurveyFormData } from '../types';
import { toast } from 'sonner';
import { StepOneMethodSelection } from './StepOneMethodSelection';
import { StepOneGoogleForm } from './StepOneGoogleForm';
import { StepOneFormFields } from './StepOneFormFields';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface StepOneProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
}

type FlowState = 'method-selection' | 'google-form' | 'manual' | 'form-fields';

export function StepOne({ formData, updateFormData, nextStep }: StepOneProps) {
  const { t } = useLanguage();

  // Initialize flowState based on existing formData
  const getInitialFlowState = (): FlowState => {
    // If there's already data filled, determine the flow state
    if (formData.title || formData.description || formData.questionCount > 0) {
      // If manual entry or no Google Forms URL
      if (formData.isManualEntry || !formData.surveyUrl.includes('docs.google.com/forms')) {
        return 'manual';
      }
      // If it's a Google Form
      return 'form-fields';
    }
    // No data yet, show method selection
    return 'method-selection';
  };

  const [flowState, setFlowState] = useState<FlowState>(getInitialFlowState());
  const [showConfirmSwitch, setShowConfirmSwitch] = useState(false);

  // Check if form has data
  const hasFilledData = formData.title || formData.description || formData.questionCount > 0;

  // Handle method selection
  const handleMethodSelection = (method: 'google' | 'manual') => {
    if (method === 'google') {
      setFlowState('google-form');
      updateFormData({ isManualEntry: false });
    } else {
      setFlowState('manual');
      updateFormData({ isManualEntry: true });
    }
  };

  // Handle back to method selection
  const handleBackToMethodSelection = () => {
    setFlowState('method-selection');
  };

  // Handle switch between methods
  const handleSwitchToManual = () => {
    setFlowState('manual');
    updateFormData({ isManualEntry: true });
  };

  const handleSwitchToGoogle = () => {
    if (hasFilledData) {
      setShowConfirmSwitch(true);
    } else {
      setFlowState('google-form');
      updateFormData({ isManualEntry: false });
    }
  };

  const confirmSwitchToGoogle = () => {
    // Reset form data
    updateFormData({
      surveyUrl: '',
      title: '',
      description: '',
      questionCount: 0,
      isManualEntry: false
    });
    setShowConfirmSwitch(false);
    setFlowState('google-form');
  };

  // Handle form ready (after Google import)
  const handleFormReady = () => {
    setFlowState('form-fields');
  };

  // Validate and submit - only survey details
  const validateForm = () => {
    if (!formData.surveyUrl) {
      toast.error(t('errorEnterSurveyUrl'));
      return false;
    }

    if (!formData.title) {
      toast.error(t('errorSurveyTitleEmpty'));
      return false;
    }

    if (!formData.description) {
      toast.error(t('errorSurveyDescriptionEmpty'));
      return false;
    }

    if (formData.questionCount <= 0) {
      toast.error(t('errorQuestionCountZero'));
      return false;
    }

    return true;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      nextStep();
    }
  };

  // Render based on flow state
  if (flowState === 'method-selection') {
    return <StepOneMethodSelection onSelectMethod={handleMethodSelection} />;
  }

  if (flowState === 'google-form') {
    return (
      <StepOneGoogleForm
        formData={formData}
        updateFormData={updateFormData}
        onBack={handleBackToMethodSelection}
        onSwitchMethod={handleSwitchToManual}
        onFormReady={handleFormReady}
      />
    );
  }

  // Manual flow - show form fields directly
  if (flowState === 'manual') {
    return (
      <div className="manual-flow-container">
        <StepOneFormFields
          formData={formData}
          updateFormData={updateFormData}
          onSubmit={handleSubmit}
          onBack={handleBackToMethodSelection}
          isGoogleImport={false}
        />

        {/* Switch to Google Form */}
        <div className="switch-method-section">
          <p className="switch-method-text">Punya Google Form?</p>
          <button onClick={handleSwitchToGoogle} className="switch-method-link">
            Import dari Google Form
          </button>
        </div>

        {/* Confirmation Dialog for Switching */}
        {showConfirmSwitch && (
          <div className="modal-overlay">
            <div className="modal-dialog">
              <div className="modal-header">
                <AlertTriangle size={24} className="modal-icon-warning" />
                <h3 className="modal-title">Konfirmasi Perubahan Metode</h3>
              </div>
              <div className="modal-body">
                <p>
                  Data yang sudah Anda isi akan dihapus. Anda yakin ingin beralih ke import Google Form?
                </p>
              </div>
              <div className="modal-footer">
                <button
                  onClick={() => setShowConfirmSwitch(false)}
                  className="modal-button modal-button-cancel"
                >
                  Batal
                </button>
                <button
                  onClick={confirmSwitchToGoogle}
                  className="modal-button modal-button-confirm"
                >
                  Ya, Ubah ke Google Form
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Form Fields View (after Google import)
  if (flowState === 'form-fields') {
    return (
      <div className="form-fields-container">
        <StepOneFormFields
          formData={formData}
          updateFormData={updateFormData}
          onSubmit={handleSubmit}
          isGoogleImport={true}
        />
      </div>
    );
  }

  return null;
}
