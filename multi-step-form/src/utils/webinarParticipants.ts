// Logika murni halaman Peserta di menu Webinar admin (Fase 3, rencana "Iterasi 6 Nov").
// Tanpa React dan tanpa supabase, supaya bisa diuji unit (webinarParticipants.spec.ts).
// Data datang dari /api/admin/webinar aksi `participants`.

import type { WebinarOfferState } from './webinarAdmin';

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded';
export type ParticipantGroup = 'paid' | 'unpaid' | 'refunded';
export type BroadcastKind = 'reminder_day' | 'schedule_change' | 'cancellation';
export type DeliveryStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';
export type Tone = 'ok' | 'warn' | 'muted';

/** Order seperti dikirim aksi `participants` (tanpa link bayar dan token mentah). */
export interface AdminWebinarOrder {
    id: string;
    event_id: string;
    kind: 'live' | 'replay';
    status: OrderStatus;
    auth_user_id: string | null;
    buyer_name: string | null;
    buyer_email: string;
    buyer_phone: string | null;
    buyer_university: string | null;
    buyer_major: string | null;
    buyer_status: string | null;
    buyer_referral: string | null;
    marketing_consent: boolean;
    consent_at: string | null;
    invoice_number: string;
    amount: number;
    discount_amount: number;
    voucher_code: string | null;
    paid_at: string | null;
    paid_via: string | null;
    payment_channel: string | null;
    payment_expires_at: string;
    hold_until: string | null;
    created_at: string;
    ticket_code: string | null;
    join_url: string | null;
    alarm_outcome: string | null;
    ticket_email_sent_at: string | null;
    ticket_email_error: string | null;
    ticket_email_claimed_at: string | null;
    refunded_at: string | null;
    refunded_by: string | null;
    refund_note: string | null;
    last_status_check_at: string | null;
}

export interface AdminBroadcast {
    id: string;
    kind: BroadcastKind;
    event_starts_at: string | null;
    recipient_total: number;
    skipped_reason: string | null;
    created_by: string | null;
    created_at: string;
    counts: Record<DeliveryStatus, number>;
}

export interface AdminDelivery {
    broadcast_id: string;
    order_id: string;
    status: DeliveryStatus;
    attempts: number;
    sent_at: string | null;
    error: string | null;
    retry_after: string | null;
}

/** Pesan galat untuk toast; `fallback` bila galatnya tanpa pesan. */
export const errorMessage = (err: unknown, fallback: string): string =>
    (err instanceof Error && err.message) ? err.message : fallback;

