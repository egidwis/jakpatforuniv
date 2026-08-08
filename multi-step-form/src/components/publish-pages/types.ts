import { DEFAULT_AD_BANNER_URL } from '@/utils/constants';
import { STATUS_TOKENS, type StatusToken } from '@/lib/status-tokens';
import { isLive, normalizeScheduleDate } from '@/utils/adOrdering';

// ─────────────────────────────────────────────────────────────
// Model halaman Pages, tanpa JSX.
//
// Nama foldernya `publish-pages`, bukan `pages`, supaya tidak tertukar dengan
// `src/pages/` yang berisi rute.
// ─────────────────────────────────────────────────────────────

export interface PageData {
    id: string;
    slug: string;
    title: string;
    is_published: boolean;
    is_hidden?: boolean;
    is_extra_ad: boolean;
    views_count: number;
    banner_url?: string | null;
    publish_start_date: string | null;
    publish_end_date: string | null;
    display_order?: number | null;
    submission_id: string;
    created_at: string;
    /** JSONB. Tidak dibaca di sini — PageBuilderModal membacanya dari `initialData`. */
    blocks?: any;
    /** JSONB, array of { label, placeholder, type, required, options }. */
    custom_fields?: any[];
    form_submissions?: {
        title: string;
        full_name: string;
        auth_user_id?: string | null;
        university?: string;
        prize_per_winner?: number;
        winner_count?: number;
        /**
         * Ikut di join yang sudah ada, bukan query kedua. Dulu SubmissionsManagerView
         * menembak query terpisah hanya untuk kolom ini setiap kali layar dibuka.
         */
        criteria_responden?: string | null;
    };
    owner_name?: string;
    page_respondents?: { count: number }[];
    requires_banner_update?: boolean;
}

export type PageType = 'ad' | 'extra' | 'announcement';

export const PAGE_TYPE_LABEL: Record<PageType, string> = {
    ad: 'Survey Ad',
    extra: 'Extra Ad',
    announcement: 'Announcement',
};

/**
 * Rantai `is_extra_ad → tanpa submission_id → sisanya`, dipusatkan. Dulu disalin
 * dua kali di PublishPageManagement dan sekali lagi di tab Live, jadi tiga tempat
 * yang harus diingat bersamaan setiap kali tipe halaman bertambah.
 */
export function pageTypeOf(p: PageData): PageType {
    if (p.is_extra_ad) return 'extra';
    if (!p.submission_id) return 'announcement';
    return 'ad';
}

/**
 * Halaman yang masih memakai banner placeholder.
 *
 * Ini sisa pekerjaan manusia nomor satu yang ditinggalkan auto-publish (sql/40):
 * tiap iklan lunas naik dengan `/default-ad-banner.jpg` dan tidak ada satu layar
 * pun yang menunjukkan mana yang belum diganti.
 *
 * BUKAN `requires_banner_update`. Flag itu berarti "info hadiah basi" dan sql/40
 * sengaja menyetelnya FALSE untuk halaman baru — dua keadaan yang berbeda.
 *
 * Announcement dibuat manual dan tidak pernah memakai banner iklan default, jadi
 * menandainya cuma menambah bising.
 */
export function usesPlaceholderBanner(p: PageData): boolean {
    if (!p.submission_id) return false;
    const url = (p.banner_url ?? '').trim();
    return url === '' || url === DEFAULT_AD_BANNER_URL;
}

/**
 * Keadaan halaman → token chip bersama, supaya Pages berhenti menulis pil
 * Tailwind sendiri sementara Schedule dan Submissions memakai STATUS_TOKENS.
 *
 * Live memakai `isLive()` dari adOrdering — sumber kebenaran yang sama dengan
 * listing publik dan `/api/surveys`, dan satu-satunya yang sadar konvensi tayang
 * 15.00 WIB lewat `normalizeScheduleDate`. Membandingkan tanggal sendiri di sini
 * akan membuat admin dan aplikasi mobile tidak sepakat soal apa yang "live".
 */
export const DRAFT_TOKEN: StatusToken = { label: 'Draft', variant: 'slate' };

export function pageAiringToken(p: PageData, now: number): StatusToken {
    if (!p.is_published) return DRAFT_TOKEN;
    if (isLive(p, now)) return STATUS_TOKENS.live;
    const start = p.publish_start_date ? normalizeScheduleDate(p.publish_start_date) : null;
    if (start && now < start.getTime()) return STATUS_TOKENS.page_scheduled;
    return STATUS_TOKENS.completed;
}

/**
 * Urutan katalog: Draft dulu (paling butuh perhatian), lalu Scheduled, Live,
 * Completed. Dipertahankan dari perilaku lama.
 */
export function statusPriority(p: PageData, now: number): number {
    if (!p.is_published) return 0;
    if (isLive(p, now)) return 2;
    const start = p.publish_start_date ? normalizeScheduleDate(p.publish_start_date) : null;
    if (start && now < start.getTime()) return 1;
    return 3;
}

/** Jangkar yang sama dengan Submissions dan Schedule: 8 hex pertama id order. */
export function shortOrderId(p: PageData): string | null {
    return p.submission_id ? `#${p.submission_id.slice(0, 8)}` : null;
}

const WIB = 'Asia/Jakarta';

const wibDateFmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB, day: 'numeric', month: 'short',
});
const wibDateTimeFmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
});

/**
 * ⚠️ Tanggal halaman dibaca dalam WIB, bukan zona perangkat.
 *
 * `normalizeScheduleDate` dulu: kolom tanggal-saja harus diangkat ke 15.00 WIB
 * sebelum diformat, kalau tidak halaman yang mulai hari ini tampil sebagai
 * kemarin pukul 07.00.
 */
export function formatPageDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    return wibDateFmt.format(normalizeScheduleDate(dateStr));
}

export function formatPageDateTime(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    return `${wibDateTimeFmt.format(normalizeScheduleDate(dateStr)).replace(/\./g, '.')} WIB`;
}

// ── Waktu responden ──────────────────────────────────────────
// `page_respondents.created_at` selalu timestamp penuh, jadi TIDAK lewat
// `normalizeScheduleDate` — yang itu hanya untuk kolom tanggal-saja.
//
// Ketiganya memaksa `timeZone: WIB`. Versi lama memformat dengan zona perangkat
// lalu menempelkan label "WIB" di sebelahnya, jadi admin yang membuka dari luar
// WIB membaca jam yang salah dengan label yang meyakinkan. Kolom di tabel dan
// kolom di CSV wajib memberi jawaban yang sama.

const respondentDateFmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB, day: 'numeric', month: 'short', year: 'numeric',
});
const respondentTimeFmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB, hour: '2-digit', minute: '2-digit', hour12: false,
});

export function formatRespondentDate(iso: string): string {
    return respondentDateFmt.format(new Date(iso));
}

export function formatRespondentTime(iso: string): string {
    return respondentTimeFmt.format(new Date(iso)).replace('.', ':');
}

/** Satu sel untuk CSV: tanggal + jam WIB dalam satu kolom. */
export function formatRespondentTimestamp(iso: string): string {
    return `${formatRespondentDate(iso)} ${formatRespondentTime(iso)}`;
}
