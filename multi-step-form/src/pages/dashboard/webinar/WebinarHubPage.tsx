import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import {
    AlertCircle, ArrowDown, ChevronRight, HelpCircle, LayoutDashboard, Loader2, Mail, Sparkles, Ticket,
} from 'lucide-react';
import {
    fetchMyWebinarOrders, fetchWebinarListing, purchaseHistory, syncWebinarOrder, webinarTicketHref,
    type MyWebinarOrders, type WebinarEventView, type WebinarListing, type WebinarOrderView,
} from '@/utils/webinarApi';
import { ADMIN_EMAIL, CARD_CLASS, WebinarBadge, WebinarMeta, WebinarPoster } from '@/components/webinar/WebinarParts';
import { WebinarTicketCard } from '@/components/webinar/WebinarTicketCard';
import { Card, CardContent } from '@/components/ui/card';

const POLL_MS = 5_000;
// Dokumentasi DOKU melarang Check Status lebih cepat dari 60 detik sesudah bayar.
const SYNC_AFTER_MS = 60_000;

/**
 * Link lama `/dashboard/webinar/tiket/:id` tetap hidup: dipakai callback DOKU, link gabung
 * sebelum ruang dibuka, dan order yang sudah terbit. Halaman tiketnya sendiri sudah tidak ada.
 */
export function WebinarTicketRedirect() {
    const { orderId = '' } = useParams();
    return <Navigate to={webinarTicketHref(orderId)} replace />;
}

function OfferCard({ event, owned }: { event: WebinarEventView; owned?: WebinarOrderView }) {
    return (
        <article className={`${CARD_CLASS} p-4 flex flex-col gap-3`}>
            <div className="flex gap-3">
                <div className="shrink-0" style={{ width: 112 }}><WebinarPoster event={event} /></div>
                <div className="min-w-0 space-y-1">
                    <WebinarBadge event={owned ? { tone: 'on_sale', badge: 'Sudah punya' } : event} />
                    <h3 className="font-bold text-slate-900 leading-snug">{event.title}</h3>
                    {event.price_label && !owned && <p className="text-sm font-semibold text-slate-900">{event.price_label}</p>}
                </div>
            </div>
            <WebinarMeta event={event} />
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 mt-auto">
                {owned ? (
                    // Pemilik Video kelas (atau tiket yang rekamannya terbit) langsung menonton.
                    owned.watch_path
                        ? <Link to={owned.watch_path} className="rounded-xl bg-jfu-primary px-4 py-2 text-sm font-semibold text-white">Tonton</Link>
                        : <Link to={webinarTicketHref(owned.id)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Lihat tiket</Link>
                ) : event.can_buy ? (
                    <Link to={`/dashboard/webinar/beli/${event.slug}`} className="rounded-xl bg-jfu-primary px-4 py-2 text-sm font-semibold text-white">{event.buy_label}</Link>
                ) : <span />}
                <a href={event.detail_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-jfu-primary">Detail →</a>
            </div>
        </article>
    );
}

const historyDate = (iso: string | null | undefined) => (iso
    ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })
    : '—');

