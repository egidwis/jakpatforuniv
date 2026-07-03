import { ChevronRight, ShieldAlert, Zap } from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import { Chip } from '../ui/chip';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { cn } from '@/lib/utils';
import type { SurveySubmission } from './types';
import type { LifecycleInfo } from './lifecycle';
import { LifecycleChip } from './LifecycleChip';

interface SubmissionListRowProps {
  submission: SurveySubmission;
  lifecycle: LifecycleInfo;
  selected: boolean;
  onSelectToggle: (id: string) => void;
  onOpen: (id: string) => void;
}

/**
 * Compact one-line list row: checkbox · date · id · title · researcher ·
 * lifecycle chip · chevron. All detail & actions live in the drawer.
 */
export function SubmissionListRow({
  submission,
  lifecycle,
  selected,
  onSelectToggle,
  onOpen,
}: SubmissionListRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(submission.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(submission.id);
        }
      }}
      className={cn(
        'group flex items-center gap-3 px-4 py-3 bg-white border rounded-xl cursor-pointer transition-all',
        'hover:shadow hover:border-gray-300',
        selected ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'
      )}
    >
      {/* Checkbox — stop propagation so it never opens the drawer */}
      <div onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onSelectToggle(submission.id)}
          aria-label={`Select ${submission.formTitle}`}
        />
      </div>

      {/* Submitted */}
      <div className="w-[76px] shrink-0 flex flex-col text-[11px] text-gray-500 leading-tight">
        <span className="font-medium text-gray-900">
          {new Date(submission.submittedAt).toLocaleDateString('id-ID')}
        </span>
        <span>
          {new Date(submission.submittedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Submission ID */}
      <span className="w-[84px] shrink-0 font-mono text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5 truncate">
        #{submission.formId}
      </span>

      {/* Title */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <span className="text-sm font-semibold text-gray-900 truncate">
                {submission.formTitle}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[400px]">
              <p>{submission.formTitle}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {submission.distribution_type === 'kilat' && (
          <Chip variant="amber" size="sm" className="shrink-0">
            <Zap className="w-3 h-3" /> KILAT
          </Chip>
        )}
        {submission.detected_keywords && submission.detected_keywords.length > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>Detected: {submission.detected_keywords.join(', ')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Researcher · University */}
      <div className="hidden lg:flex w-[220px] shrink-0 flex-col leading-tight min-w-0">
        <span className="text-xs font-medium text-gray-700 truncate">{submission.researcherName}</span>
        {submission.university && (
          <span className="text-[11px] text-gray-400 truncate">{submission.university}</span>
        )}
      </div>

      {/* Lifecycle chip */}
      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
        <LifecycleChip submission={submission} lifecycle={lifecycle} size="sm" />
      </div>

      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
    </div>
  );
}
