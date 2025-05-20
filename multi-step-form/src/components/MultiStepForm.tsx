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

// Fungsi untuk mendapatkan tanggal 1 hari dari sekarang dalam format YYYY-MM-DD
const getDefaultEndDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
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
  endDate: getDefaultEndDate(),

  // Step 2
  fullName: '',
  email: '',
  phoneNumber: '',
  university: '',
  department: '',
  status: 'Mahasiswa',
  winnerCount: 2, // Minimal 2 pemenang
  prizePerWinner: 25000, // Minimal Rp 25.000

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
    setFormData(prev => ({ ...prev, ...newData }));
  };

  // Fungsi untuk handle submit form
  const handleSubmit = () => {
    // Implementasi submit form ke backend
    console.log('Form submitted:', formData);
    alert('Form berhasil dikirim!');
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
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
