import { ArrowLeft } from 'lucide-react';
import type { SurveyFormData } from '../types';
import { GoogleDriveImportSimple } from './GoogleDriveImportSimple';
import { useLanguage } from '../i18n/LanguageContext';

interface StepOneGoogleFormProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  onBack: () => void;
  onSwitchMethod: () => void;
  onFormReady: () => void;
}

/**
 * Body layar import Google Form — dirender di dalam `AdsFlowCard` (cap +
 * footer disclaimer T&C sudah dimiliki shell, lihat AdsFlowCard.tsx). Heading
 * di sini SENGAJA jadi tombol kembali itu sendiri (ArrowLeft + judul,
 * seluruhnya clickable) — cap tidak lagi punya chip kembali sendiri, supaya
 * cap benar-benar nol elemen baru antar step. `onBack` juga diteruskan ke
 * `GoogleDriveImportSimple` sebagai `onCancel`, dipakai jalur "Batal & Edit
 * Form" saat PII terdeteksi.
 */
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
    <>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-base md:text-lg font-bold text-[#1a1a1a] hover:text-jfu-primary transition-colors -ml-1"
      >
        <ArrowLeft className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
        {t('googleFormImportTitle')}
      </button>

      <div className="mt-3">
        <GoogleDriveImportSimple
          formData={formData}
          updateFormData={updateFormData}
          onFormDataLoaded={handleFormDataLoaded}
          onCancel={onBack}
        />
      </div>

      <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-center text-xs md:text-sm text-gray-500">
        <span>{t('noGoogleForm')}{' '}</span>
        <button type="button" onClick={onSwitchMethod} className="font-semibold text-jfu-primary hover:underline ml-1">
          {t('fillManualOnly')}
        </button>
      </div>
    </>
  );
}
