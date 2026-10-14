import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuLabel,
    DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronLeft, ChevronRight, Copy, EyeOff, ListFilter, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
    PAGE_TYPE_LABEL, formatPageDate, pageAiringToken, pageTypeOf,
    usesPlaceholderBanner, type PageData, type PageType,
} from './types';
import {
    PAGE_STATUS_KEYS, PAGE_STATUS_TOKEN, applyCatalogView, indexCatalog, paginate,
    type CatalogView, type PageStatusKey,
} from './catalogSearch';
import { useBookingCodeMatches, useRespondentCounts } from './useCatalogLookups';

// ─────────────────────────────────────────────────────────────
// Semua Page — katalog, TANPA pemilih periode.
//
// Sumbu tanggal milik papan Schedule: ia mengelompokkan per hari tayang dalam WIB
// dan sudah membaca `survey_pages`. Pemilih Periode di sini dulunya jawaban kedua
// yang lebih lemah — mengurut `created_at` dan menyaring bulan lewat
// `toISOString()`, yaitu UTC, sehingga halaman yang mulai antara 00.00–07.00 WIB
// tanggal 1 mendarat di bulan sebelumnya.
//
// Penggantinya: SELURUH katalog dimuat sekali sebagai indeks ringan, lalu cari,
// saring, dan paginasi berjalan di browser (catalogSearch.ts). Versi sebelumnya
// memuat 100 terbaru dan mencari judul/slug di server — 390 halaman lama hanya
// terjangkau bila admin ingat potongan judulnya, dan ID page, ID order, Booking
// ID, maupun nama peneliti tidak pernah cocok.
//
// Urutannya terbaru dibuat. "Draft dulu" dicabut: dengan paginasi, draft lama
// terkubur di halaman terakhir urutan tanggal ATAU menyumbat halaman pertama —
// saringan Status menjangkaunya tanpa memilih salah satu keburukan itu.
// ─────────────────────────────────────────────────────────────

const COL = {
    id: 'w-[104px] shrink-0 hidden lg:flex items-center',
    page: 'flex-1 min-w-0',
    period: 'w-[128px] shrink-0 hidden md:block',
    status: 'w-[124px] shrink-0 flex justify-end',
    stats: 'w-[84px] shrink-0 text-right hidden sm:block',
};

const TYPE_FILTERS: { value: 'all' | PageType; label: string }[] = [
    { value: 'all', label: 'Semua tipe' },
    { value: 'ad', label: PAGE_TYPE_LABEL.ad },
    { value: 'extra', label: PAGE_TYPE_LABEL.extra },
    { value: 'kilat', label: PAGE_TYPE_LABEL.kilat },
    { value: 'announcement', label: PAGE_TYPE_LABEL.announcement },
];

/** Label saringan = label chip di baris, supaya yang disaring terbaca sama dengan yang tampil. */
const STATUS_FILTERS: { value: 'all' | PageStatusKey; label: string }[] = [
    { value: 'all', label: 'Semua status' },
    ...PAGE_STATUS_KEYS.map(k => ({ value: k, label: PAGE_STATUS_TOKEN[k].label })),
];

const ACTIVE_FILTER_CHIP = 'flex items-center gap-1 rounded-full bg-slate-800 text-white text-xs font-medium pl-2.5 pr-1.5 py-1';

