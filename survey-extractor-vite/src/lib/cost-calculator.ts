import type { SurveyFormData, CostCalculation } from './types';

/**
 * Menghitung biaya iklan berdasarkan jumlah pertanyaan dan durasi
 * @param questionCount Jumlah pertanyaan dalam survei
 * @param duration Durasi iklan dalam hari
 * @returns Biaya iklan per hari
 */
export function calculateAdCostPerDay(questionCount: number): number {
  if (questionCount <= 15) {
    return 150000; // Rp 150.000/hari untuk max 15 pertanyaan
  } else if (questionCount <= 30) {
    return 200000; // Rp 200.000/hari untuk max 30 pertanyaan
  } else if (questionCount <= 50) {
    return 300000; // Rp 300.000/hari untuk 31-50 pertanyaan
  } else if (questionCount <= 70) {
    return 400000; // Rp 400.000/hari untuk 51-70 pertanyaan
  } else {
    return 500000; // Rp 500.000/hari untuk >70 pertanyaan
  }
}

/**
 * Menghitung total biaya iklan
 * @param questionCount Jumlah pertanyaan dalam survei
 * @param duration Durasi iklan dalam hari
 * @returns Total biaya iklan
 */
export function calculateTotalAdCost(questionCount: number, duration: number): number {
  const costPerDay = calculateAdCostPerDay(questionCount);
  return costPerDay * duration;
}

/**
 * Menghitung total biaya insentif
 * @param winnerCount Jumlah pemenang
 * @param prizePerWinner Hadiah per pemenang
 * @returns Total biaya insentif
 */
export function calculateIncentiveCost(winnerCount: number, prizePerWinner: number): number {
  return winnerCount * prizePerWinner;
}

/**
 * Menghitung diskon berdasarkan kode voucher
 * @param voucherCode Kode voucher
 * @param adCost Biaya iklan
 * @returns Jumlah diskon
 */
export function calculateDiscount(voucherCode: string | undefined, adCost: number): number {
  // Implementasi sederhana, bisa diganti dengan logika yang lebih kompleks
  if (!voucherCode) return 0;

  // Contoh: kode "JAKPAT10" memberikan diskon 10%
  if (voucherCode.toUpperCase() === 'JAKPAT10') {
    return adCost * 0.1;
  }

  // Contoh: kode "JAKPAT20" memberikan diskon 20%
  if (voucherCode.toUpperCase() === 'JAKPAT20') {
    return adCost * 0.2;
  }

  return 0;
}

/**
 * Menghitung total biaya keseluruhan
 * @param formData Data form
 * @returns Perhitungan biaya
 */
export function calculateTotalCost(formData: SurveyFormData): CostCalculation {
  const adCost = calculateTotalAdCost(formData.questionCount, formData.duration);
  const incentiveCost = calculateIncentiveCost(formData.winnerCount, formData.prizePerWinner);
  const discount = calculateDiscount(formData.voucherCode, adCost);

  return {
    adCost,
    incentiveCost,
    discount,
    totalCost: adCost + incentiveCost - discount
  };
}
