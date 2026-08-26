import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Eye,
  FileCheck,
  Globe,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import { cn } from '@/lib/utils';
import type { SurveySubmission, ExistingPage } from '../types';
import { formatDate } from '../types';
import { deriveLifecycle } from '../lifecycle';
import { pageReachability } from '../pageReachability';
import { publicPagePath, publicPageUrl } from '@/utils/page-url';
import { fetchAdSchedules, type AdScheduleEntry, type FormSubmission } from '@/utils/supabase';
import {
  airingStartHourWibOf,
  fmtShort,
  isKilatSchedule,
  publicationStateOf,
  type PublicationState,
} from '@/components/status/airingPeriods';
import { scheduleEnd, scheduleStart } from '@/components/status/scheduleAxes';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────
// Tab: Page — kembaran Fase ③ Penayangan di dashboard peneliti.
//
// ⚠️ TAB INI MONITORING. NOL AKSI TULIS. Itu keputusan, bukan kelupaan.
//
// Admin yang melayani reservasi bukan orang yang membuat halaman. Tab ini
// dulu menawarkan "Buat Halaman", "Ganti Banner", dan "Edit Halaman" — plus
// titik merah di tab dan di baris tabel Submissions — sehingga admin pertama
// terus-menerus ditagih pekerjaan yang dikerjakan orang lain. Pekerjaan itu
// punya rumah sendiri di papan Jadwal, lengkap dengan pil berhitung, penyaring,
// editor banner inline, dan tombol terbit. Yang tersisa di sini afordansi BACA.
//
// Kalau nanti terbukti mengganggu, mengembalikan tombolnya satu baris JSX; yang
// mahal bukan tombolnya, melainkan kembali menyalakan sinyal yang salah alamat.
// ─────────────────────────────────────────────────────────────

/** Kosakata yang SAMA PERSIS dengan chip Fase ③ (`extStatus*`, blok `id`).
 *  Kalau admin menyebutnya "Live" dan peneliti "Tayang" untuk keadaan yang
 *  sama, salah satunya salah. */
const PUBLICATION_LABEL: Record<Exclude<PublicationState, 'none'>, string> = {
  scheduled: 'Terjadwal',
  live: 'Tayang',
  completed: 'Selesai',
};

const PUBLICATION_TONE: Record<Exclude<PublicationState, 'none'>, string> = {
  scheduled: 'text-indigo-700 bg-indigo-500',
  live: 'text-emerald-700 bg-emerald-500',
  completed: 'text-slate-600 bg-slate-400',
};

function PublicationRow({
  entry,
  submission,
  now,
}: {
  entry: AdScheduleEntry;
  submission: SurveySubmission;
  now: Date;
}) {
  const state = publicationStateOf(entry, now);
  if (state === 'none') return null;

  const start = scheduleStart(entry);
  const end = scheduleEnd(entry);
  const isKilat = isKilatSchedule(entry, submission as unknown as FormSubmission);
  const hour = airingStartHourWibOf(start, isKilat, entry.kilatSlotHour);
  const [text, dot] = PUBLICATION_TONE[state].split(' ');

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-white">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-900 truncate">
          {start || end ? `${fmtShort(start)}–${fmtShort(end)}` : '—'}
        </p>
        {/* Aturan emas: Kilat yang gelombangnya belum ditetapkan tidak
            memasok jam apa pun — lihat `airingStartHourWibOf`. */}
        <p className="text-[11px] text-slate-500 font-medium">
          {hour ? `Mulai ${hour} WIB` : isKilat ? 'Jam tayang ditetapkan tim' : '—'}
        </p>
      </div>
      <span className={cn('flex items-center gap-1.5 text-xs font-bold shrink-0', text)}>
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dot)} />
        {PUBLICATION_LABEL[state]}
      </span>
    </div>
  );
}

/**
 * Baris "Peneliti melihat" — kembaran fase dibuat terlihat.
 *
 * ⚠️ DITURUNKAN DARI KEADAAN YANG SAMA, BUKAN DISALIN KATA PER KATA dari
 * `translations.ts`. Pola yang sama sudah mendarat di tab Reservasi Jadwal;
 * alasan lengkapnya di `ScheduleCardList.tsx`.
 */
