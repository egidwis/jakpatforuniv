import { useEffect, useState } from 'react';
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
import { Chip } from '../ui/chip';
import { DetailSheet, DetailSheetSection } from '../data-list/DetailSheet';
import { DetailPane } from '../data-list/DetailPane';
import { calculateTotalAdCost, calculateIncentiveCost, calculateDiscount } from '../../utils/cost-calculator';
import { cn } from '@/lib/utils';
import type { SurveySubmission, PaymentState, ExistingPage } from './types';
import { deriveLifecycle } from './lifecycle';
import { LifecycleChip } from './LifecycleChip';
import { ReserveSlotAction, PaymentAction, PageAction, ExtendAction } from './CampaignActions';

type DetailTab = 'review' | 'reservation' | 'payment' | 'page';

const TABS: { id: DetailTab; label: string; icon: typeof FileText }[] = [
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
  onStatusChange: (submissionId: string, newStatus: string) => void;
  onPaymentStatusChange: (submissionId: string, newStatus: string) => void;
  onEditFormDetails: (submission: SurveySubmission) => void;
  onEditCriteria: (submission: SurveySubmission) => void;
  onOpenPageBuilder: (submission: SurveySubmission) => void;
  onOpenSchedule: (submission: SurveySubmission) => void;
  onOpenPayment: (submission: SurveySubmission) => void;
  onExtendCreated: () => void;
  variant?: 'sheet' | 'pane';
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
}: SubmissionDetailSheetProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('review');

  // Reset to the Review tab whenever a different submission is opened
  const submissionId = submission?.id;
  useEffect(() => {
    setActiveTab('review');
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

  const subtitle = (
    <>
      <span className="font-mono">#{submission.formId}</span>
      {' · '}
      {new Date(submission.submittedAt).toLocaleDateString('id-ID')}{' '}
      {new Date(submission.submittedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
      {' · '}
      {submission.researcherName}
    </>
  );

  const chips = (
    <>
      <LifecycleChip submission={submission} lifecycle={lifecycle} size="sm" />
      {isKilat && (
        <Chip variant="amber" size="sm">
          <Zap className="w-3 h-3" /> KILAT
        </Chip>
      )}
      <Chip variant={submission.submission_method === 'google_import' ? 'orange' : 'indigo'} size="sm">
        {submission.submission_method === 'google_import' ? 'G-Form' : 'Manual'}
      </Chip>
    </>
  );

  const body = (
    <>
      {activeTab === 'review' && (
        <ReviewTab
          submission={submission}
          lifecycle={lifecycle}
          onStatusChange={onStatusChange}
          onEditFormDetails={onEditFormDetails}
          onEditCriteria={onEditCriteria}
        />
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

  if (variant === 'pane') {
    return (
      <DetailPane
        title={submission.formTitle}
        subtitle={subtitle}
        chips={chips}
        nav={tabBar}
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
      title={submission.formTitle}
      subtitle={subtitle}
      chips={chips}
      nav={tabBar}
    >
      {body}
    </DetailSheet>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Review (default) — survey preview, review actions, form
// details, criteria & incentive, researcher profile
// ─────────────────────────────────────────────────────────────

function ReviewTab({
  submission,
  lifecycle,
  onStatusChange,
  onEditFormDetails,
  onEditCriteria,
}: {
  submission: SurveySubmission;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onStatusChange: (submissionId: string, newStatus: string) => void;
  onEditFormDetails: (submission: SurveySubmission) => void;
  onEditCriteria: (submission: SurveySubmission) => void;
}) {
  const { displayStatus } = lifecycle;

  const adCost = calculateTotalAdCost(submission.questionCount || 0, submission.duration || 0);
  const incentiveCost = calculateIncentiveCost(submission.winnerCount || 0, submission.prize_per_winner || 0);
  const discount = calculateDiscount(submission.voucher_code, adCost, incentiveCost, submission.duration || 0);
  const finalAdCost = adCost - discount;

  return (
    <>
      {/* Survey preview */}
      <DetailSheetSection
        title="Kuesioner"
        action={
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => copyToClipboard(submission.formUrl, 'Survey link copied!')}
              disabled={!submission.formUrl}
            >
              <Copy className="w-3 h-3 mr-1" /> Copy Link
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => window.open(submission.formUrl, '_blank', 'noopener,noreferrer')}
              disabled={!submission.formUrl}
            >
              <ExternalLink className="w-3 h-3 mr-1" /> Buka
            </Button>
          </div>
        }
      >
        {submission.formUrl ? (
          <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
            <div className="px-3 py-1.5 border-b border-gray-200 bg-white flex items-center gap-1.5 min-w-0">
              <Globe className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="text-[11px] text-gray-500 truncate">{submission.formUrl.replace(/^https?:\/\//, '')}</span>
            </div>
            <iframe
              src={submission.formUrl}
              title={`Preview: ${submission.formTitle}`}
              className="w-full h-[420px] bg-white"
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
          <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
            <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">
              Detected keywords: <span className="font-medium">{submission.detected_keywords.join(', ')}</span>
            </p>
          </div>
        )}
      </DetailSheetSection>

      {/* Review actions */}
      <DetailSheetSection title="Review Status">
        <div className="flex items-center gap-2 flex-wrap">
          <LifecycleChip submission={submission} lifecycle={lifecycle} />
          {displayStatus === 'rejected' && submission.admin_notes && (
            <p className="w-full text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2.5 py-1.5 leading-relaxed">
              {submission.admin_notes}
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button
            size="sm"
            className="h-9 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold"
            disabled={displayStatus === 'approved'}
            onClick={() => onStatusChange(submission.id, 'approved')}
          >
            <Check className="w-3.5 h-3.5 mr-1.5" /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            disabled={displayStatus === 'rejected'}
            onClick={() => onStatusChange(submission.id, 'rejected')}
          >
            <X className="w-3.5 h-3.5 mr-1.5" /> Reject
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 text-xs font-semibold text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700"
            disabled={displayStatus === 'spam'}
            onClick={() => onStatusChange(submission.id, 'spam')}
          >
            <Ban className="w-3.5 h-3.5 mr-1.5" /> Spam
          </Button>
        </div>
        {displayStatus !== 'in_review' && (
          <button
            className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-blue-600 transition-colors"
            onClick={() => onStatusChange(submission.id, 'in_review')}
          >
            <RotateCcw className="w-3 h-3" /> Reset ke Need Review
          </button>
        )}
      </DetailSheetSection>

      {/* Form details & cost */}
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

      {/* Criteria & incentive */}
      <DetailSheetSection
        title="Criteria & Incentive"
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-gray-500 hover:text-blue-600"
            onClick={() => onEditCriteria(submission)}
          >
            <PenLine className="w-3 h-3 mr-1" /> Edit
          </Button>
        }
      >
        {submission.criteria ? (
          <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{submission.criteria}</p>
        ) : (
          <p className="text-xs text-gray-400 italic bg-gray-50 px-2.5 py-1.5 rounded border border-dashed border-gray-200">
            Target not set
          </p>
        )}
        {submission.prize_per_winner ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Chip variant="green" size="sm">Rp {submission.prize_per_winner.toLocaleString('id-ID')}</Chip>
            <Chip variant="outline" size="sm">{submission.winnerCount || 0} user</Chip>
            <span className="text-gray-500">
              Total:{' '}
              <span className="font-medium text-gray-900">
                Rp {((submission.prize_per_winner || 0) * (submission.winnerCount || 0)).toLocaleString('id-ID')}
              </span>
            </span>
          </div>
        ) : (
          <p className="text-[11px] text-gray-400 italic">No incentive</p>
        )}
      </DetailSheetSection>

      {/* Researcher */}
      <DetailSheetSection title="Researcher">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{submission.researcherName}</p>
            <div className="mt-0.5 space-y-0.5 text-[11px] text-gray-500">
              {submission.education && (
                <span className="inline-flex w-fit items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-purple-50 text-purple-700 border border-purple-100 capitalize">
                  {submission.education.replace(/_/g, ' ')}
                </span>
              )}
              {submission.department && <p>{submission.department}</p>}
              {submission.university && <p>{submission.university}</p>}
              {submission.leads && (
                <p className="text-gray-400">
                  Lead: <span className="capitalize">{submission.leads.replace(/_/g, ' ')}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {submission.phone_number && (
              <a
                href={`https://wa.me/${submission.phone_number.replace(/^0/, '62')}`}
                target="_blank"
                rel="noopener noreferrer"
                title={submission.phone_number}
                className="inline-flex items-center justify-center p-1.5 rounded text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 transition-colors border border-green-100"
              >
                <MessageCircle className="w-3.5 h-3.5" />
              </a>
            )}
            {submission.researcherEmail && (
              <a
                href={`mailto:${submission.researcherEmail}`}
                title={submission.researcherEmail}
                className="inline-flex items-center justify-center p-1.5 rounded text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-100"
              >
                <Mail className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
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
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
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
}: {
  submission: SurveySubmission;
  paymentData: PaymentState;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onOpenPayment: (submission: SurveySubmission) => void;
  onPaymentStatusChange: (submissionId: string, newStatus: string) => void;
}) {
  return (
    <>
      <DetailSheetSection title="Status Pembayaran">
        <div className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
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
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
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
