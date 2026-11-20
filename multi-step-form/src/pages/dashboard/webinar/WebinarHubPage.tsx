import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import {
    AlertCircle, ArrowRight, Check, ChevronRight, Copy, HelpCircle, LayoutDashboard,
    Play, ReceiptText, Sparkles, Ticket,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    fetchMyWebinarOrders, fetchWebinarListing, ownedFor, purchaseHistory, syncWebinarOrder, webinarTicketHref,
    type MyWebinarOrders, type WebinarEventView, type WebinarListing, type WebinarOrderView,
} from '@/utils/webinarApi';
import { ADMIN_EMAIL, CARD_CLASS, WebinarBadge, WebinarMeta, WebinarPoster } from '@/components/webinar/WebinarParts';
import { WebinarTicketCard } from '@/components/webinar/WebinarTicketCard';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';

const POLL_MS = 5_000;
// Dokumentasi DOKU melarang Check Status lebih cepat dari 60 detik sesudah bayar.
const SYNC_AFTER_MS = 60_000;

type HubTab = 'mine' | 'explore';
type CatalogFilter = 'all' | 'live' | 'replay';

/**
 * Link lama `/dashboard/webinar/tiket/:id` tetap hidup: dipakai callback DOKU, link gabung
 * sebelum ruang dibuka, dan order yang sudah terbit. Halaman tiketnya sendiri sudah tidak ada.
 */
export function WebinarTicketRedirect() {
    const { orderId = '' } = useParams();
    return <Navigate to={webinarTicketHref(orderId)} replace />;
}

function OfferCard({
    event,
    owned,
    onViewOwnedTicket,
}: {
    event: WebinarEventView;
    owned?: { order: WebinarOrderView; viaSource: boolean } | null;
    onViewOwnedTicket?: (orderId: string) => void;
}) {
    return (
        <article className={`${CARD_CLASS} p-4 flex flex-col gap-3 hover:border-blue-300/90 hover:shadow-[0_14px_32px_-18px_rgba(25,118,210,0.22)] transition-all`}>
            <a href={event.detail_url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl group">
                <WebinarPoster event={event} className="transition-transform duration-300 group-hover:scale-[1.02]" />
            </a>

            <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                    <WebinarBadge event={owned ? { tone: 'on_sale', badge: 'Sudah punya' } : event} />
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                        {event.kind === 'replay' ? 'Video kelas' : 'Sesi live'}
                    </span>
                </div>
                <h3 className="font-bold text-slate-900 text-[15px] leading-snug">
                    <a href={event.detail_url} target="_blank" rel="noopener noreferrer" className="hover:text-jfu-primary transition-colors">
                        {event.title}
                    </a>
                </h3>
            </div>

            <WebinarMeta event={event} />
            {owned?.viaSource && <p className="text-xs text-slate-600 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">Sudah termasuk di tiket webinarmu.</p>}

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3 mt-auto">
                {owned ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        Dimiliki
                    </span>
                ) : event.price_label ? (
                    <span className="text-base font-extrabold text-slate-900 tabular-nums tracking-tight">{event.price_label}</span>
                ) : <span />}

                <div className="flex items-center gap-2">
                    <a
                        href={event.detail_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs sm:text-sm font-semibold text-slate-600 hover:text-jfu-primary px-2 py-1.5 transition-colors"
                    >
                        Detail
                    </a>
                    {owned ? (
                        // Pemilik Video kelas (atau tiket yang rekamannya terbit) langsung menonton.
                        owned.order.watch_path ? (
                            <Link
                                to={owned.order.watch_path}
                                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-jfu-primary to-jfu-dark hover:brightness-105 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(25,118,210,0.45)] transition-all"
                            >
                                <Play className="w-3.5 h-3.5 fill-current" />
                                <span>Tonton</span>
                            </Link>
                        ) : (
                            <button
                                type="button"
                                onClick={() => onViewOwnedTicket?.(owned.order.id)}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 transition-colors cursor-pointer"
                            >
                                Lihat tiket
                            </button>
                        )
                    ) : event.can_buy ? (
                        <Link
                            to={`/dashboard/webinar/beli/${event.slug}`}
                            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-jfu-primary to-jfu-dark hover:brightness-105 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(25,118,210,0.45)] transition-all"
                        >
                            {event.buy_label}
                        </Link>
                    ) : (
                        <a
                            href={event.detail_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-jfu-primary hover:text-jfu-dark"
                        >
                            <span>Lihat</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </a>
                    )}
                </div>
            </div>
        </article>
    );
}

