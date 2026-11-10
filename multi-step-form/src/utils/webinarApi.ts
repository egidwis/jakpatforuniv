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
    /** Null untuk Video kelas: tidak ada jadwal live (Fase 5B). */
    schedule_label: string | null;
    short_date: string | null;
    starts_at: string | null;
    duration_minutes: number | null;
    seats_label: string | null;
    benefits: string[];
    recording_minutes?: number | null;
    /** Video kelas: "Video kelas · 88 menit". */
    kind_label?: string | null;
    /** Video kelas: webinar asal rekamannya (Iterasi 7, sql/137). */
    source_event_id?: string | null;
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

export type WebinarJoinPhase = 'before' | 'open' | 'after';

/** Jendela gabung dari server (functions/api/webinar/my.js → buildJoinView). */
export interface WebinarJoinView {
    phase: WebinarJoinPhase;
    opens_in_seconds: number;
    closes_in_seconds: number;
    /** "08.06 WIB" */
    opens_label: string;
    meeting_ready: boolean;
    /** Diisi klien saat respons tiba: hitungan server dipindah ke jam perangkat, jadi jam HP yang salah tidak menggeser hitung mundur. */
    opens_at_ms: number;
    closes_at_ms: number;
}

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
    join: WebinarJoinView | null;
    event: WebinarEventView;
    event_cancelled: boolean;
    event_is_past: boolean;
    paid_at?: string | null;
    created_at?: string;
    /** Fase 5A: keadaan rekaman (tanpa URL; URL hanya dari /api/webinar/watch). */
    recording?: { available: boolean; minutes: number | null; has_materials: boolean };
    watch_path?: string | null;
}

export interface MyWebinarOrders {
    email: string;
    orders: WebinarOrderView[];
}

