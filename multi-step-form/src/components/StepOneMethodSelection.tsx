import { Bot, ChevronRight, UserCheck, Zap } from 'lucide-react';
import { InfoTooltip } from '@/components/status/InfoTooltip';
import { useLanguage } from '../i18n/LanguageContext';

interface StepOneMethodSelectionProps {
  onSelectMethod: (method: 'google' | 'manual') => void;
}

/**
 * Body "pilih jalur review" dari kartu pintu-masuk Iklan Survei — dirender
 * di dalam `AdsFlowCard` (cap biru + footer disclaimer T&C ada di sana, lihat
 * doc comment-nya untuk alasan gradien/kontras & kenapa disclaimer wajib ada).
 */
export function StepOneMethodSelection({ onSelectMethod }: StepOneMethodSelectionProps) {
  const { t } = useLanguage();

  const reviewNoteTooltipContent = (
    <span className="leading-relaxed">
      {t('adsEntryReviewNotePart1')}{' '}
      <a
        href="/homepage/terms-conditions.html"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-gray-200"
      >
        {t('termsConditions')}
      </a>
      {t('adsEntryReviewNotePart2')}
    </span>
  );

  const rowBase = 'w-full flex items-center gap-3 px-4 md:px-5 py-3.5 min-h-11 text-left transition-colors';
  const iconBox = 'inline-flex shrink-0 items-center justify-center';
  const iconBoxTop = `${iconBox} w-11 h-11 rounded-xl`;
  const iconBoxChild = `${iconBox} w-9 h-9 rounded-lg`;

  return (
    <>
      <div className="flex items-center gap-0.5">
        <h2 className="text-base md:text-lg font-bold text-[#1a1a1a]">{t('adsEntryMethodQuestion')}</h2>
        <InfoTooltip content={reviewNoteTooltipContent} />
      </div>

      <div className="mt-3.5 flex flex-col gap-3">
        {/* Jalur 1: review otomatis — box ber-border rounded dengan sub-opsi terbuka */}
        <div className="border border-gray-300 rounded-xl overflow-hidden bg-white shadow-2xs">
          {/* Header Jalur Otomatis */}
          <div className={`${rowBase} bg-white`}>
            <span className={`${iconBoxTop} bg-blue-50 text-jfu-primary border border-blue-100`}>
              <Bot className="w-5 h-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[#1a1a1a]">{t('reviewMethodAutoHint')}</span>
              <span className="flex items-center gap-1 text-xs mt-0.5 leading-relaxed flex-wrap">
                <Zap className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                <span className="font-semibold text-emerald-600">{t('adsEntryAutoRowHighlight')}</span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-500">{t('adsEntryAutoRowTime')}</span>
              </span>
            </span>
          </div>

          {/* Sub-opsi platform Google & Microsoft */}
          <div className="bg-gray-50/60 border-t border-gray-200 divide-y divide-gray-200">
            <button
              type="button"
              onClick={() => onSelectMethod('google')}
              className={`${rowBase} pl-10 md:pl-12 hover:bg-jfu-primary/[0.04] group transition-colors`}
            >
              <span className={`${iconBoxChild} bg-white border border-gray-200 shadow-2xs group-hover:border-blue-200`}>
                {/* Logo Google */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-[#1a1a1a]">{t('reviewMethodAuto')}</span>
              <ChevronRight className="w-4 h-4 shrink-0 text-jfu-primary/50 group-hover:text-jfu-primary transition-colors" />
            </button>

            <div aria-disabled="true" className={`${rowBase} pl-10 md:pl-12 opacity-80`}>
              <span className={`${iconBoxChild} bg-white border border-gray-200 shadow-2xs`}>
                {/* Logo Microsoft */}
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 21 21">
                  <path fill="#f25022" d="M1 1h9v9H1z" />
                  <path fill="#00a4ef" d="M1 11h9v9H1z" />
                  <path fill="#7fba00" d="M11 1h9v9h-9z" />
                  <path fill="#ffb900" d="M11 11h9v9h-9z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-500">{t('msFormsImportTitle')}</span>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                  {t('comingSoon')}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Jalur 2: review admin — tombol ber-border rounded */}
        <button
          type="button"
          onClick={() => onSelectMethod('manual')}
          className={`${rowBase} border border-gray-300 rounded-xl bg-white hover:bg-jfu-primary/[0.04] hover:border-gray-400 transition-all shadow-2xs`}
        >
          <span className={`${iconBoxTop} bg-gray-100 text-gray-600 border border-gray-200`}>
            <UserCheck className="w-5 h-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-[#1a1a1a]">{t('reviewMethodManualHint')}</span>
            <span className="flex items-center gap-1 text-xs mt-0.5 leading-relaxed flex-wrap text-gray-500">
              <span>{t('adsEntryManualRowHighlight')}</span>
              <span className="text-gray-300">·</span>
              <span>{t('adsEntryManualRowTime')}</span>
            </span>
          </span>
          <ChevronRight className="w-4 h-4 shrink-0 text-gray-400" />
        </button>
      </div>
    </>
  );
}