const historyDate = (iso: string | null | undefined) => (iso
    ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })
    : '—');

/** C15: hanya order lunas & refund. Refund ditulis "Tidak aktif", tanpa kata refund. */
function PurchaseHistoryDrawer({
    open,
    onOpenChange,
    orders,
    email,
}: {
    open: boolean;
    onOpenChange: (next: boolean) => void;
    orders: WebinarOrderView[];
    email?: string;
}) {
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const copyInvoice = async (order: WebinarOrderView) => {
        try {
            await navigator.clipboard.writeText(order.invoice_number);
            setCopiedId(order.id);
            toast.success('Nomor invoice tersalin');
            setTimeout(() => setCopiedId((prev) => (prev === order.id ? null : prev)), 2000);
        } catch {
            toast.error('Gagal menyalin nomor invoice');
        }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-md bg-white p-0 flex flex-col">
                <SheetHeader className="px-6 py-5 border-b border-slate-100 text-left space-y-1">
                    <SheetTitle className="text-base font-extrabold text-slate-900">Riwayat transaksi</SheetTitle>
                    <SheetDescription className="text-xs text-slate-500">
                        {email ? `Daftar pembelian untuk ${email}` : 'Catatan pembelian tiket dan video kelas JFU.'}
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                    {orders.length === 0 ? (
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-5 py-10 text-center">
                            <ReceiptText className="w-8 h-8 text-slate-300 mx-auto mb-2.5" />
                            <p className="text-sm font-semibold text-slate-700">Belum ada transaksi</p>
                            <p className="text-xs text-slate-500 mt-1">Pembelian tiket dan video kelas yang selesai akan tercatat di sini.</p>
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {orders.map((o) => (
                                <li
                                    key={o.id}
                                    className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4 space-y-2"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="min-w-0 font-bold text-sm text-slate-900 leading-snug">{o.event.title}</p>
                                        <span className="shrink-0 tabular-nums font-extrabold text-sm text-slate-900">{o.amount_label}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                        <span>{historyDate(o.paid_at || o.created_at)}</span>
                                        <span>·</span>
                                        <span>{o.kind === 'replay' ? 'Video kelas' : 'Tiket live'}</span>
                                        <span>·</span>
                                        <span className={o.status === 'paid' ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-500'}>
                                            {o.status === 'paid' ? 'Lunas' : 'Tidak aktif'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60">
                                        <span className="truncate font-mono text-[11px] text-slate-500">{o.invoice_number}</span>
                                        <button
                                            type="button"
                                            onClick={() => { void copyInvoice(o); }}
                                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-white hover:text-jfu-primary transition-colors cursor-pointer shrink-0"
                                            aria-label={`Salin nomor invoice ${o.invoice_number}`}
                                        >
                                            {copiedId === o.id ? (
                                                <><Check className="w-3 h-3 text-emerald-600" /><span>Tersalin</span></>
                                            ) : (
                                                <><Copy className="w-3 h-3" /><span>Salin</span></>
                                            )}
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

function WebinarHubSkeleton() {
    return (
        <div className="max-w-5xl mx-auto px-4 md:px-6 pt-5 md:pt-8 space-y-5" aria-busy="true" aria-label="Memuat halaman Kelas JFU">
            <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-11 w-72 rounded-2xl bg-slate-200/70" />
                <Skeleton className="h-9 w-40 rounded-full bg-slate-200/70" />
            </div>
            <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-2xl bg-white/80 border border-slate-200/70" />
                <Skeleton className="h-24 w-full rounded-2xl bg-white/80 border border-slate-200/70" />
            </div>
        </div>
    );
}

export function WebinarHubPage() {
    const [listing, setListing] = useState<WebinarListing | null>(null);
    const [mine, setMine] = useState<MyWebinarOrders | null>(null);
    const [failed, setFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<HubTab>('mine');
    const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('all');
    const [historyOpen, setHistoryOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const focusId = searchParams.get('tiket');
    const focusRef = useRef<HTMLDivElement | null>(null);
    const minePanelRef = useRef<HTMLDivElement | null>(null);
    const explorePanelRef = useRef<HTMLDivElement | null>(null);
    const mineTabRef = useRef<HTMLButtonElement | null>(null);
    const exploreTabRef = useRef<HTMLButtonElement | null>(null);
    const initializedTab = useRef(false);
    const openedAt = useRef(Date.now());
    const lastSync = useRef<Record<string, number>>({});
    const [checking, setChecking] = useState(false);

    const reloadOrders = useCallback(async () => {
        const m = await fetchMyWebinarOrders();
        setMine(m);
        return m;
    }, []);

    useEffect(() => {
        let alive = true;
        Promise.all([fetchWebinarListing(), fetchMyWebinarOrders()])
            .then(([l, m]) => { if (alive) { setListing(l); setMine(m); } })
            .catch((err) => { console.error('[webinar]', err); if (alive) setFailed(true); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    const pendingIds = (mine?.orders ?? [])
        .filter((o) => o.status === 'pending' && new Date(o.payment_expires_at as string).getTime() > Date.now())
        .map((o) => o.id)
        .join(',');

    // Selama ada tiket belum dibayar: cek status tiap 5 detik, dan sesudah 60 detik
    // tanya DOKU langsung (jaring pengaman bila notifikasinya tidak datang).
    useEffect(() => {
        if (!pendingIds) { setChecking(false); return undefined; }
        const ids = pendingIds.split(',');
        const poll = setInterval(async () => {
            try {
                const t = Date.now();
                if (t - openedAt.current >= SYNC_AFTER_MS) {
                    setChecking(true);
                    for (const id of ids) {
                        if (t - (lastSync.current[id] ?? 0) < SYNC_AFTER_MS) continue;
                        lastSync.current[id] = t;
                        await syncWebinarOrder(id);
                    }
                }
                await reloadOrders();
            } catch (err) {
                console.error('[webinar]', err);
            }
        }, POLL_MS);
        return () => clearInterval(poll);
    }, [pendingIds, reloadOrders]);

    // Kedaluwarsa disembunyikan, kecuali yang sedang dituju (supaya ada "Pesan lagi").
    const visibleOrders = useMemo(
        () => (mine?.orders ?? []).filter((o) => o.status !== 'expired' || o.id === focusId),
        [mine?.orders, focusId],
    );
    const historyRows = useMemo(() => purchaseHistory(mine?.orders ?? []), [mine?.orders]);
    const events = useMemo(
        () => (listing ? [listing.hero, ...listing.upcoming, ...listing.videos].filter((e): e is WebinarEventView => !!e) : []),
        [listing],
    );
    const liveCount = useMemo(() => events.filter((e) => e.kind === 'live').length, [events]);
    const replayCount = useMemo(() => events.filter((e) => e.kind === 'replay').length, [events]);
    const filteredEvents = useMemo(
        () => (catalogFilter === 'all' ? events : events.filter((e) => e.kind === catalogFilter)),
        [events, catalogFilter],
    );

    // Pilih tab awal cerdas: bila datang lewat ?tiket= atau punya tiket -> Kelas Saya;
    // bila belum punya tiket tapi ada katalog -> langsung buka Jelajahi Kelas.
    useEffect(() => {
        if (loading || failed) return;
        if (focusId) {
            setActiveTab('mine');
            initializedTab.current = true;
            return;
        }
        if (!initializedTab.current) {
            initializedTab.current = true;
            if (visibleOrders.length === 0 && events.length > 0) {
                setActiveTab('explore');
            }
        }
    }, [loading, failed, focusId, visibleOrders.length, events.length]);

    // Datang dari checkout, callback DOKU, atau link lama: gulir ke kartunya.
    useEffect(() => {
        if (!loading && focusId && activeTab === 'mine') {
            focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [loading, focusId, activeTab]);

    // Sinkronkan hidden="until-found" dan beforematch agar Ctrl+F di browser tetap menemukan isi tab lain.
    useEffect(() => {
        const pairs: [HTMLDivElement | null, HubTab][] = [
            [minePanelRef.current, 'mine'],
            [explorePanelRef.current, 'explore'],
        ];
        const cleanups: (() => void)[] = [];
        for (const [el, tab] of pairs) {
            if (!el) continue;
            if (activeTab === tab) {
                el.removeAttribute('hidden');
            } else {
                el.setAttribute('hidden', 'until-found');
            }
            const onBeforeMatch = () => setActiveTab(tab);
            el.addEventListener('beforematch', onBeforeMatch);
            cleanups.push(() => el.removeEventListener('beforematch', onBeforeMatch));
        }
        return () => cleanups.forEach((fn) => fn());
    }, [activeTab, loading, failed]);

    const handleTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
            e.preventDefault();
            let next: HubTab = activeTab;
            if (e.key === 'Home') next = 'mine';
            else if (e.key === 'End') next = 'explore';
            else next = activeTab === 'mine' ? 'explore' : 'mine';
            setActiveTab(next);
            (next === 'mine' ? mineTabRef.current : exploreTabRef.current)?.focus();
        }
    };

    const jumpToOwnedTicket = (orderId: string) => {
        setSearchParams({ tiket: orderId });
        setActiveTab('mine');
    };

    if (loading) {
        return <WebinarHubSkeleton />;
    }

    const focusMissing = !!focusId && !!mine && !visibleOrders.some((o) => o.id === focusId);

    return (
        <div className="max-w-5xl mx-auto px-4 md:px-6 pt-5 md:pt-8">
            <h1 className="sr-only">Kelas JFU</h1>

            {failed && (
                <div className={`${CARD_CLASS} p-6 text-center text-sm text-slate-600`}>
                    Kelas JFU belum bisa dimuat. Muat ulang beberapa saat lagi.
                </div>
            )}

            {!failed && (
                <>
                    {/* Baris kontrol: 2 Tab Utama di kiri + Tombol Riwayat Transaksi di kanan */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                        <div
                            role="tablist"
                            aria-label="Bagian Kelas JFU"
                            onKeyDown={handleTabKeyDown}
                            className="inline-flex max-w-full overflow-x-auto items-center gap-1 rounded-2xl border border-slate-200/90 bg-white/90 p-1 shadow-[0_2px_8px_rgba(15,23,42,0.03)]"
                        >
                            <button
                                ref={mineTabRef}
                                type="button"
                                role="tab"
                                id="tab-kelas-saya"
                                aria-selected={activeTab === 'mine'}
                                tabIndex={activeTab === 'mine' ? 0 : -1}
                                onClick={() => setActiveTab('mine')}
                                className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-transparent px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 aria-selected:bg-jfu-primary aria-selected:text-white aria-selected:border-jfu-primary aria-selected:shadow-[0_6px_14px_-6px_rgba(25,118,210,0.55)] forced-colors:aria-selected:border-[Highlight] transition-colors cursor-pointer"
                            >
                                <span>Kelas Saya</span>
                                <span
                                    className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                                        activeTab === 'mine' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                                    }`}
                                >
                                    {visibleOrders.length}
                                </span>
                            </button>

                            <button
                                ref={exploreTabRef}
                                type="button"
                                role="tab"
                                id="tab-jelajahi-kelas"
                                aria-selected={activeTab === 'explore'}
                                tabIndex={activeTab === 'explore' ? 0 : -1}
                                onClick={() => setActiveTab('explore')}
                                className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-transparent px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 aria-selected:bg-jfu-primary aria-selected:text-white aria-selected:border-jfu-primary aria-selected:shadow-[0_6px_14px_-6px_rgba(25,118,210,0.55)] forced-colors:aria-selected:border-[Highlight] transition-colors cursor-pointer"
                            >
                                <span>Jelajahi Kelas</span>
                                <span
                                    className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                                        activeTab === 'explore' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                                    }`}
                                >
                                    {events.length}
                                </span>
                            </button>
                        </div>

                        {historyRows.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setHistoryOpen(true)}
                                className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/95 hover:bg-slate-50 hover:border-slate-300 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors cursor-pointer shrink-0"
                            >
                                <ReceiptText className="w-4 h-4 text-slate-500 shrink-0" />
                                <span className="whitespace-nowrap">Riwayat transaksi</span>
                                <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
                                    {historyRows.length}
                                </span>
                            </button>
                        )}
                    </div>

                    {/* Panel 1: Kelas Saya (tanpa padding/border/margin pada elemen tabpanel sendiri untuk hidden="until-found") */}
                    <div
                        ref={minePanelRef}
                        role="tabpanel"
                        aria-labelledby="tab-kelas-saya"
                        hidden={activeTab !== 'mine'}
                    >
                        <div className="space-y-3">
                            {focusMissing && (
                                <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
                                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                    <span>Tiket itu tidak ada di akun <strong className="font-semibold">{mine?.email}</strong>. Cek akun yang tertulis di e-tiketmu.</span>
                                </div>
                            )}

                            {visibleOrders.length > 0 ? (
                                <div className="space-y-3">
                                    {visibleOrders.map((o) => (
                                        <WebinarTicketCard
                                            key={o.id}
                                            ref={o.id === focusId ? focusRef : undefined}
                                            order={o}
                                            highlighted={o.id === focusId}
                                            checking={checking && o.status === 'pending'}
                                            onReload={() => { reloadOrders().catch((err) => console.error('[webinar]', err)); }}
                                        />
                                    ))}
                                </div>
                            ) : !focusMissing && (
                                <Card className="border border-slate-200/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] bg-white/95 rounded-2xl overflow-hidden">
                                    <CardContent className="flex flex-col items-center justify-center py-10 md:py-12 px-6 text-center">
                                        <div className="w-14 h-14 rounded-2xl bg-blue-50/80 border border-blue-100 flex items-center justify-center text-jfu-primary mb-4 shadow-xs">
                                            <Ticket className="w-7 h-7 stroke-[1.75]" />
                                        </div>
                                        <h2 className="text-base sm:text-lg font-bold text-slate-900">
                                            Belum Ada Tiket atau Video Kelas
                                        </h2>
                                        <p className="text-xs sm:text-sm text-slate-500 max-w-md mt-1.5 leading-relaxed">
                                            Tiket Kelas JFU dan rekaman video kelas yang kamu miliki akan tersimpan rapi di sini.
                                        </p>

                                        {mine?.email && (
                                            <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200/80 text-xs text-slate-500">
                                                <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                <span>
                                                    Terhubung ke <strong className="font-semibold text-slate-700">{mine.email}</strong>. Beli pakai email lain? Cek e-tiketmu.
                                                </span>
                                            </div>
                                        )}

                                        {events.length > 0 && (
                                            <div className="mt-6">
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveTab('explore')}
                                                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-gradient-to-br from-jfu-primary to-jfu-dark hover:brightness-105 text-white text-xs sm:text-sm font-semibold shadow-[0_8px_18px_-8px_rgba(25,118,210,0.5)] transition-all cursor-pointer"
                                                >
                                                    <span>Jelajahi Kelas JFU</span>
                                                    <ArrowRight className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>

                    {/* Panel 2: Jelajahi Kelas */}
                    <div
                        ref={explorePanelRef}
                        role="tabpanel"
                        aria-labelledby="tab-jelajahi-kelas"
                        hidden={activeTab !== 'explore'}
                    >
                        <div className="space-y-4">
                            {liveCount > 0 && replayCount > 0 && (
                                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter jenis kelas">
                                    {(
                                        [
                                            ['all', `Semua (${events.length})`],
                                            ['live', `Sesi Live (${liveCount})`],
                                            ['replay', `Video Kelas (${replayCount})`],
                                        ] as const
                                    ).map(([key, label]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            aria-pressed={catalogFilter === key}
                                            onClick={() => setCatalogFilter(key)}
                                            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                                                catalogFilter === key
                                                    ? 'border-blue-300 bg-blue-50 text-jfu-dark'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {filteredEvents.length > 0 ? (
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {filteredEvents.map((e) => (
                                        <OfferCard
                                            key={e.id}
                                            event={e}
                                            owned={ownedFor(e, visibleOrders)}
                                            onViewOwnedTicket={jumpToOwnedTicket}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <Card className="border border-slate-200/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] bg-white/95 rounded-2xl overflow-hidden">
                                    <CardContent className="flex flex-col items-center justify-center py-10 md:py-12 px-6 text-center">
                                        <div className="w-14 h-14 rounded-2xl bg-amber-50/80 border border-amber-100 flex items-center justify-center text-amber-600 mb-4 shadow-xs">
                                            <Sparkles className="w-7 h-7 stroke-[1.75]" />
                                        </div>
                                        <h2 className="text-base sm:text-lg font-bold text-slate-900">
                                            Kelas JFU Berikutnya Sedang Disiapkan
                                        </h2>
                                        <p className="text-xs sm:text-sm text-slate-500 max-w-md mt-1.5 leading-relaxed">
                                            Nantikan kelas riset, analisis data, dan sesi praktikum industri berikutnya. Ingin membahas topik tertentu?
                                        </p>

                                        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
                                            <a
                                                href={`mailto:${ADMIN_EMAIL}?subject=Usulan%20Topik%20Kelas%20JFU`}
                                                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-gradient-to-br from-jfu-primary to-jfu-dark text-white text-xs sm:text-sm font-semibold shadow-xs hover:brightness-105 transition-all cursor-pointer"
                                            >
                                                <span>Usulkan Topik Kelas</span>
                                                <ChevronRight className="w-4 h-4" />
                                            </a>
                                            <Link
                                                to="/dashboard"
                                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs sm:text-sm font-semibold transition-all"
                                            >
                                                <LayoutDashboard className="w-4 h-4 text-slate-500" />
                                                <span>Kembali ke Dashboard</span>
                                            </Link>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>

                    {/* Slide-over Drawer: Riwayat Transaksi */}
                    <PurchaseHistoryDrawer
                        open={historyOpen}
                        onOpenChange={setHistoryOpen}
                        orders={historyRows}
                        email={mine?.email}
                    />
                </>
            )}
        </div>
    );
}
