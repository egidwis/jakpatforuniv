import { Calendar, CalendarCheck, ChevronDown, Clock, CreditCard, Globe, Info, Mail, MessageCircle, PenLine, Plus, ShieldAlert, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { TableCell, TableRow } from './ui/table';
import { Card, CardContent } from './ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { calculateTotalAdCost, calculateIncentiveCost, calculateDiscount } from '../utils/cost-calculator';
import { ExtendSection } from './ExtendSection';
import { Eye } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Types (shared with InternalDashboard)
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
}

export interface PaymentState {
  hasInvoices: boolean;
  latestStatus: 'pending' | 'paid' | 'completed' | 'expired' | null;
  invoiceCount: number;
  latestPaymentUrl: string | null;
  latestAmount?: number;
  hasEverPaid?: boolean;
}

interface ExistingPage {
  slug: string;
  is_published: boolean;
  publish_start_date: string | null;
  publish_end_date: string | null;
  title?: string;
  is_extra_ad?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface SubmissionsTableRowProps {
  submission: SurveySubmission;
  paymentData: PaymentState;
  existingPage?: ExistingPage;
  isScheduled: boolean;
  onStatusChange: (submissionId: string, newStatus: string) => void;
  onEditFormDetails: (submission: SurveySubmission) => void;
  onEditCriteria: (submission: SurveySubmission) => void;
  onOpenPageBuilder: (submission: SurveySubmission) => void;
  onOpenSchedule: (submission: SurveySubmission) => void;
  onOpenPayment: (submission: SurveySubmission) => void;
  onExtendCreated: () => void;
}

// ─────────────────────────────────────────────────────────────
// Desktop Table Row
// ─────────────────────────────────────────────────────────────

export function SubmissionsDesktopRow({
  submission,
  paymentData,
  existingPage,
  isScheduled,
  onStatusChange,
  onEditFormDetails,
  onEditCriteria,
  onOpenPageBuilder,
  onOpenSchedule,
  onOpenPayment,
  onExtendCreated,
}: SubmissionsTableRowProps) {
  // Derived state
  const isPaid = ['paid', 'completed'].includes(paymentData.latestStatus || submission.payment_status || '');
  const isRejectedEvent = ['rejected', 'spam'].includes(submission.submission_status || '');
  const isLegacyActive = ['live', 'completed', 'scheduled'].includes(submission.status || '');
  const reservedAtTime = submission.slot_reserved_at ? new Date(submission.slot_reserved_at).getTime() : 0;
  const isActuallyExpired = !isPaid && !paymentData.hasEverPaid && (
    paymentData.latestStatus === 'expired' ||
    submission.payment_status === 'expired' ||
    (submission.slot_booked_by === 'user' && reservedAtTime > 0 && Date.now() > (reservedAtTime + 3600_000))
  );
  const hasValidSchedule = (isScheduled || isLegacyActive) && !isActuallyExpired;
  const isPending = !isPaid && paymentData.hasInvoices && !isRejectedEvent && hasValidSchedule;
  const canBuildPage = isPaid || isLegacyActive;

  // Map post-approved & legacy schedule statuses to "approved" for display
  const getDisplayStatus = (status: string | undefined) => {
    const s = status || 'pending';
    if (['approved', 'slot_reserved', 'waiting_payment', 'paid', 'scheduled', 'live', 'completed'].includes(s)) return 'approved';
    return s;
  };
  const displayStatus = getDisplayStatus(submission.status);

  const RESERVABLE_STATUSES = ['approved', 'slot_reserved', 'waiting_payment', 'paid', 'scheduled', 'live', 'completed'];
  const canReserveSlot = RESERVABLE_STATUSES.includes(submission.submission_status || '') || isLegacyActive;

  // ── Reserve Slot Button ──
  let reserveBtn;
  if (hasValidSchedule) {
    reserveBtn = (
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
  } else {
    reserveBtn = (
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

  // ── Payment Button ──
  let paymentBtn;
  if (isPaid) {
    paymentBtn = (
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
  } else if (paymentData.latestStatus === 'expired' || submission.payment_status === 'expired' || isActuallyExpired) {
    paymentBtn = (
      <div className="relative w-full">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start h-8 text-xs font-medium shadow-sm text-gray-600 hover:text-emerald-600 border-gray-200 hover:border-emerald-200 bg-white transition-all"
          onClick={() => onOpenPayment(submission)}
        >
          <CreditCard className="w-3.5 h-3.5 mr-2 shrink-0 text-emerald-500" />
          Payment
        </Button>
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-red-600 bg-red-50 border border-red-100 px-1 py-0.5 rounded font-bold shadow-sm pointer-events-none leading-none">
          Expired
        </span>
      </div>
    );
  } else if (isPending) {
    paymentBtn = (
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
  } else {
    const canPay = (isScheduled || isLegacyActive) && !isRejectedEvent;
    const payTooltip = isRejectedEvent ? 'Submission was rejected.' : 'Reserve a slot first.';
    paymentBtn = (
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

  // ── Page Button ──
  let pageBtn;
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
    pageBtn = (
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
  } else {
    pageBtn = (
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

  // ── Extend Button ──
  let extendBtn = null;
  if (canBuildPage && existingPage) {
    extendBtn = (
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

  return (
    <TableRow className="bg-white hover:bg-gray-50/80 transition-shadow shadow-sm hover:shadow border-none rounded-xl group group/row">
      {/* Submitted */}
      <TableCell className="align-top py-4 text-xs pl-6 border-y border-l border-gray-200 rounded-l-xl">
        <div className="flex flex-col text-gray-500">
          <span className="font-medium text-gray-900">
            {new Date(submission.submittedAt).toLocaleDateString('id-ID')}
          </span>
          <span>
            {new Date(submission.submittedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </TableCell>

      {/* Form Details */}
      <TableCell className="align-top py-4 border-y border-gray-200">
        <div className="flex flex-col gap-1.5">
          <div>
            <div className="flex items-start justify-between gap-2 group relative">
              <div className="flex-1 min-w-0 pr-6">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-semibold text-gray-900 block mb-0.5 line-clamp-2 text-sm leading-tight cursor-help decoration-dotted decoration-gray-300 underline-offset-2 hover:underline">
                        {submission.formTitle}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>ID: {submission.formId}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {submission.formUrl && (
                  <div className="flex items-center mt-0.5">
                    <a
                      href={submission.formUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline decoration-blue-300 underline-offset-2 transition-colors max-w-[200px]"
                      title="Open Survey Link"
                    >
                      <Globe className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {submission.formUrl.replace(/^https?:\/\//, '')}
                      </span>
                    </a>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600 absolute top-0 right-0 opacity-0 group-hover/row:opacity-100 transition-opacity"
                onClick={() => onEditFormDetails(submission)}
                title="Edit Form Details"
              >
                <PenLine className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Chips Row: Method, Qs, Duration */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <Badge variant="secondary" className={`
                px-1.5 py-0 h-5 text-[10px] font-medium border rounded-full whitespace-nowrap
                ${submission.submission_method === 'google_import'
                ? 'bg-orange-50 text-orange-700 border-orange-200'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200'}
              `}>
              {submission.submission_method === 'google_import' ? 'G-Form' : 'Manual'}
            </Badge>

            <Badge variant="outline" className="px-1.5 py-0 h-5 text-[10px] text-gray-500 bg-white border-gray-200 font-normal rounded-full whitespace-nowrap">
              {submission.questionCount} Qs
            </Badge>

            {submission.duration ? (
              <Badge variant="outline" className="px-1.5 py-0 h-5 text-[10px] text-gray-500 bg-white border-gray-200 font-normal rounded-full whitespace-nowrap">
                {submission.duration} Days
              </Badge>
            ) : null}

            {(submission.detected_keywords && submission.detected_keywords.length > 0) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ShieldAlert className="w-3.5 h-3.5 text-red-500 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Detected: {submission.detected_keywords.join(', ')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {/* Total Ad Cost & Voucher */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {submission.duration && submission.duration > 0 && (() => {
              const adCost = calculateTotalAdCost(submission.questionCount || 0, submission.duration || 0);
              const incentiveCost = calculateIncentiveCost(submission.winnerCount || 0, submission.prize_per_winner || 0);
              const discount = calculateDiscount(submission.voucher_code, adCost, incentiveCost, submission.duration || 0);
              const finalAdCost = adCost - discount;

              return (
                <div className="flex items-center gap-2">
                  <div className="text-xs text-gray-900 font-medium whitespace-nowrap">
                    {discount > 0 ? (
                      <>
                        <span className="line-through text-gray-400 font-normal mr-1.5 text-[10px]">
                          Rp {new Intl.NumberFormat('id-ID').format(adCost)}
                        </span>
                        <span className="text-emerald-600 font-bold">
                          Rp {new Intl.NumberFormat('id-ID').format(finalAdCost)}
                        </span>
                      </>
                    ) : (
                      <span>Rp {new Intl.NumberFormat('id-ID').format(adCost)}</span>
                    )}
                  </div>

                  {submission.voucher_code && (
                    <div className="flex items-center animate-in slide-in-from-left-2 fade-in duration-300">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 text-xs font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full border border-purple-100 cursor-help hover:bg-purple-100 transition-colors">
                              <Zap className="w-3 h-3 fill-purple-600" />
                              <span>{submission.voucher_code}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-1 text-xs">
                              <p className="font-semibold text-purple-700">Voucher Applied</p>
                              <p>Discount: <span className="font-bold text-emerald-600">-Rp {new Intl.NumberFormat('id-ID').format(discount)}</span></p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Status Footer */}
          <div className="mt-1 pt-2 border-t border-gray-100/60">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Review Status:</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-auto p-0 hover:bg-transparent">
                    <div
                      className={`
                          cursor-pointer px-3 py-1 rounded-md text-[10px] items-center justify-center uppercase tracking-wide font-bold border transition-all shadow-sm hover:shadow flex gap-1.5
                          ${displayStatus === 'approved' ? 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100' :
                          displayStatus === 'rejected' ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100' :
                            displayStatus === 'in_review' ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100' :
                              'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'}
                        `}
                    >
                      {displayStatus === 'in_review' ? 'Need Review' : (displayStatus.replace('_', ' '))}
                      <ChevronDown className="w-3 h-3 opacity-70" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => onStatusChange(submission.id, 'in_review')}>
                    Need Review
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onStatusChange(submission.id, 'approved')}>
                    Approved
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onStatusChange(submission.id, 'rejected')} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                    Rejected
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onStatusChange(submission.id, 'spam')} className="text-gray-600">
                    Spam / Revision
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Admin Notes Display */}
              {displayStatus === 'rejected' && submission.admin_notes && (
                <TooltipProvider>
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center text-xs text-red-600 bg-red-50 p-1 rounded border border-red-100 cursor-help transition-colors hover:bg-red-100 ml-1">
                        <Info className="w-3.5 h-3.5 shrink-0" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[400px] bg-white p-3 shadow-xl border-red-100 text-slate-700">
                      <p className="font-semibold text-xs text-red-600 mb-1">Rejection Reason:</p>
                      <p className="text-sm leading-relaxed">{submission.admin_notes}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>
      </TableCell>

      {/* Criteria & Incentive */}
      <TableCell className="align-top py-4 border-y border-gray-200">
        <div className="flex flex-col gap-2">
          {submission.criteria ? (
            <div className="relative group/criteria">
              <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">Criteria:</div>
              <p className="text-xs text-gray-600 line-clamp-3 mb-1 pr-6" title={submission.criteria}>
                {submission.criteria || '-'}
              </p>

              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600 absolute top-0 right-0 opacity-0 group-hover/row:opacity-100 transition-opacity bg-white/80"
                onClick={() => onEditCriteria(submission)}
                title="Edit Criteria"
              >
                <PenLine className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs text-gray-400 italic bg-gray-50 px-2 py-1.5 rounded border border-dashed border-gray-200">
              <span>Target not set</span>
              <button
                onClick={() => onEditCriteria(submission)}
                className="text-blue-600 hover:text-blue-700"
              >
                <PenLine className="w-3 h-3" />
              </button>
            </div>
          )}

          {submission.prize_per_winner ? (
            <div className="mt-2 text-left">
              <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1">Incentive:</div>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                <Badge variant="outline" className="px-1.5 py-0 h-5 text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 font-medium rounded-full whitespace-nowrap">
                  Rp {submission.prize_per_winner.toLocaleString('id-ID')}
                </Badge>
                <Badge variant="outline" className="px-1.5 py-0 h-5 text-[10px] text-gray-500 bg-white border-gray-200 font-normal rounded-full whitespace-nowrap">
                  {submission.winnerCount || 0} user
                </Badge>
              </div>

              <div className="text-xs text-gray-900 font-medium">
                <span className="text-gray-400 font-normal mr-1">Total:</span>
                Rp {((submission.prize_per_winner || 0) * (submission.winnerCount || 0)).toLocaleString('id-ID')}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-[10px] text-gray-400 italic">
              <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mb-1 not-italic">Incentive:</div>
              No incentive
            </div>
          )}
        </div>
      </TableCell>

      {/* Researcher */}
      <TableCell className="align-top py-4 border-y border-gray-200">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-gray-900 leading-tight">
            {submission.researcherName}
          </span>

          <div className="flex flex-col mt-1.5">
            <div className="flex items-center gap-2 mb-2">
              {submission.phone_number && (
                <TooltipProvider>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <a
                        href={`https://wa.me/${submission.phone_number.replace(/^0/, '62')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center p-1.5 rounded text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 transition-colors border border-green-100"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">{submission.phone_number}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {submission.researcherEmail && (
                <TooltipProvider>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <a
                        href={`mailto:${submission.researcherEmail}`}
                        className="inline-flex items-center justify-center p-1.5 rounded text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-100"
                      >
                        <Mail className="w-3.5 h-3.5" />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs font-medium">{submission.researcherEmail}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            {(submission.education || submission.department || submission.university) && (
              <div className="mt-1.5 pt-1.5 border-t border-gray-100/80 flex flex-col gap-0.5">
                {submission.education && (
                  <span className="inline-flex w-fit items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-purple-50 text-purple-700 border border-purple-100 capitalize">
                    {submission.education.replace(/_/g, ' ')}
                  </span>
                )}
                {submission.department && (
                  <span className="text-[10px] text-gray-500">{submission.department}</span>
                )}
                {submission.university && (
                  <span className="text-[10px] text-gray-500">{submission.university}</span>
                )}
              </div>
            )}

            {submission.leads && (
              <div className="text-[10px] text-gray-400 mt-1.5 pt-1.5 border-t border-gray-100/80 leading-tight">
                Lead: <span className="capitalize">{submission.leads.replace(/_/g, ' ')}</span>
              </div>
            )}
          </div>
        </div>
      </TableCell>

      {/* Campaign Actions */}
      <TableCell className="align-top py-4 space-y-2 pl-8 pr-6 border-y border-r border-gray-200 rounded-r-xl">
        <div className="flex flex-col gap-2 w-full max-w-[180px]">
          {reserveBtn}
          {paymentBtn}
          {pageBtn}
          {extendBtn}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─────────────────────────────────────────────────────────────
// Mobile Card Row
// ─────────────────────────────────────────────────────────────

export function SubmissionsMobileCard({
  submission,
  paymentData,
  existingPage,
  isScheduled,
  onStatusChange,
  onOpenPageBuilder,
  onOpenSchedule,
  onOpenPayment,
}: SubmissionsTableRowProps) {
  const isPaid = ['paid', 'completed'].includes(paymentData.latestStatus || submission.payment_status || '');
  const isRejectedEvent = ['rejected', 'spam'].includes(submission.submission_status || '');
  const isLegacyActive = ['live', 'completed', 'scheduled'].includes(submission.status || '');
  const reservedAtTime = submission.slot_reserved_at ? new Date(submission.slot_reserved_at).getTime() : 0;
  const isActuallyExpired = !isPaid && !paymentData.hasEverPaid && (
    paymentData.latestStatus === 'expired' ||
    submission.payment_status === 'expired' ||
    (submission.slot_booked_by === 'user' && reservedAtTime > 0 && Date.now() > (reservedAtTime + 3600_000))
  );
  const hasValidSchedule = (isScheduled || isLegacyActive) && !isActuallyExpired;
  const isPending = !isPaid && paymentData.hasInvoices && !isRejectedEvent && hasValidSchedule;

  // Reserve Slot Button
  let reserveBtn;
  if (hasValidSchedule) {
    reserveBtn = (
      <div className="flex items-center gap-1.5 w-full">
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <div className="flex-1 flex items-center justify-start gap-1.5 px-2.5 h-8 bg-gray-50/80 border border-gray-200/70 rounded-md cursor-help">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                <CalendarCheck className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <span className="text-xs font-medium text-gray-700 tracking-wide truncate">{isLegacyActive && !isScheduled ? 'Scheduled' : 'Slot Reserved'}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-white p-3 shadow-xl text-slate-700 space-y-1">
              <p className="font-semibold text-xs text-blue-600 mb-1">Reservation Details</p>
              <p className="text-sm">Date: <span className="font-medium text-gray-900">{submission.start_date ? new Date(submission.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set'}</span></p>
              <p className="text-sm">Type: <span className="font-medium text-gray-900">{(existingPage?.is_extra_ad || (submission.admin_notes || '').includes('[EXTRA_AD]')) ? 'Extra Ad' : 'Regular Ad'}</span></p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 h-8 w-8 p-0 text-gray-500 hover:text-blue-600 border-gray-200 bg-white"
          onClick={() => onOpenSchedule(submission)}
        >
          <PenLine className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  } else {
    reserveBtn = (
      <div className="w-full relative">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center h-8 text-xs font-medium shadow-sm transition-all text-gray-600 hover:text-blue-600 border-gray-200 bg-white"
          onClick={() => onOpenSchedule(submission)}
        >
          <Calendar className="w-3.5 h-3.5 mr-2 shrink-0 text-blue-500" />
          Reserve Slot
        </Button>
        {isActuallyExpired && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-red-600 bg-red-50 border border-red-100 px-1 py-0.5 rounded font-bold shadow-sm pointer-events-none leading-none">
            Expired
          </span>
        )}
      </div>
    );
  }

  return (
    <Card className="border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-1 flex-1">
            <h3 className="font-semibold text-gray-900 leading-tight">
              {submission.formTitle}
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                {submission.formId.substring(0, 8)}...
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 -mt-1 -mr-2 text-gray-400"
            onClick={() => window.open(submission.formUrl, '_blank')}
          >
            <Eye className="w-4 h-4" />
          </Button>
        </div>

        {/* Researcher */}
        <div className="flex items-center gap-3 py-3 border-y border-gray-100">
          <div className="flex-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Researcher</p>
            <p className="font-medium text-gray-900 text-sm">{submission.researcherName}</p>
            <p className="text-xs text-gray-500">{submission.researcherEmail}</p>
          </div>
        </div>

        {/* Mobile Stats & Status Rows */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Date</p>
            <p className="text-sm text-gray-900">{new Date(submission.submittedAt).toLocaleDateString()}</p>
          </div>
          <div className="text-right pl-4 border-l border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Items</p>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                {submission.questionCount} Qs
              </Badge>
              {submission.duration ? (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-blue-600 bg-blue-50 border-blue-100">
                  {submission.duration} Days
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {/* Actions Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-500">Status</label>
            <select
              className={`w-full px-3 py-2 text-xs font-medium rounded-lg border-0 cursor-pointer transition-all focus:ring-2 ${submission.status === 'spam' ? 'bg-red-100 text-red-700 focus:ring-red-500' :
                submission.status === 'in_review' ? 'bg-blue-100 text-blue-700 focus:ring-blue-500' :
                  submission.status === 'rejected' ? 'bg-red-100 text-red-700 focus:ring-red-500' :
                    submission.status === 'approved' ? 'bg-green-100 text-green-700 focus:ring-green-500' :
                      'bg-gray-100 text-gray-800'
                }`}
              value={submission.status || 'in_review'}
              onChange={(e) => onStatusChange(submission.id, e.target.value)}
            >
              <option value="spam" className="bg-white text-gray-900">Spam</option>
              <option value="in_review" className="bg-white text-gray-900">In Review</option>
              <option value="approved" className="bg-white text-gray-900">Approved</option>
              <option value="rejected" className="bg-white text-gray-900">Rejected</option>
            </select>
          </div>
        </div>

        {/* Campaign Actions Area */}
        <div className="space-y-3 mt-3 pt-3 border-t border-gray-100">
          <div className="flex flex-col gap-2">
            {reserveBtn}

            <div className="grid grid-cols-2 gap-2 w-full">
              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <div className="w-full">
                      <div className="relative w-full">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!isScheduled && !isLegacyActive}
                          className={`w-full justify-center h-8 text-xs font-medium shadow-sm transition-all ${(isScheduled || isLegacyActive) ? 'text-gray-600 hover:text-emerald-600 border-gray-200 bg-white' : 'text-gray-400 border-gray-100 bg-gray-50'
                            }`}
                          onClick={() => onOpenPayment(submission)}
                        >
                          <CreditCard className="w-3.5 h-3.5 mr-1" />
                          Payment
                        </Button>
                        {isPaid && <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-green-600 bg-green-50 border border-green-100 px-1 py-0.5 rounded font-bold shadow-sm pointer-events-none leading-none">Paid</span>}
                        {!isPaid && isActuallyExpired && <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-red-600 bg-red-50 border border-red-100 px-1 py-0.5 rounded font-bold shadow-sm pointer-events-none leading-none">Expired</span>}
                        {!isPaid && isPending && <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-500" />}
                        {!isPaid && !isPending && hasValidSchedule && !isActuallyExpired && <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-red-500" />}
                      </div>
                    </div>
                  </TooltipTrigger>
                  {isPaid && (
                    <TooltipContent className="bg-white p-3 shadow-xl text-slate-700 space-y-1">
                      <p className="font-semibold text-xs text-green-600 mb-1">Payment Details</p>
                      <p className="text-sm">Amount: <span className="font-medium text-gray-900">Rp {paymentData.latestAmount ? paymentData.latestAmount.toLocaleString('id-ID') : '0'}</span></p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>

              <TooltipProvider>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <div className="w-full">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!isPaid && !isLegacyActive}
                        className={`w-full justify-center h-8 text-xs font-medium shadow-sm transition-all ${(isPaid || isLegacyActive) ? 'text-gray-600 hover:text-indigo-600 border-gray-200 bg-white relative' : 'text-gray-400 border-gray-100 bg-gray-50'
                          }`}
                        onClick={() => onOpenPageBuilder(submission)}
                      >
                        <Globe className="w-3.5 h-3.5 mr-1" />
                        Pages
                        {!existingPage && (isPaid || isLegacyActive) && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {existingPage && (
                    <TooltipContent className="bg-white p-3 shadow-xl text-slate-700 space-y-1">
                      <p className="font-semibold text-xs text-indigo-600 mb-1">Page Details</p>
                      <p className="text-sm">Title: <span className="font-medium text-gray-900">{existingPage.title || 'Not set'}</span></p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
