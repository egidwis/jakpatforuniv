import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, Ticket } from 'lucide-react';
import { joinOpensHint, joinPhaseAt, webinarTicketHref, type WebinarEventView, type WebinarOrderView } from '@/utils/webinarApi';

const TONE: Record<WebinarEventView['tone'], string> = {
    on_sale: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    soon: 'bg-blue-50 text-blue-700 border-blue-200',
    held: 'bg-amber-50 text-amber-800 border-amber-200',
    ended: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const CARD_CLASS =
    'rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.03),0_4px_12px_-2px_rgba(0,0,0,0.02)]';

export function WebinarBadge({ event }: { event: Pick<WebinarEventView, 'tone' | 'badge'> }) {
    return (
        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE[event.tone]}`}>
            {event.badge}
        </span>
    );
}

export function WebinarPoster({ event, className = '' }: { event: Pick<WebinarEventView, 'poster_url' | 'title'>; className?: string }) {
    return event.poster_url ? (
        <img src={event.poster_url} alt={event.title} loading="lazy" className={`aspect-video w-full rounded-xl object-cover bg-blue-50 ${className}`} />
    ) : (
        <div className={`aspect-video w-full rounded-xl bg-blue-50 p-2 text-center text-xs font-semibold text-jfu-primary flex items-center justify-center ${className}`}>
            {event.title}
        </div>
    );
}

export function WebinarMeta({ event }: { event: WebinarEventView }) {
    return (
        <ul className="space-y-1 text-sm text-slate-600">
            {event.schedule_label && (
                <li className="flex items-start gap-2"><CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />{event.schedule_label}</li>
            )}
            {/* Video kelas (Fase 5B): durasi rekaman dan tanggal rekamnya, bukan jadwal live. */}
            {event.kind === 'replay' && event.kind_label && (
                <li className="flex items-start gap-2">
                    <Clock className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                    {[event.kind_label, event.recorded_label].filter(Boolean).join(' · ')}
                </li>
            )}
            {event.note && event.state !== 'on_sale' && (
                <li className="flex items-start gap-2"><Clock className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />{event.note}</li>
            )}
            {event.seats_label && (
                <li className="flex items-start gap-2"><Ticket className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />{event.seats_label}</li>
            )}
        </ul>
    );
}

export const ADMIN_EMAIL = 'product@jakpat.net';

export function AdminContactLine({ className = '' }: { className?: string }) {
    return (
        <p className={`text-sm text-slate-500 ${className}`}>
            Ada kendala? Hubungi admin di{' '}
            <a className="font-medium text-jfu-primary underline" href={`mailto:${ADMIN_EMAIL}`}>{ADMIN_EMAIL}</a>
        </p>
    );
}

/** Jam yang berdetak selama `enabled`; untuk hitung mundur dan pergantian keadaan ruang gabung. */
export function useNow(enabled: boolean, intervalMs = 1_000): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!enabled) return undefined;
        setNow(Date.now());
        const tick = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(tick);
    }, [enabled, intervalMs]);
    return now;
}

type RowState = { hint: string | null; tone: string; join: boolean; action: string };

function ticketRowState(order: WebinarOrderView, now: number): RowState {
    const plain = (hint: string | null, tone = 'text-slate-500', action = 'Lihat'): RowState => ({ hint, tone, join: false, action });
    if (order.event_cancelled) return plain('Acara dibatalkan');
    if (order.status === 'pending') return plain('Menunggu pembayaran', 'text-amber-700', 'Lanjutkan bayar');
    if (order.status === 'refunded') return plain('Tiket tidak aktif');
    if (order.status !== 'paid') return plain('Waktu bayar habis');
    if (!order.join) return plain(order.event_is_past ? 'Rekaman segera tersedia' : null);
    const phase = joinPhaseAt(order.join, now);
    if (phase === 'before') return plain(joinOpensHint(order.join.opens_at_ms - now));
    if (phase === 'after') return plain('Rekaman segera tersedia');
    return order.join.meeting_ready && order.join_url
        ? { hint: 'Sedang berlangsung', tone: 'text-emerald-700 font-semibold', join: true, action: 'Gabung' }
        : plain('Link sedang disiapkan', 'text-amber-700');
}

/**
 * Satu baris tiket di beranda (di atas My Order). Hitung mundur dan kalender ada di kartu
 * tiket di menu Webinar; baris ini menunjuk ke sana, kecuali saat ruang dibuka: tombol
 * Gabung langsung ke link gabung.
 */
export function WebinarTicketRow({ order, prefix }: { order: WebinarOrderView; prefix?: string }) {
    const live = order.status === 'paid' && !!order.join;
    // Per 30 detik cukup untuk "dibuka dalam N menit" dan pergantian ke Gabung.
    const now = useNow(live, 30_000);
    const state = ticketRowState(order, now);
    const ticketUrl = webinarTicketHref(order.id);
    return (
        <div className={`${CARD_CLASS} flex items-center gap-3 px-4 py-3 hover:border-jfu-primary/50 transition-colors`}>
            <Ticket className="w-4 h-4 shrink-0 text-jfu-primary" />
            <Link to={ticketUrl} className="flex-1 min-w-0 text-sm text-slate-700">
                <span className="block">
                    {prefix && <span className="font-semibold">{prefix} </span>}{order.event.title}
                </span>
                {order.event.schedule_label && <span className="block text-xs text-slate-500">{order.event.schedule_label}</span>}
                {state.hint && <span className={`block text-xs ${state.tone}`}>{state.hint}</span>}
            </Link>
            {state.join ? (
                <a href={order.join_url as string} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-xl bg-jfu-primary px-4 py-2 text-sm font-semibold text-white">
                    Gabung
                </a>
            ) : (
                <Link to={ticketUrl} className="shrink-0 text-sm font-semibold text-jfu-primary">{state.action} →</Link>
            )}
        </div>
    );
}
