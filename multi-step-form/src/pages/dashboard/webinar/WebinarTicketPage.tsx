import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { fetchMyWebinarOrders, syncWebinarOrder, type WebinarOrderView } from '@/utils/webinarApi';
import { AdminContactLine, CARD_CLASS } from '@/components/webinar/WebinarParts';

const POLL_MS = 5_000;
const SYNC_AFTER_MS = 60_000;

const formatCountdown = (ms: number) => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const calendarUrl = (order: WebinarOrderView) => {
    const { starts_at: start, duration_minutes: minutes, title } = order.event;
    if (!start || !order.join_url) return null;
    const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const from = new Date(start);
    const to = new Date(from.getTime() + (minutes || 60) * 60_000);
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: title,
        dates: `${stamp(from)}/${stamp(to)}`,
        details: `Link gabung pribadimu: ${order.join_url}`,
        location: order.join_url,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

export function WebinarTicketPage() {
    const { orderId = '' } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState<WebinarOrderView | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const openedAt = useRef(Date.now());
    const lastSync = useRef(0);

    const load = useCallback(async () => {
        const mine = await fetchMyWebinarOrders();
        const found = mine.orders.find((o) => o.id === orderId) ?? null;
        setOrder(found);
        setNotFound(!found);
        return found;
    }, [orderId]);

    useEffect(() => {
        load().catch((err) => console.error('[webinar]', err)).finally(() => setLoading(false));
    }, [load]);

    const isPending = order?.status === 'pending';

    useEffect(() => {
        if (!isPending) return undefined;
        const tick = setInterval(() => setNow(Date.now()), 1_000);
        const poll = setInterval(async () => {
            try {
                // Jaring pengaman bila notifikasi DOKU tidak datang; server membatasi lajunya.
                if (Date.now() - openedAt.current >= SYNC_AFTER_MS && Date.now() - lastSync.current >= SYNC_AFTER_MS) {
                    lastSync.current = Date.now();
                    await syncWebinarOrder(orderId);
                }
                await load();
            } catch (err) {
                console.error('[webinar]', err);
            }
        }, POLL_MS);
        return () => { clearInterval(tick); clearInterval(poll); };
    }, [isPending, orderId, load]);

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-7 h-7 animate-spin text-jfu-primary" /></div>;

    const shell = (children: React.ReactNode) => (
        <div className="max-w-md mx-auto px-4 py-6 md:py-10">
            <div className={`${CARD_CLASS} p-5 space-y-3`}>{children}</div>
            <Link to="/dashboard/webinar" className="block mt-4 text-center text-sm font-semibold text-jfu-primary">Kembali ke Webinar</Link>
        </div>
    );

    if (notFound || !order) {
        return shell(<p className="text-center text-slate-700">Tiket tidak ditemukan di akun ini. Cek akun yang tertulis di e-tiketmu.</p>);
    }

    const { event } = order;

    if (order.status === 'pending') {
        const left = new Date(order.payment_expires_at as string).getTime() - now;
        const checking = now - openedAt.current >= SYNC_AFTER_MS;
        return shell(
            <>
                <h1 className="text-lg font-bold text-slate-900">Selesaikan pembayaran</h1>
                <p className="text-3xl font-bold tabular-nums text-jfu-primary">{formatCountdown(left)}</p>
                <div>
                    <p className="font-semibold text-slate-900">{event.title}</p>
                    <p className="text-sm text-slate-600">{order.amount_label}</p>
                </div>
                {order.payment_url && (
                    <a href={order.payment_url} target="_blank" rel="noopener noreferrer" className="block rounded-xl bg-jfu-primary px-4 py-3 text-center font-semibold text-white">
                        Lanjutkan bayar
                    </a>
                )}
                {checking && (
                    <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="w-4 h-4 animate-spin" /> Memeriksa pembayaran…</p>
                )}
                <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                    <p className="font-semibold text-slate-700">Bayar di HP ini?</p>
                    <ol className="list-decimal pl-5">
                        <li>Screenshot kode QR</li>
                        <li>Buka e-wallet atau m-banking</li>
                        <li>Scan dari galeri</li>
                    </ol>
                </div>
                <p className="text-sm text-slate-600">Setelah bayar, tiket otomatis masuk email. Kamu boleh menutup halaman ini.</p>
                <AdminContactLine />
            </>,
        );
    }

    if (order.status === 'expired') {
        return shell(
            <>
                <h1 className="text-lg font-bold text-slate-900">Waktu bayar habis</h1>
                <p className="text-sm text-slate-600">Belum ada pembayaran yang masuk untuk {event.title}.</p>
                <button
                    type="button"
                    onClick={() => navigate(`/dashboard/webinar/beli/${event.slug}`)}
                    className="w-full rounded-xl bg-jfu-primary px-4 py-3 font-semibold text-white"
                >
                    Pesan lagi
                </button>
                <AdminContactLine />
            </>,
        );
    }

    if (order.status === 'refunded') {
        return shell(<p className="text-slate-700">Tiket tidak aktif. Hubungi admin bila ada pertanyaan.<br /><AdminContactLine className="mt-2" /></p>);
    }

    if (order.event_cancelled) {
        return shell(
            <>
                <h1 className="text-lg font-bold text-slate-900">Acara dibatalkan</h1>
                <p className="text-sm text-slate-600">{event.title} dibatalkan. Tim JFU akan menghubungimu.</p>
                <AdminContactLine />
            </>,
        );
    }

    const calendar = calendarUrl(order);
    return shell(
        <>
            <p className="flex items-center gap-2 font-bold text-emerald-700"><CheckCircle2 className="w-5 h-5" /> {order.kind === 'live' ? 'Tiketmu sudah terbit' : 'Pembelianmu berhasil'}</p>
            <h1 className="text-lg font-bold text-slate-900">{event.title}</h1>
            {event.schedule_label && <p className="text-sm text-slate-600">{event.schedule_label}</p>}
            {event.speakers.length > 0 && <p className="text-sm text-slate-600">{event.speakers.map((s) => s.name).filter(Boolean).join(' · ')}</p>}
            {order.ticket_code && <p className="text-sm text-slate-700">Kode: <strong className="tracking-wide">{order.ticket_code}</strong></p>}
            {order.kind === 'live' && order.join_url && !order.event_is_past && (
                <a href={order.join_url} target="_blank" rel="noopener noreferrer" className="block rounded-xl bg-jfu-primary px-4 py-3 text-center font-semibold text-white">Gabung ke webinar</a>
            )}
            {order.kind === 'live' && calendar && !order.event_is_past && (
                <a href={calendar} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-slate-200 px-4 py-3 text-center font-semibold text-slate-700">Tambah ke kalender</a>
            )}
            {order.event_is_past && <p className="text-sm text-slate-600">Rekaman segera tersedia di menu Webinar.</p>}
            <p className="text-sm text-slate-600">E-tiket dikirim ke {order.buyer_email}.</p>
            {!order.event_is_past && <p className="text-sm text-slate-600">Tidak bisa hadir? Sudah termasuk rekaman dan PPT.</p>}
            <AdminContactLine />
        </>,
    );
}
