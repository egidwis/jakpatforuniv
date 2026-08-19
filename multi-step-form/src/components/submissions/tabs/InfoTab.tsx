import { useState, useCallback } from 'react';
import { PenLine, Copy, Check, FileText, Zap, Calendar, CalendarClock, CreditCard, Globe, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../ui/tooltip';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import { updateFormDetails, updateSubmissionCriteria } from '../../../utils/supabase';
import { cn } from '@/lib/utils';
import type { SurveySubmission, PaymentState, ExistingPage } from '../types';
import { deriveLifecycle } from '../lifecycle';
import type { LifecycleStage } from '../../../lib/status-tokens';
import { LifecycleChip } from '../LifecycleChip';
import { DistributionConvertDialog } from './DistributionConvertDialog';

// ─────────────────────────────────────────────────────────────
// Tab: Info — submission summary & researcher profile
// ─────────────────────────────────────────────────────────────

export type DetailTab = 'info' | 'review' | 'schedule-payment' | 'page';

interface StatusBannerConfig {
  title: string;
  description: string;
  action?: {
    label: string;
    icon: typeof FileText;
    targetTab: DetailTab;
  };
  containerClass: string;
}

function getStatusBannerConfig(
  stage: LifecycleStage,
  isKilat: boolean
): StatusBannerConfig {
  switch (stage) {
    case 'in_review':
      return {
        title: 'Menunggu Review Kuesioner',
        description: 'Kuesioner baru diajukan oleh peneliti dan perlu diperiksa kelayakannya sebelum disetujui.',
        action: {
          label: 'Review Kuesioner',
          icon: FileText,
          targetTab: 'review',
        },
        containerClass: 'bg-blue-50/70 border-blue-200/80 text-blue-950',
      };

    // Keputusan manusia yang menghentikan order — bukan kegagalan review dan
    // bukan kegagalan bayar, jadi tidak ada aksi yang ditawarkan di sini.
    // Slotnya sudah bebas (`occupiesSlot` mengecualikannya sejak chip ini ada).
    case 'cancelled':
      return {
        title: 'Order Dibatalkan',
        description: 'Order ini dibatalkan dan tidak lagi menempati slot tayang. Riwayat jadwal serta tagihannya tetap tersimpan.',
        containerClass: 'bg-slate-50 border-slate-200 text-slate-800',
      };

    case 'rejected':
      return {
        title: 'Menunggu Perbaikan Peneliti',
        description: 'Kuesioner dikembalikan ke peneliti dengan catatan perbaikan untuk disesuaikan.',
        action: {
          label: 'Cek Catatan Review',
          icon: FileText,
          targetTab: 'review',
        },
        containerClass: 'bg-rose-50/70 border-rose-200/80 text-rose-950',
      };

    case 'spam':
      return {
        title: 'Submission Ditandai Spam',
        description: 'Submission ini ditandai sebagai spam atau tidak valid.',
        action: {
          label: 'Detail Review',
          icon: FileText,
          targetTab: 'review',
        },
        containerClass: 'bg-orange-50/70 border-orange-200/80 text-orange-950',
      };

    case 'approved':
      return {
        title: 'Kuesioner Disetujui · Siap Atur Jadwal',
        description: 'Review kuesioner telah disetujui. Tentukan tanggal slot tayang dan terbitkan invoice tagihan.',
        action: {
          label: 'Pilih Jadwal Tayang',
          icon: CalendarClock,
          targetTab: 'schedule-payment',
        },
        containerClass: 'bg-sky-50/70 border-sky-200/80 text-sky-950',
      };

    case 'reserved':
    case 'reserved_expiring':
      return {
        title: 'Slot Jadwal Dipesan · Siap Terbitkan Tagihan',
        description: 'Slot tayang sudah dipesan dan belum ada tagihan yang bisa dibayar. Terbitkan tagihan supaya peneliti dapat melanjutkan.',
        action: {
          label: 'Terbitkan Tagihan',
          icon: CreditCard,
          targetTab: 'schedule-payment',
        },
        containerClass: 'bg-amber-50/70 border-amber-200/80 text-amber-950',
      };

    case 'awaiting_payment':
      return {
        title: 'Menunggu Pembayaran Peneliti',
        description: 'Invoice tagihan sudah diterbitkan. Menunggu pelunasan sebelum batas waktu penyiaran.',
        action: {
          label: 'Cek Tagihan & Bayar',
          icon: CreditCard,
          targetTab: 'schedule-payment',
        },
        containerClass: 'bg-amber-50/70 border-amber-200/80 text-amber-950',
      };

    case 'reserved_expired':
      return {
        title: 'Slot Kedaluwarsa · Batas Bayar Terlewat',
        description: 'Batas pembayaran untuk slot ini telah lewat. Atur jadwal baru agar kuesioner dapat disiarkan.',
        action: {
          label: 'Buat Jadwal Baru',
          icon: CalendarClock,
          targetTab: 'schedule-payment',
        },
        containerClass: 'bg-rose-50/70 border-rose-200/80 text-rose-950',
      };

    case 'paid':
      if (isKilat) {
        return {
          title: 'Pembayaran Lunas · Siap Disiarkan',
          description: 'Pembayaran telah terverifikasi. Survei akan disiarkan otomatis via blast Kilat sesuai jadwal.',
          action: {
            label: 'Cek Jadwal Kilat',
            icon: Zap,
            targetTab: 'schedule-payment',
          },
          containerClass: 'bg-amber-50/70 border-amber-200/80 text-amber-950',
        };
      }
      return {
        title: 'Pembayaran Lunas · Siap Buat Halaman',
        description: 'Pembayaran telah terverifikasi. Buat dan terbitkan halaman survei untuk persiapan penyiaran.',
        action: {
          label: 'Buat Halaman Iklan',
          icon: Globe,
          targetTab: 'page',
        },
        containerClass: 'bg-purple-50/70 border-purple-200/80 text-purple-950',
      };

    case 'page_scheduled':
      return {
        title: 'Halaman Siap · Menunggu Jadwal Tayang',
        description: 'Halaman iklan sudah dibuat dan siap ditayangkan otomatis sesuai tanggal slot.',
        action: {
          label: 'Pratinjau Halaman Iklan',
          icon: Globe,
          targetTab: 'page',
        },
        containerClass: 'bg-indigo-50/70 border-indigo-200/80 text-indigo-950',
      };

    case 'live':
      return {
        title: 'Survei Sedang Aktif Tayang',
        description: 'Survei sedang disiarkan langsung untuk mengumpulkan respon dari responden.',
        action: {
          label: isKilat ? 'Cek Jadwal Kilat' : 'Pantau Halaman Live',
          icon: isKilat ? Zap : Globe,
          targetTab: isKilat ? 'schedule-payment' : 'page',
        },
        containerClass: 'bg-emerald-50/70 border-emerald-200/80 text-emerald-950',
      };

    case 'completed':
      return {
        title: 'Periode Penyiaran Selesai',
        description: 'Masa penyiaran survei telah selesai dan pengumpulan data telah ditutup.',
        action: {
          label: isKilat ? 'Lihat Jadwal' : 'Lihat Arsip Halaman',
          icon: isKilat ? Calendar : Globe,
          targetTab: isKilat ? 'schedule-payment' : 'page',
        },
        containerClass: 'bg-slate-100/80 border-slate-200 text-slate-900',
      };
  }
}

function SubmissionStatusBanner({
  lifecycle,
  isKilat,
  submission,
  onNavigateTab,
}: {
  lifecycle: ReturnType<typeof deriveLifecycle>;
  isKilat: boolean;
  submission: SurveySubmission;
  onNavigateTab?: (tab: DetailTab) => void;
}) {
  const config = getStatusBannerConfig(lifecycle.stage, isKilat);
  const ActionIcon = config.action?.icon;

  return (
    <div
      className={cn(
        'rounded-xl border p-3.5 space-y-2.5 transition-all shadow-2xs',
        config.containerClass
      )}
    >
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <LifecycleChip submission={submission} lifecycle={lifecycle} size="sm" />
          <h4 className="text-xs font-bold leading-tight">
            {config.title}
          </h4>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          {config.description}
        </p>
      </div>

      {config.action && onNavigateTab && (
        <div className="pt-0.5">
          <Button
            size="sm"
            onClick={() => onNavigateTab(config.action!.targetTab)}
            className="h-7 px-3 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-800 border border-slate-300/80 hover:border-slate-400 shadow-2xs inline-flex items-center gap-1.5 transition-all rounded-lg"
          >
            {ActionIcon && <ActionIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
            <span>{config.action.label}</span>
            <ArrowRight className="w-3 h-3 text-slate-400 ml-0.5 shrink-0" />
          </Button>
        </div>
      )}
    </div>
  );
}

function getReviewMethodLabel(submission: SurveySubmission): string {
  if (submission.distribution_type === 'kilat') return 'Kilat';
  if (submission.submission_method === 'manual') return 'Manual';
  const url = (submission.formUrl || '').toLowerCase();
  if (url.includes('forms.office.com') || url.includes('office.com') || url.includes('microsoft')) {
    return 'Auto - Microsoft Forms';
  }
  return 'Auto - Google Forms';
}

export function InfoTab({
  submission,
  paymentData,
  existingPage,
  lifecycle,
  onDataUpdated,
  onConvertDistribution,
  onNavigateTab,
}: {
  submission: SurveySubmission;
  paymentData?: PaymentState;
  existingPage?: ExistingPage;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onDataUpdated: () => void;
  onConvertDistribution?: (submission: SurveySubmission, target: 'regular' | 'kilat') => Promise<void>;
  onNavigateTab?: (tab: DetailTab) => void;
}) {
  // Kriteria dan Reward disunting DI DALAM section 'submission' (satu tombol
  // Edit, satu simpan) — tidak ada lagi section terpisah untuk keduanya.
  type EditSection = 'submission' | null;
  const [editing, setEditing] = useState<EditSection>(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [convertTarget, setConvertTarget] = useState<'regular' | 'kilat' | null>(null);

  const isKilat = submission.distribution_type === 'kilat';
  const isBlocked = !!existingPage?.is_published;

  const handleCopyId = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(true);
    toast.success('Submission ID disalin');
    setTimeout(() => setCopiedId(false), 1500);
  };

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
      setDraftCriteria(submission.criteria || '');
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
      await updateSubmissionCriteria(
        submission.id,
        draftCriteria,
        parseInt(draftPrize) || 0,
        parseInt(draftWinners) || 0,
      );
      toast.success('Detail submission diperbarui');
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
      {/* ── Contextual Status Action Banner ───────────── */}
      <SubmissionStatusBanner
        lifecycle={lifecycle}
        isKilat={isKilat}
        submission={submission}
        onNavigateTab={onNavigateTab}
      />

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
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-gray-400 text-[11px]">Reward per user (Rp)</label>
                <Input
                  type="number"
                  value={draftPrize}
                  onChange={(e) => setDraftPrize(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-gray-400 text-[11px]">Jumlah pemenang</label>
                <Input
                  type="number"
                  value={draftWinners}
                  onChange={(e) => setDraftWinners(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-gray-400 text-[11px]">Kriteria responden</label>
              <Textarea
                value={draftCriteria}
                onChange={(e) => setDraftCriteria(e.target.value)}
                className="min-h-[70px] text-xs"
                placeholder="e.g. Usia 18-25 tahun, Mahasiswa aktif..."
              />
            </div>
            {saveCancel(handleSaveSubmission)}
          </div>
        ) : (
          <div className="grid grid-cols-[120px_1fr] !gap-x-3 !gap-y-1.5 text-xs">
            <span className="text-gray-400">Submission ID</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-gray-900 break-all select-all font-medium">
                #{submission.id}
              </span>
              <button
                type="button"
                onClick={() => handleCopyId(submission.id)}
                className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
                title="Salin Submission ID"
              >
                {copiedId ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            <span className="text-gray-400">Tanggal submission</span>
            <span className="font-medium text-gray-900">
              {new Date(submission.submittedAt).toLocaleDateString('id-ID')}{' '}
              {new Date(submission.submittedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </span>

            <span className="text-gray-400">Judul survey</span>
            <span className="font-medium text-gray-900">{submission.formTitle}</span>

            <span className="text-gray-400">Pertanyaan & durasi</span>
            <span className="font-medium text-gray-900">
              {submission.questionCount} Qs · {submission.duration ? `${submission.duration} Days` : 'Belum diisi'}
            </span>

            <span className="text-gray-400">Metode review</span>
            <span className="font-medium text-gray-900">{getReviewMethodLabel(submission)}</span>

            <span className="text-gray-400">Reward</span>
            <span className="font-medium text-gray-900">
              {submission.prize_per_winner && submission.winnerCount ? (
                <>
                  Rp {((submission.prize_per_winner || 0) * (submission.winnerCount || 0)).toLocaleString('id-ID')}
                  <span className="text-gray-500 font-normal ml-1">
                    (@{submission.prize_per_winner.toLocaleString('id-ID')} · {submission.winnerCount} Pemenang)
                  </span>
                </>
              ) : (
                <span className="text-gray-400 italic font-normal">Belum diisi</span>
              )}
            </span>

            <span className="text-gray-400">Kriteria responden</span>
            <div className="text-gray-900 whitespace-pre-line leading-relaxed font-medium">
              {submission.criteria ? (
                submission.criteria
              ) : (
                <span className="text-gray-400 italic font-normal">Target not set</span>
              )}
            </div>

            <span className="text-gray-400">Tipe Distribusi</span>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-medium text-gray-900">
                {isKilat ? 'JFU Kilat' : 'Iklan Reguler'}
              </span>

              {onConvertDistribution && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={isBlocked}
                        onClick={() => setConvertTarget(isKilat ? 'regular' : 'kilat')}
                        className={cn(
                          'inline-flex items-center gap-1 text-[11px] font-medium transition-colors px-2 py-0.5 rounded-md border',
                          isBlocked
                            ? 'text-gray-400 bg-gray-50 border-gray-200 cursor-not-allowed'
                            : 'text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-2xs'
                        )}
                      >
                        {isKilat ? (
                          <>
                            <Calendar className="w-3 h-3 text-slate-400" />
                            Kembalikan ke Iklan
                          </>
                        ) : (
                          <>
                            <Zap className="w-3 h-3 fill-amber-500 text-amber-500" />
                            Jadikan Kilat
                          </>
                        )}
                      </button>
                    </TooltipTrigger>
                    {isBlocked && (
                      <TooltipContent side="top" className="max-w-[260px] text-xs">
                        Halaman iklan sudah published — tarik atau sembunyikan halamannya dulu sebelum mengubah jalur.
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        )}
      </DetailSheetSection>

      {/* ── Researcher (read-only) ────────────────────── */}
      <DetailSheetSection title="Researcher">
        <div className="space-y-3">
          <div className="grid grid-cols-[120px_1fr] !gap-x-3 !gap-y-1.5 text-xs">
            <span className="text-gray-400">Nama</span>
            <span className="font-medium text-gray-900">{submission.researcherName}</span>

            {submission.education && (
              <>
                <span className="text-gray-400">Pendidikan</span>
                <span className="font-medium text-gray-900">{submission.education}</span>
              </>
            )}

            {/* ⚠️ Hanya `university` dan `department` yang benar-benar ada.
                `institution`/`major`/`semester`/`faculty` tidak pernah menjadi
                kolom form_submissions — barisnya dulu selalu kosong. */}
            {submission.university && (
              <>
                <span className="text-gray-400">Institusi / Univ</span>
                <span className="font-medium text-gray-900">{submission.university}</span>
              </>
            )}

            {submission.department && (
              <>
                <span className="text-gray-400">Jurusan</span>
                <span className="font-medium text-gray-900">{submission.department}</span>
              </>
            )}

            {submission.phone_number && (
              <>
                <span className="text-gray-400">No. WhatsApp</span>
                <span className="font-medium text-gray-900">{submission.phone_number}</span>
              </>
            )}

            {submission.leads && (
              <>
                <span className="text-gray-400">Sumber Info</span>
                <span className="font-medium text-gray-900 capitalize">
                  {submission.leads.replace(/_/g, ' ')}
                </span>
              </>
            )}
          </div>

          {/* Penagihan (Invoice) section label + Card underneath */}
          <div className="pt-1 space-y-1.5">
            <span className="text-gray-400 text-xs block">Penagihan (Invoice)</span>
            <div className="bg-gray-50/80 border border-gray-200/80 rounded-lg p-2.5 space-y-1 min-w-0">
              <p className="font-semibold text-gray-900 text-xs">
                {submission.invoiceName || 'Belum diisi'}
              </p>
              <div className="text-xs text-gray-600">
                {submission.invoicePhone || 'Belum diisi'} · {submission.invoiceEmail || 'Belum diisi'}
              </div>
            </div>
          </div>
        </div>
      </DetailSheetSection>

      {onConvertDistribution && (
        <DistributionConvertDialog
          submission={submission}
          paymentData={paymentData}
          lifecycle={lifecycle}
          convertTarget={convertTarget}
          onClose={() => setConvertTarget(null)}
          onConfirm={async (target) => {
            await onConvertDistribution(submission, target);
            onDataUpdated();
          }}
        />
      )}
    </>
  );
}
