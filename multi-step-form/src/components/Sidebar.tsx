import { useEffect, useState } from 'react';
import type { SurveyFormData, CostCalculation } from '../types';
import { calculateTotalCost } from '../utils/cost-calculator';
import { MobileProgressBar } from './MobileProgressBar';
import { SidebarHeader } from './SidebarHeader';
import { useLanguage } from '../i18n/LanguageContext';

interface SidebarProps {
  currentStep: number;
  formData: SurveyFormData;
}

export function Sidebar({ currentStep, formData }: SidebarProps) {
  const { t } = useLanguage();
  const [costCalculation, setCostCalculation] = useState<CostCalculation>({
    adCost: 0,
    incentiveCost: 0,
    discount: 0,
    totalCost: 0
  });

  // Hitung biaya saat form data berubah - hanya field yang relevan
  useEffect(() => {
    const calculation = calculateTotalCost(formData);
    setCostCalculation(calculation);
  }, [formData.questionCount, formData.duration, formData.winnerCount, formData.prizePerWinner, formData.voucherCode]);

  // Format angka ke format rupiah
  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat('id-ID').format(amount);
  };

  // Define steps for desktop
  const desktopSteps = [
    { number: 1, title: t('step1') },
    { number: 2, title: t('step2') },
    { number: 3, title: t('step3') }
  ];

  // Define steps for mobile (shorter titles)
  const mobileSteps = [
    { number: 1, title: t('step1').split(' ')[0] }, // First word only
    { number: 2, title: t('step2').split(' ')[0] },
    { number: 3, title: t('step3').split(' ')[0] }
  ];

  return (
    <div className="sidebar">
      {/* Desktop Header - Hidden on Mobile */}
      <div className="desktop-sidebar-header">
        <SidebarHeader />
      </div>

      {/* Mobile Progress Bar - Compact with Header and Total */}
      <MobileProgressBar
        currentStep={currentStep}
        steps={mobileSteps}
        totalCost={costCalculation.totalCost}
        formatRupiah={formatRupiah}
      />

      {/* Desktop Steps */}
      <div className="desktop-steps space-y-2">
        {desktopSteps.map((step) => (
          <StepItem
            key={step.number}
            number={step.number}
            title={step.title}
            isActive={currentStep === step.number}
            isCompleted={currentStep > step.number}
          />
        ))}
      </div>

      {/* Desktop Total Cost - Hidden on Mobile */}
      <div className="desktop-total-cost mt-8 p-6 border rounded-lg bg-gray-50">
        <h3 className="font-medium mb-2">{t('totalCost')}</h3>
        <div className="text-xl font-bold">
          Rp{formatRupiah(costCalculation.totalCost)}
        </div>
        <div className="text-sm text-gray-600 mt-1">
          {formData.questionCount} {t('perQuestion')}
          {costCalculation.incentiveCost > 0 && ' + Insentif responden'}
        </div>
      </div>
    </div>
  );
}

interface StepItemProps {
  number: number;
  title: string;
  isActive: boolean;
  isCompleted: boolean;
}

function StepItem({ number, title, isActive, isCompleted }: StepItemProps) {
  return (
    <div className={`step-item ${isActive ? 'active' : ''}`}>
      <div className={`step-number ${isActive ? 'active' : isCompleted ? 'completed' : ''}`}>
        {isCompleted ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <span>{number}</span>
        )}
      </div>
      <span className="step-title">{title}</span>
    </div>
  );
}
