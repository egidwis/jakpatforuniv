import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getFormSubmissionsByEmail } from '../utils/supabase';
import type { SurveyFormData } from '../types';
import { StepOne } from './StepOne';
import { StepTwo } from './StepTwo';
import { StepThree } from './StepThree';
import { StepFour } from './StepFour';
import { UnifiedHeader } from './UnifiedHeader';

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

const STORAGE_KEY = 'survey_form_draft';


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
  status: '',
  referralSource: '',
  referralSourceOther: '',
  winnerCount: 0, // Default 0, akan diisi di step 2
  prizePerWinner: 0, // Default 0, akan diisi di step 2

  // Step 3
  voucherCode: '',
};

import { useLanguage } from '../i18n/LanguageContext';

export function MultiStepForm() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toggleSidebar } = useOutletContext<{ toggleSidebar: () => void }>();

  // Initialize state from localStorage if available
  const [resetKey, setResetKey] = useState(0);
  const [currentStep, setCurrentStep] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return typeof parsed.currentStep === 'number' ? parsed.currentStep : 1;
      } catch (e) {
        return 1;
      }
    }
    return 1;
  });

  const [formData, setFormData] = useState<SurveyFormData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with default to ensure all fields exist
        return { ...defaultFormData, ...parsed.formData };
      } catch (e) {
        return defaultFormData;
      }
    }
    return defaultFormData;
  });

  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  // Save to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      formData,
      currentStep
    }));
  }, [formData, currentStep]);

  // Auto-fill form data from logged-in user
  useEffect(() => {
    const loadUserData = async () => {
      if (user) {
        // 1. Basic auth data - Only if not already set or if empty (don't overwrite draft)
        setFormData(prev => {
          // Only update if email is empty (fresh form) or matches the user
          if (!prev.email || prev.email === user.email) {
            return {
              ...prev,
              email: user.email || prev.email,
              fullName: user.user_metadata?.full_name || prev.fullName
            };
          }
          return prev;
        });

        // 2. Fetch previous submission for extra details
        if (user.email) {
          try {
            const previousSubmissions = await getFormSubmissionsByEmail(user.email);
            if (previousSubmissions && previousSubmissions.length > 0) {
              const latest = previousSubmissions[0];
              setFormData(prev => ({
                ...prev,
                phoneNumber: latest.phone_number || prev.phoneNumber,
                university: latest.university || prev.university,
                department: latest.department || prev.department,
                status: latest.status || prev.status
              }));
              // Optional: notification
              // toast.info('Data diri diisi otomatis dari submission sebelumnya');
            }
          } catch (error) {
            console.error('Failed to auto-fill from previous submission', error);
          }
        }
      }
    };

    loadUserData();
  }, [user]);

  // Reset header visibility when changing steps (ensure it shows up for steps 2,3,4)
  useEffect(() => {
    if (currentStep > 1) {
      setIsHeaderVisible(true);
    }
  }, [currentStep]);


  // Fungsi untuk pindah ke step berikutnya
  const nextStep = () => {
    setCurrentStep(prev => Math.min(prev + 1, 4));
    window.scrollTo(0, 0);
  };

  // Fungsi untuk kembali ke step sebelumnya
  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    window.scrollTo(0, 0);
  };

  const handleReset = () => {
    if (confirm(t('confirmCancelSubmission'))) {
      localStorage.removeItem(STORAGE_KEY);
      setFormData(defaultFormData);
      setCurrentStep(1);
      setResetKey(prev => prev + 1);
      window.scrollTo(0, 0);
    }
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
    <div className={`multi-step-form ${isHeaderVisible ? 'pt-24' : ''}`}>
      {isHeaderVisible && (
        <UnifiedHeader
          currentStep={currentStep}
          formData={formData}
          onToggleSidebar={toggleSidebar}
          onReset={handleReset}
        />
      )}

      {/* Form Content */}
      <div className="form-content mt-8 max-w-5xl mx-auto px-6 pb-24">
        {currentStep === 1 && (
          <StepOne
            key={resetKey}
            formData={formData}
            updateFormData={updateFormData}
            nextStep={nextStep}
            onHeaderVisibilityChange={setIsHeaderVisible}
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
            nextStep={nextStep}
            prevStep={prevStep}
          />
        )}

        {currentStep === 4 && (
          <StepFour
            formData={formData}
            updateFormData={updateFormData}
            prevStep={prevStep}
          />
        )}
      </div>
    </div>
  );
}
