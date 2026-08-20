import type { SurveyFormData } from '../types';

/**
 * Syarat yang harus beres SEBELUM user boleh meninggalkan layar Ringkasan.
 *
 * Daftar ini pernah hidup di tiga tempat sekaligus: validasi layar Ringkasan,
 * validasi `submitOrder()`, dan (secara diam-diam) asumsi bahwa draft
 * localStorage tidak mungkin mendaratkan orang melewati keduanya. Yang ketiga
 * salah, dan karena daftarnya diduplikat, tidak ada satu titik pun yang bisa
 * ditambal untuk menutupnya. Sekarang ketiganya memanggil fungsi yang sama.
 *
 * Urutan pemeriksaan adalah bagian dari kontraknya: pesan yang tampil ke user
 * adalah pemblokir PERTAMA, dan urutan itulah yang sudah dipakai kedua
 * pemanggil lama.
 */
export type CheckoutBlockerCode = 'terms' | 'survey_incomplete' | 'name' | 'email' | 'phone';

export function checkoutBlocker(formData: Partial<SurveyFormData>): CheckoutBlockerCode | null {
  if (!formData.termsAccepted) return 'terms';

  if (!formData.title || !formData.questionCount || !formData.duration) {
    return 'survey_incomplete';
  }
  if (!formData.fullName || !formData.fullName.trim()) return 'name';
  if (
    !formData.email ||
    !formData.email.trim() ||
    !formData.email.includes('@') ||
    !formData.email.includes('.')
  ) {
    return 'email';
  }
  if (!formData.phoneNumber || formData.phoneNumber.trim().length < 10) {
    return 'phone';
  }
  return null;
}
