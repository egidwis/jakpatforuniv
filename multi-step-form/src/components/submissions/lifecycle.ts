import type { LifecycleStage } from '../../lib/status-tokens';
import type { SurveySubmission, PaymentState, ExistingPage } from './types';

// ─────────────────────────────────────────────────────────────
// Single source of truth for submission lifecycle derivation.
// Extracted verbatim from SubmissionsTableRow.tsx (desktop + mobile
// previously duplicated this logic, including the 1-hour slot expiry
// rule for user-booked unpaid reservations).
// ─────────────────────────────────────────────────────────────

export type PageStatus = 'none' | 'drafted' | 'scheduled' | 'live' | 'completed' | 'kilat';

export interface LifecycleInfo {
  /** Single combined stage for the list chip (highest-precedence axis wins). */
  stage: LifecycleStage;
  /** Review-axis display status ('in_review' | 'approved' | 'rejected' | 'spam' | ...). */
  displayStatus: string;
  isPaid: boolean;
  isRejectedEvent: boolean;
  isLegacyActive: boolean;
  isActuallyExpired: boolean;
  hasValidSchedule: boolean;
  isPending: boolean;
  canReserveSlot: boolean;
  canPay: boolean;
  canBuildPage: boolean;
  pageStatus: PageStatus;
  /** Epoch ms when a user-booked unpaid reservation expires, else null. */
  slotExpiresAt: number | null;
}

const RESERVABLE_STATUSES = ['approved', 'slot_reserved', 'waiting_payment', 'paid', 'scheduled', 'live', 'completed'];

// Map post-approved & legacy schedule statuses to "approved" for review-axis display
export function getDisplayStatus(status: string | undefined): string {
  const s = status || 'pending';
  if (RESERVABLE_STATUSES.includes(s)) return 'approved';
  return s;
}

export function deriveLifecycle(
  submission: SurveySubmission,
  paymentData: PaymentState,
  existingPage: ExistingPage | undefined,
  isScheduled: boolean,
  now: number = Date.now(),
): LifecycleInfo {
  const isPaid = ['paid', 'completed'].includes(paymentData.latestStatus || submission.payment_status || '');
  const isRejectedEvent = ['rejected', 'spam'].includes(submission.submission_status || '');
  const isLegacyActive = ['live', 'completed', 'scheduled'].includes(submission.status || '');
  const reservedAtTime = submission.slot_reserved_at ? new Date(submission.slot_reserved_at).getTime() : 0;
  // Legacy campaign end: submission_status 'live'/'scheduled' is never
  // transitioned to 'completed' in the DB, so derive it from end_date.
  // End-of-day local — a campaign ending today still counts as running.
  // Date-only strings are parsed as local components (new Date('YYYY-MM-DD')
  // would anchor to UTC midnight and roll back a day west of UTC).
  let legacyEndMs: number | null = null;
  if (submission.end_date) {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(submission.end_date);
    const parsedEnd = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(submission.end_date);
    if (!Number.isNaN(parsedEnd.getTime())) {
      legacyEndMs = new Date(parsedEnd.getFullYear(), parsedEnd.getMonth(), parsedEnd.getDate(), 23, 59, 59, 999).getTime();
    }
  }
  const legacyEnded = legacyEndMs !== null && legacyEndMs < now;
  const isUserBookedUnpaid = submission.slot_booked_by === 'user' && reservedAtTime > 0 && !isPaid && !paymentData.hasEverPaid;
  const isActuallyExpired = !isPaid && !paymentData.hasEverPaid && (
    paymentData.latestStatus === 'expired' ||
    submission.payment_status === 'expired' ||
    (submission.slot_booked_by === 'user' && reservedAtTime > 0 && now > reservedAtTime + 3600_000)
  );
  const hasValidSchedule = (isScheduled || (isLegacyActive && !legacyEnded)) && !isActuallyExpired;
  const isPending = !isPaid && paymentData.hasInvoices && !isRejectedEvent && hasValidSchedule;
  const canBuildPage = isPaid || isLegacyActive;
  const canReserveSlot = RESERVABLE_STATUSES.includes(submission.submission_status || '') || isLegacyActive;
  const canPay = (isScheduled || isLegacyActive) && !isRejectedEvent;
  const displayStatus = getDisplayStatus(submission.status);
  const slotExpiresAt = isUserBookedUnpaid ? reservedAtTime + 3600_000 : null;

  const isKilat = submission.distribution_type === 'kilat';

  // Page axis
  let pageStatus: PageStatus = 'none';
  if (isKilat) {
    pageStatus = 'kilat';
  } else if (existingPage) {
    const startDate = existingPage.publish_start_date ? new Date(existingPage.publish_start_date).getTime() : null;
    const endDate = existingPage.publish_end_date ? new Date(existingPage.publish_end_date).getTime() : null;
    if (!existingPage.is_published) pageStatus = 'drafted';
    else if (endDate !== null && endDate < now) pageStatus = 'completed';
    else if (startDate !== null && startDate > now) pageStatus = 'scheduled';
    else pageStatus = 'live';
  }

  // Combined stage — precedence: rejected > spam > live > page_scheduled >
  // completed > paid > awaiting_payment > reserved_expired > reserved(<1h) >
  // approved > in_review. KILAT never passes 'paid' via legacy status.
  // Legacy live/scheduled whose end_date passed derive 'completed'.
  let stage: LifecycleStage;
  if (displayStatus === 'rejected') stage = 'rejected';
  else if (displayStatus === 'spam') stage = 'spam';
  else if (pageStatus === 'live' || (!isKilat && submission.status === 'live' && !legacyEnded)) stage = 'live';
  else if (pageStatus === 'scheduled') stage = 'page_scheduled';
  else if (
    pageStatus === 'completed' ||
    (!isKilat && submission.status === 'completed') ||
    (!isKilat && isLegacyActive && legacyEnded)
  ) stage = 'completed';
  else if (isPaid) stage = 'paid';
  else if (isPending) stage = 'awaiting_payment';
  else if (isActuallyExpired) stage = 'reserved_expired';
  else if (hasValidSchedule) stage = isUserBookedUnpaid ? 'reserved_expiring' : 'reserved';
  else if (displayStatus === 'approved') stage = 'approved';
  else stage = 'in_review';

  return {
    stage,
    displayStatus,
    isPaid,
    isRejectedEvent,
    isLegacyActive,
    isActuallyExpired,
    hasValidSchedule,
    isPending,
    canReserveSlot,
    canPay,
    canBuildPage,
    pageStatus,
    slotExpiresAt,
  };
}
