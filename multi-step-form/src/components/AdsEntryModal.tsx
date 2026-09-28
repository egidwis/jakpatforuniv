import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  X,
  Radio,
  Users,
  Clock,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Bot,
  UserCheck,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export interface AdsEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMethod: (method: 'google' | 'manual') => void;
  onOpenCustomMission?: () => void;
}

export const AdsEntryModal: React.FC<AdsEntryModalProps> = ({
  isOpen,
  onClose,
  onSelectMethod,
  onOpenCustomMission,
}) => {
  const { t } = useLanguage();
  const [step, setStep] = useState<1 | 2>(1);
  const [hasAcknowledged, setHasAcknowledged] = useState(false);

  // Lock body scroll saat modal terbuka
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle ESC key untuk menutup modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset state saat modal ditutup
  const handleClose = () => {
    setStep(1);
    setHasAcknowledged(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6 md:p-8 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl border border-gray-100 shadow-2xl w-full sm:max-w-xl max-h-[92vh] sm:max-h-[86vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
        {/* Mobile Drag Handle Indicator */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-white shrink-0">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 sm:px-7 py-4 sm:py-4.5 border-b border-gray-100 bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {step === 2 ? (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-white border border-slate-200/90 text-slate-600 hover:text-jfu-primary hover:border-blue-200 flex items-center justify-center transition-colors cursor-pointer shrink-0 shadow-2xs group"
                title={t('adsEntryBackToAwareness')}
              >
                <ArrowLeft className="w-4.5 h-4.5 group-hover:-translate-x-0.5 transition-transform" />
              </button>
            ) : (
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-jfu-primary text-white flex items-center justify-center shadow-md shadow-jfu-primary/25 shrink-0">
                <Radio className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-gray-900 leading-tight truncate">
                {step === 1 ? t('adsAwarenessModalTitle') : t('adsEntrySelectMethodTitle')}
              </h2>
              <p className="text-[11px] sm:text-xs text-gray-500 truncate mt-0.5">
                {step === 1 ? t('adsAwarenessModalSubtitle') : t('adsEntrySelectMethodSubtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label={t('closePopup')}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer shrink-0 ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto p-5 sm:p-7 flex-1 overscroll-contain">
          {step === 1 ? (
            /* ================= STEP 1: INFORMASI MEKANISME ================= */
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="space-y-3.5">
                {/* Poin 1: Profil Acak & Screening */}
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/70 border border-slate-100">
                  <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/80 text-jfu-primary flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      {t('adsAwarenessPoint1Title')}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                      {t('adsAwarenessPoint1Desc')}
                    </p>
                  </div>
                </div>

                {/* Poin 2: Penayangan Berbasis Durasi */}
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/70 border border-slate-100">
                  <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/80 text-jfu-primary flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      {t('adsAwarenessPoint2Title')}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                      {t('adsAwarenessPoint2Desc')}
                    </p>
                  </div>
                </div>

                {/* Poin 3: Review Sebelum Penayangan */}
                <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50/70 border border-slate-100">
                  <div className="w-8 h-8 rounded-xl bg-white border border-slate-200/80 text-jfu-primary flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      {t('adsAwarenessPoint3Title')}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                      {t('adsAwarenessPoint3Desc')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tautan Syarat & Ketentuan */}
              <div className="text-center text-xs text-slate-500 pt-0.5">
                <span>{t('adsAwarenessTermsLink')}{' '}</span>
                <a
                  href="/homepage/terms-conditions.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-jfu-primary hover:text-jfu-dark underline inline-flex items-center"
                >
                  {t('termsConditions')}
                </a>
                <span>.</span>
              </div>

              {/* Checkbox Konfirmasi */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50/80 cursor-pointer transition-colors shadow-2xs select-none">
                <input
                  type="checkbox"
                  checked={hasAcknowledged}
                  onChange={(e) => setHasAcknowledged(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-jfu-primary focus:ring-jfu-primary cursor-pointer accent-jfu-primary"
                />
                <span className="text-xs font-medium text-slate-700 leading-relaxed">
                  {t('adsAwarenessCheckboxLabel')}
                </span>
              </label>

              {/* Tombol Lanjut ke Step 2 */}
              <button
                type="button"
                disabled={!hasAcknowledged}
                onClick={() => setStep(2)}
                className={`w-full py-3.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                  hasAcknowledged
                    ? 'bg-jfu-primary hover:bg-jfu-dark text-white shadow-md shadow-jfu-primary/20 cursor-pointer hover:-translate-y-0.5'
                    : 'bg-slate-100 text-slate-400 border border-slate-200/60 cursor-not-allowed'
                }`}
              >
                <span>{t('adsAwarenessContinueBtn')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Escape Hatch ke Riset Non-Survei */}
              <div className="pt-2 text-center border-t border-slate-100">
                <p className="text-xs text-slate-500 leading-relaxed">
                  {t('adsAwarenessNeedSpecificCta')}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      handleClose();
                      onOpenCustomMission?.();
                    }}
                    className="font-semibold text-jfu-primary hover:underline cursor-pointer inline-flex items-center gap-0.5"
                  >
                    <span>{t('adsAwarenessConsultMission')}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </p>
              </div>
            </div>
          ) : (
            /* ================= STEP 2: PILIH JALUR REVIEW ================= */
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Opsi 1: Review Otomatis (Google Forms) */}
              <div className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-xs hover:border-blue-200/90 transition-all">
                {/* Header Jalur Otomatis */}
                <div className="w-full flex items-center gap-3.5 px-4 sm:px-5 py-3.5 min-h-12 text-left bg-white">
                  <span className="w-10 h-10 rounded-xl inline-flex shrink-0 items-center justify-center bg-blue-50 text-jfu-primary border border-blue-100/80 shadow-2xs">
                    <Bot className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs sm:text-sm font-bold text-slate-900">
                      {t('reviewMethodAutoHint')}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs mt-0.5 leading-relaxed flex-wrap">
                      <Zap className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                      <span className="font-semibold text-emerald-600">{t('adsEntryAutoRowHighlight')}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500">{t('adsEntryAutoRowTime')}</span>
                    </span>
                  </div>
                </div>

                {/* Sub-opsi Google Form */}
                <div className="bg-slate-50/40 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      handleClose();
                      onSelectMethod('google');
                    }}
                    className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-blue-50/60 group transition-all cursor-pointer text-left"
                  >
                    <span className="w-8 h-8 rounded-lg inline-flex shrink-0 items-center justify-center bg-white border border-slate-200/80 shadow-2xs group-hover:border-blue-200">
                      {/* Logo Google */}
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1 text-xs sm:text-sm font-semibold text-slate-800 group-hover:text-jfu-primary transition-colors">
                      {t('reviewMethodAuto')}
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-jfu-primary group-hover:translate-x-0.5 transition-all" />
                  </button>
                </div>
              </div>

              {/* Opsi 2: Review Manual */}
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onSelectMethod('manual');
                }}
                className="w-full flex items-center gap-3.5 px-4 sm:px-5 py-3.5 min-h-12 border border-slate-200/90 rounded-2xl bg-white hover:bg-blue-50/40 hover:border-blue-200/90 transition-all shadow-xs group cursor-pointer text-left"
              >
                <span className="w-10 h-10 rounded-xl inline-flex shrink-0 items-center justify-center bg-slate-100/80 text-slate-600 border border-slate-200/70 group-hover:bg-blue-50 group-hover:text-jfu-primary group-hover:border-blue-100 transition-colors shadow-2xs">
                  <UserCheck className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-xs sm:text-sm font-bold text-slate-900 group-hover:text-jfu-primary transition-colors">
                    {t('reviewMethodManualHint')}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs mt-0.5 leading-relaxed flex-wrap text-slate-500">
                    <span>{t('adsEntryManualRowHighlight')}</span>
                    <span className="text-slate-300">·</span>
                    <span>{t('adsEntryManualRowTime')}</span>
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-jfu-primary group-hover:translate-x-0.5 transition-all" />
              </button>

              {/* CTA Form Builder */}
              <div className="pt-3 text-center border-t border-slate-100 mt-2">
                <p className="text-xs text-slate-500 leading-relaxed">
                  {t('jfuFormCtaLead')}{' '}
                  <Link
                    to="/dashboard/forms"
                    onClick={handleClose}
                    className="font-semibold text-jfu-primary hover:underline"
                  >
                    {t('jfuFormCtaAction')}
                  </Link>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
