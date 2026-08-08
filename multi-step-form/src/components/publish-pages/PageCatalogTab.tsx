import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronRight, ListFilter, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    PAGE_TYPE_LABEL, formatPageDate, pageAiringToken, pageTypeOf, shortOrderId,
    statusPriority, usesPlaceholderBanner, type PageData, type PageType,
} from './types';

// ─────────────────────────────────────────────────────────────
// Semua Page — katalog, TANPA pemilih periode.
//
// Sumbu tanggal milik papan Schedule: ia mengelompokkan per hari tayang dalam WIB
// dan sudah membaca `survey_pages`. Pemilih Periode di sini dulunya jawaban kedua
// yang lebih lemah — mengurut `created_at` dan menyaring bulan lewat
// `toISOString()`, yaitu UTC, sehingga halaman yang mulai antara 00.00–07.00 WIB
// tanggal 1 mendarat di bulan sebelumnya.
//
// Penggantinya: 100 terbaru, dan pencarian yang dikirim ke server saat admin
// mengetik — jadi katalog 900-an baris tidak pernah ditarik utuh ke klien.
// ─────────────────────────────────────────────────────────────

const COL = {
    id: 'w-[84px] shrink-0 hidden lg:block',
    page: 'flex-1 min-w-0',
    period: 'w-[128px] shrink-0 hidden md:block',
    status: 'w-[124px] shrink-0 flex justify-end',
    stats: 'w-[84px] shrink-0 text-right hidden sm:block',
};

const TYPE_FILTERS: { value: 'all' | PageType; label: string }[] = [
    { value: 'all', label: 'Semua tipe' },
    { value: 'ad', label: PAGE_TYPE_LABEL.ad },
    { value: 'extra', label: PAGE_TYPE_LABEL.extra },
    { value: 'announcement', label: PAGE_TYPE_LABEL.announcement },
];

export function PageCatalogTab({
    pages,
    loading,
    query,
    onQueryChange,
    totalCount,
    actions,
    onSelectPage,
}: {
    pages: PageData[];
    loading: boolean;
    query: string;
    onQueryChange: (q: string) => void;
    totalCount: number | null;
    actions: React.ReactNode;
    onSelectPage: (page: PageData) => void;
}) {
    const [typeFilter, setTypeFilter] = useState<'all' | PageType>('all');
    const now = Date.now();

    const rows = useMemo(() => {
        const filtered = typeFilter === 'all'
            ? pages
            : pages.filter(p => pageTypeOf(p) === typeFilter);
        // Draft dulu, lalu Scheduled, Live, Completed; di dalamnya terbaru dulu.
        return [...filtered].sort((a, b) => {
            const d = statusPriority(a, now) - statusPriority(b, now);
            if (d !== 0) return d;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    }, [pages, typeFilter, now]);

    const typeLabel = TYPE_FILTERS.find(f => f.value === typeFilter)?.label ?? '';

    return (
        <>
            {/* ── Toolbar ── */}
            <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        placeholder="Cari judul, slug, peneliti..."
                        className="w-full pl-9 h-9 text-sm bg-gray-50/50 border-gray-200 focus:bg-white focus:border-blue-500 transition-all"
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-1.5">
                    {typeFilter !== 'all' && (
                        <button
                            onClick={() => setTypeFilter('all')}
                            className="flex items-center gap-1 rounded-full bg-slate-800 text-white text-xs font-medium pl-2.5 pr-1.5 py-1"
                            title="Bersihkan filter tipe"
                        >
                            {typeLabel}
                            <X className="w-3 h-3" />
                        </button>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 hover:text-gray-900"
                                title="Filter tipe halaman"
                            >
                                <ListFilter className="w-4 h-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-gray-400">
                                Tipe halaman
                            </DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                                value={typeFilter}
                                onValueChange={(v) => setTypeFilter(v as 'all' | PageType)}
                            >
                                {TYPE_FILTERS.map(f => (
                                    <DropdownMenuRadioItem key={f.value} value={f.value} className="text-sm cursor-pointer">
                                        {f.label}
                                    </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                            {typeFilter !== 'all' && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setTypeFilter('all')} className="text-sm text-blue-600 cursor-pointer">
                                        Bersihkan filter
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex items-center gap-2">{actions}</div>
            </div>

            {/* ── Satu wilayah gulung ── */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-4 h-10 flex items-center gap-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <span className={COL.id}>ID</span>
                    <span className={COL.page}>Halaman</span>
                    <span className={COL.period}>Periode</span>
                    <span className={cn(COL.status, 'text-right')}>Status</span>
                    <span className={COL.stats}>Statistik</span>
                    <span className="w-4 shrink-0" aria-hidden="true" />
                </div>

                {loading ? (
                    <div className="divide-y divide-gray-100">
                        {Array(8).fill(0).map((_, i) => (
                            <div key={`skeleton-catalog-${i}`} className="flex items-center gap-3 px-4 py-3">
                                <div className="w-[84px] h-4 bg-gray-100 animate-pulse rounded shrink-0 hidden lg:block" />
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
                    <p className="text-center text-sm text-gray-400 py-20">
                        {query.trim()
                            ? 'Tidak ada halaman yang cocok dengan pencarian.'
                            : 'Belum ada halaman.'}
                    </p>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {rows.map(page => {
                            const token = pageAiringToken(page, now);
                            const orderId = shortOrderId(page);
                            const type = pageTypeOf(page);
                            const collects = !!page.submission_id;
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
                                    <span className={cn(COL.id, 'font-mono text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5 truncate')}>
                                        {orderId ?? <span className="text-gray-300">—</span>}
                                    </span>

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
                                                ? <><span className="font-semibold tabular-nums text-gray-700">{page.page_respondents?.[0]?.count ?? 0}</span> resp</>
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

            {/* ── Footer: cacah, bukan paginasi ── */}
            <div className="shrink-0 flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-2.5 bg-white text-xs text-gray-400">
                <span>
                    {query.trim()
                        ? 'Hasil pencarian dari seluruh katalog.'
                        : 'Menampilkan 100 terbaru — ketik untuk mencari seluruh katalog.'}
                </span>
                <span className="tabular-nums shrink-0">
                    {loading
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : `${rows.length}${totalCount !== null ? ` dari ${totalCount}` : ''} halaman`}
                </span>
            </div>
        </>
    );
}
