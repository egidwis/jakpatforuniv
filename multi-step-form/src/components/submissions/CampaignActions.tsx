import { Calendar, CalendarCheck, Clock, CreditCard, Globe, PenLine, Plus, Zap } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { ExtendSection } from '../ExtendSection';
import type { SurveySubmission, PaymentState, ExistingPage } from './types';
import type { LifecycleInfo } from './lifecycle';

// ─────────────────────────────────────────────────────────────
// Campaign action blocks, extracted verbatim from the old
// SubmissionsDesktopRow. Consumed by the detail drawer tabs
// (Reservasi / Payment / Page).
// ─────────────────────────────────────────────────────────────

interface ActionBaseProps {
  submission: SurveySubmission;
  lifecycle: LifecycleInfo;
}

interface ReserveSlotActionProps extends ActionBaseProps {
  paymentData: PaymentState;
  existingPage?: ExistingPage;
  isScheduled: boolean;
  onOpenSchedule: (submission: SurveySubmission) => void;
}

export function ReserveSlotAction({
  submission,
  paymentData,
  existingPage,
  isScheduled,
  lifecycle,
  onOpenSchedule,
}: ReserveSlotActionProps) {
  const { isPaid, isLegacyActive, isActuallyExpired, hasValidSchedule, canReserveSlot } = lifecycle;

  if (hasValidSchedule) {
    return (
      <div className="flex items-center gap-1.5 w-full">
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <div className="flex-1 flex items-center justify-between px-2.5 min-h-[32px] py-1 bg-gray-50/80 border border-gray-200/70 rounded-md cursor-help">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <CalendarCheck className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  <span className="text-xs font-medium text-gray-700 tracking-wide truncate">
                    {isLegacyActive && !isScheduled ? 'Scheduled' : 'Reserved'}
                  </span>
                </div>

                {/* Expiration status on the right (hidden if already paid) */}
                {submission.slot_booked_by === 'user' && submission.slot_reserved_at && !isPaid && !paymentData.hasEverPaid && (() => {
                  const reservedAt = new Date(submission.slot_reserved_at).getTime();
                  const isExpired = paymentData.latestStatus === 'expired' || submission.payment_status === 'expired' || (!paymentData.hasEverPaid && Date.now() > (reservedAt + 3600_000));
                  return isExpired ? (
                    <span className="text-[10px] text-red-600 font-bold tracking-wide shrink-0 ml-2">
                      Expired
                    </span>
                  ) : (
                    <div className="flex items-center gap-0.5 text-amber-600 shrink-0 ml-2">
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px] font-bold tracking-wide">&lt;1h</span>
                    </div>
                  );
                })()}
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-white p-3 shadow-xl text-slate-700 space-y-1">
              <p className="font-semibold text-xs text-blue-600 mb-1">Reservation Details</p>
              <p className="text-sm">Date: <span className="font-medium text-gray-900">{submission.start_date ? new Date(submission.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}</span></p>
              <p className="text-sm">Type: <span className="font-medium text-gray-900">{(existingPage?.is_extra_ad || (submission.admin_notes || '').includes('[EXTRA_AD]')) ? 'Extra Ad' : 'Regular Ad'}</span></p>
              {submission.slot_booked_by && (
                <p className="text-sm mt-1 pt-1 border-t border-gray-100">Booked By: <span className="font-medium text-gray-900 capitalize">{submission.slot_booked_by}</span></p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 h-8 w-8 p-0 text-gray-500 hover:text-blue-600 border-gray-200 hover:border-blue-200 hover:bg-blue-50 transition-colors shadow-sm"
          onClick={() => onOpenSchedule(submission)}
          title="Edit Schedule"
        >
          <PenLine className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex w-full">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-full relative">
              <Button
                variant="outline"
                size="sm"
                disabled={!canReserveSlot}
                className={`w-full justify-start h-8 text-xs font-medium shadow-sm transition-all ${canReserveSlot
                  ? 'text-gray-600 hover:text-blue-600 border-gray-200 hover:border-blue-200 bg-white'
                  : 'text-gray-400 border-gray-100 bg-gray-50 cursor-not-allowed'
                  }`}
                onClick={() => onOpenSchedule(submission)}
              >
                <Calendar className={`w-3.5 h-3.5 mr-2 shrink-0 ${canReserveSlot ? 'text-blue-500' : 'text-gray-400'}`} />
                Reserve Slot
              </Button>
              {isActuallyExpired && (
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-red-600 bg-red-50 border border-red-100 px-1 py-0.5 rounded font-bold shadow-sm pointer-events-none leading-none">
                  Expired
                </span>
              )}
            </div>
          </TooltipTrigger>
          {!canReserveSlot ? (
            <TooltipContent side="top">
              <p className="text-xs">Submission was not approved yet.</p>
            </TooltipContent>
          ) : isActuallyExpired ? (
            <TooltipContent side="top">
              <p className="text-xs">Previous reservation expired.</p>
            </TooltipContent>
          ) : null}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

interface PaymentActionProps extends ActionBaseProps {
  paymentData: PaymentState;
  onOpenPayment: (submission: SurveySubmission) => void;
}

export function PaymentAction({
  submission,
  paymentData,
  lifecycle,
  onOpenPayment,
}: PaymentActionProps) {
  const { isPaid, isActuallyExpired, hasValidSchedule, isPending, canPay, isRejectedEvent } = lifecycle;

  if (isPaid) {
    return (
      <div className="flex items-center gap-1.5 w-full">
        <div className="flex-1">
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-start gap-1.5 px-2.5 h-8 bg-green-50/80 border border-green-200/70 rounded-md truncate cursor-help">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <CreditCard className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  <span className="text-xs font-medium text-green-700 tracking-wide truncate">Paid</span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="bg-white p-3 shadow-xl text-slate-700 space-y-1">
                <p className="font-semibold text-xs text-green-600 mb-1">Payment Details</p>
                <p className="text-sm">Amount: <span className="font-medium text-gray-900">Rp {paymentData.latestAmount ? paymentData.latestAmount.toLocaleString('id-ID') : '0'}</span></p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 h-8 w-8 p-0 text-gray-500 hover:text-green-600 border-gray-200 hover:border-green-200 hover:bg-green-50 transition-colors shadow-sm"
          onClick={() => onOpenPayment(submission)}
          title="Add Additional Payment"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  if (paymentData.latestStatus === 'expired' || submission.payment_status === 'expired' || isActuallyExpired) {
    // Expired reservation: the slot was released, so there is no valid schedule.
    // Enforce "schedule-first, then pay" — disable Payment until the admin
    // re-reserves a slot (via the Reserve Slot button). This prevents creating a
    // payment for an unscheduled submission (pay-then-forget-to-schedule), which
    // would leave the ad page uncreated. Same rule already applies on mobile and
    // in the not-yet-scheduled branch below.
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative w-full">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasValidSchedule}
                className={`w-full justify-start h-8 text-xs font-medium shadow-sm transition-all ${hasValidSchedule ? 'text-gray-600 hover:text-emerald-600 border-gray-200 hover:border-emerald-200 bg-white' : 'text-gray-400 border-gray-100 bg-gray-50'}`}
                onClick={() => onOpenPayment(submission)}
              >
                <CreditCard className={`w-3.5 h-3.5 mr-2 shrink-0 ${hasValidSchedule ? 'text-emerald-500' : 'text-gray-400'}`} />
                Payment
              </Button>
              <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-red-600 bg-red-50 border border-red-100 px-1 py-0.5 rounded font-bold shadow-sm pointer-events-none leading-none">
                Expired
              </span>
            </div>
          </TooltipTrigger>
          {!hasValidSchedule && (
            <TooltipContent side="top">
              <p className="text-xs">Reserve a slot first.</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (isPending) {
    return (
      <div className="flex items-center gap-1.5 w-full">
        <button
          className="flex-1 flex items-center justify-start gap-1.5 px-2.5 h-8 bg-amber-50/80 border border-amber-200/70 rounded-md truncate cursor-pointer hover:bg-amber-100/80 transition-colors"
          onClick={() => {
            const url = paymentData.latestPaymentUrl;
            if (url) {
              navigator.clipboard.writeText(url);
              import('sonner').then(({ toast }) => toast.success('Payment link copied!'));
            }
          }}
          title={paymentData.latestPaymentUrl ? 'Click to copy payment link' : 'No payment link'}
        >
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
          <CreditCard className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          <span className="text-xs font-medium text-amber-700 tracking-wide truncate">Waiting Payment</span>
        </button>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 h-8 w-8 p-0 text-gray-500 hover:text-amber-600 border-gray-200 hover:border-amber-200 hover:bg-amber-50 transition-colors shadow-sm"
          onClick={() => onOpenPayment(submission)}
          title="Add / View Payment"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  const payTooltip = isRejectedEvent ? 'Submission was rejected.' : 'Reserve a slot first.';
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full">
            <Button
              variant="outline"
              size="sm"
              disabled={!canPay}
              className={`w-full justify-start h-8 text-xs font-medium shadow-sm transition-all ${canPay ? 'text-gray-600 hover:text-emerald-600 border-gray-200 hover:border-emerald-200 bg-white relative' : 'text-gray-400 border-gray-100 bg-gray-50'}`}
              onClick={() => onOpenPayment(submission)}
            >
              {canPay && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />}
              <CreditCard className={`w-3.5 h-3.5 mr-2 shrink-0 ${canPay ? 'text-emerald-500' : 'text-gray-400'}`} />
              Payment
            </Button>
          </div>
        </TooltipTrigger>
        {!canPay && (
          <TooltipContent side="top">
            <p className="text-xs">{payTooltip}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

interface PageActionProps extends ActionBaseProps {
  existingPage?: ExistingPage;
  onOpenPageBuilder: (submission: SurveySubmission) => void;
}

export function PageAction({
  submission,
  existingPage,
  lifecycle,
  onOpenPageBuilder,
}: PageActionProps) {
  const { canBuildPage } = lifecycle;

  if (submission.distribution_type === 'kilat') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-full">
              <div className="flex items-center justify-center gap-1.5 h-8 px-3 rounded-md bg-amber-50 border border-amber-200 text-amber-700 shadow-sm cursor-help">
                <Zap className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold tracking-wide">KILAT</span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Distribusi Kilat. Tidak menggunakan Page builder.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (existingPage) {
    const now = new Date();
    const startDate = existingPage.publish_start_date ? new Date(existingPage.publish_start_date) : null;
    const endDate = existingPage.publish_end_date ? new Date(existingPage.publish_end_date) : null;

    let statusLabel = 'Drafted';
    let dotColor = 'bg-gray-400';
    let pillStyle = 'bg-gray-50/80 border-gray-200/70 text-gray-600';
    if (existingPage.is_published) {
      if (endDate && endDate < now) {
        statusLabel = 'Completed';
      } else if (startDate && startDate > now) {
        statusLabel = 'Scheduled';
        dotColor = 'bg-blue-500 animate-pulse';
        pillStyle = 'bg-blue-50/80 border-blue-200/70 text-blue-700';
      } else {
        statusLabel = 'Live';
        dotColor = 'bg-green-500 animate-pulse';
        pillStyle = 'bg-green-50/80 border-green-200/70 text-green-700';
      }
    }
    return (
      <div className="flex items-center gap-1.5 w-full">
        <div className="flex-1">
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <div className={`flex items-center justify-start gap-1.5 px-2.5 h-8 border rounded-md truncate cursor-help ${pillStyle}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                  <Globe className="w-3.5 h-3.5 shrink-0 opacity-60" />
                  <span className="text-xs font-medium tracking-wide truncate">{statusLabel}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="bg-white p-3 shadow-xl text-slate-700 space-y-1">
                <p className="font-semibold text-xs text-indigo-600 mb-1">Page Details</p>
                <p className="text-sm">Title: <span className="font-medium text-gray-900">{existingPage.title || 'Not set'}</span></p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 h-8 w-8 p-0 text-gray-500 hover:text-indigo-600 border-gray-200 hover:border-indigo-200 hover:bg-indigo-50 transition-colors shadow-sm"
          onClick={() => onOpenPageBuilder(submission)}
          title="Edit Page"
        >
          <PenLine className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-full">
            <Button
              variant="outline"
              size="sm"
              disabled={!canBuildPage}
              className={`w-full justify-start h-8 text-xs font-medium shadow-sm transition-all ${canBuildPage ? 'text-gray-600 hover:text-indigo-600 border-gray-200 hover:border-indigo-200 bg-white relative' : 'text-gray-400 border-gray-100 bg-gray-50'}`}
              onClick={() => onOpenPageBuilder(submission)}
            >
              {canBuildPage && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />}
              <Globe className={`w-3.5 h-3.5 mr-2 shrink-0 ${canBuildPage ? 'text-indigo-400' : ''}`} />
              <span className="truncate">Page</span>
            </Button>
          </div>
        </TooltipTrigger>
        {!canBuildPage && (
          <TooltipContent>
            <p>Payment required first</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

interface ExtendActionProps extends ActionBaseProps {
  existingPage?: ExistingPage;
  onExtendCreated: () => void;
}

export function ExtendAction({
  submission,
  existingPage,
  lifecycle,
  onExtendCreated,
}: ExtendActionProps) {
  if (!lifecycle.canBuildPage || !existingPage) return null;
  return (
    <ExtendSection
      submissionId={submission.id}
      submissionTitle={submission.formTitle}
      currentEndDate={submission.end_date || existingPage?.publish_end_date}
      currentPrizePerWinner={submission.prize_per_winner || 0}
      currentWinnerCount={submission.winnerCount || 0}
      questionCount={submission.questionCount || 0}
      researcherName={submission.researcherName}
      researcherEmail={submission.researcherEmail}
      phoneNumber={submission.phone_number}
      onExtendCreated={onExtendCreated}
    />
  );
}
