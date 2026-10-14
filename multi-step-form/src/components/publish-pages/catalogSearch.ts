import { STATUS_TOKENS, type StatusToken } from '@/lib/status-tokens';
import { BOOKING_ID_RE, SHORT_ID_RE, UUID_RE } from '@/utils/idPatterns';
import { DRAFT_TOKEN, pageTypeOf, statusPriority, type PageData, type PageType } from './types';

// ─────────────────────────────────────────────────────────────
// Pencarian, saringan, dan paginasi katalog "Semua Page" — murni, tanpa JSX
// dan tanpa klien Supabase, supaya tes memanggil fungsi aslinya.
//
// Semuanya berjalan di BROWSER atas indeks ringan seluruh katalog. Alasannya:
// kotak cari harus menerima apa pun yang dipegang admin — ID page, ID order,
// Booking ID, tautan, kata judul, nama/email peneliti, kampus — dan separuh di
// antaranya tidak bisa dicari di server: `id` bertipe uuid (`ilike` tidak
// berlaku) dan nama pemilik baru ditempel SESUDAH query, dari `profiles`.
//
// Satu-satunya yang tetap ke server adalah Booking ID (lihat
// `useBookingCodeMatches`): kodenya tinggal di `ad_schedules`, bukan di halaman.
// ─────────────────────────────────────────────────────────────

export type PageStatusKey = 'draft' | 'scheduled' | 'live' | 'completed';

/** Indeks = `statusPriority()`; tidak ada aturan tanggal baru di sini. */
const STATUS_BY_PRIORITY: PageStatusKey[] = ['draft', 'scheduled', 'live', 'completed'];

export const PAGE_STATUS_TOKEN: Record<PageStatusKey, StatusToken> = {
    draft: DRAFT_TOKEN,
    scheduled: STATUS_TOKENS.page_scheduled,
    live: STATUS_TOKENS.live,
    completed: STATUS_TOKENS.completed,
};

export const PAGE_STATUS_KEYS = STATUS_BY_PRIORITY;

export function pageStatusKey(p: PageData, now: number): PageStatusKey {
    return STATUS_BY_PRIORITY[statusPriority(p, now)];
}

