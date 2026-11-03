import { CalendarDays, Clock, Ticket } from 'lucide-react';
import type { WebinarEventView } from '@/utils/webinarApi';

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
