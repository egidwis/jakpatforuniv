import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { getFormSubmissionsByUser, getOwnProfile } from '../utils/supabase';
import { expandReferralSource } from '../constants/biodata';
import { SURVEY_DRAFT_KEY, LEGACY_SURVEY_DRAFT_KEY } from '../utils/constants';
import { isAutoApprovalPath as computeIsAutoApprovalPath } from '../utils/review-path';
import { isBookingClosedForDate } from '../utils/airing-window';
import { calculateTotalCost } from '../utils/cost-calculator';
import { submitOrder, orderSubmitErrorKey } from '../utils/submitOrder';
import { useIlkomunyBlocked } from '../hooks/useIlkomunyBlocked';
import { useLanguage } from '../i18n/LanguageContext';
import type { SurveyFormData } from '../types';
import { StepSurveyDetails } from './StepSurveyDetails';
import { StepSchedule } from './StepSchedule';
import { StepCheckout } from './StepCheckout';
import { UnifiedHeader } from './UnifiedHeader';

// Fungsi untuk mendapatkan tanggal berdasarkan durasi dari hari ini
const getEndDateFromDuration = (duration: number) => {
  const date = new Date();
  date.setDate(date.getDate() + duration);
  return date.toISOString().split('T')[0];
};

const STORAGE_KEY = SURVEY_DRAFT_KEY;

// Baca draft dengan migrasi dari skema step paling lama (1 Survei, 2 Biodata,
// 3 Jadwal, 4 Review, 5 Kilat) ke kunci v2. Urutan v2 sendiri sejak itu dibalik
// menjadi 1 Survei, 2 Ringkasan, 3 Jadwal, 4 Kilat — draft v2 lama TIDAK perlu
// dipetakan ulang: step 2 dan 3 hanya bertukar peran, dan keduanya sama-sama
// layar yang aman untuk didarati (Ringkasan tinggal dibaca, Jadwal tinggal
// dipilih). Yang wajib dijaga cuma tanggalnya — lihat guard di bawah.
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

