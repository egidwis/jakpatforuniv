import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { SurveyFormData, CostCalculation } from '../types';
import { calculateTotalCost, getVoucherInfo } from '../utils/cost-calculator';
import { saveFormSubmission, deleteFormSubmission, updateFormSubmissionById, getFormSubmissionById, getOwnProfile, type FormSubmission } from '../utils/supabase';
import { resolveSubmissionMode, type SubmissionMode } from '../utils/submissionMode';
import { sendToGoogleSheetsBackground } from '../utils/sheets-service';
import { fetchSlotAvailability } from '../utils/supabase';
import { MAX_REGULAR_ADS_PER_DAY, MAX_KILAT_ADS_PER_DAY, SURVEY_DRAFT_KEY, LEGACY_SURVEY_DRAFT_KEY } from '../utils/constants';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { Switch } from './ui/switch';
import {
  Ticket,
  Wallet,
  CheckCircle,
  AlertTriangle,
  FileText,
  Clock,
  Gift,
  Target,
  Info,
  CreditCard,
  Send,
  ExternalLink,
  CalendarCheck,
  User,
  Mail,
  Phone,
  Zap
} from 'lucide-react';

interface StepCheckoutProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  prevStep: () => void;
  onUpgradeKilat?: () => void;
  onUndoKilat?: () => void;
}

