import { useLanguage } from '../i18n/LanguageContext';

interface StepOneMethodSelectionProps {
  onSelectMethod: (method: 'google' | 'manual') => void;
}

export function StepOneMethodSelection({ onSelectMethod }: StepOneMethodSelectionProps) {
  const { t } = useLanguage();

  return (
    <div className="method-selection-container">
      {/* Page Title */}
      <div className="method-selection-header">
        <h1 className="method-selection-title">{t('startByFillingData')}</h1>
        <p className="method-selection-subtitle">
          {t('chooseMethodSuitable')}
        </p>
      </div>

      {/* Method Cards */}
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
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="15" y2="17" />
              </svg>
            </div>

            {/* Title */}
            <h2 className="method-card-title">{t('googleFormImportTitle')}</h2>

            {/* Description */}
            <p className="method-card-description">
              {t('googleFormImportDescription')}
            </p>

            {/* Benefits List */}
            <ul className="method-card-benefits">
              <li className="method-benefit-item">
                <svg className="benefit-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="benefit-text">{t('benefit100Accurate')}</span>
              </li>
              <li className="method-benefit-item">
                <svg className="benefit-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="benefit-text">{t('benefitAutoFill')}</span>
              </li>
              <li className="method-benefit-item">
                <svg className="benefit-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
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
          <div className="method-card-content">
            {/* Icon */}
            <div className="method-card-icon method-card-icon-secondary">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>

            {/* Title */}
            <h2 className="method-card-title">{t('manualFillTitle')}</h2>

            {/* Description */}
            <p className="method-card-description">
              {t('manualFillDescription')}
            </p>

            {/* CTA Button */}
            <button
              onClick={() => onSelectMethod('manual')}
              className="method-card-cta method-card-cta-secondary"
            >
              {t('fillManually')}
            </button>
          </div>
        </div>
      </div>

      {/* Info Notice */}
      <div className="method-selection-notice">
        <svg className="notice-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <p>{t('canChangeMethodLater')}</p>
      </div>
    </div>
  );
}
