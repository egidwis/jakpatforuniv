import { useEffect, useState } from 'react';
import { Calendar, X } from 'lucide-react';
import {
    activeTickets, fetchMyWebinarOrders, fetchWebinarListing,
    type WebinarEventView, type WebinarOrderView,
} from '@/utils/webinarApi';
import { useLanguage } from '@/i18n/LanguageContext';
import { WebinarTicketRow } from './WebinarParts';
import { useWebinarOpen } from './WebinarGate';

const DISMISS_PREFIX = 'jfu-dashboard-webinar-dismissed-';
const DISMISS_EVENT = 'jfu-webinar-card-dismissed';
let cachedListingPromise: Promise<WebinarEventView | null> | null = null;

function isDismissed(key: string): boolean {
    try {
        return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}

function markDismissed(key: string): void {
    try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(key, '1');
    } catch {
        // Ignore storage restrictions
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(DISMISS_EVENT, { detail: key }));
    }
}

function loadPrimaryWebinar(force = false): Promise<WebinarEventView | null> {
    if (!cachedListingPromise || force) {
        cachedListingPromise = fetchWebinarListing()
            .then((listing) => listing.dashboard_row ?? null)
            .catch((err) => {
                cachedListingPromise = null;
                throw err;
            });
    }
    return cachedListingPromise;
}

const BADGE_TONE: Record<string, string> = {
    on_sale: 'bg-[#DCFCE7] text-[#166534]',
    soon: 'bg-[#EFF6FF] text-[#1E40AF]',
    held: 'bg-[#FEF3C7] text-[#B45309]',
};

/**
 * Tampilan murni kartu pengumuman webinar yang dapat ditutup.
 * - `variant="sidebar"`: diletakkan tepat di bawah kartu "Buat Order Baru" (desktop & empty state).
 * - `variant="floating"`: kartu mengambang kiri bawah di ponsel saat sidebar CreateOrder disembunyikan.
 */
