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
      <h2 className="text-xl font-semibold mb-4">Review & Pembayaran</h2>
      <p className="text-gray-600 mb-6">
        Pastikan kamu review survei sebelum melakukan pembayaran
      </p>

      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-medium mb-4">Rincian Harga</h3>
            <p className="text-sm text-gray-600 mb-6">
              Pastikan kamu review survei sebelum melakukan pembayaran
            </p>

            <div className="space-y-2">
              <div className="flex justify-between py-3 border-b border-gray-100">
                <span>Jumlah pertanyaan: {formData.questionCount}</span>
                <span className="font-medium">Rp {formatRupiah(costCalculation.adCost / formData.duration)}</span>
              </div>

              <div className="flex justify-between py-3 border-b border-gray-100">
                <span>Durasi: {formData.duration} Hari</span>
                <span className="font-medium">x {formData.duration}</span>
              </div>

              <div className="flex justify-between py-3 border-b border-gray-100 font-medium">
                <span>Biaya iklan</span>
                <span>Rp {formatRupiah(costCalculation.adCost)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-6">
            <div className="flex justify-between py-3">
              <span>Insentif ke Responden</span>
              <span className="font-medium">Rp {formatRupiah(costCalculation.incentiveCost)}</span>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="voucherCode" className="form-label">Kode voucher/referal (Opsional)</label>
          <input
            id="voucherCode"
            type="text"
            className="form-input"
            placeholder="Masukkan kode"
            value={formData.voucherCode || ''}
            onChange={handleVoucherChange}
          />
          {voucherInfo.isValid && voucherInfo.message ? (
            <p className="text-sm text-green-600 mt-2">
              {voucherInfo.message}
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-2">
              Masukkan kode voucher jika Anda memilikinya untuk mendapatkan diskon
            </p>
          )}
        </div>

        {costCalculation.discount > 0 && (
          <div className="flex justify-between text-green-600 py-3 border-t border-gray-200">
            <span>Diskon</span>
            <span>- Rp {formatRupiah(costCalculation.discount)}</span>
          </div>
        )}

        <div className="border-t border-gray-200 pt-6 mt-4">
          <div className="flex justify-between items-center mb-4">
            <span className="text-lg font-medium">Total Biaya</span>
            <span className="text-2xl font-bold">Rp{formatRupiah(costCalculation.totalCost)}</span>
          </div>

          <div className="flex justify-between mt-8">
            <button
              type="button"
              className="button button-secondary"
              onClick={prevStep}
            >
              Kembali
            </button>
            <button
              type="button"
              className="button button-primary px-6"
              onClick={handleSubmit}
            >
              Lanjut Bayar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
