import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CalendarCheck,
  CalendarClock,
  Check,
  CreditCard,
  FileText,
  Globe,
  Info,
  Loader2,
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
import { SchedulePaymentTab } from './tabs/SchedulePaymentTab';
import { PageTab } from './tabs/PageTab';
import { ScheduleForm } from '@/components/schedule/ScheduleForm';
import { InvoiceForm } from '@/components/schedule/InvoiceForm';
import type { AdScheduleEntry } from '@/utils/supabase';

// Reservasi + Payment digabung jadi satu tab di Phase 3, dan sejak aksinya jadi
// sub-tampilan drawer keduanya benar-benar satu tempat kerja: rute review manual
// adalah SATU percakapan dengan peneliti, dari feedback sampai tagihan.
type DetailTab = 'info' | 'review' | 'schedule-payment' | 'page';

const TABS: { id: DetailTab; label: string; icon: typeof FileText }[] = [
  { id: 'info', label: 'Info', icon: Info },
  { id: 'review', label: 'Review', icon: FileText },
  { id: 'schedule-payment', label: 'Jadwal & Bayar', icon: CalendarCheck },
  { id: 'page', label: 'Page', icon: Globe },
];

/**
 * Sub-tampilan menguasai seluruh drawer: bar tab diganti bar kembali, badan
 * diganti formulir, footer diganti aksi utamanya. Judul survei di kepala drawer
 * tetap terlihat, jadi konteksnya tidak pernah hilang — itu bedanya dengan
 * halaman penuh yang dulu menelan seluruh layar.
 */
type SubView =
  | { kind: 'edit'; entry: AdScheduleEntry }
  | { kind: 'invoice'; entry: AdScheduleEntry }
  | { kind: 'create'; isExtraAd: boolean }
  | null;

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
  /**
   * Sub-tampilan yang harus terbuka begitu drawer muncul — dipakai pemanggil
   * luar (baris tabel, kartu mobile) yang dulu melempar ke halaman penuh.
   * Ia hanya niat; jadwal mana yang disunting baru bisa dipilih setelah daftar
   * jadwal termuat, jadi resolusinya terjadi di dalam.
   */
  initialSubView?: 'schedule' | 'payment' | null;
  onInitialSubViewConsumed?: () => void;
  /** Pindahkan order antara jalur iklan regular dan JFU Kilat. */
  onConvertDistribution: (submission: SurveySubmission, target: 'regular' | 'kilat') => Promise<void>;
  onExtendCreated: () => void;
  variant?: 'sheet' | 'pane';
  clientTier?: 'vvip' | 'vip' | 'returning' | 'new';
}