/** Huruf kecil + diakritik dibuang, supaya "Bogor" dan "bógor" sama. */
function fold(s: string | null | undefined): string {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Kueri → token. Setiap token harus terpenuhi, urutannya bebas — "persepsi
 * kelompok" menemukan "Persepsi Diri dan Kelompok".
 *
 * Tautan yang ditempel (`https://…/pages/<slug>?utm=…#…`) disusutkan ke slug-nya;
 * `#` dan `/` di depan token dibuang, jadi `#2F63F753` dan `/slug` ikut cocok.
 */
export function searchTokens(raw: string): string[] {
    const s = fold(raw).replace(/\S*\/pages\/([^\s?#/]+)\S*/g, (_, slug: string) => {
        try { return decodeURIComponent(slug); } catch { return slug; }
    });
    return s
        .split(/\s+/)
        .map(t => t.replace(/^[#/]+/, '').replace(/\/+$/, ''))
        .filter(Boolean);
}

/**
 * Semua teks yang bisa dicari dari satu halaman, dalam satu string.
 *
 * Nama AKUN (`owner_name`, dari `profiles`) dan nama BIODATA order
 * (`form_submissions.full_name`) sama-sama masuk: keduanya berbeda di ±1 dari 9
 * halaman, dan admin bisa memegang yang mana saja.
 */
export function pageHaystack(p: PageData): string {
    const sub = p.form_submissions;
    return [
        p.title, p.slug, p.id, p.submission_id,
        p.owner_name, p.owner_email,
        sub?.full_name, sub?.email, sub?.university, sub?.title,
    ].map(fold).join('\n');
}

export interface CodeLookup {
    clean: string;
    isFullUuid: boolean;
    isShortId: boolean;
}

/**
 * Token yang PERLU dicari ke `ad_schedules`: UUID, 8 hex, atau bentuk Booking ID.
 *
 * ID page & ID order sudah cocok lewat haystack; lookup ini menambah Booking ID
 * baru (`booking_id`) dan kode lama jadwal ke-2+ (`source_id`). Kata biasa yang
 * kebetulan berbentuk Booking ID ("terhadap") ikut dilookup — tidak merugikan,
 * karena token tetap terpenuhi lewat haystack juga.
 */
export function codeLookupOf(token: string): CodeLookup | null {
    const clean = token.trim();
    const isFullUuid = UUID_RE.test(clean);
    const isShortId = SHORT_ID_RE.test(clean);
    if (!isFullUuid && !isShortId && !BOOKING_ID_RE.test(clean.toUpperCase())) return null;
    return { clean, isFullUuid, isShortId };
}

/** token → submission_id yang kodenya cocok (hasil `useBookingCodeMatches`). */
export type CodeMatches = ReadonlyMap<string, ReadonlySet<string>>;

export function matchesSearch(
    haystack: string,
    tokens: string[],
    submissionId: string | null | undefined,
    codeMatches: CodeMatches,
): boolean {
    return tokens.every(t =>
        haystack.includes(t) ||
        (!!submissionId && !!codeMatches.get(t)?.has(submissionId))
    );
}

// ── Saringan & paginasi ──────────────────────────────────────

export interface CatalogView {
    query: string;
    type: 'all' | PageType;
    status: 'all' | PageStatusKey;
    hiddenOnly: boolean;
    page: number;
}

export const DEFAULT_CATALOG_VIEW: CatalogView = {
    query: '', type: 'all', status: 'all', hiddenOnly: false, page: 1,
};

export interface IndexedPage {
    page: PageData;
    haystack: string;
    type: PageType;
    status: PageStatusKey;
}

/** Dihitung sekali per muat ulang, bukan per ketikan. */
export function indexCatalog(pages: PageData[], now: number): IndexedPage[] {
    return pages.map(page => ({
        page,
        haystack: pageHaystack(page),
        type: pageTypeOf(page),
        status: pageStatusKey(page, now),
    }));
}

export interface CatalogCounts {
    /** Per tipe — dihitung TANPA saringan tipe, supaya angka di menu tipe jujur. */
    type: Record<'all' | PageType, number>;
    /** Per status — dihitung TANPA saringan status. */
    status: Record<'all' | PageStatusKey, number>;
    /** Disembunyikan — dihitung TANPA saringan disembunyikan. */
    hidden: number;
}

export function applyCatalogView(
    index: IndexedPage[],
    view: CatalogView,
    codeMatches: CodeMatches,
): { rows: PageData[]; counts: CatalogCounts } {
    const tokens = searchTokens(view.query);
    const searched = tokens.length === 0
        ? index
        : index.filter(e => matchesSearch(e.haystack, tokens, e.page.submission_id, codeMatches));

    const typeOk = (e: IndexedPage) => view.type === 'all' || e.type === view.type;
    const statusOk = (e: IndexedPage) => view.status === 'all' || e.status === view.status;
    const hiddenOk = (e: IndexedPage) => !view.hiddenOnly || !!e.page.is_hidden;

    const counts: CatalogCounts = {
        type: { all: 0, ad: 0, extra: 0, kilat: 0, announcement: 0 },
        status: { all: 0, draft: 0, scheduled: 0, live: 0, completed: 0 },
        hidden: 0,
    };
    const rows: PageData[] = [];

    for (const e of searched) {
        const t = typeOk(e), s = statusOk(e), h = hiddenOk(e);
        if (s && h) { counts.type.all++; counts.type[e.type]++; }
        if (t && h) { counts.status.all++; counts.status[e.status]++; }
        if (t && s && e.page.is_hidden) counts.hidden++;
        if (t && s && h) rows.push(e.page);
    }
    return { rows, counts };
}

export const CATALOG_PAGE_SIZE = 50;

export interface Paginated<T> {
    slice: T[];
    /** Halaman yang benar-benar ditampilkan — di-clamp saat hasil menyusut. */
    page: number;
    totalPages: number;
    /** 1-based, inklusif; 0 bila kosong. */
    from: number;
    to: number;
    total: number;
}

export function paginate<T>(rows: T[], page: number, size = CATALOG_PAGE_SIZE): Paginated<T> {
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / size));
    const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
    const start = (current - 1) * size;
    const slice = rows.slice(start, start + size);
    return {
        slice,
        page: current,
        totalPages,
        from: total === 0 ? 0 : start + 1,
        to: start + slice.length,
        total,
    };
}
