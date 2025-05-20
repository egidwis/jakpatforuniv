import { useEffect, useState } from 'react';
import type { SurveyFormData, CostCalculation } from '../../lib/types';
import { calculateTotalCost } from '../../lib/cost-calculator';

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
    <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4">Submit survey</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
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

      <div className="mt-8 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
        <h3 className="font-medium mb-2">Total Biaya</h3>
        <div className="text-xl font-bold">
          Rp{formatRupiah(costCalculation.totalCost)}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
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
    <div
      className={`flex items-center p-3 rounded-md transition-colors ${
        isActive
          ? 'bg-gray-200 dark:bg-gray-700'
          : isCompleted
            ? 'bg-gray-50 dark:bg-gray-900'
            : ''
      }`}
    >
      <div
        className={`flex items-center justify-center w-6 h-6 rounded-full mr-3 ${
          isActive
            ? 'bg-black text-white dark:bg-white dark:text-black'
            : isCompleted
              ? 'bg-green-500 text-white'
              : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
        }`}
      >
        {isCompleted ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <span className="text-xs">{number}</span>
        )}
      </div>
      <span className={`text-sm ${isActive ? 'font-medium' : ''}`}>{title}</span>
    </div>
  );
}
