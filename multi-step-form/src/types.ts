// Tipe data untuk form multi-step
export interface SurveyFormData {
  // Step 1: Detail Survey
  surveyUrl: string;
  title: string;
  description: string;
  questionCount: number;
  criteriaResponden: string;
  duration: number; // dalam hari
  startDate?: string; // format YYYY-MM-DD
  startTime?: string; // format HH:MM
  endDate?: string; // format YYYY-MM-DD
  isManualEntry?: boolean; // Flag untuk menandai form diisi manual
  hasPersonalDataQuestions?: boolean; // Flag untuk deteksi keyword personal data
  detectedKeywords?: string[]; // List keyword yang terdeteksi

  // Step 2: Data Diri & Insentif
  fullName: string;
  email: string;
  phoneNumber: string;
  university: string;
  department: string;
  status: string;
  referralSource: string;
  referralSourceOther?: string;
  winnerCount: number;
  prizePerWinner: number;

  // Step 3: Review & Pembayaran
  voucherCode?: string;

  // Reschedule metadata
  isReschedule?: boolean; // Flag untuk menandai ini adalah jadwal ulang
  submissionIdToReplace?: string; // ID submission yang akan di-update saat reschedule
}

// Tipe data untuk perhitungan biaya
export interface CostCalculation {
  adCost: number;
  incentiveCost: number;
  totalCost: number;
  discount: number;
}
