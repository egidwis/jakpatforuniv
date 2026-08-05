import { useEffect, useState } from 'react';
import {
  Ban,
  Calendar,
  Check,
  CreditCard,
  FileText,
  Globe,
  Info,
  Mail,
  MessageCircle,
  RotateCcw,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Chip } from '../ui/chip';
import { DetailSheet } from '../data-list/DetailSheet';
import { DetailPane } from '../data-list/DetailPane';
import { cn } from '@/lib/utils';
import type { SurveySubmission, PaymentState, ExistingPage } from './types';
import { deriveLifecycle } from './lifecycle';
import { ReviewStatusChip } from './ReviewStatusChip';
import { ReviewTimeline } from './ReviewTimeline';
import { InfoTab } from './tabs/InfoTab';
import { ReviewTab } from './tabs/ReviewTab';
import { ReservationTab } from './tabs/ReservationTab';
import { PaymentTab } from './tabs/PaymentTab';
import { PageTab } from './tabs/PageTab';

type DetailTab = 'info' | 'review' | 'reservation' | 'payment' | 'page';

const TABS: { id: DetailTab; label: string; icon: typeof FileText }[] = [
  { id: 'info', label: 'Info', icon: Info },
  { id: 'review', label: 'Review', icon: FileText },
  { id: 'reservation', label: 'Reservasi', icon: Calendar },
  { id: 'payment', label: 'Payment', icon: CreditCard },
  { id: 'page', label: 'Page', icon: Globe },
];

interface SubmissionDetailSheetProps {
  submission: SurveySubmission | null;
  paymentData: PaymentState;
  existingPage?: ExistingPage;
  isScheduled: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (submissionId: string, newStatus: string, notes?: string) => void;
  onPaymentStatusChange: (submissionId: string, newStatus: string) => void;
  onEditFormDetails: (submission: SurveySubmission) => void;
  onEditCriteria: (submission: SurveySubmission) => void;
  onOpenPageBuilder: (submission: SurveySubmission) => void;
  onOpenSchedule: (submission: SurveySubmission) => void;
  onOpenPayment: (submission: SurveySubmission) => void;
  /** Pindahkan order antara jalur iklan regular dan JFU Kilat. */
  onConvertDistribution: (submission: SurveySubmission, target: 'regular' | 'kilat') => Promise<void>;
  onExtendCreated: () => void;
  variant?: 'sheet' | 'pane';
  clientTier?: 'vvip' | 'vip' | 'returning' | 'new';
}

/**
 * Right-side drawer with all submission detail & actions, organised in 4 tabs.
 * Tabs are entry points: heavy actions still launch the existing flows
 * (SchedulePaymentView fullscreen, PageBuilderModal, edit modals).
 */
