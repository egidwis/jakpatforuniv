import type { SurveyFormData, CostCalculation } from '../types';

/**
 * Menghitung biaya iklan berdasarkan jumlah pertanyaan dan durasi
 * @param questionCount Jumlah pertanyaan dalam survei
 * @param duration Durasi iklan dalam hari
 * @returns Biaya iklan per hari
 */
export function calculateAdCostPerDay(questionCount: number): number {
  // Jika jumlah pertanyaan 0, kembalikan 0
  if (questionCount === 0) {
    return 0;
  } else if (questionCount <= 15) {
    return 150000; // Rp 150.000/hari untuk max 15 pertanyaan
  } else if (questionCount <= 30) {
    return 200000; // Rp 200.000/hari untuk max 30 pertanyaan
  } else {
    return 300000; // Rp 300.000/hari untuk max 50 pertanyaan
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

  // Contoh: kode "Mamikos" memberikan diskon 25%
  if (voucherCode.toUpperCase() === 'JAKPATUNIV2025') {
    return adCost * 0.25;
  }

  // Contoh: kode "Rakhma" memberikan diskon 10%
  if (voucherCode.toUpperCase() === 'RA2025') {
    return adCost * 0.1;
  }

    // Contoh: kode "Tiara" memberikan diskon 10%
  if (voucherCode.toUpperCase() === 'JFUTYR') {
    return adCost * 0.1;
  }

    // Contoh: kode "PPI SWEDIA" memberikan diskon 20%
  if (voucherCode.toUpperCase() === 'PPISWEDIA') {
    return adCost * 0.2;
  }

    // Contoh: kode "SEKAR" memberikan diskon 10%
  if (voucherCode.toUpperCase() === 'SEKARJFU') {
    return adCost * 0.1;
  }

    // Contoh: kode "Adinda" memberikan diskon 10%
  if (voucherCode.toUpperCase() === 'ADINDAJFU') {
    return adCost * 0.1;
  }

    // Contoh: kode "Raja" memberikan diskon 10%
  if (voucherCode.toUpperCase() === 'RAJAJFU') {
    return adCost * 0.1;
  }

    // Contoh: kode "Saci" memberikan diskon 10%
  if (voucherCode.toUpperCase() === 'SACIJFU') {
    return adCost * 0.1;
  }


  return 0;
}

/**
 * Mendapatkan informasi voucher berdasarkan kode
 * @param voucherCode Kode voucher
 * @returns Informasi voucher atau null jika tidak valid
 */
export function getVoucherInfo(voucherCode: string | undefined): { isValid: boolean; message?: string; discount?: number } {
  if (!voucherCode) return { isValid: false };

  const upperCode = voucherCode.toUpperCase();

  if (upperCode === 'PPISWEDIA') {
    return {
      isValid: true,
      message: 'Kode referal ini berlaku sampai 30 Juni 2026',
      discount: 20
    };
  }

  // Voucher lainnya tanpa pesan khusus
  const validCodes = ['JAKPATUNIV2025', 'RA2025', 'JFUTYR', 'SEKARJFU', 'ADINDAJFU', 'RAJAJFU', 'SACIJFU'];
  if (validCodes.includes(upperCode)) {
    return { isValid: true };
  }

  return { isValid: false };
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
