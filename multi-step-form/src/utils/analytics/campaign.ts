/**
 * Lapisan angka tab Campaign — murni, tanpa I/O, dan diuji seperti `revenue.ts`.
 *
 * ## Dua hal yang mudah salah di sini, dan mahal kalau salah
 *
 * **1. Revenue voucher WAJIB datang dari `transactions`.**
 * Godaannya besar untuk menjumlahkan `form_submissions.total_cost` — kolomnya ada
 * di baris yang sama dengan `voucher_code`, jadi satu `reduce` sudah cukup. Tapi
 * `total_cost` adalah NILAI ORDER, bukan uang yang masuk: ia tidak tahu apakah
 * order dibayar, dan ia tidak melewati koreksi `isPaidTx`/`isInternalTestTx` yang
 * dipakai tab Revenue. Hasilnya dua tab menyebut angka berbeda untuk hal yang
 * sama, dan tidak ada yang tahu mana yang benar. Terukur pada JFUTGRX: revenue
 * lunas versi `total_cost` Rp 3.000 — transaksi uji yang tab Revenue memang buang.
 *
 * **2. Kolom `voucher_code` adalah TEKS BEBAS, dan 39% isinya bukan voucher.**
 * Sepanjang masa: 119 isian, 73 kode resmi (9 kode berbeda), **46 ketikan ngawur
 * dari 31 "kode" berbeda** — `TIDAK ADA`, `-`, `1933`, `95022605674760085`,
 * bahkan `jakpat_id` responden. Memasukkannya ke peringkat berarti sumbu berisi
 * 31 label palsu yang tidak menceritakan apa pun. Karena itu peringkat hanya
 * memuat kode yang ADA DI KATALOG, dan derau dilaporkan sebagai satu angka
 * konteks — dipisahkan, bukan disembunyikan.
 *
 * Akar masalah nomor 2 ada di form order (`StepCheckout`), yang menerima teks apa
 * pun. Memperbaikinya di sana adalah pekerjaan tersendiri; di sini derau hanya
 * dipisahkan supaya pelaporannya jujur.
 */

import type {
    CampaignAnalytics,
    ClickAnalytics,
    DailyClickPoint,
    DateRange,
    Delta,
    RankedRow,
    VoucherAnalytics,
} from './types';
import {
    computeDelta,
    isInternalTestTx,
    isPaidTx,
    wibDayKey,
    wibDayLabel,
    type RevenueSubmission,
    type RevenueTransaction,
} from './revenue';
import { OFFICIAL_VOUCHER_CODES, VOUCHER_CATALOG, isVoucherActive } from '../cost-calculator';
import { CAMPAIGN_CLICK_LOG_SINCE } from '../constants';
import { toWibYmd } from '../airing-window';

const DAY_MS = 86_400_000;
/** Sabuk pengaman sumbu — sama dengan `buildDailySeries` di `revenue.ts`. */
const MAX_DAILY_BUCKETS = 400;

const numeric = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// ---------------------------------------------------------------------------
// Voucher
// ---------------------------------------------------------------------------

const OFFICIAL_SET = new Set(OFFICIAL_VOUCHER_CODES);

/** `" jfusuhud "` → `"JFUSUHUD"`. String kosong untuk isian yang memang kosong. */
export function normalizeVoucherCode(raw: string | null | undefined): string {
    return (raw ?? '').trim().toUpperCase();
}

/**
 * Kode ini pernah terdaftar resmi?
 *
 * Termasuk kode yang sudah mati (JAKPATUNIV2025): ia penghasil revenue nomor dua
 * sepanjang masa, jadi membuangnya ke keranjang "ketikan ngawur" akan menghapus
 * Rp 8,59jt dari sejarah dan membuat rentang lama terlihat kosong tanpa sebab.
 */
export function isOfficialVoucher(raw: string | null | undefined): boolean {
    const code = normalizeVoucherCode(raw);
    return code !== '' && OFFICIAL_SET.has(code);
}

/**
 * Kode yang masih hidup DAN publik pada `atMs` — penyebut "x dari y kode".
 *
 * Kode uji (`JFUTGRX`) tidak dihitung: ia bukan kampanye, dan memasukkannya
 * membuat penyebutnya mengaku ada satu promo lebih banyak dari yang sebenarnya.
 */
export function activePublicVoucherCount(atMs: number = Date.now()): number {
    return VOUCHER_CATALOG.filter((v) => !v.internal && isVoucherActive(v, atMs)).length;
}

