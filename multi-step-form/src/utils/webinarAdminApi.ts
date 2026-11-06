import { supabase } from './supabase';
import type { AdminWebinarEvent, ColumnKey, WebinarColumns } from './webinarAdmin';
import type { AdminBroadcast, AdminDelivery, AdminWebinarOrder } from './webinarParticipants';

/** Galat bertipe dari /api/admin/webinar; `field`/`fields` menunjuk isian form. */
export class WebinarAdminError extends Error {
    status: number;
    code?: string;
    field?: ColumnKey;
    fields?: ColumnKey[];
    sold?: number;
    constructor(message: string, status: number, data?: { code?: string; field?: ColumnKey; fields?: ColumnKey[]; sold?: number }) {
        super(message);
        this.status = status;
        this.code = data?.code;
        this.field = data?.field;
        this.fields = data?.fields;
        this.sold = data?.sold;
    }
}

/** Email otomatis ke peserta yang ikut aksi simpan-jadwal / batalkan acara. */
export interface NotifyNotice {
    notified?: number;
    notify_error?: boolean;
}

export interface CancelResult extends NotifyNotice {
    event: AdminWebinarEvent;
    pending_cancelled: number;
    doku_cancelled: number;
    doku_failed: { invoice: string; reason: string }[];
}

export interface ParticipantsResult {
    event: AdminWebinarEvent;
    orders: AdminWebinarOrder[];
    broadcasts: AdminBroadcast[];
    deliveries: AdminDelivery[];
}

export interface CheckOrderResult {
    checked: boolean;
    status: string;
    reason?: 'too_soon' | 'recently_checked' | 'doku_error' | 'unpaid';
    dokuStatus?: string | null;
    outcome?: string;
}

type Patch = Partial<WebinarColumns>;

async function webinarAdmin<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch('/api/admin/webinar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action, ...payload }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new WebinarAdminError(body?.error || 'Terjadi kendala. Coba lagi beberapa saat.', res.status, body ?? undefined);
    // 200 tanpa JSON (mis. index.html SPA saat Function belum terpasang) bukan sukses.
    if (body === null || typeof body !== 'object') {
        throw new WebinarAdminError('Server tidak menjawab. Coba lagi beberapa saat.', res.status, { code: 'bad_response' });
    }
    return body as T;
}

export const listWebinarEvents = () =>
    webinarAdmin<{ events: AdminWebinarEvent[] }>('list').then((r) => r.events);

export const getWebinarEvent = (id: string) =>
    webinarAdmin<{ event: AdminWebinarEvent }>('get', { id }).then((r) => r.event);

export const createWebinarEvent = (patch: Patch) =>
    webinarAdmin<{ event: AdminWebinarEvent }>('create', { patch }).then((r) => r.event);

export const saveWebinarEvent = (id: string, patch: Patch, expectedUpdatedAt: string, confirmScheduleChange = false) =>
    saveWebinarEventWithNotice(id, patch, expectedUpdatedAt, confirmScheduleChange).then((r) => r.event);

/** Seperti saveWebinarEvent, ditambah kabar email otomatis bila jadwal acara terjual berubah. */
export const saveWebinarEventWithNotice = (id: string, patch: Patch, expectedUpdatedAt: string, confirmScheduleChange = false) =>
    webinarAdmin<{ event: AdminWebinarEvent } & NotifyNotice>('save', { id, patch, expectedUpdatedAt, confirmScheduleChange });

export const publishWebinarEvent = (id: string, patch: Patch, expectedUpdatedAt: string) =>
    webinarAdmin<{ event: AdminWebinarEvent }>('publish', { id, patch, expectedUpdatedAt }).then((r) => r.event);

export const closeWebinarSales = (id: string) =>
    webinarAdmin<{ event: AdminWebinarEvent }>('close-sales', { id }).then((r) => r.event);

export const cancelWebinarEvent = (id: string) => webinarAdmin<CancelResult>('cancel', { id });

export const deleteWebinarEvent = (id: string) => webinarAdmin<{ deleted: string }>('delete', { id });

// ── Fase 3: peserta ─────────────────────────────────────────────────────────

export const listParticipants = (id: string) => webinarAdmin<ParticipantsResult>('participants', { id });

export const getParticipant = (orderId: string) =>
    webinarAdmin<{ order: AdminWebinarOrder; account_email: string | null }>('participant', { orderId });

/** `email` diisi bila admin mengoreksi alamat tujuan e-tiket. */
export const resendTicket = (orderId: string, email?: string) =>
    webinarAdmin<{ sent: true; email: string }>('resend-ticket', { orderId, ...(email ? { email } : {}) });

export const checkOrder = (orderId: string) => webinarAdmin<CheckOrderResult>('check-order', { orderId });

export const refundOrder = (orderId: string, note: string) =>
    webinarAdmin<{ outcome: 'ok' | 'already_refunded'; refunded_at?: string }>('refund', { orderId, note });

export const retryEmail = (broadcastId: string) => webinarAdmin<{ requeued: number }>('email-retry', { broadcastId });

// ── Fase 4: pembeli webinar untuk halaman Customers ──────────────────────

/**
 * Satu tiket lunas/refund milik sebuah akun. Sengaja TANPA data pribadi
 * pembeli (nama, email, WA): profil akunnya sudah ada di Customers.
 */
export interface WebinarBuyerTicket {
    order_id: string;
    auth_user_id: string;
    kind: 'live' | 'replay';
    status: 'paid' | 'refunded';
    amount: number;
    paid_at: string | null;
    invoice_number: string;
    event_title: string;
    event_starts_at: string | null;
    is_test: boolean;
}

export const getWebinarBuyers = () => webinarAdmin<{ tickets: WebinarBuyerTicket[] }>('buyers', {});
