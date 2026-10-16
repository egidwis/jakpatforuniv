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
  flaggedPersonalDataQuestions?: string[]; // Teks pertanyaan yang terdeteksi meminta data pribadi (khusus deteksi AI form JFU)
  customFormId?: string; // ID custom_forms (JFU) asal submission ini, jika berasal dari CTA "Sebar"

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

  // Step 2: Ringkasan
  voucherCode?: string;
  /**
   * Persetujuan S&K dicentang di Ringkasan, tetapi order jalur otomatis baru
   * ditulis satu langkah kemudian (saat jadwal dikunci). Karena itu ia harus
   * ikut di formData, bukan state lokal layar Ringkasan — kalau tidak,
   * persetujuannya hilang begitu layar itu unmount.
   */
  termsAccepted?: boolean;

  // JFU Kilat
  /**
   * Order ini JFU Kilat. Ditetapkan oleh PINTU yang dipakai (`?product=kilat`,
   * Phase 5 §5.6) — tidak ada lagi tombol upgrade/un-upgrade di Ringkasan.
   * Nama kolomnya warisan jalur upgrade lama dan sengaja dipertahankan: draft
   * localStorage dan semua penghitung harga membacanya.
   */
  isKilatUpgrade?: boolean;
  /** Gelombang Kilat terpilih (jam WIB, 11|15). Ditulis saat jadwal dikunci. */
  kilatSlotHour?: number | null;

  // Reschedule metadata
  isReschedule?: boolean; // Flag untuk menandai ini adalah jadwal ulang
  submissionIdToReplace?: string; // ID submission yang akan di-update saat reschedule
}

// Tipe data untuk perhitungan biaya
export interface CostCalculation {
  adCost: number;
  incentiveCost: number;
  subtotal: number;    // Dasar Pengenaan Pajak (DPP) — sebelum PPN, setelah diskon
  ppn: number;         // PPN 11% dari subtotal (rupiah bulat)
  totalCost: number;   // subtotal + ppn — ini yang ditagih DOKU
  discount: number;
  kilatAddonCost?: number; // JFU Kilat add-on — hanya rumus lama (sebelum KILAT_TARIFF_FROM)
  /**
   * Order Kilat dihargai dengan tabel tarif Kilat (KILAT_RATE_SCHEDULE): `adCost`
   * = tarif satu gelombang, tanpa add-on. Label baris memakai "JFU Kilat".
   */
  kilatTariff?: boolean;
  /**
   * Biaya iklan pada harga KATALOG (AD_RATE_SCHEDULE.list). `adCost` tetap
   * harga efektif — semua pemanggil lama tidak berubah arti. Selisihnya
   * (`adCostList − adCost`) adalah baris "Harga perkenalan".
   */
  adCostList?: number;
  /** Tanggal terakhir harga perkenalan berlaku (YYYY-MM-DD, WIB) — label saja. */
  introUntil?: string | null;
}
