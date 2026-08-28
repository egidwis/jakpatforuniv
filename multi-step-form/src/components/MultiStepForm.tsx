import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { getFormSubmissionsByUser, getOwnProfile } from '../utils/supabase';
import { expandReferralSource } from '../constants/biodata';
import { SURVEY_DRAFT_KEY, LEGACY_SURVEY_DRAFT_KEY } from '../utils/constants';
import { restoreDraft } from '../utils/draftRestore';
import { isAutoApprovalPath as computeIsAutoApprovalPath } from '../utils/review-path';
import { isBookingClosedForDate } from '../utils/airing-window';
import { calculateTotalCost } from '../utils/cost-calculator';
import { submitOrder, orderSubmitErrorKey } from '../utils/submitOrder';
import { useIlkomunyBlocked } from '../hooks/useIlkomunyBlocked';
import { useLanguage } from '../i18n/LanguageContext';
import { getCustomFormById } from '../utils/customForms';
import { detectPersonalDataInSchema } from '../utils/detectPersonalData';
import type { SurveyFormData } from '../types';
import { StepSurveyDetails } from './StepSurveyDetails';
import { StepSchedule } from './StepSchedule';
import { StepCheckout } from './StepCheckout';
import { UnifiedHeader } from './UnifiedHeader';
import { ReviewSubmissionModal } from './ReviewSubmissionModal';
// Hanya Loader2 yang tersisa dari sisi main di sini: `Menu`/`Button` ikut hilang
// bersama header mobile lama (digantikan AppNav), dan `getTodayDate` tidak lagi
// dipakai sejak flow order disusun ulang.
import { Loader2 } from 'lucide-react';

// Fungsi untuk mendapatkan tanggal berdasarkan durasi dari hari ini
const getEndDateFromDuration = (duration: number) => {
  const date = new Date();
  date.setDate(date.getDate() + duration);
  return date.toISOString().split('T')[0];
};

const STORAGE_KEY = SURVEY_DRAFT_KEY;

/**
 * Pemulihan draft. Aturannya — termasuk migrasi penomoran step dan jaminan
 * bahwa draft tidak mendaratkan user melewati gerbang Ringkasan — hidup di
 * `utils/draftRestore.ts` supaya bisa diuji tanpa merender komponen ini.
 */