function ResearcherSeesLine({
  aired,
  views,
}: {
  aired: { state: PublicationState; range: string }[];
  views: number;
}) {
  const shown = aired.filter((a) => a.state !== 'none');
  if (shown.length === 0) return null;

  const text = shown
    .map((a) => `${a.range} · ${PUBLICATION_LABEL[a.state as Exclude<PublicationState, 'none'>]}`)
    .join(' — ') + (views > 0 ? ` · ${views.toLocaleString('id-ID')} views` : '');

  return (
    <p className="text-[11px] leading-snug text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5">
      <span className="font-semibold text-slate-600">Peneliti melihat:</span> «{text}»
    </p>
  );
}

export function PageTab({
  submission,
  existingPage,
  lifecycle,
  onOpenScheduleBoard,
}: {
  submission: SurveySubmission;
  existingPage?: ExistingPage;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  /** Pekerjaan halaman hidup di papan Jadwal — ini satu-satunya jalan ke sana.
   *  Menerima Booking ID karena itulah yang dicari kotak pencarian papan
   *  (`matchesQuery`); id submission tidak dikenalinya. */
  onOpenScheduleBoard?: (bookingId: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [schedules, setSchedules] = useState<AdScheduleEntry[]>([]);
  const isKilatOrder = submission.distribution_type === 'kilat';
  const submissionId = submission.id;

  /**
   * Sengaja TIDAK diangkat ke cangkang drawer.
   *
   * Rencana awal mengangkat `fetchAdSchedules` ke `SubmissionDetailSheet` demi
   * "satu pembacaan, bukan dua" — tapi tab Page dan tab Reservasi Jadwal tidak
   * pernah ter-mount bersamaan (drawer merender satu tab saja), jadi pembacaan
   * gandanya tidak pernah terjadi. Yang justru terjadi kalau diangkat: setiap
   * drawer yang dibuka ikut menarik jadwal walau admin cuma melihat tab Info.
   */
  useEffect(() => {
    if (!submissionId || isKilatOrder) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchAdSchedules(submissionId);
        if (!cancelled) setSchedules(rows);
      } catch (e) {
        console.error('Gagal memuat jadwal untuk tab Page:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [submissionId, isKilatOrder]);

  const fullPublicUrl = existingPage ? publicPageUrl(existingPage.slug) : '';

  const handleCopyLink = () => {
    if (!fullPublicUrl) return;
    navigator.clipboard.writeText(fullPublicUrl);
    setCopied(true);
    toast.success('Tautan halaman survei berhasil disalin');
    setTimeout(() => setCopied(false), 2000);
  };

  // ── 1. Kilat: didistribusikan lewat panel, tanpa halaman web ──
  if (isKilatOrder) {
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
                <span className="text-amber-700/80 block text-[11px]">Waktu Siaran</span>
                <span className="font-semibold text-amber-950">
                  {submission.kilat_slot_hour != null
                    ? `Jam ${String(submission.kilat_slot_hour).padStart(2, '0')}.00 WIB`
                    : 'Belum Ditugaskan'}
                </span>
              </div>
              <div>
                <span className="text-amber-700/80 block text-[11px]">Status Siaran</span>
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

  const now = new Date();
  const reach = pageReachability(existingPage, now);
  const airedRows = schedules
    .map((s) => ({ entry: s, state: publicationStateOf(s, now) }))
    .filter((r) => r.state !== 'none');

  const views = existingPage?.views_count || 0;
  const respondents = existingPage?.respondents_count || 0;
  const conversionRate = views > 0 ? `${((respondents / views) * 100).toFixed(1)}%` : '0%';

  // Tanpa Booking ID tidak ada yang bisa dicari di papan — tautannya
  // dihilangkan, bukan dirender mati. Aturan yang sama dengan menu ⋯ tab
  // Reservasi Jadwal.
  const bookingId = schedules[0]?.bookingId || null;
  const boardLink = onOpenScheduleBoard && bookingId ? (
    <button
      type="button"
      onClick={() => onOpenScheduleBoard(bookingId)}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
    >
      Buka di papan Jadwal <ArrowUpRight className="w-3 h-3" />
    </button>
  ) : null;

  return (
    <div className="space-y-4">
      {/* ── Penayangan: satu baris per jadwal, aturan yang sama dengan Fase ③ ── */}
      <DetailSheetSection title="Penayangan">
        {airedRows.length > 0 ? (
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden divide-y divide-slate-100">
            {airedRows.map((r) => (
              <PublicationRow key={r.entry.id} entry={r.entry} submission={submission} now={now} />
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-3">
            Belum ada jadwal yang lunas — penayangan belum dimulai.
          </p>
        )}
      </DetailSheetSection>

      {/* ── Halaman iklan: bisa dibuka responden atau tidak ── */}
      <DetailSheetSection title="Halaman Iklan">
        <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden divide-y divide-slate-100">
          <div className="p-3 bg-slate-50/60 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <ReachabilityChip reach={reach} />
              {existingPage?.id && (
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
            </div>
            <ReachabilityNote
              reach={reach}
              page={existingPage}
              multiSchedule={airedRows.length > 1}
              boardLink={boardLink}
            />
          </div>

          {existingPage && (
            <>
              <div className="p-3.5 space-y-3 text-xs">
                <Field label="Judul Halaman">
                  <p className="font-bold text-slate-900 text-sm leading-snug">
                    {existingPage.title || submission.formTitle}
                  </p>
                </Field>
                <Field label="Reward & Pemenang">
                  <p className="font-semibold text-emerald-700">
                    {submission.prize_per_winner && submission.winnerCount ? (
                      <>
                        Rp{' '}
                        {(
                          (submission.prize_per_winner || 0) * (submission.winnerCount || 0)
                        ).toLocaleString('id-ID')}
                        <span className="text-slate-500 font-normal ml-1">
                          (@Rp {submission.prize_per_winner.toLocaleString('id-ID')} ·{' '}
                          {submission.winnerCount} Pemenang)
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-400 italic font-normal">Belum diisi</span>
                    )}
                  </p>
                </Field>
                <Field label="Kriteria Responden">
                  <p className="text-slate-700 font-medium leading-relaxed whitespace-pre-line text-[11px]">
                    {submission.criteria || (
                      <span className="text-slate-400 italic">
                        Target responden belum dispesifikasikan
                      </span>
                    )}
                  </p>
                </Field>
              </div>

              <div className="p-3 bg-slate-50/80 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span
                    className="font-mono text-[11px] text-slate-600 truncate select-all"
                    title={fullPublicUrl}
                  >
                    {publicPagePath(existingPage.slug)}
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
            </>
          )}
        </div>
      </DetailSheetSection>

      {/* ── Performa: angka nyata dari page_respondents, admin-only ── */}
      {existingPage && (
        <DetailSheetSection title="Analisis Performa Penayangan">
          <div className="grid grid-cols-3 gap-2.5">
            <Metric icon={<Eye className="w-3.5 h-3.5 text-blue-500" />} label="Penayangan" value={views.toLocaleString('id-ID')} hint="Total views halaman" />
            <Metric icon={<FileCheck className="w-3.5 h-3.5 text-emerald-500" />} label="Pengerjaan" value={respondents.toLocaleString('id-ID')} hint="Responden submit" />
            <Metric icon={<TrendingUp className="w-3.5 h-3.5 text-purple-500" />} label="Konversi" value={conversionRate} hint="Rasio pengisian" />
          </div>
        </DetailSheetSection>
      )}

      <ResearcherSeesLine
        aired={airedRows.map((r) => ({
          state: r.state,
          range: `${fmtShort(scheduleStart(r.entry))}–${fmtShort(scheduleEnd(r.entry))}`,
        }))}
        views={views}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      {children}
    </div>
  );
}

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 space-y-1 shadow-2xs">
      <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-base font-bold text-slate-900 tabular-nums">{value}</p>
      <span className="text-[10px] text-slate-400 block">{hint}</span>
    </div>
  );
}

/** Chip menjawab "responden bisa membukanya sekarang?", bukan "fase apa" —
 *  fase sudah dijawab daftar Penayangan di atasnya. */
function ReachabilityChip({ reach }: { reach: ReturnType<typeof pageReachability> }) {
  const map: Record<string, { label: string; cls: string; dot: boolean }> = {
    none: { label: 'Belum dibuat', cls: 'bg-slate-100 text-slate-600 border-slate-200', dot: false },
    draft: { label: 'Draft — belum terbit', cls: 'bg-amber-50 text-amber-800 border-amber-200', dot: false },
    redirect: { label: 'Dialihkan', cls: 'bg-violet-50 text-violet-700 border-violet-200', dot: false },
    scheduled: { label: 'Terbit — belum dibuka', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: true },
    live: { label: 'Terjangkau publik', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: true },
    ended: { label: 'Sudah ditutup', cls: 'bg-slate-100 text-slate-600 border-slate-200', dot: false },
  };
  const m = map[reach.state];
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border', m.cls)}>
      {m.dot && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {m.label}
    </span>
  );
}

function ReachabilityNote({
  reach,
  page,
  multiSchedule,
  boardLink,
}: {
  reach: ReturnType<typeof pageReachability>;
  page: ExistingPage | undefined;
  multiSchedule: boolean;
  boardLink: React.ReactNode;
}) {
  if (reach.state === 'none') {
    return (
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Halaman iklan dibuat otomatis begitu tagihan terverifikasi lunas. {boardLink}
      </p>
    );
  }

  if (reach.state === 'draft') {
    return (
      <div className="text-[11px] leading-relaxed space-y-0.5">
        {reach.overdueSince ? (
          <p className="text-amber-800 font-medium flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-px" />
            <span>
              Seharusnya sudah tayang sejak {formatDate(reach.overdueSince.toISOString())}.
              Responden belum bisa membukanya.
            </span>
          </p>
        ) : (
          <p className="text-slate-500">Belum diterbitkan; jendelanya juga belum dibuka.</p>
        )}
        {boardLink}
      </div>
    );
  }

  if (reach.state === 'redirect') {
    let host = reach.target;
    try { host = new URL(reach.target).host; } catch { /* biarkan apa adanya */ }
    return (
      <p className="text-[11px] text-violet-800 leading-relaxed">
        Pengunjung langsung dialihkan ke <strong className="font-semibold">{host}</strong> —
        isi halaman di bawah tidak pernah terlihat responden.
      </p>
    );
  }

  /**
   * ⚠️ "Jendela aktif", bukan "periode iklan".
   *
   * `survey_pages.publish_*` adalah jendela BERJALAN: `updateScheduleDates`
   * menolak menyinkronkannya selama ada jadwal lain yang memilikinya, dan
   * `cron_activate_extends` yang memajukannya. Untuk 8 order multi-jadwal di
   * produksi ia karena itu hanya memuat jadwal TERAKHIR —
   * `survei-pengguna-mrt-jakarta` tayang 3–16 Jul, jendelanya 15–16 Jul. Tab
   * ini dulu merendernya polos tanpa label, jadi terbaca sebagai periode iklan.
   */
  const window = `${formatDate(page?.publish_start_date)} — ${formatDate(page?.publish_end_date)}`;
  return (
    <div className="text-[11px] text-slate-500 leading-relaxed space-y-0.5">
      <p>
        <span className="font-medium text-slate-600">Jendela aktif:</span> {window}
        {reach.state === 'scheduled' && ' · dibuka pada tanggal itu'}
      </p>
      {multiSchedule && (
        <p className="text-slate-400">
          Order ini punya lebih dari satu jadwal; jendela halaman mengikuti yang sedang tayang.
        </p>
      )}
    </div>
  );
}
