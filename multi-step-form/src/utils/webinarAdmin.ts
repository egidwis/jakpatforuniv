// Logika murni menu Webinar di /internal-dash (form ↔ kolom webinar_events).
// Tanpa supabase dan tanpa React, supaya bisa diuji unit.
//
// Server (functions/api/admin/webinarGate.js) tetap penentu. Empat fungsi di
// bawah adalah CERMIN fungsi gerbang dengan nama yang sama: slugifyTitle,
// isEmptyDoc, normalizeDoc, normalizeSpeakers. Bila klien dan server
// menormalisasi berbeda, diffColumns selalu melihat "perubahan" dan simpan
// otomatis berputar tanpa henti. webinarAdmin.spec.ts mengunci kesamaannya.

import { nowWib, toAiringStartIso } from './airing-window';
import type { WebinarEventView } from './webinarApi';

export const SITE_URL = 'https://submit.jakpatforuniv.com';
export const WEBINAR_PUBLIC_BUCKET = 'webinar-public';

// ── Tipe ──────────────────────────────────────────────────────────────────

export interface WebinarSpeaker {
    name: string;
    title: string;
    photo_url?: string;
}

export interface WebinarOfferState {
    state: string;
    opens_at?: string | null;
    sold?: number;
    held?: number;
    seats_left?: number | null;
    quota?: number | null;
}

export type SalesMode = 'open' | 'coming_soon' | 'closed';

