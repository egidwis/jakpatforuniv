import { useState } from 'react';
import type { SurveyFormData } from '../types';
import { StepOne } from './StepOne';
import { StepTwo } from './StepTwo';
import { StepThree } from './StepThree';
import { Sidebar } from './Sidebar';

// Fungsi untuk mendapatkan tanggal hari ini dalam format YYYY-MM-DD
const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

// Fungsi untuk mendapatkan tanggal berdasarkan durasi dari hari ini
const getEndDateFromDuration = (duration: number) => {
  const date = new Date();
  date.setDate(date.getDate() + duration);
  return date.toISOString().split('T')[0];
};

// Default values untuk form
const defaultFormData: SurveyFormData = {
  // Step 1
  surveyUrl: '',
  title: '',
  description: '',
  questionCount: 0,
  criteriaResponden: '',
  duration: 1, // Default 1 hari
  startDate: getTodayDate(),
  endDate: getEndDateFromDuration(1),

  // Step 2
  fullName: '',
  email: '',
  phoneNumber: '',
  university: '',
  department: '',
  status: 'Mahasiswa',
  referralSource: 'Tiktok',
  winnerCount: 1, // Minimal 1 pemenang
  prizePerWinner: 0, // Default 0, akan diisi user

  // Step 3
  voucherCode: '',
};

export function MultiStepForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<SurveyFormData>(defaultFormData);

  // Fungsi untuk pindah ke step berikutnya
  const nextStep = () => {
    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  // Fungsi untuk kembali ke step sebelumnya
  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  // Fungsi untuk update form data
  const updateFormData = (newData: Partial<SurveyFormData>) => {
    // Jika durasi berubah, update endDate secara otomatis
    if (newData.duration !== undefined) {
      const endDate = getEndDateFromDuration(newData.duration);
      setFormData(prev => ({ ...prev, ...newData, endDate }));
    } else {
      setFormData(prev => ({ ...prev, ...newData }));
    }
  };

  return (
    <div className="multi-step-form">
      {/* Sidebar */}
      <Sidebar currentStep={currentStep} formData={formData} />

      {/* Form Content */}
      <div className="form-content">
        {currentStep === 1 && (
          <StepOne
            formData={formData}
            updateFormData={updateFormData}
            nextStep={nextStep}
          />
        )}

        {currentStep === 2 && (
          <StepTwo
            formData={formData}
            updateFormData={updateFormData}
            nextStep={nextStep}
            prevStep={prevStep}
          />
        )}

        {currentStep === 3 && (
          <StepThree
            formData={formData}
            updateFormData={updateFormData}
            prevStep={prevStep}
          />
        )}
      </div>
    </div>
  );
}
