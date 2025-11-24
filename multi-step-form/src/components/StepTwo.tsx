import type { SurveyFormData } from '../types';
import { toast } from 'sonner';
import { StepTwoConfig } from './StepTwoConfig';
import { useLanguage } from '../i18n/LanguageContext';

interface StepTwoProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
  prevStep: () => void;
}

export function StepTwo({ formData, updateFormData, nextStep, prevStep }: StepTwoProps) {
  const { t } = useLanguage();

  // Validate and submit
  const validateForm = () => {
    if (!formData.criteriaResponden) {
      toast.error(t('errorRespondentCriteriaEmpty'));
      return false;
    }

    if (formData.duration <= 0) {
      toast.error(t('errorSurveyDurationZero'));
      return false;
    }

    if (formData.winnerCount < 2 || formData.winnerCount > 5) {
      toast.error(t('errorWinnerCountRange'));
      return false;
    }

    if (formData.prizePerWinner < 25000) {
      toast.error(t('errorMinimumPrize'));
      return false;
    }

    return true;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      nextStep();
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">{t('surveyConfiguration')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        {t('surveyConfigurationDescription')}
      </p>

      <StepTwoConfig
        formData={formData}
        updateFormData={updateFormData}
        onSubmit={handleSubmit}
        onBack={prevStep}
      />
    </div>
  );
}
