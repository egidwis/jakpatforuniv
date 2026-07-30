import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bot, ChevronDown, ChevronRight, Download, UserCheck, Zap } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem } from '@/components/ui/accordion';
import { InfoTooltip } from '@/components/status/InfoTooltip';
import { useLanguage } from '../i18n/LanguageContext';

interface StepOneMethodSelectionProps {
  onSelectMethod: (method: 'google' | 'manual') => void;
}

/**
 * Body "pilih jalur review" dari kartu pintu-masuk Iklan Survei — dirender
 * di dalam `AdsFlowCard` (cap biru + footer disclaimer T&C ada di sana, lihat
 * doc comment-nya untuk alasan gradien/kontras & kenapa disclaimer wajib ada).
 *
 * Dua keputusan desain khusus file ini:
 * 1. Level atas = METODE REVIEW (otomatis vs admin), sumber form turun jadi
 *    anak accordion. Metode di halaman ini memang menentukan jalur review, jadi
 *    judulnya langsung menyebut itu — tidak perlu chip yang mengulang judul.
 *    Istilahnya reuse dari order card (lihat ReviewMethodChip di
 *    status/ReviewPhase.tsx) supaya konsisten sampai user melihat statusnya.
 * 2. Subtitle kedua baris WAJIB menyebut sumber form. Tanpa itu user Typeform
 *    menekan "Review otomatis", tidak menemukan Typeform di dalamnya, lalu
 *    mundur — dead-end yang sengaja dicegah saat struktur ini dipilih.
 *
 * Belum ada AI di jalur review (parser deterministik + regex PII), jadi tidak
 * ada label "oleh AI" di sini. Harga juga sengaja tidak ditampilkan — angkanya
 * bisa basi dan acuan "maks 15 pertanyaan" gampang disalahartikan jadi batas
 * keras; harga muncul di checkout.
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
        {/* Jalur 1: review otomatis — accordion ber-border rounded */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="auto" className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            <AccordionPrimitive.Header className="flex">
              <AccordionPrimitive.Trigger className={`${rowBase} hover:bg-jfu-primary/[0.04] [&[data-state=open]>svg]:rotate-180`}>
                <span className={`${iconBoxTop} bg-jfu-primary/[0.08] text-jfu-primary`}>
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
                <ChevronDown className="w-4 h-4 shrink-0 text-jfu-primary/50 transition-transform duration-200" />
              </AccordionPrimitive.Trigger>
            </AccordionPrimitive.Header>

            <AccordionContent className="pb-0 pt-0 bg-gray-50/50 border-t border-gray-100 divide-y divide-gray-100">
              <button
                type="button"
                onClick={() => onSelectMethod('google')}
                className={`${rowBase} pl-10 md:pl-12 hover:bg-jfu-primary/[0.04]`}
              >
                <span className={`${iconBoxChild} bg-jfu-primary/[0.08] text-jfu-primary`}>
                  <Download className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-[#1a1a1a]">{t('reviewMethodAuto')}</span>
                <ChevronRight className="w-4 h-4 shrink-0 text-jfu-primary/50" />
              </button>

              <div aria-disabled="true" className={`${rowBase} pl-10 md:pl-12`}>
                <span className={`${iconBoxChild} bg-gray-100 text-gray-400`}>
                  <Download className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-500">{t('msFormsImportTitle')}</span>
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                    {t('comingSoon')}
                  </span>
                </span>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Jalur 2: review admin — tombol ber-border rounded */}
        <button
          type="button"
          onClick={() => onSelectMethod('manual')}
          className={`${rowBase} border border-gray-200 rounded-xl bg-white hover:bg-jfu-primary/[0.04] transition-colors`}
        >
          <span className={`${iconBoxTop} bg-gray-100 text-gray-500`}>
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

      <div className="mt-5 pt-4 border-t border-gray-100 flex justify-center">
        <Link
          to="/dashboard"
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-500" />
          <span>{t('backToOrders')}</span>
        </Link>
      </div>
    </>
  );
}
