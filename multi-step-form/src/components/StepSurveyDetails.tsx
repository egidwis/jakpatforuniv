import { useState, useEffect, useRef } from 'react';
import type { SurveyFormData } from '../types';
import { toast } from 'sonner';
import { AdsFlowCard } from './AdsFlowCard';
import { StepOneMethodSelection } from './StepOneMethodSelection';
import { StepOneGoogleForm } from './StepOneGoogleForm';
import { StepOneFormFields, ReviewInfoBanner } from './StepOneFormFields';
import { ProfileCompletionSheet } from './ProfileCompletionSheet';
import { isProfileGateSatisfied } from './ProfileForm';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface StepSurveyDetailsProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  nextStep: () => void;
  onHeaderVisibilityChange?: (isVisible: boolean) => void;
}

type FlowState = 'method-selection' | 'google-form' | 'manual' | 'form-fields';

export function StepSurveyDetails({ formData, updateFormData, nextStep, onHeaderVisibilityChange }: StepSurveyDetailsProps) {
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

  // Gate kelengkapan profil — pengganti RequireCompleteProfile di level route.
  // Prefetch saat mount; hasilnya di-await saat user memilih metode, sehingga
  // klik terasa instan pada kasus umum (cek sudah selesai duluan).
  const profileGateRef = useRef<Promise<boolean> | null>(null);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [pendingMethod, setPendingMethod] = useState<'google' | 'manual' | null>(null);

  useEffect(() => {
    profileGateRef.current = isProfileGateSatisfied();
    // Layar pilih metode (edukasi produk) bebas dilihat tanpa profil lengkap;
    // tapi draft lama bisa melewati layar itu (getInitialFlowState) — untuk
    // kasus itu gate tetap harus jalan, jadi cek juga saat mount.
    if (flowState !== 'method-selection') {
      profileGateRef.current.then((ok) => {
        if (!ok) setProfileSheetOpen(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Submission dimulai dari JFU form (CTA "Sebar via Jakpat") — field survey
  // di-lock karena sumber datanya adalah form JFU itu sendiri.
  const isJfuImport = Boolean(formData.customFormId);

  // Notify parent about header visibility
  useEffect(() => {
    if (onHeaderVisibilityChange) {
      // Hide header in method-selection AND google-form flow
      const shouldShowHeader = flowState !== 'method-selection' && flowState !== 'google-form';
      onHeaderVisibilityChange(shouldShowHeader);
    }
  }, [flowState, onHeaderVisibilityChange]);

  // Check if form has data
  const hasFilledData = formData.title || formData.description || formData.questionCount > 0;

  // Lepaskan status "berasal dari JFU form" (customFormId + hasil deteksi AI-nya)
  // saat user secara eksplisit memilih/beralih metode dari layar pilihan —
  // tanpa ini, draft lama yang masih menyimpan customFormId akan terus
  // mengunci field manual walau user sudah kembali ke pilihan awal.
  const clearJfuOrigin = () => {
    updateFormData({
      customFormId: undefined,
      hasPersonalDataQuestions: undefined,
      detectedKeywords: undefined,
      flaggedPersonalDataQuestions: undefined
    });
  };

  const proceedWithMethod = (method: 'google' | 'manual') => {
    clearJfuOrigin();
    if (method === 'google') {
      setFlowState('google-form');
      updateFormData({ isManualEntry: false });
    } else {
      setFlowState('manual');
      updateFormData({ isManualEntry: true });
    }
  };

  // Handle method selection — di sinilah gate profil berlaku: profil belum
  // lengkap → buka drawer profil dulu, metode terpilih disimpan sebagai pending.
  const handleMethodSelection = async (method: 'google' | 'manual') => {
    let ok = await (profileGateRef.current ?? (profileGateRef.current = isProfileGateSatisfied()));
    if (!ok) {
      // Hasil prefetch bisa basi — profil mungkin baru dilengkapi lewat banner
      // DashboardLayout tanpa meninggalkan halaman ini. Cek ulang dulu.
      profileGateRef.current = isProfileGateSatisfied();
      ok = await profileGateRef.current;
    }
    if (!ok) {
      setPendingMethod(method);
      setProfileSheetOpen(true);
      return;
    }
    proceedWithMethod(method);
  };

  const handleProfileCompleted = () => {
    // Profil baru saja tersimpan lengkap — cache gate diperbarui supaya
    // pemilihan metode berikutnya tidak memanggil Supabase lagi.
    profileGateRef.current = Promise.resolve(true);
    setProfileSheetOpen(false);
    if (pendingMethod) {
      proceedWithMethod(pendingMethod);
      setPendingMethod(null);
    }
  };

  const profileSheet = (
    <ProfileCompletionSheet
      open={profileSheetOpen}
      onOpenChange={setProfileSheetOpen}
      onCompleted={handleProfileCompleted}
    />
  );

  // Handle back to method selection
  const handleBackToMethodSelection = () => {
    setFlowState('method-selection');
  };

  // Handle switch between methods
  const handleSwitchToManual = () => {
    clearJfuOrigin();
    setFlowState('manual');
    updateFormData({ isManualEntry: true });
  };

  const handleSwitchToGoogle = () => {
    if (hasFilledData) {
      setShowConfirmSwitch(true);
    } else {
      clearJfuOrigin();
      setFlowState('google-form');
      updateFormData({ isManualEntry: false });
    }
  };

  const confirmSwitchToGoogle = () => {
    clearJfuOrigin();
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
  if (flowState === 'method-selection' || flowState === 'google-form') {
    const isImport = flowState === 'google-form';
    return (
      <>
        <AdsFlowCard step={isImport ? 'import' : 'method'}>
          {isImport ? (
            <StepOneGoogleForm
              formData={formData}
              updateFormData={updateFormData}
              onBack={handleBackToMethodSelection}
              onSwitchMethod={handleSwitchToManual}
              onFormReady={handleFormReady}
            />
          ) : (
            <StepOneMethodSelection onSelectMethod={handleMethodSelection} />
          )}
        </AdsFlowCard>

        {!isImport && (
          <div className="mt-4 w-full max-w-xl mx-auto flex flex-col items-center gap-3.5 text-center">
            <Link
              to="/dashboard"
              className="w-full flex items-center justify-center gap-2 py-3.5 px-5 rounded-2xl border border-gray-300 bg-white text-sm font-semibold text-[#1a1a1a] hover:bg-gray-50 hover:border-gray-400 transition-all shadow-2xs"
            >
              <ArrowLeft className="w-4 h-4 text-gray-500" />
              <span>{t('backToOrders')}</span>
            </Link>

            <p className="text-xs md:text-sm text-gray-500 leading-relaxed">
              {t('jfuFormCtaLead')}{' '}
              <Link
                to="/dashboard/forms"
                className="font-semibold text-jfu-primary hover:underline"
              >
                {t('jfuFormCtaAction')}
              </Link>
            </p>
          </div>
        )}

        {profileSheet}
      </>
    );
  }

  // Manual flow - show form fields directly
  if (flowState === 'manual') {
    return (
      <>
        <ReviewInfoBanner formData={formData} />
        <AdsFlowCard step="fields">
          <StepOneFormFields
            formData={formData}
            updateFormData={updateFormData}
            onSubmit={handleSubmit}
            onBack={handleBackToMethodSelection}
            isGoogleImport={false}
            isJfuImport={isJfuImport}
            // Tautan "beralih ke Google Form" hidup DI DALAM StepOneFormFields
            // sejak revamp, jadi menyembunyikannya cukup dengan tidak mengoper
            // handler-nya. Untuk impor JFU tautan itu memang harus hilang:
            // beralih metode membuang data yang sudah dikunci dari form JFU.
            onSwitchToGoogle={isJfuImport ? undefined : handleSwitchToGoogle}
          />
        </AdsFlowCard>

        {profileSheet}

        {/* Confirmation Dialog for Switching — sengaja DI LUAR AdsFlowCard,
            yang memakai overflow-hidden dan akan memotong overlay-nya */}
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
      </>
    );
  }

  // Form Fields View (after Google import)
  if (flowState === 'form-fields') {
    return (
      <>
        <ReviewInfoBanner formData={formData} />
        <AdsFlowCard step="fields">
          <StepOneFormFields
            formData={formData}
            updateFormData={updateFormData}
            onSubmit={handleSubmit}
            onBack={handleBackToMethodSelection}
            isGoogleImport={true}
          />
        </AdsFlowCard>
        {profileSheet}
      </>
    );
  }

  return null;
}
