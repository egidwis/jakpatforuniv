import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarClock, Check, ChevronDown, Copy, CreditCard, ExternalLink, Eye, EyeOff,
  FileText, Image as ImageIcon, Link2, Loader2, PenLine, Save, SlidersHorizontal, Zap,
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
  fetchSchedulePayments, getScheduledPageBySubmission, supabase,
  type AdScheduleEntry, type SchedulePayment,
} from '@/utils/supabase';
import { isPaymentTooLateForDate, toWibYmd } from '@/utils/airing-window';
import { agendaChipOf, airingDaysOf, formatWibShort, formatWibTime, isUnscheduled, tokenForChip } from './scheduleModel';
import { RescheduleDialog } from './RescheduleDialog';

// ─────────────────────────────────────────────────────────────
// Drawer satu JADWAL — pintu penyesuaian, bukan tukar-halaman.
//
// Sebelumnya mengklik baris papan Schedule MELEMPAR admin ke halaman
// Submissions: papannya hilang, periode yang dipilih hilang, posisi gulung
// hilang. Padahal pertanyaan yang sedang dikerjakan ("banner iklan besok sudah
// diganti belum") tidak pernah butuh meninggalkan kalender.
//
// PEMBAGIAN DENGAN HALAMAN PAGES SENGAJA DIJAGA:
//   PAGES    — sumbu HALAMAN. Audit responden, urutan feed, hapus proof.
//   SCHEDULE — sumbu TANGGAL. Penyesuaian yang muncul karena tanggal tayang:
//              banner, judul, kriteria, dan memindahkan jendelanya.
// Karena itu di sini TIDAK ADA tabel responden — itu sudah dijawab drawer Pages,
// dan menduplikasinya membuat dua layar mengaku sebagai tempat kerja yang sama.
//
// Drawer ini milik JADWAL, bukan milik HARI. Dibuka dari baris "hari 2/4" atau
// "hari 4/4", isinya sama persis.
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

/** Nilai yang bisa disunting form cepat. Dipakai juga untuk deteksi "ada yang berubah". */
interface QuickEdit {
  title: string;
  bannerUrl: string;
  criteria: string;
}

