import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Eye,
  FileCheck,
  Globe,
  Paintbrush,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import { cn } from '@/lib/utils';
import type { SurveySubmission, ExistingPage } from '../types';
import { formatDate } from '../types';
import { deriveLifecycle } from '../lifecycle';
import { isPlaceholderBannerUrl } from '@/utils/page-banner';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────
// Tab: Page — Landing page control, content preview & live analytics
// ─────────────────────────────────────────────────────────────

export function PageTab({
  submission,
  existingPage,
  lifecycle,
  onOpenPageBuilder,
}: {
  submission: SurveySubmission;
  existingPage?: ExistingPage;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onOpenPageBuilder: (submission: SurveySubmission) => void;
}) {
  const [copied, setCopied] = useState(false);
  const isKilat = submission.distribution_type === 'kilat';

  // Check if banner needs admin update (either default placeholder or new prize period)
  const needsBannerUpdate =
    !isKilat &&
    Boolean(
      existingPage &&
        (isPlaceholderBannerUrl(existingPage.banner_url) ||
          Boolean(existingPage.requires_banner_update))
    );

  const fullPublicUrl = existingPage
    ? `${window.location.origin}/p/${existingPage.slug}`
    : '';

  const handleCopyLink = () => {
    if (!fullPublicUrl) return;
    navigator.clipboard.writeText(fullPublicUrl);
    setCopied(true);
    toast.success('Tautan halaman survei berhasil disalin');
    setTimeout(() => setCopied(false), 2000);
  };

  // 1. Kasus JFU Kilat (Platform Panel di luar JFU)
  if (isKilat) {
    return (
      <div className="space-y-4">
        <DetailSheetSection title="Distribusi JFU Kilat">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3 shadow-2xs">
            <div className="flex items-center gap-2 text-amber-900">
              <Zap className="w-4 h-4 fill-amber-500 text-amber-500" />
              <h4 className="text-xs font-bold uppercase tracking-wider">
                Jalur Distribusi Langsung
              </h4>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              Survei JFU Kilat disiarkan langsung melalui platform panel di luar
              JFU tanpa menggunakan halaman web landing page.
            </p>
            <div className="pt-2 border-t border-amber-200/70 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-amber-700/80 block text-[11px]">
                  Waktu Siaran
                </span>
                <span className="font-semibold text-amber-950">
                  {submission.kilat_slot_hour != null
                    ? `Jam ${String(submission.kilat_slot_hour).padStart(2, '0')}.00 WIB`
                    : 'Belum Ditugaskan'}
                </span>
              </div>
              <div>
                <span className="text-amber-700/80 block text-[11px]">
                  Status Siaran
                </span>
                <span className="font-semibold text-amber-950">
                  {lifecycle.isPaid ? 'Siap Disiarkan' : 'Menunggu Pembayaran'}
                </span>
              </div>
            </div>
          </div>
        </DetailSheetSection>
      </div>
    );
  }

  // 2. Kasus Belum Ada Page / Belum Bayar
  if (!existingPage) {
    return (
      <div className="space-y-4">
        <DetailSheetSection title="Halaman Survei">
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-5 text-center space-y-2.5">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Globe className="w-4.5 h-4.5" />
            </div>
            <h4 className="text-xs font-bold text-slate-800">
              Halaman Iklan Belum Dibuat
            </h4>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
              {!lifecycle.canBuildPage
                ? 'Halaman iklan web akan dibuat otomatis oleh sistem begitu pembayaran tagihan telah terverifikasi lunas.'
                : 'Halaman belum tersedia untuk submission ini. Silakan buka Page Builder untuk membuatnya.'}
            </p>
            {lifecycle.canBuildPage && (
              <div className="pt-1">
                <Button
                  size="sm"
                  onClick={() => onOpenPageBuilder(submission)}
                  className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-2xs"
                >
                  <Paintbrush className="w-3.5 h-3.5 mr-1.5" /> Buat Halaman
                </Button>
              </div>
            )}
          </div>
        </DetailSheetSection>
      </div>
    );
  }

  // Status Chip Details
  const now = new Date();
  const startDate = existingPage.publish_start_date
    ? new Date(existingPage.publish_start_date)
    : null;
  const endDate = existingPage.publish_end_date
    ? new Date(existingPage.publish_end_date)
    : null;

  let statusLabel = 'Draft';
  let statusDot = false;
  let statusBadgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';

  if (existingPage.is_published) {
    if (endDate && endDate < now) {
      statusLabel = 'Completed';
      statusBadgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';
    } else if (startDate && startDate > now) {
      statusLabel = 'Scheduled';
      statusDot = true;
      statusBadgeStyle = 'bg-blue-50 text-blue-700 border-blue-200';
    } else {
      statusLabel = 'Live';
      statusDot = true;
      statusBadgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  }

  // Analytics Calculation
  const views = existingPage.views_count || 0;
  const respondents = existingPage.respondents_count || 0;
  const conversionRate =
    views > 0 ? `${((respondents / views) * 100).toFixed(1)}%` : '0%';

  return (
    <div className="space-y-4">
      {/* ── 1. Top Banner Warning Strip (Jika butuh update banner) ── */}
      {needsBannerUpdate && (
        <div className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200/90 text-amber-900 text-xs shadow-2xs">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="truncate text-[11px] font-medium">
              {existingPage.requires_banner_update
                ? 'Hadiah baru ditambahkan — perbarui banner di Page Builder.'
                : 'Banner masih menggunakan gambar default — perbarui agar lebih menarik.'}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOpenPageBuilder(submission)}
            className="h-6 px-2 text-[10px] font-semibold text-amber-800 bg-white hover:bg-amber-100/70 border-amber-300 shrink-0 shadow-2xs"
          >
            <Paintbrush className="w-3 h-3 mr-1 text-amber-600" /> Ganti Banner
          </Button>
        </div>
      )}

      {/* ── 2. Content Card Mewah (Rincian Konten & Tautan Publik) ── */}
      <DetailSheetSection title="Konten Halaman Survei">
        <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden divide-y divide-slate-100">
          {/* Header Status & Periode */}
          <div className="p-3 bg-slate-50/60 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border',
                  statusBadgeStyle
                )}
              >
                {statusDot && (
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                )}
                {statusLabel}
              </span>

              {/* Page ID Badge — `id` tidak selalu ikut terbawa; tanpa penjaga
                  ini `.slice()` melempar saat halaman dibangun dari sumber
                  yang tidak menyertakannya. */}
              {existingPage.id && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    navigator.clipboard.writeText(existingPage.id!);
                    toast.success('Page ID berhasil disalin!');
                  }}
                  className="group/id inline-flex items-center gap-1.5 font-mono text-[11px] text-gray-600 bg-white hover:bg-blue-50 hover:text-blue-700 border border-gray-200/80 hover:border-blue-200 rounded px-1.5 py-0.5 whitespace-nowrap transition-colors cursor-pointer"
                  title={`Klik untuk menyalin Page ID (${existingPage.id})`}
                >
                  <span>#{existingPage.id.slice(0, 8)}</span>
                  <Copy className="w-3 h-3 text-gray-400 group-hover/id:text-blue-600 shrink-0 transition-colors" />
                </span>
              )}

              <span className="text-[11px] text-slate-500 font-medium">
                {formatDate(existingPage.publish_start_date)} —{' '}
                {formatDate(existingPage.publish_end_date)}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpenPageBuilder(submission)}
              className="h-6 px-2 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            >
              <Paintbrush className="w-3 h-3 mr-1" /> Edit Halaman
            </Button>
          </div>

          {/* Body: Judul, Reward, Kriteria */}
          <div className="p-3.5 space-y-3 text-xs">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Judul Halaman
              </span>
              <p className="font-bold text-slate-900 text-sm leading-snug">
                {existingPage.title || submission.formTitle}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Reward & Pemenang
              </span>
              <p className="font-semibold text-emerald-700">
                {submission.prize_per_winner && submission.winnerCount ? (
                  <>
                    Rp{' '}
                    {(
                      (submission.prize_per_winner || 0) *
                      (submission.winnerCount || 0)
                    ).toLocaleString('id-ID')}
                    <span className="text-slate-500 font-normal ml-1">
                      (@Rp {submission.prize_per_winner.toLocaleString('id-ID')}{' '}
                      · {submission.winnerCount} Pemenang)
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400 italic font-normal">
                    Belum diisi
                  </span>
                )}
              </p>
            </div>

            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Kriteria Responden
              </span>
              <p className="text-slate-700 font-medium leading-relaxed whitespace-pre-line text-[11px]">
                {submission.criteria || (
                  <span className="text-slate-400 italic">
                    Target responden belum dispesifikasikan
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Footer: Tautan Publik, Salin & Buka */}
          <div className="p-3 bg-slate-50/80 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span
                className="font-mono text-[11px] text-slate-600 truncate select-all"
                title={fullPublicUrl}
              >
                /p/{existingPage.slug}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px] font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-600 mr-1" />
                ) : (
                  <Copy className="w-3 h-3 mr-1 text-slate-400" />
                )}
                {copied ? 'Tersalin' : 'Salin Link'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px] font-medium bg-white hover:bg-blue-50 border-slate-200 hover:border-blue-200 text-blue-600 shadow-2xs"
                onClick={() => window.open(fullPublicUrl, '_blank')}
                title="Buka halaman publik di tab baru"
              >
                <ExternalLink className="w-3 h-3 mr-1" /> Buka
              </Button>
            </div>
          </div>
        </div>
      </DetailSheetSection>

      {/* ── 3. Analisis Performa Penayangan ── */}
      <DetailSheetSection title="Analisis Performa Penayangan">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 space-y-1 shadow-2xs">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
              <Eye className="w-3.5 h-3.5 text-blue-500" />
              <span>Penayangan</span>
            </div>
            <p className="text-base font-bold text-slate-900 tabular-nums">
              {views.toLocaleString('id-ID')}
            </p>
            <span className="text-[10px] text-slate-400 block">
              Total views halaman
            </span>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 space-y-1 shadow-2xs">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
              <FileCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Pengerjaan</span>
            </div>
            <p className="text-base font-bold text-slate-900 tabular-nums">
              {respondents.toLocaleString('id-ID')}
            </p>
            <span className="text-[10px] text-slate-400 block">
              Responden submit
            </span>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 space-y-1 shadow-2xs">
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-purple-500" />
              <span>Konversi</span>
            </div>
            <p className="text-base font-bold text-slate-900 tabular-nums">
              {conversionRate}
            </p>
            <span className="text-[10px] text-slate-400 block">
              Rasio pengisian
            </span>
          </div>
        </div>
      </DetailSheetSection>
    </div>
  );
}
