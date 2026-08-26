import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { Button } from '@/components/ui/button';
import { AlertPill } from '@/components/ui/alert-pill';
import { cn } from '@/lib/utils';
import {
    Check, ChevronRight, Copy, ExternalLink, Eye, EyeOff, GripVertical, ImageOff, Loader2, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    PAGE_TYPE_LABEL, pageTypeOf, shortOrderId, usesPlaceholderBanner, type PageData,
} from './types';
import { publicPagePath, publicPageUrl } from '@/utils/page-url';

// ─────────────────────────────────────────────────────────────
// Feed Live — kurasi urutan kartu yang sedang tayang.
//
// Ini satu-satunya pekerjaan yang tidak bisa dilakukan layar lain: papan Schedule
// memegang sumbu tanggal dan sengaja nol aksi, sementara urutan feed adalah aksi
// murni yang tidak punya tanggal.
// ─────────────────────────────────────────────────────────────

type Highlight = 'all' | 'placeholder-banner' | 'hidden';

/** Lebar kolom dipusatkan — header dan baris tidak boleh bisa bergeser sendiri-sendiri. */
const COL = {
    grip: 'w-5 shrink-0',
    num: 'w-7 shrink-0 text-center',
    id: 'w-[104px] shrink-0 hidden sm:flex items-center',
    page: 'flex-1 min-w-0',
    type: 'w-[96px] shrink-0 hidden md:block',
    views: 'w-[58px] shrink-0 text-right hidden sm:block',
    actions: 'w-[136px] shrink-0 flex items-center justify-end gap-0.5',
};

const TYPE_CLASS: Record<ReturnType<typeof pageTypeOf>, string> = {
    ad: 'text-blue-700 bg-blue-50 border-blue-100',
    extra: 'text-amber-700 bg-amber-50 border-amber-100',
    announcement: 'text-purple-700 bg-purple-50 border-purple-100',
};

