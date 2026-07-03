import { Info } from 'lucide-react';
import { Chip } from '../ui/chip';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { STATUS_TOKENS } from '../../lib/status-tokens';
import type { SurveySubmission } from './types';
import type { LifecycleInfo } from './lifecycle';

const PAGE_STATUS_LABELS: Record<LifecycleInfo['pageStatus'], string> = {
  none: 'Not created',
  drafted: 'Drafted',
  scheduled: 'Scheduled',
  live: 'Live',
  completed: 'Completed',
  kilat: 'KILAT (no page)',
};

function reviewAxisLabel(displayStatus: string): string {
  if (displayStatus === 'in_review') return 'Need Review';
  return displayStatus.replace(/_/g, ' ');
}

function paymentAxisLabel(lifecycle: LifecycleInfo): string {
  if (lifecycle.isPaid) return 'Paid';
  if (lifecycle.isPending) return 'Waiting payment';
  if (lifecycle.isActuallyExpired) return 'Expired';
  return 'Not created';
}

function scheduleAxisLabel(lifecycle: LifecycleInfo): string {
  if (lifecycle.isActuallyExpired) return 'Expired';
  if (lifecycle.hasValidSchedule) return 'Reserved';
  return 'Not reserved';
}

interface LifecycleChipProps {
  submission: SurveySubmission;
  lifecycle: LifecycleInfo;
  size?: 'sm' | 'md';
}

/**
 * Single combined status chip for a submission. The tooltip breaks the
 * combined stage back into its three axes (review / schedule+payment / page)
 * and surfaces the rejection reason when rejected.
 */
export function LifecycleChip({ submission, lifecycle, size = 'md' }: LifecycleChipProps) {
  const token = STATUS_TOKENS[lifecycle.stage];
  const isRejected = lifecycle.stage === 'rejected';

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-help">
            <Chip variant={token.variant} size={size} dot={token.dot} pulse={token.pulse}>
              {token.label}
              {isRejected && submission.admin_notes && <Info className="w-3 h-3 shrink-0" />}
            </Chip>
          </span>
        </TooltipTrigger>
        <TooltipContent className="bg-white p-3 shadow-xl text-slate-700 space-y-1 max-w-[320px]">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <span className="text-gray-400 font-medium">Review</span>
            <span className="font-medium text-gray-900 capitalize">{reviewAxisLabel(lifecycle.displayStatus)}</span>
            <span className="text-gray-400 font-medium">Schedule</span>
            <span className="font-medium text-gray-900">{scheduleAxisLabel(lifecycle)}</span>
            <span className="text-gray-400 font-medium">Payment</span>
            <span className="font-medium text-gray-900">{paymentAxisLabel(lifecycle)}</span>
            <span className="text-gray-400 font-medium">Page</span>
            <span className="font-medium text-gray-900">{PAGE_STATUS_LABELS[lifecycle.pageStatus]}</span>
          </div>
          {isRejected && submission.admin_notes && (
            <div className="pt-1.5 mt-1 border-t border-gray-100">
              <p className="font-semibold text-xs text-red-600 mb-0.5">Rejection Reason:</p>
              <p className="text-xs leading-relaxed">{submission.admin_notes}</p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
