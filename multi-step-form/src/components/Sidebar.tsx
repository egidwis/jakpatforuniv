import { useEffect, useState } from 'react';
import type { SurveyFormData, CostCalculation } from '../types';
import { calculateTotalCost } from '../utils/cost-calculator';

interface SidebarProps {
  currentStep: number;
  formData: SurveyFormData;
}

export function Sidebar({ currentStep, formData }: SidebarProps) {
  const [costCalculation, setCostCalculation] = useState<CostCalculation>({
    adCost: 0,
    incentiveCost: 0,
    discount: 0,
    totalCost: 0
  });

  // Hitung biaya saat form data berubah
  useEffect(() => {
    const calculation = calculateTotalCost(formData);
    setCostCalculation(calculation);
  }, [formData]);

  // Format angka ke format rupiah
  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat('id-ID').format(amount);
  };

  return (
    <div className="sidebar">
      <h2 className="text-lg font-semibold mb-4">Submit survey</h2>
      <p className="text-sm text-gray-600 mb-6">
        Iklankan survey kamu ke 1.7Juta responden Jakpat
      </p>

      <div className="space-y-2">
        <StepItem
          number={1}
          title="Detail Survey"
          isActive={currentStep === 1}
          isCompleted={currentStep > 1}
        />

        <StepItem
          number={2}
          title="Data diri & Insentif"
          isActive={currentStep === 2}
          isCompleted={currentStep > 2}
        />

        <StepItem
          number={3}
          title="Review & Pembayaran"
          isActive={currentStep === 3}
          isCompleted={false}
        />
      </div>

      <div className="mt-8 p-6 border rounded-lg bg-gray-50">
        <h3 className="font-medium mb-2">Total Biaya</h3>
        <div className="text-xl font-bold">
          Rp{formatRupiah(costCalculation.totalCost)}
        </div>
        <div className="text-sm text-gray-600 mt-1">
          {formData.questionCount} pertanyaan x {formData.duration} (hari)
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
