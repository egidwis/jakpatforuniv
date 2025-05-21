import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { SurveyFormData, CostCalculation } from '../types';
import { calculateTotalCost } from '../utils/cost-calculator';
import { saveFormSubmission, type FormSubmission } from '../utils/supabase';
import { createPayment, checkMayarApiStatus } from '../utils/payment';

interface StepThreeProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  prevStep: () => void;
  onSubmit: () => void;
}

export function StepThree({ formData, updateFormData, prevStep, onSubmit }: StepThreeProps) {
  const [costCalculation, setCostCalculation] = useState<CostCalculation>({
    adCost: 0,
    incentiveCost: 0,
    discount: 0,
    totalCost: 0
  });

  // Hitung biaya saat form data berubah
  useEffect(() => {
    const calculation = calculateTotalCost(formData);
    setCostCalculation(calculation);
  }, [formData]);

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

      // Tampilkan loading toast
      const loadingToast = toast.loading('Menyimpan data dan mempersiapkan pembayaran...');

      // Coba ping Supabase terlebih dahulu untuk memeriksa koneksi
      let isOfflineMode = false;
      try {
        const response = await fetch(import.meta.env.VITE_SUPABASE_URL);
        if (!response.ok) {
          console.warn('Supabase connection test failed, might be using offline mode');
          isOfflineMode = true;
        }
      } catch (pingError) {
        console.error('Failed to ping Supabase, switching to offline mode:', pingError);
        isOfflineMode = true;
      }

      if (isOfflineMode) {
        console.log('Using offline mode due to connection issues');
        toast.info('Koneksi internet terbatas. Menggunakan mode offline.', { duration: 3000 });
      }

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
      } catch (saveError: any) {
        console.error('Error saat menyimpan data:', saveError);

        // Jika error adalah masalah koneksi, gunakan mode offline
        if (
          saveError.message?.includes('Failed to fetch') ||
          saveError.message?.includes('Network Error') ||
          saveError.message?.includes('ERR_NAME_NOT_RESOLVED')
        ) {
          toast.warning('Gagal terhubung ke database. Menggunakan mode offline.', { duration: 3000 });

          // Buat ID simulasi
          const offlineId = `offline_${Date.now()}`;
          savedData = {
            ...submissionData,
            id: offlineId,
            created_at: new Date().toISOString(),
            status: 'pending',
            payment_status: 'offline'
          };

          // Simpan di localStorage
          try {
            const existingData = localStorage.getItem('offlineFormSubmissions');
            const offlineSubmissions = existingData ? JSON.parse(existingData) : [];
            offlineSubmissions.push(savedData);
            localStorage.setItem('offlineFormSubmissions', JSON.stringify(offlineSubmissions));
            console.log('Data saved in offline mode:', savedData);
          } catch (localStorageError) {
            console.error('Failed to save in offline mode:', localStorageError);
            toast.dismiss(loadingToast);
            toast.error('Gagal menyimpan data. Silakan coba lagi.');
            return;
          }
        } else {
          toast.dismiss(loadingToast);
          toast.error('Gagal menyimpan data. Silakan coba lagi.');
          return;
        }
      }

      // Periksa status API Mayar terlebih dahulu
      try {
        console.log('Memeriksa status API Mayar...');
        const isApiAvailable = await checkMayarApiStatus();

        if (!isApiAvailable) {
          console.warn('Mayar API tidak tersedia, menggunakan mode simulasi');
          toast.info('Layanan pembayaran sedang tidak tersedia. Menggunakan mode simulasi.', { duration: 3000 });
        } else {
          console.log('Mayar API tersedia, melanjutkan dengan pembayaran normal');
        }

        console.log('Memulai proses pembayaran untuk form ID:', savedData.id);

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

        // Cek apakah ini adalah simulasi
        if (paymentUrl.includes('simulation=true')) {
          // Tampilkan success toast untuk simulasi
          toast.success('Simulasi pembayaran berhasil! Anda akan diarahkan ke halaman sukses.');
          console.log('Mode simulasi terdeteksi, akan redirect ke halaman sukses simulasi');
        } else {
          // Tampilkan success toast untuk pembayaran nyata
          toast.success('Berhasil! Anda akan diarahkan ke halaman pembayaran.');
          console.log('Mode produksi terdeteksi, akan redirect ke Mayar payment gateway');
        }

        // Tambahkan delay kecil agar toast terlihat
        setTimeout(() => {
          // Redirect ke halaman pembayaran
          console.log('Melakukan redirect ke:', paymentUrl);
          window.location.href = paymentUrl;
        }, 1500);
      } catch (paymentError: any) {
        // Dismiss loading toast
        toast.dismiss(loadingToast);

        console.error('Error saat membuat pembayaran:', paymentError);

        // Tampilkan pesan error yang lebih spesifik
        let errorMessage = 'Terjadi kesalahan saat membuat pembayaran.';
        let errorCode = '';

        if (paymentError.response) {
          // Error dari server Mayar
          const status = paymentError.response.status;
          const data = paymentError.response.data;
          errorCode = `HTTP ${status}`;

          if (status === 401) {
            errorMessage = 'Autentikasi dengan Mayar gagal. Silakan periksa API key.';
          } else if (status === 400) {
            errorMessage = `Permintaan tidak valid: ${data.message || 'Format data tidak sesuai'}`;
          } else if (status === 422) {
            errorMessage = 'Format data pembayaran tidak valid.';

            // Cek apakah ada detail validasi error
            if (data && data.errors) {
              const errors = data.errors;
              const errorFields = Object.keys(errors).join(', ');
              errorMessage += ` Masalah pada: ${errorFields}`;
            }
          } else if (status >= 500) {
            errorMessage = 'Layanan Mayar sedang mengalami gangguan. Silakan coba lagi nanti.';
          }

          console.error(`Mayar API error (${errorCode}):`, data);
          toast.error(errorMessage + ' Menggunakan mode simulasi.');
        } else if (paymentError.request) {
          // Error karena tidak ada response (network issue)
          errorCode = 'NETWORK';
          errorMessage = 'Tidak dapat terhubung ke layanan pembayaran.';
          console.error('Network error connecting to Mayar API:', paymentError);
          toast.error(errorMessage + ' Menggunakan mode simulasi.');
        } else {
          // Error lainnya
          errorCode = 'UNKNOWN';
          if (paymentError.message) {
            errorMessage = `Error: ${paymentError.message}`;
          }
          console.error('Unknown error with Mayar API:', paymentError);
          toast.error(errorMessage + ' Menggunakan mode simulasi.');
        }

        // Log error untuk debugging
        console.error(`Payment error (${errorCode}): ${errorMessage}`);

        // Tampilkan pesan error dan biarkan pengguna mencoba lagi
        toast.error('Gagal terhubung ke layanan pembayaran. Silakan coba lagi nanti.');
      }
    } catch (error) {
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
          <p className="text-sm text-gray-500 mt-2">
            Masukkan kode voucher jika Anda memilikinya untuk mendapatkan diskon
          </p>
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
