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
  Link2,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { ClientStatusIcon } from '../customers/ClientStatusIcon';
import type { CustomerTier } from '../customers/types';
import { DetailSheet } from '../data-list/DetailSheet';
import { DetailPane } from '../data-list/DetailPane';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
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
import { updateFormDetails, type AdScheduleEntry } from '@/utils/supabase';
import { isPlaceholderBannerUrl } from '@/utils/page-banner';
import { toast } from 'sonner';

const REASONS = {
  ACCESS_LOCKED:
    'Akses Google Form Anda dibatasi (restricted). Mohon buka setelan form menjadi publik / siapa saja yang memiliki link (Anyone with the link) agar responden dapat mengisi.',
  BROKEN_LINK:
    'Link kuesioner tidak dapat diakses atau tidak valid. Silakan periksa kembali tautan yang Anda kirimkan.',
};

function getSensitiveReason(keywords?: string[]) {
  const kwText = keywords && keywords.length > 0 ? ` (${keywords.join(', ')})` : '';
  return `Kuesioner Anda mengandung pertanyaan terkait data pribadi/sensitif${kwText}. Mohon hapus atau sesuaikan pertanyaan tersebut sesuai panduan kuesioner Jakpat.`;
}

function sendWhatsAppNotification(phone: string | undefined, researcherName: string, formTitle: string, note: string) {
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '').replace(/^0/, '62');
  const message = `Halo Kak ${researcherName || 'Peneliti'},\n\nTerima kasih telah mengajukan kuesioner "${formTitle || 'Kuesioner'}" di Jakpat for Universities.\n\nSaat proses review, kami menemukan catatan berikut:\n📌 "${note}"\n\nMohon perbaiki kuesioner Anda, lalu buka dashboard Jakpat dan klik tombol "Saya Sudah Perbaiki Kuesioner" agar dapat kami proses kembali.\n\nTerima kasih! 🙏\nTim Reviewer Jakpat for Universities`;

  if (cleanPhone) {
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
  } else {
    navigator.clipboard.writeText(message);
    toast.info('Nomor WhatsApp tidak tersedia. Pesan notifikasi disalin ke clipboard.');
  }
}

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
  clientTier?: CustomerTier;
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

  // Local state for Review tab inline editing & progressive disclosure
  const [questionCountInput, setQuestionCountInput] = useState<number>(submission?.questionCount || 0);
  const [isRejectMode, setIsRejectMode] = useState(false);
  const [isSpamConfirmOpen, setIsSpamConfirmOpen] = useState(false);
  const [isSavingApprove, setIsSavingApprove] = useState(false);

  // Reset to the Info tab whenever a different submission is opened
  const submissionId = submission?.id;
  useEffect(() => {
    setActiveTab('info');
    setReviewNote('');
    setIsHistoryExpanded(false);
    setSubView(null);
    setQuestionCountInput(submission?.questionCount || 0);
    setIsRejectMode(false);
    setIsSpamConfirmOpen(false);
    setIsSavingApprove(false);
  }, [submissionId, submission?.questionCount]);

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
  const { displayStatus } = lifecycle;
  const isNeedReview = !displayStatus || displayStatus === 'in_review' || displayStatus === 'pending';
  const isRejected = displayStatus === 'rejected';
  const isReviewActive = isNeedReview || isRejected;

  // Dot status untuk tab Jadwal & Bayar:
  // - Tidak aktif jika: masih dalam review/rejected/spam, sudah lunas (isPaid), atau sudah live/completed/page_scheduled
  // - Dot abu-abu jika: slot kedaluwarsa (customer tidak lanjut bayar / timeout)
  // - Dot merah jika: sudah di-approve dan masih dalam proses penjadwalan/pembayaran belum lunas
  const isScheduleActive =
    !isReviewActive &&
    displayStatus !== 'spam' &&
    !lifecycle.isPaid &&
    lifecycle.stage !== 'live' &&
    lifecycle.stage !== 'completed' &&
    lifecycle.stage !== 'page_scheduled';

  const scheduleDotType: 'red' | 'gray' | null = isScheduleActive
    ? (lifecycle.isActuallyExpired ? 'gray' : 'red')
    : null;

  const isKilat = submission?.distribution_type === 'kilat';
  const needsBannerUpdate = !isKilat && existingPage && (
    isPlaceholderBannerUrl(existingPage.banner_url) ||
    Boolean(existingPage.requires_banner_update)
  );
  const isPageUnpublishedWhenDue = !isKilat && existingPage && lifecycle.canBuildPage && !existingPage.is_published;
  const pageDotType: 'red' | null = (needsBannerUpdate || isPageUnpublishedWhenDue) ? 'red' : null;

  const tabBar = (
    <div className="flex gap-1 -mb-px">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const isReviewTab = tab.id === 'review';
        const isScheduleTab = tab.id === 'schedule-payment';
        const isPageTab = tab.id === 'page';
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
            {isReviewTab && isReviewActive && (
              <span className="relative flex h-2 w-2 ml-0.5" title="Review aktif / perlu tindakan">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            )}
            {isScheduleTab && scheduleDotType === 'red' && (
              <span className="relative flex h-2 w-2 ml-0.5" title="Jadwal / Pembayaran belum selesai">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            )}
            {isScheduleTab && scheduleDotType === 'gray' && (
              <span className="relative flex h-2 w-2 ml-0.5" title="Slot kedaluwarsa (unpaid)">
                <span className="inline-flex rounded-full h-2 w-2 bg-slate-400"></span>
              </span>
            )}
            {isPageTab && pageDotType === 'red' && (
              <span className="relative flex h-2 w-2 ml-0.5" title="Halaman perlu tindakan (banner/publish)">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const clientTierBadge = clientTier ? (
    <ClientStatusIcon tier={clientTier} size="sm" />
  ) : null;

  const subtitle = (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 min-w-0 w-full">
        <span className="truncate font-medium">{submission.researcherName}</span>
        <span className="shrink-0">{clientTierBadge}</span>
        {submission.university && (
          <span className="text-gray-400 text-[11px] truncate min-w-0">· {submission.university}</span>
        )}
      </span>
      <span className="inline-flex items-center gap-2 flex-wrap text-xs sm:text-[13px] mt-0.5">
        {submission.phone_number && (
          <a
            href={`https://wa.me/${submission.phone_number.replace(/[^0-9]/g, '').replace(/^0/, '62')}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 shrink-0" /> {submission.phone_number}
          </a>
        )}
        {submission.phone_number && submission.researcherEmail && (
          <span className="text-gray-300">·</span>
        )}
        {submission.researcherEmail && (
          <a
            href={`mailto:${submission.researcherEmail}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
          >
            <Mail className="w-3.5 h-3.5 shrink-0" /> {submission.researcherEmail}
          </a>
        )}
      </span>
    </span>
  );

  const chips = undefined;

  const body = (
    <>
      {activeTab === 'info' && (
        <InfoTab
          submission={submission}
          paymentData={paymentData}
          existingPage={existingPage}
          lifecycle={lifecycle}
          onDataUpdated={onExtendCreated}
          onConvertDistribution={onConvertDistribution}
          onNavigateTab={setActiveTab}
        />
      )}
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
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9 font-medium text-slate-700 bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-none"
              onClick={cancel}
              disabled={isSaving}
            >
              Batal
            </Button>
            <Button
              size="sm"
              className="flex-[2] h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm"
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

  const handleApprove = async () => {
    setIsSavingApprove(true);
    try {
      if (questionCountInput !== submission.questionCount) {
        await updateFormDetails(submission.id, {
          title: submission.formTitle || '',
          survey_url: submission.formUrl || '',
          question_count: questionCountInput,
          duration: submission.duration || 0,
        });
        toast.success(`Jumlah pertanyaan diperbarui menjadi ${questionCountInput} Q`);
        onExtendCreated();
      }
      onStatusChange(submission.id, 'approved', reviewNote);
      setReviewNote('');
      setIsRejectMode(false);
    } catch (err) {
      console.error('Error approving submission:', err);
      toast.error('Gagal menyimpan perubahan jumlah pertanyaan');
    } finally {
      setIsSavingApprove(false);
    }
  };

  const handleReject = (withWhatsApp = false) => {
    const finalNote = reviewNote.trim() || REASONS.ACCESS_LOCKED;
    onStatusChange(submission.id, 'rejected', finalNote);
    if (withWhatsApp) {
      sendWhatsAppNotification(
        submission.phone_number,
        submission.researcherName,
        submission.formTitle,
        finalNote
      );
    }
    setReviewNote('');
    setIsRejectMode(false);
  };

  const footer = activeTab !== 'review' ? undefined : (
    <div className="space-y-3">
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

      {/* State 1: Need Review (Baru Masuk / Diajukan Ulang) */}
      {isNeedReview && !isRejectMode && (
        <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
          {/* Inline Question Count Stepper */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 shrink-0">
            <span className="text-[11px] font-semibold text-slate-500">Qty:</span>
            <input
              type="number"
              min="1"
              value={questionCountInput}
              onChange={(e) => setQuestionCountInput(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-11 h-6 text-xs font-semibold text-center bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              title="Koreksi jumlah pertanyaan jika berbeda dengan klaim user"
            />
            <span className="text-[11px] text-slate-500 font-medium">Q</span>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              title="Tandai sebagai Spam"
              className="h-8 w-8 p-0 text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700 shrink-0"
              onClick={() => setIsSpamConfirmOpen(true)}
            >
              <Ban className="w-3.5 h-3.5" />
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2.5 text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={() => setIsRejectMode(true)}
            >
              <X className="w-3.5 h-3.5 mr-1" /> Reject
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={isSavingApprove}
              className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold"
              onClick={handleApprove}
            >
              {isSavingApprove ? (
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5 mr-1" />
              )}
              Approve
            </Button>
          </div>
        </div>
      )}

      {/* State 1B: Reject Mode (Progressive Disclosure) */}
      {isNeedReview && isRejectMode && (
        <div className="space-y-2.5 pt-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Pilih Alasan Cepat:
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setReviewNote(REASONS.ACCESS_LOCKED)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
            >
              <Lock className="w-3 h-3 text-slate-500" /> Akses Terkunci
            </button>
            <button
              type="button"
              onClick={() => setReviewNote(getSensitiveReason(submission.detected_keywords))}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-colors"
            >
              <ShieldAlert className="w-3 h-3 text-red-500" /> Pertanyaan Sensitif
            </button>
            <button
              type="button"
              onClick={() => setReviewNote(REASONS.BROKEN_LINK)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
            >
              <Link2 className="w-3 h-3 text-slate-500" /> Link Rusak
            </button>
          </div>
          <Textarea
            id="review-note-input"
            placeholder="Tuliskan catatan/instruksi perbaikan kuesioner untuk peneliti..."
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            className="text-xs min-h-[55px] max-h-[100px] bg-slate-50/50 focus:bg-white"
          />
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs text-slate-500 hover:text-slate-700"
              onClick={() => setIsRejectMode(false)}
            >
              Batal
            </Button>
            <div className="flex-1" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2.5 text-xs font-semibold text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={() => handleReject(false)}
            >
              <X className="w-3.5 h-3.5 mr-1" /> Reject Saja
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              onClick={() => handleReject(true)}
            >
              <MessageCircle className="w-3.5 h-3.5 mr-1" /> Reject &amp; Kirim WA
            </Button>
          </div>
        </div>
      )}

      {/* State 2: Menunggu Revisi (Rejected) — Admin memiliki kuasa penuh untuk approve langsung */}
      {isRejected && (
        <div className="space-y-2 pt-0.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* Inline Question Count Stepper */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 shrink-0">
              <span className="text-[11px] font-semibold text-slate-500">Qty:</span>
              <input
                type="number"
                min="1"
                value={questionCountInput}
                onChange={(e) => setQuestionCountInput(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-11 h-6 text-xs font-semibold text-center bg-white border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                title="Koreksi jumlah pertanyaan"
              />
              <span className="text-[11px] text-slate-500 font-medium">Q</span>
            </div>

            {/* Actions for Menunggu Revisi */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                type="button"
                size="sm"
                variant="outline"
                title="Batalkan Submission"
                className="h-8 w-8 p-0 text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700 shrink-0"
                onClick={() => setIsSpamConfirmOpen(true)}
              >
                <Ban className="w-3.5 h-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2.5 text-xs font-semibold text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                onClick={() => sendWhatsAppNotification(
                  submission.phone_number,
                  submission.researcherName,
                  submission.formTitle,
                  submission.admin_notes || reviewNote || REASONS.ACCESS_LOCKED
                )}
              >
                <MessageCircle className="w-3.5 h-3.5 mr-1" /> Kirim WA
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isSavingApprove}
                className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold"
                onClick={handleApprove}
              >
                {isSavingApprove ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5 mr-1" />
                )}
                Approve
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* State 3: Approved / Selesai */}
      {displayStatus === 'approved' && (
        <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2.5 text-xs font-semibold text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            onClick={() => onStatusChange(submission.id, 'in_review', reviewNote)}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset ke Need Review
          </Button>

          {!lifecycle.isPaid && (
            <Button
              type="button"
              size="sm"
              className="h-8 px-3 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 ml-auto"
              onClick={() => setActiveTab('schedule-payment')}
            >
              Lanjut ke Jadwal &amp; Bayar <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          )}
        </div>
      )}

      {/* State 4: Other (e.g. Spam / Canceled) */}
      {displayStatus !== 'approved' && !isNeedReview && !isRejected && (
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

  // Sub-tampilan menguasai bar tab, badan, dan footer sekaligus. Footer-nya
  // dirender sebagai wadah kosong yang di-portal-i formulir — itulah kenapa ia
  // tetap dirender meski wadahnya belum berisi apa pun.
  const shellNav = subView ? subViewNav : tabBar;
  const shellBody = subView ? subViewBody : body;
  const shellFooter = subView
    ? <div ref={setFooterEl} />
    : footer;

  const spamDialog = (
    <Dialog open={isSpamConfirmOpen} onOpenChange={setIsSpamConfirmOpen}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Tandai sebagai Spam?</DialogTitle>
          <DialogDescription>
            Submission ini akan ditandai sebagai spam dan diarsipkan dari antrean review aktif.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={() => setIsSpamConfirmOpen(false)}>
            Batal
          </Button>
          <Button
            size="sm"
            className="bg-orange-600 hover:bg-orange-700 text-white font-semibold"
            onClick={() => {
              onStatusChange(submission.id, 'spam', reviewNote || 'Ditandai sebagai spam');
              setIsSpamConfirmOpen(false);
            }}
          >
            Ya, Tandai Spam
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (variant === 'pane') {
    return (
      <>
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
        {spamDialog}
      </>
    );
  }

  return (
    <>
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
      {spamDialog}
    </>
  );
}

