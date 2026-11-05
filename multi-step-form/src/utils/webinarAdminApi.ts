import { supabase } from './supabase';
import type { AdminWebinarEvent, ColumnKey, WebinarColumns } from './webinarAdmin';

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

export interface CancelResult {
    event: AdminWebinarEvent;
    pending_cancelled: number;
    doku_cancelled: number;
    doku_failed: { invoice: string; reason: string }[];
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
    webinarAdmin<{ event: AdminWebinarEvent }>('save', { id, patch, expectedUpdatedAt, confirmScheduleChange }).then((r) => r.event);

export const publishWebinarEvent = (id: string, patch: Patch, expectedUpdatedAt: string) =>
    webinarAdmin<{ event: AdminWebinarEvent }>('publish', { id, patch, expectedUpdatedAt }).then((r) => r.event);

export const closeWebinarSales = (id: string) =>
    webinarAdmin<{ event: AdminWebinarEvent }>('close-sales', { id }).then((r) => r.event);

export const cancelWebinarEvent = (id: string) => webinarAdmin<CancelResult>('cancel', { id });

export const deleteWebinarEvent = (id: string) => webinarAdmin<{ deleted: string }>('delete', { id });
