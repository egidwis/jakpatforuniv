import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getFormSubmissionsByEmail, deleteFormSubmission } from '../utils/supabase';
import type { SurveyFormData } from '../types';
import { StepOne } from './StepOne';
import { StepTwo } from './StepTwo';
import { StepThreeSlotReservation as StepThree } from './StepThreeSlotReservation';
import { StepFour } from './StepFour';
import { UnifiedHeader } from './UnifiedHeader';
import { Menu } from 'lucide-react';
import { Button } from './ui/button';

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
  startDate: '',
  endDate: '',

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
  const navigate = useNavigate();

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
        // Always reset startDate/endDate to prevent stale cached dates
        const merged = { ...defaultFormData, ...parsed.formData };
        merged.startDate = '';
        merged.endDate = '';
        return merged;
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
              
              // Redirect to payment/expired page if they have a pending submission and haven't actively started typing
              setFormData(currentData => {
                // If they haven't started filling out a fresh form OR they are not actively recovering a draft
                if (!currentData.surveyUrl && !currentData.title) {
                  // Only bounce if the latest submission was sent to payment validation
                  if (latest.submission_status === 'waiting_payment') {
                    // Navigate asynchronously to avoid state render cycle collision
                    setTimeout(() => navigate(`/dashboard/payment/${latest.id}`), 0);
                  }
                }
                return currentData;
              });
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


  // Determine if the current form qualifies for auto-approval path (shows slot booking)
  const isAutoApprovalPath = !formData.isManualEntry && !formData.hasPersonalDataQuestions && formData.surveyUrl.includes('docs.google.com/forms');

  // Fungsi untuk pindah ke step berikutnya
  const nextStep = () => {
    setCurrentStep(prev => {
      // If moving from step 2, and not auto-approval, skip to step 4
      if (prev === 2 && !isAutoApprovalPath) {
        return 4;
      }
      return Math.min(prev + 1, 4);
    });
    window.scrollTo(0, 0);
  };

  // Fungsi untuk kembali ke step sebelumnya
  const prevStep = () => {
    setCurrentStep(prev => {
      // If moving back from step 4, and not auto-approval, skip to step 2
      if (prev === 4 && !isAutoApprovalPath) {
        return 2;
      }
      return Math.max(prev - 1, 1);
    });
    window.scrollTo(0, 0);
  };

  const handleReset = async () => {
    if (confirm(t('confirmCancelSubmission'))) {
      const draft = localStorage.getItem(STORAGE_KEY);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          // If this form is replacing an expired submission and the user cancels it, delete the original
          if (parsed.formData && (parsed.formData as any).submissionIdToReplace) {
             const idToDelete = (parsed.formData as any).submissionIdToReplace;
             await deleteFormSubmission(idToDelete);
          }
        } catch (error) {
          console.error("Error reading draft for deletion:", error);
        }
      }

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
      {isHeaderVisible ? (
        <UnifiedHeader
          currentStep={currentStep}
          formData={formData}
          onToggleSidebar={toggleSidebar}
          onReset={handleReset}
        />
      ) : (
        <div className="fixed top-4 left-4 right-4 z-40 md:hidden">
          <div className="backdrop-blur-md bg-white/80 border border-gray-100 shadow-sm rounded-2xl px-4 py-2.5 flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="-ml-2 h-9 w-9"
            >
              <Menu className="w-5 h-5 text-gray-700" />
            </Button>
            <span className="text-sm font-semibold text-gray-700">Dashboard</span>
            <div className="w-9" /> {/* spacer to center title */}
          </div>
        </div>
      )}

      {/* Form Content */}
      <div className="form-content mt-8 max-w-5xl mx-auto px-6 pb-24">
        {/* Lebaran Holiday Banner — auto-hides after 25 Mar 2026 12:00 WIB */}
        {(() => {
          const bannerExpiry = new Date('2026-03-25T05:00:00Z'); // 12:00 WIB
          if (new Date() < bannerExpiry) {
            return (
              <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 px-5 py-4 shadow-sm mb-6">
                <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.07] text-7xl pointer-events-none flex items-center justify-center">🕌</div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl mt-0.5 shrink-0">🌙</span>
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-bold text-amber-900">Pemberitahuan Libur Idul Fitri 1447 H</h3>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Kami akan <strong>libur sementara</strong> pada <strong>18–24 Maret 2026</strong>. Selama periode tersebut, layanan pemasangan iklan survei <strong>belum dapat diproses</strong>. Pesanan dan pembayaran yang masuk akan mulai kami proses kembali pada <strong>25 Maret 2026</strong>.
                    </p>
                    <p className="text-xs text-amber-700 font-medium mt-0.5"><br></br>Selamat Hari Raya Idul Fitri. Mohon maaf lahir dan batin. ✨</p>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })()}
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
