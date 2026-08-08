import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, CalendarClock, CalendarDays, CalendarRange, ChevronLeft, ChevronRight,
  Clock, ListFilter, Loader2, RefreshCw, Search, X, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { KilatScheduleBoard } from '@/components/KilatScheduleBoard';
import { fetchAdSchedules, type AdScheduleEntry } from '@/utils/supabase';
import { toWibYmd } from '@/utils/airing-window';
import { ScheduleAgenda } from './schedule/ScheduleAgenda';
import { ScheduleMonth } from './schedule/ScheduleMonth';
import {
  CANCELLED_CHIPS, CHIP_ORDER, addDays, chipKindOf, computeAlerts, groupByDay,
  isUnscheduled, matchesFilter, mondayOf, overlapsWindow, tokenForChip,
  type ChipKind, type FilterState,
} from './schedule/scheduleModel';

// ─────────────────────────────────────────────────────────────
// Papan Schedule — PAPAN PANTAU, BUKAN TEMPAT KERJA.
//
// Nol aksi di sini, dan itu keputusan, bukan kekurangan. Penjadwalan dan
// pembayaran tetap di drawer Submissions, karena rute review manual adalah satu
// percakapan dengan peneliti dari feedback sampai tagihan. Papan ini melayani
// rute yang satunya: order auto-approval yang membayar sendiri lewat DOKU dan
// tidak pernah lewat percakapan admin — di situ pertanyaannya "mana yang lunas
// tapi halamannya belum dibuat", dan itu pertanyaan pantau.
//
// Karena tidak ada aksi, tidak ada tulisan. Cermin ad_schedules tetap satu arah
// dan papan ini tidak pernah mencoba menulisnya.
//
// BENTUKNYA MENGIKUTI DAFTAR SUBMISSIONS: satu kartu berisi toolbar, tab,
// header kolom, baris, dan footer — bukan tumpukan kartu mengambang. Dua
// permukaan yang menampilkan order yang sama tidak boleh terlihat seperti dua
// produk. Yang ditiru bentuknya, bukan isinya: papan ini tidak punya checkbox,
// tidak punya aksi massal, dan tidak punya paginasi.
// ─────────────────────────────────────────────────────────────

type BoardView = 'agenda' | 'month' | 'kilat';

const VIEWS: ReadonlyArray<readonly [BoardView, string, typeof CalendarDays]> = [
  ['agenda', 'Agenda', CalendarDays],
  ['month', 'Bulan', CalendarRange],
  ['kilat', 'Kilat', Zap],
];

const SERVICE_LABEL: Record<string, string> = { all: 'Semua layanan', kilat: 'Kilat', regular: 'Regular' };
const serviceLabel = (s: string) => SERVICE_LABEL[s] ?? s;