export function ScheduleEntryDrawer({
  entry, open, onClose, onChanged, onOpenPageBuilder, onOpenSubmission,
}: {
  entry: AdScheduleEntry | null;
  open: boolean;
  onClose: () => void;
  /** Data berubah — papan induk harus memuat ulang. */
  onChanged: () => void;
  onOpenPageBuilder: (entry: AdScheduleEntry, page: PageRow | null) => void;
  onOpenSubmission: (entry: AdScheduleEntry) => void;
}) {
  const [page, setPage] = useState<PageRow | null>(null);
  const [payment, setPayment] = useState<SchedulePayment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  /** Akordeon penyesuaian. Tertutup default supaya jadwal + uang + aksi halaman
   *  muat dalam satu layar; dibuka sendiri hanya kalau memang ada pekerjaannya. */
  const [isEditOpen, setIsEditOpen] = useState(false);
  /** Pemilih banner penuh (3 tab). Di luar ini yang tampil cuma thumbnail. */
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const [form, setForm] = useState<QuickEdit>({ title: '', bannerUrl: '', criteria: '' });
  const [baseline, setBaseline] = useState<QuickEdit>({ title: '', bannerUrl: '', criteria: '' });

  const isKilat = entry?.distributionType === 'kilat';
  const submissionId = entry?.submissionId ?? null;

  const load = useCallback(async () => {
    if (!entry) return;
    setIsLoading(true);
    try {
      // Halaman diambil per-drawer, BUKAN ikut dimuat untuk 971 baris papan.
      // Kilat tidak pernah punya baris survey_pages (guard sql/42), jadi ia tidak
      // ditanyakan sama sekali.
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
        title: p?.title || '',
        bannerUrl: p?.banner_url || '',
        criteria: c,
      };
      setForm(initial);
      setBaseline(initial);
      // Satu-satunya alasan akordeon terbuka sendiri: halaman sudah TERBIT tapi
      // bannernya masih gambar bawaan. Itu pekerjaan yang memang harus dilihat —
      // menyembunyikannya di balik satu klik menghapus guna penanda `⚠ banner`
      // yang baru saja diikuti admin dari Agenda.
      setIsEditOpen(!!p?.is_published && isPlaceholderBannerUrl(p?.banner_url));
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

  /**
   * Simpan TEPAT tiga hal.
   *
   * ⚠️ `slug` SENGAJA TIDAK IKUT, dan ini bukan kelalaian. Slug ADALAH URL publik
   * `/pages/<slug>` — rute SurveyPage, tombol "Buka", dan setiap tautan yang
   * sudah tersebar ke responden memakainya. Page Builder menulis ulang slug tiap
   * kali judul diketik (`slug: generateSlug(newTitle)`), jadi mengganti judul di
   * sana mematikan tautan iklan yang SEDANG TAYANG. Agenda isinya justru
   * didominasi iklan live/paid; jalur ini tidak boleh mewarisi perilaku itu.
   *
   * ⚠️ `is_published`, `publish_start_date`, `publish_end_date`, `blocks`, dan
   * `custom_fields` juga tidak disentuh. Empat yang pertama dimiliki auto-publish
   * (sql/40) dan `cron_activate_extends`; menulisnya dari sini bisa menurunkan
   * iklan yang sedang di udara.
   */
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
        // Tabel kedua — kalau yang ini gagal, katakan MANA yang gagal. Toast
        // "gagal menyimpan" polos akan membuat admin mengira judulnya ikut batal.
        if (error) throw new Error(`Halaman tersimpan, tapi kriteria gagal: ${error.message}`);
      }

      toast.success('Perubahan tersimpan.');
      setBaseline(form);
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

  // Chip yang sama dengan baris yang barusan diklik — drawer tidak boleh menamai
  // keadaan yang sama dengan nama berbeda dari daftarnya.
  const kind = agendaChipOf(entry, Date.now());
  const token = tokenForChip(kind);
  const unscheduled = isUnscheduled(entry);
  const bannerTodo = !!page?.is_published && isPlaceholderBannerUrl(page?.banner_url);
  const isPaid = payment?.hasEverPaid || ['paid', 'completed'].includes(entry.paymentStatus || '');
  // ⚠️ Panjang tayang diturunkan dari JENDELA, bukan dari kolom `duration`.
  // Kolom itu terbukti bisa berbohong (#8462698a: jendela 1 hari, kolom 3), dan
  // memajangnya di sebelah rentang tanggalnya berarti menampilkan dua angka yang
  // saling menyangkal. Aturan yang sama sudah dipakai Agenda & papan kapasitas.
  const dayCount = airingDaysOf(entry).length;
  const airingYmd = entry.startDate ? toWibYmd(new Date(entry.startDate)) : null;
  const isLate = !isPaid && airingYmd ? isPaymentTooLateForDate(airingYmd) : false;

  const subtitle = [
    `#${entry.submissionId.slice(0, 8)}`,
    entry.researcherName,
  ].join(' · ');

  return (
    <>
      <DetailSheet
        open={open}
        onOpenChange={(v) => { if (!v) onClose(); }}
        size="lg"
        title={entry.title}
        subtitle={subtitle}
        chips={
          <>
            <Chip variant={token.variant} size="sm" dot={token.dot} pulse={token.pulse}>
              {token.label}
            </Chip>
            {entry.ordinal > 1 && (
              <Chip variant="purple" size="sm" title="Jadwal iklan ke-berapa dari order ini">
                jadwal #{entry.ordinal}
              </Chip>
            )}
            {isKilat && (
              <Chip variant="amber" size="sm">
                <Zap className="w-3 h-3 mr-1 fill-amber-500 text-amber-500" /> Kilat
              </Chip>
            )}
            {entry.isExtraAd && <Chip variant="outline" size="sm">Iklan tambahan</Chip>}
            {bannerTodo && (
              <Chip variant="amber" size="sm" title="Masih memakai banner bawaan">
                Banner default
              </Chip>
            )}
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
              Buka di Submissions <ExternalLink className="w-3 h-3 ml-1.5" />
            </Button>
          </div>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* ── Jadwal ─────────────────────────────────────── */}
            <DetailSheetSection title="Jadwal">
              <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5 space-y-2">
                <p className="text-sm font-semibold text-gray-900">
                  {unscheduled ? (
                    'Belum dijadwalkan'
                  ) : (
                    <>
                      {formatWibShort(entry.startDate!)}
                      {entry.endDate ? ` – ${formatWibShort(entry.endDate)}` : ''}
                      {dayCount > 0 ? (
                        <span className="font-normal text-gray-500"> · {dayCount} hari</span>
                      ) : null}
                    </>
                  )}
                </p>
                <p className="text-[11px] text-gray-500">
                  {!unscheduled && <>Tayang {formatWibTime(entry.startDate!)} WIB</>}
                  {entry.slotBookedBy && <> · dipesan {entry.slotBookedBy}</>}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs border-gray-200"
                  onClick={() => setIsRescheduleOpen(true)}
                >
                  <CalendarClock className="w-3.5 h-3.5 mr-1.5" />
                  {unscheduled ? 'Pilih jadwal' : 'Jadwalkan ulang'}
                </Button>
              </div>
            </DetailSheetSection>

            {/* ── Pembayaran jadwal ini ──────────────────────────
                Naik ke posisi kedua: ia GERBANG. Halaman iklan baru ada setelah
                order lunas (auto-publish sql/40), jadi blok di bawahnya sering
                kosong justru ketika blok ini merah — membacanya lebih dulu
                menjelaskan kenapa. */}
            <DetailSheetSection title="Pembayaran jadwal ini">
              {isPaid ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-emerald-800 inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> Lunas · {formatIDR(entry.totalCost)}
                    {payment && payment.attempts > 1 && (
                      <span className="font-normal text-emerald-600">
                        · {payment.attempts} percobaan
                      </span>
                    )}
                  </span>
                  {payment?.paymentId && (
                    <a
                      href={`/invoices/${payment.paymentId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-medium text-emerald-700 hover:underline inline-flex items-center gap-1 shrink-0"
                    >
                      <FileText className="w-3 h-3" /> Kuitansi
                    </a>
                  )}
                </div>
              ) : (
                <div
                  className={cn(
                    'rounded-lg border px-3 py-2.5 space-y-2',
                    isLate ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'
                  )}
                >
                  <p className={cn('text-[11px] inline-flex items-center gap-1.5', isLate ? 'text-red-800' : 'text-amber-900')}>
                    <CreditCard className="w-3.5 h-3.5 shrink-0" />
                    {isLate
                      ? <span><strong>Batas bayar terlewat</strong> — 14.00 WIB pada hari tayang. Jadwalkan ulang untuk menyelamatkannya.</span>
                      : <span>Menunggu pembayaran · {formatIDR(entry.totalCost)}</span>}
                  </p>
                  {payment?.paymentUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-7 text-[11px] bg-white"
                      onClick={() => copyToClipboard(payment.paymentUrl!, 'Payment link copied!')}
                    >
                      <Copy className="w-3 h-3 mr-1.5" /> Salin link bayar
                    </Button>
                  )}
                  {/* ⚠️ TANPA "Tandai lunas". `updatePaymentStatus` masih melunasi
                      SELURUH invoice order, jadi di drawer ber-lingkup satu jadwal
                      ia akan berbohong untuk order berjadwal banyak. Penyempitan
                      ke schedule_id adalah Task 11. */}
                </div>
              )}
            </DetailSheetSection>

            {/* ── Halaman iklan ──────────────────────────────── */}
            {isKilat ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
                <Zap className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Distribusi Kilat.</span> Tidak memakai halaman
                  iklan — survei didorong langsung ke panel.
                </p>
              </div>
            ) : page ? (
              <>
                <DetailSheetSection title="Halaman iklan">
                  <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-[11px] text-gray-500 space-y-1">
                    <p>
                      {page.publish_start_date ? formatWibShort(page.publish_start_date) : '—'}
                      {' → '}
                      {page.publish_end_date ? formatWibShort(page.publish_end_date) : '—'}
                    </p>
                    <p>
                      <span className="font-semibold text-gray-800 tabular-nums">
                        {page.views_count || 0}
                      </span>{' '}
                      views
                      {page.is_hidden && <span className="text-red-600"> · disembunyikan</span>}
                    </p>
                    {/* Slug tinggal di sini, bukan di bawah field judul: ia IDENTITAS
                        halaman, bukan bagian dari penyuntingan. Form di bawah tidak
                        pernah menulisnya. */}
                    <p className="flex items-center gap-1.5 text-gray-400">
                      <Link2 className="w-3 h-3 shrink-0" />
                      <span className="font-mono truncate">/{page.slug}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(`${window.location.origin}/pages/${page.slug}`, 'Link halaman disalin!')}
                        className="shrink-0 hover:text-blue-600"
                        title="Salin link halaman"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs border-gray-200"
                      onClick={() => onOpenPageBuilder(entry, page)}
                      title="Isi halaman, extra questions, slug, hadiah, jadwal publish"
                    >
                      <PenLine className="w-3.5 h-3.5 mr-1.5" />Page Builder
                    </Button>
                    {page.is_published && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs border-gray-200"
                        onClick={() => window.open(`/pages/${page.slug}`, '_blank')}
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Buka
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn(
                        'h-8 text-xs ml-auto',
                        page.is_hidden
                          ? 'border-blue-200 text-blue-600 hover:bg-blue-50'
                          : 'border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50'
                      )}
                      onClick={handleToggleHide}
                    >
                      {page.is_hidden
                        ? <><Eye className="w-3.5 h-3.5 mr-1.5" />Tampilkan</>
                        : <><EyeOff className="w-3.5 h-3.5 mr-1.5" />Sembunyikan</>}
                    </Button>
                  </div>

                  {/* ── Penyesuaian cepat (akordeon) ──────────────
                      Tiga field yang cuma sesekali disentuh. Ditutup default agar
                      jadwal, uang, dan aksi halaman muat dalam satu layar — banner
                      lebar-penuh sebelumnya memakan separuh drawer sendirian. */}
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setIsEditOpen((v) => !v)}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50/80 hover:bg-gray-100 transition-colors text-left"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="text-xs font-semibold text-gray-700">Penyesuaian cepat</span>
                      {/* Hanya saat tertutup — kalau terbuka, lencana yang sama sudah
                          menempel di thumbnail, dan yang di sana mengikuti nilai form
                          secara langsung (turun begitu banner diganti, sebelum simpan). */}
                      {bannerTodo && !isEditOpen && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700">
                          ⚠ banner masih bawaan
                        </span>
                      )}
                      <ChevronDown
                        className={cn(
                          'w-4 h-4 text-gray-400 ml-auto shrink-0 transition-transform',
                          isEditOpen && 'rotate-180'
                        )}
                      />
                    </button>

                    {isEditOpen && (
                      <div className="p-3 space-y-3 border-t border-gray-200">
                        {/* Dua kolom: pratinjau banner ringkas di kiri, teks di kanan.
                            ⚠️ TANPA varian breakpoint, dan itu disengaja: styles.css
                            lama menimpa `.flex` DAN `.grid`, dan terbukti dua kali di
                            sini `sm:grid-cols-[…]` lalu `sm:flex-row` sama-sama kalah
                            — kolomnya tetap menumpuk. Jadi: `[display:flex]` (kelas
                            arbitrer, tidak tersentuh timpaan itu), arah baris bawaan,
                            dan `flex-wrap` yang menumpuk sendiri kalau sempit. Lebar
                            thumbnail dipatok di elemennya lewat `max-w-[152px]`. */}
                        <div className="[display:flex] flex-wrap gap-3">
                          <div className="space-y-1.5 w-full max-w-[152px] shrink-0">
                            <label className="text-[11px] font-medium text-gray-500">Banner</label>
                            {form.bannerUrl ? (
                              <img
                                src={form.bannerUrl}
                                alt="Pratinjau banner"
                                className="w-full aspect-video object-cover rounded-md border border-gray-200"
                              />
                            ) : (
                              <div className="w-full aspect-video rounded-md border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
                                <ImageIcon className="w-4 h-4 text-gray-300" />
                              </div>
                            )}
                            {isPlaceholderBannerUrl(form.bannerUrl) && (
                              <span className="inline-block rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700">
                                masih bawaan
                              </span>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-[11px] border-gray-200"
                              onClick={() => setIsPickerOpen((v) => !v)}
                            >
                              {isPickerOpen ? 'Tutup pemilih' : 'Ganti banner'}
                            </Button>
                          </div>

                          {/* `min-w-[240px]` yang memicu wrap: begitu sisa lebar tak
                              cukup untuk judul + kriteria, kolom ini turun sendiri ke
                              bawah thumbnail — tanpa media query. */}
                          <div className="space-y-3 flex-1 min-w-[240px]">
                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-gray-500">Judul halaman</label>
                              <Input
                                value={form.title}
                                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                className="h-9 text-sm"
                              />
                              {/* Alasan slug tidak ikut ditulis di layar, bukan cuma di
                                  kode — admin yang mengganti judul berhak tahu URL yang
                                  sudah tersebar ke responden tidak ikut bergerak. */}
                              <p className="text-[11px] text-gray-400">
                                URL tidak berubah saat judul diganti
                              </p>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-medium text-gray-500">
                                Kriteria responden
                              </label>
                              <Textarea
                                value={form.criteria}
                                onChange={(e) => setForm((f) => ({ ...f, criteria: e.target.value }))}
                                rows={3}
                                className="text-xs"
                                placeholder="Mis. Mahasiswa aktif S1, 18–24 th…"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Pemilih penuh butuh lebar — 3 tab di kolom 152px tidak
                            terbaca. `value=""` disengaja: BannerPicker menyembunyikan
                            tabnya dan memajang pratinjaunya sendiri begitu `value`
                            terisi, dan pratinjau lebar-penuh itu persis yang kita
                            singkirkan. Thumbnail di kiri yang memegang perannya.
                            Menutup sendiri begitu banner dipilih. */}
                        {isPickerOpen && (
                          <BannerPicker
                            value=""
                            onChange={(url) => {
                              setForm((f) => ({ ...f, bannerUrl: url }));
                              if (url) setIsPickerOpen(false);
                            }}
                            active={open && isEditOpen}
                          />
                        )}

                        <Button
                          size="sm"
                          className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={handleSave}
                          disabled={!isDirty || isSaving}
                        >
                          {isSaving
                            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Menyimpan…</>
                            : <><Save className="w-3.5 h-3.5 mr-1.5" />Simpan perubahan</>}
                        </Button>
                      </div>
                    )}
                  </div>
                </DetailSheetSection>
              </>
            ) : (
              <DetailSheetSection title="Halaman iklan">
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 flex items-start gap-2">
                  <ImageIcon className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {isPaid ? (
                      <>
                        Belum ada halaman untuk order lunas ini. Biasanya ia dibuat &amp;
                        diterbitkan otomatis — buat manual lewat Page Builder.
                      </>
                    ) : (
                      <>
                        Halaman iklan <strong>dibuat &amp; diterbitkan otomatis</strong> begitu
                        order lunas. Belum ada yang bisa disesuaikan dari sini.
                      </>
                    )}
                  </p>
                </div>
                {isPaid && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-gray-200"
                    onClick={() => onOpenPageBuilder(entry, null)}
                  >
                    <PenLine className="w-3.5 h-3.5 mr-1.5" />Buat halaman
                  </Button>
                )}
              </DetailSheetSection>
            )}
          </>
        )}
      </DetailSheet>

      {isRescheduleOpen && (
        <RescheduleDialog
          entry={entry}
          open={isRescheduleOpen}
          onOpenChange={setIsRescheduleOpen}
          onDone={() => { void load(); onChanged(); }}
        />
      )}
    </>
  );
}
