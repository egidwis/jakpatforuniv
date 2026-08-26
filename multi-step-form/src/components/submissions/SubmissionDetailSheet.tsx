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
  MoreHorizontal,
  RotateCcw,
  ShieldAlert,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { SurveySubmission, PaymentState, ExistingPage } from './types';
import { deriveLifecycle } from './lifecycle';
import { ReviewStatusChip } from './ReviewStatusChip';
import { ReviewTimeline, ReviewTimelineToggle } from './ReviewTimeline';
import { InfoTab } from './tabs/InfoTab';
import { ReviewTab } from './tabs/ReviewTab';
import { SchedulePaymentTab } from './tabs/SchedulePaymentTab';
import { PageTab } from './tabs/PageTab';
import { ScheduleForm } from '@/components/schedule/ScheduleForm';
import { InvoiceForm } from '@/components/schedule/InvoiceForm';
import { updateFormDetails, recomputeOrderPrice, previewOrderPrice, type AdScheduleEntry } from '@/utils/supabase';
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
  // ⚠️ HANYA labelnya yang berubah. `id`-nya TETAP 'schedule-payment' — ia
  // dipakai `initialSubView` dan CTA lintas-tab di InfoTab; menggantinya
  // memutus deep-link dari papan Schedule tanpa satu pun error.
  { id: 'schedule-payment', label: 'Reservasi Jadwal', icon: CalendarCheck },
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
  onEditFormDetails: (submission: SurveySubmission) => void;
  onEditCriteria: (submission: SurveySubmission) => void;
  /** Pekerjaan halaman (buat/terbit/ganti banner) hidup di papan Jadwal, bukan
   *  di tab Page — lihat kepala `PageTab.tsx`. Ini satu-satunya jalan ke sana,
   *  dan menggantikan `onOpenPageBuilder` yang dulu dioper ke tab Page. */
  onOpenScheduleBoard?: (bookingId: string) => void;
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
  onEditFormDetails,
  onEditCriteria,
  onOpenScheduleBoard,
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
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [isSavingApprove, setIsSavingApprove] = useState(false);

  // Reset to the Info tab whenever a different submission is opened
  const submissionId = submission?.id;
  // Order yang menunggu keputusan review mendarat langsung di tab Review —
  // itulah pekerjaan yang tersisa untuknya, dan dulu selalu satu klik lagi.
  // Dihitung dari `submission.status` mentah, bukan `lifecycle`: `lifecycle`
  // baru ada setelah early-return di bawah.
  const rawReviewStatus = submission?.status;
  useEffect(() => {
    const opensOnReview = !rawReviewStatus
      || rawReviewStatus === 'in_review'
      || rawReviewStatus === 'pending'
      || rawReviewStatus === 'rejected';
    setActiveTab(opensOnReview ? 'review' : 'info');
    setReviewNote('');
    // Kalau ini pengajuan ULANG, riwayatnya justru yang paling ingin dibaca
    // admin sebelum memutuskan. Review pertama tetap bersih.
    const priorDecisions = (submission?.review_history || []).filter(
      (h) => h.action === 'approved' || h.action === 'rejected'
    ).length;
    setIsHistoryExpanded(
      (rawReviewStatus === 'in_review' || rawReviewStatus === 'pending') && priorDecisions > 0
    );
    setSubView(null);
    setQuestionCountInput(submission?.questionCount || 0);
    setIsRejectMode(false);
    setIsSpamConfirmOpen(false);
    setIsCancelConfirmOpen(false);
    setIsSavingApprove(false);
  }, [submissionId, submission?.questionCount, rawReviewStatus]);

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
  /**
   * ⛔ Sumbu uang/tayang sudah bergerak → keputusan review TIDAK boleh disentuh
   * lagi dari sini.
   *
   * `getDisplayStatus()` melipat paid|scheduled|live|completed menjadi
   * 'approved', jadi tanpa gerbang ini footer merender tombol keputusan —
   * termasuk "Reset ke Need Review" — untuk order yang uangnya sudah masuk dan
   * iklannya sedang tayang. Kliknya menulis submission_status='in_review', dan
   * karena kolom itu memikul DUA sumbu, trigger sql/46 ikut memundurkan
   * `ad_schedules.status` ke 'requested': order tayang lenyap dari papan
   * Schedule sementara drawer masih menyebutnya lunas.
   *
   * Jalan keluar yang benar untuk order seperti ini adalah membatalkan SLOT
   * (`slot_cancelled`, sql/62) di tab Jadwal & Bayar — sumbu tayang saja,
   * riwayat review-nya utuh.
   */
  const reviewDecisionLocked = [
    'reserved',
    'reserved_expiring',
    'awaiting_payment',
    'paid',
    'page_scheduled',
    'live',
    'completed',
  ].includes(lifecycle.stage);

  const isNeedReview = !reviewDecisionLocked
    && (!displayStatus || displayStatus === 'in_review' || displayStatus === 'pending');
  const isRejected = !reviewDecisionLocked && displayStatus === 'rejected';
  const isReviewActive = isNeedReview || isRejected;
  // Order tanpa link kuesioner tidak bisa di-review — tidak ada yang dibuka.
  const canApprove = Boolean(submission.formUrl);

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

  // Tab Page TIDAK punya titik notifikasi. Pekerjaan halaman dikerjakan admin
  // lain, dari papan Jadwal; menyalakan alarmnya di sini berarti menagih orang
  // yang tidak bisa — dan tidak seharusnya — menyelesaikannya. Lihat
  // `getSubmissionActionDot` di lifecycle.ts untuk angka yang mendasarinya.

  const tabBar = (
    <div className="flex gap-1 -mb-px">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const isReviewTab = tab.id === 'review';
        const isScheduleTab = tab.id === 'schedule-payment';
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
          onEditFormDetails={onEditFormDetails}
          onConvertDistribution={onConvertDistribution}
          onExtendCreated={onExtendCreated}
          onOpenReview={() => setActiveTab('review')}
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
          onOpenScheduleBoard={onOpenScheduleBoard}
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
        isKilatOrder={submission.distribution_type === 'kilat'}
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
    // ⚠️ MENGOREKSI JUMLAH PERTANYAAN MENGUBAH HARGA.
    //
    // `updateFormDetails` menulis `question_count` tanpa menyentuh kolom harga,
    // sementara InvoiceForm dan dashboard peneliti menghitung ULANG dari
    // `question_count`. Jadi tanpa ini peneliti melihat harga baru tanpa
    // penjelasan, dan kolom `total_cost` di daftar admin masih angka lama.
    // Selisihnya disebut di depan supaya admin memutuskan sadar, bukan kaget.
    if (questionCountInput !== submission.questionCount && !lifecycle.isPaid) {
      let newTotal: number | null = null;
      try {
        newTotal = await previewOrderPrice(submission.id, questionCountInput);
      } catch (err) {
        console.error('Gagal menghitung pratinjau harga:', err);
      }
      const oldTotal = submission.total_cost || 0;
      const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
      const priceLine = newTotal === null
        ? '\n\n(Harga baru gagal dihitung; harga akan disesuaikan setelah disimpan.)'
        : newTotal === oldTotal
          ? `\n\nHarga tidak berubah: ${rupiah(oldTotal)}.`
          : `\n\nHarga berubah: ${rupiah(oldTotal)} → ${rupiah(newTotal)}.`;
      const ok = window.confirm(
        `Jumlah pertanyaan dikoreksi dari ${submission.questionCount} menjadi ${questionCountInput} Q.${priceLine}\n\nLanjutkan approve?`
      );
      if (!ok) return;
    }

    setIsSavingApprove(true);
    try {
      if (questionCountInput !== submission.questionCount) {
        // HANYA kolom yang benar-benar berubah. Mengirim keempat kolom membuat
        // Approve menimpa `survey_url` dengan salinan yang dipegang drawer —
        // dan salinan itu bisa basi kalau peneliti mengganti linknya sesudah
        // drawer terbuka. Docstring `updateFormDetails` melarang ini eksplisit.
        await updateFormDetails(submission.id, { question_count: questionCountInput });
        // Harga ikut, di panggilan terpisah. `recomputeOrderPrice` menolak
        // sendiri untuk order lunas — harganya mencatat uang yang sudah masuk.
        const priced = await recomputeOrderPrice(submission.id, { questionCount: questionCountInput });
        // Pada order berjadwal banyak, `priced.totalCost` cuma harga jadwal ke-1
        // — mengutipnya sebagai "total" adalah cara admin dan peneliti mulai
        // memegang dua angka. Yang benar `orderTotal` (SUM ad_schedules), dan
        // kalimatnya menyebut jumlah jadwalnya supaya angkanya tidak ambigu.
        toast.success(
          priced.skipped === 'paid'
            ? `Jumlah pertanyaan diperbarui menjadi ${questionCountInput} Q (harga order lunas tidak diubah)`
            : priced.scheduleCount > 1
              ? `Jumlah pertanyaan diperbarui menjadi ${questionCountInput} Q · jadwal ke-1 Rp ${priced.totalCost.toLocaleString('id-ID')} · total ${priced.scheduleCount} jadwal Rp ${priced.orderTotal.toLocaleString('id-ID')}`
              : `Jumlah pertanyaan diperbarui menjadi ${questionCountInput} Q · total Rp ${priced.totalCost.toLocaleString('id-ID')}`
        );
        onExtendCreated();
      }
      // `undefined`, bukan `''` — `updateFormStatus` menulis admin_notes kapan
      // pun nilainya bukan undefined, jadi string kosong dari State 3/4 (yang
      // tidak punya input catatan sama sekali) MENGHAPUS catatan perbaikan.
      onStatusChange(submission.id, 'approved', reviewNote.trim() || undefined);
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

  // ── Footer tab Review ──────────────────────────────────────────────
  //
  // Ruangnya sempit dan aksinya bertambah, jadi footer ini dipadatkan dengan
  // satu aturan: yang terlihat hanya keputusan yang SERING diambil (Approve,
  // Minta Perbaikan). Keputusan langka dan tak terpulihkan — Batalkan Pesanan,
  // Tandai Tidak Valid — pindah ke menu ⋯. Kapasitasnya naik, lebarnya tidak.
  const stepperQty = (
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
  );

  /**
   * @param canAmendNote sediakan "Ubah Catatan Perbaikan". Hanya bermakna di
   *   State 2: di State 1 tombol "Minta Perbaikan" sudah jadi pintunya, dan dua
   *   pintu ke layar yang sama cuma menambah pilihan tanpa menambah kemampuan.
   *   Tanpa ini admin yang menemukan masalah BARU pada pengajuan ulang tidak
   *   punya cara menuliskannya — WA-nya mengirim ulang catatan yang lama.
   */
  const endStateMenu = (canAmendNote = false) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          title="Keputusan lain"
          className="h-8 w-8 p-0 shrink-0 text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-800"
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {canAmendNote && (
          <DropdownMenuItem onClick={() => setIsRejectMode(true)}>
            <FileText className="w-3.5 h-3.5 mr-2 text-slate-500" />
            <span className="text-xs font-medium">Ubah Catatan Perbaikan</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => setIsCancelConfirmOpen(true)}>
          <Ban className="w-3.5 h-3.5 mr-2 text-slate-500" />
          <span className="flex flex-col">
            <span className="text-xs font-medium">Batalkan Pesanan</span>
            <span className="text-[10px] text-slate-400">Order sah yang dihentikan</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setIsSpamConfirmOpen(true)}>
          <ShieldAlert className="w-3.5 h-3.5 mr-2 text-orange-500" />
          <span className="flex flex-col">
            <span className="text-xs font-medium text-orange-700">Tandai Tidak Valid</span>
            <span className="text-[10px] text-slate-400">Bukan order sungguhan</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const approveButton = (
    <Button
      type="button"
      size="sm"
      disabled={isSavingApprove || !canApprove}
      title={canApprove ? undefined : 'Order ini tidak punya link kuesioner untuk di-review'}
      className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold disabled:opacity-50"
      onClick={handleApprove}
    >
      {isSavingApprove ? (
        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
      ) : (
        <Check className="w-3.5 h-3.5 mr-1" />
      )}
      Approve
    </Button>
  );

  const footer = activeTab !== 'review' ? undefined : (
    <div className="space-y-2.5">
      {/* Baris 1: status + pemicu riwayat. Keduanya PENDEK dan tidak pernah
          membungkus, jadi baris ini tetap setinggi satu baris berapa pun
          panjang riwayatnya — daftarnya turun ke bawah, bukan mendesak chip. */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap shrink-0">Status:</span>
          <ReviewStatusChip status={reviewDecisionLocked ? 'approved' : displayStatus} size="xs" />
        </div>

        <ReviewTimelineToggle
          history={submission.review_history || []}
          isExpanded={isHistoryExpanded}
          onToggle={() => setIsHistoryExpanded(!isHistoryExpanded)}
        />
      </div>

      {isHistoryExpanded && (
        <ReviewTimeline history={submission.review_history || []} />
      )}

      {/* Catatan perbaikan terakhir — satu-satunya tempat admin bisa membacanya
          sebelum memutuskan ulang. Dulu hanya hidup di tooltip chip daftar. */}
      {/* Disembunyikan saat riwayat dibentangkan: catatan yang sama sudah
          terbaca di entri teratas log, dan menampilkannya dua kali cuma
          memanjangkan footer tanpa menambah informasi. */}
      {submission.admin_notes && isReviewActive && !isRejectMode && !isHistoryExpanded && (
        <p
          className="text-[11px] leading-relaxed text-slate-500 bg-slate-50 border border-slate-100 rounded px-2 py-1.5 line-clamp-2"
          title={submission.admin_notes}
        >
          <span className="font-semibold text-slate-400">Catatan terakhir: </span>
          {submission.admin_notes}
        </p>
      )}

      {/* ── TERKUNCI: order sudah menyentuh jadwal/pembayaran ───────────── */}
      {reviewDecisionLocked && (
        <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500 min-w-0 flex-1">
            <Lock className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />
            <span>
              Keputusan review terkunci — order ini sudah menyentuh jadwal atau
              pembayaran. Untuk menghentikannya, batalkan slot di tab Jadwal &amp; Bayar.
            </span>
          </p>
          {!lifecycle.isPaid && (
            <Button
              type="button"
              size="sm"
              className="h-8 px-3 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shrink-0"
              onClick={() => setActiveTab('schedule-payment')}
            >
              Jadwal &amp; Bayar <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          )}
        </div>
      )}

      {/* ── State 1: Need Review ────────────────────────────────────────── */}
      {isNeedReview && !isRejectMode && (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {stepperQty}
          <div className="flex items-center gap-1.5 shrink-0">
            {endStateMenu()}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2.5 text-xs font-semibold text-amber-700 border-amber-200 hover:bg-amber-50 hover:text-amber-800"
              onClick={() => setIsRejectMode(true)}
            >
              Minta Perbaikan
            </Button>
            {approveButton}
          </div>
        </div>
      )}

      {/* ── State 1B: menulis catatan perbaikan (progressive disclosure) ── */}
      {isReviewActive && isRejectMode && (
        <div className="space-y-2.5 pt-0.5">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Pilih Alasan Cepat:
          </span>
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
          <div className="flex items-center gap-2 pt-0.5">
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
            {/* Email otomatis terkirim pada KEDUA tombol — WA cuma tambahan. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2.5 text-xs font-semibold text-amber-700 border-amber-200 hover:bg-amber-50 hover:text-amber-800"
              onClick={() => handleReject(false)}
            >
              Simpan Catatan
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              onClick={() => handleReject(true)}
            >
              <MessageCircle className="w-3.5 h-3.5 mr-1" /> + WA
            </Button>
          </div>
        </div>
      )}

      {/* ── State 2: Menunggu Perbaikan — admin tetap bisa approve langsung ── */}
      {isRejected && !isRejectMode && (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {stepperQty}
          <div className="flex items-center gap-1.5 shrink-0">
            {endStateMenu(true)}
            <Button
              type="button"
              size="sm"
              variant="outline"
              title="Kirim ulang catatan perbaikan via WhatsApp"
              className="h-8 w-8 p-0 shrink-0 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
              onClick={() => sendWhatsAppNotification(
                submission.phone_number,
                submission.researcherName,
                submission.formTitle,
                submission.admin_notes || reviewNote || REASONS.ACCESS_LOCKED
              )}
            >
              <MessageCircle className="w-3.5 h-3.5" />
            </Button>
            {approveButton}
          </div>
        </div>
      )}

      {/* ── State 3: Approved, belum menyentuh uang/tayang ──────────────── */}
      {!reviewDecisionLocked && displayStatus === 'approved' && (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2.5 text-xs font-semibold text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
            onClick={() => onStatusChange(submission.id, 'in_review')}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 px-3 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700"
            onClick={() => setActiveTab('schedule-payment')}
          >
            Lanjut ke Jadwal &amp; Bayar <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      )}

      {/* ── State 4: keadaan akhir (Tidak Valid / Dibatalkan) ───────────── */}
      {!reviewDecisionLocked && displayStatus !== 'approved' && !isReviewActive && (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <p className="text-[11px] leading-relaxed text-slate-500 min-w-0">
            {displayStatus === 'spam'
              ? 'Tidak tampil di dashboard peneliti.'
              : 'Pesanan dihentikan. Peneliti melihatnya di tab "Selesai".'}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2.5 text-xs font-semibold text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900 shrink-0"
            onClick={() => onStatusChange(submission.id, 'in_review')}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset ke Need Review
          </Button>
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

  // Dua keputusan yang BERBEDA, dua dialog. Dulu satu tombol berlabel
  // "Batalkan Submission" membuka dialog "Tandai sebagai Spam?" dan menulis
  // 'spam' — dan admin memakainya untuk lima maksud yang tidak satu pun spam.
  const cancelDialog = (
    <Dialog open={isCancelConfirmOpen} onOpenChange={setIsCancelConfirmOpen}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Batalkan pesanan ini?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1.5 text-sm text-slate-500">
              <p>Untuk order yang <strong>sah</strong> tapi tidak dilanjutkan — peneliti mundur, salah jalur, atau duplikat.</p>
              <p>Slot yang sudah dipesan dilepas, dan tagihan yang sempat terbit berhenti berlaku.</p>
              <p>Peneliti <strong>tetap melihatnya</strong> di tab &quot;Selesai&quot; bertanda Dibatalkan, beserta catatan Anda.</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder="Alasan pembatalan (ditampilkan ke peneliti)…"
          value={reviewNote}
          onChange={(e) => setReviewNote(e.target.value)}
          className="text-xs min-h-[55px] bg-slate-50/50 focus:bg-white"
        />
        <DialogFooter className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={() => setIsCancelConfirmOpen(false)}>
            Batal
          </Button>
          <Button
            size="sm"
            className="bg-slate-700 hover:bg-slate-800 text-white font-semibold"
            onClick={() => {
              onStatusChange(submission.id, 'cancelled', reviewNote.trim() || undefined);
              setReviewNote('');
              setIsCancelConfirmOpen(false);
            }}
          >
            Ya, Batalkan Pesanan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const spamDialog = (
    <Dialog open={isSpamConfirmOpen} onOpenChange={setIsSpamConfirmOpen}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Tandai sebagai Tidak Valid?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1.5 text-sm text-slate-500">
              <p>Untuk yang <strong>bukan order sungguhan</strong> — bukan peneliti, uji coba, atau isian sampah.</p>
              <p><strong>Tidak akan tampil sama sekali</strong> di dashboard peneliti, dan ia tidak bisa mengajukannya ulang.</p>
              <p>Kalau ini sebenarnya order sah yang dihentikan, pakai <strong>Batalkan Pesanan</strong>.</p>
            </div>
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
              onStatusChange(submission.id, 'spam', reviewNote.trim() || undefined);
              setReviewNote('');
              setIsSpamConfirmOpen(false);
            }}
          >
            Ya, Tandai Tidak Valid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const reviewDialogs = (
    <>
      {cancelDialog}
      {spamDialog}
    </>
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
        {reviewDialogs}
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
      {reviewDialogs}
    </>
  );
}

