import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { getOwnProfile, isProfileComplete, type ResearcherProfile } from '@/utils/supabase';
import { createInFlightGate } from '@/utils/inFlightGate';
import {
    checkoutErrorText, fetchMyWebinarOrders, fetchWebinarEvent, startWebinarCheckout,
    WebinarApiError, type WebinarCheckoutResult, type WebinarEventView,
} from '@/utils/webinarApi';
import { ProfileCompletionSheet } from '@/components/ProfileCompletionSheet';
import { AdminContactLine, ADMIN_EMAIL, CARD_CLASS, WebinarBadge, WebinarPoster } from '@/components/webinar/WebinarParts';

export function WebinarCheckoutPage() {
    const { slug = '' } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [event, setEvent] = useState<WebinarEventView | null>(null);
    const [profile, setProfile] = useState<ResearcherProfile | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [terms, setTerms] = useState(false);
    const [consent, setConsent] = useState(false);
    const [paying, setPaying] = useState(false);
    const [profileSheet, setProfileSheet] = useState(false);
    const gate = useMemo(() => createInFlightGate<WebinarCheckoutResult>(), []);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [ev, mine, own] = await Promise.all([fetchWebinarEvent(slug), fetchMyWebinarOrders(), getOwnProfile()]);
                if (!alive) return;
                // Pending dan lunas sama-sama punya halaman sendiri; jangan menawarkan bayar lagi.
                const existing = mine.orders.find((o) => o.event.slug === slug && (o.status === 'paid' || o.status === 'pending'));
                if (existing && (existing.status === 'pending' || existing.kind === 'live' || ev.kind === 'replay')) {
                    navigate(`/dashboard/webinar/tiket/${existing.id}`, { replace: true });
                    return;
                }
                setEvent(ev);
                setProfile(own);
                if (!isProfileComplete(own)) setProfileSheet(true);
            } catch (err) {
                if (alive) setLoadError(err instanceof WebinarApiError && err.status === 404 ? 'Acara tidak ditemukan.' : 'Halaman belum bisa dimuat. Coba lagi beberapa saat.');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [slug, navigate]);

    const reloadProfile = async () => {
        const own = await getOwnProfile();
        setProfile(own);
        setProfileSheet(false);
    };

    const pay = async () => {
        if (!terms || paying) return;
        if (!isProfileComplete(profile)) {
            setProfileSheet(true);
            return;
        }
        // Tab dibuka sebelum await supaya tidak kena pemblokir popup.
        const tab = window.open('about:blank', '_blank');
        setPaying(true);
        try {
            const result = await gate.run(() => startWebinarCheckout(slug, consent));
            if (result.paymentUrl) {
                if (tab) tab.location.href = result.paymentUrl;
                else {
                    window.location.href = result.paymentUrl;
                    return;
                }
            } else {
                tab?.close();
            }
            navigate(`/dashboard/webinar/tiket/${result.orderId}`, { replace: true });
        } catch (err) {
            tab?.close();
            if (err instanceof WebinarApiError && err.code === 'profile_incomplete') {
                setProfileSheet(true);
            } else {
                toast.error(checkoutErrorText(err));
            }
            setPaying(false);
        }
    };

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-jfu-primary" /></div>;

    if (loadError || !event) {
        return (
            <div className="max-w-xl mx-auto px-4 py-10 text-center space-y-3">
                <p className="text-slate-700">{loadError ?? 'Acara tidak ditemukan.'}</p>
                <Link className="font-semibold text-jfu-primary" to="/dashboard/webinar">Kembali ke Webinar</Link>
            </div>
        );
    }

    const email = user?.email ?? '';
    const summary = (
        <div className={`${CARD_CLASS} p-4 space-y-3`}>
            <WebinarPoster event={event} />
            <WebinarBadge event={event} />
            <h2 className="font-bold text-slate-900 leading-snug">{event.title}</h2>
            {event.schedule_label && <p className="text-sm text-slate-600">{event.schedule_label}</p>}
            <div className="border-t border-slate-100 pt-3 flex items-baseline justify-between">
                <span className="text-sm text-slate-600">{event.kind === 'live' ? 'Tiket' : 'Video kelas'}</span>
                <span className="text-right">
                    <span className="block font-bold text-slate-900">{event.price_label}</span>
                    <span className="block text-xs text-slate-500">sudah termasuk PPN 11%</span>
                </span>
            </div>
        </div>
    );

    const payButton = (
        <button
            type="button"
            onClick={pay}
            disabled={!terms || paying || !event.can_buy}
            className="w-full rounded-xl bg-jfu-primary px-4 py-3 font-semibold text-white disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
            {paying && <Loader2 className="w-4 h-4 animate-spin" />}
            Bayar
        </button>
    );

    return (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-8 pb-28 lg:pb-8 space-y-4">
            <Link to="/dashboard/webinar" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500">
                <ArrowLeft className="w-4 h-4" /> Kembali
            </Link>
            <h1 className="text-xl font-bold text-slate-900">Konfirmasi {event.kind === 'live' ? 'tiket' : 'pembelian'}</h1>

            {!event.can_buy && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {event.note ?? 'Penjualan belum dibuka.'}
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-12 items-start">
                <div className="lg:col-span-7 space-y-4 order-2 lg:order-1">
                    <section className={`${CARD_CLASS} p-4 space-y-1`}>
                        <h2 className="font-bold text-slate-900">Data peserta</h2>
                        <p className="text-sm text-slate-700">{profile?.full_name || '—'}</p>
                        <p className="text-sm text-slate-600">
                            {[profile?.phone_number, profile?.university, profile?.department, profile?.status].filter(Boolean).join(' · ')}
                        </p>
                        <button type="button" onClick={() => setProfileSheet(true)} className="text-sm font-semibold text-jfu-primary">Ubah profil</button>
                    </section>

                    <section className={`${CARD_CLASS} p-4 space-y-1`}>
                        <p className="text-sm text-slate-700">{event.kind === 'live' ? 'E-tiket' : 'Bukti pembelian'} dikirim ke <strong>{email}</strong></p>
                        <p className="text-sm text-slate-500">
                            Salah alamat? <a className="font-medium text-jfu-primary underline" href={`mailto:${ADMIN_EMAIL}`}>Hubungi admin</a>
                        </p>
                    </section>

                    <section className={`${CARD_CLASS} p-4 space-y-3`}>
                        <label className="flex items-start gap-2.5 text-sm text-slate-700">
                            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                                Saya menyetujui{' '}
                                <a className="font-medium text-jfu-primary underline" href="https://jakpatforuniv.com/terms-conditions.html#webinar" target="_blank" rel="noopener noreferrer">Syarat &amp; Ketentuan</a>
                                , termasuk bahwa sesi direkam dan rekamannya dijual.
                            </span>
                        </label>
                        <label className="flex items-start gap-2.5 text-sm text-slate-700">
                            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>Saya setuju dihubungi JFU lewat email/WhatsApp tentang webinar berikutnya (opsional).</span>
                        </label>
                        <AdminContactLine />
                    </section>
                </div>

                <aside className="lg:col-span-5 lg:sticky lg:top-24 space-y-3 order-1 lg:order-2">
                    {summary}
                    <div className="max-lg:hidden">{payButton}</div>
                </aside>
            </div>

            <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-3">
                    <span className="shrink-0">
                        <span className="block font-bold text-slate-900">{event.price_label}</span>
                        <span className="block text-xs text-slate-500">QRIS</span>
                    </span>
                    {payButton}
                </div>
            </div>

            <ProfileCompletionSheet open={profileSheet} onOpenChange={setProfileSheet} onCompleted={reloadProfile} />
        </div>
    );
}
