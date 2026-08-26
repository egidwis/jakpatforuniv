// ─────────────────────────────────────────────────────────────
// Shared types for the Submissions feature
// (moved from SubmissionsTableRow.tsx; re-exported there during migration)
// ─────────────────────────────────────────────────────────────

import { toast } from 'sonner';

export interface ReviewHistoryEntry {
  action: 'in_review' | 'approved' | 'rejected' | 'spam' | 'cancelled';
  /**
   * Siapa yang menekan tombolnya. Tanpa ini entri `in_review` dari peneliti
   * ("Saya Sudah Perbaiki") dan dari tombol Reset admin tampil IDENTIK — dua
   * peristiwa yang sangat berbeda dengan satu wajah. Opsional karena entri
   * yang lahir sebelum kolomnya ada tidak punya nilai ini; pembacanya jatuh
   * ke label netral.
   */
  actor?: 'admin' | 'researcher';
  notes?: string;
  timestamp: string; // ISO 8601
}

export interface SurveySubmission {
  id: string;
  formId: string;
  formTitle: string;
  formUrl: string;
  researcherName: string;
  researcherEmail: string;
  submittedAt: string;
  questionCount: number;
  responseCount?: number;
  status?: string;
  payment_status?: string;
  total_cost?: number;
  phone_number?: string;
  education?: string;
  university?: string;
  department?: string;
  submission_method?: string;
  detected_keywords?: string[];
  leads?: string;
  voucher_code?: string;
  has_transactions?: boolean;
  prize_per_winner?: number;
  winnerCount?: number;
  criteria?: string;
  duration?: number;
  start_date?: string;
  end_date?: string;
  slot_booked_by?: string;
  slot_reserved_at?: string;
  admin_notes?: string;
  submission_status?: string;
  /** Disingkirkan pemilik baris dari daftarnya (sql/69). Bukan keadaan order. */
  dismissed_at?: string | null;
  distribution_type?: 'regular' | 'kilat';
  /**
   * Gelombang push Kilat dalam jam WIB (8/11/14/17). NULL/undefined pada order
   * Kilat berarti slotnya belum ditugaskan admin — keadaan yang sah untuk order
   * yang masuk lewat wizard user, yang memesan per-hari tanpa memilih jam.
   * Selalu kosong untuk iklan regular.
   */
  kilat_slot_hour?: number | null;
  review_history?: ReviewHistoryEntry[];
  invoiceName?: string;
  invoiceEmail?: string;
  invoicePhone?: string;
}

export interface PaymentState {
  /** Ada RIWAYAT tagihan — termasuk yang sudah mati. Bukan "ada yang bisa dibayar". */
  hasInvoices: boolean;
  /**
   * Ada tagihan yang MASIH BISA DIBAYAR. Inilah yang menentukan apakah order
   * benar-benar "menunggu pembayaran"; `hasInvoices` tidak pernah bisa,
   * karena baris tagihan tidak pernah dihapus — sesudah peneliti menjadwalkan
   * ulang, satu-satunya baris yang tersisa kedaluwarsa dan `hasInvoices`
   * tetap true selamanya.
   */
  hasOpenInvoice: boolean;
  latestStatus: 'pending' | 'paid' | 'completed' | 'expired' | null;
  invoiceCount: number;
  latestPaymentUrl: string | null;
  latestAmount?: number;
  hasEverPaid?: boolean;
  latestPaymentId?: string | null;
}

export interface ExistingPage {
  id?: string;
  slug: string;
  is_published: boolean;
  publish_start_date: string | null;
  publish_end_date: string | null;
  title?: string;
  is_extra_ad?: boolean;
  banner_url?: string | null;
  views_count?: number;
  respondents_count?: number;
  requires_banner_update?: boolean;
  /** Terisi = SurveyPage langsung `window.location.href` ke sini; isi halaman
   *  tidak pernah dilihat responden. 5 baris di produksi. */
  redirect_url?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Helper bersama antar tab detail (dipindah dari SubmissionDetailSheet.tsx
// saat berkas itu dipecah; badannya tidak diubah)
// ─────────────────────────────────────────────────────────────

export function copyToClipboard(text: string, message: string) {
  navigator.clipboard.writeText(text);
  toast.success(message);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
