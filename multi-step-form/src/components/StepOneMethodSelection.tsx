import { Link } from 'react-router-dom';
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

  const rowBase = 'w-full flex items-center gap-3.5 px-4 md:px-5 py-3.5 min-h-12 text-left transition-all';
  const iconBox = 'inline-flex shrink-0 items-center justify-center';
  const iconBoxTop = `${iconBox} w-10 h-10 rounded-xl`;
  const iconBoxChild = `${iconBox} w-8 h-8 rounded-lg`;

  return (
    <>
      <div className="flex items-center gap-1.5 mb-1">
        <h2 className="text-base md:text-lg font-bold text-slate-900">{t('adsEntryMethodQuestion')}</h2>
        <InfoTooltip content={reviewNoteTooltipContent} />
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {/* Jalur 1: review otomatis — box ber-border rounded dengan sub-opsi terbuka */}
        <div className="border border-slate-200/90 rounded-xl overflow-hidden bg-white shadow-xs hover:border-blue-200/80 transition-all">
          {/* Header Jalur Otomatis */}
          <div className={`${rowBase} bg-white`}>
            <span className={`${iconBoxTop} bg-blue-50 text-jfu-primary border border-blue-100/80 shadow-2xs`}>
              <Bot className="w-5 h-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-slate-900">{t('reviewMethodAutoHint')}</span>
              <span className="flex items-center gap-1.5 text-xs mt-0.5 leading-relaxed flex-wrap">
                <Zap className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                <span className="font-semibold text-emerald-600">{t('adsEntryAutoRowHighlight')}</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-500">{t('adsEntryAutoRowTime')}</span>
              </span>
            </span>
          </div>

          {/* Sub-opsi platform Google & Microsoft */}
          <div className="bg-slate-50/40 border-t border-slate-100 divide-y divide-slate-100">
            <button
              type="button"
              onClick={() => onSelectMethod('google')}
              className={`${rowBase} pl-4 md:pl-5 hover:bg-blue-50/50 group transition-all cursor-pointer`}
            >
              <span className={`${iconBoxChild} bg-white border border-slate-200/80 shadow-2xs group-hover:border-blue-200`}>
                {/* Logo Google */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800 group-hover:text-jfu-primary transition-colors">{t('reviewMethodAuto')}</span>
              <ChevronRight className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-jfu-primary group-hover:translate-x-0.5 transition-all" />
            </button>

            <div aria-disabled="true" className={`${rowBase} pl-4 md:pl-5 opacity-75 select-none`}>
              <span className={`${iconBoxChild} bg-white border border-slate-200/80 shadow-2xs`}>
                {/* Logo Microsoft */}
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 21 21">
                  <path fill="#f25022" d="M1 1h9v9H1z" />
                  <path fill="#00a4ef" d="M1 11h9v9H1z" />
                  <path fill="#7fba00" d="M11 1h9v9h-9z" />
                  <path fill="#ffb900" d="M11 11h9v9h-9z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-500">{t('msFormsImportTitle')}</span>
                <span className="rounded-full border border-slate-200/80 bg-slate-100/80 px-2 py-0.5 text-[10px] font-bold text-slate-500">
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
          className={`${rowBase} border border-slate-200/90 rounded-xl bg-white hover:bg-blue-50/30 hover:border-blue-200/80 transition-all shadow-xs group cursor-pointer`}
        >
          <span className={`${iconBoxTop} bg-slate-100/80 text-slate-600 border border-slate-200/70 group-hover:bg-blue-50 group-hover:text-jfu-primary group-hover:border-blue-100 transition-colors shadow-2xs`}>
            <UserCheck className="w-5 h-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900 group-hover:text-jfu-primary transition-colors">{t('reviewMethodManualHint')}</span>
            <span className="flex items-center gap-1.5 text-xs mt-0.5 leading-relaxed flex-wrap text-slate-500">
              <span>{t('adsEntryManualRowHighlight')}</span>
              <span className="text-slate-300">·</span>
              <span>{t('adsEntryManualRowTime')}</span>
            </span>
          </span>
          <ChevronRight className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-jfu-primary group-hover:translate-x-0.5 transition-all" />
        </button>

        {/* Ajakan Form Builder di dalam card */}
        <div className="pt-2 text-center border-t border-slate-100 mt-1">
          <p className="text-xs text-slate-500 leading-relaxed">
            {t('jfuFormCtaLead')}{' '}
            <Link
              to="/dashboard/forms"
              className="font-semibold text-jfu-primary hover:underline"
            >
              {t('jfuFormCtaAction')}
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
