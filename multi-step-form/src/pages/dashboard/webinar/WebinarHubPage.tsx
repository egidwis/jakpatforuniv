import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
    fetchMyWebinarOrders, fetchWebinarListing,
    type MyWebinarOrders, type WebinarEventView, type WebinarListing, type WebinarOrderView,
} from '@/utils/webinarApi';
import { AdminContactLine, CARD_CLASS, WebinarBadge, WebinarMeta, WebinarPoster, WebinarTicketRow } from '@/components/webinar/WebinarParts';

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
                    <Link to={`/dashboard/webinar/tiket/${owned.id}`} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Lihat tiket</Link>
                ) : event.can_buy ? (
                    <Link to={`/dashboard/webinar/beli/${event.slug}`} className="rounded-xl bg-jfu-primary px-4 py-2 text-sm font-semibold text-white">{event.buy_label}</Link>
                ) : <span />}
                <a href={event.detail_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-jfu-primary">Detail →</a>
            </div>
        </article>
    );
}

export function WebinarHubPage() {
    const [listing, setListing] = useState<WebinarListing | null>(null);
    const [mine, setMine] = useState<MyWebinarOrders | null>(null);
    const [failed, setFailed] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        Promise.all([fetchWebinarListing(), fetchMyWebinarOrders()])
            .then(([l, m]) => { if (alive) { setListing(l); setMine(m); } })
            .catch((err) => { console.error('[webinar]', err); if (alive) setFailed(true); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-jfu-primary" /></div>;
    }

    const visibleOrders = (mine?.orders ?? []).filter((o) => o.status !== 'expired');
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
                        <h2 className="text-base font-bold text-slate-900">Tiket saya</h2>
                        {visibleOrders.length > 0 ? (
                            <div className="space-y-2">{visibleOrders.map((o) => <WebinarTicketRow key={o.id} order={o} />)}</div>
                        ) : (
                            <p className="text-sm text-slate-500">
                                Belum ada tiket di akun {mine?.email}. Beli dengan akun lain? Cek e-tiketmu untuk melihat akun yang dipakai.
                            </p>
                        )}
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-base font-bold text-slate-900">Webinar &amp; kelas</h2>
                        {events.length > 0 ? (
                            <div className="grid gap-3 lg:grid-cols-2">
                                {events.map((e) => <OfferCard key={e.id} event={e} owned={ownedBySlug.get(e.slug)} />)}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500">Webinar berikutnya sedang disiapkan. Cek lagi nanti ya.</p>
                        )}
                    </section>
                    <AdminContactLine />
                </>
            )}
        </div>
    );
}
