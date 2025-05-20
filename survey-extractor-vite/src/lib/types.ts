// Tipe data untuk informasi survei
export interface SurveyInfo {
  title: string;
  description: string;
  questionCount: number;
  platform: string;
  formId?: string;
  isQuiz?: boolean;
  requiresLogin?: boolean;
  isPaidFeature?: boolean;
  sectionCount?: number;
  note?: string;
}

// Tipe data untuk riwayat pencarian
export interface SearchHistoryItem {
  url: string;
  timestamp: number;
  platform?: string;
  title?: string;
}

// Tipe data untuk form multi-step
export interface SurveyFormData {
  // Step 1: Detail Survey
  surveyUrl: string;
  title: string;
  description: string;
  questionCount: number;
  criteriaResponden: string;
  duration: number; // dalam hari

  // Step 2: Data Diri & Insentif
  fullName: string;
  email: string;
  phoneNumber: string;
  university: string;
  department: string;
  status: 'Mahasiswa' | 'Dosen' | 'Pelajar SMA/SMK';
  winnerCount: number;
  prizePerWinner: number;

  // Step 3: Review & Pembayaran
  voucherCode?: string;
}

// Tipe data untuk perhitungan biaya
export interface CostCalculation {
  adCost: number;
  incentiveCost: number;
  totalCost: number;
  discount: number;
}
