import { useState, useEffect } from 'react';
import type { SurveyFormData, CostCalculation } from '../../lib/types';
import { calculateTotalCost } from '../../lib/cost-calculator';

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
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Pastikan kamu review survei sebelum melakukan pembayaran
      </p>

      <div className="space-y-6">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-medium mb-4">Rincian Harga</h3>

          <div className="space-y-4">
            <div className="flex justify-between">
              <div>
                <p>Jumlah pertanyaan: {formData.questionCount}</p>
                <p>Durasi: {formData.duration} Hari</p>
              </div>
              <div className="text-right">
                <p>Rp {formatRupiah(costCalculation.adCost / formData.duration)} x {formData.duration}</p>
              </div>
            </div>

            <div className="flex justify-between font-medium">
              <span>Biaya Iklan</span>
              <span>Rp {formatRupiah(costCalculation.adCost)}</span>
            </div>

            <div className="flex justify-between">
              <span>Insentif ke Responden</span>
              <span>Rp {formatRupiah(costCalculation.incentiveCost)}</span>
            </div>

            {costCalculation.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Diskon</span>
                <span>- Rp {formatRupiah(costCalculation.discount)}</span>
              </div>
            )}

            <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex justify-between font-bold">
              <span>Total Biaya</span>
              <span>Rp {formatRupiah(costCalculation.totalCost)}</span>
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
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 flex justify-between items-center">
          <div>
            <p className="font-bold text-xl">Total Biaya</p>
            <p className="text-2xl font-bold">Rp {formatRupiah(costCalculation.totalCost)}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {formData.questionCount} pertanyaan x {formData.duration} (hari) +
              Insentif responden
            </p>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              className="button button-secondary"
              onClick={prevStep}
            >
              Kembali
            </button>
            <button
              type="button"
              className="button button-primary"
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
