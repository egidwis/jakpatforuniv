import React, { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import type { SurveyFormData, CostCalculation } from '../types';

interface MobileProgressBarProps {
  currentStep: number;
  steps: { number: number; title: string }[];
  totalCost: number;
  formatRupiah: (amount: number) => string;
  formData?: SurveyFormData;
  costCalculation?: CostCalculation;
}

export function MobileProgressBar({
  currentStep,
  steps,
  totalCost,
  formatRupiah,
  formData,
  costCalculation
}: MobileProgressBarProps) {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
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

      {/* Step Title + Progress Track with Dots */}
      <div className="mobile-progress-with-title">
        <h3 className="mobile-step-title">{currentStepTitle}</h3>
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

      {/* Divider between progress and total */}
      <div className="mobile-progress-divider"></div>

      {/* Total Cost with Chevron (Clickable if formData exists) */}
      {formData && costCalculation ? (
        <button
          className="mobile-total-cost-header clickable"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
        >
          <div className="mobile-total-cost-label">Total Biaya</div>
          <div className="mobile-total-cost-amount-wrapper">
            <span className="mobile-total-cost-amount">Rp{formatRupiah(totalCost)}</span>
            <svg
              className={`mobile-cost-chevron ${isExpanded ? 'expanded' : ''}`}
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path
                d="M5 7.5L10 12.5L15 7.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </button>
      ) : (
        <div className="mobile-total-cost-header">
          <div className="mobile-total-cost-label">Total Biaya</div>
          <div className="mobile-total-cost-amount">Rp{formatRupiah(totalCost)}</div>
        </div>
      )}

      {/* Collapsible Cost Breakdown - Only show if expanded */}
      {formData && costCalculation && isExpanded && (
        <div className="mobile-cost-breakdown">
          <div className="mobile-cost-formula">
            <span>{formData.questionCount} pertanyaan × {formData.duration} (hari)</span>
            <span>+ Insentif responden</span>
          </div>

          <div className="mobile-cost-items">
            <div className="mobile-cost-row">
              <span>Ad Cost</span>
              <span>Rp {formatRupiah(costCalculation.adCost)}</span>
            </div>
            <div className="mobile-cost-row">
              <span>Incentive</span>
              <span>Rp {formatRupiah(costCalculation.incentiveCost)}</span>
            </div>
            {costCalculation.discount > 0 && (
              <div className="mobile-cost-row discount">
                <span>Discount</span>
                <span>- Rp {formatRupiah(costCalculation.discount)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
