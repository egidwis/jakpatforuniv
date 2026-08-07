import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Clock,
  Loader2, RefreshCw, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
// ─────────────────────────────────────────────────────────────

type BoardView = 'agenda' | 'month' | 'kilat';

const VIEW_LABEL: Record<BoardView, string> = {
  agenda: 'Agenda',
  month: 'Bulan',
  kilat: 'Kilat',
};

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

  const toggleChip = (kind: ChipKind) => {
    setChips((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

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

  return (
    <div className="space-y-4">
      {/* ── Kepala ────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Schedule</h1>
          <p className="text-xs text-slate-500">
            Papan pantau — klik entri untuk membukanya di Submissions.
            {!isLoading && (
              <span className="ml-1 text-slate-400">
                {new Set(entries.map((e) => e.submissionId)).size} order · {entries.length} jadwal
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void load(true)} disabled={isRefreshing}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} /> Muat ulang
        </Button>
      </div>

      {/* ── Tiga angka pekerjaan yang menunggu ─────────────── */}
      {!isLoading && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-red-700">
            <Clock className="w-3.5 h-3.5" /> <strong>{alerts.lateForPayment}</strong> lewat batas bayar
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5" /> <strong>{alerts.paidWithoutPage}</strong> lunas tanpa halaman
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-600">
            <CalendarClock className="w-3.5 h-3.5" /> <strong>{alerts.unscheduled}</strong> belum dijadwalkan
          </span>
        </div>
      )}

      {/* ── Kendali ───────────────────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {(Object.keys(VIEW_LABEL) as BoardView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`px-3 h-7 rounded-md text-xs font-semibold transition-colors ${
                    view === v ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {VIEW_LABEL[v]}
                </button>
              ))}
            </div>

            {view !== 'kilat' && (
              <>
                <div className="inline-flex items-center gap-1 ml-auto">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftPeriod(-1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs font-semibold text-slate-700 min-w-[150px] text-center select-none">
                    {periodLabel}
                  </span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftPeriod(1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setAnchor(view === 'month' ? new Date() : mondayOf(new Date()))}
                  >
                    Hari ini
                  </Button>
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Cari judul / peneliti…"
                    className="h-7 pl-8 text-xs"
                  />
                </div>
              </>
            )}
          </div>

          {view !== 'kilat' && (
            <>
              {services.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-14">Layanan</span>
                  {(['all', ...services] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setService(s)}
                      className={`px-2.5 h-6 rounded-full text-[11px] font-medium border transition-colors capitalize ${
                        service === s
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      {s === 'all' ? 'Semua' : s}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-14">Status</span>
                {CHIP_ORDER.map((kind) => {
                  const count = chipCounts.get(kind) || 0;
                  if (count === 0 && !chips.has(kind)) return null;
                  const token = tokenForChip(kind);
                  const active = chips.has(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => toggleChip(kind)}
                      className={`px-2.5 h-6 rounded-full text-[11px] font-medium border transition-colors ${
                        active
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {token.label} <span className="opacity-60 tabular-nums">{count}</span>
                    </button>
                  );
                })}
                <label className="ml-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCancelled}
                    onChange={(e) => setShowCancelled(e.target.checked)}
                    className="h-3 w-3 accent-slate-600"
                  />
                  tampilkan Batal <span className="tabular-nums opacity-60">{cancelledCount}</span>
                </label>
                {chips.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setChips(new Set())}
                    className="text-[11px] text-blue-600 hover:underline ml-1"
                  >
                    reset
                  </button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Isi ───────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : view === 'kilat' ? (
        <KilatScheduleBoard onOpenSubmission={onOpenSubmission} />
      ) : view === 'month' ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-3">
            <ScheduleMonth
              entries={monthEntries}
              date={anchor}
              onNavigate={setAnchor}
              now={now}
              onOpen={openEntry}
            />
          </CardContent>
        </Card>
      ) : (
        <ScheduleAgenda
          groups={dayGroups}
          unscheduledEntries={unscheduledEntries}
          now={now}
          onOpen={openEntry}
        />
      )}
    </div>
  );
}
