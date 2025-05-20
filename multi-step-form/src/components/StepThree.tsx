import { useState, useEffect } from 'react';
import type { SurveyFormData, CostCalculation } from '../types';
import { calculateTotalCost } from '../utils/cost-calculator';

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
              onClick={onSubmit}
            >
              Lanjut Bayar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
