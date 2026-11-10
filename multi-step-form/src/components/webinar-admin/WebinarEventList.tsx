import { useMemo, useState } from 'react';
import {
    AlertTriangle, Calendar, ImageIcon, MoreHorizontal, Plus, RefreshCw, Search, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
    adminDateLabel, seatsSummary, soldLabel, zoomWarning, type AdminWebinarEvent,
} from '@/utils/webinarAdmin';

const TONE_CLASS: Record<string, string> = {
    on_sale: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    soon: 'bg-amber-50 text-amber-700 ring-amber-200',
    held: 'bg-orange-50 text-orange-700 ring-orange-200',
    ended: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export interface WebinarListActions {
    onEdit: (event: AdminWebinarEvent) => void;
    onParticipants: (event: AdminWebinarEvent) => void;
    onPreview: (event: AdminWebinarEvent) => void;
    onCopyLink: (event: AdminWebinarEvent) => void;
    onCloseSales: (event: AdminWebinarEvent) => void;
    onCancel: (event: AdminWebinarEvent) => void;
    onDelete: (event: AdminWebinarEvent) => void;
}

type StatusTab = 'all' | 'on_sale' | 'soon' | 'closed' | 'draft';

const GRID_TEMPLATE = '[display:grid] grid-cols-[minmax(240px,1.5fr)_180px_100px_130px_190px] items-center gap-4 min-w-[860px]';

export function WebinarEventList({
    events,
    loading,
    error,
    onCreate,
    onRetry,
    actions,
}: {
    events: AdminWebinarEvent[];
    loading: boolean;
    error: string | null;
    onCreate: () => void;
    onRetry: () => void;
    actions: WebinarListActions;
}) {
    const [activeTab, setActiveTab] = useState<StatusTab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const now = Date.now();

    const counts = useMemo(() => ({
        all: events.length,
        on_sale: events.filter((e) => e.status === 'published' && e.view.tone === 'on_sale').length,
        soon: events.filter((e) => e.status === 'published' && e.view.tone === 'soon').length,
        closed: events.filter((e) => e.status === 'cancelled' || (e.status === 'published' && e.view.tone !== 'on_sale' && e.view.tone !== 'soon')).length,
        draft: events.filter((e) => e.status === 'draft').length,
    }), [events]);

    const tabs: { id: StatusTab; label: string; count: number }[] = [
        { id: 'all', label: 'Semua', count: counts.all },
        { id: 'on_sale', label: 'Dijual', count: counts.on_sale },
        { id: 'soon', label: 'Segera', count: counts.soon },
        { id: 'closed', label: 'Ditutup', count: counts.closed },
        { id: 'draft', label: 'Draft', count: counts.draft },
    ];

    const filteredEvents = useMemo(() => {
        return events.filter((e) => {
            if (activeTab === 'on_sale' && !(e.status === 'published' && e.view.tone === 'on_sale')) return false;
            if (activeTab === 'soon' && !(e.status === 'published' && e.view.tone === 'soon')) return false;
            if (activeTab === 'closed' && !(e.status === 'cancelled' || (e.status === 'published' && e.view.tone !== 'on_sale' && e.view.tone !== 'soon'))) return false;
            if (activeTab === 'draft' && e.status !== 'draft') return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchTitle = (e.title || '').toLowerCase().includes(q);
                const matchSpeaker = (e.speakers || []).some((s) => s.name?.toLowerCase().includes(q));
                const matchSlug = (e.slug || '').toLowerCase().includes(q);
                if (!matchTitle && !matchSpeaker && !matchSlug) return false;
            }
            return true;
        });
    }, [events, activeTab, searchQuery]);

    return (
        <div className="p-4 pb-0 md:px-6 md:pt-4 md:pb-0 flex-1 min-h-0 flex flex-col">
            {/* Unified list surface (mirrors Transactions & Customers pattern) */}
            <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden mb-4 shadow-xs">
                {/* Toolbar */}
                <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-white">
                    {/* Status Tabs */}
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer',
                                    activeTab === tab.id
                                        ? 'bg-slate-800 text-white shadow-xs'
                                        : 'bg-white text-gray-600 border border-gray-200/80 hover:bg-gray-50 hover:text-gray-900'
                                )}
                            >
                                <span>{tab.label}</span>
                                <span
                                    className={cn(
                                        'px-1.5 py-0.2 rounded-md text-[10px] font-bold min-w-[18px] text-center',
                                        activeTab === tab.id ? 'bg-slate-700 text-white' : 'bg-gray-100 text-gray-500'
                                    )}
                                >
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Search & Actions */}
                    <div className="flex items-center gap-2 ml-auto">
                        <div className="relative w-44 sm:w-60">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                            <Input
                                type="text"
                                placeholder="Cari acara..."
                                className="w-full pl-8 pr-7 h-8 text-xs bg-gray-50/60 border-gray-200 focus:bg-white focus:border-blue-500 rounded-lg"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                                    title="Bersihkan pencarian"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <Button
                            onClick={onRetry}
                            variant="ghost"
                            size="icon"
                            disabled={loading}
                            className="h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                            title="Muat ulang data"
                        >
                            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                        </Button>

                        <Button
                            onClick={onCreate}
                            size="sm"
                            className="h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg gap-1.5 shadow-xs cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Buat Acara</span>
                        </Button>
                    </div>
                </div>

                {/* Rows & Header scrollable container */}
                <div className="flex-1 min-h-0 overflow-auto">
                    {/* Sticky Table Header */}
                    <div className={cn('sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-4 h-9 text-[11px] font-bold text-gray-500 uppercase tracking-wider', GRID_TEMPLATE)}>
                        <span>Acara</span>
                        <span>Jadwal Pelaksanaan</span>
                        <span className="text-center">Status</span>
                        <span className="text-right">Terjual / Kuota</span>
                        <span className="text-right pr-1">Aksi</span>
                    </div>

                    {loading ? (
                        <div className="divide-y divide-gray-100 min-w-[860px]">
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} className={cn('px-4 py-3.5 animate-pulse', GRID_TEMPLATE)}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-16 h-10 rounded-lg bg-gray-100 shrink-0" />
                                        <div className="flex-1 space-y-1.5 min-w-0">
                                            <div className="h-4 bg-gray-200 rounded w-3/4" />
                                            <div className="h-3 bg-gray-100 rounded w-1/2" />
                                        </div>
                                    </div>
                                    <div className="h-4 bg-gray-100 rounded w-32" />
                                    <div className="h-6 bg-gray-100 rounded-full w-20 mx-auto" />
                                    <div className="h-4 bg-gray-100 rounded w-20 ml-auto" />
                                    <div className="h-7 bg-gray-100 rounded w-36 ml-auto" />
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="p-8 text-center">
                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50 text-red-600 mb-3">
                                <AlertTriangle className="w-6 h-6" />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900 mb-1">Gagal memuat webinar</h3>
                            <p className="text-xs text-red-600 max-w-sm mx-auto mb-4">{error}</p>
                            <Button onClick={onRetry} variant="outline" size="sm" className="h-8 text-xs font-semibold">
                                Coba Lagi
                            </Button>
                        </div>
                    ) : filteredEvents.length === 0 ? (
                        <div className="py-16 text-center">
                            <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-50 rounded-full mb-3 text-gray-400">
                                <Calendar className="w-6 h-6 stroke-[1.75]" />
                            </div>
                            <h3 className="text-base font-semibold text-gray-900 mb-1">
                                {searchQuery || activeTab !== 'all' ? 'Tidak ada acara yang cocok' : 'Belum ada acara'}
                            </h3>
                            <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4 leading-relaxed">
                                {searchQuery || activeTab !== 'all'
                                    ? 'Coba ubah kata kunci pencarian atau pilih tab filter status yang lain.'
                                    : 'Buat acara webinar atau video kelas pertama untuk mulai membuka pendaftaran.'}
                            </p>
                            {!searchQuery && activeTab === 'all' && (
                                <Button
                                    onClick={onCreate}
                                    size="sm"
                                    className="h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg gap-1.5 shadow-xs"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Buat Acara Baru</span>
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100 min-w-[860px]">
                            {filteredEvents.map((event) => {
                                const seats = seatsSummary(event.webinar_offer_state);
                                const isDraft = event.status === 'draft';
                                const isPublished = event.status === 'published';
                                const badge = isDraft ? 'Draft' : event.view.badge;
                                const tone = isDraft ? 'ended' : event.view.tone;
                                const note = event.view.state === 'coming_soon' ? event.view.note : null;
                                const replay = event.offer_kind === 'replay';
                                const participants = (event.sold_live ?? seats.sold) + (event.sold_replay ?? 0);
                                const dateLine = replay ? event.view.recorded_label : event.starts_at ? adminDateLabel(event.starts_at) : null;
                                const hasZoomWarn = zoomWarning(event, now);
                                const quota = event.quota;
                                const sold = event.sold_live ?? seats.sold ?? 0;
                                const soldPercent = quota && quota > 0 ? Math.min(100, Math.round((sold / quota) * 100)) : null;

                                return (
                                    <div
                                        key={event.id}
                                        onClick={() => actions.onEdit(event)}
                                        className={cn('group px-4 py-3 hover:bg-slate-50/80 transition-colors cursor-pointer', GRID_TEMPLATE)}
                                    >
                                        {/* Kolom 1: Poster Thumbnail & Title */}
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-16 h-10 rounded-lg overflow-hidden shrink-0 bg-slate-100 border border-slate-200/80 flex items-center justify-center">
                                                {event.poster_url ? (
                                                    <img
                                                        src={event.poster_url}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <ImageIcon className="w-4 h-4 text-slate-300" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <p
                                                        className="font-semibold text-sm text-slate-900 group-hover:text-blue-600 transition-colors truncate"
                                                        title={event.title}
                                                    >
                                                        {event.title}
                                                    </p>
                                                    {replay && (
                                                        <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                                                            Video kelas
                                                        </span>
                                                    )}
                                                    {event.is_test && (
                                                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                                                            UJI
                                                        </span>
                                                    )}
                                                </div>
                                                {hasZoomWarn && (
                                                    <p className="flex items-center gap-1 text-[11px] font-medium text-amber-700 mt-0.5">
                                                        <AlertTriangle className="h-3 w-3 shrink-0" /> Link Zoom belum diisi
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Kolom 2: Jadwal Pelaksanaan */}
                                        <div className="min-w-0 text-xs font-medium text-slate-700 truncate" title={dateLine || ''}>
                                            {dateLine || '—'}
                                        </div>

                                        {/* Kolom 3: Status */}
                                        <div className="text-center min-w-0">
                                            <span
                                                className={cn(
                                                    'inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                                                    TONE_CLASS[tone] ?? TONE_CLASS.ended
                                                )}
                                            >
                                                {badge}
                                            </span>
                                            {note && (
                                                <p className="text-[10px] text-slate-400 mt-0.5 truncate" title={note}>
                                                    {note}
                                                </p>
                                            )}
                                        </div>

                                        {/* Kolom 4: Terjual / Kuota */}
                                        <div className="text-right min-w-0">
                                            <span className="text-xs font-semibold text-slate-800 tabular-nums">
                                                {isDraft ? '—' : soldLabel(event)}
                                            </span>
                                            {soldPercent !== null && (
                                                <div className="flex items-center justify-end gap-1.5 mt-1">
                                                    <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={cn(
                                                                'h-full rounded-full transition-all',
                                                                soldPercent >= 100 ? 'bg-emerald-500' : 'bg-blue-600'
                                                            )}
                                                            style={{ width: `${soldPercent}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 tabular-nums">{soldPercent}%</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Kolom 5: Aksi */}
                                        <div className="flex items-center justify-end gap-1.5 pr-1 min-w-0">
                                            {!isDraft && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 text-xs px-2.5 font-medium rounded-lg border-gray-200 text-gray-700 hover:text-blue-600 hover:bg-blue-50 cursor-pointer shrink-0"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        actions.onParticipants(event);
                                                    }}
                                                >
                                                    Peserta ({participants})
                                                </Button>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-7 text-xs px-2.5 font-medium rounded-lg border-gray-200 text-gray-700 hover:text-blue-600 hover:bg-blue-50 cursor-pointer shrink-0"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    actions.onEdit(event);
                                                }}
                                            >
                                                {event.status === 'cancelled' ? 'Lihat' : 'Edit'}
                                            </Button>

                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 rounded-lg text-gray-500 hover:text-gray-900 cursor-pointer shrink-0"
                                                        aria-label="Aksi lain"
                                                    >
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48 bg-white border border-gray-200 shadow-md rounded-xl p-1 z-50">
                                                    <DropdownMenuItem
                                                        className="text-xs cursor-pointer py-1.5"
                                                        onSelect={() => actions.onPreview(event)}
                                                    >
                                                        Pratinjau
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        className="text-xs cursor-pointer py-1.5"
                                                        onSelect={() => actions.onCopyLink(event)}
                                                    >
                                                        {isDraft ? 'Salin link pratinjau' : 'Salin link'}
                                                    </DropdownMenuItem>
                                                    {isPublished && event.sales_mode !== 'closed' && (
                                                        <DropdownMenuItem
                                                            className="text-xs cursor-pointer py-1.5"
                                                            onSelect={() => actions.onCloseSales(event)}
                                                        >
                                                            Tutup penjualan
                                                        </DropdownMenuItem>
                                                    )}
                                                    {isPublished && !replay && (
                                                        <>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                className="text-xs cursor-pointer py-1.5 text-red-600 focus:text-red-700"
                                                                onSelect={() => actions.onCancel(event)}
                                                            >
                                                                Batalkan acara
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                    {isDraft && (
                                                        <>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                className="text-xs cursor-pointer py-1.5 text-red-600 focus:text-red-700"
                                                                onSelect={() => actions.onDelete(event)}
                                                            >
                                                                Hapus draft
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Count */}
                <div className="shrink-0 border-t border-gray-200 px-4 py-2.5 text-xs text-gray-500 flex items-center justify-between bg-gray-50/50">
                    <span>
                        Menampilkan {filteredEvents.length} dari {events.length} acara
                    </span>
                    {filteredEvents.length > 0 && (
                        <span className="hidden sm:inline text-[11px] text-gray-400">
                            Klik pada baris acara untuk mengubah data
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