/**
 * Right-side drawer with all submission detail & actions, organised in 4 tabs.
 *
 * Menjadwalkan dan menagih terjadi DI DALAM drawer ini sebagai sub-tampilan —
 * keduanya dulu melempar admin ke halaman penuh. Yang masih mengambil alih layar
 * tinggal PageBuilderModal (editor dokumen, bukan formulir) dan modal edit.
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
  initialSubView = null,
  onInitialSubViewConsumed,
  onConvertDistribution,
  onExtendCreated,
  variant = 'sheet',
  clientTier,
}: SubmissionDetailSheetProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [reviewNote, setReviewNote] = useState('');
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [subView, setSubView] = useState<SubView>(null);
  const [scheduleReloadKey, setScheduleReloadKey] = useState(0);
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);

  // Reset to the Info tab whenever a different submission is opened
  const submissionId = submission?.id;
  useEffect(() => {
    setActiveTab('info');
    setReviewNote('');
    setIsHistoryExpanded(false);
    setSubView(null);
  }, [submissionId]);

  // Niat dari luar (baris tabel, kartu mobile) mendarat di tab yang benar; jadwal
  // mana yang disunting diresolusi SchedulePaymentTab setelah daftarnya termuat.
  useEffect(() => {
    if (initialSubView) setActiveTab('schedule-payment');
  }, [initialSubView]);

  const closeSubView = () => setSubView(null);
  const finishSubView = () => {
    setSubView(null);
    setScheduleReloadKey((k) => k + 1);
    onExtendCreated();
  };

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
      {activeTab === 'schedule-payment' && (
        <SchedulePaymentTab
          submission={submission}
          paymentData={paymentData}
          existingPage={existingPage}
          isScheduled={isScheduled}
          lifecycle={lifecycle}
          onEditSchedule={(entry) => setSubView({ kind: 'edit', entry })}
          onCreateInvoice={(entry) => setSubView({ kind: 'invoice', entry })}
          onCreateSchedule={(isExtraAd) => setSubView({ kind: 'create', isExtraAd })}
          onPaymentStatusChange={onPaymentStatusChange}
          onEditFormDetails={onEditFormDetails}
          onConvertDistribution={onConvertDistribution}
          onExtendCreated={onExtendCreated}
          reloadKey={scheduleReloadKey}
          initialSubView={initialSubView}
          onInitialSubViewConsumed={onInitialSubViewConsumed}
        />
      )}
      {activeTab === 'page' && (
        <PageTab
          submission={submission}
          existingPage={existingPage}
          lifecycle={lifecycle}
          onOpenPageBuilder={onOpenPageBuilder}
        />
      )}
    </>
  );

  // ── Sub-tampilan ────────────────────────────────────────────────
  // Tombol utamanya dipaku di footer drawer, bukan hanyut di ujung badan yang
  // panjang — penting di ponsel. Formulir mem-portal aksinya ke elemen footer
  // ini; `useState` untuk node-nya (bukan `useRef`) supaya render pertama yang
  // melahirkan elemen langsung disusul render yang mengisinya.
  let subViewNav: React.ReactNode = null;
  let subViewBody: React.ReactNode = null;

  if (subView) {
    const heading =
      subView.kind === 'create' ? 'Jadwal iklan baru'
        : subView.kind === 'edit'
          ? `Atur jadwal${subView.entry.ordinal > 1 ? ` #${subView.entry.ordinal}` : ''}`
          : `Buat tagihan · jadwal #${subView.entry.ordinal}`;

    subViewNav = (
      <div className="flex items-center gap-2 py-2">
        <button
          type="button"
          onClick={closeSubView}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Kembali
        </button>
        <span className="min-w-0 truncate text-xs font-semibold text-gray-900">
          {heading}
        </span>
      </div>
    );

    subViewBody = subView.kind === 'invoice' ? (
      <InvoiceForm
        entry={subView.entry}
        submission={submission}
        onCancel={closeSubView}
        onDone={finishSubView}
        actionsSlot={footerEl}
        renderActions={({ canSave, isSaving, save, cancel }) => (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-9" onClick={cancel} disabled={isSaving}>
              Batal
            </Button>
            <Button
              size="sm"
              className="flex-[2] h-9 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={save}
              disabled={isSaving || !canSave}
            >
              {isSaving
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Membuat…</>
                : <><CreditCard className="w-3.5 h-3.5 mr-1.5" />Buat link pembayaran</>}
            </Button>
          </div>
        )}
      />
    ) : (
      <ScheduleForm
        mode={subView.kind === 'create' ? 'create' : 'edit'}
        submissionId={submission.id}
        entry={subView.kind === 'edit' ? subView.entry : undefined}
        isExtraAd={subView.kind === 'create' ? subView.isExtraAd : undefined}
        currentPrizePerWinner={submission.prize_per_winner || 0}
        currentWinnerCount={submission.winnerCount || 0}
        columns={4}
        onCancel={closeSubView}
        onDone={finishSubView}
        actionsSlot={footerEl}
        renderActions={({ canSave, isSaving, save, cancel, label }) => (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="flex-1 h-9" onClick={cancel} disabled={isSaving}>
              Batal
            </Button>
            <Button
              size="sm"
              className="flex-[2] h-9 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={save}
              disabled={isSaving || !canSave}
            >
              {isSaving
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan…</>
                : <><CalendarClock className="w-3.5 h-3.5 mr-1.5" />{label}</>}
            </Button>
          </div>
        )}
      />
    );
  }

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
        <div className="space-y-2 pt-1">
          {/* Penghubung sesudah approve. Rute review manual adalah SATU
              percakapan dengan peneliti — dari feedback review sampai tagihan —
              jadi lanjutannya berpindah TAB, bukan berpindah halaman. */}
          {displayStatus === 'approved' && !lifecycle.isPaid && (
            <button
              type="button"
              className="w-full inline-flex items-center justify-center gap-1.5 h-9 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              onClick={() => setActiveTab('schedule-payment')}
            >
              Lanjut ke Jadwal &amp; Bayar <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="flex justify-center">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors px-3 py-1.5 rounded-md hover:bg-blue-50 border border-transparent hover:border-blue-100"
              onClick={() => onStatusChange(submission.id, 'in_review', reviewNote)}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset ke Need Review
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const title = (
    <span className="truncate">{submission.formTitle}</span>
  );

  // Sub-tampilan menguasai bar tab, badan, dan footer sekaligus. Footer-nya
  // dirender sebagai wadah kosong yang di-portal-i formulir — itulah kenapa ia
  // tetap dirender meski wadahnya belum berisi apa pun.
  const shellNav = subView ? subViewNav : tabBar;
  const shellBody = subView ? subViewBody : body;
  const shellFooter = subView
    ? <div ref={setFooterEl} />
    : footer;

  if (variant === 'pane') {
    return (
      <DetailPane
        title={title}
        subtitle={subtitle}
        chips={chips}
        nav={shellNav}
        footer={shellFooter}
        onClose={() => onOpenChange(false)}
      >
        {shellBody}
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
      nav={shellNav}
      footer={shellFooter}
    >
      {shellBody}
    </DetailSheet>
  );
}

