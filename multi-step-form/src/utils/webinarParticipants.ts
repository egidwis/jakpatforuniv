// Logika murni halaman Peserta di menu Webinar admin (Fase 3, rencana "Iterasi 6 Nov").
// Tanpa React dan tanpa supabase, supaya bisa diuji unit (webinarParticipants.spec.ts).
// Data datang dari /api/admin/webinar aksi `participants`.

import type { WebinarOfferState } from './webinarAdmin';

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'refunded';
export type ParticipantGroup = 'paid' | 'unpaid' | 'refunded';
export type NotifyKind = 'reminder_day' | 'schedule_change' | 'cancellation' | 'recording_ready';
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
    /** Email otomatis (sql/136): penanda per jenis, diisi cron saat Function dipanggil. */
    reminder_sent_for: string | null;
    schedule_email_sent_at: string | null;
    cancel_email_sent_at: string | null;
    recording_email_sent_at: string | null;
    /** Galat email otomatis terakhir: "<jenis> · <waktu WIB> · <pesan>". */
    email_error: string | null;
}

/** Pesan galat untuk toast; `fallback` bila galatnya tanpa pesan. */
export const errorMessage = (err: unknown, fallback: string): string =>
    (err instanceof Error && err.message) ? err.message : fallback;

/** Sama dengan NOTIFY_LABEL di functions/api/webinar/_notify.js (awalan email_error). */
export const NOTIFY_LABEL: Record<NotifyKind, string> = {
    reminder_day: 'Pengingat H-1',
    schedule_change: 'Jadwal berubah',
    cancellation: 'Pembatalan',
    recording_ready: 'Rekaman tersedia',
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

// ── Email otomatis (Iterasi 4: kolom penanda per order, sql/136b) ──────────

interface EventTiming {
    status: 'draft' | 'published' | 'cancelled';
    offer_kind: 'live' | 'replay';
    starts_at: string | null;
    duration_minutes: number | null;
    schedule_changed_at?: string | null;
    recording_published_at?: string | null;
}

export interface EmailLine { text: string; tone: Tone }

const SEVEN_DAYS = 7 * 24 * HOUR;
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const paidOnly = (orders: AdminWebinarOrder[]) => orders.filter((o) => o.status === 'paid' && o.kind === 'live');
const failedFor = (orders: AdminWebinarOrder[], kind: NotifyKind) =>
    orders.filter((o) => (o.email_error || '').startsWith(`${NOTIFY_LABEL[kind]} ·`)).length;

/** Pengingat dianggap "dilewati" bila email jadwal baru diserahkan < 12 jam sebelum jendela H-1 berjalan. */
const reminderSkipped = (o: AdminWebinarOrder) =>
    Boolean(o.reminder_sent_for && o.schedule_email_sent_at && ms(o.schedule_email_sent_at) > ms(o.reminder_sent_for) - 36 * HOUR);

function summary(prefix: string, sent: number, total: number, waiting: number, failed: number, lost: boolean, lostWord = 'tidak terkirim'): EmailLine {
    const parts = [`${sent}/${total} dikirim`];
    if (waiting) parts.push(`${waiting} ${lost ? lostWord : 'menyusul'}`);
    if (failed) parts.push(`${failed} gagal`);
    const tone: Tone = failed || (waiting && lost) ? 'warn' : waiting ? 'muted' : 'ok';
    return { text: prefix ? `${prefix} · ${parts.join(' · ')}` : parts.join(' · '), tone };
}

/** Baris "Pengingat H-1" untuk jadwal acara yang sekarang. Aturan waktunya = sql/136b. */
export function reminderStatus(event: EventTiming, orders: AdminWebinarOrder[], now = Date.now()): EmailLine {
    if (event.status !== 'published' || event.offer_kind !== 'live' || !event.starts_at) return { text: '—', tone: 'muted' };
    const start = ms(event.starts_at);
    if (now >= start + (Number(event.duration_minutes) || 0) * MIN) return { text: '—', tone: 'muted' };
    if (now < start - 24 * HOUR) {
        const at = new Date(start - 24 * HOUR).toISOString();
        const d = wibParts(at, { weekday: 'short', day: 'numeric', month: 'short' });
        return { text: `Dijadwalkan ${d.weekday}, ${d.day} ${d.month} · ${clock(at)} WIB`, tone: 'muted' };
    }

    const paid = paidOnly(orders);
    const marked = paid.filter((o) => ms(o.reminder_sent_for) === start);
    const skipped = marked.filter(reminderSkipped).length;
    const sent = marked.length - skipped;
    const closed = now >= start - 3 * HOUR;
    // Penerima yang belum: lunas ≥ 6 jam sebelum (sekarang, atau batas 3 jam bila sudah lewat).
    const cutoff = Math.min(now, start - 3 * HOUR) - 6 * HOUR;
    const waiting = paid.filter((o) => ms(o.reminder_sent_for) !== start && ms(o.paid_at) < cutoff).length;

    if (marked.length === 0 && waiting === 0) return { text: 'Tidak ada penerima', tone: 'muted' };
    if (sent === 0 && waiting === 0) return { text: 'Dilewati: email jadwal baru dikirim kurang dari 12 jam sebelumnya', tone: 'muted' };
    const line = summary('', sent, sent + waiting, waiting, failedFor(marked, 'reminder_day'), closed, 'terlewat');
    return skipped ? { ...line, text: `${line.text} · ${skipped} dilewati` } : line;
}

/** Baris "Jadwal berubah" / "Pembatalan" / "Rekaman tersedia"; null = tidak relevan untuk acara ini. */
export function noticeStatus(kind: Exclude<NotifyKind, 'reminder_day'>, event: EventTiming, orders: AdminWebinarOrder[], now = Date.now()): EmailLine | null {
    const paid = paidOnly(orders);
    if (kind === 'schedule_change') {
        const changed = ms(event.schedule_changed_at);
        if (!Number.isFinite(changed)) return null;
        const recipients = paid.filter((o) => ms(o.paid_at) < changed);
        const done = recipients.filter((o) => ms(o.schedule_email_sent_at) >= changed);
        // Dibatalkan sebelum email jadwal berangkat: pembatalan menggantikannya, jangan tampil sebagai masalah.
        if (event.status === 'cancelled' && done.length === 0) return null;
        const lost = event.status !== 'published' || ms(event.starts_at) <= now || changed < now - SEVEN_DAYS;
        return summary(shortStamp(event.schedule_changed_at!), done.length, recipients.length, recipients.length - done.length, failedFor(done, kind), lost);
    }
    if (kind === 'cancellation') {
        if (event.status !== 'cancelled') return null;
        const done = paid.filter((o) => o.cancel_email_sent_at);
        const lost = ms(event.starts_at) < now - SEVEN_DAYS;
        return summary('', done.length, paid.length, paid.length - done.length, failedFor(done, kind), lost);
    }
    if (!event.recording_published_at) return null;
    const done = paid.filter((o) => o.recording_email_sent_at);
    const lost = event.status !== 'published' || ms(event.recording_published_at) < now - SEVEN_DAYS;
    return summary(shortStamp(event.recording_published_at), done.length, paid.length, paid.length - done.length, failedFor(done, kind), lost);
}

/** Tiket lunas yang email otomatis terakhirnya gagal (tidak diulang otomatis). */
export const failedEmails = (orders: AdminWebinarOrder[]): AdminWebinarOrder[] =>
    paidOnly(orders).filter((o) => o.email_error);

export interface EmailHistoryItem {
    label: string;
    status: 'sent' | 'failed' | 'pending' | 'skipped';
    at: string | null;
    note: string | null;
    error: string | null;
}

/** Email yang diterima satu peserta, dari kolom order. Galat terakhir ada di order.email_error. */
export function emailHistoryFor(order: AdminWebinarOrder): EmailHistoryItem[] {
    const items: EmailHistoryItem[] = [];
    // Penanda diisi saat Function dipanggil, juga bila gagal; email_error berawalan jenisnya = yang terakhir gagal.
    const sent = (label: string, at: string | null, note: string | null = null): EmailHistoryItem =>
        ({ label, status: (order.email_error || '').startsWith(`${label} ·`) ? 'failed' : 'sent', at, note, error: null });
    if (order.status === 'paid' || order.status === 'refunded') {
        items.push({
            label: 'E-tiket',
            status: order.ticket_email_sent_at ? 'sent' : order.ticket_email_error ? 'failed' : 'pending',
            at: order.ticket_email_sent_at,
            note: null,
            error: order.ticket_email_sent_at ? null : order.ticket_email_error,
        });
    }
    if (order.schedule_email_sent_at) items.push(sent(NOTIFY_LABEL.schedule_change, order.schedule_email_sent_at));
    if (order.reminder_sent_for) {
        const item = sent(NOTIFY_LABEL.reminder_day, null, `jadwal ${shortStamp(order.reminder_sent_for)}`);
        items.push(reminderSkipped(order) ? { ...item, status: 'skipped' } : item);
    }
    if (order.cancel_email_sent_at) items.push(sent(NOTIFY_LABEL.cancellation, order.cancel_email_sent_at));
    if (order.recording_email_sent_at) items.push(sent(NOTIFY_LABEL.recording_ready, order.recording_email_sent_at));
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