export function PageCatalogTab({
    pages,
    loading,
    loadedAt,
    version,
    view,
    onViewChange,
    actions,
    onSelectPage,
}: {
    pages: PageData[];
    loading: boolean;
    /** `now` bersama untuk chip & saringan status — diambil saat indeks dimuat. */
    loadedAt: number;
    version: number;
    view: CatalogView;
    onViewChange: (patch: Partial<CatalogView>) => void;
    actions: React.ReactNode;
    onSelectPage: (page: PageData) => void;
}) {
    const now = loadedAt;
    const index = useMemo(() => indexCatalog(pages, now), [pages, now]);
    const { matches: codeMatches, pending: lookingUpCodes } = useBookingCodeMatches(view.query);
    const { rows, counts } = useMemo(
        () => applyCatalogView(index, view, codeMatches),
        [index, view, codeMatches],
    );
    const paged = paginate(rows, view.page);
    const respondentCounts = useRespondentCounts(
        useMemo(() => paged.slice.filter(p => p.submission_id).map(p => p.id), [paged.slice]),
        version,
    );

    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => { listRef.current?.scrollTo({ top: 0 }); }, [paged.page]);

    const handleCopyId = (id: string) => {
        if (navigator?.clipboard) {
            navigator.clipboard.writeText(id);
            toast.success('Page ID berhasil disalin!');
        } else {
            toast.error('Gagal menyalin Page ID');
        }
    };

    const hasQuery = view.query.trim() !== '';
    const hasFilter = view.type !== 'all' || view.status !== 'all' || view.hiddenOnly;
    const resetFilters = () => onViewChange({ type: 'all', status: 'all', hiddenOnly: false });
    const typeLabel = TYPE_FILTERS.find(f => f.value === view.type)?.label ?? '';
    const statusLabel = STATUS_FILTERS.find(f => f.value === view.status)?.label ?? '';

    return (
        <>
            {/* ── Toolbar ── */}
            <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-3">
                <div className="relative flex-1 min-w-[220px] max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        placeholder="Cari judul, #ID page/order, Booking ID, peneliti, email, link…"
                        className="w-full pl-9 pr-8 h-9 text-sm bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 transition-all"
                        value={view.query}
                        onChange={(e) => onViewChange({ query: e.target.value })}
                    />
                    {hasQuery && (
                        <button
                            type="button"
                            onClick={() => onViewChange({ query: '' })}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                            title="Kosongkan pencarian"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                'h-9 gap-1.5 text-xs text-gray-600',
                                view.type !== 'all' && 'border-slate-800 bg-slate-50 text-slate-900 font-semibold'
                            )}
                        >
                            <ListFilter className="w-3.5 h-3.5" />
                            Tipe
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel className="text-xs">Saring berdasarkan Tipe</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioGroup
                            value={view.type}
                            onValueChange={(v) => onViewChange({ type: v as 'all' | PageType })}
                        >
                            {TYPE_FILTERS.map(f => (
                                <DropdownMenuRadioItem key={f.value} value={f.value} className="text-xs">
                                    <span className="flex-1">{f.label}</span>
                                    <span className="ml-3 tabular-nums text-gray-400">{counts.type[f.value]}</span>
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                'h-9 gap-1.5 text-xs text-gray-600',
                                view.status !== 'all' && 'border-slate-800 bg-slate-50 text-slate-900 font-semibold'
                            )}
                        >
                            <ListFilter className="w-3.5 h-3.5" />
                            Status
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel className="text-xs">Saring berdasarkan Status</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioGroup
                            value={view.status}
                            onValueChange={(v) => onViewChange({ status: v as 'all' | PageStatusKey })}
                        >
                            {STATUS_FILTERS.map(f => (
                                <DropdownMenuRadioItem key={f.value} value={f.value} className="text-xs">
                                    <span className="flex-1">{f.label}</span>
                                    <span className="ml-3 tabular-nums text-gray-400">{counts.status[f.value]}</span>
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button
                    variant="outline"
                    size="sm"
                    aria-pressed={view.hiddenOnly}
                    onClick={() => onViewChange({ hiddenOnly: !view.hiddenOnly })}
                    className={cn(
                        'h-9 gap-1.5 text-xs text-gray-600',
                        view.hiddenOnly && 'border-slate-800 bg-slate-50 text-slate-900 font-semibold'
                    )}
                    title="Hanya halaman yang disembunyikan dari API Mobile App"
                >
                    <EyeOff className="w-3.5 h-3.5" />
                    Disembunyikan
                    <span className="tabular-nums text-gray-400 font-normal">{counts.hidden}</span>
                </Button>

                <div className="ml-auto flex items-center gap-2">{actions}</div>
            </div>

            {/* ── Saringan aktif ── */}
            {hasFilter && (
                <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-4 pb-2.5 -mt-1">
                    {view.type !== 'all' && (
                        <button onClick={() => onViewChange({ type: 'all' })} className={ACTIVE_FILTER_CHIP} title="Bersihkan filter tipe">
                            {typeLabel}
                            <X className="w-3 h-3" />
                        </button>
                    )}
                    {view.status !== 'all' && (
                        <button onClick={() => onViewChange({ status: 'all' })} className={ACTIVE_FILTER_CHIP} title="Bersihkan filter status">
                            {statusLabel}
                            <X className="w-3 h-3" />
                        </button>
                    )}
                    {view.hiddenOnly && (
                        <button onClick={() => onViewChange({ hiddenOnly: false })} className={ACTIVE_FILTER_CHIP} title="Bersihkan filter disembunyikan">
                            Disembunyikan
                            <X className="w-3 h-3" />
                        </button>
                    )}
                    <button
                        onClick={resetFilters}
                        className="text-xs font-medium text-gray-500 hover:text-gray-900 underline-offset-2 hover:underline px-1"
                    >
                        Reset filter
                    </button>
                </div>
            )}

            {/* ── Satu wilayah gulung ── */}
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
                <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-4 h-10 flex items-center gap-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <span className={COL.id}>Page ID</span>
                    <span className={COL.page}>Halaman</span>
                    <span className={COL.period}>Periode</span>
                    <span className={cn(COL.status, 'text-right')}>Status</span>
                    <span className={COL.stats}>Statistik</span>
                    <span className="w-4 shrink-0" aria-hidden="true" />
                </div>

                {loading && pages.length === 0 ? (
                    <div className="divide-y divide-gray-100">
                        {Array(8).fill(0).map((_, i) => (
                            <div key={`skeleton-catalog-${i}`} className="flex items-center gap-3 px-4 py-3">
                                <div className="w-[104px] h-4 bg-gray-100 animate-pulse rounded shrink-0 hidden lg:block" />
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="h-4 w-3/5 bg-gray-200 animate-pulse rounded" />
                                    <div className="h-2.5 w-2/5 bg-gray-100 animate-pulse rounded" />
                                </div>
                                <div className="w-[128px] h-3 bg-gray-100 animate-pulse rounded shrink-0 hidden md:block" />
                                <div className="h-5 w-20 bg-gray-100 animate-pulse rounded-full shrink-0" />
                            </div>
                        ))}
                    </div>
                ) : rows.length === 0 ? (
                    <div className="flex flex-col items-center text-center px-6 py-20">
                        <p className="text-sm font-medium text-gray-500">
                            {hasQuery || hasFilter ? 'Tidak ada halaman yang cocok.' : 'Belum ada halaman.'}
                        </p>
                        {hasQuery && (
                            <p className="text-xs text-gray-400 mt-1 max-w-sm">
                                {lookingUpCodes
                                    ? 'Masih mencocokkan Booking ID…'
                                    : 'Coba ID order (# + 8 karakter), Booking ID, nama peneliti, atau tempel link halaman.'}
                            </p>
                        )}
                        {hasFilter && (
                            <button
                                onClick={resetFilters}
                                className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline underline-offset-2"
                            >
                                Reset filter
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {paged.slice.map(page => {
                            const token = pageAiringToken(page, now);
                            const type = pageTypeOf(page);
                            const collects = !!page.submission_id;
                            const respondents = respondentCounts.get(page.id);
                            return (
                                <div
                                    key={page.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onSelectPage(page)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            onSelectPage(page);
                                        }
                                    }}
                                    className="group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-gray-50"
                                >
                                    <div className={COL.id}>
                                        <span
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleCopyId(page.id);
                                            }}
                                            className="group/id inline-flex items-center gap-1.5 font-mono text-[11px] text-gray-600 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-200/80 hover:border-blue-200 rounded px-1.5 py-0.5 whitespace-nowrap transition-colors cursor-pointer"
                                            title={`Klik untuk menyalin Page ID (${page.id})`}
                                        >
                                            <span>#{page.id.slice(0, 8)}</span>
                                            <Copy className="w-3 h-3 text-gray-400 group-hover/id:text-blue-600 shrink-0 transition-colors" />
                                        </span>
                                    </div>

                                    <div className={cn(COL.page, 'flex flex-col leading-tight')}>
                                        <span className="truncate text-sm font-semibold text-gray-900" title={page.title}>
                                            {page.title}
                                        </span>
                                        <span className="mt-0.5 truncate font-mono text-[11px] text-gray-500">
                                            /{page.slug}
                                        </span>
                                        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-gray-500">
                                            {page.owner_name
                                                ? `${page.owner_name}${page.form_submissions?.university ? ` · ${page.form_submissions.university}` : ''}`
                                                : PAGE_TYPE_LABEL[type]}
                                            {page.is_hidden && (
                                                <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600" title="Disembunyikan dari API Mobile App">
                                                    <EyeOff className="w-2.5 h-2.5" />
                                                    disembunyikan
                                                </span>
                                            )}
                                            {usesPlaceholderBanner(page) && (
                                                <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700" title="Masih memakai banner bawaan">
                                                    ⚠ banner
                                                </span>
                                            )}
                                        </span>
                                    </div>

                                    <div className={cn(COL.period, 'text-[11px] leading-tight text-gray-500')}>
                                        <span className="block font-medium text-gray-700">
                                            {formatPageDate(page.publish_start_date)}
                                        </span>
                                        <span className="block">
                                            – {formatPageDate(page.publish_end_date)}
                                        </span>
                                    </div>

                                    <div className={COL.status}>
                                        <Chip variant={token.variant} size="sm" dot={token.dot} pulse={token.pulse}>
                                            {token.label}
                                        </Chip>
                                    </div>

                                    <div className={cn(COL.stats, 'text-[11px] leading-tight text-gray-400')}>
                                        <span className="block">
                                            {collects
                                                ? <><span className="font-semibold tabular-nums text-gray-700">{respondents ?? '…'}</span> resp</>
                                                : '— resp'}
                                        </span>
                                        <span className="block">
                                            <span className="font-semibold tabular-nums text-gray-700">
                                                {(page.views_count || 0).toLocaleString('id-ID')}
                                            </span> views
                                        </span>
                                    </div>

                                    <ChevronRight className="w-4 h-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Footer: cacah + paginasi ── */}
            <div className="shrink-0 flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-2.5 bg-white text-xs text-gray-400">
                <span className="flex items-center gap-1.5 tabular-nums min-w-0">
                    {loading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                    <span className="truncate">
                        {paged.total === 0
                            ? `0 dari ${pages.length} halaman`
                            : hasQuery || hasFilter
                                ? `${paged.from}–${paged.to} dari ${paged.total} cocok · ${pages.length} total`
                                : `${paged.from}–${paged.to} dari ${paged.total} halaman`}
                    </span>
                    {lookingUpCodes && (
                        <span className="flex items-center gap-1 shrink-0 text-gray-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Booking ID…
                        </span>
                    )}
                </span>
                <div className="flex items-center gap-2.5 shrink-0">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-lg border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                        onClick={() => onViewChange({ page: paged.page - 1 })}
                        disabled={paged.page <= 1}
                        title="Halaman sebelumnya"
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <div className="text-xs font-semibold text-gray-700 min-w-[64px] text-center tabular-nums">
                        Hal. {paged.page}/{paged.totalPages}
                    </div>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 rounded-lg border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                        onClick={() => onViewChange({ page: paged.page + 1 })}
                        disabled={paged.page >= paged.totalPages}
                        title="Halaman berikutnya"
                    >
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </>
    );
}
