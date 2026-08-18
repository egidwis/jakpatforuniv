import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { Zap, CheckCircle2, Clock, Info, Sparkles } from 'lucide-react';

interface StepOneMethodSelectionProps {
  onSelectMethod: (method: 'google' | 'manual') => void;
}

// Value proposition JFU Form yang bergantian di promo bar bawah
const JFU_FORM_VALUE_PROPS = [
  'alternatif Qualtrics & SurveyMonkey',
  'tinggal chat, AI yang susunin pertanyaannya',
  'survei bisa "loncat" otomatis sesuai jawaban'
];

export function StepOneMethodSelection({ onSelectMethod }: StepOneMethodSelectionProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [valuePropIndex, setValuePropIndex] = useState(0);
  const [isValuePropVisible, setIsValuePropVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsValuePropVisible(false);
      setTimeout(() => {
        setValuePropIndex(prev => (prev + 1) % JFU_FORM_VALUE_PROPS.length);
        setIsValuePropVisible(true);
      }, 300);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="method-selection-container">
      {/* Page Title */}
      <div className="method-selection-header">
        <h1 className="method-selection-title text-2xl font-semibold text-gray-900">{t('startByFillingData')}</h1>
        <p className="method-selection-subtitle text-sm text-gray-500 mt-1">
          {t('chooseMethodSuitable')}
        </p>
      </div>

      <div className="method-cards-grid">
        {/* PRIMARY: Google Form Import */}
        <div className="method-card method-card-primary">
          {/* Recommended Badge */}
          <div className="method-card-badge">
            <span className="badge-icon">⭐</span>
            <span className="badge-text">{t('recommended')}</span>
          </div>

          {/* Card Content */}
          <div className="method-card-content">
            {/* Icon */}
            <div className="method-card-icon method-card-icon-primary">
              <Zap size={32} />
            </div>

            {/* Title */}
            <h2 className="method-card-title text-lg font-semibold mt-4 mb-6">{t('googleFormImportTitle')}</h2>

            {/* Benefits List */}
            <ul className="method-card-benefits space-y-3 mb-8">
              <li className="method-benefit-item flex items-center gap-2.5 text-sm text-gray-600">
                <CheckCircle2 className="benefit-icon text-blue-500 flex-shrink-0" size={18} />
                <span className="benefit-text">{t('benefit100Accurate')}</span>
              </li>
              <li className="method-benefit-item flex items-center gap-2.5 text-sm text-gray-600">
                <Zap className="benefit-icon text-amber-500 flex-shrink-0" size={18} />
                <span className="benefit-text font-medium text-gray-900">{t('benefitAutoFill')}</span>
              </li>
              <li className="method-benefit-item flex items-center gap-2.5 text-sm text-gray-600">
                <Clock className="benefit-icon text-emerald-500 flex-shrink-0" size={18} />
                <span className="benefit-text">{t('benefitSaveTime')}</span>
              </li>
            </ul>

            {/* CTA Button */}
            <button
              onClick={() => onSelectMethod('google')}
              className="method-card-cta method-card-cta-primary"
            >
              <svg className="cta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 16a4 4 0 0 1-.88-7.903A5 5 0 1 1 15.9 6L16 6a5 5 0 0 1 1 9.9M9 19l3 3m0 0l3-3m-3 3v-7" />
              </svg>
              {t('importFromGoogleForm')}
            </button>
          </div>
        </div>

        {/* SECONDARY: Manual Input */}
        <div className="method-card method-card-secondary">
          {/* Card Content */}
          <div className="method-card-content flex flex-col items-start text-left h-full">
            {/* Icon */}
            <div className="method-card-icon method-card-icon-secondary">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>

            {/* Title */}
            <h2 className="method-card-title text-lg font-semibold mt-4 mb-2">{t('manualFillTitle')}</h2>

            {/* Description */}
            <p className="method-card-description text-sm text-gray-500 text-left leading-relaxed mb-auto">
              {t('manualFillDescription')}
            </p>

            {/* Admin Review Info - Left Aligned */}
            <div className="flex items-center gap-1.5 mt-8 mb-4 text-blue-600/80 text-xs">
              <Info size={12} strokeWidth={2.5} />
              <span className="font-medium">{t('requiresAdminReview')}</span>
            </div>

            {/* CTA Button */}
            <button
              onClick={() => onSelectMethod('manual')}
              className="method-card-cta method-card-cta-secondary w-full"
            >
              {t('fillManually')}
            </button>
          </div>
        </div>
      </div>

      {/* JFU Form Builder Promo Bar */}
      <button
        type="button"
        onClick={() => navigate('/dashboard/forms')}
        className="w-full flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-sm font-semibold rounded-full px-5 py-3 shadow-md shadow-indigo-500/20 transition-all"
      >
        <Sparkles className="w-4 h-4 shrink-0" />
        <span className="whitespace-nowrap">Bikin survei baru? Coba JFU Form —</span>
        <span
          className={`transition-opacity duration-300 ${isValuePropVisible ? 'opacity-100' : 'opacity-0'}`}
        >
          {JFU_FORM_VALUE_PROPS[valuePropIndex]}
        </span>
        <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wide">
          Gratis
        </span>
      </button>

      {/* Info Notice removed - moved to subtitle */}
    </div>
  );
}
