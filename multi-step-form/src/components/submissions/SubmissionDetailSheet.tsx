import { useEffect, useState, useCallback } from 'react';
import {
  Ban,
  Calendar,
  CalendarCheck,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  Globe,
  Info,
  Mail,
  MessageCircle,
  PenLine,
  RotateCcw,
  ShieldAlert,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Chip } from '../ui/chip';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { DetailSheet, DetailSheetSection } from '../data-list/DetailSheet';
import { DetailPane } from '../data-list/DetailPane';
import { calculateTotalAdCost, calculateIncentiveCost, calculateDiscount } from '../../utils/cost-calculator';
import { updateFormDetails, updateSubmissionCriteria } from '../../utils/supabase';
import { cn } from '@/lib/utils';
import type { SurveySubmission, PaymentState, ExistingPage } from './types';
import { deriveLifecycle } from './lifecycle';
import { LifecycleChip } from './LifecycleChip';
import { ReviewStatusChip } from './ReviewStatusChip';
import { ReviewTimeline } from './ReviewTimeline';
import { ReserveSlotAction, PaymentAction, PageAction, ExtendAction } from './CampaignActions';

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
  onExtendCreated: () => void;
  variant?: 'sheet' | 'pane';
  clientTier?: 'vvip' | 'vip' | 'returning' | 'new';
}

