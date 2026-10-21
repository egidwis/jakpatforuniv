import React, { useState, useEffect } from 'react';
import {
  X,
  Radio,
  Users,
  Clock,
  ShieldCheck,
  ArrowRight,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import { RateNoticeBlock } from './RateNotice';
import { KilatRateBlock } from './KilatRateTable';

export interface AdsEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  /**
   * Produk yang sedang dibuka pintunya. Kilat memakai cangkang yang sama
   * (Phase 5 §5.6) — yang berbeda hanya tiga poin mekanisme, tabel tarif, dan
   * kalimat persetujuannya.
   */
  product?: 'ads' | 'kilat';
}

/**
 * Warna produk, selaras kartu produk di dashboard (Iklan biru, Kilat amber).
 * Hanya modal ini yang berwarna per produk — formulir order di belakangnya
 * tetap biru; penanda khas Kilat di dalamnya (pemilih gelombang, kartu
 * Gelombang di Ringkasan) sudah amber sendiri.
 */
type Tone = {
  headerTile: string;
  pointTile: string;
  checkbox: string;
  cta: string;
};

const TONE: Record<'ads' | 'kilat', Tone> = {
  ads: {
    headerTile: 'bg-jfu-primary text-white shadow-md shadow-jfu-primary/25',
    pointTile: 'bg-jfu-primary/10 text-jfu-primary',
    checkbox: 'text-jfu-primary accent-jfu-primary focus-visible:ring-jfu-primary',
    cta: 'bg-jfu-primary hover:bg-jfu-dark focus-visible:ring-jfu-primary',
  },
  kilat: {
    headerTile: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-orange-500/25',
    pointTile: 'bg-amber-50 text-amber-600',
    checkbox: 'text-amber-600 accent-amber-600 focus-visible:ring-amber-600',
    cta: 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-600',
  },
};

type Copy = {
  icon: typeof Radio;
  title: TranslationKey;
  subtitle: TranslationKey;
  points: Array<{ icon: typeof Users; title: TranslationKey; desc: TranslationKey }>;
  checkbox: TranslationKey;
  cta: TranslationKey;
};

/**
 * Tiga poin per produk = hal yang paling sering ditanyakan peneliti ke admin.
 * Sengaja setara (tanpa kartu yang disorot): ketiganya sama pentingnya, jadi
 * yang dijaga adalah keterbacaan, bukan hierarki.
 */
const COPY: Record<'ads' | 'kilat', Copy> = {
  ads: {
    icon: Radio,
    title: 'adsAwarenessModalTitle',
    subtitle: 'adsAwarenessModalSubtitle',
    points: [
      { icon: Users, title: 'adsAwarenessPoint1Title', desc: 'adsAwarenessPoint1Desc' },
      { icon: Clock, title: 'adsAwarenessPoint2Title', desc: 'adsAwarenessPoint2Desc' },
      { icon: ShieldCheck, title: 'adsAwarenessPoint3Title', desc: 'adsAwarenessPoint3Desc' },
    ],
    checkbox: 'adsAwarenessCheckboxLabel',
    cta: 'adsAwarenessContinueBtn',
  },
  kilat: {
    icon: Zap,
    title: 'kilatEntryModalTitle',
    subtitle: 'kilatEntryModalSubtitle',
    points: [
      // Sama dengan Iklan: tiga hal yang paling sering ditanyakan, konteksnya push.
      { icon: Users, title: 'kilatEntryPoint1Title', desc: 'kilatEntryPoint1Desc' },
      { icon: Clock, title: 'kilatEntryPoint2Title', desc: 'kilatEntryPoint2Desc' },
      { icon: ShieldCheck, title: 'kilatEntryPoint3Title', desc: 'kilatEntryPoint3Desc' },
    ],
    checkbox: 'kilatEntryCheckboxLabel',
    cta: 'kilatEntryContinueBtn',
  },
};

/**
 * Pintu masuk iklan survei: hanya penjelasan mekanisme tayang, tarif, dan
 * persetujuan. Pilihan sumber kuesioner hidup di kartu Informasi Survey.
 */
export const AdsEntryModal: React.FC<AdsEntryModalProps> = ({
  isOpen,
  onClose,
  onContinue,
  product = 'ads',
}) => {
  const { t } = useLanguage();
  const copy = COPY[product];
  const tone = TONE[product];
  const HeaderIcon = copy.icon;
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
      <div className="bg-white rounded-t-3xl sm:rounded-3xl border border-gray-100 shadow-2xl w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[86vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        <div className="px-5 sm:px-7 py-4 sm:py-4.5 border-b border-gray-100 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center shrink-0 ${tone.headerTile}`}>
              <HeaderIcon className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-gray-900 leading-tight truncate">
                {t(copy.title)}
              </h2>
              <p className="text-[11px] sm:text-xs text-gray-500 truncate mt-0.5">
                {t(copy.subtitle)}
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
          <ul className="flex [flex-direction:column] gap-3 sm:[display:grid] sm:[grid-template-columns:repeat(3,minmax(0,1fr))]">
            {copy.points.map(({ icon: Icon, title, desc }) => (
              <li
                key={title}
                className="flex items-start gap-3.5 sm:[flex-direction:column] sm:gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone.pointTile}`}
                  aria-hidden
                >
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold leading-snug tracking-tight text-slate-900">{t(title)}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{t(desc)}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            {product === 'kilat' ? <KilatRateBlock /> : <RateNoticeBlock />}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white px-5 sm:px-7 pt-4 pb-5 space-y-3">
          <label className="flex items-start gap-3 py-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasAcknowledged}
              onChange={(e) => setHasAcknowledged(e.target.checked)}
              className={`mt-0.5 size-4 shrink-0 rounded border-slate-300 focus-visible:ring-2 focus-visible:ring-offset-2 cursor-pointer ${tone.checkbox}`}
            />
            <span className="text-sm leading-relaxed text-slate-700">
              {t(copy.checkbox)}
            </span>
          </label>

          <button
            type="button"
            disabled={!hasAcknowledged}
            onClick={onContinue}
            className={`w-full py-3.5 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              hasAcknowledged
                ? `${tone.cta} text-white cursor-pointer`
                : 'bg-slate-100 text-slate-600 cursor-not-allowed'
            }`}
          >
            <span>{t(copy.cta)}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
