import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarClock,
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Gift,
  Globe,
  Image as ImageIcon,
  Loader2,
  Paintbrush,
  PenLine,
  Save,
  Zap,
} from 'lucide-react';
import { DetailSheet, DetailSheetSection } from '@/components/data-list/DetailSheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BannerPicker } from '@/components/PageBuilder/BannerPicker';
import { cn } from '@/lib/utils';
import { copyToClipboard } from '@/components/submissions/types';
import { formatIDR } from '@/utils/currency';
import { bannerSavePatch, isPlaceholderBannerUrl } from '@/utils/page-banner';
import {
  fetchSchedulePayments,
  getScheduledPageBySubmission,
  supabase,
  type AdScheduleEntry,
  type SchedulePayment,
} from '@/utils/supabase';
import { isPaymentTooLateForDate, toWibYmd } from '@/utils/airing-window';
import {
  agendaChipOf,
  airingDaysOf,
  formatWibShort,
  formatWibTime,
  isUnscheduled,
  tokenForChip,
} from './scheduleModel';
import { RescheduleDialog } from './RescheduleDialog';

// ─────────────────────────────────────────────────────────────
// Drawer satu JADWAL — fokus utama: penyesuaian konten & banner halaman.
// Jadwal & Pembayaran diringkas sebagai konteks sekunder di bagian bawah.
// ─────────────────────────────────────────────────────────────

interface PageRow {
  id: string;
  slug: string;
  title: string;
  banner_url: string | null;
  is_published: boolean;
  is_hidden: boolean | null;
  publish_start_date: string | null;
  publish_end_date: string | null;
  views_count: number | null;
}

interface QuickEdit {
  title: string;
  bannerUrl: string;
  criteria: string;
}

