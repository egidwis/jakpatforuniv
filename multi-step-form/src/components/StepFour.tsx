import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { SurveyFormData, CostCalculation } from '../types';
import { calculateTotalCost, getVoucherInfo } from '../utils/cost-calculator';
import { saveFormSubmission, type FormSubmission } from '../utils/supabase';
// Import the simplified payment utility
import { createPayment } from '../utils/simple-payment';
import { sendToGoogleSheetsBackground } from '../utils/sheets-service';
import { useLanguage } from '../i18n/LanguageContext';

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
        payment_status: 'pending'
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
          window.open(`${window.location.origin}/submit-success.html`, '_self');
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
    <div>
      <h2 className="text-lg font-semibold mb-2">{t('reviewAndPayment')}</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        Pastikan kamu review survei sebelum melakukan pembayaran
      </p>

      {/* Warning Banner for Personal Data Detection */}
      {formData.hasPersonalDataQuestions && formData.detectedKeywords && formData.detectedKeywords.length > 0 && (
        <div style={{
          backgroundColor: '#fef3c7',
          border: '2px solid #f59e0b',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ flexShrink: 0, marginTop: '0.125rem' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="#f59e0b">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#92400e', marginBottom: '0.5rem' }}>
                ⚠️ Form Anda Mengandung Data Pribadi - Memerlukan Review Admin
              </h4>
              <p style={{ fontSize: '0.875rem', color: '#92400e', marginBottom: '0.5rem', lineHeight: '1.5' }}>
                Terdeteksi pertanyaan tentang: <strong>{formData.detectedKeywords.join(', ')}</strong>
              </p>
              <p style={{ fontSize: '0.875rem', color: '#92400e', lineHeight: '1.5', marginBottom: '0.75rem' }}>
                Sesuai kebijakan Jakpat, form ini akan <strong>direview manual oleh admin</strong> sebelum dipublikasikan.
                Anda tidak perlu melakukan pembayaran saat ini. Tim kami akan menghubungi Anda untuk konfirmasi.
              </p>
              <div style={{
                backgroundColor: '#fed7aa',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                color: '#92400e'
              }}>
                💡 <strong>Tips:</strong> Untuk proses otomatis, sebaiknya edit Google Form Anda dan hapus pertanyaan data pribadi.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* SECTION: SURVEY OVERVIEW */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-icon">📋</span>
            <h3 className="section-title">SURVEY OVERVIEW</h3>
          </div>

          <div className="review-card">
            <h4 className="font-semibold text-base mb-4">{formData.title}</h4>

            {/* Grid layout: Questions & Duration side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <span className="review-icon">📝</span>
                <div className="review-content">
                  <div className="review-label">Questions</div>
                  <div className="review-value">{formData.questionCount} pertanyaan</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <span className="review-icon">⏱️</span>
                <div className="review-content">
                  <div className="review-label">Duration</div>
                  <div className="review-value">{formData.duration} hari</div>
                </div>
              </div>
            </div>

            {/* Full width: Incentive */}
            <div className="review-item" style={{ marginBottom: '1.25rem' }}>
              <span className="review-icon">🎁</span>
              <div className="review-content">
                <div className="review-label">Incentive</div>
                <div className="review-value">{formData.winnerCount} pemenang × Rp {formatRupiah(formData.prizePerWinner)}</div>
              </div>
            </div>

            {/* Full width: Target Criteria */}
            <div className="review-item" style={{ marginBottom: 0 }}>
              <span className="review-icon">🎯</span>
              <div className="review-content">
                <div className="review-label">Target Criteria</div>
                <div className="review-value">{formData.criteriaResponden}</div>
              </div>
            </div>
          </div>

          {/* Compact user info */}
          <div className="rounded-lg" style={{ marginTop: '1.5rem', padding: '0.875rem 1rem', background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--muted-foreground)' }}>Contact Info</div>
            <div className="text-sm space-y-1">
              <div>{formData.fullName} • {formData.status}</div>
              <div style={{ color: 'var(--muted-foreground)' }}>{formData.email} • {formData.phoneNumber}</div>
            </div>
          </div>
        </div>

        {/* SECTION: PROMO CODE (Optional) */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-icon">🎟️</span>
            <h3 className="section-title">PROMO CODE (Optional)</h3>
            {voucherInfo.isValid && (
              <span className="section-badge">✓</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="voucherCode" className="form-label">Kode voucher/referal</label>
            <div className="input-wrapper">
              <input
                id="voucherCode"
                type="text"
                className="form-input input-with-validation"
                placeholder="Masukkan kode jika ada"
                value={formData.voucherCode || ''}
                onChange={handleVoucherChange}
              />
            </div>
            {voucherInfo.isValid && voucherInfo.message && (
              <div className="info-box success mt-2">
                <p className="text-sm font-medium">
                  ✅ {voucherInfo.message}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* SECTION: COST BREAKDOWN */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-icon">💰</span>
            <h3 className="section-title">COST BREAKDOWN</h3>
          </div>

          <div className="cost-breakdown">
            <div className="cost-item">
              <div>
                <div className="cost-label">Ad Campaign Cost</div>
                <div className="text-xs text-gray-500 mt-1">
                  {formData.questionCount} pertanyaan × {formData.duration} hari
                </div>
              </div>
              <div className="cost-value">Rp {formatRupiah(costCalculation.adCost)}</div>
            </div>

            <div className="cost-item">
              <div>
                <div className="cost-label">Respondent Incentive</div>
                <div className="text-xs text-gray-500 mt-1">
                  {formData.winnerCount} pemenang × Rp {formatRupiah(formData.prizePerWinner)}
                </div>
              </div>
              <div className="cost-value">Rp {formatRupiah(costCalculation.incentiveCost)}</div>
            </div>

            <div className="cost-item">
              <div className="cost-label">Subtotal</div>
              <div className="cost-value">Rp {formatRupiah(costCalculation.adCost + costCalculation.incentiveCost)}</div>
            </div>

            {costCalculation.discount > 0 && (
              <div className="cost-item">
                <div className="cost-label">Discount</div>
                <div className="cost-value cost-discount">- Rp {formatRupiah(costCalculation.discount)}</div>
              </div>
            )}

            <div className="cost-item total">
              <div className="cost-label">TOTAL PAYMENT</div>
              <div className="cost-value" style={{fontSize: '1.5rem', color: 'var(--primary)'}}>
                Rp {formatRupiah(costCalculation.totalCost)}
              </div>
            </div>
          </div>

          <div className="info-box info mt-4">
            <p className="text-xs">
              ℹ️ <strong>Note:</strong> By proceeding, you agree to our{' '}
              <a href="https://jakpatforuniv.com/terms-conditions" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Terms of Service
              </a>
              {' '}and{' '}
              <a href="https://jakpatforuniv.com/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                Privacy Policy
              </a>
            </p>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex justify-between mt-8">
          <button
            type="button"
            className="button button-secondary"
            onClick={prevStep}
          >
            ← Kembali
          </button>
          <button
            type="button"
            className="button button-primary px-8"
            onClick={handleSubmit}
            style={{
              fontSize: '1rem',
              fontWeight: '600',
              backgroundColor: formData.hasPersonalDataQuestions ? '#f59e0b' : undefined
            }}
          >
            {formData.hasPersonalDataQuestions ? (
              <>📋 Submit untuk Review Admin</>
            ) : (
              <>💳 Proceed to Payment</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