/** C15: hanya order lunas & refund. Refund ditulis "Tidak aktif", tanpa kata refund. */
function PurchaseHistory({ orders }: { orders: WebinarOrderView[] }) {
    const rows = purchaseHistory(orders);
    if (rows.length === 0) return null;
    return (
        <section className="space-y-3">
            <h2 className="text-base font-bold text-slate-900">Riwayat pembelian</h2>
            <ul className={`${CARD_CLASS} divide-y divide-slate-100`}>
                {rows.map((o) => (
                    <li key={o.id} className="px-4 py-3 text-sm">
                        <div className="flex items-baseline justify-between gap-3">
                            <p className="min-w-0 truncate font-semibold text-slate-900">{o.event.title}</p>
                            <span className="shrink-0 tabular-nums font-semibold text-slate-900">{o.amount_label}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                            {historyDate(o.paid_at || o.created_at)} · {o.kind === 'replay' ? 'Video kelas' : 'Tiket live'} ·{' '}
                            <span className={o.status === 'paid' ? 'text-emerald-700' : 'text-slate-500'}>
                                {o.status === 'paid' ? 'Lunas' : 'Tidak aktif'}
                            </span>
                        </p>
                        <p className="truncate font-mono text-[11px] text-slate-400">{o.invoice_number}</p>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function WebinarHubPage() {
    const [listing, setListing] = useState<WebinarListing | null>(null);
    const [mine, setMine] = useState<MyWebinarOrders | null>(null);
    const [failed, setFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchParams] = useSearchParams();
    const focusId = searchParams.get('tiket');
    const focusRef = useRef<HTMLDivElement | null>(null);
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

    // Datang dari checkout, callback DOKU, atau link lama: gulir ke kartunya.
    useEffect(() => {
        if (!loading && focusId) focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [loading, focusId]);

    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-jfu-primary" /></div>;
    }

    // Kedaluwarsa disembunyikan, kecuali yang sedang dituju (supaya ada "Pesan lagi").
    const visibleOrders = (mine?.orders ?? []).filter((o) => o.status !== 'expired' || o.id === focusId);
    const focusMissing = !!focusId && !!mine && !visibleOrders.some((o) => o.id === focusId);
    const events = listing ? [listing.hero, ...listing.upcoming, ...listing.videos].filter((e): e is WebinarEventView => !!e) : [];
    const ownedBySlug = new Map(visibleOrders.filter((o) => o.status === 'paid').map((o) => [o.event.slug, o]));

    return (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-8 space-y-6">
            <div>
                <h1 className="text-xl font-bold text-slate-900">Webinar</h1>
                <p className="text-sm text-slate-500">Tiket dan kelas dari JFU</p>
            </div>

            {failed && (
                <div className={`${CARD_CLASS} p-6 text-center text-sm text-slate-600`}>
                    Webinar belum bisa dimuat. Muat ulang beberapa saat lagi.
                </div>
            )}

            {!failed && (
                <>
                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-slate-900">Tiket &amp; video saya</h2>
                        {focusMissing && (
                            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
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
                                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                                        Belum Ada Tiket atau Video
                                    </h3>
                                    <p className="text-xs sm:text-sm text-slate-500 max-w-md mt-1.5 leading-relaxed">
                                        Tiket webinar dan rekaman video kelas yang kamu miliki akan tersimpan rapi di sini.
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
                                            <a
                                                href="#webinar-katalog"
                                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-jfu-primary hover:bg-jfu-dark text-white text-xs sm:text-sm font-semibold shadow-xs transition-all cursor-pointer"
                                            >
                                                <span>Jelajahi Webinar &amp; Kelas</span>
                                                <ArrowDown className="w-4 h-4" />
                                            </a>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </section>

                    <PurchaseHistory orders={mine?.orders ?? []} />

                    <section id="webinar-katalog" className="space-y-3">
                        <h2 className="text-base font-bold text-slate-900">Webinar &amp; kelas</h2>
                        {events.length > 0 ? (
                            <div className="grid gap-3 lg:grid-cols-2">
                                {events.map((e) => <OfferCard key={e.id} event={e} owned={ownedBySlug.get(e.slug)} />)}
                            </div>
                        ) : (
                            <Card className="border border-slate-200/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.03)] bg-white/95 rounded-2xl overflow-hidden">
                                <CardContent className="flex flex-col items-center justify-center py-10 md:py-12 px-6 text-center">
                                    <div className="w-14 h-14 rounded-2xl bg-amber-50/80 border border-amber-100 flex items-center justify-center text-amber-600 mb-4 shadow-xs">
                                        <Sparkles className="w-7 h-7 stroke-[1.75]" />
                                    </div>
                                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                                        Webinar Berikutnya Sedang Disiapkan
                                    </h3>
                                    <p className="text-xs sm:text-sm text-slate-500 max-w-md mt-1.5 leading-relaxed">
                                        Nantikan kelas riset, analisis data, dan sesi praktikum industri berikutnya. Ingin membahas topik tertentu?
                                    </p>

                                    <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
                                        <a
                                            href={`mailto:${ADMIN_EMAIL}?subject=Usulan%20Topik%20Webinar%20JFU`}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-jfu-primary text-white text-xs sm:text-sm font-semibold shadow-xs hover:bg-jfu-dark transition-all cursor-pointer"
                                        >
                                            <span>Usulkan Topik Webinar</span>
                                            <ChevronRight className="w-4 h-4" />
                                        </a>
                                        <Link
                                            to="/dashboard"
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs sm:text-sm font-semibold transition-all"
                                        >
                                            <LayoutDashboard className="w-4 h-4 text-slate-500" />
                                            <span>Kembali ke Dashboard</span>
                                        </Link>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </section>

                    <div className="pt-2">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-white/90 border border-slate-200/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] text-xs sm:text-sm text-slate-600">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-blue-50/80 border border-blue-100 flex items-center justify-center text-jfu-primary shrink-0 shadow-2xs">
                                    <Mail className="w-4 h-4" />
                                </div>
                                <span>Ada kendala atau pertanyaan seputar webinar?</span>
                            </div>
                            <a
                                href={`mailto:${ADMIN_EMAIL}`}
                                className="font-semibold text-jfu-primary hover:text-jfu-dark underline decoration-blue-200 hover:decoration-jfu-primary underline-offset-2 transition-colors inline-flex items-center gap-1"
                            >
                                <span>Hubungi admin di {ADMIN_EMAIL}</span>
                            </a>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
