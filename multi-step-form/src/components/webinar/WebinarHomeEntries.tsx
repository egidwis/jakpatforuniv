import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Ticket } from 'lucide-react';
import { activeTickets, fetchMyWebinarOrders, fetchWebinarListing, type WebinarEventView, type WebinarOrderView } from '@/utils/webinarApi';
import { WebinarTicketRow } from './WebinarParts';
import { useWebinarOpen } from './WebinarGate';

/**
 * Pintu sekunder di beranda: satu baris di bawah Chat Mimin, hanya saat ada yang
 * bisa dibeli. Gagal memuat berarti tidak tampil, bukan menampilkan galat, karena
 * webinar bukan tujuan utama halaman ini.
 */
export function WebinarFooterRow({ onNavigate }: { onNavigate?: () => void }) {
    const [row, setRow] = useState<WebinarEventView | null>(null);
    const open = useWebinarOpen();

    useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        fetchWebinarListing()
            .then((listing) => { if (alive) setRow(listing.dashboard_row); })
            .catch((err) => console.error('[webinar] daftar gagal dimuat:', err));
        return () => { alive = false; };
    }, [open]);

    if (!open || !row) return null;

    return (
        <Link
            to="/dashboard/webinar"
            onClick={onNavigate}
            className="group flex items-center gap-2 px-4 sm:px-5 py-3 border-t border-slate-100 bg-slate-50/50 hover:bg-slate-100/60 text-xs font-medium text-slate-500 hover:text-jfu-primary transition-colors"
        >
            <Ticket className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 min-w-0 truncate">
                Webinar: {row.title}{row.short_date ? ` · ${row.short_date}` : ''}
            </span>
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-300 group-hover:text-jfu-primary" />
        </Link>
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