export class WebinarApiError extends Error {
    code?: string;
    state?: string;
    orderId?: string;
    /** Jenis order pada penolakan halaman tonton (Fase 5B). */
    kind?: 'live' | 'replay' | null;
    status: number;
    constructor(message: string, status: number, data?: { code?: string; state?: string; orderId?: string; kind?: 'live' | 'replay' | null }) {
        super(message);
        this.status = status;
        this.code = data?.code;
        this.state = data?.state;
        this.orderId = data?.orderId;
        this.kind = data?.kind;
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

export const fetchMyWebinarOrders = () => call<MyWebinarOrders>('my', undefined, true).then((mine) => {
    const receivedAt = Date.now();
    return {
        ...mine,
        orders: (mine.orders ?? []).map((o) => (o.join ? {
            ...o,
            join: {
                ...o.join,
                opens_at_ms: receivedAt + o.join.opens_in_seconds * 1000,
                closes_at_ms: receivedAt + o.join.closes_in_seconds * 1000,
            },
        } : { ...o, join: o.join ?? null })),
    };
});

export function joinPhaseAt(join: WebinarJoinView, now: number): WebinarJoinPhase {
    if (now < join.opens_at_ms) return 'before';
    return now < join.closes_at_ms ? 'open' : 'after';
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "13 hari 15:30:33" atau "15:30:33"; sama dengan hitung mundur halaman publik. */
export function formatJoinCountdown(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const days = Math.floor(total / 86400);
    const clock = `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
    return days ? `${days} hari ${clock}` : clock;
}

/** Kalimat ringkas untuk baris tiket: "Ruang dibuka dalam 13 hari". */
export function joinOpensHint(ms: number): string {
    const minutes = Math.max(1, Math.ceil(ms / 60_000));
    if (minutes >= 24 * 60) return `Ruang dibuka dalam ${Math.floor(minutes / (24 * 60))} hari`;
    if (minutes >= 60) return `Ruang dibuka dalam ${Math.floor(minutes / 60)} jam`;
    return `Ruang dibuka dalam ${minutes} menit`;
}

export interface WebinarCheckoutResult {
    result: 'created' | 'reused' | 'already_owned';
    orderId: string;
    paymentUrl?: string;
    /** Iterasi 7: sudah punya lewat tiket webinar asal; orderId = tiket itu. */
    via?: 'source';
}

/** Kontak khusus order; null = sama dengan data akun (server membaca profil). */
export interface WebinarContact {
    name: string;
    email: string;
    phone: string;
}

export const startWebinarCheckout = (
    slug: string, marketingConsent: boolean, contact: WebinarContact | null = null, voucherCode = '',
) =>
    call<WebinarCheckoutResult>(
        'checkout',
        {
            method: 'POST',
            body: JSON.stringify({
                slug, termsAccepted: true, marketingConsent,
                ...(contact ? { contact } : {}),
                ...(voucherCode.trim() ? { voucherCode: voucherCode.trim() } : {}),
            }),
        },
        true,
    );

export type WebinarVoucherPreview =
    | { valid: true; code: string; label: string; price: number; discount: number; total: number; discount_label: string; total_label: string; message: string }
    | { valid: false; reason: 'unknown' | 'not_for_product' | 'expired'; message: string };

/** Pratinjau saja; harga yang ditagih tetap dihitung server saat checkout. */
export const previewWebinarVoucher = (slug: string, code: string) =>
    call<WebinarVoucherPreview>(`voucher?slug=${encodeURIComponent(slug)}&code=${encodeURIComponent(code.trim())}`, undefined, true);

/** Cermin parseCustomContact di functions/api/webinar/checkout.js; server tetap penentunya. */
export function webinarContactError(c: WebinarContact): string | null {
    const digits = c.phone.replace(/[^0-9]/g, '');
    if (!c.name.trim()) return 'Nama lengkap wajib diisi';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) return 'Email belum benar';
    if (!/^\+?[0-9\s-]+$/.test(c.phone.trim()) || digits.length < 8 || digits.length > 16) return 'No telepon belum benar';
    return null;
}

// ── Fase 5A: rekaman & materi ─────────────────────────────────────────────

export interface WebinarWatchView {
    /** Presigned URL R2, berlaku 3 jam; diminta ulang bila pemutar galat. */
    video_url: string;
    expires_at: string;
    minutes: number | null;
    has_materials: boolean;
    /** "email · 7F3A", dirender di atas video. */
    watermark: string;
    event: WebinarEventView;
}

export const fetchWatch = (orderId: string) =>
    call<WebinarWatchView>('watch', { method: 'POST', body: JSON.stringify({ orderId }) }, true);

export const fetchMaterialUrl = (orderId: string) =>
    call<{ url: string; file_name: string; expires_at: string }>('material', { method: 'POST', body: JSON.stringify({ orderId }) }, true);

/** Unduh materi tanpa membuka tab baru (signed URL membawa Content-Disposition attachment). */
export async function downloadMaterial(orderId: string): Promise<void> {
    const { url } = await fetchMaterialUrl(orderId);
    window.location.assign(url);
}

/** Riwayat pembelian (C15): hanya order lunas & refund, terbaru dulu. */
export function purchaseHistory(orders: WebinarOrderView[]): WebinarOrderView[] {
    const at = (o: WebinarOrderView) => Date.parse(o.paid_at || o.created_at || '') || 0;
    return orders.filter((o) => o.status === 'paid' || o.status === 'refunded').sort((a, b) => at(b) - at(a));
}

export const syncWebinarOrder = (orderId: string) =>
    call<{ status: string; checked: boolean }>(
        'sync',
        { method: 'POST', body: JSON.stringify({ orderId }) },
        true,
    );

/** Tiket di menu Webinar; kartunya disorot dan digulir ke layar. Tidak ada halaman tiket terpisah. */
export const webinarTicketHref = (orderId: string) => `/dashboard/webinar?tiket=${encodeURIComponent(orderId)}`;

/** Tiket yang masih relevan untuk ditampilkan di atas My Order. */
export function activeTickets(orders: WebinarOrderView[]): WebinarOrderView[] {
    return orders.filter((o) => o.status === 'paid' && o.kind === 'live' && !o.event_is_past && !o.event_cancelled);
}

/**
 * Sudah punya acara/Video kelas ini? Pembelian lunas acara itu sendiri, atau (Iterasi 7)
 * tiket live lunas di webinar asal Video kelas: rekamannya sudah ada di tiket itu.
 * Webinar asal yang batal tidak dihitung, karena rekamannya tidak tersedia. Server
 * (checkout.js) tetap penentu; ini hanya supaya tombol beli tidak pernah tampil.
 */
export function ownedFor(
    event: Pick<WebinarEventView, 'id' | 'source_event_id'>,
    orders: WebinarOrderView[],
): { order: WebinarOrderView; viaSource: boolean } | null {
    const own = orders.find((o) => o.status === 'paid' && o.event.id === event.id);
    if (own) return { order: own, viaSource: false };
    if (!event.source_event_id) return null;
    const ticket = orders.find((o) => o.status === 'paid' && o.kind === 'live' && !o.event_cancelled
        && o.event.id === event.source_event_id);
    return ticket ? { order: ticket, viaSource: true } : null;
}

export function checkoutErrorText(err: unknown): string {
    if (err instanceof WebinarApiError) {
        if (err.code === 'preparing') return 'Tagihan sedang disiapkan. Coba lagi beberapa detik.';
        if (err.code === 'doku_failed') return 'Pembayaran belum bisa dibuat. Coba lagi beberapa saat.';
        if (err.code === 'voucher_invalid' || err.code === 'contact_invalid') return err.message;
        if (err.code === 'not_for_sale') {
            if (err.state === 'seats_held') return 'Kursi sedang ditahan pembeli lain, coba lagi beberapa menit.';
            // Tidak setiap webinar punya Video kelas, jadi rekaman tidak dijanjikan (Iterasi 7).
            if (err.state === 'sold_out') return 'Kursi live habis.';
            if (err.state === 'coming_soon') return 'Penjualan belum dibuka.';
            return 'Penjualan ditutup.';
        }
        return err.message;
    }
    return 'Terjadi kendala. Coba lagi beberapa saat.';
}
