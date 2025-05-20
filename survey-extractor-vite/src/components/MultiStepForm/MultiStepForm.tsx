import { useState } from 'react';
import type { SurveyFormData } from '../../lib/types';
import { StepOne } from './StepOne';
import { StepTwo } from './StepTwo';
import { StepThree } from './StepThree';
import { Sidebar } from './Sidebar';

// Default values untuk form
const defaultFormData: SurveyFormData = {
  // Step 1
  surveyUrl: '',
  title: '',
  description: '',
  questionCount: 0,
  criteriaResponden: '',
  duration: 3, // Default 3 hari

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
    <div className="flex flex-col md:flex-row gap-6 w-full max-w-6xl mx-auto">
      {/* Sidebar */}
      <div className="w-full md:w-64 shrink-0">
        <Sidebar currentStep={currentStep} formData={formData} />
      </div>

      {/* Form Content */}
      <div className="flex-1 border rounded-lg p-6">
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