export function MultiStepForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  // Initialize state from localStorage if available
  const [currentStep, setCurrentStep] = useState<number>(() => {
    const draft = readDraft();
    const step = typeof draft?.currentStep === 'number' ? draft.currentStep : 1;
    return Math.min(Math.max(step, 1), 4);
  });

  const [formData, setFormData] = useState<SurveyFormData>(() => {
    const draft = readDraft();
    if (!draft?.formData) return defaultFormData;

    const merged = { ...defaultFormData, ...draft.formData };

    // Tanggal dari draft DIPERTAHANKAN selama masih sah. Versi sebelumnya
    // mengosongkannya tanpa syarat setiap mount — padahal `currentStep` ikut
    // dipulihkan, sehingga user yang me-reload halaman mendarat di layar
    // lanjutan dengan field tanggal wajib yang kosong, lalu ditolak validasi
    // dengan toast "Tanggal dan waktu mulai iklan belum dipilih". Yang perlu
    // dibuang hanya tanggal yang sudah basi: hari yang lewat, atau hari-H yang
    // sudah menembus batas pemesanan 13.00 WIB.
    const ymd = merged.startDate ? String(merged.startDate).slice(0, 10) : '';
    if (!ymd || isBookingClosedForDate(ymd)) {
      merged.startDate = '';
      merged.endDate = '';
      merged.startTime = '';
    }
    return merged;
  });

  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  // ILKOMUNY yang sudah dipakai akun ini → diskonnya tidak berlaku lagi.
  const ilkomunyBlocked = useIlkomunyBlocked(formData.voucherCode);

  // Order sudah tersimpan → draft sengaja dibuang dan tidak boleh ditulis
  // ulang oleh efek penyimpanan di bawah saat render terakhir sebelum unmount.
  const isFinalizedRef = useRef(false);

  // Save to localStorage whenever state changes
  useEffect(() => {
    if (isFinalizedRef.current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      formData,
      currentStep
    }));
  }, [formData, currentStep]);
    // Auto-fill form data from logged-in user
  useEffect(() => {
    const loadUserData = async () => {
      if (user) {
        // 2. Prefill biodata researcher dari profiles (diam-diam — StepTwo
        // sudah dihapus, tapi snapshot form_submissions tetap harus lengkap).
        try {
          const profile = await getOwnProfile();
          if (profile) {
            const ref = expandReferralSource(profile.referral_source);
            setFormData(prev => ({
              ...prev,
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


  /*
   * Skema step: 1 = Detail Survei, 2 = Ringkasan, 3 = Jadwal Tayang,
   * 4 = Jadwal Kilat.
   *
   * Ringkasan sengaja mendahului Jadwal. Percabangan otomatis/manual jadi
   * berada di SATU titik — akhir Ringkasan — bukan tersebar di dua tempat
   * seperti dulu (step 1 melompat, step 3 mundur). Efek sampingnya yang paling
   * berharga: pengguna voucher verifikasi-manual tidak pernah lagi memilih
   * slot yang kemudian dibatalkan diam-diam, dan ketersediaan slot dicek pada
   * momen paling segar sebelum pembayaran.
   */

  const nextStep = () => {
    setCurrentStep(prev => Math.min(prev + 1, 3));
    window.scrollTo(0, 0);
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    window.scrollTo(0, 0);
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

  /**
   * Titik tunggal tempat order lahir, untuk KEDUA jalur.
   *
   * Jalur otomatis memanggilnya dari langkah Jadwal (saat slot dikunci); jalur
   * manual dari Ringkasan. Aturannya sendiri hidup di `submitOrder()` — di sini
   * hanya perkara toast, membersihkan draft, dan ke mana user diantar.
   */
  const submitOrderAndRoute = async (overrides?: Partial<SurveyFormData>): Promise<boolean> => {
    const merged = { ...formData, ...overrides };
    const auto = computeIsAutoApprovalPath(merged);
    const effective = ilkomunyBlocked ? { ...merged, voucherCode: '' } : merged;

    const loadingToast = toast.loading(auto ? t('lockingSlotLoading') : t('sendingForReviewLoading'));
    try {
      const saved = await submitOrder({
        formData: merged,
        cost: calculateTotalCost(effective),
        isAutoApproval: auto,
        ilkomunyBlocked,
        authUserId: user?.id,
      });
      toast.dismiss(loadingToast);

      // Email "terima kasih, akan kami review" HANYA untuk jalur manual. Dulu
      // ia dikirim ke semua orang, termasuk jalur otomatis — yang tidak pernah
      // direview dan tidak akan pernah menerima email lanjutan yang dijanjikan.
      if (!auto) {
        fetch('/api/send-submission-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: merged.fullName || 'Kak', email: merged.email }),
        }).catch(err => console.error('Failed to send email:', err));
      }

      isFinalizedRef.current = true;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_SURVEY_DRAFT_KEY);

      toast.success(auto ? t('slotLockedSuccess') : t('successFormSubmitted'));
      navigate(auto ? `/dashboard/payment/${saved.id}` : '/dashboard?status=survey_submitted', {
        replace: true,
      });
      return true;
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(t(orderSubmitErrorKey(error)));
      return false;
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

  // Dipakai StepSchedule (mode kilat) DAN UnifiedHeader — satu fungsi supaya
  // logika undo-kilat tidak duplikat di dua tempat. Kembalinya ke Ringkasan,
  // yang kini step 2.
  const handleKilatBack = () => {
    undoKilatUpgrade();
    setCurrentStep(2);
    window.scrollTo(0, 0);
  };

  const cancelOrder = () => {
    isFinalizedRef.current = true;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_SURVEY_DRAFT_KEY);
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="multi-step-form">
      {/* Bar step floating di bawah layar (desktop & mobile). Saat
          disembunyikan (pemilihan metode / import GForm) AppNav sendiri
          sudah jadi header halaman. */}
      {isHeaderVisible && (
        <UnifiedHeader
          formData={formData}
          onCancelConfirmed={cancelOrder}
        />
      )}

      {/* Form Content — pb besar supaya tombol navigasi step terakhir tidak
          tertutup bar step yang floating di bawah. */}
      <div className="form-content mt-8 max-w-5xl mx-auto px-6 pb-32 md:pb-36">
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
            formData={formData}
            updateFormData={updateFormData}
            nextStep={nextStep}
            onHeaderVisibilityChange={setIsHeaderVisible}
          />
        )}

        {currentStep === 2 && (
          <StepCheckout
            formData={formData}
            updateFormData={updateFormData}
            nextStep={nextStep}
            onSubmitOrder={submitOrderAndRoute}
            onBack={prevStep}
            onUpgradeKilat={goToKilatSchedule}
            onUndoKilat={undoKilatUpgrade}
          />
        )}

        {currentStep === 3 && (
          <StepSchedule
            formData={formData}
            updateFormData={updateFormData}
            onConfirm={(ymd) => submitOrderAndRoute({ startDate: ymd, startTime: '15:00' })}
            onBack={prevStep}
          />
        )}

        {currentStep === 4 && (
          <StepSchedule
            formData={formData}
            updateFormData={updateFormData}
            mode="kilat"
            onBack={handleKilatBack}
            onConfirm={async (ymd) => {
              // Kilat memilih tanggalnya lebih dulu, lalu kembali ke Ringkasan
              // untuk konfirmasi akhir — di sana CTA-nya langsung mengunci &
              // membayar, karena jadwalnya sudah ada.
              updateFormData({
                isKilatUpgrade: true,
                startDate: ymd,
                startTime: '15:00',
                kilatStartDate: ymd,
                kilatStartTime: '15:00',
              });
              setCurrentStep(2);
              window.scrollTo(0, 0);
              return true;
            }}
          />
        )}
      </div>
    </div>
  );
}