export function ScheduleBoardPage({
  onOpenSubmission,
}: {
  onOpenSubmission: (params: { id: string; createdAt: string; distributionType?: string | null }) => void;
}) {
  const [entries, setEntries] = useState<AdScheduleEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [view, setView] = useState<BoardView>('agenda');
  const [anchor, setAnchor] = useState<Date>(() => mondayOf(new Date()));
  const [service, setService] = useState<'all' | string>('all');
  const [chips, setChips] = useState<Set<ChipKind>>(() => new Set());
  const [showCancelled, setShowCancelled] = useState(false);
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    try {
      const rows = await fetchAdSchedules();
      setEntries(rows);
      setNow(Date.now());
    } catch (e) {
      console.error('Gagal memuat papan Schedule:', e);
      toast.error('Gagal memuat papan Schedule.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const todayYmd = toWibYmd(new Date(now));

  // Jalur distribusi DITURUNKAN DARI DATA, bukan daftar yang dipatok di kode.
  // Produk JFU berikutnya akan muncul di filter ini tanpa menyentuh berkas ini.
  const services = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.distributionType || 'regular');
    return Array.from(set).sort();
  }, [entries]);

  const filter: FilterState = useMemo(
    () => ({ service, chips, showCancelled, query }),
    [service, chips, showCancelled, query]
  );

  const filtered = useMemo(
    () => entries.filter((e) => matchesFilter(e, filter, now)),
    [entries, filter, now]
  );

  const chipCounts = useMemo(() => {
    const counts = new Map<ChipKind, number>();
    for (const e of entries) {
      // Dihitung sebelum filter chip diterapkan, tapi SESUDAH filter layanan dan
      // pencarian — supaya angkanya menjawab "kalau kupilih ini, berapa yang
      // muncul", bukan angka global yang tidak berhubungan dengan layar.
      if (service !== 'all' && (e.distributionType || 'regular') !== service) continue;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        if (!e.title.toLowerCase().includes(q) && !e.researcherName.toLowerCase().includes(q)) continue;
      }
      const kind = chipKindOf(e, now);
      counts.set(kind, (counts.get(kind) || 0) + 1);
    }
    return counts;
  }, [entries, service, query, now]);

  const cancelledCount = useMemo(
    () => CANCELLED_CHIPS.reduce((sum, k) => sum + (chipCounts.get(k) || 0), 0),
    [chipCounts]
  );

  const alerts = useMemo(() => computeAlerts(entries, now), [entries, now]);

  const windowFrom = view === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth(), 1) : anchor;
  const windowTo = view === 'month'
    ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59)
    : addDays(anchor, 6);

  const unscheduledEntries = useMemo(
    () => filtered.filter(isUnscheduled),
    [filtered]
  );

  const dayGroups = useMemo(
    () => groupByDay(filtered.filter((e) => !isUnscheduled(e) && overlapsWindow(e, windowFrom, windowTo)), todayYmd),
    [filtered, windowFrom, windowTo, todayYmd]
  );

  const monthEntries = useMemo(
    () => filtered.filter((e) => !isUnscheduled(e)),
    [filtered]
  );

  const shownCount = view === 'month'
    ? monthEntries.length
    : unscheduledEntries.length + dayGroups.reduce((n, g) => n + g.entries.length, 0);

  const toggleChip = (kind: ChipKind) => {
    setChips((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const resetFilters = () => {
    setChips(new Set());
    setService('all');
    setShowCancelled(false);
  };

  const activeFilterCount =
    chips.size + (service !== 'all' ? 1 : 0) + (showCancelled ? 1 : 0);

  const periodLabel = view === 'month'
    ? anchor.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
    : `${windowFrom.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${windowTo.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const shiftPeriod = (dir: -1 | 1) => {
    setAnchor((prev) =>
      view === 'month'
        ? new Date(prev.getFullYear(), prev.getMonth() + dir, 1)
        : addDays(prev, dir * 7)
    );
  };

  const openEntry = (e: AdScheduleEntry) =>
    onOpenSubmission({
      id: e.submissionId,
      createdAt: e.submissionCreatedAt,
      distributionType: e.distributionType,
    });

  const hasPeriodNav = view !== 'kilat';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* ── Kepala ────────────────────────────────────────── */}
      <div className="shrink-0 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Schedule</h1>
          <p className="text-xs text-gray-500">
            Papan pantau — klik entri untuk membukanya di Submissions.
          </p>
        </div>

        {/* Tiga angka pekerjaan yang menunggu. Dihitung atas SELURUH data, bukan
            periode yang sedang dilihat — pekerjaan minggu lalu tidak boleh
            hilang hanya karena admin menggeser periode. */}
        {!isLoading && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-red-700">
              <Clock className="w-3.5 h-3.5" /> <strong>{alerts.lateForPayment}</strong> lewat batas bayar
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5" /> <strong>{alerts.paidWithoutPage}</strong> lunas tanpa halaman
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-gray-600">
              <CalendarClock className="w-3.5 h-3.5" /> <strong>{alerts.unscheduled}</strong> belum dijadwalkan
            </span>
          </div>
        )}
      </div>

      {/* ── Satu permukaan: toolbar, tab, header kolom, baris, footer ───── */}
      <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden">

        {/* Toolbar baris 1: periode · pencarian · muat ulang */}
        <div className="shrink-0 flex items-center gap-4 px-4 py-3">
          {hasPeriodNav && (
            <>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftPeriod(-1)}>
                  <ChevronLeft className="h-4 w-4 text-gray-600" />
                </Button>
                <h2 className="text-sm font-semibold min-w-[150px] text-center text-gray-700 select-none">
                  {periodLabel}
                </h2>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => shiftPeriod(1)}>
                  <ChevronRight className="h-4 w-4 text-gray-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs font-medium text-gray-600"
                  onClick={() => setAnchor(view === 'month' ? new Date() : mondayOf(new Date()))}
                >
                  Hari ini
                </Button>
              </div>
              <div className="flex-1 max-w-md relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Cari judul survei atau peneliti..."
                  className="w-full pl-9 bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 transition-all h-9 text-sm"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {query && (
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {shownCount} hasil
                </span>
              )}
            </>
          )}
          <Button
            onClick={() => void load(true)}
            variant="ghost"
            size="icon"
            disabled={isRefreshing || isLoading}
            className="ml-auto h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
            title="Muat ulang"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </Button>
        </div>

        {/* Toolbar baris 2: tab tampilan + filter */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 border-b border-gray-200 min-h-[44px]">
          <div className="flex">
            {VIEWS.map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 -mb-px text-sm font-medium border-b-2 transition-colors',
                  view === id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Filter status/layanan dilipat ke satu menu — persis pola Submissions.
              Cacahnya tidak hilang, ia pindah ke dalam menu di sebelah tiap
              pilihan, jadi "berapa yang menunggu review" tetap terjawab. */}
          {view !== 'kilat' && (
            <div className="flex items-center gap-1.5 pb-1">
              {activeFilterCount > 0 && (
                <button
                  onClick={resetFilters}
                  className="flex items-center gap-1 rounded-full bg-slate-800 text-white text-xs font-medium pl-2.5 pr-1.5 py-1"
                  title="Bersihkan semua filter"
                >
                  {activeFilterCount === 1 && service !== 'all'
                    ? serviceLabel(service)
                    : activeFilterCount === 1 && chips.size === 1
                      ? tokenForChip(Array.from(chips)[0]).label
                      : `${activeFilterCount} filter`}
                  <X className="w-3 h-3" />
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-500 hover:text-gray-900"
                    title="Filter layanan & status"
                  >
                    <ListFilter className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 max-h-[70vh] overflow-y-auto">
                  {services.length > 1 && (
                    <>
                      <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-gray-400">
                        Layanan
                      </DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={service} onValueChange={setService}>
                        {(['all', ...services] as const).map((s) => (
                          <DropdownMenuRadioItem key={s} value={s} className="text-sm capitalize cursor-pointer">
                            {serviceLabel(s)}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-gray-400">
                    Status
                  </DropdownMenuLabel>
                  {CHIP_ORDER.map((kind) => {
                    const count = chipCounts.get(kind) || 0;
                    if (count === 0 && !chips.has(kind)) return null;
                    return (
                      <DropdownMenuCheckboxItem
                        key={kind}
                        checked={chips.has(kind)}
                        onCheckedChange={() => toggleChip(kind)}
                        onSelect={(e) => e.preventDefault()}
                        className="text-sm cursor-pointer"
                      >
                        <span className="flex-1">{tokenForChip(kind).label}</span>
                        <span className="text-xs text-gray-400 tabular-nums">{count}</span>
                      </DropdownMenuCheckboxItem>
                    );
                  })}

                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={showCancelled}
                    onCheckedChange={(v) => setShowCancelled(!!v)}
                    onSelect={(e) => e.preventDefault()}
                    className="text-sm cursor-pointer"
                  >
                    <span className="flex-1">Tampilkan Batal</span>
                    <span className="text-xs text-gray-400 tabular-nums">{cancelledCount}</span>
                  </DropdownMenuCheckboxItem>

                  {activeFilterCount > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={resetFilters} className="text-sm text-blue-600 cursor-pointer">
                        Bersihkan filter
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Isi — satu wilayah gulung, supaya header kolom & pita hari bisa sticky */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <>
              <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 h-10" />
              <div className="divide-y divide-gray-100">
                {Array(8).fill(0).map((_, i) => (
                  <div key={`skeleton-schedule-${i}`} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-[58px] h-3 bg-gray-200 animate-pulse rounded shrink-0" />
                    <div className="w-[84px] h-4 bg-gray-100 animate-pulse rounded shrink-0 hidden lg:block" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="h-4 w-3/5 bg-gray-200 animate-pulse rounded" />
                      <div className="h-2.5 w-2/5 bg-gray-100 animate-pulse rounded" />
                    </div>
                    <div className="w-[132px] h-3 bg-gray-100 animate-pulse rounded shrink-0 hidden md:block" />
                    <div className="h-5 w-20 bg-gray-100 animate-pulse rounded-full shrink-0" />
                  </div>
                ))}
              </div>
            </>
          ) : view === 'kilat' ? (
            <div className="p-4">
              <KilatScheduleBoard onOpenSubmission={onOpenSubmission} embedded />
            </div>
          ) : view === 'month' ? (
            <div className="p-3">
              <ScheduleMonth
                entries={monthEntries}
                date={anchor}
                onNavigate={setAnchor}
                now={now}
                onOpen={openEntry}
              />
            </div>
          ) : (
            <ScheduleAgenda
              groups={dayGroups}
              unscheduledEntries={unscheduledEntries}
              now={now}
              onOpen={openEntry}
            />
          )}
        </div>

        {/* Footer — cacah, bukan paginasi. Papan ini memuat semuanya sekali. */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-2.5 bg-white text-xs text-gray-400">
          <span>
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : view === 'kilat' ? (
              'Gelombang Kilat — 8/11/14/17 WIB, Senin–Jumat'
            ) : (
              <>Menampilkan {shownCount} jadwal{view === 'agenda' ? ` · ${periodLabel}` : ''}</>
            )}
          </span>
          {!isLoading && (
            <span className="tabular-nums">
              {new Set(entries.map((e) => e.submissionId)).size} order · {entries.length} jadwal
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
