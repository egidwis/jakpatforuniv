import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

interface MobileProgressBarProps {
  currentStep: number;
  steps: { number: number; title: string }[];
  totalCost: number;
  formatRupiah: (amount: number) => string;
}

export function MobileProgressBar({ currentStep, steps, totalCost, formatRupiah }: MobileProgressBarProps) {
  const { t } = useLanguage();
  const progressPercentage = ((currentStep - 1) / (steps.length - 1)) * 100;
  const currentStepTitle = steps.find(s => s.number === currentStep)?.title || '';

  return (
    <div className="mobile-progress-bar-compact">
      {/* App Header for Mobile */}
      <div className="mobile-app-header">
        <h2 className="mobile-app-title">{t('appTitle')}</h2>
        <p className="mobile-app-tagline">{t('appTagline')}</p>
      </div>

      {/* Divider */}
      <div className="mobile-header-divider"></div>

      {/* Step Title + Total Cost */}
      <div className="mobile-progress-header">
        <h3 className="mobile-step-title">{currentStepTitle}</h3>
        <div className="mobile-total-cost">
          Total: Rp{formatRupiah(totalCost)}
        </div>
      </div>

      {/* Progress Track with Dots */}
      <div className="mobile-progress-track">
        <div
          className="mobile-progress-fill"
          style={{ width: `${progressPercentage}%` }}
        />
        <div className="mobile-progress-dots">
          {steps.map((step) => {
            const isCompleted = currentStep > step.number;
            const isActive = currentStep === step.number;

            return (
              <div
                key={step.number}
                className={`mobile-progress-dot ${
                  isActive ? 'active' : isCompleted ? 'completed' : ''
                }`}
                style={{ left: `${((step.number - 1) / (steps.length - 1)) * 100}%` }}
              >
                {isCompleted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="mobile-dot-check" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span className="mobile-dot-number">{step.number}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