/** Baris webinar_events seperti dikirim /api/admin/webinar. */
export interface AdminWebinarEvent {
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    poster_url: string | null;
    description_blocks?: TiptapDoc | null;
    speakers: WebinarSpeaker[];
    starts_at: string | null;
    duration_minutes: number | null;
    sales_mode: SalesMode;
    sales_open_at: string | null;
    sales_close_at: string | null;
    price: number | null;
    quota: number | null;
    status: 'draft' | 'published' | 'cancelled';
    offer_kind: 'live' | 'replay';
    is_listed: boolean;
    is_test: boolean;
    meeting_url?: string | null;
    preview_token: string;
    published_at: string | null;
    created_at: string;
    updated_at: string;
    webinar_offer_state: WebinarOfferState | null;
    view: WebinarEventView;
    /** Fase 5A (sql/136): kunci objek R2, hanya untuk admin. */
    recording_object_key?: string | null;
    recording_minutes?: number | null;
    recording_published_at?: string | null;
    materials_path?: string | null;
    /** Iterasi 4 (sql/136): jadwal acara yang sudah terjual terakhir berubah. */
    schedule_changed_at?: string | null;
    has_meeting_url: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TiptapDoc = { type: 'doc'; content?: any[] } & Record<string, any>;

/** Pilihan admin; lihat tabel "Penjualan dibuka" di rencana. */
export type SalesChoice = 'now' | 'date' | 'undecided' | 'closed';

export interface WebinarForm {
    title: string;
    summary: string;
    poster_url: string;
    description_blocks: TiptapDoc | null;
    speakers: WebinarSpeaker[];
    salesChoice: SalesChoice;
    openDate: string; // YYYY-MM-DD WIB
    openTime: string; // HH:MM WIB
    closeAtStart: boolean;
    closeDate: string;
    closeTime: string;
    startDate: string;
    startTime: string;
    duration: string;
    price: string;
    quota: string;
    meeting_url: string;
    is_listed: boolean;
}

export type WebinarColumns = {
    title: string;
    summary: string | null;
    poster_url: string | null;
    description_blocks: TiptapDoc | null;
    speakers: WebinarSpeaker[];
    sales_mode: SalesMode;
    sales_open_at: string | null;
    sales_close_at: string | null;
    starts_at: string | null;
    duration_minutes: number | null;
    price: number | null;
    quota: number | null;
    meeting_url: string | null;
    is_listed: boolean;
};

export type ColumnKey = keyof WebinarColumns;

/** Urutan isian di form = urutan lompatan ke isian pertama yang kurang (sama dengan FIELD_ORDER server). */
export const FIELD_ORDER: ColumnKey[] = [
    'title', 'summary', 'poster_url', 'description_blocks', 'speakers',
    'sales_open_at', 'sales_close_at', 'starts_at', 'duration_minutes', 'price', 'quota', 'meeting_url',
];

export const FIELD_LABELS: Record<ColumnKey, string> = {
    title: 'Judul',
    summary: 'Ringkasan',
    poster_url: 'Poster',
    description_blocks: 'Deskripsi',
    speakers: 'Pembicara',
    sales_mode: 'Penjualan dibuka',
    sales_open_at: 'Tanggal buka',
    sales_close_at: 'Tanggal tutup',
    starts_at: 'Jadwal mulai',
    duration_minutes: 'Durasi',
    price: 'Harga',
    quota: 'Kuota',
    meeting_url: 'Link Zoom/Meet',
    is_listed: 'Tampil di daftar',
};

/** Id elemen pembungkus isian, untuk menggulir dan memfokuskan isian yang kurang. */
export const fieldDomId = (field: string) => `wbn-field-${field}`;

// ── Cermin gerbang server ──────────────────────────────────────────────────

const SLUG_BASE_MAX = 76;

export function slugifyTitle(title: string | null | undefined): string {
    const slug = String(title ?? '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, SLUG_BASE_MAX)
        .replace(/-+$/g, '');
    return slug || 'acara';
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walk(node: any, visit: (n: any) => void) {
    if (!isPlainObject(node)) return;
    visit(node);
    if (Array.isArray(node.content)) node.content.forEach((child: unknown) => walk(child, visit));
}

export function isEmptyDoc(doc: unknown): boolean {
    let filled = false;
    walk(doc, (node) => {
        if (node.type === 'text' && typeof node.text === 'string' && node.text.trim()) filled = true;
        if (node.type === 'image' && node.attrs?.src) filled = true;
    });
    return !filled;
}

const MAX_DOC_CHARS = 500_000;

export function normalizeDoc(doc: unknown): { value: TiptapDoc | null } | { error: string } {
    if (doc === null || doc === undefined) return { value: null };
    if (!isPlainObject(doc) || doc.type !== 'doc') return { error: 'Format deskripsi tidak dikenali' };
    if (JSON.stringify(doc).length > MAX_DOC_CHARS) return { error: 'Deskripsi terlalu panjang (maks. 500 KB)' };
    let pasted = false;
    walk(doc, (node) => {
        if (node.type === 'image' && /^\s*data:/i.test(String(node.attrs?.src ?? ''))) pasted = true;
    });
    if (pasted) return { error: 'Gambar di deskripsi harus diunggah, bukan ditempel' };
    return { value: isEmptyDoc(doc) ? null : (doc as TiptapDoc) };
}

const trimText = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function normalizeSpeakers(list: unknown): { value: WebinarSpeaker[] } | { error: string } {
    if (list === null || list === undefined) return { value: [] };
    if (!Array.isArray(list)) return { error: 'Format pembicara tidak dikenali' };
    const out: WebinarSpeaker[] = [];
    for (const raw of list) {
        if (!isPlainObject(raw)) return { error: 'Format pembicara tidak dikenali' };
        const name = trimText(raw.name);
        const title = trimText(raw.title);
        const photo = trimText(raw.photo_url);
        if (!name && !title && !photo) continue;
        if (name.length > 120) return { error: 'Nama pembicara maks. 120 karakter' };
        if (title.length > 160) return { error: 'Jabatan pembicara maks. 160 karakter' };
        if (photo && !/^https:\/\//i.test(photo)) return { error: 'Foto pembicara harus link https' };
        out.push(photo ? { name, title, photo_url: photo } : { name, title });
    }
    if (out.length > 10) return { error: 'Maksimal 10 pembicara' };
    return { value: out };
}

// ── Form ↔ kolom ──────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO → tanggal & jam menurut WIB, bukan jam perangkat. */
export function isoToWibParts(iso: string | null | undefined): { date: string; time: string } {
    if (!iso) return { date: '', time: '' };
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: '', time: '' };
    const w = nowWib(d);
    return { date: w.ymd, time: `${pad(w.hour)}:${pad(w.minute)}` };
}

/** Tanggal & jam WIB → ISO UTC. Kosong → null; tak lengkap → 'invalid'. */
export function wibPartsToIso(date: string, time: string): string | null | 'invalid' {
    if (!date && !time) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'invalid';
    const m = /^(\d{1,2}):(\d{2})$/.exec(time || '');
    if (!m) return 'invalid';
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour > 23 || minute > 59) return 'invalid';
    return toAiringStartIso(date, hour, minute);
}

export function salesChoiceOf(row: Pick<AdminWebinarEvent, 'sales_mode' | 'sales_open_at'>): SalesChoice {
    if (row.sales_mode === 'closed') return 'closed';
    if (row.sales_mode === 'coming_soon') return 'undecided';
    return row.sales_open_at ? 'date' : 'now';
}

export const EMPTY_FORM: WebinarForm = {
    title: '', summary: '', poster_url: '', description_blocks: null, speakers: [{ name: '', title: '' }],
    salesChoice: 'undecided', openDate: '', openTime: '', closeAtStart: true, closeDate: '', closeTime: '',
    startDate: '', startTime: '', duration: '', price: '', quota: '', meeting_url: '', is_listed: true,
};

export function formFromEvent(row: AdminWebinarEvent): WebinarForm {
    const open = isoToWibParts(row.sales_open_at);
    const close = isoToWibParts(row.sales_close_at);
    const start = isoToWibParts(row.starts_at);
    return {
        title: row.title ?? '',
        summary: row.summary ?? '',
        poster_url: row.poster_url ?? '',
        description_blocks: row.description_blocks ?? null,
        speakers: row.speakers?.length ? row.speakers.map((s) => ({ ...s })) : [{ name: '', title: '' }],
        salesChoice: salesChoiceOf(row),
        openDate: open.date,
        openTime: open.time,
        closeAtStart: !row.sales_close_at,
        closeDate: close.date,
        closeTime: close.time,
        startDate: start.date,
        startTime: start.time,
        duration: row.duration_minutes != null ? String(row.duration_minutes) : '',
        price: row.price != null ? String(row.price) : '',
        quota: row.quota != null ? String(row.quota) : '',
        meeting_url: row.meeting_url ?? '',
        is_listed: row.is_listed,
    };
}

/** "50.000" / "Rp 50.000" → 50000. Kosong → null; bukan angka → NaN. */
export function parseWholeNumber(text: string): number | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const digits = trimmed.replace(/^rp\s*/i, '').replace(/[.\s]/g, '');
    return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
}

export type FormResult = { columns: WebinarColumns } | { error: string; field: ColumnKey };

export function columnsFromForm(form: WebinarForm): FormResult {
    const fail = (field: ColumnKey, error: string): FormResult => ({ error, field });

    const doc = normalizeDoc(form.description_blocks);
    if ('error' in doc) return fail('description_blocks', doc.error);
    const speakers = normalizeSpeakers(form.speakers);
    if ('error' in speakers) return fail('speakers', speakers.error);

    let salesMode: SalesMode;
    let openAt: string | null = null;
    switch (form.salesChoice) {
        case 'now': salesMode = 'open'; break;
        case 'date': {
            salesMode = 'open';
            const iso = wibPartsToIso(form.openDate, form.openTime);
            // "Pada tanggal" tanpa tanggal tidak boleh diam-diam menjadi "Sekarang".
            if (iso === null || iso === 'invalid') return fail('sales_open_at', 'Isi tanggal dan jam buka');
            openAt = iso;
            break;
        }
        case 'closed': salesMode = 'closed'; break;
        default: salesMode = 'coming_soon';
    }

    let closeAt: string | null = null;
    if (!form.closeAtStart) {
        const iso = wibPartsToIso(form.closeDate, form.closeTime);
        if (iso === null || iso === 'invalid') return fail('sales_close_at', 'Isi tanggal dan jam tutup');
        closeAt = iso;
    }

    const startAt = wibPartsToIso(form.startDate, form.startTime);
    if (startAt === 'invalid') return fail('starts_at', 'Isi tanggal dan jam mulai');

    const duration = parseWholeNumber(form.duration);
    if (Number.isNaN(duration)) return fail('duration_minutes', 'Durasi harus angka menit');
    const price = parseWholeNumber(form.price);
    if (Number.isNaN(price)) return fail('price', 'Harga harus angka');
    const quota = parseWholeNumber(form.quota);
    if (Number.isNaN(quota)) return fail('quota', 'Kuota harus angka');

    return {
        columns: {
            title: form.title.trim(),
            summary: form.summary.trim() || null,
            poster_url: form.poster_url.trim() || null,
            description_blocks: doc.value,
            speakers: speakers.value,
            sales_mode: salesMode,
            sales_open_at: openAt,
            sales_close_at: closeAt,
            starts_at: startAt,
            duration_minutes: duration,
            price,
            quota,
            meeting_url: form.meeting_url.trim() || null,
            is_listed: form.is_listed,
        },
    };
}

/** JSON dengan kunci terurut: jsonb Postgres mengurutkan ulang kunci objek. */
export function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (isPlainObject(value)) {
        return `{${Object.keys(value).sort()
            .filter((k) => value[k] !== undefined)
            .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

const TIME_COLUMNS = new Set<ColumnKey>(['sales_open_at', 'sales_close_at', 'starts_at']);
const JSON_COLUMNS = new Set<ColumnKey>(['description_blocks', 'speakers']);

function sameValue(key: ColumnKey, a: unknown, b: unknown): boolean {
    if (TIME_COLUMNS.has(key)) {
        // Presisi menit: form hanya punya jam:menit, sedangkan acara dari ops SQL bisa
        // berdetik. Tanpa ini isian yang tak disentuh terbaca "berubah" (dan acara
        // bertiket memicu dialog Jadwal berubah).
        const minute = (v: unknown) => (v ? Math.floor(Date.parse(String(v)) / 60_000) : null);
        return minute(a) === minute(b);
    }
    if (JSON_COLUMNS.has(key)) {
        const norm = (v: unknown) => (key === 'speakers'
            ? stableStringify(v ?? [])
            : stableStringify(v && !isEmptyDoc(v) ? v : null));
        return norm(a) === norm(b);
    }
    return (a ?? null) === (b ?? null);
}

/**
 * Kolom yang berbeda dari baris server. Kosong = tidak ada yang perlu disimpan;
 * ini penjaga utama simpan otomatis supaya tidak menulis berulang.
 */
export function diffColumns(row: Partial<AdminWebinarEvent> | null, columns: WebinarColumns): Partial<WebinarColumns> {
    const out: Partial<WebinarColumns> = {};
    for (const key of Object.keys(columns) as ColumnKey[]) {
        const current = row ? (row as Record<string, unknown>)[key] : undefined;
        if (!row || !sameValue(key, current, columns[key])) {
            (out as Record<string, unknown>)[key] = columns[key];
        }
    }
    // Server mengosongkan tanggal buka sendiri saat sales_mode bukan open.
    if (row && out.sales_open_at === null && !row.sales_open_at) delete out.sales_open_at;
    return out;
}

// ── Label & bantuan tampilan ──────────────────────────────────────────────

const WIB_FMT: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta' };

export function adminDateLabel(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    const date = d.toLocaleDateString('id-ID', { ...WIB_FMT, day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('id-ID', { ...WIB_FMT, hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time} WIB`;
}

function shortDateTime(iso: string): string {
    const d = new Date(iso);
    const date = d.toLocaleDateString('id-ID', { ...WIB_FMT, day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('id-ID', { ...WIB_FMT, hour: '2-digit', minute: '2-digit' });
    return `${date}, ${time} WIB`;
}

/** Label tombol Terbitkan: menjelaskan akibatnya sebelum ditekan. */
export function publishConsequence(form: WebinarForm, now: number = Date.now()): string {
    if (form.salesChoice === 'now') return 'Terbitkan: langsung dijual';
    if (form.salesChoice === 'date') {
        const iso = wibPartsToIso(form.openDate, form.openTime);
        if (iso && iso !== 'invalid') {
            return Date.parse(iso) <= now ? 'Terbitkan: langsung dijual' : `Terbitkan: Segera hadir s/d ${shortDateTime(iso)}`;
        }
        return 'Terbitkan';
    }
    return 'Terbitkan: Segera hadir';
}

/** Harga sudah termasuk PPN 11%; rumusnya sama dengan webinar_orders (subtotal = round(p / 1.11)). */
export function priceBreakdown(price: number | null): { subtotal: number; ppn: number } | null {
    if (price === null || !Number.isFinite(price) || price < 1000) return null;
    const subtotal = Math.round(price / 1.11);
    return { subtotal, ppn: price - subtotal };
}

export const formatRupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

const THREE_DAYS_MS = 3 * 86_400_000;

/** Acara terbit yang menjual tiket, tanpa link Zoom, dan mulai ≤ 3 hari lagi. */
export function zoomWarning(
    event: Pick<AdminWebinarEvent, 'status' | 'offer_kind' | 'has_meeting_url' | 'starts_at'>,
    now: number = Date.now(),
): boolean {
    if (event.status !== 'published' || event.offer_kind !== 'live' || event.has_meeting_url || !event.starts_at) return false;
    const start = Date.parse(event.starts_at);
    return start > now && start - now <= THREE_DAYS_MS;
}

/**
 * Urutan daftar admin: acara terbit yang belum lewat (terdekat dulu), lalu draft
 * (terbaru dulu), lalu acara lewat dan batal (terbaru dulu).
 */
export function sortAdminEvents<T extends Pick<AdminWebinarEvent, 'status' | 'starts_at' | 'updated_at'>>(
    events: T[],
    now: number = Date.now(),
): T[] {
    const rank = (e: T) => {
        if (e.status === 'cancelled') return 2;
        if (e.status === 'draft') return 1;
        return e.starts_at && Date.parse(e.starts_at) < now ? 2 : 0;
    };
    return [...events].sort((a, b) => {
        const r = rank(a) - rank(b);
        if (r) return r;
        if (rank(a) === 0) return Date.parse(a.starts_at ?? '9999-12-31') - Date.parse(b.starts_at ?? '9999-12-31');
        return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    });
}

export const publicEventUrl = (slug: string) => `${SITE_URL}/webinar/${slug}`;
export const previewEventUrl = (slug: string, token: string) =>
    `${SITE_URL}/webinar/${slug}?pratinjau=${encodeURIComponent(token)}`;

/** URL gambar lewat proxy CDN (functions/cdn/[[path]].js), bukan URL Supabase mentah. */
export const webinarImageUrl = (path: string) =>
    `${SITE_URL}/cdn/${WEBINAR_PUBLIC_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

/** Sisa kursi yang terpakai: dipakai panel harga & kuota. */
export function seatsSummary(offer: WebinarOfferState | null | undefined): { sold: number; held: number } {
    return { sold: Number(offer?.sold) || 0, held: Number(offer?.held) || 0 };
}
