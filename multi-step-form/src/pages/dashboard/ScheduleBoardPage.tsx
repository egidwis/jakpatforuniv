import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, CalendarClock, CalendarDays, CalendarRange, ChevronDown, Clock,
  ListFilter, Loader2, RefreshCw, Search, X, Zap,
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
import { ScheduleAgenda, dayGroupDomId } from './schedule/ScheduleAgenda';
import { AdsWeekBoard } from './schedule/AdsWeekBoard';
import {
  CANCELLED_CHIPS, CHIP_ORDER, chipKindOf, computeAlerts, groupByDay,
  isUnscheduled, matchesFilter, overlapsWindow, tokenForChip,
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
// BENTUKNYA MENGIKUTI DUA HALAMAN YANG SUDAH ADA, bukan gaya ketiga:
//   • kerangka & kolom  → daftar Submissions (satu kartu, header kolom sticky)
//   • pemilih periode   → tabel Transaksi di Finance (Bulan ▾ Tahun ▾, tanpa
//                         panah maju-mundur, ada pilihan "Semua Bulan")
//
// Tidak ada judul halaman. Dua halaman itu juga tidak punya — navigasi kiri
// sudah mengatakan halaman apa ini, dan judul kedua cuma memakan tinggi layar
// yang seharusnya jadi baris data.
// ─────────────────────────────────────────────────────────────

/**
 * Tiga permukaan, tiga pertanyaan yang berbeda:
 *   agenda → "apa yang tayang hari ini / minggu ini"  (daftar per hari)
 *   iklan  → "hari mana yang sudah penuh"             (kapasitas reguler, 4+4/hari)
 *   kilat  → "gelombang mana yang sudah penuh"        (kapasitas Kilat, 2/gelombang)
 *
 * Dua yang terakhir TIDAK bisa digantikan filter layanan di Agenda: filter
 * menyaring baris, sedangkan yang dicari di sana adalah kuota — angka yang tidak
 * pernah muncul sebagai baris.
 */
type BoardView = 'agenda' | 'ads' | 'kilat';

/** Diturunkan, bukan disalin dari Finance — satu daftar nama bulan yang salah ketik sudah cukup. */
const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2000, i, 1))
);

