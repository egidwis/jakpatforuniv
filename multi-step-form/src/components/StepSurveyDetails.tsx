import { useState, useEffect, useRef } from 'react';
import type { SurveyFormData } from '../types';
import { AdsFlowCard } from './AdsFlowCard';
import { StepOneFormFields, type SurveyEntryPhase } from './StepOneFormFields';
import { GoogleDriveImportSimple, type ImportedGoogleForm } from './GoogleDriveImportSimple';
import { ProfileCompletionSheet } from './ProfileCompletionSheet';
import { isProfileGateSatisfied } from './ProfileForm';
import { formDataForWizardImport } from '../utils/defaultFormData';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface StepSurveyDetailsProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
  onHeaderVisibilityChange?: (isVisible: boolean) => void;
  onCancelOrder?: () => void;
}

function hasSurveyIdentity(formData: SurveyFormData): boolean {
  return Boolean(formData.title || formData.surveyUrl || formData.questionCount > 0);
}

function initialPhase(formData: SurveyFormData, method: string | null): SurveyEntryPhase {
  const importedGoogle =
    !!formData.title &&
    formData.surveyUrl.includes('docs.google.com/forms') &&
    !formData.isManualEntry;

  if (method === 'google') return importedGoogle ? 'locked' : 'import';
  if (method === 'manual') return 'manual';
  if (hasSurveyIdentity(formData)) {
    if (formData.isManualEntry || !formData.surveyUrl.includes('docs.google.com/forms')) return 'manual';
    return 'locked';
  }
  return 'choice';
}

const CLEARED_SURVEY: Partial<SurveyFormData> = {
  surveyUrl: '',
  title: '',
  description: '',
  questionCount: 0,
  isManualEntry: true,
  hasPersonalDataQuestions: undefined,
  detectedKeywords: undefined,
  flaggedPersonalDataQuestions: undefined,
  customFormId: undefined,
};

