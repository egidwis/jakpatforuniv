import React, { useState } from 'react';
import { Target, Sparkles, ArrowRight } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { CustomMissionModal } from './CustomMissionModal';

export const SpecialMissionRunningBanner: React.FC = () => {
  const { t } = useLanguage();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const bannerText = (
    <div className="flex items-center gap-6 text-xs text-slate-700 font-medium">
      <span className="flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-pink-500 fill-pink-500 shrink-0" />
        <span>
          {t('specialMissionBannerPart1')}{' '}
          <strong>{t('specialMissionBannerMysteryShopping')}</strong>,{' '}
          <strong>{t('specialMissionBannerAppTesting')}</strong>,{' '}
          <strong>{t('specialMissionBannerProductTasting')}</strong>,{' '}
          {t('specialMissionBannerOr')}{' '}
          <strong>{t('specialMissionBannerValidation')}</strong>?
        </span>
      </span>
      <span className="text-pink-300 text-xs select-none">•</span>
    </div>
  );

  return (
    <>
      <div
        onClick={() => setIsModalOpen(true)}
        className="w-full bg-gradient-to-r from-pink-50/95 via-rose-50 to-pink-50/95 text-slate-800 border-b border-pink-200/80 overflow-hidden cursor-pointer group py-1.5 relative z-30 transition-all hover:bg-pink-50/80 select-none"
        title={t('specialMissionTooltip')}
      >
        <div className="max-w-5xl mx-auto px-4 md:px-6 flex items-center gap-3">
          {/* Left Static Label */}
          <div className="hidden sm:flex items-center gap-1.5 text-pink-700 text-[11px] font-extrabold uppercase tracking-wider shrink-0">
            <Target className="w-3.5 h-3.5 text-pink-600" />
            <span>{t('specialMissionLabel')}</span>
          </div>

          {/* Running Marquee Container */}
          <div className="flex-1 overflow-hidden relative">
            <div className="animate-marquee flex items-center gap-6 whitespace-nowrap">
              {bannerText}
              {bannerText}
              {bannerText}
              {bannerText}
            </div>
          </div>

          {/* Right Static Action Button */}
          <div className="flex items-center shrink-0">
            <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-pink-600 group-hover:bg-pink-700 text-white font-bold text-[11px] transition-all shadow-xs cursor-pointer">
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
