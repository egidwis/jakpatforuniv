import type { SurveyFormData } from '../types';
import { isManualVerificationVoucher } from './cost-calculator';

/**
 * Apakah submission yang sedang diisi menempuh jalur review OTOMATIS (parser
 * deterministik + regex PII) alih-alih antrean admin.
 *
 * Bukan sekadar label: predikat ini menentukan rute step. Jalur otomatis lewat
 * step 2 (Jadwal); jalur admin melompat dari step 1 langsung ke step 3 (Review
 * & Pembayaran), karena jadwal baru bisa dikunci setelah admin meloloskan
 * survei. Salah di sini = alur berubah, bukan cuma tampilan.
 *
 * Ekspresinya dulu ditulis identik di `MultiStepForm` dan `UnifiedHeader` —
 * dua tempat yang HARUS sepakat, karena yang satu menentukan rute dan yang
 * lain menggambar stepper untuk rute itu. Aturannya sudah pernah bergeser
 * (voucher verifikasi manual ditambahkan belakangan), jadi disatukan di sini
 * sebelum pemakai ketiga (tooltip jalur review di `StepOneFormFields`) lahir.
 *
 * Perhatikan `hasPersonalDataQuestions`: Google Form yang memicu deteksi PII
 * TETAP masuk antrean admin. Jadi "pilih import Google Form" ≠ "pasti
 * otomatis" — apa pun yang menampilkan janji waktu ke user wajib membaca
 * predikat ini, bukan metode yang tadi diklik.
 *
 * Kembarannya untuk baris yang SUDAH tersimpan di DB:
 * `isAutoReviewed(submission)` di `components/status/deriveOrderUiState.ts`.
 * Aturan yang sama dibaca dari kolom (`submission_method`, `survey_url`,
 * `detected_keywords`, `voucher_code`) alih-alih state form. Keduanya wajib
 * bergerak bersama — kalau aturan review berubah, ubah dua-duanya.
 */
export function isAutoApprovalPath(formData: SurveyFormData): boolean {
  return (
    !formData.isManualEntry &&
    !formData.hasPersonalDataQuestions &&
    formData.surveyUrl.includes('docs.google.com/forms') &&
    !isManualVerificationVoucher(formData.voucherCode)
  );
}

/**
 * Ke mana tombol utama Ringkasan membawa order ini.
 *
 *   review          → jalur manual: kirim untuk direview.
 *   schedule        → jalur otomatis tanpa tanggal: lanjut ke langkah Jadwal.
 *   pay             → jalur otomatis dengan tanggal dari draft: kunci & bayar.
 *   admin_schedule  → jalur otomatis SAAT RESERVASI MANDIRI DITUTUP (sql/125):
 *                     "Kirim Pesanan" — order lahir tanpa tanggal, tim yang
 *                     menetapkan tanggal & menerbitkan tagihan. Termasuk bila
 *                     draft sudah membawa tanggal.
 *
 * Jalur manual tidak berubah saat ditutup — tanggalnya memang milik admin.
 */
export type CheckoutPath = 'review' | 'schedule' | 'pay' | 'admin_schedule';

export function checkoutPath({ isAutoApproval, hasSchedule, selfBookingClosed }: {
  isAutoApproval: boolean;
  hasSchedule: boolean;
  selfBookingClosed: boolean;
}): CheckoutPath {
  if (!isAutoApproval) return 'review';
  if (selfBookingClosed) return 'admin_schedule';
  return hasSchedule ? 'pay' : 'schedule';
}
