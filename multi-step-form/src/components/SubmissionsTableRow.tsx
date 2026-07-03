import { Calendar, CalendarCheck, CreditCard, Globe, PenLine, Zap, Eye } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import type { SurveySubmission, PaymentState, ExistingPage } from './submissions/types';
import { deriveLifecycle } from './submissions/lifecycle';

// Types moved to ./submissions/types — re-exported here for backward compatibility
export type { SurveySubmission, PaymentState, ExistingPage } from './submissions/types';

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface SubmissionsTableRowProps {
  submission: SurveySubmission;
  paymentData: PaymentState;
  existingPage?: ExistingPage;
  isScheduled: boolean;
  onStatusChange: (submissionId: string, newStatus: string) => void;
  onPaymentStatusChange: (submissionId: string, newStatus: string) => void;
  onEditFormDetails: (submission: SurveySubmission) => void;
  onEditCriteria: (submission: SurveySubmission) => void;
  onOpenPageBuilder: (submission: SurveySubmission) => void;
  onOpenSchedule: (submission: SurveySubmission) => void;
  onOpenPayment: (submission: SurveySubmission) => void;
  onExtendCreated: () => void;
}

// ─────────────────────────────────────────────────────────────
// Mobile Card Row
// (Desktop rows now use SubmissionListRow + SubmissionDetailSheet)
// ─────────────────────────────────────────────────────────────

export function SubmissionsMobileCard({
  submission,
  paymentData,
  existingPage,
  isScheduled,
  onStatusChange,
  onPaymentStatusChange,
  onOpenPageBuilder,
  onOpenSchedule,
  onOpenPayment,
}: SubmissionsTableRowProps) {
  const {
    isPaid,
    isLegacyActive,
    isActuallyExpired,
    hasValidSchedule,
    isPending,
  } = deriveLifecycle(submission, paymentData, existingPage, isScheduled);

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
              onChange={(e) => {
                if (e.target.value === 'mark_paid') {
                  onPaymentStatusChange(submission.id, 'paid');
                  // Revert select back to current status visually
                  e.target.value = submission.status || 'in_review';
                } else {
                  onStatusChange(submission.id, e.target.value);
                }
              }}
            >
              <option value="spam" className="bg-white text-gray-900">Spam</option>
              <option value="in_review" className="bg-white text-gray-900">In Review</option>
              <option value="approved" className="bg-white text-gray-900">Approved</option>
              <option value="rejected" className="bg-white text-gray-900">Rejected</option>
              <option value="mark_paid" className="bg-emerald-50 text-emerald-700 font-bold border-t">-- Mark as Paid --</option>
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
                      {submission.distribution_type === 'kilat' ? (
                        <div className="flex items-center justify-center gap-1.5 h-8 w-full rounded-md bg-amber-50 border border-amber-200 text-amber-700 shadow-sm cursor-help">
                          <Zap className="w-3.5 h-3.5" />
                          <span className="text-xs font-semibold tracking-wide">KILAT</span>
                        </div>
                      ) : (
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
                      )}
                    </div>
                  </TooltipTrigger>
                  {submission.distribution_type === 'kilat' ? (
                    <TooltipContent className="bg-white p-3 shadow-xl text-slate-700">
                      <p className="text-xs">Distribusi Kilat. Tidak menggunakan Page builder.</p>
                    </TooltipContent>
                  ) : existingPage ? (
                    <TooltipContent className="bg-white p-3 shadow-xl text-slate-700 space-y-1">
                      <p className="font-semibold text-xs text-indigo-600 mb-1">Page Details</p>
                      <p className="text-sm">Title: <span className="font-medium text-gray-900">{existingPage.title || 'Not set'}</span></p>
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
