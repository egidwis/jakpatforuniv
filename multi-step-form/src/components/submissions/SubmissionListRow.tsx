import { useState } from 'react';
import { ChevronRight, ShieldAlert, Copy, Check, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '../ui/checkbox';
import { Chip } from '../ui/chip';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { cn } from '@/lib/utils';
import type { SurveySubmission, ExistingPage } from './types';
import type { LifecycleInfo } from './lifecycle';
import { getSubmissionActionDot } from './lifecycle';
import { ClientStatusDot } from '../customers/ClientStatusIcon';
import type { CustomerTier } from '../customers/types';
import { missedPaymentWindow } from '@/utils/missedPaymentWindow';

interface SubmissionListRowProps {
  submission: SurveySubmission;
  lifecycle: LifecycleInfo;
  existingPage?: ExistingPage;
  selected: boolean;
  onSelectToggle: (id: string) => void;
  onOpen: (id: string) => void;
  /** Row currently open in the detail pane */
  active?: boolean;
  clientTier?: CustomerTier;
}

function getAutoPlatformTooltip(formUrl?: string): string {
  if (!formUrl) return 'Auto: Google Forms';
  const lowerUrl = formUrl.toLowerCase();
  if (lowerUrl.includes('forms.office.com') || lowerUrl.includes('office.com') || lowerUrl.includes('microsoft')) {
    return 'Auto: Microsoft Forms';
  }
  return 'Auto: Google Forms';
}

/**
 * Compact list row: checkbox · date · id · source chip + title with
 * researcher subtitle · lifecycle chip · chevron. All detail & actions
 * live in the drawer.
 */
export function SubmissionListRow({
  submission,
  lifecycle,
  existingPage,
  selected,
  onSelectToggle,
  onOpen,
  active,
  clientTier,
}: SubmissionListRowProps) {
  const [copiedId, setCopiedId] = useState(false);
  const actionDot = getSubmissionActionDot(submission, lifecycle, existingPage);

  // Track B5 — lihat `missedPaymentWindow` untuk kenapa permukaan ini ada.
  const missedPayment = missedPaymentWindow({
    startDate: submission.start_date,
    submissionStatus: submission.submission_status || submission.status,
    paymentStatus: submission.payment_status,
  });

  const handleCopyId = (e: React.MouseEvent) => {
    navigator.clipboard.writeText(submission.id);
    setCopiedId(true);
    toast.success('Submission ID disalin');
    setTimeout(() => setCopiedId(false), 1500);
  };

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
        'group relative flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors',
        'hover:bg-gray-50',
        active && 'bg-blue-50/70',
        selected && 'bg-blue-50/40'
      )}
    >
      {active && <span aria-hidden="true" className="absolute left-0 top-0 h-full w-0.5 bg-blue-600" />}

      {/* Checkbox wrapper */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center shrink-0"
      >
        <Checkbox
          checked={selected}
          onCheckedChange={() => onSelectToggle(submission.id)}
          aria-label={`Pilih survei ${submission.formTitle}`}
        />
      </div>

      {/* Date & Time column */}
      <div className="hidden sm:flex flex-col text-[11px] leading-tight w-[60px] shrink-0 text-gray-500">
        <span className="font-medium text-gray-700">
          {new Date(submission.submittedAt).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
          })}
        </span>
        <span className="text-[10px] text-gray-400">
          {new Date(submission.submittedAt).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {/* Form ID badge with copy action */}
      <button
        type="button"
        onClick={handleCopyId}
        className="hidden md:inline-flex items-center gap-1 w-[100px] shrink-0 font-mono text-[11px] text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 transition-colors group/id text-left"
        title={`Salin ID Lengkap: ${submission.id}`}
      >
        <span className="truncate">#{submission.formId}</span>
        {copiedId ? (
          <Check className="w-3 h-3 text-green-600 shrink-0 ml-auto" />
        ) : (
          <Copy className="w-3 h-3 text-gray-400 group-hover/id:text-blue-600 transition-colors shrink-0 ml-auto" />
        )}
      </button>

      {/* Review method column */}
      <div className="hidden md:flex items-center w-[65px] shrink-0">
        {submission.distribution_type === 'kilat' ? (
          <Chip variant="purple" size="sm">Kilat</Chip>
        ) : submission.submission_method === 'manual' ? (
          <TooltipProvider>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Chip variant="slate" size="sm" className="cursor-help bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200/80">Manual</Chip>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[11px] py-1 px-2">
                <p>Manual Review</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <TooltipProvider>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Chip variant="purple" size="sm" className="cursor-help font-semibold">Auto</Chip>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[11px] py-1 px-2">
                <p>{getAutoPlatformTooltip(submission.formUrl)}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Title + Researcher Subtitle */}
      <div className="flex-1 min-w-0 flex flex-col leading-tight">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-sm font-semibold text-gray-900 truncate" title={submission.formTitle}>
            {submission.formTitle}
          </span>
          {submission.voucher_code && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 uppercase shrink-0">
                    {submission.voucher_code}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Voucher Code: {submission.voucher_code}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {missedPayment && (
            /* Penanda Track B5. Ditaruh di judul, bukan di chip lifecycle:
               chipnya tetap "Menunggu Pembayaran" — yang benar — dan penanda ini
               menambahkan satu hal yang tidak bisa dibaca dari chip itu, yaitu
               bahwa tanggalnya sudah tidak bisa dikejar. Mengubah chipnya justru
               akan menyembunyikan bahwa uangnya memang masih ditunggu. */
            <TooltipProvider>
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 uppercase shrink-0 cursor-help">
                    <Clock className="w-3 h-3" />
                    Lewat batas
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[18rem]">
                  <p>
                    Batas bayar 14.00 WIB untuk tanggal tayangnya sudah lewat, tapi
                    ordernya masih menunggu pembayaran — tanggalnya perlu diganti.
                    Peneliti jalur manual tidak bisa menjadwalkan ulang sendiri.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {submission.detected_keywords && submission.detected_keywords.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <ShieldAlert className="w-3.5 h-3.5 text-red-500 shrink-0 cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Terdeteksi saat pengajuan awal (tidak dihitung ulang): {submission.detected_keywords.join(', ')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="text-[11px] text-gray-500 truncate mt-0.5 flex items-center gap-1.5 min-w-0">
          <span className="truncate">{submission.researcherName}</span>
          {clientTier && <ClientStatusDot tier={clientTier} />}
          {submission.university && (
            <span className="truncate shrink-0 max-w-[160px] sm:max-w-[260px]">· {submission.university}</span>
          )}
        </div>
      </div>

      {/* Action Dot Indicator (Red / Gray dot with tooltip) */}
      <div onClick={(e) => e.stopPropagation()} className="w-5 shrink-0 flex items-center justify-center">
        {actionDot?.type === 'red' && (
          <TooltipProvider>
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <span className="relative flex h-2.5 w-2.5 cursor-help" aria-label={actionDot.label}>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-2xs"></span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs py-1 px-2.5 font-medium">
                <p>{actionDot.label}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {actionDot?.type === 'gray' && (
          <TooltipProvider>
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <span className="relative flex h-2 w-2 cursor-help" aria-label={actionDot.label}>
                  <span className="inline-flex rounded-full h-2 w-2 bg-slate-400"></span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs py-1 px-2.5 font-medium">
                <p>{actionDot.label}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
    </div>
  );
}