const ALL_MONTHS = -1;

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
  const [month, setMonth] = useState<number>(() => new Date().getMonth());
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [service, setService] = useState<'all' | string>('all');
  const [chips, setChips] = useState<Set<ChipKind>>(() => new Set());
  const [showCancelled, setShowCancelled] = useState(false);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
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

  // Tahun ikut dari data, bukan deret yang dipatok. Order 2027 tidak akan
  // menghilang hanya karena tidak ada yang ingat menambah angkanya di sini.
  const years = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const e of entries) {
      if (e.startDate) set.add(new Date(e.startDate).getFullYear());
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [entries]);

  const filter: FilterState = useMemo(
    () => ({ service, chips, showCancelled, showUnscheduled, query }),
    [service, chips, showCancelled, showUnscheduled, query]
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

  /** `null` = "Semua Bulan": tidak ada jendela, jadi tidak ada yang disaring keluar. */
  const monthWindow = useMemo(() => {
    if (month === ALL_MONTHS) return null;
    return {
      from: new Date(year, month, 1),
      to: new Date(year, month + 1, 0, 23, 59, 59, 999),
    };
  }, [month, year]);

  const unscheduledEntries = useMemo(
    () => filtered.filter(isUnscheduled),
    [filtered]
  );

  const dayGroups = useMemo(
    () => groupByDay(
      filtered.filter((e) =>
        !isUnscheduled(e) && (!monthWindow || overlapsWindow(e, monthWindow.from, monthWindow.to))
      ),
      todayYmd
    ),
    [filtered, monthWindow, todayYmd]
  );

  const shownCount = unscheduledEntries.length + dayGroups.reduce((n, g) => n + g.entries.length, 0);

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
    setShowUnscheduled(false);
  };

  const activeFilterCount =
    chips.size + (service !== 'all' ? 1 : 0) + (showCancelled ? 1 : 0) + (showUnscheduled ? 1 : 0);

  const periodLabel = month === ALL_MONTHS ? 'Semua bulan' : `${MONTHS[month]} ${year}`;

  /**
   * Lompat ke hari ini. Dengan jendela sebulan, membuka papan pada tanggal 20
   * berarti sembilan belas hari lewat yang harus digulung dulu — tombol ini yang
   * menggantikan tombol "Hari ini" milik navigasi mingguan yang sudah dibuang.
   */
  const jumpToToday = () => {
    const t = new Date();
    setMonth(t.getMonth());
    setYear(t.getFullYear());
    // Menunggu satu frame supaya baris bulan yang baru sudah terpasang.
    requestAnimationFrame(() => {
      document.getElementById(dayGroupDomId(toWibYmd(t)))
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  const openEntry = (e: AdScheduleEntry) =>
    onOpenSubmission({
      id: e.submissionId,
      createdAt: e.submissionCreatedAt,
      distributionType: e.distributionType,
    });

  const isAgenda = view === 'agenda';

  return (
    <div className="p-4 pb-0 md:px-6 md:pt-4 md:pb-0 flex-1 min-h-0 flex flex-col">

      {/* ── Tab DI LUAR kartu, seperti Transaksi | Wallet di Finance ──
          Ketiganya bukan tiga tampilan dari data yang sama, melainkan tiga
          permukaan dengan periode dan kendalinya masing-masing. Menaruhnya di
          luar membuat itu jujur: yang berganti seluruh kartunya, bukan isi tabel
          di dalam kerangka yang sama. */}
      <div className="shrink-0 flex items-center border-b border-gray-200 mb-4">
        {([
          ['agenda', 'Agenda', CalendarDays],
          ['ads', 'Iklan', CalendarRange],
          ['kilat', 'Kilat', Zap],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 -mb-px text-sm font-semibold border-b-2 transition-colors',
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

      <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">

        {/* ── Toolbar: periode · pencarian · pil pekerjaan · filter · muat ulang.
            Tidak dirender di tab Kilat: papan itu memuat datanya sendiri, jadi
            tombol muat ulang di sini tidak akan menyegarkan apa pun yang terlihat
            — dan tombol yang berbohong lebih buruk daripada tombol yang absen. */}
        {view !== 'kilat' && (
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-3">
          {isAgenda && (
            <>
              {/* Pemilih periode bergaya Finance: dua select tanpa bingkai,
                  dipisah garis tipis. Tanpa panah maju-mundur — melompat ke
                  Desember tidak perlu empat klik. */}
              <div className="flex items-center gap-1">
                <div className="relative">
                  <select
                    className="h-8 pl-2 pr-7 text-sm font-semibold bg-transparent border-0 rounded-md focus:outline-none focus:ring-0 appearance-none cursor-pointer hover:bg-gray-50 transition-colors text-gray-700"
                    value={month}
                    onChange={(e) => setMonth(parseInt(e.target.value))}
                  >
                    <option value={ALL_MONTHS}>Semua Bulan</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                </div>
                <div className="w-px h-4 bg-gray-200" />
                <div className="relative">
                  <select
                    className="h-8 pl-2 pr-7 text-sm font-semibold bg-transparent border-0 rounded-md focus:outline-none focus:ring-0 appearance-none cursor-pointer hover:bg-gray-50 transition-colors text-gray-700 disabled:opacity-40"
                    value={year}
                    onChange={(e) => setYear(parseInt(e.target.value))}
                    disabled={month === ALL_MONTHS}
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2.5 text-xs font-medium text-gray-500 hover:text-blue-700"
                  onClick={jumpToToday}
                  title="Lompat ke hari ini"
                >
                  Hari ini
                </Button>
              </div>

              <div className="flex-1 min-w-[200px] max-w-md relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Cari judul survei atau peneliti..."
                  className="w-full pl-9 bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 transition-all h-9 text-sm"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Tiga angka pekerjaan yang menunggu — SEKALIGUS pintu masuknya.
              Dihitung atas SELURUH data, bukan periode yang sedang dilihat:
              pekerjaan bulan lalu tidak boleh hilang karena admin ganti bulan.
              Pil "belum dijadwalkan" adalah satu-satunya jalan menuju order tanpa
              tanggal sejak bloknya tidak lagi tampil otomatis — empat di antaranya
              sudah lunas, dan tidak ada layar lain yang menampilkannya. */}
          {!isLoading && isAgenda && (
            <div className="flex flex-wrap items-center gap-2 text-xs ml-auto">
              <AlertPill
                icon={Clock}
                count={alerts.lateForPayment}
                label="lewat batas bayar"
                tone="red"
              />
              <AlertPill
                icon={AlertTriangle}
                count={alerts.paidWithoutPage}
                label="lunas tanpa halaman"
                tone="amber"
              />
              <AlertPill
                icon={CalendarClock}
                count={alerts.unscheduled}
                label="belum dijadwalkan"
                tone="slate"
                active={showUnscheduled}
                onClick={() => setShowUnscheduled((v) => !v)}
              />
            </div>
          )}

          {isAgenda && (
            <div className="flex items-center gap-1.5">
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
                    checked={showUnscheduled}
                    onCheckedChange={(v) => setShowUnscheduled(!!v)}
                    onSelect={(e) => e.preventDefault()}
                    className="text-sm cursor-pointer"
                  >
                    <span className="flex-1">Belum dijadwalkan</span>
                    <span className="text-xs text-gray-400 tabular-nums">{alerts.unscheduled}</span>
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={showCancelled}
                    onCheckedChange={(v) => setShowCancelled(!!v)}
                    onSelect={(e) => e.preventDefault()}
                    className="text-sm cursor-pointer"
                  >
                    <span className="flex-1">Batal</span>
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

          <Button
            onClick={() => void load(true)}
            variant="ghost"
            size="icon"
            disabled={isRefreshing || isLoading}
            className={cn('h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50', !isAgenda && 'ml-auto')}
            title="Muat ulang"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </Button>
        </div>
        )}

        {/* ── Isi — satu wilayah gulung, supaya header kolom & pita hari sticky ── */}
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
          ) : isAgenda ? (
            <ScheduleAgenda
              groups={dayGroups}
              unscheduledEntries={showUnscheduled ? unscheduledEntries : []}
              now={now}
              onOpen={openEntry}
            />
          ) : view === 'ads' ? (
            <div className="p-4">
              {/* Sengaja `entries`, bukan `filtered`: papan kapasitas harus
                  menghitung SEMUA yang menahan slot. Menyaringnya dengan filter
                  status akan menghasilkan "2/4" pada hari yang sebenarnya penuh. */}
              <AdsWeekBoard entries={entries} now={now} onOpen={openEntry} />
            </div>
          ) : (
            <div className="p-4">
              <KilatScheduleBoard onOpenSubmission={onOpenSubmission} embedded />
            </div>
          )}
        </div>

        {/* ── Footer — cacah, bukan paginasi. Papan ini memuat semuanya sekali. ── */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-2.5 bg-white text-xs text-gray-400">
          <span>
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isAgenda ? (
              <>Menampilkan {shownCount} jadwal · {periodLabel}</>
            ) : view === 'ads' ? (
              'Iklan reguler — tayang 15.00 WIB, 4 reguler + 4 tambahan per hari'
            ) : (
              'Gelombang Kilat — 8/11/14/17 WIB, 2 order per gelombang, Senin–Jumat'
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

/**
 * Pil pekerjaan-menunggu. Yang punya `onClick` juga jadi sakelar filter — angka
 * yang tidak bisa diklik hanya membuat admin bertanya "yang mana?" tanpa jawaban.
 */
function AlertPill({
  icon: Icon, count, label, tone, active, onClick,
}: {
  icon: typeof Clock;
  count: number;
  label: string;
  tone: 'red' | 'amber' | 'slate';
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClass = {
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    slate: 'border-gray-200 bg-gray-50 text-gray-600',
  }[tone];

  const content = (
    <>
      <Icon className="w-3.5 h-3.5" /> <strong>{count}</strong> {label}
    </>
  );

  if (!onClick) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5', toneClass)}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? 'Sembunyikan order tanpa jadwal' : 'Tampilkan order tanpa jadwal'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors',
        active ? 'border-slate-800 bg-slate-800 text-white' : cn(toneClass, 'hover:border-gray-400')
      )}
    >
      {content}
    </button>
  );
}