export function StepCheckout({ formData, updateFormData, prevStep, onUpgradeKilat, onUndoKilat }: StepCheckoutProps) {
  const { t } = useLanguage();
  const { user } = useAuth();

  const [costCalculation, setCostCalculation] = useState<CostCalculation>({
    adCost: 0,
    incentiveCost: 0,
    subtotal: 0,
    ppn: 0,
    discount: 0,
    totalCost: 0
  });

  const [voucherInfo, setVoucherInfo] = useState<{ isValid: boolean; message?: string; discount?: number }>({ isValid: false });
  const [isTermsAccepted, setIsTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  // Detail Invoice: default diambil dari data akun (profil + auth); toggle OFF
  // untuk mengisi kontak invoice custom khusus order ini (tidak mengubah profil).
  const [useAccountData, setUseAccountData] = useState(false);
  const [accountDefaults, setAccountDefaults] = useState<{ fullName: string; email: string; phoneNumber: string } | null>(null);

  // Derive auto approval status
  const isManualForm = formData.isManualEntry || (formData.surveyUrl && !formData.surveyUrl.includes('docs.google.com/forms'));
  const isAutoApproval = !isManualForm && !formData.hasPersonalDataQuestions && formData.voucherCode?.toUpperCase() !== 'JFUFEB';

  // Email invoice berbeda dari email login → invoice terkirim ke email custom
  const isEmailMismatch = user?.email && formData.email && formData.email.trim().toLowerCase() !== user.email.toLowerCase();

  useEffect(() => {
    let cancelled = false;
    getOwnProfile().then(profile => {
      if (cancelled) return;
      const defaults = {
        fullName: profile?.full_name || user?.user_metadata?.full_name || '',
        email: user?.email || profile?.email || '',
        phoneNumber: profile?.phone_number || '',
      };
      setAccountDefaults(defaults);
      // Cocokkan data hanya jika data formulir tidak kosong
      const matchesAccount =
        formData.fullName === defaults.fullName &&
        formData.email === defaults.email &&
        formData.phoneNumber === defaults.phoneNumber &&
        formData.fullName !== '';
      if (matchesAccount) {
        setUseAccountData(true);
      } else {
        setUseAccountData(false);
      }
    });
    return () => { cancelled = true; };
  }, [user, formData.fullName, formData.email, formData.phoneNumber]);

  const handleUseAccountDataChange = (checked: boolean) => {
    setUseAccountData(checked);
    if (checked && accountDefaults) {
      updateFormData({
        fullName: accountDefaults.fullName,
        email: accountDefaults.email,
        phoneNumber: accountDefaults.phoneNumber
      });
    } else {
      updateFormData({
        fullName: '',
        email: '',
        phoneNumber: ''
      });
    }
  };

  // Hitung biaya saat form data berubah
  useEffect(() => {
    const calculation = calculateTotalCost(formData);
    setCostCalculation(calculation);

    // Update voucher info
    const info = getVoucherInfo(formData.voucherCode, formData.duration);
    setVoucherInfo(info);
  }, [formData.questionCount, formData.duration, formData.winnerCount, formData.prizePerWinner, formData.voucherCode]);

  // Format angka ke format rupiah
  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat('id-ID').format(amount);
  };

  // Fungsi untuk handle perubahan kode voucher
  const handleVoucherChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateFormData({ voucherCode: e.target.value });
  };

  // Fungsi untuk menyimpan data ke Supabase dan membuat pembayaran
  const handleSubmit = async () => {
    // Guard: prevent double-submit using ref (synchronous, immune to React batching)
    if (isSubmittingRef.current) {
      console.log('Submit already in progress, ignoring duplicate click');
      return;
    }
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // Validasi data
      if (!isTermsAccepted) {
        toast.error(t('errorTermsRequired'));
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }

      if (!formData.title || !formData.description || !formData.questionCount || !formData.duration) {
        toast.error(t('errorCompleteAllSurveyData'));
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }

      // Validasi kontak invoice (eks validasi StepTwo — biodata kini dari profil)
      if (!formData.fullName || !formData.fullName.trim()) {
        toast.error(t('errorFullNameEmpty'));
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }
      if (!formData.email || !formData.email.trim() || !formData.email.includes('@') || !formData.email.includes('.')) {
        toast.error(t('errorEmailInvalid'));
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }
      if (!formData.phoneNumber || formData.phoneNumber.trim().length < 10) {
        toast.error(t('errorPhoneMinLength'));
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }

      // Cek apakah form diisi secara manual
      // (isManualForm and isAutoApproval is calculated at component level)

      // Jika auto approval, pastikan sudah pilih jadwal
      if (isAutoApproval) {
        if (!formData.startDate || !formData.startTime) {
          toast.error('Gagal melanjutkan: Tanggal dan waktu mulai iklan belum dipilih. Silahkan kembali ke step sebelumnya.');
          isSubmittingRef.current = false;
          setIsSubmitting(false);
          return;
        }
      }

      // Tampilkan loading toast
      const loadingMessage = isAutoApproval ? 'Mengecek slot & menyimpan data...' : 'Menyimpan data...';
      const loadingToast = toast.loading(loadingMessage);

      let calculatedStartDate = null;
      let calculatedEndDate = null;

      // Double-check availability for auto-approval
      if (isAutoApproval && formData.startDate && formData.startTime) {
        try {
          const startDay = new Date(formData.startDate);

          if (formData.isKilatUpgrade) {
            // Kilat: check single day against kilat slot pool
            const { regularCounts: kilatCounts } = await fetchSlotAvailability(undefined, 'kilat');
            const dateStr = `${startDay.getFullYear()}-${String(startDay.getMonth() + 1).padStart(2, '0')}-${String(startDay.getDate()).padStart(2, '0')}`;
            if ((kilatCounts[dateStr] || 0) >= MAX_KILAT_ADS_PER_DAY) {
              toast.dismiss(loadingToast);
              toast.error('Ups! Slot Kilat pada tanggal yang Anda pilih telah penuh. Silakan kembali memilih tanggal lain.');
              isSubmittingRef.current = false;
              setIsSubmitting(false);
              return;
            }
          } else {
            // Regular: validate capacity across duration
            const { regularCounts } = await fetchSlotAvailability();
            let isAvailable = true;
            const current = new Date(startDay);
            current.setHours(0, 0, 0, 0);

            for (let i = 0; i < formData.duration; i++) {
              const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
              const count = regularCounts[dateStr] || 0;
              if (count >= MAX_REGULAR_ADS_PER_DAY) {
                isAvailable = false;
                break;
              }
              current.setDate(current.getDate() + 1);
            }

            if (!isAvailable) {
              toast.dismiss(loadingToast);
              toast.error('Ups! Slot pada rentang tanggal yang Anda pilih telah penuh. Silakan kembali mengatur ulang tanggal di step Jadwal.');
              isSubmittingRef.current = false;
              setIsSubmitting(false);
              return;
            }
          }

          // Calculate valid UTC dates
          const [valHours, valMinutes] = formData.startTime.split(':').map(Number);
          startDay.setHours(valHours, valMinutes, 0, 0);
          calculatedStartDate = startDay.toISOString();

          const endDay = new Date(startDay);
          endDay.setDate(endDay.getDate() + (formData.isKilatUpgrade ? 1 : formData.duration));
          calculatedEndDate = endDay.toISOString();

        } catch (error) {
          toast.dismiss(loadingToast);
          toast.error('Gagal mengecek ketersediaan slot. Coba lagi.');
          isSubmittingRef.current = false;
          setIsSubmitting(false);
          return;
        }
      } else if (formData.isKilatUpgrade && formData.startDate && formData.startTime) {
        // Kilat + non-autoApproval (manual/sensitive): save chosen schedule as kilat slot reservation
        const kilatDay = new Date(formData.startDate);
        const [h, m] = formData.startTime.split(':').map(Number);
        kilatDay.setHours(h, m, 0, 0);
        calculatedStartDate = kilatDay.toISOString();
        calculatedEndDate = new Date(kilatDay.getTime() + 86400000).toISOString();
      }

      // Raw reschedule intent carried in the form draft (may be stale — an
      // abandoned reschedule can leave this behind and leak into a new survey).
      const rescheduleIntent = {
        isReschedule: (formData as any).isReschedule === true,
        submissionIdToReplace: (formData as any).submissionIdToReplace as string | undefined,
      };

      // Siapkan data untuk disimpan ke Supabase
      const submissionData: FormSubmission = {
        survey_url: formData.surveyUrl,
        title: formData.title,
        description: formData.description,
        question_count: formData.questionCount,
        criteria_responden: formData.criteriaResponden,
        duration: formData.duration,
        start_date: calculatedStartDate,
        end_date: calculatedEndDate,
        full_name: formData.fullName,
        email: formData.email,
        phone_number: formData.phoneNumber,
        university: formData.university,
        department: formData.department,
        status: formData.status || 'pending',
        submission_status: isAutoApproval ? 'waiting_payment' : 'in_review', // waiting_payment for user payment, in_review for manual
        referral_source: formData.referralSource === 'Lainnya' && formData.referralSourceOther
          ? `Lainnya: ${formData.referralSourceOther}`
          : formData.referralSource,
        winner_count: formData.winnerCount,
        prize_per_winner: formData.prizePerWinner,
        voucher_code: formData.voucherCode,
        total_cost: costCalculation.totalCost,
        subtotal: costCalculation.subtotal,
        ppn_amount: costCalculation.ppn,
        payment_status: 'pending',
        submission_method: isManualForm ? 'manual' : 'google_import',
        detected_keywords: formData.detectedKeywords || [],
        auth_user_id: user?.id,
        distribution_type: formData.isKilatUpgrade ? 'kilat' : 'regular',
        ...(isAutoApproval || formData.isKilatUpgrade ? {
          slot_booked_by: 'user',
          slot_reserved_at: new Date().toISOString()
        } : {})
      };

      // Simpan data ke Supabase dengan penanganan error yang lebih baik
      let savedData;
      try {
        // Resolve whether this is a genuine reschedule (update the same survey)
        // or a new submission. Guards against stale reschedule intent leaking
        // from an abandoned draft and overwriting a *different* survey in place.
        let mode: SubmissionMode = { mode: 'create' };
        if (rescheduleIntent.isReschedule && rescheduleIntent.submissionIdToReplace) {
          let existingSurveyUrl: string | null = null;
          try {
            const existing = await getFormSubmissionById(rescheduleIntent.submissionIdToReplace);
            existingSurveyUrl = existing?.survey_url ?? null;
          } catch (e) {
            console.warn('Could not load reschedule target; treating as new submission:', e);
          }
          mode = resolveSubmissionMode(rescheduleIntent, submissionData.survey_url, existingSurveyUrl);
          if (mode.mode === 'create') {
            console.warn('Reschedule intent did not match the target survey — creating a new submission instead of overwriting.');
          }
        }

        if (mode.mode === 'reschedule') {
          // Genuine reschedule: update existing submission instead of creating new
          console.log('Rescheduling submission:', mode.submissionId);
          savedData = await updateFormSubmissionById(mode.submissionId, submissionData);
          console.log('Submission updated successfully:', savedData);
        } else {
          // New submission: create new record
          savedData = await saveFormSubmission(submissionData);
          console.log('New submission saved:', savedData);
        }

        // Kirim data ke Google Sheets secara background hanya untuk Google Forms
        // Manual forms akan dikirim di bagian isManualForm
        if (savedData && savedData.id && !isManualForm) {
          console.log('Mengirim data Google Form ke Google Sheets untuk form ID:', savedData.id);
          sendToGoogleSheetsBackground(savedData.id, 'google_form_submission');
        }
      } catch (saveError: any) {
        console.error('Error saat menyimpan data:', saveError);
        toast.dismiss(loadingToast);
        toast.error(t('errorSavingData'));
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }

      // Kirim email notifikasi ke user (Async - tidak memblokir flow utama)
      try {
        fetch('/api/send-submission-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.fullName || 'Kak',
            email: formData.email
          })
        }).then(res => res.json())
          .catch(err => console.error('Failed to send email:', err));
      } catch (e) { }

      if (!isAutoApproval) {
        // MANUAL ATAU SENSITIVE DATA
        const reasonForReview = formData.hasPersonalDataQuestions
          ? 'contains personal data questions'
          : formData.voucherCode?.toUpperCase() === 'JFUFEB'
            ? 'voucher JFUFEB used'
            : 'manual form entry';
        console.log(`Form needs admin review (${reasonForReview}), redirect ke halaman submit-success`);

        if (savedData && savedData.id && isManualForm) {
          sendToGoogleSheetsBackground(savedData.id, 'manual_form_submission');
        }

        toast.dismiss(loadingToast);

        if (formData.hasPersonalDataQuestions) {
          toast.success('Form Anda telah dikirim untuk review admin. Kami akan menghubungi Anda segera.');
        } else {
          toast.success(t('successFormSubmitted'));
        }

        setTimeout(() => {
          localStorage.removeItem(SURVEY_DRAFT_KEY);
          localStorage.removeItem(LEGACY_SURVEY_DRAFT_KEY);
          window.open(`${window.location.origin}/dashboard/status?status=survey_submitted`, '_self');
        }, 1500);

      } else {
        // AUTO APPROVAL (SLOT RESERVED)
        console.log('Slot berhasil di-booking, redirect ke halaman Payment Verification');

        toast.dismiss(loadingToast);
        toast.success('Slot berhasil diamankan. Silahkan selesaikan pembayaran.');

        setTimeout(() => {
          localStorage.removeItem(SURVEY_DRAFT_KEY);
          localStorage.removeItem(LEGACY_SURVEY_DRAFT_KEY);
          // Navigate to new local PaymentCheckoutPage
          window.open(`${window.location.origin}/dashboard/payment/${savedData.id}`, '_self');
        }, 1500);
      }
    } catch (error: any) {
      console.error('Error saat menyimpan data:', error);
      toast.error(t('errorSavingDataGeneric'));
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Title removed/minimized per design */}

      <div className="space-y-8">
        {/* Warning Banner for Personal Data Detection */}
        {formData.hasPersonalDataQuestions && formData.detectedKeywords && formData.detectedKeywords.length > 0 && (
          <div className="p-4 rounded-xl bg-amber-100/50 border border-amber-200/60 flex flex-col gap-2 mb-6">
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-amber-200 text-amber-700 rounded-lg shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <div>
                <h4 className="font-bold text-amber-900 text-sm">Terdeteksi Pertanyaan Data Pribadi</h4>
                <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                  Sistem mendeteksi form ini menanyakan: <strong className="bg-amber-200/60 px-1.5 py-0.5 rounded capitalize">{formData.detectedKeywords.join(', ')}</strong>.
                  Sesuai <a href="/homepage/terms-conditions.html" target="_blank" rel="noopener noreferrer" className="font-bold underline decoration-amber-700/30 hover:text-amber-900 transition-colors">Syarat dan Ketentuan</a>, form ini akan memerlukan <strong>Review Manual</strong> oleh tim admin sebelum dilanjutkan ke tahap pembayaran.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Warning Banner for JFUFEB Voucher */}
        {formData.voucherCode?.toUpperCase() === 'JFUFEB' && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 mt-0.5">
                <Info className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
                  Verifikasi Voucher Promo
                </h4>
                <p className="text-sm text-blue-800 leading-relaxed">
                  Penggunaan voucher <strong>JFUFEB</strong> memerlukan verifikasi manual oleh admin. Form Anda akan dikirimkan untuk direview dan Anda belum perlu melakukan pembayaran sekarang. Admin akan segera memproses pesanan Anda.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SECTION: SURVEY OVERVIEW (ORDER REQUEST) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200 mb-4 hover:shadow-md">
          {/* Card Header */}
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
                <FileText size={18} />
              </div>
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">{t('orderOverviewTitle')}</h3>
            </div>
            
            {/* Elegant Header Status Badge for JFU Kilat */}
            {formData.isKilatUpgrade && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs">
                <Zap size={11} className="fill-white" />
                JFU KILAT
              </span>
            )}
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Left Column: Survey Information & Target */}
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{t('surveyAndTarget')}</div>
                  <div className="text-base font-bold text-gray-900 mb-1">{formData.title}</div>
                  <a 
                    href={formData.surveyUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 hover:underline text-xs break-all"
                  >
                    <ExternalLink size={12} className="shrink-0" />
                    {formData.surveyUrl}
                  </a>
                </div>
                
                <div className="flex items-start gap-2.5 text-xs text-gray-700 bg-gray-50/80 p-3 rounded-lg border border-gray-200/50 shadow-xs max-w-full">
                  <Target size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-gray-600 mb-0.5">Kriteria Responden</div>
                    <span className="leading-relaxed">{formData.criteriaResponden}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Specification */}
              <div className="space-y-4">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Spesifikasi Survei</div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Qs & Duration */}
                  <div className="flex gap-2.5 items-start">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0">
                      <FileText size={14} className="text-gray-500" />
                    </div>
                    <div>
                      <div className="text-[10px] font-medium text-gray-400 uppercase">{t('questionsAndDuration')}</div>
                      <div className="text-xs font-semibold text-gray-900 mt-0.5">
                        {formData.questionCount} Qs • {formData.isKilatUpgrade ? t('kilatDuration') : `${formData.duration} ${t('days')}`}
                      </div>
                    </div>
                  </div>

                  {/* Incentive */}
                  <div className="flex gap-2.5 items-start">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center shrink-0">
                      <Gift size={14} className="text-gray-500" />
                    </div>
                    <div>
                      <div className="text-[10px] font-medium text-gray-400 uppercase">{t('respondentIncentiveLabel')}</div>
                      <div className="text-xs font-semibold text-gray-900 mt-0.5">
                        {formData.winnerCount} {t('winner')}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-0.5">@ Rp {formatRupiah(formData.prizePerWinner)}</div>
                    </div>
                  </div>

                  {/* Release Schedule (If Auto Approval) */}
                  {isAutoApproval && formData.startDate && (
                    <div className="flex gap-2.5 items-start sm:col-span-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                        <CalendarCheck size={14} className="text-blue-500" />
                      </div>
                      <div>
                        <div className="text-[10px] font-medium text-blue-500 uppercase">{t('releaseSchedule')}</div>
                        <div className="text-xs font-bold text-blue-900 mt-0.5">
                          {new Date(formData.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - {
                            (() => {
                              const ed = new Date(formData.startDate);
                              ed.setDate(ed.getDate() + (formData.duration || 1));
                              return ed.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                            })()
                          } (15:00 WIB)
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Mode JFU Kilat Active Banner (Simplified footer) */}
              {formData.isKilatUpgrade && (
                <div className="md:col-span-2 border-t border-dashed border-gray-150 pt-4 mt-2 w-full flex flex-col gap-1">
                  {/* Line 1: Title & Undo Button */}
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 text-xs text-amber-800 font-bold">
                      <Zap size={14} className="fill-amber-500 text-amber-500 shrink-0" />
                      <span>{t('kilatModeActive')}</span>
                    </div>
                    {onUndoKilat && (
                      <button
                        onClick={onUndoKilat}
                        className="text-xs font-semibold text-gray-400 hover:text-gray-600 hover:underline transition-all whitespace-nowrap"
                      >
                        {t('kilatUndoButton')}
                      </button>
                    )}
                  </div>
                  {/* Line 2: Details */}
                  <div className="pl-[22px] text-[11px] text-amber-600 leading-relaxed">
                    {t('kilatBenefitFast')} &bull; {t('kilatBenefitNoPage')}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* SECTION: INVOICE DETAILS */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 145, 255, 0.1)', color: '#0091ff' }}>
                <User size={18} />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{t('invoiceDetailTitle')}</h3>
            </div>
            <div className="flex items-center gap-2.5 select-none">
              <span className="text-xs font-medium text-gray-600">{t('sameAsAccount')}</span>
              <Switch
                checked={useAccountData}
                onCheckedChange={handleUseAccountDataChange}
                className="data-[state=unchecked]:!bg-gray-300 data-[state=checked]:!bg-blue-600"
              />
            </div>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-xs text-gray-400 -mt-1">{t('invoiceContactHelp')}</p>

            {useAccountData ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><User size={12} /> {t('invoiceNameLabel')}</div>
                  <div className="text-sm font-medium text-gray-900">{formData.fullName || '—'}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><Mail size={12} /> {t('invoiceEmailLabel')}</div>
                  <div className="text-sm font-medium text-gray-900 break-all">{formData.email || '—'}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><Phone size={12} /> {t('invoicePhoneLabel')}</div>
                  <div className="text-sm font-medium text-gray-900">{formData.phoneNumber || '—'}</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label htmlFor="invoiceFullName" className="text-sm font-medium text-gray-700">{t('invoiceNameLabel')} <span className="text-red-500">*</span></label>
                  <input
                    id="invoiceFullName"
                    type="text"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 hover:border-gray-300 transition-all duration-200"
                    placeholder={t('invoiceNamePlaceholder')}
                    value={formData.fullName}
                    onChange={(e) => updateFormData({ fullName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="invoiceEmail" className="text-sm font-medium text-gray-700">{t('invoiceEmailLabel')} <span className="text-red-500">*</span></label>
                  <input
                    id="invoiceEmail"
                    type="email"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 hover:border-gray-300 transition-all duration-200"
                    placeholder={t('invoiceEmailPlaceholder')}
                    value={formData.email}
                    onChange={(e) => updateFormData({ email: e.target.value })}
                  />
                  {isEmailMismatch && (
                    <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg mt-1.5">
                      <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-700">
                        {t('emailMismatchNotice1')} (<strong>{user?.email}</strong>). {t('emailMismatchNotice2')}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="invoicePhoneNumber" className="text-sm font-medium text-gray-700">{t('invoicePhoneLabel')} <span className="text-red-500">*</span></label>
                  <input
                    id="invoicePhoneNumber"
                    type="tel"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 hover:border-gray-300 transition-all duration-200"
                    placeholder={t('invoicePhonePlaceholder')}
                    value={formData.phoneNumber}
                    onChange={(e) => updateFormData({ phoneNumber: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* Divider line */}
            <hr className="border-gray-100 my-5" />

            {/* SECTION: PROMO / REFERRAL CODE INLINE */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label htmlFor="voucherCode" className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {t('voucherTitle')}
                </label>
                {voucherInfo.isValid && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                    <CheckCircle size={12} />
                    <span>{t('voucherApplied')}</span>
                  </div>
                )}
              </div>

              <div className="relative">
                <input
                  id="voucherCode"
                  type="text"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-all duration-200
                    ${voucherInfo.isValid
                      ? 'border-emerald-200 focus:ring-emerald-200 bg-emerald-50/30 text-emerald-900'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                    }
                  `}
                  style={!voucherInfo.isValid ? { outlineColor: '#0091ff' } : {}}
                  onFocus={(e) => {
                    if (!voucherInfo.isValid) {
                      if (voucherInfo.isError) {
                        e.target.style.borderColor = '#ef4444';
                        e.target.style.boxShadow = '0 0 0 4px rgba(239, 68, 68, 0.1)';
                      } else {
                        e.target.style.borderColor = '#0091ff';
                        e.target.style.boxShadow = '0 0 0 4px rgba(0, 145, 255, 0.1)';
                      }
                    }
                  }}
                  onBlur={(e) => {
                    if (!voucherInfo.isValid) {
                      e.target.style.borderColor = '#e5e7eb';
                      e.target.style.boxShadow = 'none';
                    }
                  }}
                  placeholder={t('voucherPlaceholder')}
                  value={formData.voucherCode || ''}
                  onChange={handleVoucherChange}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <Ticket size={16} />
                </div>
              </div>
              
              {voucherInfo.isValid && voucherInfo.message && (
                <p className="text-xs text-emerald-600 flex items-center gap-1 mt-2 font-medium animate-in slide-in-from-left-2">
                  <CheckCircle className="w-3 h-3" /> {voucherInfo.message}
                </p>
              )}
              {!voucherInfo.isValid && voucherInfo.message && (
                <p className={`text-xs flex items-center gap-1 mt-2 font-medium animate-in slide-in-from-left-2 ${voucherInfo.isError ? 'text-red-600' : 'text-gray-500'}`}>
                  {voucherInfo.isError ? <AlertTriangle className="w-3 h-3" /> : <Info className="w-3 h-3" />} {voucherInfo.message}
                </p>
              )}

              {/* Upgrade CTA */}
              {voucherInfo.isValid && voucherInfo.isKilatEligible && !formData.isKilatUpgrade && onUpgradeKilat && (
                <div className="mt-4 p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Zap size={16} className="fill-amber-600" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-amber-900">{t('kilatUpgradeTitle')}</h4>
                      <p className="text-xs text-amber-800 mt-0.5">{t('kilatUpgradeTagline')}</p>
                      <ul className="text-[11px] text-amber-700 mt-2 space-y-1 font-medium">
                        <li className="flex items-center gap-1.5"><CheckCircle size={10} className="text-amber-500" /> {t('kilatBenefitFast')}</li>
                        <li className="flex items-center gap-1.5"><CheckCircle size={10} className="text-amber-500" /> {t('kilatBenefitNoPage')}</li>
                        <li className="flex items-center gap-1.5"><CheckCircle size={10} className="text-amber-500" /> {t('kilatBenefitPrice')}</li>
                      </ul>
                      <button
                        onClick={onUpgradeKilat}
                        className="mt-3 w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1.5"
                      >
                        {t('kilatUpgradeButton')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECTION: COST BREAKDOWN */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                <Wallet size={18} />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{t('costBreakdown')}</h3>
            </div>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              {/* Ad Cost */}
              <div className="flex justify-between items-start pb-4 border-b border-dashed border-gray-200">
                <div>
                  <div className="text-sm font-medium text-gray-900">{formData.isKilatUpgrade ? 'Base Rate Iklan' : t('adCampaignCost')}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{formData.questionCount} {t('questions').toLowerCase()} {formData.isKilatUpgrade ? '' : `× ${formData.duration} hari`}</div>
                </div>
                <div className="text-sm font-medium text-gray-900">Rp {formatRupiah(costCalculation.adCost)}</div>
              </div>

              {/* JFU Kilat Add-on */}
              {formData.isKilatUpgrade && costCalculation.kilatAddonCost && (
                <div className="flex justify-between items-start pb-4 border-b border-dashed border-gray-200">
                  <div>
                    <div className="text-sm font-bold text-amber-600 flex items-center gap-1.5"><Zap size={14} className="fill-amber-600" /> {t('kilatAddonLabel')}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Prioritas distribusi super cepat</div>
                  </div>
                  <div className="text-sm font-bold text-amber-600">Rp {formatRupiah(costCalculation.kilatAddonCost)}</div>
                </div>
              )}

              {/* Incentive Cost */}
              <div className="flex justify-between items-start pb-4 border-b border-dashed border-gray-200">
                <div>
                  <div className="text-sm font-medium text-gray-900">{t('respondentIncentive')}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{formData.winnerCount} winners × Rp {formatRupiah(formData.prizePerWinner)}</div>
                </div>
                <div className="text-sm font-medium text-gray-900">Rp {formatRupiah(costCalculation.incentiveCost)}</div>
              </div>

              {/* Discount (if applicable) */}
              {costCalculation.discount > 0 && (
                <div className="flex justify-between items-center text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg mb-2">
                  <div className="text-sm font-medium flex items-center gap-1">
                    <Ticket size={14} /> {t('discount')}
                  </div>
                  <div className="text-sm font-bold">- Rp {formatRupiah(costCalculation.discount)}</div>
                </div>
              )}

              {/* Subtotal (DPP) */}
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-500">{t('subtotal')}</div>
                <div className="text-sm text-gray-700">Rp {formatRupiah(costCalculation.subtotal)}</div>
              </div>

              {/* PPN 11% */}
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-500">{t('ppn')}</div>
                <div className="text-sm text-gray-700">Rp {formatRupiah(costCalculation.ppn)}</div>
              </div>

              {/* Total */}
              <div className="flex justify-between items-end pt-4 border-t border-dashed border-gray-200">
                <div className="text-base font-bold text-gray-900">{t('totalPayment')}</div>
                <div className="text-2xl font-bold" style={{ color: '#0091ff' }}>Rp {formatRupiah(costCalculation.totalCost)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Terms Agreement Checkbox - Placed Inside Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow duration-200">
          <div className="flex items-start gap-3">
            <div className="flex h-5 items-center">
              <input
                id="terms-checkbox"
                type="checkbox"
                checked={isTermsAccepted}
                onChange={(e) => setIsTermsAccepted(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                style={{ accentColor: '#0091ff' }}
              />
            </div>
            <label htmlFor="terms-checkbox" className="text-sm text-gray-700 leading-relaxed cursor-pointer select-none font-medium">
              {t('byContinuingAgree')}{' '}
              <a
                href="/homepage/privacy-policy.html"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline transition-colors"
                style={{ color: '#0091ff' }}
                onClick={(e) => e.stopPropagation()}
              >
                {t('privacyPolicy')}
              </a>
              {' '}{t('andText')}{' '}
              <a
                href="/homepage/terms-conditions.html"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline transition-colors"
                style={{ color: '#0091ff' }}
                onClick={(e) => e.stopPropagation()}
              >

                {t('termsConditions')}
              </a>
            </label>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex justify-between items-center pt-4 pb-12">
          <button
            type="button"
            className="px-6 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 flex items-center gap-2"
            onClick={prevStep}
          >
            ← {t('backButton')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`
            px-8 py-3 rounded-xl text-white font-bold text-base shadow-lg transition-all duration-200 flex items-center gap-2
            ${isSubmitting
                ? 'opacity-60 cursor-not-allowed pointer-events-none'
                : 'hover:shadow-xl hover:-translate-y-0.5'
              }
            ${!isAutoApproval
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'shadow-lg hover:shadow-xl'
              }
          `}
            style={isAutoApproval ? { background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)', boxShadow: '0 4px 12px rgba(0, 145, 255, 0.3)' } : {}}
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Memproses...
              </>
            ) : !isAutoApproval ? (
              <>
                <Send size={18} />
                {t('submitForReview')}
              </>
            ) : (
              <>
                <CreditCard size={18} />
                {t('proceedPayment')}
              </>
            )}
          </button>
        </div>
      </div>
    </div >
  );
}