export function WebinarFloatCardView({
    event,
    onClose,
    variant = 'sidebar',
    hasMobileFab = false,
}: {
    event: WebinarEventView;
    onClose: () => void;
    variant?: 'sidebar' | 'floating';
    /** Di ponsel saat FAB "Order baru" tampil (kanan bawah), angkat posisi kartu agar tidak bertumpuk. */
    hasMobileFab?: boolean;
}) {
    const { language } = useLanguage();
    const isEn = language === 'en';
    const [posterRatio, setPosterRatio] = useState<string | undefined>(undefined);
    const hasPoster = /^https:\/\//i.test(event.poster_url || '');
    const metaText = event.schedule_label || event.kind_label || event.note || '';
    const badgeClass = BADGE_TONE[event.tone] ?? 'bg-slate-100 text-slate-700';

    const bottomClass = hasMobileFab
        ? 'bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+4rem)]'
        : 'bottom-3 sm:bottom-5';

    const isSidebar = variant === 'sidebar';
    const Wrapper = isSidebar ? 'section' : 'aside';
    const containerClass = isSidebar
        ? 'relative w-full rounded-2xl border border-blue-200/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.92)_0%,rgba(239,246,255,0.84)_100%)] backdrop-blur-xl backdrop-saturate-150 p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.03),0_8px_22px_-8px_rgba(25,118,210,0.14)] hover:border-blue-300 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 transition-all duration-200 animate-fade-in'
        : `fixed left-3 right-3 sm:left-5 sm:right-auto ${bottomClass} sm:w-[300px] max-w-[calc(100vw-1.5rem)] z-40 rounded-[18px] border border-white/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.9)_0%,rgba(239,246,255,0.8)_100%)] backdrop-blur-xl backdrop-saturate-150 p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.98),inset_0_-1px_1px_rgba(191,219,254,0.45),0_18px_38px_-12px_rgba(15,23,42,0.2),0_0_0_1px_rgba(25,118,210,0.14)] hover:border-blue-300 transition-all duration-200 animate-fade-in`;

    return (
        <Wrapper
            aria-label={isEn ? 'Upcoming webinar announcement' : 'Pengumuman webinar mendatang'}
            aria-labelledby={`dashboard-webinar-float-title-${variant}`}
            className={containerClass}
        >
            <button
                type="button"
                onClick={onClose}
                aria-label={isEn ? 'Dismiss webinar announcement' : 'Tutup pengumuman webinar'}
                title={isEn ? 'Close' : 'Tutup'}
                className="absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-full border border-slate-200/80 bg-white/85 hover:bg-white hover:border-slate-300 text-slate-500 hover:text-slate-900 inline-flex items-center justify-center shadow-[0_1px_3px_rgba(15,23,42,0.06)] transition-colors cursor-pointer"
            >
                <X className="w-3.5 h-3.5" strokeWidth={2.4} aria-hidden="true" />
            </button>

            <div className="flex flex-col gap-2">
                <div className="flex items-center flex-wrap gap-1.5 min-h-[20px] pr-7">
                    <span className={`inline-block text-[10px] font-extrabold uppercase tracking-[0.04em] px-2 py-0.5 rounded-full ${badgeClass}`}>
                        {event.badge || 'Webinar'}
                    </span>
                    {event.seats_label && (
                        <span className="text-[11px] font-bold text-[#B45309]">
                            {event.seats_label}
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-[88px_1fr] items-center gap-2.5">
                    {hasPoster ? (
                        <img
                            src={event.poster_url as string}
                            alt={event.title || 'Poster Webinar'}
                            width={1280}
                            height={720}
                            decoding="async"
                            style={posterRatio ? { aspectRatio: posterRatio } : undefined}
                            onLoad={(e) => {
                                const img = e.currentTarget;
                                if (img.naturalWidth && img.naturalHeight) {
                                    setPosterRatio(`${img.naturalWidth} / ${img.naturalHeight}`);
                                }
                            }}
                            className="w-[88px] h-auto aspect-video rounded-[10px] object-cover block border border-slate-900/10 bg-blue-50"
                        />
                    ) : (
                        <div
                            aria-hidden="true"
                            className="w-[88px] aspect-video rounded-[10px] bg-blue-50 border border-blue-200/70 text-jfu-primary flex items-center justify-center"
                        >
                            <Calendar className="w-5 h-5" />
                        </div>
                    )}

                    <div className="min-w-0 flex flex-col gap-0.5">
                        <h3
                            id={`dashboard-webinar-float-title-${variant}`}
                            className="text-[13.5px] font-extrabold text-slate-900 leading-snug truncate"
                        >
                            <a
                                href={event.detail_url || '/webinar'}
                                className="text-inherit no-underline focus:outline-none after:content-[''] after:absolute after:inset-0 after:rounded-2xl"
                            >
                                {event.title}
                            </a>
                        </h3>

                        {metaText && (
                            <p className="text-[11px] text-slate-600 leading-snug truncate m-0">
                                {metaText}
                            </p>
                        )}

                        <div className="flex items-baseline justify-between gap-2 mt-1">
                            {event.price_label ? (
                                <span className="text-xs font-extrabold text-slate-900 tabular-nums">
                                    {event.price_label}
                                </span>
                            ) : <span />}
                            <span aria-hidden="true" className="text-[11.5px] font-bold text-jfu-dark whitespace-nowrap">
                                {isEn ? 'View' : 'Lihat'} →
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </Wrapper>
    );
}

/**
 * Kartu webinar yang sedang dijual (dapat ditutup per sesi).
 * Ditempatkan tepat di bawah kartu "Buat Order Baru" di desktop, dan mengambang
 * di ponsel saat kartu "Buat Order Baru" disembunyikan.
 */
export function WebinarFloatCard({
    variant = 'sidebar',
    hasMobileFab = false,
}: {
    variant?: 'sidebar' | 'floating';
    hasMobileFab?: boolean;
}) {
    const [row, setRow] = useState<WebinarEventView | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const open = useWebinarOpen();

    useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        loadPrimaryWebinar()
            .then((primary) => {
                if (!alive || !primary) return;
                const key = `${DISMISS_PREFIX}${primary.slug || primary.id || 'active'}`;
                if (isDismissed(key)) return;
                setRow(primary);
            })
            .catch((err) => console.error('[webinar] daftar gagal dimuat:', err));
        return () => { alive = false; };
    }, [open]);

    useEffect(() => {
        if (!row) return undefined;
        const activeKey = `${DISMISS_PREFIX}${row.slug || row.id || 'active'}`;
        const onOtherDismissed = (e: Event) => {
            if ((e as CustomEvent<string>).detail === activeKey) setDismissed(true);
        };
        window.addEventListener(DISMISS_EVENT, onOtherDismissed);
        return () => window.removeEventListener(DISMISS_EVENT, onOtherDismissed);
    }, [row]);

    if (!open || !row || dismissed) return null;

    const handleClose = () => {
        const key = `${DISMISS_PREFIX}${row.slug || row.id || 'active'}`;
        markDismissed(key);
        setDismissed(true);
    };

    return (
        <WebinarFloatCardView
            event={row}
            onClose={handleClose}
            variant={variant}
            hasMobileFab={hasMobileFab}
        />
    );
}

/** Akses ke tiket yang sudah dibayar, di atas My Order. Akun tanpa tiket tidak melihatnya. */
export function WebinarTicketStrip({ className = '' }: { className?: string }) {
    const [tickets, setTickets] = useState<WebinarOrderView[]>([]);
    const open = useWebinarOpen();

    useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        fetchMyWebinarOrders()
            .then((data) => { if (alive) setTickets(activeTickets(data.orders).slice(0, 2)); })
            .catch((err) => console.error('[webinar] tiket gagal dimuat:', err));
        return () => { alive = false; };
    }, [open]);

    if (!open || tickets.length === 0) return null;

    return (
        <div className={`space-y-2 ${className}`}>
            {tickets.map((order) => <WebinarTicketRow key={order.id} order={order} prefix="Tiketmu:" />)}
        </div>
    );
}
