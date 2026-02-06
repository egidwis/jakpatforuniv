import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { SurveyFormData, CostCalculation } from '../types';
import { calculateTotalCost, getVoucherInfo } from '../utils/cost-calculator';
import { saveFormSubmission, type FormSubmission } from '../utils/supabase';
import { createPayment } from '../utils/simple-payment';
import { sendToGoogleSheetsBackground } from '../utils/sheets-service';
import { useLanguage } from '../i18n/LanguageContext';
import {
  Ticket,
  Wallet,
  CheckCircle,
  AlertTriangle,
  FileText,
  Clock,
  Gift,
  Target,

  CreditCard,
  Send
} from 'lucide-react';

interface StepFourProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  prevStep: () => void;
}

export function StepFour({ formData, updateFormData, prevStep }: StepFourProps) {
  const { t } = useLanguage();

  const [costCalculation, setCostCalculation] = useState<CostCalculation>({
    adCost: 0,
    incentiveCost: 0,
    discount: 0,
    totalCost: 0
  });

  const [voucherInfo, setVoucherInfo] = useState<{ isValid: boolean; message?: string; discount?: number }>({ isValid: false });
  const [isTermsAccepted, setIsTermsAccepted] = useState(false);

  // Hitung biaya saat form data berubah
  useEffect(() => {
    const calculation = calculateTotalCost(formData);
    setCostCalculation(calculation);

    // Update voucher info
    const info = getVoucherInfo(formData.voucherCode);
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
    try {
      // Validasi data
      if (!isTermsAccepted) {
        toast.error(t('errorTermsRequired'));
        return;
      }

      if (!formData.title || !formData.description || !formData.questionCount || !formData.duration) {
        toast.error(t('errorCompleteAllSurveyData'));
        return;
      }

      // Cek apakah form diisi secara manual
      const isManualForm = formData.isManualEntry || !formData.surveyUrl.includes('docs.google.com/forms');
      console.log('Form submission type check:', {
        isManualEntry: formData.isManualEntry,
        surveyUrl: formData.surveyUrl,
        containsGoogleForms: formData.surveyUrl.includes('docs.google.com/forms'),
        isManualForm: isManualForm
      });

      // Tampilkan loading toast
      const loadingToast = toast.loading('Menyimpan data dan mempersiapkan pembayaran...');

      // Siapkan data untuk disimpan ke Supabase
      const submissionData: FormSubmission = {
        survey_url: formData.surveyUrl,
        title: formData.title,
        description: formData.description,
        question_count: formData.questionCount,
        criteria_responden: formData.criteriaResponden,
        duration: formData.duration,
        start_date: formData.startDate || new Date().toISOString().split('T')[0],
        end_date: formData.endDate || new Date(Date.now() + formData.duration * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        full_name: formData.fullName,
        email: formData.email,
        phone_number: formData.phoneNumber,
        university: formData.university,
        department: formData.department,
        status: formData.status || 'pending',
        referral_source: formData.referralSource === 'Lainnya' && formData.referralSourceOther
          ? `Lainnya: ${formData.referralSourceOther}`
          : formData.referralSource,
        winner_count: formData.winnerCount,
        prize_per_winner: formData.prizePerWinner,
        voucher_code: formData.voucherCode,
        total_cost: costCalculation.totalCost,
        payment_status: 'pending',
        submission_method: isManualForm ? 'manual' : 'google_import',
        detected_keywords: formData.detectedKeywords || []
      };

      // Simpan data ke Supabase dengan penanganan error yang lebih baik
      let savedData;
      try {
        savedData = await saveFormSubmission(submissionData);
        console.log('Data berhasil disimpan:', savedData);

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
          .then(data => console.log('Email sent response:', data))
          .catch(err => console.error('Failed to send email:', err));
      } catch (e) {
        console.error('Error initiating email send:', e);
      }

      // Jika form diisi secara manual, bukan Google Form, atau memiliki personal data questions, redirect ke halaman submit-success
      if (isManualForm || formData.hasPersonalDataQuestions) {
        const reasonForReview = formData.hasPersonalDataQuestions
          ? 'contains personal data questions'
          : 'manual form entry';
        console.log(`Form needs admin review (${reasonForReview}), redirect ke halaman submit-success`);

        // Kirim data ke Google Sheets untuk manual form juga
        if (savedData && savedData.id) {
          console.log('Mengirim data manual form ke Google Sheets untuk form ID:', savedData.id);
          sendToGoogleSheetsBackground(savedData.id, 'manual_form_submission');
        }

        // Dismiss loading toast
        toast.dismiss(loadingToast);

        // Tampilkan success toast dengan pesan khusus untuk form dengan personal data
        if (formData.hasPersonalDataQuestions) {
          toast.success('Form Anda telah dikirim untuk review admin. Kami akan menghubungi Anda segera.');
        } else {
          toast.success(t('successFormSubmitted'));
        }

        // Tambahkan delay kecil agar toast terlihat
        setTimeout(() => {
          // Redirect ke halaman submit-success
          console.log('Melakukan redirect ke halaman submit-success');
          // Clear draft before redirecting
          localStorage.removeItem('survey_form_draft');
          window.open(`${window.location.origin}/dashboard/status?status=survey_submitted`, '_self');
        }, 1500);

      }
      // Jika form adalah Google Form, lanjutkan dengan pembayaran
      else {
        // Simplified payment flow
        try {
          console.log('Memulai proses pembayaran untuk form ID:', savedData.id);

          // Create payment with simplified function
          const paymentUrl = await createPayment({
            formSubmissionId: savedData.id,
            amount: costCalculation.totalCost,
            customerInfo: {
              title: formData.title,
              fullName: formData.fullName || 'Pengguna',
              email: formData.email || 'user@example.com',
              phoneNumber: formData.phoneNumber || '-'
            }
          });

          console.log('Payment URL diterima:', paymentUrl);

          // Dismiss loading toast
          toast.dismiss(loadingToast);

          // Tampilkan success toast untuk pembayaran nyata
          toast.success(t('successPaymentRedirect'));

          // Tambahkan delay kecil agar toast terlihat
          setTimeout(() => {
            // Redirect ke halaman pembayaran
            console.log('Melakukan redirect ke:', paymentUrl);
            // Clear draft before redirecting
            localStorage.removeItem('survey_form_draft');
            // Use window.open instead of window.location.href to avoid issues
            window.open(paymentUrl, '_self');
          }, 1500);

        } catch (paymentError: any) {
          // Dismiss loading toast
          toast.dismiss(loadingToast);
          console.error('Error saat membuat pembayaran:', paymentError);
          toast.error(t('errorPaymentFailed'));
        }
      }
    } catch (error: any) {
      console.error('Error saat menyimpan data:', error);
      toast.error(t('errorSavingDataGeneric'));
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Title removed/minimized per design */}

      <div className="space-y-8">
        {/* Warning Banner for Personal Data Detection */}
        {formData.hasPersonalDataQuestions && formData.detectedKeywords && formData.detectedKeywords.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-amber-900 mb-3 flex items-center gap-2">
                  {t('personalDataWarningTitle')}
                </h4>

                {/* Detected Keywords Tags */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {formData.detectedKeywords.map((keyword, i) => (
                    <span key={i} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 capitalize">
                      {keyword}
                    </span>
                  ))}
                </div>

                <p className="text-sm text-amber-800 leading-relaxed mb-4">
                  {t('personalDataWhatHappensDetail')}
                </p>

                {/* Styled Tips Box */}
                <div className="bg-white/60 border border-amber-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2 text-amber-900 font-semibold text-xs uppercase tracking-wide">
                    <span className="text-base">💡</span> {t('personalDataPolicyExplanation')}
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-amber-800/90 ml-1">
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">•</span> {t('personalDataExample1')}
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">•</span> {t('personalDataExample2')}
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">•</span> {t('personalDataExample3')}
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">•</span> {t('personalDataExample4')}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION: SURVEY OVERVIEW (COMPACT) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <h4 className="font-semibold text-gray-900 line-clamp-1">{formData.title}</h4>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
              {/* Metric 1 */}
              <div>
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">{t('questions')}</div>
                <div className="flex items-center gap-2 font-medium text-sm text-gray-900">
                  <FileText size={14} style={{ color: '#0091ff' }} />
                  {formData.questionCount}
                </div>
              </div>

              {/* Metric 2 */}
              <div>
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">{t('duration')}</div>
                <div className="flex items-center gap-2 font-medium text-sm text-gray-900">
                  <Clock size={14} className="text-indigo-500" />
                  {formData.duration} {formData.duration === 1 ? 'day' : 'days'}
                </div>
              </div>

              {/* Metric 3 */}
              <div className="md:col-span-2">
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">{t('incentive')}</div>
                <div className="flex items-center gap-2 font-medium text-sm text-gray-900">
                  <Gift size={14} className="text-emerald-500" />
                  {formData.winnerCount} winners × Rp {formatRupiah(formData.prizePerWinner)}
                </div>
              </div>

              {/* Row 2: Target Criteria (Full Width in its row) */}
              <div className="col-span-2 md:col-span-4 pt-3 border-t border-gray-100 mt-1">
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">{t('targetCriteria')}</div>
                <div className="flex items-start gap-2 text-xs text-gray-700 leading-relaxed">
                  <Target size={14} className="text-rose-500 mt-0.5 flex-shrink-0" />
                  {formData.criteriaResponden}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION: PROMO CODE */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600">
                <Ticket size={18} />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{t('promoCode')}</h3>
            </div>
            {voucherInfo.isValid && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                <CheckCircle size={12} />
                <span>Applied</span>
              </div>
            )}
          </div>

          <div className="p-6">
            <label htmlFor="voucherCode" className="text-sm font-medium text-gray-700 mb-2 block">{t('voucherCodeLabel')}</label>
            <div className="relative">
              <input
                id="voucherCode"
                type="text"
                className={`w-full px-4 py-2.5 rounded-lg border text-sm transition-all duration-200
                  ${voucherInfo.isValid
                    ? 'border-emerald-200 focus:ring-emerald-200 bg-emerald-50/30 text-emerald-900'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                  }
                `}
                style={!voucherInfo.isValid ? { outlineColor: '#0091ff' } : {}}
                onFocus={(e) => {
                  if (!voucherInfo.isValid) {
                    e.target.style.borderColor = '#0091ff';
                    e.target.style.boxShadow = '0 0 0 4px rgba(0, 145, 255, 0.1)';
                  }
                }}
                onBlur={(e) => {
                  if (!voucherInfo.isValid) {
                    e.target.style.borderColor = '#e5e7eb';
                    e.target.style.boxShadow = 'none';
                  }
                }}
                placeholder={t('voucherCodePlaceholder')}
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
                  <div className="text-sm font-medium text-gray-900">{t('adCampaignCost')}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{formData.questionCount} {t('questions').toLowerCase()} × {formData.duration} {formData.duration === 1 ? 'day' : 'days'}</div>
                </div>
                <div className="text-sm font-medium text-gray-900">Rp {formatRupiah(costCalculation.adCost)}</div>
              </div>

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

              {/* Total */}
              <div className="flex justify-between items-end pt-4">
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
                href="https://jakpatforuniv.com/privacy-policy"
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
                href="https://jakpatforuniv.com/terms-conditions"
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
            className={`
            px-8 py-3 rounded-xl text-white font-bold text-base shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2
            ${formData.hasPersonalDataQuestions
                ? 'bg-amber-500 hover:bg-amber-600'
                : 'shadow-lg hover:shadow-xl'
              }
          `}
            style={!formData.hasPersonalDataQuestions ? { background: 'linear-gradient(135deg, #0091ff 0%, #0077cc 100%)', boxShadow: '0 4px 12px rgba(0, 145, 255, 0.3)' } : {}}
          >
            {formData.hasPersonalDataQuestions ? (
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