function copyToClipboard(text: string, message: string) {
  navigator.clipboard.writeText(text);
  toast.success(message);
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
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
  const isKilat = submission.distribution_type === 'kilat';

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

// ─────────────────────────────────────────────────────────────
// Tab: Info — submission summary & researcher profile
// ─────────────────────────────────────────────────────────────

function InfoTab({
  submission,
  lifecycle,
  onDataUpdated,
}: {
  submission: SurveySubmission;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onDataUpdated: () => void;
}) {
  type EditSection = 'submission' | 'criteria' | 'incentive' | null;
  const [editing, setEditing] = useState<EditSection>(null);
  const [saving, setSaving] = useState(false);

  // Draft states for Submission section
  const [draftTitle, setDraftTitle] = useState('');
  const [draftQuestions, setDraftQuestions] = useState('');
  const [draftDuration, setDraftDuration] = useState('');

  // Draft states for Kriteria section
  const [draftCriteria, setDraftCriteria] = useState('');

  // Draft states for Insentif section
  const [draftPrize, setDraftPrize] = useState('');
  const [draftWinners, setDraftWinners] = useState('');

  const startEdit = useCallback((section: EditSection) => {
    if (section === 'submission') {
      setDraftTitle(submission.formTitle || '');
      setDraftQuestions(submission.questionCount?.toString() || '');
      setDraftDuration(submission.duration?.toString() || '');
    } else if (section === 'criteria') {
      setDraftCriteria(submission.criteria || '');
    } else if (section === 'incentive') {
      setDraftPrize(submission.prize_per_winner?.toString() || '');
      setDraftWinners(submission.winnerCount?.toString() || '');
    }
    setEditing(section);
  }, [submission]);

  const cancelEdit = () => setEditing(null);

  const handleSaveSubmission = async () => {
    setSaving(true);
    try {
      await updateFormDetails(submission.id, {
        title: draftTitle,
        survey_url: submission.formUrl,
        question_count: parseInt(draftQuestions) || 0,
        duration: parseInt(draftDuration) || 0,
      });
      toast.success('Detail submission diperbarui');
      setEditing(null);
      onDataUpdated();
    } catch {
      toast.error('Gagal menyimpan perubahan');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCriteria = async () => {
    setSaving(true);
    try {
      await updateSubmissionCriteria(
        submission.id,
        draftCriteria,
        submission.prize_per_winner || 0,
        submission.winnerCount || 0,
      );
      toast.success('Kriteria diperbarui');
      setEditing(null);
      onDataUpdated();
    } catch {
      toast.error('Gagal menyimpan perubahan');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveIncentive = async () => {
    setSaving(true);
    try {
      await updateSubmissionCriteria(
        submission.id,
        submission.criteria || '',
        parseInt(draftPrize) || 0,
        parseInt(draftWinners) || 0,
      );
      toast.success('Insentif diperbarui');
      setEditing(null);
      onDataUpdated();
    } catch {
      toast.error('Gagal menyimpan perubahan');
    } finally {
      setSaving(false);
    }
  };

  const editButton = (section: EditSection) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-[11px] text-gray-400 hover:text-blue-600"
      onClick={() => startEdit(section)}
    >
      <PenLine className="w-3 h-3 mr-1" /> Edit
    </Button>
  );

  const saveCancel = (onSave: () => void) => (
    <div className="flex items-center gap-2 pt-1.5">
      <Button
        size="sm"
        className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white"
        onClick={onSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-3 text-xs text-gray-500"
        onClick={cancelEdit}
        disabled={saving}
      >
        Cancel
      </Button>
    </div>
  );

  return (
    <>
      {/* ── Submission ────────────────────────────────── */}
      <DetailSheetSection
        title="Submission"
        action={editing !== 'submission' ? editButton('submission') : undefined}
      >
        {editing === 'submission' ? (
          <div className="space-y-2.5 text-xs">
            <div className="space-y-1">
              <label className="text-gray-400 text-[11px]">Judul survey</label>
              <Input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-gray-400 text-[11px]">Jumlah pertanyaan</label>
                <Input
                  type="number"
                  value={draftQuestions}
                  onChange={(e) => setDraftQuestions(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-gray-400 text-[11px]">Durasi iklan (days)</label>
                <Input
                  type="number"
                  value={draftDuration}
                  onChange={(e) => setDraftDuration(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            {saveCancel(handleSaveSubmission)}
          </div>
        ) : (
          <div className="grid grid-cols-[120px_1fr] !gap-x-3 !gap-y-1.5 text-xs">
            <span className="text-gray-400">Judul survey</span>
            <span className="font-medium text-gray-900">{submission.formTitle}</span>
            <span className="text-gray-400">Submission ID</span>
            <span className="font-mono text-gray-900">#{submission.formId}</span>
            <span className="text-gray-400">Tanggal submission</span>
            <span className="font-medium text-gray-900">
              {new Date(submission.submittedAt).toLocaleDateString('id-ID')}{' '}
              {new Date(submission.submittedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="text-gray-400">Jumlah pertanyaan</span>
            <span className="font-medium text-gray-900">{submission.questionCount} Qs</span>
            <span className="text-gray-400">Durasi iklan</span>
            <span className="font-medium text-gray-900">{submission.duration ? `${submission.duration} Days` : 'Belum diisi'}</span>
          </div>
        )}
      </DetailSheetSection>

      {/* ── Kriteria Responden ────────────────────────── */}
      <DetailSheetSection
        title="Kriteria Responden"
        action={editing !== 'criteria' ? editButton('criteria') : undefined}
      >
        {editing === 'criteria' ? (
          <div className="space-y-2.5">
            <Textarea
              value={draftCriteria}
              onChange={(e) => setDraftCriteria(e.target.value)}
              className="min-h-[80px] text-xs"
              placeholder="e.g. Usia 18-25 tahun, Mahasiswa aktif..."
            />
            {saveCancel(handleSaveCriteria)}
          </div>
        ) : submission.criteria ? (
          <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">
            {submission.criteria}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic bg-gray-50 px-2.5 py-1.5 rounded border border-dashed border-gray-200">
            Target not set
          </p>
        )}
      </DetailSheetSection>

      {/* ── Insentif ─────────────────────────────────── */}
      <DetailSheetSection
        title="Insentif"
        action={editing !== 'incentive' ? editButton('incentive') : undefined}
      >
        {editing === 'incentive' ? (
          <div className="space-y-2.5 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-gray-400 text-[11px]">Insentif per user (Rp)</label>
                <Input
                  type="number"
                  value={draftPrize}
                  onChange={(e) => setDraftPrize(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-gray-400 text-[11px]">Jumlah user</label>
                <Input
                  type="number"
                  value={draftWinners}
                  onChange={(e) => setDraftWinners(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-100 px-3 py-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Total insentif</span>
                <span className="font-semibold text-emerald-600">
                  Rp {((parseInt(draftPrize) || 0) * (parseInt(draftWinners) || 0)).toLocaleString('id-ID')}
                </span>
              </div>
            </div>
            {saveCancel(handleSaveIncentive)}
          </div>
        ) : submission.prize_per_winner ? (
          <div className="grid grid-cols-[120px_1fr] !gap-x-3 !gap-y-1.5 text-xs">
            <span className="text-gray-400">Insentif per user</span>
            <span className="font-medium text-gray-900">
              Rp {submission.prize_per_winner.toLocaleString('id-ID')}
            </span>

            <span className="text-gray-400">Jumlah user</span>
            <span className="font-medium text-gray-900">
              {submission.winnerCount || 0} user
            </span>

            <span className="text-gray-400">Total insentif</span>
            <span className="font-semibold text-emerald-600">
              Rp {((submission.prize_per_winner || 0) * (submission.winnerCount || 0)).toLocaleString('id-ID')}
            </span>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 italic">No incentive</p>
        )}
      </DetailSheetSection>

      {/* ── Researcher (read-only) ────────────────────── */}
      <DetailSheetSection title="Researcher">
        <div className="grid grid-cols-[120px_1fr] !gap-x-3 !gap-y-1.5 text-xs">
          <span className="text-gray-400">Nama</span>
          <span className="font-medium text-gray-900">{submission.researcherName}</span>

          {submission.education && (
            <>
              <span className="text-gray-400">Edukasi</span>
              <span className="font-medium text-gray-900 capitalize text-left">
                {submission.education.replace(/_/g, ' ')}
              </span>
            </>
          )}

          {submission.department && (
            <>
              <span className="text-gray-400">Jurusan</span>
              <span className="font-medium text-gray-900">{submission.department}</span>
            </>
          )}

          {submission.university && (
            <>
              <span className="text-gray-400">Universitas</span>
              <span className="font-medium text-gray-900">{submission.university}</span>
            </>
          )}

          {submission.leads && (
            <>
              <span className="text-gray-400">Lead</span>
              <span className="font-medium text-gray-900 capitalize">
                {submission.leads.replace(/_/g, ' ')}
              </span>
            </>
          )}

          {submission.phone_number && (
            <>
              <span className="text-gray-400">WhatsApp</span>
              <span className="font-medium text-gray-900">{submission.phone_number}</span>
            </>
          )}

          {submission.researcherEmail && (
            <>
              <span className="text-gray-400">Email</span>
              <span className="font-medium text-gray-900">{submission.researcherEmail}</span>
            </>
          )}
        </div>
      </DetailSheetSection>

      {/* ── Status ────────────────────────────────────── */}
      <DetailSheetSection title="Status Submission">
        <div className="flex items-center">
          <LifecycleChip submission={submission} lifecycle={lifecycle} />
        </div>
      </DetailSheetSection>
    </>
  );
}


// ─────────────────────────────────────────────────────────────
// Tab: Review (default) — survey preview & review decision inputs
// ─────────────────────────────────────────────────────────────

function ReviewTab({
  submission,
  onEditFormDetails,
}: {
  submission: SurveySubmission;
  onEditFormDetails: (submission: SurveySubmission) => void;
}) {
  return (
    <>
      {/* Survey preview */}
      <DetailSheetSection
        title="Kuesioner"
        className="flex flex-col flex-1 h-full"
        action={
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => onEditFormDetails(submission)}
                  >
                    <PenLine className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-950 px-2 py-1 text-white text-[11px] rounded shadow-md">
                  Edit Link
                </TooltipContent>
              </Tooltip>

              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => copyToClipboard(submission.formUrl, 'Survey link copied!')}
                    disabled={!submission.formUrl}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-950 px-2 py-1 text-white text-[11px] rounded shadow-md">
                  Copy Link
                </TooltipContent>
              </Tooltip>

              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => window.open(submission.formUrl, '_blank', 'noopener,noreferrer')}
                    disabled={!submission.formUrl}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-950 px-2 py-1 text-white text-[11px] rounded shadow-md">
                  Buka Link
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        }
      >
        {submission.formUrl ? (
          <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex flex-col h-[calc(100vh-280px)] min-h-[400px]">
            <div className="px-3 py-1.5 border-b border-gray-200 bg-white flex items-center gap-1.5 min-w-0">
              <Globe className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="text-[11px] text-gray-500 truncate">{submission.formUrl.replace(/^https?:\/\//, '')}</span>
            </div>
            <iframe
              src={submission.formUrl}
              title={`Preview: ${submission.formTitle}`}
              className="w-full flex-1 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
            <p className="px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-200 bg-white">
              Preview kosong? Situs survei memblokir embed — gunakan tombol "Buka" di atas.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-xs text-gray-400">
            Tidak ada link survey.
          </div>
        )}
        {submission.detected_keywords && submission.detected_keywords.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 mt-3">
            <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">
              Detected keywords: <span className="font-medium">{submission.detected_keywords.join(', ')}</span>
            </p>
          </div>
        )}
      </DetailSheetSection>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Reservasi — slot status + Reserve/Edit Schedule entry point
// ─────────────────────────────────────────────────────────────

function ReservationTab({
  submission,
  paymentData,
  existingPage,
  isScheduled,
  lifecycle,
  onOpenSchedule,
}: {
  submission: SurveySubmission;
  paymentData: PaymentState;
  existingPage?: ExistingPage;
  isScheduled: boolean;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onOpenSchedule: (submission: SurveySubmission) => void;
}) {
  const isExtraAd = existingPage?.is_extra_ad || (submission.admin_notes || '').includes('[EXTRA_AD]');

  return (
    <>
      <DetailSheetSection title="Status Reservasi">
        {lifecycle.hasValidSchedule ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-blue-700">
              <CalendarCheck className="w-4 h-4" />
              <span className="text-xs font-semibold">
                {lifecycle.isLegacyActive && !isScheduled ? 'Scheduled' : 'Slot Reserved'}
              </span>
              {lifecycle.slotExpiresAt && (
                <Chip variant="amber" size="sm" dot pulse>&lt;1h</Chip>
              )}
            </div>
            <div className="grid grid-cols-[auto_1fr] !gap-x-3 !gap-y-1 text-xs">
              <span className="text-gray-400">Start</span>
              <span className="font-medium text-gray-900">{formatDate(submission.start_date)}</span>
              <span className="text-gray-400">End</span>
              <span className="font-medium text-gray-900">{formatDate(submission.end_date)}</span>
              <span className="text-gray-400">Type</span>
              <span className="font-medium text-gray-900">{isExtraAd ? 'Extra Ad' : 'Regular Ad'}</span>
              {submission.slot_booked_by && (
                <>
                  <span className="text-gray-400">Booked by</span>
                  <span className="font-medium text-gray-900 capitalize">{submission.slot_booked_by}</span>
                </>
              )}
            </div>
          </div>
        ) : lifecycle.isActuallyExpired ? (
          <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-xs text-red-700">
            <span className="font-semibold">Reservasi sebelumnya expired.</span> Slot dilepas — reserve ulang untuk
            melanjutkan ke pembayaran.
          </div>
        ) : (
          <p className="text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2.5">
            Belum ada slot yang direservasi.
            {!lifecycle.canReserveSlot && ' Submission harus di-approve dulu sebelum bisa reserve slot.'}
          </p>
        )}
      </DetailSheetSection>

      <DetailSheetSection title="Aksi">
        <ReserveSlotAction
          submission={submission}
          paymentData={paymentData}
          existingPage={existingPage}
          isScheduled={isScheduled}
          lifecycle={lifecycle}
          onOpenSchedule={onOpenSchedule}
        />
        <p className="text-[11px] text-gray-400">
          Membuka halaman Schedule &amp; Payment (fullscreen) — sama seperti flow sebelumnya.
        </p>
      </DetailSheetSection>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Payment — status, copy link, create payment, Mark as Paid
// ─────────────────────────────────────────────────────────────

function PaymentTab({
  submission,
  paymentData,
  lifecycle,
  onOpenPayment,
  onPaymentStatusChange,
  onEditFormDetails,
}: {
  submission: SurveySubmission;
  paymentData: PaymentState;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onOpenPayment: (submission: SurveySubmission) => void;
  onPaymentStatusChange: (submissionId: string, newStatus: string) => void;
  onEditFormDetails: (submission: SurveySubmission) => void;
}) {
  const adCost = calculateTotalAdCost(submission.questionCount || 0, submission.duration || 0);
  const incentiveCost = calculateIncentiveCost(submission.winnerCount || 0, submission.prize_per_winner || 0);
  const discount = calculateDiscount(submission.voucher_code, adCost, incentiveCost, submission.duration || 0);
  const finalAdCost = adCost - discount;

  return (
    <>
      <DetailSheetSection
        title="Detail Form & Biaya"
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-gray-500 hover:text-blue-600"
            onClick={() => onEditFormDetails(submission)}
          >
            <PenLine className="w-3 h-3 mr-1" /> Edit
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip variant="outline" size="sm">{submission.questionCount} Qs</Chip>
          {submission.duration ? <Chip variant="outline" size="sm">{submission.duration} Days</Chip> : null}
          {submission.voucher_code && (
            <Chip variant="purple" size="sm">
              <Zap className="w-3 h-3 fill-purple-600" /> {submission.voucher_code}
            </Chip>
          )}
        </div>
        {submission.duration && submission.duration > 0 ? (
          <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Ad cost</span>
              <span className={cn('font-medium text-gray-900', discount > 0 && 'line-through text-gray-400 font-normal')}>
                Rp {new Intl.NumberFormat('id-ID').format(adCost)}
              </span>
            </div>
            {discount > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500">Discount ({submission.voucher_code})</span>
                  <span className="font-medium text-emerald-600">-Rp {new Intl.NumberFormat('id-ID').format(discount)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-gray-200">
                  <span className="text-gray-500 font-medium">Final ad cost</span>
                  <span className="font-bold text-emerald-600">Rp {new Intl.NumberFormat('id-ID').format(finalAdCost)}</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">Durasi belum diisi — biaya iklan belum bisa dihitung.</p>
        )}
      </DetailSheetSection>

      <DetailSheetSection title="Aksi">
        <PaymentAction
          submission={submission}
          paymentData={paymentData}
          lifecycle={lifecycle}
          onOpenPayment={onOpenPayment}
        />
        {!lifecycle.isPaid && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 space-y-2">
            <p className="text-[11px] text-emerald-800 leading-snug">
              Pembayaran diterima di luar sistem (transfer manual)? Tandai submission ini sebagai lunas.
            </p>
            <Button
              size="sm"
              className="w-full h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onPaymentStatusChange(submission.id, 'paid')}
            >
              <Check className="w-3.5 h-3.5 mr-1.5" /> Mark as Paid
            </Button>
          </div>
        )}
      </DetailSheetSection>

      <DetailSheetSection title="Status Pembayaran">
        <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
          <div className="grid grid-cols-[auto_1fr] !gap-x-3 !gap-y-1 text-xs">
            <span className="text-gray-400">Status</span>
            <span className={cn('font-semibold capitalize', lifecycle.isPaid ? 'text-green-600' : lifecycle.isActuallyExpired ? 'text-red-600' : 'text-gray-900')}>
              {paymentData.latestStatus || submission.payment_status || 'No payment yet'}
            </span>
            <span className="text-gray-400">Amount</span>
            <span className="font-medium text-gray-900">
              Rp {paymentData.latestAmount ? paymentData.latestAmount.toLocaleString('id-ID') : '0'}
            </span>
            <span className="text-gray-400">Invoices</span>
            <span className="font-medium text-gray-900">{paymentData.invoiceCount}</span>
            {paymentData.hasEverPaid && !lifecycle.isPaid && (
              <>
                <span className="text-gray-400">Riwayat</span>
                <span className="font-medium text-green-600">Pernah dibayar</span>
              </>
            )}
          </div>
        </div>
        {paymentData.latestPaymentUrl && !lifecycle.isPaid && (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs justify-start text-amber-700 border-amber-200 bg-amber-50/60 hover:bg-amber-100"
            onClick={() => copyToClipboard(paymentData.latestPaymentUrl!, 'Payment link copied!')}
          >
            <Copy className="w-3.5 h-3.5 mr-2" /> Copy payment link untuk researcher
          </Button>
        )}
      </DetailSheetSection>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Page — page status + Page Builder entry point + Extend
// ─────────────────────────────────────────────────────────────

function PageTab({
  submission,
  existingPage,
  lifecycle,
  onOpenPageBuilder,
  onExtendCreated,
}: {
  submission: SurveySubmission;
  existingPage?: ExistingPage;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onOpenPageBuilder: (submission: SurveySubmission) => void;
  onExtendCreated: () => void;
}) {
  const isKilat = submission.distribution_type === 'kilat';

  return (
    <>
      <DetailSheetSection title="Status Page">
        {isKilat ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
            <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              <span className="font-semibold">Distribusi Kilat.</span> Tidak menggunakan Page builder — survey
              didistribusikan langsung ke panel.
            </p>
          </div>
        ) : existingPage ? (
          <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
            <div className="grid grid-cols-[auto_1fr] !gap-x-3 !gap-y-1 text-xs">
              <span className="text-gray-400">Status</span>
              <span className="font-semibold text-gray-900 capitalize">{lifecycle.pageStatus}</span>
              <span className="text-gray-400">Title</span>
              <span className="font-medium text-gray-900">{existingPage.title || 'Not set'}</span>
              <span className="text-gray-400">Slug</span>
              <span className="font-mono text-[11px] text-gray-700">/{existingPage.slug}</span>
              <span className="text-gray-400">Publish</span>
              <span className="font-medium text-gray-900">
                {formatDate(existingPage.publish_start_date)} — {formatDate(existingPage.publish_end_date)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2.5">
            Belum ada page. {!lifecycle.canBuildPage && 'Page bisa dibuat setelah pembayaran diterima.'}
          </p>
        )}
      </DetailSheetSection>

      {!isKilat && (
        <DetailSheetSection title="Aksi">
          <PageAction
            submission={submission}
            existingPage={existingPage}
            lifecycle={lifecycle}
            onOpenPageBuilder={onOpenPageBuilder}
          />
          <ExtendAction
            submission={submission}
            existingPage={existingPage}
            lifecycle={lifecycle}
            onExtendCreated={onExtendCreated}
          />
        </DetailSheetSection>
      )}
    </>
  );
}