export function ScheduleEntryDrawer({
  entry,
  open,
  onClose,
  onChanged,
  onOpenPageBuilder,
  onOpenSubmission,
}: {
  entry: AdScheduleEntry | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  onOpenPageBuilder: (entry: AdScheduleEntry, page: PageRow | null) => void;
  onOpenSubmission: (entry: AdScheduleEntry) => void;
}) {
  const [page, setPage] = useState<PageRow | null>(null);
  const [payment, setPayment] = useState<SchedulePayment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const [form, setForm] = useState<QuickEdit>({ title: '', bannerUrl: '', criteria: '' });
  const [baseline, setBaseline] = useState<QuickEdit>({ title: '', bannerUrl: '', criteria: '' });

  const isKilat = entry?.distributionType === 'kilat';
  const submissionId = entry?.submissionId ?? null;

  const load = useCallback(async () => {
    if (!entry) return;
    setIsLoading(true);
    try {
      const [pageRow, sub, payments] = await Promise.all([
        entry.distributionType === 'kilat'
          ? Promise.resolve(null)
          : getScheduledPageBySubmission(entry.submissionId),
        supabase
          .from('form_submissions')
          .select('criteria_responden')
          .eq('id', entry.submissionId)
          .maybeSingle(),
        fetchSchedulePayments(entry.submissionId, [entry]).catch(() => new Map()),
      ]);

      const p = (pageRow as PageRow | null) ?? null;
      const c = sub.data?.criteria_responden || '';
      setPage(p);
      setPayment(payments.get(entry.id) ?? null);

      const initial: QuickEdit = {
        title: p?.title || entry.title || '',
        bannerUrl: p?.banner_url || '',
        criteria: c,
      };
      setForm(initial);
      setBaseline(initial);
      setIsEditOpen(false);
      setIsPickerOpen(false);
    } catch (e) {
      console.error('Gagal memuat detail jadwal:', e);
      toast.error('Gagal memuat detail jadwal.');
    } finally {
      setIsLoading(false);
    }
  }, [entry]);

  useEffect(() => {
    if (open && entry) void load();
  }, [open, entry, load]);

  const isDirty = useMemo(
    () =>
      form.title !== baseline.title ||
      form.bannerUrl !== baseline.bannerUrl ||
      form.criteria !== baseline.criteria,
    [form, baseline]
  );

  const handleSave = async () => {
    if (!entry || !isDirty) return;
    setIsSaving(true);
    try {
      if (page && (form.title !== baseline.title || form.bannerUrl !== baseline.bannerUrl)) {
        const { error } = await supabase
          .from('survey_pages')
          .update({
            title: form.title,
            ...bannerSavePatch(form.bannerUrl),
            updated_at: new Date().toISOString(),
          })
          .eq('id', page.id);
        if (error) throw error;
      }

      if (form.criteria !== baseline.criteria && submissionId) {
        const { error } = await supabase
          .from('form_submissions')
          .update({ criteria_responden: form.criteria })
          .eq('id', submissionId);
        if (error) throw new Error(`Halaman tersimpan, tapi kriteria gagal: ${error.message}`);
      }

      toast.success('Perubahan konten berhasil disimpan.');
      setBaseline(form);
      setIsEditOpen(false);
      await load();
      onChanged();
    } catch (e: any) {
      console.error('Gagal menyimpan penyesuaian:', e);
      toast.error(e?.message || 'Gagal menyimpan perubahan.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleHide = async () => {
    if (!page) return;
    const action = page.is_hidden ? 'menampilkan kembali' : 'menyembunyikan';
    if (!confirm(`Yakin ingin ${action} halaman "${page.title}" dari API Mobile App?`)) return;
    try {
      const { error } = await supabase
        .from('survey_pages')
        .update({ is_hidden: !page.is_hidden })
        .eq('id', page.id);
      if (error) throw error;
      toast.success(`Halaman berhasil ${page.is_hidden ? 'ditampilkan' : 'disembunyikan'}.`);
      await load();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Gagal mengubah visibilitas halaman.');
    }
  };

  if (!entry) return null;

  const kind = agendaChipOf(entry, Date.now());
  const token = tokenForChip(kind);
  const unscheduled = isUnscheduled(entry);
  const bannerTodo = !isKilat && Boolean(page?.is_published && isPlaceholderBannerUrl(page?.banner_url));
  const isPaid = payment?.hasEverPaid || ['paid', 'completed'].includes(entry.paymentStatus || '');
  const dayCount = airingDaysOf(entry).length;
  const airingYmd = entry.startDate ? toWibYmd(new Date(entry.startDate)) : null;
  const isLate = !isPaid && airingYmd ? isPaymentTooLateForDate(airingYmd) : false;

  const subtitle = [
    `#${entry.submissionId.slice(0, 8)}`,
    entry.researcherName,
    entry.university || null,
  ]
    .filter(Boolean)
    .join(' · ');

  const totalPrize = entry.prizePerWinner && entry.winnerCount
    ? entry.prizePerWinner * entry.winnerCount
    : 0;

  const fullPublicUrl = page ? `${window.location.origin}/p/${page.slug}` : '';

  // Mode editor terbuka: jika banner masih bawaan ATAU admin mengklik edit secara manual
  const showEditor = bannerTodo || isEditOpen;

  return (
    <>
      <DetailSheet
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        size="lg"
        title={entry.title}
        subtitle={subtitle}
        chips={
          <>
            <Chip variant={token.variant} size="sm" dot={token.dot} pulse={token.pulse}>
              {token.label}
            </Chip>
            {isKilat ? (
              <Chip variant="amber" size="sm">
                <Zap className="w-3 h-3 mr-1 fill-amber-500 text-amber-500" /> Kilat
              </Chip>
            ) : bannerTodo ? (
              <Chip variant="amber" size="sm" title="Banner masih menggunakan gambar default">
                ⚠ Banner default
              </Chip>
            ) : page?.is_published ? (
              <Chip variant="green" size="sm">
                Siap
              </Chip>
            ) : page ? (
              <Chip variant="slate" size="sm">
                Draft
              </Chip>
            ) : isPaid ? (
              // ⚠️ "belum ada halaman" dan "memang tidak punya halaman" HARUS
              // berbeda: Kilat sudah pergi ke cabang chip-nya sendiri di atas
              // (guard ensure_survey_page, sql/42), jadi sampai di sini artinya
              // iklan reguler lunas yang halamannya belum dibuat — pekerjaan
              // tertunda, bukan keadaan normal.
              <Chip variant="red" size="sm" title="Iklan sudah lunas tapi halamannya belum dibuat">
                ⚠ Belum ada halaman
              </Chip>
            ) : null}
            {entry.ordinal > 1 && (
              <Chip variant="purple" size="sm" title="Jadwal iklan ke-berapa dari order ini">
                jadwal #{entry.ordinal}
              </Chip>
            )}
            {entry.isExtraAd && <Chip variant="outline" size="sm">Iklan tambahan</Chip>}
          </>
        }
        footer={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-gray-500 hover:text-blue-700"
              onClick={() => onOpenSubmission(entry)}
            >
              Buka Detail di Submissions <ExternalLink className="w-3 h-3 ml-1.5" />
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* ── 1. Jalur Kilat (Khusus Kilat) ── */}
            {isKilat && (
              <DetailSheetSection title="Distribusi JFU Kilat">
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center gap-2 text-amber-900">
                    <Zap className="w-4 h-4 fill-amber-500 text-amber-500" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      Jalur Distribusi Langsung
                    </h4>
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Survei JFU Kilat disiarkan langsung melalui platform panel di luar JFU tanpa menggunakan halaman web landing page.
                  </p>
                  <div className="pt-2 border-t border-amber-200/70 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-amber-700/80 block text-[11px]">Waktu Siaran</span>
                      <span className="font-semibold text-amber-950">
                        {entry.kilatSlotHour != null
                          ? `Jam ${String(entry.kilatSlotHour).padStart(2, '0')}.00 WIB`
                          : 'Belum Ditugaskan'}
                      </span>
                    </div>
                    <div>
                      <span className="text-amber-700/80 block text-[11px]">Status Siaran</span>
                      <span className="font-semibold text-amber-950">
                        {isPaid ? 'Siap Disiarkan' : 'Menunggu Pembayaran'}
                      </span>
                    </div>
                  </div>
                </div>
              </DetailSheetSection>
            )}

            {/* ── 2. Halaman Belum Ada (Order Belum Lunas / Belum Dibuat) ── */}
            {!isKilat && !page && (
              <DetailSheetSection title="Halaman Iklan">
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-5 text-center space-y-2.5">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <Globe className="w-4.5 h-4.5" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800">
                    Halaman Iklan Belum Dibuat
                  </h4>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
                    {isPaid
                      ? 'Belum ada halaman untuk order lunas ini. Silakan buat melalui Page Builder.'
                      : 'Halaman iklan web dibuat otomatis begitu pembayaran tagihan telah terverifikasi lunas.'}
                  </p>
                  {isPaid && (
                    <div className="pt-1">
                      <Button
                        size="sm"
                        onClick={() => onOpenPageBuilder(entry, null)}
                        className="h-7 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-2xs"
                      >
                        <PenLine className="w-3.5 h-3.5 mr-1.5" /> Buat Halaman
                      </Button>
                    </div>
                  )}
                </div>
              </DetailSheetSection>
            )}

            {/* ── 3. Konten Halaman & Editor Banner (FOKUS UTAMA) ── */}
            {!isKilat && page && (
              <DetailSheetSection title="Konten Halaman Survei">
                {showEditor ? (
                  /* ── Mode Editor Terbuka (Banner perlu update atau user klik Edit) ── */
                  <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden divide-y divide-slate-100">
                    {/* Header Editor */}
                    <div className="p-3 bg-slate-50/60 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-800">
                          Penyesuaian Konten &amp; Banner
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            navigator.clipboard.writeText(page.id);
                            toast.success('Page ID berhasil disalin!');
                          }}
                          className="group/id inline-flex items-center gap-1.5 font-mono text-[11px] text-gray-600 bg-white hover:bg-blue-50 hover:text-blue-700 border border-gray-200/80 hover:border-blue-200 rounded px-1.5 py-0.5 whitespace-nowrap transition-colors cursor-pointer"
                          title={`Klik untuk menyalin Page ID (${page.id})`}
                        >
                          <span>#{page.id.slice(0, 8)}</span>
                          <Copy className="w-3 h-3 text-gray-400 group-hover/id:text-blue-600 shrink-0 transition-colors" />
                        </span>
                      </div>
                      {!bannerTodo && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setForm(baseline);
                            setIsEditOpen(false);
                          }}
                          className="h-6 px-2 text-[11px] text-slate-500 hover:text-slate-700"
                        >
                          Tutup Editor
                        </Button>
                      )}
                    </div>

                    {/* Reward Context */}
                    <div className="px-3.5 py-2.5 bg-emerald-50/40 flex items-center gap-2 text-xs">
                      <Gift className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="text-[11px] text-emerald-900 font-bold">
                          Reward Undian:{' '}
                        </span>
                        <span className="font-semibold text-emerald-700">
                          {totalPrize > 0 ? (
                            <>
                              {formatIDR(totalPrize)}{' '}
                              <span className="font-normal text-emerald-600">
                                (@{formatIDR(entry.prizePerWinner)} · {entry.winnerCount} Pemenang)
                              </span>
                            </>
                          ) : (
                            <span className="italic text-slate-400">Tidak ada reward</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Form Layout: Thumbnail Banner di Kiri, Input Teks di Kanan */}
                    <div className="p-3.5 space-y-3">
                      <div className="[display:flex] flex-wrap gap-3">
                        {/* Kolom Banner */}
                        <div className="space-y-1.5 w-full max-w-[152px] shrink-0">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                            Banner
                          </label>
                          <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-slate-200 shadow-2xs bg-slate-50">
                            {form.bannerUrl ? (
                              <img
                                src={form.bannerUrl}
                                alt="Pratinjau banner"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-slate-300" />
                              </div>
                            )}
                            {isPlaceholderBannerUrl(form.bannerUrl) && (
                              <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/90 text-white shadow-2xs">
                                Default
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full h-7 text-[11px] font-medium border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
                            onClick={() => setIsPickerOpen((v) => !v)}
                          >
                            <Paintbrush className="w-3 h-3 mr-1 text-slate-500" />
                            {isPickerOpen ? 'Tutup Pemilih' : 'Ganti Banner'}
                          </Button>
                        </div>

                        {/* Kolom Teks: Judul & Kriteria */}
                        <div className="space-y-3 flex-1 min-w-[240px]">
                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                              Judul Halaman
                            </label>
                            <Input
                              value={form.title}
                              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                              className="h-8.5 text-xs font-semibold"
                            />
                            <p className="text-[10px] text-slate-400">
                              URL publik tidak berubah saat judul diganti
                            </p>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                              Kriteria Responden
                            </label>
                            <Textarea
                              value={form.criteria}
                              onChange={(e) => setForm((f) => ({ ...f, criteria: e.target.value }))}
                              rows={3}
                              className="text-xs leading-relaxed"
                              placeholder="Mis. Responden berusia 18 tahun ke atas, domisili Jabodetabek…"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Modal BannerPicker jika dibuka */}
                      {isPickerOpen && (
                        <div className="pt-2 border-t border-slate-100">
                          <BannerPicker
                            value=""
                            onChange={(url) => {
                              setForm((f) => ({ ...f, bannerUrl: url }));
                              if (url) setIsPickerOpen(false);
                            }}
                            active={open && showEditor}
                          />
                        </div>
                      )}

                      {/* Aksi Simpan & Full Builder */}
                      <div className="pt-2 flex items-center gap-2">
                        <Button
                          size="sm"
                          className="h-8 flex-1 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs"
                          onClick={handleSave}
                          disabled={!isDirty || isSaving}
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                              Menyimpan…
                            </>
                          ) : (
                            <>
                              <Save className="w-3.5 h-3.5 mr-1.5" />
                              Simpan Perubahan
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs border-slate-200 hover:bg-slate-50 text-slate-700 shadow-2xs"
                          onClick={() => onOpenPageBuilder(entry, page)}
                        >
                          <PenLine className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                          Page Builder
                        </Button>
                      </div>
                    </div>

                    {/* Footer: Tautan Publik */}
                    <div className="p-3 bg-slate-50/80 flex items-center justify-between gap-2 flex-wrap text-xs">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px] text-slate-600 truncate select-all">
                          /p/{page.slug}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px] font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                          onClick={() => copyToClipboard(fullPublicUrl, 'Link halaman disalin!')}
                        >
                          <Copy className="w-3 h-3 mr-1 text-slate-400" /> Salin
                        </Button>
                        {page.is_published ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px] font-medium bg-white hover:bg-blue-50 border-slate-200 hover:border-blue-200 text-blue-600 shadow-2xs"
                            onClick={() => window.open(fullPublicUrl, '_blank')}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" /> Buka
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px] font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-600 shadow-2xs"
                            onClick={() => window.open(`${fullPublicUrl}?preview=true`, '_blank')}
                            title="Pratinjau tampilan halaman draft"
                          >
                            <Eye className="w-3 h-3 mr-1" /> Pratinjau
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Mode Ringkas (Banner sudah kustom & siap / Draft) ── */
                  <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden divide-y divide-slate-100">
                    {/* Header Card */}
                    <div className="p-3 bg-slate-50/60 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {page.is_published ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">
                            <span
                              className={cn(
                                'w-1.5 h-1.5 rounded-full bg-emerald-500',
                                kind === 'live' && 'animate-pulse'
                              )}
                            />
                            Siap
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-slate-100 text-slate-700 border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            Draft
                          </span>
                        )}

                        {/* Page ID Badge */}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            navigator.clipboard.writeText(page.id);
                            toast.success('Page ID berhasil disalin!');
                          }}
                          className="group/id inline-flex items-center gap-1.5 font-mono text-[11px] text-gray-600 bg-white hover:bg-blue-50 hover:text-blue-700 border border-gray-200/80 hover:border-blue-200 rounded px-1.5 py-0.5 whitespace-nowrap transition-colors cursor-pointer"
                          title={`Klik untuk menyalin Page ID (${page.id})`}
                        >
                          <span>#{page.id.slice(0, 8)}</span>
                          <Copy className="w-3 h-3 text-gray-400 group-hover/id:text-blue-600 shrink-0 transition-colors" />
                        </span>

                        <span className="text-[11px] text-slate-500 font-medium">
                          {page.publish_start_date ? formatWibShort(page.publish_start_date) : '—'} —{' '}
                          {page.publish_end_date ? formatWibShort(page.publish_end_date) : '—'}
                        </span>
                        {page.is_published ? (
                          <span className="text-[11px] text-slate-400">
                            {kind === 'live' ? (
                              <>
                                · Sedang tayang (
                                <span className="font-semibold text-slate-700 tabular-nums">
                                  {page.views_count || 0}
                                </span>{' '}
                                views)
                              </>
                            ) : kind === 'page_scheduled' ? (
                              <>· Otomatis aktif saat jadwal tiba</>
                            ) : kind === 'completed' ? (
                              <>
                                · Selesai tayang (
                                <span className="font-semibold text-slate-700 tabular-nums">
                                  {page.views_count || 0}
                                </span>{' '}
                                views)
                              </>
                            ) : (
                              <>
                                ·{' '}
                                <span className="font-semibold text-slate-700 tabular-nums">
                                  {page.views_count || 0}
                                </span>{' '}
                                views
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="text-[11px] text-amber-700 font-medium">
                            · Belum terbit (perlu publish manual)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setIsEditOpen(true)}
                          className="h-6 px-2 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Paintbrush className="w-3 h-3 mr-1" /> Edit Konten
                        </Button>
                      </div>
                    </div>

                    {/* Body Rincian Konten */}
                    <div className="p-3.5 space-y-3 text-xs">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Judul Halaman
                        </span>
                        <p className="font-bold text-slate-900 text-sm leading-snug">
                          {page.title || entry.title}
                        </p>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Reward &amp; Pemenang
                        </span>
                        <p className="font-semibold text-emerald-700">
                          {totalPrize > 0 ? (
                            <>
                              {formatIDR(totalPrize)}{' '}
                              <span className="text-slate-500 font-normal ml-1">
                                (@{formatIDR(entry.prizePerWinner)} · {entry.winnerCount} Pemenang)
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-400 italic font-normal">Belum diisi</span>
                          )}
                        </p>
                      </div>

                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Kriteria Responden
                        </span>
                        <p className="text-slate-700 font-medium leading-relaxed whitespace-pre-line text-[11px]">
                          {form.criteria || (
                            <span className="text-slate-400 italic">Target responden belum dispesifikasikan</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Footer: Tautan Publik, Salin, Buka, dan Builder */}
                    <div className="p-3 bg-slate-50/80 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px] text-slate-600 truncate select-all">
                          /p/{page.slug}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px] font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                          onClick={() => copyToClipboard(fullPublicUrl, 'Link halaman disalin!')}
                        >
                          <Copy className="w-3 h-3 mr-1 text-slate-400" /> Salin Link
                        </Button>
                        {page.is_published ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px] font-medium bg-white hover:bg-blue-50 border-slate-200 hover:border-blue-200 text-blue-600 shadow-2xs"
                            onClick={() => window.open(fullPublicUrl, '_blank')}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" /> Buka
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px] font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-600 shadow-2xs"
                            onClick={() => window.open(`${fullPublicUrl}?preview=true`, '_blank')}
                            title="Pratinjau tampilan halaman draft"
                          >
                            <Eye className="w-3 h-3 mr-1" /> Pratinjau
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(
                            'h-6 px-2 text-[11px] font-medium shadow-2xs',
                            !page.is_published
                              ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          )}
                          onClick={() => onOpenPageBuilder(entry, page)}
                        >
                          <PenLine className="w-3 h-3 mr-1" />
                          {!page.is_published ? 'Terbitkan di Page Builder' : 'Page Builder'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={cn(
                            'h-6 px-2 text-[11px]',
                            page.is_hidden
                              ? 'text-blue-600 hover:bg-blue-50'
                              : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                          )}
                          onClick={handleToggleHide}
                          title={page.is_hidden ? 'Tampilkan di aplikasi' : 'Sembunyikan dari aplikasi'}
                        >
                          {page.is_hidden ? (
                            <><Eye className="w-3 h-3 mr-1" /> Tampilkan</>
                          ) : (
                            <><EyeOff className="w-3 h-3 mr-1" /> Sembunyikan</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </DetailSheetSection>
            )}

            {/* ── 4. Jadwal & Pembayaran (SEKUNDER - Ringkas 2-Kolom) ── */}
            <DetailSheetSection title="Jadwal & Pembayaran">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Kolom Kiri: Jadwal Tayang */}
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 space-y-2 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <CalendarClock className="w-3.5 h-3.5 text-blue-600" />
                    <span>Jadwal Tayang</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      {unscheduled ? (
                        'Belum dijadwalkan'
                      ) : (
                        <>
                          {formatWibShort(entry.startDate!)}
                          {entry.endDate ? ` – ${formatWibShort(entry.endDate)}` : ''}
                          {dayCount > 0 && (
                            <span className="font-normal text-slate-500"> · {dayCount} hari</span>
                          )}
                        </>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {!unscheduled && <>Tayang jam {formatWibTime(entry.startDate!)} WIB</>}
                      {entry.slotBookedBy && <> · dipesan {entry.slotBookedBy}</>}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-[11px] font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                    onClick={() => setIsRescheduleOpen(true)}
                  >
                    <CalendarClock className="w-3 h-3 mr-1 text-slate-500" />
                    {unscheduled ? 'Pilih Jadwal' : 'Jadwalkan Ulang'}
                  </Button>
                </div>

                {/* Kolom Kanan: Pembayaran */}
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 space-y-2 shadow-2xs">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Pembayaran</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      {isPaid ? (
                        <span className="text-emerald-700 flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 text-emerald-600" /> Lunas · {formatIDR(entry.totalCost)}
                          </span>
                          {(!payment || payment.paymentMethod === 'manual' || payment.paymentChannel === 'MANUAL_VERIFIED' || (!payment.paymentChannel && payment.paymentMethod !== 'doku')) && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                              title="Audit: Pembayaran ditandai lunas manual (Tandai Lunas oleh Admin)"
                            >
                              Tandai Lunas
                            </span>
                          )}
                        </span>
                      ) : isLate ? (
                        <span className="text-red-700">Slot Expired (Terlewat)</span>
                      ) : (
                        <span className="text-amber-700">Menunggu Pembayaran</span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {isPaid ? (
                        <span>Biaya tagihan terverifikasi</span>
                      ) : (
                        <span>Total tagihan: {formatIDR(entry.totalCost)}</span>
                      )}
                    </p>
                  </div>
                  {isPaid && payment?.paymentId ? (
                    <a
                      href={`/invoices/${payment.paymentId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full h-7 rounded-md border border-emerald-200 bg-white hover:bg-emerald-50 text-[11px] font-medium text-emerald-700 flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
                    >
                      <FileText className="w-3 h-3" /> Lihat Kuitansi
                    </a>
                  ) : payment?.paymentUrl ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-7 text-[11px] font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                      onClick={() => copyToClipboard(payment.paymentUrl!, 'Link pembayaran disalin!')}
                    >
                      <Copy className="w-3 h-3 mr-1 text-slate-500" /> Salin Link Bayar
                    </Button>
                  ) : null}
                </div>
              </div>
            </DetailSheetSection>
          </div>
        )}
      </DetailSheet>

      {isRescheduleOpen && (
        <RescheduleDialog
          entry={entry}
          open={isRescheduleOpen}
          onOpenChange={setIsRescheduleOpen}
          onDone={() => {
            void load();
            onChanged();
          }}
        />
      )}
    </>
  );
}

