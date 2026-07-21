import type { SurveyFormData, CostCalculation } from '../types';
import { KILAT_ADDON_COST, KILAT_ADDON_COST_VOUCHER, PPN_PERCENT } from './constants';

// DUPLICATED in functions/api/doku/create-payment.js (server-side authoritative
// copy) — the two MUST be changed together: price tiers, voucher list, the
// Kilat add-on, AND the PPN math. Pages Functions bundle standalone, so they
// can't import this file.

/**
 * Menghitung PPN dari Dasar Pengenaan Pajak (DPP = subtotal setelah diskon).
 * Memakai persen bulat lalu Math.round agar hasilnya rupiah bulat & deterministik.
 * Pembulatan ini WAJIB identik dengan salinan server (create-payment.js); kalau
 * beda, create-payment.js akan mendeteksi mismatch total_cost di setiap order.
 */
export function calculatePpn(dpp: number): number {
  return Math.round((dpp * PPN_PERCENT) / 100);
}

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
export function calculateDiscount(voucherCode: string | undefined, adCost: number, incentiveCost: number = 0, duration: number = 0): number {
  // Implementasi sederhana, bisa diganti dengan logika yang lebih kompleks
  if (!voucherCode) return 0;

  // Kode JAKPATUNIV2025 memberikan diskon 25% dengan maksimal 50k
  if (voucherCode.toUpperCase() === 'JAKPATUNIV2025') {
    // EXPIRED: Code no longer valid
    return 0;
  }

  // Voucher testing sistem
  if (voucherCode.toUpperCase() === 'JFUTGRX') {
    const totalBeforeDiscount = adCost + incentiveCost;
    return totalBeforeDiscount > 1000 ? totalBeforeDiscount - 1000 : 0;
  }

  // Voucher spesial JFUFEB
  if (voucherCode.toUpperCase() === 'JFUFEB') {
    if (duration === 7) {
      return adCost > 1000000 ? adCost - 1000000 : 0;
    }
    return 0;
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

  // Kode referral tambahan - semua 10%
  if (voucherCode.toUpperCase() === 'JFUGITA') {
    return adCost * 0.1;
  }

  if (voucherCode.toUpperCase() === 'JFUTANIA') {
    return adCost * 0.1;
  }

  if (voucherCode.toUpperCase() === 'JFUEDO') {
    return adCost * 0.1;
  }

  if (voucherCode.toUpperCase() === 'JFURAISA') {
    return adCost * 0.1;
  }

  if (voucherCode.toUpperCase() === 'JFUANA') {
    return adCost * 0.1;
  }

  if (voucherCode.toUpperCase() === 'JFUSALSA') {
    return adCost * 0.1;
  }

  if (voucherCode.toUpperCase() === 'JFUNATALIA') {
    return adCost * 0.1;
  }

  // Kode TEGARGANTENG memberikan diskon 20%
  if (voucherCode.toUpperCase() === 'TEGARGANTENG') {
    return adCost * 0.2;
  }

  // Kode JFUSUHUD memberikan diskon 10% untuk iklan regular
  if (voucherCode.toUpperCase() === 'JFUSUHUD') {
    return adCost * 0.1;
  }

  return 0;
}

/**
 * Mendapatkan informasi voucher berdasarkan kode
 * @param voucherCode Kode voucher
 * @returns Informasi voucher atau null jika tidak valid
 */
export function getVoucherInfo(voucherCode: string | undefined, duration: number = 0): { isValid: boolean; message?: string; discount?: number; isError?: boolean; isKilatEligible?: boolean } {
  if (!voucherCode) return { isValid: false, isError: false };

  const upperCode = voucherCode.toUpperCase();

  if (upperCode === 'JAKPATUNIV2025') {
    return {
      isValid: false,
      message: 'Kode voucher ini sudah berakhir (expired).',
      discount: 0,
      isError: true
    };
  }

  if (upperCode === 'JFUFEB') {
    if (duration > 0 && duration !== 7) {
      return {
        isValid: false,
        message: 'Voucher hanya berlaku untuk durasi iklan 7 hari.',
        discount: 0,
        isError: true
      };
    }
    return {
      isValid: true,
      message: 'Harga iklan flat Rp 1.000.000 (khusus 7 hari)'
    };
  }

  if (upperCode === 'PPISWEDIA') {
    return {
      isValid: true,
      message: 'Kode referal ini berlaku sampai 30 Juni 2026',
      discount: 20
    };
  }

  if (upperCode === 'JFUSUHUD') {
    return {
      isValid: true,
      message: 'Diskon 10% untuk iklan regular! Atau upgrade ke ⚡ JFU Kilat',
      isKilatEligible: true
    };
  }

  const validCodes = [
    'JFUFEB',
    'JFUTGRX',
    'JFUTYR',
    'SEKARJFU',
    'ADINDAJFU',
    'RAJAJFU',
    'SACIJFU',
    'JFUGITA',
    'JFUTANIA',
    'JFUEDO',
    'JFURAISA',
    'JFUANA',
    'JFUSALSA',
    'JFUNATALIA',
    'TEGARGANTENG',
    'JFUSUHUD'
  ];
  if (validCodes.includes(upperCode)) {
    return { isValid: true };
  }

  return { isValid: false, message: 'Voucher code not recognized.', isError: false };
}

/**
 * Menghitung total biaya keseluruhan
 * @param formData Data form
 * @returns Perhitungan biaya
 */
export function calculateTotalCost(formData: SurveyFormData): CostCalculation {
  if (formData.isKilatUpgrade) {
    // Kilat: base rate (no duration multiplier) + add-on + incentive
    const adCostBase = calculateAdCostPerDay(formData.questionCount); // 1x only
    const incentiveCost = calculateIncentiveCost(formData.winnerCount, formData.prizePerWinner);
    const isVoucherKilat = formData.voucherCode?.toUpperCase() === 'JFUSUHUD';
    const kilatAddon = isVoucherKilat ? KILAT_ADDON_COST_VOUCHER : KILAT_ADDON_COST;
    // No discount applied on top of Kilat add-on
    const subtotal = adCostBase + kilatAddon + incentiveCost;
    const ppn = calculatePpn(subtotal);
    return {
      adCost: adCostBase,
      incentiveCost,
      discount: 0,
      kilatAddonCost: kilatAddon,
      subtotal,
      ppn,
      totalCost: subtotal + ppn,
    };
  }

  // Regular pricing
  const adCost = calculateTotalAdCost(formData.questionCount, formData.duration);
  const incentiveCost = calculateIncentiveCost(formData.winnerCount, formData.prizePerWinner);
  const discount = calculateDiscount(formData.voucherCode, adCost, incentiveCost, formData.duration);

  const subtotal = adCost + incentiveCost - discount;
  const ppn = calculatePpn(subtotal);
  return {
    adCost,
    incentiveCost,
    discount,
    kilatAddonCost: 0,
    subtotal,
    ppn,
    totalCost: subtotal + ppn
  };
}
