// ─────────────────────────────────────────────────────────────
// Shared types for the Submissions feature
// (moved from SubmissionsTableRow.tsx; re-exported there during migration)
// ─────────────────────────────────────────────────────────────

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
  distribution_type?: 'regular' | 'kilat';
}

export interface PaymentState {
  hasInvoices: boolean;
  latestStatus: 'pending' | 'paid' | 'completed' | 'expired' | null;
  invoiceCount: number;
  latestPaymentUrl: string | null;
  latestAmount?: number;
  hasEverPaid?: boolean;
}

export interface ExistingPage {
  slug: string;
  is_published: boolean;
  publish_start_date: string | null;
  publish_end_date: string | null;
  title?: string;
  is_extra_ad?: boolean;
}
