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
    // ⚠️ Kilat: JFUFEB/ILKOMUNY TIDAK berlaku dan tidak disimpan (`submitOrder`,
    // Phase 5 §5.1), jadi tidak boleh membelokkan order ke antrean admin.
    // `isAutoReviewed` di sisi baris tetap sepakat: kodenya tak pernah sampai DB.
    (formData.isKilatUpgrade || !isManualVerificationVoucher(formData.voucherCode))
  );
}

/**
 * Ke mana tombol utama Ringkasan membawa order ini.
 *
 *   review     → jalur manual: kirim untuk direview.
 *   schedule   → jalur otomatis tanpa tanggal: lanjut ke langkah Jadwal.
 *   pay        → jalur otomatis dengan tanggal dari draft: kunci & bayar.
 *   kilat_away → Kilat jalur otomatis SELAMA MODE LIBUR (sql/120): tidak ada
 *                reservasi mandiri. Order dikirim TANPA gelombang sebagai
 *                jalur manual (`forced_manual_reason = 'admin_away'`), termasuk
 *                bila draft sudah membawa gelombang.
 *
 * Iklan jalur otomatis TIDAK berubah saat libur — iklannya tetap tayang.
 */
export type CheckoutPath = 'review' | 'schedule' | 'pay' | 'kilat_away';

export function checkoutPath({ isAutoApproval, isKilat, hasSchedule, away }: {
  isAutoApproval: boolean;
  isKilat: boolean;
  hasSchedule: boolean;
  away: boolean;
}): CheckoutPath {
  if (!isAutoApproval) return 'review';
  if (isKilat && away) return 'kilat_away';
  return hasSchedule ? 'pay' : 'schedule';
}