const readDraft = () => restoreDraft(localStorage);


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
  const [searchParams, setSearchParams] = useSearchParams();
  const [isPrefillLoading, setIsPrefillLoading] = useState(() => !!searchParams.get('custom_form_id'));

  // Initialize state from localStorage if available
  const [currentStep, setCurrentStep] = useState<number>(() => readDraft().currentStep);

  const [formData, setFormData] = useState<SurveyFormData>(() => {
    const draft = readDraft();
    if (!draft.formData) return defaultFormData;

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

  // Step 1 punya sub-layar (pilih metode / import Google Form) yang sengaja
  // tampil tanpa bar floating. Hanya StepSurveyDetails yang tahu sedang di
  // sub-layar mana, jadi ia yang melaporkannya ke sini.
  const [isStep1HeaderAllowed, setIsStep1HeaderAllowed] = useState(false);

  // Bar floating hidup di Step 1 (layar isian) dan Step 2 (Ringkasan) saja.
  // Sejak Step 3 user sudah masuk jalur jadwal -> bayar, dan layarnya sengaja
  // dibiarkan bersih supaya fokusnya satu: pilih tanggal lalu bayar.
  //
  // Nilai TURUNAN, bukan state. Versi sebelumnya dua efek saling menimpa satu
  // state yang sama -- satu bergantung `currentStep`, satu bergantung
  // `flowState` milik anak -- sehingga bar muncul atau hilang tergantung dari
  // arah mana user tiba di layar yang sama.
  const isHeaderVisible = currentStep === 2 || (currentStep === 1 && isStep1HeaderAllowed);

  // ILKOMUNY yang sudah dipakai akun ini → diskonnya tidak berlaku lagi.
  const ilkomunyBlocked = useIlkomunyBlocked(formData.voucherCode);

  // Order sudah tersimpan → draft sengaja dibuang dan tidak boleh ditulis
  // ulang oleh efek penyimpanan di bawah saat render terakhir sebelum unmount.
  const isFinalizedRef = useRef(false);

  // Modal konfirmasi khusus pengajuan jalur review manual
  const [reviewModalData, setReviewModalData] = useState<{
    isOpen: boolean;
    email: string;
    surveyTitle?: string;
  } | null>(null);

  // Save to localStorage whenever state changes
  useEffect(() => {
    if (isFinalizedRef.current) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      formData,
      currentStep
    }));
  }, [formData, currentStep]);

  // Prefill dari JFU form (CTA "Sebar via Jakpat" di /dashboard/forms):
  // ambil title/description/schema langsung dari Supabase, lewati langkah
  // pilihan Google Form vs manual, dan jalankan pengecekan AI untuk
  // pertanyaan yang meminta data pribadi responden.
  useEffect(() => {
    const customFormId = searchParams.get('custom_form_id');
    if (!customFormId) return;

    let cancelled = false;

    const prefillFromCustomForm = async () => {
      try {
        const form = await getCustomFormById(customFormId);
        if (cancelled) return;

        if (!form) {
          toast.error('Survey tidak ditemukan.');
          return;
        }

        const detection = await detectPersonalDataInSchema(form.schema || []);
        if (cancelled) return;

        setFormData(prev => ({
          ...prev,
          surveyUrl: `${window.location.origin}/f/${customFormId}`,
          title: form.title,
          description: form.description || '',
          questionCount: (form.schema || []).length,
          isManualEntry: true,
          hasPersonalDataQuestions: detection.hasPersonalDataQuestions,
          detectedKeywords: detection.detectedKeywords,
          flaggedPersonalDataQuestions: detection.flaggedQuestions,
          customFormId
        }));
        setCurrentStep(1);
      } catch (error) {
        console.error('Failed to prefill from custom form', error);
        toast.error('Gagal memuat data survey. Silakan isi manual.');
      } finally {
        if (!cancelled) {
          setIsPrefillLoading(false);
          setSearchParams(prevParams => {
            const next = new URLSearchParams(prevParams);
            next.delete('custom_form_id');
            return next;
          }, { replace: true });
        }
      }
    };

    prefillFromCustomForm();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      if (!auto) {
        setReviewModalData({
          isOpen: true,
          email: merged.email || user?.email || '',
          surveyTitle: merged.title || '',
        });
      } else {
        toast.success(t('slotLockedSuccess'));
        navigate(`/dashboard/payment/${saved.id}`, {
          replace: true,
        });
      }
      return true;
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(t(orderSubmitErrorKey(error)));
      return false;
    }
  };

  const handleReviewModalConfirm = () => {
    setReviewModalData(null);
    navigate('/dashboard?status=survey_submitted', { replace: true });
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

  // Impor dari form JFU menunda seluruh layar sampai prefill selesai — tanpa ini
  // layar "pilih metode" sempat berkedip sebelum tergantikan.
  if (isPrefillLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-jfu-primary animate-spin mb-3" />
        <p className="text-sm text-gray-500">Memuat data survei…</p>
      </div>
    );
  }

  return (
    <div className="multi-step-form">
      {/* Bar step floating di bawah layar (desktop & mobile). Ia sengaja
          absen di dua tempat: sub-layar Step 1 (pemilihan metode / import
          GForm), di mana AppNav sendiri sudah jadi header halaman; dan sejak
          Step 3, supaya layar jadwal -> bayar tidak punya jalan keluar samping. */}
      {isHeaderVisible && (
        <UnifiedHeader
          formData={formData}
          onCancelConfirmed={cancelOrder}
        />
      )}

      {/* Form Content — pb besar supaya tombol navigasi tidak tertutup bar
          floating, tapi hanya saat bar-nya memang muncul. Ikut `isHeaderVisible`
          dan bukan nomor step, supaya keduanya tidak bisa berbeda pendapat. */}
      <div className={`form-content mt-8 max-w-5xl mx-auto px-6 ${isHeaderVisible ? 'pb-32 md:pb-36' : 'pb-12'}`}>
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
            onHeaderVisibilityChange={setIsStep1HeaderAllowed}
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
            onConfirm={(ymd) => submitOrderAndRoute({ startDate: ymd, startTime: '15:00' })}
            /*
              Jadwal ulang mendarat LANGSUNG di sini (StatusPage menulis draft
              currentStep 3) — step 2 di belakangnya adalah Ringkasan submit
              untuk order yang sedang di-reset, dan CTA-nya bisa melahirkan
              order kembar. Mundurnya karena itu keluar ke My Order, lewat
              `cancelOrder` supaya draft ber-`isReschedule` ikut TERBUANG:
              draft semacam itu yang tertinggal pernah menimpa survei lain
              (insiden Tri/NISMA — lihat resolveSubmissionMode).

              `prepareForReschedule` yang sudah telanjur jalan tidak apa-apa
              dibiarkan: slot memang sudah dilepas, ordernya tinggal memilih
              jadwal lagi dari My Order kapan pun.
            */
            exitMode={formData.isReschedule ? 'orders' : 'step'}
            onBack={
              formData.isReschedule
                ? cancelOrder
                : () => {
                    // Jadwal belum ter-lock — bersihkan agar Step 2 tahu bahwa
                    // user masih perlu memilih jadwal, bukan langsung submit.
                    updateFormData({ startDate: '', endDate: '', startTime: '' });
                    prevStep();
                  }
            }
          />
        )}

        {currentStep === 4 && (
          <StepSchedule
            formData={formData}
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

      <ReviewSubmissionModal
        isOpen={!!reviewModalData?.isOpen}
        email={reviewModalData?.email || ''}
        surveyTitle={reviewModalData?.surveyTitle}
        onConfirm={handleReviewModalConfirm}
      />
    </div>
  );
}
