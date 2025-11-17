import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { SurveyFormData, CostCalculation } from '../types';
import { calculateTotalCost, getVoucherInfo } from '../utils/cost-calculator';
import { saveFormSubmission, type FormSubmission } from '../utils/supabase';
// Import the simplified payment utility
import { createPayment } from '../utils/simple-payment';
import { sendToGoogleSheetsBackground } from '../utils/sheets-service';

interface StepThreeProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  prevStep: () => void;
}

export function StepThree({ formData, updateFormData, prevStep }: StepThreeProps) {
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
        toast.error('Mohon lengkapi semua data survey');
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
        referral_source: formData.referralSource,
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
        toast.error('Gagal menyimpan data. Silakan coba lagi.');
        return;
      }

      // Jika form diisi secara manual, bukan Google Form, atau memiliki personal data questions, redirect ke halaman submit-success
      if (isManualForm || formData.hasPersonalDataQuestions) {
        console.log('Form diisi secara manual atau memiliki personal data questions, redirect ke halaman submit-success');

        // Kirim data ke Google Sheets untuk manual form juga
        if (savedData && savedData.id) {
          console.log('Mengirim data manual form ke Google Sheets untuk form ID:', savedData.id);
          sendToGoogleSheetsBackground(savedData.id, 'manual_form_submission');
        }

        // Dismiss loading toast
        toast.dismiss(loadingToast);

        // Tampilkan success toast
        toast.success('Form berhasil dikirim! Anda akan diarahkan ke halaman sukses.');

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
          toast.success('Berhasil! Anda akan diarahkan ke halaman pembayaran.');

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
          toast.error('Gagal membuat pembayaran. Silakan coba lagi nanti.');
        }
      }
    } catch (error: any) {
      console.error('Error saat menyimpan data:', error);
      toast.error('Terjadi kesalahan saat menyimpan data. Silakan coba lagi.');
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Review & Pembayaran</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
        Pastikan kamu review survei sebelum melakukan pembayaran
      </p>

      <div className="space-y-6">
        {/* SECTION: SURVEY OVERVIEW */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-icon">📋</span>
            <h3 className="section-title">SURVEY OVERVIEW</h3>
          </div>

          <div className="review-card">
            <h4 className="font-semibold text-lg mb-3">{formData.title}</h4>
            <div className="space-y-2">
              <div className="review-item">
                <span className="review-icon">📝</span>
                <div className="review-content">
                  <div className="review-label">Questions</div>
                  <div className="review-value">{formData.questionCount} pertanyaan</div>
                </div>
              </div>
              <div className="review-item">
                <span className="review-icon">⏱️</span>
                <div className="review-content">
                  <div className="review-label">Campaign Duration</div>
                  <div className="review-value">{formData.duration} hari ({formData.startDate} - {formData.endDate})</div>
                </div>
              </div>
              <div className="review-item">
                <span className="review-icon">🎯</span>
                <div className="review-content">
                  <div className="review-label">Target Criteria</div>
                  <div className="review-value">{formData.criteriaResponden}</div>
                </div>
              </div>
              <div className="review-item">
                <span className="review-icon">🎁</span>
                <div className="review-content">
                  <div className="review-label">Incentive</div>
                  <div className="review-value">{formData.winnerCount} pemenang × Rp {formatRupiah(formData.prizePerWinner)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION: YOUR INFORMATION */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-icon">👤</span>
            <h3 className="section-title">YOUR INFORMATION</h3>
          </div>

          <div className="review-card">
            <div className="space-y-2">
              <div className="review-item">
                <span className="review-icon">👨‍🎓</span>
                <div className="review-content">
                  <div className="review-value">{formData.fullName}</div>
                  <div className="review-label">{formData.status}</div>
                </div>
              </div>
              <div className="review-item">
                <span className="review-icon">📧</span>
                <div className="review-content">
                  <div className="review-value">{formData.email}</div>
                </div>
              </div>
              <div className="review-item">
                <span className="review-icon">📱</span>
                <div className="review-content">
                  <div className="review-value">{formData.phoneNumber}</div>
                </div>
              </div>
              <div className="review-item">
                <span className="review-icon">🎓</span>
                <div className="review-content">
                  <div className="review-value">{formData.department}, {formData.university}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION: PROMO CODE */}
        <div className="section-card">
          <div className="section-header">
            <span className="section-icon">🎟️</span>
            <h3 className="section-title">PROMO CODE</h3>
            {voucherInfo.isValid && (
              <span className="section-badge">✓</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="voucherCode" className="form-label">Kode voucher/referal (Opsional)</label>
            <div className="input-wrapper">
              <input
                id="voucherCode"
                type="text"
                className="form-input input-with-validation"
                placeholder="e.g., MAHASISWA10"
                value={formData.voucherCode || ''}
                onChange={handleVoucherChange}
              />
            </div>
            {voucherInfo.isValid && voucherInfo.message ? (
              <div className="info-box success mt-2">
                <p className="text-sm font-medium">
                  ✅ {voucherInfo.message}
                </p>
              </div>
            ) : (
              <span className="helper-text">
                Masukkan kode voucher untuk mendapatkan diskon
              </span>
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
                  {formData.questionCount} pertanyaan × Rp {formatRupiah(costCalculation.adCost / formData.duration)}/hari × {formData.duration} hari
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
              ℹ️ <strong>Note:</strong> By proceeding, you agree to our Terms of Service and Privacy Policy
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
            style={{fontSize: '1rem', fontWeight: '600'}}
          >
            💳 Proceed to Payment
          </button>
        </div>
      </div>
    </div>
  );
}
