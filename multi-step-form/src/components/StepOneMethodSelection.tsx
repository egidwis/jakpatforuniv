import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { Zap, CheckCircle2, Clock, Info, BarChart3, Smartphone, Tag, CalendarRange, Download, PenLine, ChevronRight } from 'lucide-react';
import { calculateAdCostPerDay } from '../utils/cost-calculator';

interface StepOneMethodSelectionProps {
  onSelectMethod: (method: 'google' | 'manual') => void;
}

/**
 * Pintu masuk produk Iklan Survei (/dashboard/submit-iklan) — layar pertama
 * flow submission. Bukan sekadar pemilih metode input: bagian atas
 * mengedukasi produknya (jangkauan, harga mulai, durasi) supaya user paham
 * apa yang dibeli sebelum memilih cara mengisi data survei.
 */
export function StepOneMethodSelection({ onSelectMethod }: StepOneMethodSelectionProps) {
  const { t } = useLanguage();

  // Harga mulai diturunkan dari kalkulator harga (tier terendah, ≤15
  // pertanyaan) — bukan string hardcode, supaya tidak desync dengan pricing.
  const startingPrice = new Intl.NumberFormat('id-ID').format(calculateAdCostPerDay(15));

  const facts = [
    { icon: Smartphone, label: t('adsEntryFactReach') },
    { icon: Tag, label: t('adsEntryFactPrice').replace('{price}', `Rp${startingPrice}`) },
    { icon: CalendarRange, label: t('adsEntryFactDuration') },
  ];

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header edukasi produk */}
      <div className="text-center mb-8">
        <span className="inline-flex w-14 h-14 rounded-2xl bg-jfu-primary/[0.08] text-jfu-primary items-center justify-center mb-4">
          <BarChart3 className="w-7 h-7" />
        </span>
        <h1 className="text-2xl md:text-3xl font-bold text-[#1a1a1a]">{t('productAdsTitle')}</h1>
        <p className="text-sm md:text-base text-[#666] mt-2 max-w-md mx-auto leading-relaxed">
          <span className="font-semibold text-jfu-primary">{t('productAdsHook')}</span>{' '}
          {t('productAdsDesc')}
        </p>

        {/* Fakta ringkas: jangkauan, harga mulai, durasi */}
        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {facts.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-jfu-primary/[0.15] bg-white px-3 py-1.5 text-xs font-medium text-[#444] shadow-sm"
            >
              <Icon className="w-3.5 h-3.5 text-jfu-primary shrink-0" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Pilihan metode input */}
      <div className="text-center mb-5">
        <h2 className="text-base md:text-lg font-bold text-[#1a1a1a]">{t('startByFillingData')}</h2>
        <p className="text-sm text-[#666] mt-1">{t('chooseMethodSuitable')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 items-stretch">
        {/* PRIMARY: Google Form Import */}
        <div className="relative flex flex-col rounded-2xl border-2 border-jfu-primary/40 bg-white p-5 shadow-card">
          <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-3 py-1 text-[10px] font-bold tracking-wide text-amber-950 shadow-sm">
            ⭐ {t('recommended')}
          </span>

          <span className="inline-flex w-11 h-11 rounded-xl bg-jfu-primary text-white items-center justify-center mb-4">
            <Zap className="w-5 h-5" />
          </span>

          <h3 className="text-base font-bold text-[#1a1a1a] mb-3">{t('googleFormImportTitle')}</h3>

          <ul className="space-y-2.5 mb-6">
            <li className="flex items-center gap-2.5 text-sm text-[#555]">
              <CheckCircle2 className="w-4 h-4 text-jfu-primary shrink-0" />
              {t('benefit100Accurate')}
            </li>
            <li className="flex items-center gap-2.5 text-sm font-semibold text-[#1a1a1a]">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
              {t('benefitAutoFill')}
            </li>
            <li className="flex items-center gap-2.5 text-sm text-[#555]">
              <Clock className="w-4 h-4 text-emerald-500 shrink-0" />
              {t('benefitSaveTime')}
            </li>
          </ul>

          <button
            onClick={() => onSelectMethod('google')}
            className="mt-auto w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-full font-semibold text-white bg-gradient-to-br from-jfu-primary to-jfu-light shadow-glow hover:-translate-y-0.5 transition-all"
          >
            <Download className="w-4 h-4" />
            {t('importFromGoogleForm')}
          </button>
        </div>

        {/* SECONDARY: Manual Input */}
        <div className="flex flex-col rounded-2xl border border-jfu-primary/[0.12] bg-white p-5 shadow-card">
          <span className="inline-flex w-11 h-11 rounded-xl bg-gray-100 text-gray-500 items-center justify-center mb-4">
            <PenLine className="w-5 h-5" />
          </span>

          <h3 className="text-base font-bold text-[#1a1a1a] mb-2">{t('manualFillTitle')}</h3>

          <p className="text-sm text-[#666] leading-relaxed">{t('manualFillDescription')}</p>

          <div className="flex items-center gap-1.5 mt-4 mb-4 text-jfu-primary/80 text-xs">
            <Info className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
            <span className="font-medium">{t('requiresAdminReview')}</span>
          </div>

          <button
            onClick={() => onSelectMethod('manual')}
            className="mt-auto w-full min-h-11 inline-flex items-center justify-center rounded-full font-semibold text-jfu-primary border border-jfu-primary/25 bg-white hover:bg-jfu-primary/[0.06] transition-colors"
          >
            {t('fillManually')}
          </button>
        </div>
      </div>

      {/* Cross-link edukasi Kilat */}
      <div className="text-center mt-8">
        <Link
          to="/dashboard/submit-kilat"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#666] hover:text-jfu-primary transition-colors"
        >
          <Zap className="w-4 h-4 text-amber-500" />
          {t('adsEntryKilatCrossLink')}
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