export function LiveFeedTab({
    livePages,
    loading,
    actions,
    onSelectPage,
    onOpenPageBuilder,
    onToggleHide,
    onOrderSaved,
}: {
    livePages: PageData[];
    loading: boolean;
    /** Tombol yang sama di kedua tab (+ Standalone Page, muat ulang), dirender induk. */
    actions: React.ReactNode;
    onSelectPage: (page: PageData) => void;
    onOpenPageBuilder?: (page: PageData) => void;
    onToggleHide?: (page: PageData) => void;
    onOrderSaved: () => void | Promise<void>;
}) {
    const [orderedLive, setOrderedLive] = useState<PageData[]>(livePages);
    const [savingOrder, setSavingOrder] = useState(false);
    const [highlight, setHighlight] = useState<Highlight>('all');
    const dragIndexRef = useRef<number | null>(null);

    // Sinkron ulang tiap kumpulan live berubah (mis. sesudah muat ulang).
    useEffect(() => { setOrderedLive(livePages); }, [livePages]);

    const orderDirty = useMemo(
        () => orderedLive.map(p => p.id).join(',') !== livePages.map(p => p.id).join(','),
        [orderedLive, livePages]
    );

    const movedCount = useMemo(() => {
        const base = livePages.map(p => p.id);
        return orderedLive.reduce((n, p, i) => (base[i] === p.id ? n : n + 1), 0);
    }, [orderedLive, livePages]);

    const placeholderCount = useMemo(
        () => orderedLive.filter(usesPlaceholderBanner).length,
        [orderedLive]
    );
    const hiddenCount = useMemo(
        () => orderedLive.filter(p => p.is_hidden).length,
        [orderedLive]
    );

    const highlightActive = highlight !== 'all';

    /**
     * Baris yang ditampilkan, LENGKAP dengan nomor urutnya di feed penuh.
     *
     * Nomornya sengaja indeks asli (2, 4, 7 — bukan 1, 2, 3): angka yang menyebut
     * posisi harus menyebut posisi sebenarnya, kalau tidak ia berbohong tepat saat
     * admin memakainya untuk memutuskan.
     */
    const visible = useMemo(() => {
        const rows = orderedLive.map((page, index) => ({ page, index }));
        if (highlight === 'placeholder-banner') return rows.filter(r => usesPlaceholderBanner(r.page));
        if (highlight === 'hidden') return rows.filter(r => r.page.is_hidden);
        return rows;
    }, [orderedLive, highlight]);

    const handleDragStart = (index: number) => { dragIndexRef.current = index; };
    const handleDragEnter = (index: number) => {
        const from = dragIndexRef.current;
        if (from === null || from === index) return;
        setOrderedLive(prev => {
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(index, 0, moved);
            return next;
        });
        dragIndexRef.current = index;
    };
    const handleDragEnd = () => { dragIndexRef.current = null; };

    /**
     * ⚠️ `set_survey_pages_order` menulis `display_order = ord - 1` untuk SETIAP id
     * yang dikirim. Menyimpan dari daftar tersaring memberi tiga halaman nilai
     * 0,1,2 dan menabrak halaman lain yang memegang nilai itu — karena itu pil
     * sorot menyembunyikan grip dan mematikan tombol ini, bukan menata ulang
     * diam-diam.
     */
    const handleSaveOrder = async () => {
        if (highlightActive) return;
        setSavingOrder(true);
        try {
            const orderedIds = orderedLive.map(p => p.id);
            const { error } = await supabase.rpc('set_survey_pages_order', { ordered_ids: orderedIds });
            if (error) throw error;
            toast.success('Urutan iklan live berhasil disimpan');
            await onOrderSaved();
        } catch (e) {
            console.error('Failed to save live order:', e);
            const msg = e instanceof Error ? e.message : 'Unknown error';
            toast.error('Gagal menyimpan urutan: ' + msg);
        } finally {
            setSavingOrder(false);
        }
    };

    const handleCopyLink = (page: PageData) => {
        const url = publicPageUrl(page.slug);
        if (navigator?.clipboard) {
            navigator.clipboard.writeText(url);
            toast.success('Link halaman berhasil disalin!');
        } else {
            toast.error('Gagal menyalin link');
        }
    };

    const handleCopyId = (id: string) => {
        if (navigator?.clipboard) {
            navigator.clipboard.writeText(id);
            toast.success('Page ID berhasil disalin!');
        } else {
            toast.error('Gagal menyalin Page ID');
        }
    };

    const toggleHighlight = (next: Highlight) =>
        setHighlight(prev => (prev === next ? 'all' : next));

    return (
        <>
            {/* ── Toolbar ── */}
            <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-3">
                {!loading && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        {placeholderCount > 0 && (
                            <AlertPill
                                icon={ImageOff}
                                count={placeholderCount}
                                label="banner default"
                                tone="amber"
                                active={highlight === 'placeholder-banner'}
                                onClick={() => toggleHighlight('placeholder-banner')}
                                title="Iklan live yang masih memakai banner bawaan"
                            />
                        )}
                        {hiddenCount > 0 && (
                            <AlertPill
                                icon={EyeOff}
                                count={hiddenCount}
                                label="disembunyikan"
                                tone="slate"
                                active={highlight === 'hidden'}
                                onClick={() => toggleHighlight('hidden')}
                                title="Live di admin, tapi tidak dikirim ke mobile app"
                            />
                        )}
                    </div>
                )}
                <div className="flex items-center gap-2 ml-auto">{actions}</div>
            </div>

            {/* ── Satu wilayah gulung ── */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-4 h-10 flex items-center gap-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <span className={COL.grip} aria-hidden="true" />
                    <span className={COL.num}>#</span>
                    <span className={COL.id}>Page ID</span>
                    <span className={COL.page}>Page</span>
                    <span className={COL.type}>Tipe</span>
                    <span className={COL.views}>Views</span>
                    <span className={cn(COL.actions, 'text-center')}>Aksi</span>
                    <span className="w-4 shrink-0" aria-hidden="true" />
                </div>

                {loading ? (
                    <div className="divide-y divide-gray-100">
                        {Array(6).fill(0).map((_, i) => (
                            <div key={`skeleton-live-${i}`} className="flex items-center gap-3 px-4 py-3">
                                <div className="w-5 h-4 bg-gray-100 animate-pulse rounded shrink-0" />
                                <div className="w-7 h-4 bg-gray-100 animate-pulse rounded shrink-0" />
                                <div className="w-[104px] h-4 bg-gray-100 animate-pulse rounded shrink-0 hidden sm:block" />
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="h-4 w-3/5 bg-gray-200 animate-pulse rounded" />
                                    <div className="h-2.5 w-2/5 bg-gray-100 animate-pulse rounded" />
                                </div>
                                <div className="w-[96px] h-5 bg-gray-100 animate-pulse rounded-full shrink-0 hidden md:block" />
                            </div>
                        ))}
                    </div>
                ) : visible.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-20">
                        {highlightActive
                            ? 'Tidak ada kartu live yang cocok dengan sorot ini.'
                            : 'Tidak ada iklan yang sedang live saat ini.'}
                    </p>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {visible.map(({ page, index }) => {
                            const type = pageTypeOf(page);
                            const orderId = shortOrderId(page);
                            const placeholder = usesPlaceholderBanner(page);
                            return (
                                <li
                                    key={page.id}
                                    // Grip yang jadi sumber seret; <li> tetap TARGET JATUH.
                                    onDragEnter={() => !highlightActive && handleDragEnter(index)}
                                    onDragOver={(e) => e.preventDefault()}
                                    className="group flex items-center gap-3 px-4 py-2 transition-colors hover:bg-gray-50/80"
                                >
                                    {/* ⚠️ HANYA grip ini yang `draggable`.
                                        Kalau seluruh baris draggable sekaligus jadi target klik,
                                        setiap seretan pendek berakhir sebagai klik dan drawer
                                        terbuka di tengah pengurutan. */}
                                    <span className={cn(COL.grip, 'flex justify-center')}>
                                        {!highlightActive && (
                                            <span
                                                draggable
                                                onDragStart={() => handleDragStart(index)}
                                                onDragEnd={handleDragEnd}
                                                title="Seret untuk mengubah urutan"
                                                aria-label="Seret untuk mengubah urutan"
                                                className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
                                            >
                                                <GripVertical className="w-4 h-4" />
                                            </span>
                                        )}
                                    </span>

                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => onSelectPage(page)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                onSelectPage(page);
                                            }
                                        }}
                                        className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer text-left py-0.5"
                                    >
                                        <span className={cn(COL.num, 'text-xs font-bold tabular-nums text-gray-400')}>
                                            {index + 1}
                                        </span>

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
                                            <div className="flex items-center gap-2">
                                                <span className="truncate text-sm font-semibold text-gray-900" title={page.title}>
                                                    {page.title}
                                                </span>
                                                {placeholder && (
                                                    <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700" title="Masih memakai banner bawaan">
                                                        ⚠ banner
                                                    </span>
                                                )}
                                            </div>
                                            <span className="mt-0.5 truncate text-[11px] text-gray-500">
                                                {orderId ? <span className="font-mono">{orderId}</span> : '—'}
                                                {page.owner_name ? ` · ${page.owner_name}` : ''}
                                                <span className="md:hidden"> · {PAGE_TYPE_LABEL[type]}</span>
                                            </span>
                                        </div>

                                        <span className={COL.type}>
                                            <span className={cn(
                                                'inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium',
                                                TYPE_CLASS[type]
                                            )}>
                                                {PAGE_TYPE_LABEL[type]}
                                            </span>
                                        </span>

                                        <span className={cn(COL.views, 'text-[11px] tabular-nums text-gray-400')}>
                                            {(page.views_count || 0).toLocaleString('id-ID')}
                                        </span>
                                    </div>

                                    {/* Actions: Copy Link, Buka, Sembunyikan, Edit */}
                                    <div className={COL.actions} onClick={(e) => e.stopPropagation()}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            onClick={() => handleCopyLink(page)}
                                            title="Salin Link"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                            onClick={() => window.open(publicPagePath(page.slug), '_blank')}
                                            title="Buka Halaman"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </Button>

                                        {onToggleHide && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className={cn(
                                                    "h-7 w-7 rounded-lg transition-colors",
                                                    page.is_hidden
                                                        ? "text-red-500 hover:text-red-700 hover:bg-red-50"
                                                        : "text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                                                )}
                                                onClick={() => onToggleHide(page)}
                                                title={page.is_hidden ? "Tampilkan di Mobile App" : "Sembunyikan dari Mobile App"}
                                            >
                                                {page.is_hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                            </Button>
                                        )}

                                        {onOpenPageBuilder && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                onClick={() => onOpenPageBuilder(page)}
                                                title="Edit Halaman"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                    </div>

                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => onSelectPage(page)}
                                        className="cursor-pointer p-1 text-gray-300 hover:text-gray-500 transition-colors"
                                    >
                                        <ChevronRight className="w-4 h-4 shrink-0" />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* ── Footer: cacah yang berubah jadi bilah aksi saat urutan kotor ──
                Tombol simpan TIDAK ditaruh di pojok atas: begitu daftarnya panjang,
                ia menggulung keluar layar tepat saat admin selesai menyeret. */}
            <div className="shrink-0 flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-2.5 bg-white text-xs text-gray-400">
                {highlightActive ? (
                    <>
                        <span>Sorot aktif — urutan tidak bisa diubah. Matikan pil untuk menyeret.</span>
                        <span className="tabular-nums shrink-0">{visible.length} dari {orderedLive.length}</span>
                    </>
                ) : orderDirty ? (
                    <>
                        <span className="text-gray-600 font-medium">
                            {movedCount} kartu dipindahkan, belum disimpan.
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                variant="outline" size="sm"
                                className="h-7 text-xs"
                                onClick={() => setOrderedLive(livePages)}
                                disabled={savingOrder}
                            >
                                Reset
                            </Button>
                            <Button
                                size="sm"
                                className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                                onClick={handleSaveOrder}
                                disabled={savingOrder}
                            >
                                {savingOrder
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                    : <Check className="w-3.5 h-3.5 mr-1.5" />}
                                Simpan Urutan
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <span>Urutan dipakai mobile app &amp; web listing — seret grip untuk mengubah.</span>
                        <span className="tabular-nums shrink-0">
                            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : `${orderedLive.length} kartu live`}
                        </span>
                    </>
                )}
            </div>
        </>
    );
}
