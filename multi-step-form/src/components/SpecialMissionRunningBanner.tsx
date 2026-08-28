import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { CustomMissionModal } from './CustomMissionModal';

export const SpecialMissionRunningBanner: React.FC = () => {
  const { t } = useLanguage();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const marqueeItem = (
    <div className="flex items-center text-xs font-medium text-slate-700 shrink-0">
      <span>
        {t('specialMissionBannerPart1')}{' '}
        <strong className="text-slate-900 font-bold">{t('specialMissionBannerMysteryShopping')}</strong>,{' '}
        <strong className="text-slate-900 font-bold">{t('specialMissionBannerAppTesting')}</strong>,{' '}
        <strong className="text-slate-900 font-bold">{t('specialMissionBannerProductTasting')}</strong>,{' '}
        {t('specialMissionBannerOr')}{' '}
        <strong className="text-slate-900 font-bold">{t('specialMissionBannerValidation')}</strong>
      </span>
      <span className="text-pink-300 mx-4 select-none">•</span>
    </div>
  );

  return (
    <>
      <div
        onClick={() => setIsModalOpen(true)}
        className="w-full bg-gradient-to-r from-pink-50/95 via-rose-50 to-pink-50/95 text-slate-800 border-b border-pink-200/80 overflow-hidden cursor-pointer group py-2 relative z-30 transition-all hover:bg-pink-50/80 select-none"
        title={t('specialMissionTooltip')}
      >
        <div className="max-w-5xl mx-auto px-4 md:px-6 flex items-center gap-3 sm:gap-4">
          {/* Static Left Label */}
          <div className="flex items-center text-pink-700 font-extrabold text-xs uppercase tracking-wide shrink-0">
            <span>{t('specialMissionLabel')}:</span>
          </div>

          {/* Running Marquee in the Middle */}
          <div className="flex-1 overflow-hidden relative min-w-0">
            <div className="animate-marquee items-center whitespace-nowrap">
              {marqueeItem}
              {marqueeItem}
              {marqueeItem}
              {marqueeItem}
            </div>
          </div>

          {/* Static Right Action Button */}
          <div className="flex items-center shrink-0">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-pink-600 group-hover:bg-pink-700 text-white font-bold text-[11px] transition-all shadow-xs cursor-pointer whitespace-nowrap">
              <span>{t('specialMissionApply')}</span>
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
        </div>
      </div>

      <CustomMissionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};



