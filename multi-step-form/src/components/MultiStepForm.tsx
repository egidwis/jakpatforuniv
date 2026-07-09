import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getFormSubmissionsByUser, deleteFormSubmission, getOwnProfile } from '../utils/supabase';
import { expandReferralSource } from '../constants/biodata';
import { SURVEY_DRAFT_KEY, LEGACY_SURVEY_DRAFT_KEY } from '../utils/constants';
import type { SurveyFormData } from '../types';
import { StepSurveyDetails } from './StepSurveyDetails';
import { StepSchedule } from './StepSchedule';
import { StepCheckout } from './StepCheckout';
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

const STORAGE_KEY = SURVEY_DRAFT_KEY;

// Baca draft dengan migrasi dari skema step lama (1 Survei, 2 Biodata,
// 3 Jadwal, 4 Review, 5 Kilat) ke skema baru tanpa biodata (1 Survei,
// 2 Jadwal, 3 Review, 4 Kilat). Draft lama dipetakan lalu dipindah ke kunci v2.
const readDraft = (): { formData?: Partial<SurveyFormData>; currentStep?: number } | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);

    const legacy = localStorage.getItem(LEGACY_SURVEY_DRAFT_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      const stepMap: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };
      parsed.currentStep = stepMap[parsed.currentStep as number] ?? 1;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      localStorage.removeItem(LEGACY_SURVEY_DRAFT_KEY);
      return parsed;
    }
  } catch {
    // Draft korup — mulai dari awal
  }
  return null;
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
  startDate: '',
  endDate: '',

  // Kontak invoice (diedit di checkout) + biodata researcher (prefill dari profil)
  fullName: '',
  email: '',
  phoneNumber: '',
  university: '',
  department: '',
  status: '',
  referralSource: '',
  referralSourceOther: '',
  winnerCount: 0,
  prizePerWinner: 0,

  // Checkout
  voucherCode: '',

  // JFU Kilat
  isKilatUpgrade: false,
  kilatStartDate: '',
  kilatStartTime: '',
  regularStartDateBackup: '',
  regularStartTimeBackup: '',
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
    const draft = readDraft();
    const step = typeof draft?.currentStep === 'number' ? draft.currentStep : 1;
    return Math.min(Math.max(step, 1), 4);
  });

  const [formData, setFormData] = useState<SurveyFormData>(() => {
    const draft = readDraft();
    if (draft?.formData) {
      // Merge with default to ensure all fields exist
      // Always reset startDate/endDate to prevent stale cached dates
      const merged = { ...defaultFormData, ...draft.formData };
      merged.startDate = '';
      merged.endDate = '';
      return merged;
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
        // 1. Basic auth data - Always set from auth (this is the identity fix)
        setFormData(prev => {
          return {
            ...prev,
            email: prev.email || user.email || '',
            fullName: user.user_metadata?.full_name || prev.fullName
          };
        });

        // 2. Prefill biodata researcher dari profiles (diam-diam — StepTwo
        // sudah dihapus, tapi snapshot form_submissions tetap harus lengkap).
        try {
          const profile = await getOwnProfile();
          if (profile) {
            const ref = expandReferralSource(profile.referral_source);
            setFormData(prev => ({
              ...prev,
              fullName: prev.fullName || profile.full_name || '',
              phoneNumber: prev.phoneNumber || profile.phone_number || '',
              university: prev.university || profile.university || '',
              department: prev.department || profile.department || '',
              status: prev.status || profile.status || '',
              referralSource: prev.referralSource || ref.source,
              referralSourceOther: prev.referralSourceOther || ref.other,
            }));
          }
        } catch (error) {
          console.error('Failed to prefill from profile', error);
        }

        // 3. Fetch previous submission for extra details (using user ID, not email)
        if (user.id) {
          try {
            const previousSubmissions = await getFormSubmissionsByUser(user.id, user.email);
            if (previousSubmissions && previousSubmissions.length > 0) {
              const latest = previousSubmissions[0];
              setFormData(prev => ({
                ...prev,
                phoneNumber: prev.phoneNumber || latest.phone_number || '',
                university: prev.university || latest.university || '',
                department: prev.department || latest.department || '',
                status: prev.status || latest.status || ''
              }));
              
              // Only bounce if they haven't started filling out a fresh form (no draft data)
              const saved = localStorage.getItem(STORAGE_KEY);
              let hasDraftData = false;
              if (saved) {
                try {
                  const parsed = JSON.parse(saved);
                  if (parsed.formData && (parsed.formData.surveyUrl || parsed.formData.title)) {
                    hasDraftData = true;
                  }
                } catch (e) {
                  // ignore
                }
              }

              if (!hasDraftData && latest.submission_status === 'waiting_payment') {
                // Navigate asynchronously to ensure it happens after render cycle
                setTimeout(() => navigate(`/dashboard/payment/${latest.id}`), 0);
              }
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


  const isAutoApprovalPath = !formData.isManualEntry && !formData.hasPersonalDataQuestions && formData.surveyUrl.includes('docs.google.com/forms') && formData.voucherCode?.toUpperCase() !== 'JFUFEB';

  // Skema step: 1 = Detail Survei, 2 = Jadwal (hanya auto-approval),
  // 3 = Review & Pembayaran, 4 = Jadwal Kilat.

  // Fungsi untuk pindah ke step berikutnya
  const nextStep = () => {
    setCurrentStep(prev => {
      // Non-auto-approval melewati step Jadwal: langsung ke Review
      if (prev === 1 && !isAutoApprovalPath) {
        return 3;
      }
      return Math.min(prev + 1, 3);
    });
    window.scrollTo(0, 0);
  };

  // Fungsi untuk kembali ke step sebelumnya
  const prevStep = () => {
    setCurrentStep(prev => {
      // Dari Review, non-auto-approval kembali langsung ke Detail Survei
      if (prev === 3 && !isAutoApprovalPath) {
        return 1;
      }
      return Math.max(prev - 1, 1);
    });
    window.scrollTo(0, 0);
  };

  const handleReset = async () => {
    const draft = localStorage.getItem(STORAGE_KEY);
    let isReschedule = false;
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        isReschedule = parsed.formData?.isReschedule || false;
      } catch (error) {
        console.error("Error reading draft:", error);
      }
    }

    // Different confirmation message for reschedule vs new submission
    const confirmMessage = isReschedule 
      ? 'Batalkan jadwal ulang? Data survey Anda tetap tersimpan dan bisa dijadwalkan ulang nanti.'
      : t('confirmCancelSubmission');

    if (confirm(confirmMessage)) {
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          // Only delete submission if it's NOT a reschedule
          // For reschedule, the submission is already prepared and should be kept
          if (!isReschedule && parsed.formData && (parsed.formData as any).submissionIdToReplace) {
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

  const goToKilatSchedule = () => {
    updateFormData({
      regularStartDateBackup: formData.startDate,
      regularStartTimeBackup: formData.startTime,
      startDate: '',
      startTime: '',
    });
    setCurrentStep(4);
    window.scrollTo(0, 0);
  };

  const undoKilatUpgrade = () => {
    updateFormData({
      isKilatUpgrade: false,
      startDate: formData.regularStartDateBackup || '',
      startTime: formData.regularStartTimeBackup || '',
      kilatStartDate: '',
      kilatStartTime: '',
      regularStartDateBackup: '',
      regularStartTimeBackup: '',
    });
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
          <StepSurveyDetails
            key={resetKey}
            formData={formData}
            updateFormData={updateFormData}
            nextStep={nextStep}
            onHeaderVisibilityChange={setIsHeaderVisible}
          />
        )}

        {currentStep === 2 && (
          <StepSchedule
            formData={formData}
            updateFormData={updateFormData}
            nextStep={nextStep}
            prevStep={prevStep}
          />
        )}

        {currentStep === 3 && (
          <StepCheckout
            formData={formData}
            updateFormData={updateFormData}
            prevStep={prevStep}
            onUpgradeKilat={goToKilatSchedule}
            onUndoKilat={undoKilatUpgrade}
          />
        )}

        {currentStep === 4 && (
          <StepSchedule
            formData={formData}
            updateFormData={updateFormData}
            nextStep={() => {
              updateFormData({
                isKilatUpgrade: true,
                kilatStartDate: formData.startDate,
                kilatStartTime: formData.startTime,
              });
              setCurrentStep(3);
              window.scrollTo(0, 0);
            }}
            prevStep={() => {
              undoKilatUpgrade();
              setCurrentStep(3);
              window.scrollTo(0, 0);
            }}
            mode="kilat"
          />
        )}
      </div>
    </div>
  );
}