export const BROADCAST_LABEL: Record<BroadcastKind, string> = {
    reminder_day: 'Pengingat H-1',
    schedule_change: 'Jadwal berubah',
    cancellation: 'Pembatalan',
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const CLAIM_TTL_MS = 10 * MIN; // sama dengan EMAIL_CLAIM_TTL_MS di doku/_webinar.js

// ── Waktu WIB ─────────────────────────────────────────────────────────────

function wibParts(iso: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
    return Object.fromEntries(
        new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', ...options })
            .formatToParts(new Date(iso))
            .map((p) => [p.type, p.value]),
    );
}

const clock = (iso: string) => {
    const p = wibParts(iso, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return `${p.hour}.${p.minute}`;
};

/** "5 Nov 14.10" */
export function shortStamp(iso: string): string {
    const p = wibParts(iso, { day: 'numeric', month: 'short' });
    return `${p.day} ${p.month} ${clock(iso)}`;
}

/** "2026-11-05 14:10" (WIB) untuk CSV; kosong bila null. */
function csvTime(iso: string | null): string {
    if (!iso) return '';
    const p = wibParts(iso, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// ── Kelompok, pencarian, statistik ────────────────────────────────────────

export function participantGroup(order: Pick<AdminWebinarOrder, 'status'>): ParticipantGroup {
    if (order.status === 'paid') return 'paid';
    if (order.status === 'refunded') return 'refunded';
    return 'unpaid';
}

export function groupCounts(orders: AdminWebinarOrder[]): Record<ParticipantGroup, number> {
    const counts: Record<ParticipantGroup, number> = { paid: 0, unpaid: 0, refunded: 0 };
    for (const o of orders) counts[participantGroup(o)] += 1;
    return counts;
}

export function filterParticipants(orders: AdminWebinarOrder[], group: ParticipantGroup, query: string): AdminWebinarOrder[] {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => participantGroup(o) === group && (!q || [
        o.buyer_name, o.buyer_email, o.ticket_code, o.invoice_number, o.buyer_phone,
    ].some((v) => (v || '').toLowerCase().includes(q))));
}

export function participantStats(orders: AdminWebinarOrder[], offer: WebinarOfferState | null | undefined) {
    const paid = orders.filter((o) => o.status === 'paid');
    return {
        paid: paid.length,
        held: Number(offer?.held) || 0,
        consent: paid.filter((o) => o.marketing_consent).length,
        revenue: paid.reduce((sum, o) => sum + (Number(o.amount) || 0), 0),
    };
}

// ── Label baris ───────────────────────────────────────────────────────────

/** null = bukan tiket lunas, jadi e-tiket tidak relevan. */
export function ticketEmailState(order: AdminWebinarOrder, now = Date.now()): 'sent' | 'failed' | 'sending' | 'pending' | null {
    if (order.status !== 'paid') return null;
    if (order.ticket_email_sent_at) return 'sent';
    if (order.ticket_email_claimed_at && now - Date.parse(order.ticket_email_claimed_at) < CLAIM_TTL_MS) return 'sending';
    if (order.ticket_email_error) return 'failed';
    return 'pending';
}

const ALARMS: Record<string, string> = {
    webinar_duplicate_paid: 'Bayar dobel',
    webinar_over_quota: 'Lewat kuota',
    webinar_paid_on_cancelled: 'Bayar sesudah batal',
};

export const alarmLabel = (outcome: string | null | undefined): string | null => (outcome ? ALARMS[outcome] ?? outcome : null);

export function unpaidLabel(order: AdminWebinarOrder, now = Date.now()): string {
    if (order.status === 'cancelled') return 'Dibatalkan';
    const expires = Date.parse(order.payment_expires_at);
    if (order.status === 'pending' && expires > now) return `Menunggu bayar · sisa ${Math.ceil((expires - now) / MIN)} mnt`;
    return `Kedaluwarsa ${shortStamp(order.payment_expires_at)}`;
}

function statusLabel(order: AdminWebinarOrder, now: number): string {
    if (order.status === 'paid') return 'Lunas';
    if (order.status === 'refunded') return 'Refund';
    if (order.status === 'cancelled') return 'Dibatalkan';
    return order.status === 'pending' && Date.parse(order.payment_expires_at) > now ? 'Menunggu bayar' : 'Kedaluwarsa';
}

// ── Email otomatis ────────────────────────────────────────────────────────

interface EventTiming {
    status: 'draft' | 'published' | 'cancelled';
    offer_kind: 'live' | 'replay';
    starts_at: string | null;
    duration_minutes: number | null;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Baris "Pengingat H-1" untuk jadwal acara yang sekarang. Aturan waktunya = sql/135. */
export function reminderStatus(event: EventTiming, broadcasts: AdminBroadcast[], now = Date.now()): { text: string; tone: Tone } {
    if (event.status !== 'published' || event.offer_kind !== 'live' || !event.starts_at) return { text: '—', tone: 'muted' };
    const start = Date.parse(event.starts_at);
    if (now >= start + (Number(event.duration_minutes) || 0) * MIN) return { text: '—', tone: 'muted' };

    const b = broadcasts.find((x) => x.kind === 'reminder_day' && x.event_starts_at && Date.parse(x.event_starts_at) === start);
    if (!b) {
        if (now >= start - 3 * HOUR) return { text: 'Terlewat', tone: 'warn' };
        if (now >= start - 24 * HOUR) return { text: 'Segera dikirim', tone: 'muted' };
        const at = new Date(start - 24 * HOUR).toISOString();
        const d = wibParts(at, { weekday: 'short', day: 'numeric', month: 'short' });
        return { text: `Dijadwalkan ${d.weekday}, ${d.day} ${d.month} · ${clock(at)} WIB`, tone: 'muted' };
    }
    if (b.skipped_reason) return { text: `Dilewati: ${lowerFirst(b.skipped_reason)}`, tone: 'muted' };
    if (b.recipient_total === 0) return { text: 'Tidak ada penerima', tone: 'muted' };
    const { sent, failed, queued, sending } = b.counts;
    if (queued + sending > 0) return { text: `Sedang dikirim ${sent}/${b.recipient_total}`, tone: 'muted' };
    if (failed > 0) return { text: `${sent}/${b.recipient_total} terkirim · ${failed} gagal`, tone: 'warn' };
    return { text: `${sent}/${b.recipient_total} terkirim · ${shortStamp(b.created_at)}`, tone: 'ok' };
}

/** Baris riwayat untuk email jadwal berubah / pembatalan. */
export function broadcastSummary(b: AdminBroadcast): { text: string; tone: Tone; retryable: boolean } {
    const date = shortStamp(b.created_at);
    if (b.skipped_reason) return { text: `${date} · dilewati`, tone: 'muted', retryable: false };
    const { sent, failed, queued, sending } = b.counts;
    if (queued + sending > 0) return { text: `${date} · sedang dikirim ${sent}/${b.recipient_total}`, tone: 'muted', retryable: false };
    if (failed > 0) return { text: `${date} · ${sent}/${b.recipient_total} terkirim · ${failed} gagal`, tone: 'warn', retryable: true };
    return { text: `${date} · ${sent}/${b.recipient_total} terkirim`, tone: 'ok', retryable: false };
}

export interface EmailHistoryItem {
    label: string;
    status: DeliveryStatus | 'pending';
    at: string | null;
    error: string | null;
}

/** Email yang diterima satu peserta: e-tiket lalu email otomatis, urut waktu. */
export function emailHistoryFor(order: AdminWebinarOrder, broadcasts: AdminBroadcast[], deliveries: AdminDelivery[]): EmailHistoryItem[] {
    const items: EmailHistoryItem[] = [];
    if (order.status === 'paid' || order.status === 'refunded') {
        items.push({
            label: 'E-tiket',
            status: order.ticket_email_sent_at ? 'sent' : order.ticket_email_error ? 'failed' : 'pending',
            at: order.ticket_email_sent_at,
            error: order.ticket_email_sent_at ? null : order.ticket_email_error,
        });
    }
    const byId = new Map(broadcasts.map((b) => [b.id, b]));
    deliveries
        .filter((d) => d.order_id === order.id && byId.has(d.broadcast_id))
        .sort((a, b) => Date.parse(byId.get(a.broadcast_id)!.created_at) - Date.parse(byId.get(b.broadcast_id)!.created_at))
        .forEach((d) => items.push({
            label: BROADCAST_LABEL[byId.get(d.broadcast_id)!.kind],
            status: d.status,
            at: d.sent_at,
            error: d.status === 'sent' ? null : d.error,
        }));
    return items;
}

// ── CSV ───────────────────────────────────────────────────────────────────

const CSV_HEADERS = [
    'Nama', 'Email e-tiket', 'WhatsApp', 'Kampus', 'Jurusan', 'Status', 'Referral', 'Izin kontak', 'Waktu izin (WIB)',
    'Kode tiket', 'Invoice', 'Status order', 'Harga', 'Diskon', 'Voucher', 'Dibayar (WIB)', 'Kanal', 'E-tiket terkirim (WIB)', 'Catatan refund',
];

export function participantCsv(orders: AdminWebinarOrder[], now = Date.now()): { headers: string[]; rows: (string | number)[][] } {
    return {
        headers: CSV_HEADERS,
        rows: orders.map((o) => [
            o.buyer_name || '', o.buyer_email, o.buyer_phone || '', o.buyer_university || '', o.buyer_major || '',
            o.buyer_status || '', o.buyer_referral || '', o.marketing_consent ? 'Ya' : 'Tidak', csvTime(o.consent_at),
            o.ticket_code || '', o.invoice_number, statusLabel(o, now), Number(o.amount) || 0, Number(o.discount_amount) || 0,
            o.voucher_code || '', csvTime(o.paid_at), o.payment_channel || '', csvTime(o.ticket_email_sent_at), o.refund_note || '',
        ]),
    };
}
