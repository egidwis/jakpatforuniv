/**
 * Aturan batas minimal dan rekomendasi hadiah per pemenang berdasarkan jumlah pertanyaan survei.
 *
 * Nilai ini menjadi sumber kebenaran tunggal (single source of truth) baik untuk
 * formulir pengajuan iklan awal (StepOneFormFields) maupun perpanjangan iklan (JadwalBaruPage).
 */

export const MIN_PRIZE_PER_WINNER = 25000;

export const RECOMMENDED_PRIZE_VALUES = [25000, 30000, 35000, 50000, 80000];

/**
 * Menghitung nominal rekomendasi hadiah per pemenang berdasarkan beban jumlah pertanyaan.
 */
export const getRecommendedPrize = (questionCount: number): number => {
  if (questionCount <= 15) return 25000;
  if (questionCount <= 30) return 30000;
  if (questionCount <= 50) return 35000;
  if (questionCount <= 70) return 50000;
  return 80000;
};