export function StepSurveyDetails({
  formData,
  updateFormData,
  nextStep,
  onHeaderVisibilityChange,
  onCancelOrder,
}: StepSurveyDetailsProps) {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();

  const [phase, setPhase] = useState<SurveyEntryPhase>(() =>
    initialPhase(formData, searchParams.get('method')),
  );
  const [pendingImport, setPendingImport] = useState<ImportedGoogleForm | null>(null);
  const [reimportId, setReimportId] = useState<string | null>(null);
  const [importRun, setImportRun] = useState(0);
  const [awaitingReimport, setAwaitingReimport] = useState(false);
  const [showConfirmSwitch, setShowConfirmSwitch] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'import' | 'manual' | null>(null);
  const profileGateRef = useRef<Promise<boolean> | null>(null);

  const isJfuImport = Boolean(formData.customFormId);

  useEffect(() => {
    profileGateRef.current = isProfileGateSatisfied();
    if (phase !== 'choice') {
      profileGateRef.current.then((ok) => {
        if (!ok) setProfileSheetOpen(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onHeaderVisibilityChange?.(true);
  }, [onHeaderVisibilityChange]);

  const commitImport = (imported: ImportedGoogleForm) => {
    updateFormData(formDataForWizardImport(formData, {
      surveyUrl: imported.surveyUrl,
      title: imported.title,
      description: imported.description,
      questionCount: imported.questionCount,
      isManualEntry: false,
      hasPersonalDataQuestions: imported.hasPersonalDataQuestions,
      detectedKeywords: imported.detectedKeywords,
    }));
    setPendingImport(null);
    setReimportId(null);
    setAwaitingReimport(false);
    setPhase('locked');
  };

  const handleReviewed = (imported: ImportedGoogleForm) => {
    if (imported.hasPersonalDataQuestions) {
      setPendingImport(imported);
      setReimportId(null);
      setAwaitingReimport(false);
      setPhase('pii');
      return;
    }
    commitImport(imported);
  };

  const ensureProfile = async (action: 'import' | 'manual') => {
    let ok = await (profileGateRef.current ?? (profileGateRef.current = isProfileGateSatisfied()));
    if (!ok) {
      profileGateRef.current = isProfileGateSatisfied();
      ok = await profileGateRef.current;
    }
    if (!ok) {
      setPendingAction(action);
      setProfileSheetOpen(true);
      return;
    }
    if (action === 'import') {
      setReimportId(null);
      setPhase('import');
    } else {
      updateFormData({ isManualEntry: true });
      setPhase('manual');
    }
  };

  const handleProfileCompleted = () => {
    profileGateRef.current = Promise.resolve(true);
    setProfileSheetOpen(false);
    if (pendingAction === 'import') {
      setReimportId(null);
      setPhase('import');
    } else if (pendingAction === 'manual') {
      updateFormData({ isManualEntry: true });
      setPhase('manual');
    }
    setPendingAction(null);
  };

  const requestChange = () => {
    if (hasSurveyIdentity(formData)) {
      setShowConfirmSwitch(true);
      return;
    }
    updateFormData(CLEARED_SURVEY);
    setPendingImport(null);
    setReimportId(null);
    setPhase('choice');
  };

  const confirmChange = () => {
    updateFormData(CLEARED_SURVEY);
    setPendingImport(null);
    setReimportId(null);
    setShowConfirmSwitch(false);
    setPhase('choice');
  };

  const reviseAccepted = () => {
    const formId = pendingImport?.formId || formData.surveyUrl.match(/\/forms\/d\/([^/]+)/)?.[1];
    if (!formId) {
      requestChange();
      return;
    }
    window.open(`https://docs.google.com/forms/d/${formId}/edit`, '_blank', 'noopener,noreferrer');
    setPendingImport({
      formId,
      surveyUrl: formData.surveyUrl,
      title: formData.title,
      description: formData.description,
      questionCount: formData.questionCount,
      isManualEntry: false,
      hasPersonalDataQuestions: true,
      detectedKeywords: formData.detectedKeywords || [],
    });
    setAwaitingReimport(true);
    setPhase('pii');
  };

  const startReimport = () => {
    if (!pendingImport) return;
    setReimportId(pendingImport.formId);
    setImportRun((n) => n + 1);
    setPhase('import');
  };

  const profileSheet = (
    <ProfileCompletionSheet
      open={profileSheetOpen}
      onOpenChange={setProfileSheetOpen}
      onCompleted={handleProfileCompleted}
    />
  );

  return (
    <>
      <AdsFlowCard step="fields">
        <StepOneFormFields
          formData={formData}
          updateFormData={updateFormData}
          onSubmit={nextStep}
          phase={phase}
          isGoogleImport={phase === 'locked' && !formData.isManualEntry && formData.surveyUrl.includes('docs.google.com/forms')}
          isJfuImport={isJfuImport}
          onChooseImport={() => { void ensureProfile('import'); }}
          onChooseManual={() => { void ensureProfile('manual'); }}
          onChangeEntry={isJfuImport ? undefined : requestChange}
          pendingImport={pendingImport}
          awaitingReimport={awaitingReimport}
          onEditGoogleForm={reviseAccepted}
          onAcceptManualReview={() => pendingImport && commitImport(pendingImport)}
          onReimport={startReimport}
          onCancelOrder={onCancelOrder}
          importSlot={phase === 'import' ? (
            <GoogleDriveImportSimple
              key={importRun}
              formData={formData}
              updateFormData={updateFormData}
              onFormDataLoaded={() => {}}
              onReviewed={handleReviewed}
              onCancel={() => {
                setReimportId(null);
                setPhase(pendingImport ? 'pii' : 'choice');
              }}
              autoFormId={reimportId}
            />
          ) : null}
        />
      </AdsFlowCard>
      {profileSheet}
      {showConfirmSwitch && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <AlertTriangle size={24} className="modal-icon-warning" />
              <h3 className="modal-title">{t('confirmClearSurveyTitle')}</h3>
            </div>
            <div className="modal-body">
              <p>{t('confirmClearSurveyBody')}</p>
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setShowConfirmSwitch(false)} className="modal-button modal-button-cancel">
                {t('cancel')}
              </button>
              <button type="button" onClick={confirmChange} className="modal-button modal-button-confirm">
                {t('confirmClearSurveyAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
