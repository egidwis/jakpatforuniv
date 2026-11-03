import { supabase } from './supabase';

/** Isi tampilan dari `functions/api/webinar/_view.js`. Aturannya tidak ditulis ulang di sini. */
export interface WebinarEventView {
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    poster_url: string | null;
    speakers: { name?: string; title?: string; photo_url?: string }[];
    kind: 'live' | 'replay';
    state: string;
    badge: string;
    tone: 'on_sale' | 'soon' | 'held' | 'ended';
    note: string | null;
    can_buy: boolean;
    buy_label: string;
    buy_url: string;
    detail_url: string;
    price_label: string | null;
    schedule_label: string | null;
    short_date: string | null;
    starts_at: string | null;
    duration_minutes: number | null;
    seats_label: string | null;
    benefits: string[];
}

export interface WebinarListing {
    hero: WebinarEventView | null;
    upcoming: WebinarEventView[];
    videos: WebinarEventView[];
    homepage: WebinarEventView[];
    dashboard_row: WebinarEventView | null;
    /** false selama masa uji untuk akun di luar daftar izin. */
    open?: boolean;
}

export type WebinarOrderStatus = 'pending' | 'paid' | 'expired' | 'refunded';

export interface WebinarOrderView {
    id: string;
    kind: 'live' | 'replay';
    status: WebinarOrderStatus;
    amount_label: string;
    invoice_number: string;
    ticket_code: string | null;
    buyer_email: string;
    payment_url: string | null;
    payment_expires_at: string | null;
    join_url: string | null;
    event: WebinarEventView;
    event_cancelled: boolean;
    event_is_past: boolean;
}

export interface MyWebinarOrders {
    email: string;
    orders: WebinarOrderView[];
}

export class WebinarApiError extends Error {
    code?: string;
    state?: string;
    orderId?: string;
    status: number;
    constructor(message: string, status: number, data?: { code?: string; state?: string; orderId?: string }) {
        super(message);
        this.status = status;
        this.code = data?.code;
        this.state = data?.state;
        this.orderId = data?.orderId;
    }
}

async function call<T>(path: string, init?: RequestInit, withAuth = false): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (withAuth) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    }
    const res = await fetch(`/api/webinar/${path}`, { ...init, headers });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new WebinarApiError(body?.error || 'Terjadi kendala. Coba lagi beberapa saat.', res.status, body);
    // 200 tanpa JSON (mis. index.html SPA saat Function tidak terpasang) bukan keadaan kosong.
    if (body === null || typeof body !== 'object') {
        throw new WebinarApiError('Terjadi kendala. Coba lagi beberapa saat.', res.status, { code: 'bad_response' });
    }
    return body as T;
}

// Sesi ikut dikirim: selama masa uji (src/utils/webinarAccess.ts) server hanya
// membuka isi untuk akun yang diizinkan.
export const fetchWebinarListing = () => call<WebinarListing>('events', undefined, true);

export const fetchWebinarEvent = (slug: string) =>
    call<{ event: WebinarEventView }>(`event?slug=${encodeURIComponent(slug)}`, undefined, true).then((r) => r.event);

export const fetchMyWebinarOrders = () => call<MyWebinarOrders>('my', undefined, true);

export interface WebinarCheckoutResult {
    result: 'created' | 'reused' | 'already_owned';
    orderId: string;
    paymentUrl?: string;
}

export const startWebinarCheckout = (slug: string, marketingConsent: boolean) =>
    call<WebinarCheckoutResult>(
        'checkout',
        { method: 'POST', body: JSON.stringify({ slug, termsAccepted: true, marketingConsent }) },
        true,
    );

export const syncWebinarOrder = (orderId: string) =>
    call<{ status: string; checked: boolean }>(
        'sync',
        { method: 'POST', body: JSON.stringify({ orderId }) },
        true,
    );

/** Tiket yang masih relevan untuk ditampilkan di atas My Order. */
export function activeTickets(orders: WebinarOrderView[]): WebinarOrderView[] {
    return orders.filter((o) => o.status === 'paid' && o.kind === 'live' && !o.event_is_past && !o.event_cancelled);
}

export function checkoutErrorText(err: unknown): string {
    if (err instanceof WebinarApiError) {
        if (err.code === 'preparing') return 'Tagihan sedang disiapkan. Coba lagi beberapa detik.';
        if (err.code === 'doku_failed') return 'Pembayaran belum bisa dibuat. Coba lagi beberapa saat.';
        if (err.code === 'not_for_sale') {
            if (err.state === 'seats_held') return 'Kursi sedang ditahan pembeli lain, coba lagi beberapa menit.';
            if (err.state === 'sold_out') return 'Kursi live habis. Rekaman bisa dibeli setelah acara.';
            if (err.state === 'coming_soon') return 'Penjualan belum dibuka.';
            return 'Penjualan ditutup.';
        }
        return err.message;
    }
    return 'Terjadi kendala. Coba lagi beberapa saat.';
}
