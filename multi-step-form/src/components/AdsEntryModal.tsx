import React, { useState, useEffect } from 'react';
import {
  X,
  Radio,
  Users,
  Clock,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { RateNoticeBlock } from './RateNotice';

export interface AdsEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  onOpenCustomMission?: () => void;
}

/**
 * Pintu masuk iklan survei: hanya penjelasan mekanisme tayang, tarif, dan
 * persetujuan. Pilihan sumber kuesioner hidup di kartu Informasi Survey.
 */
export const AdsEntryModal: React.FC<AdsEntryModalProps> = ({
  isOpen,
  onClose,
  onContinue,
  onOpenCustomMission,
}) => {
  const { t } = useLanguage();
  const [hasAcknowledged, setHasAcknowledged] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setHasAcknowledged(false);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6 md:p-8 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-t-3xl sm:rounded-3xl border border-gray-100 shadow-2xl w-full sm:max-w-xl max-h-[92vh] sm:max-h-[86vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        <div className="px-5 sm:px-7 py-4 sm:py-4.5 border-b border-gray-100 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-jfu-primary text-white flex items-center justify-center shadow-md shadow-jfu-primary/25 shrink-0">
              <Radio className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-gray-900 leading-tight truncate">
                {t('adsAwarenessModalTitle')}
              </h2>
              <p className="text-[11px] sm:text-xs text-gray-500 truncate mt-0.5">
                {t('adsAwarenessModalSubtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closePopup')}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer shrink-0 ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 sm:px-7 py-5 sm:py-6 flex-1 min-h-0 overscroll-contain">
          <ul className="space-y-6">
            <li className="flex items-start gap-2.5">
              <Users className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" aria-hidden />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">{t('adsAwarenessPoint1Title')}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{t('adsAwarenessPoint1Desc')}</p>
              </div>
            </li>
            <li className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" aria-hidden />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">{t('adsAwarenessPoint2Title')}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{t('adsAwarenessPoint2Desc')}</p>
              </div>
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" aria-hidden />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">{t('adsAwarenessPoint3Title')}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{t('adsAwarenessPoint3Desc')}</p>
              </div>
            </li>
          </ul>
          <div className="mt-6">
            <RateNoticeBlock />
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white px-5 sm:px-7 pt-4 pb-5 space-y-3">
          <label className="flex items-start gap-3 py-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasAcknowledged}
              onChange={(e) => setHasAcknowledged(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-jfu-primary focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 cursor-pointer accent-jfu-primary"
            />
            <span className="text-sm leading-relaxed text-slate-700">
              {t('adsAwarenessCheckboxLabel')}
            </span>
          </label>

          <button
            type="button"
            disabled={!hasAcknowledged}
            onClick={onContinue}
            className={`w-full py-3.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 ${
              hasAcknowledged
                ? 'bg-jfu-primary hover:bg-jfu-dark text-white cursor-pointer'
                : 'bg-slate-100 text-slate-600 cursor-not-allowed'
            }`}
          >
            <span>{t('adsAwarenessContinueBtn')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-center text-xs leading-relaxed text-slate-500">
            {t('adsAwarenessNeedSpecificCta')}{' '}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCustomMission?.();
              }}
              className="font-medium text-jfu-primary underline decoration-jfu-primary/40 underline-offset-2 hover:decoration-jfu-primary cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary"
            >
              {t('adsAwarenessConsultMission')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