export function SubmissionDetailSheet({
  submission,
  paymentData,
  existingPage,
  isScheduled,
  onOpenChange,
  onStatusChange,
  onPaymentStatusChange,
  onEditFormDetails,
  onEditCriteria,
  onOpenPageBuilder,
  onOpenSchedule,
  onOpenPayment,
  onConvertDistribution,
  onExtendCreated,
  variant = 'sheet',
  clientTier,
}: SubmissionDetailSheetProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [reviewNote, setReviewNote] = useState('');
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  // Reset to the Info tab whenever a different submission is opened
  const submissionId = submission?.id;
  useEffect(() => {
    setActiveTab('info');
    setReviewNote('');
    setIsHistoryExpanded(false);
  }, [submissionId]);

  if (!submission) return null;

  const lifecycle = deriveLifecycle(submission, paymentData, existingPage, isScheduled);

  const tabBar = (
    <div className="flex gap-1 -mb-px">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors',
              isActive
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  const clientTierBadge = clientTier ? (
    clientTier === 'vvip' ? (
      <span className="inline-flex bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 text-white font-extrabold rounded-full px-2 py-0.5 text-[9px] tracking-wide shrink-0">
        ✦ VVIP
      </span>
    ) : clientTier === 'vip' ? (
      <Chip variant="amber" size="sm">VIP</Chip>
    ) : clientTier === 'returning' ? (
      <Chip variant="blue" size="sm">Returning</Chip>
    ) : (
      <Chip variant="slate" size="sm">New</Chip>
    )
  ) : null;

  const subtitle = (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 min-w-0 w-full">
        <span className="truncate font-medium">{submission.researcherName}</span>
        {submission.university && (
          <span className="text-gray-400 text-[11px] truncate shrink-0 max-w-[120px] sm:max-w-[200px]">· {submission.university}</span>
        )}
        <span className="shrink-0">{clientTierBadge}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        {submission.phone_number && (
          <a
            href={`https://wa.me/${submission.phone_number.replace(/^0/, '62')}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 transition-colors"
          >
            <MessageCircle className="w-3 h-3" /> WhatsApp
          </a>
        )}
        {submission.researcherEmail && (
          <a
            href={`mailto:${submission.researcherEmail}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
          >
            <Mail className="w-3 h-3" /> Email
          </a>
        )}
      </span>
    </span>
  );

  const chips = undefined;

  const body = (
    <>
      {activeTab === 'info' && <InfoTab submission={submission} lifecycle={lifecycle} onDataUpdated={onExtendCreated} />}
      {activeTab === 'review' && (
        <ReviewTab submission={submission} onEditFormDetails={onEditFormDetails} />
      )}
      {activeTab === 'reservation' && (
        <ReservationTab
          submission={submission}
          paymentData={paymentData}
          existingPage={existingPage}
          isScheduled={isScheduled}
          lifecycle={lifecycle}
          onOpenSchedule={onOpenSchedule}
          onConvertDistribution={onConvertDistribution}
        />
      )}
      {activeTab === 'payment' && (
        <PaymentTab
          submission={submission}
          paymentData={paymentData}
          lifecycle={lifecycle}
          onOpenPayment={onOpenPayment}
          onPaymentStatusChange={onPaymentStatusChange}
          onEditFormDetails={onEditFormDetails}
        />
      )}
      {activeTab === 'page' && (
        <PageTab
          submission={submission}
          existingPage={existingPage}
          lifecycle={lifecycle}
          onOpenPageBuilder={onOpenPageBuilder}
          onExtendCreated={onExtendCreated}
        />
      )}
    </>
  );

  const { displayStatus } = lifecycle;
  const isNeedReview = !displayStatus || displayStatus === 'in_review' || displayStatus === 'pending';

  const footer = activeTab !== 'review' ? undefined : (
    <div className="space-y-4">
      {/* Row 1: Status & Timeline Toggle */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-gray-400 font-medium">Review Status:</span>
          <ReviewStatusChip status={displayStatus} />
        </div>
        
        <ReviewTimeline
          history={submission.review_history || []}
          isExpanded={isHistoryExpanded}
          onToggle={() => setIsHistoryExpanded(!isHistoryExpanded)}
        />
      </div>

      {/* Conditional: compose & buttons if in need review status */}
      {isNeedReview ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="review-note-input" className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Review Notes (Optional)
            </label>
            <Textarea
              id="review-note-input"
              placeholder="Tambahkan catatan (misal alasan reject atau info tambahan)..."
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              className="text-xs min-h-[60px] max-h-[120px] bg-slate-50/50 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              size="sm"
              className="h-9 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold"
              onClick={() => {
                onStatusChange(submission.id, 'approved', reviewNote);
                setReviewNote('');
              }}
            >
              <Check className="w-3.5 h-3.5 mr-1.5" /> Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={() => {
                onStatusChange(submission.id, 'rejected', reviewNote);
                setReviewNote('');
              }}
            >
              <X className="w-3.5 h-3.5 mr-1.5" /> Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs font-semibold text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700"
              onClick={() => {
                onStatusChange(submission.id, 'spam', reviewNote);
                setReviewNote('');
              }}
            >
              <Ban className="w-3.5 h-3.5 mr-1.5" /> Spam
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors px-3 py-1.5 rounded-md hover:bg-blue-50 border border-transparent hover:border-blue-100"
            onClick={() => onStatusChange(submission.id, 'in_review', reviewNote)}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset ke Need Review
          </button>
        </div>
      )}
    </div>
  );

  const title = (
    <span className="truncate">{submission.formTitle}</span>
  );

  if (variant === 'pane') {
    return (
      <DetailPane
        title={title}
        subtitle={subtitle}
        chips={chips}
        nav={tabBar}
        footer={footer}
        onClose={() => onOpenChange(false)}
      >
        {body}
      </DetailPane>
    );
  }

  return (
    <DetailSheet
      open={!!submission}
      onOpenChange={onOpenChange}
      title={title}
      subtitle={subtitle}
      chips={chips}
      nav={tabBar}
      footer={footer}
    >
      {body}
    </DetailSheet>
  );
}