/** Bentuk `RankedRow` dari ember `{value, orders}`, terurut menurun. */
function toRanked(bucket: Map<string, { value: number; orders: number }>): RankedRow[] {
    let total = 0;
    for (const row of bucket.values()) total += row.value;
    return [...bucket.entries()]
        .map(([name, row]) => ({
            name,
            value: row.value,
            orders: row.orders,
            share: total === 0 ? 0 : row.value / total,
        }))
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Klik
// ---------------------------------------------------------------------------

/** Baris `campaign_link_clicks`. */
export interface CampaignClickRow {
    source_name?: string | null;
    clicked_at?: string | null;
}

/** Baris `campaign_links`. */
export interface CampaignLinkRow {
    id?: string;
    source_name?: string | null;
    description?: string | null;
    click_count?: number | null;
    last_clicked_at?: string | null;
}

/**
 * Cakupan log klik terhadap rentang terpilih.
 *
 * Pencatatan per-tanggal baru lahir di `sql/68`; sebelum itu klik hanya ada
 * sebagai `campaign_links.click_count`, satu angka kumulatif tanpa tanggal.
 * Rentang yang seluruhnya mendahului tanggal itu WAJIB memunculkan `EmptyState`
 * yang menjelaskannya — nol yang tidak dijelaskan terbaca sebagai "tidak ada yang
 * mengklik", padahal artinya "belum dicatat". Ini pola yang sama dengan footnote
 * cakupan `loi_seconds` di tab Responden.
 */
export function clickCoverage(range: DateRange, logSinceIso: string = CAMPAIGN_CLICK_LOG_SINCE) {
    const logSince = new Date(logSinceIso);
    return {
        logSince,
        isPartiallyCovered: range.from.getTime() < logSince.getTime(),
        isFullyUncovered: range.to.getTime() <= logSince.getTime(),
    };
}

/** Instant UTC untuk 00:00 WIB pada `ymd`. */
function wibDayStartMs(ymd: string): number {
    return Date.parse(`${ymd}T00:00:00.000Z`) - 7 * 3_600_000;
}
function nextYmd(ymd: string): string {
    return new Date(Date.parse(`${ymd}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);
}

/**
 * Satu bucket per hari kalender WIB, menutupi rentang PERSIS.
 *
 * Sengaja tidak memakai `buildDailySeries` dari `revenue.ts`: fungsi itu terikat
 * pada bentuk transaksi (`amount`, `isPaidTx`) dan menghasilkan `DailyPoint` yang
 * membawa dua seri uang. Menekuknya untuk klik berarti menambah parameter generik
 * ke fungsi yang sedang dipakai dua kartu lain — biaya yang lebih besar daripada
 * tiga puluh baris ini.
 */
export function buildDailyClicks(
    clicks: CampaignClickRow[],
    range: DateRange,
    now: Date = new Date(),
): DailyClickPoint[] {
    const byDay = new Map<string, number>();
    for (const c of clicks) {
        const key = wibDayKey(c.clicked_at);
        if (!key) continue;
        byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }

    const todayKey = toWibYmd(now);
    const endMs = range.to.getTime();
    const out: DailyClickPoint[] = [];
    let ymd = wibDayKey(range.from.toISOString());
    for (let i = 0; ymd && i < MAX_DAILY_BUCKETS && wibDayStartMs(ymd) < endMs; i += 1) {
        out.push({
            dayKey: ymd,
            label: wibDayLabel(ymd),
            clicks: byDay.get(ymd) ?? 0,
            isPartial: ymd === todayKey,
        });
        ymd = nextYmd(ymd);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Perakitan
// ---------------------------------------------------------------------------

export interface CampaignInput {
    range: DateRange;
    /** Transaksi rentang ini, MENTAH — penyaringan lunas/uji dikerjakan di sini. */
    transactions: RevenueTransaction[];
    previousTransactions: RevenueTransaction[];
    /** Peta yang menutupi setiap `form_submission_id` di kedua daftar transaksi. */
    submissionsById: Map<string, RevenueSubmission & { voucher_code?: string | null }>;
    /** Submission yang DIBUAT di dalam rentang — sumber "order pakai voucher". */
    submissionsInRange: Array<{ voucher_code?: string | null }>;
    previousSubmissionsInRange: Array<{ voucher_code?: string | null }>;
    clicks: CampaignClickRow[];
    previousClicks: CampaignClickRow[];
    links: CampaignLinkRow[];
    now?: Date;
}

export function buildCampaignAnalytics(input: CampaignInput): CampaignAnalytics {
    const {
        range,
        transactions,
        previousTransactions,
        submissionsById,
        submissionsInRange,
        previousSubmissionsInRange,
        clicks,
        previousClicks,
        links,
        now = new Date(),
    } = input;

    const subOf = (tx: RevenueTransaction) =>
        tx.form_submission_id ? submissionsById.get(tx.form_submission_id) ?? null : null;

    /** Uang yang BENAR-BENAR masuk — saringan yang sama persis dengan tab Revenue. */
    const keepReal = (txs: RevenueTransaction[]) =>
        txs.filter((tx) => isPaidTx(tx) && !isInternalTestTx(tx, subOf(tx)));

    const paid = keepReal(transactions);
    const prevPaid = keepReal(previousTransactions);

    const sum = (txs: RevenueTransaction[]) => txs.reduce((s, tx) => s + numeric(tx.amount), 0);
    const totalRevenue = sum(paid);
    const prevTotalRevenue = sum(prevPaid);

    // Peringkat revenue: hanya transaksi lunas yang submission-nya memakai kode
    // resmi. `orders` dihitung per TRANSAKSI lunas, sejalan dengan `paidOrders`
    // di tab Revenue (satu order bisa punya beberapa transaksi).
    const revenueBucket = new Map<string, { value: number; orders: number }>();
    let voucherRevenue = 0;
    for (const tx of paid) {
        const code = normalizeVoucherCode(subOf(tx)?.voucher_code);
        if (!OFFICIAL_SET.has(code)) continue;
        const row = revenueBucket.get(code) ?? { value: 0, orders: 0 };
        row.value += numeric(tx.amount);
        row.orders += 1;
        revenueBucket.set(code, row);
        voucherRevenue += numeric(tx.amount);
    }
    let prevVoucherRevenue = 0;
    for (const tx of prevPaid) {
        if (!OFFICIAL_SET.has(normalizeVoucherCode(subOf(tx)?.voucher_code))) continue;
        prevVoucherRevenue += numeric(tx.amount);
    }

    // Peringkat pemakaian: SEMUA order di rentang ini yang memakai kode resmi,
    // lunas maupun belum. Sengaja beda penyebut dari peringkat revenue — sakelar
    // di kartunya memang menjawab dua pertanyaan berbeda ("mana yang menghasilkan
    // uang" vs "mana yang paling sering dipakai"), dan voucher yang banyak dipakai
    // tapi jarang dibayar adalah temuan, bukan kesalahan hitung.
    const usageBucket = new Map<string, { value: number; orders: number }>();
    let unofficialEntries = 0;
    const unofficialCodes = new Set<string>();
    let ordersUsing = 0;
    for (const sub of submissionsInRange) {
        const code = normalizeVoucherCode(sub.voucher_code);
        if (code === '') continue;
        if (!OFFICIAL_SET.has(code)) {
            unofficialEntries += 1;
            unofficialCodes.add(code);
            continue;
        }
        ordersUsing += 1;
        const row = usageBucket.get(code) ?? { value: 0, orders: 0 };
        row.value += 1;
        row.orders += 1;
        usageBucket.set(code, row);
    }
    const prevOrdersUsing = previousSubmissionsInRange.filter((s) =>
        isOfficialVoucher(s.voucher_code),
    ).length;

    // Porsi nol tidak boleh jadi `NaN`: rentang tanpa penjualan itu wajar, dan
    // `NaN` merambat sampai jadi "NaN%" di layar.
    const shareOf = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

    const voucher: VoucherAnalytics = {
        byRevenue: toRanked(revenueBucket),
        byOrders: toRanked(usageBucket),
        revenue: computeDelta(voucherRevenue, prevVoucherRevenue),
        revenueShare: computeDelta(
            shareOf(voucherRevenue, totalRevenue),
            shareOf(prevVoucherRevenue, prevTotalRevenue),
        ),
        ordersUsing: computeDelta(ordersUsing, prevOrdersUsing),
        codesUsed: usageBucket.size,
        codesRegistered: activePublicVoucherCount(now.getTime()),
        unofficialEntries,
        unofficialDistinct: unofficialCodes.size,
    };

    const sourceBucket = new Map<string, { value: number; orders: number }>();
    for (const c of clicks) {
        const name = (c.source_name ?? '').trim() || 'Tidak tercatat';
        const row = sourceBucket.get(name) ?? { value: 0, orders: 0 };
        row.value += 1;
        sourceBucket.set(name, row);
    }

    const coverage = clickCoverage(range);
    const clicksOut: ClickAnalytics = {
        total: computeDelta(clicks.length, previousClicks.length),
        daily: buildDailyClicks(clicks, range, now),
        bySource: toRanked(sourceBucket),
        lifetimeTotal: links.reduce((s, l) => s + numeric(l.click_count), 0),
        ...coverage,
    };

    return { range, voucher, clicks: clicksOut };
}

/** Bentuk kosong — dipakai saat data belum tiba, supaya UI tidak menjaga `null`. */
export function emptyCampaignAnalytics(range: DateRange): CampaignAnalytics {
    const zero: Delta = { current: 0, previous: 0, pctChange: null };
    return {
        range,
        voucher: {
            byRevenue: [],
            byOrders: [],
            revenue: zero,
            revenueShare: zero,
            ordersUsing: zero,
            codesUsed: 0,
            codesRegistered: activePublicVoucherCount(),
            unofficialEntries: 0,
            unofficialDistinct: 0,
        },
        clicks: {
            total: zero,
            daily: [],
            bySource: [],
            lifetimeTotal: 0,
            ...clickCoverage(range),
        },
    };
}
