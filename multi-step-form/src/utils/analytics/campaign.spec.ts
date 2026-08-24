import { describe, expect, test } from 'vitest';
import {
    activePublicVoucherCount,
    buildCampaignAnalytics,
    buildDailyClicks,
    clickCoverage,
    emptyCampaignAnalytics,
    isOfficialVoucher,
    normalizeVoucherCode,
    type CampaignInput,
} from './campaign';
import type { DateRange } from './types';
import { VOUCHER_CATALOG } from '../cost-calculator';

/**
 * Angka di berkas ini bukan karangan — disalin dari produksi (project
 * `zewuzezbmrmpttysjvpg`, diukur 2026-08-24):
 *
 *   voucher sepanjang masa: 119 isian · 73 kode resmi (9 kode) · 46 ngawur (31 "kode")
 *   Agustus 2026: Rp 7,69jt lewat voucher dari Rp 39,98jt total = 19,2%
 *   Juli 2026: 2,1% — JFUSUHUD sendirian yang menaikkannya
 *   JFUTGRX: revenue lunas versi `total_cost` Rp 3.000 (transaksi uji)
 *   campaign_links: 3 baris, 44 klik kumulatif, log per-tanggal mulai 2026-08-24
 */

const wibMidnight = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00.000Z`) - 7 * 3600_000);
const RANGE: DateRange = { from: wibMidnight('2026-08-18'), to: wibMidnight('2026-08-25') };
const NOW = new Date(Date.parse('2026-08-24T05:00:00.000Z')); // 12:00 WIB 24 Agu

function input(overrides: Partial<CampaignInput> = {}): CampaignInput {
    return {
        range: RANGE,
        transactions: [],
        previousTransactions: [],
        submissionsById: new Map(),
        submissionsInRange: [],
        previousSubmissionsInRange: [],
        clicks: [],
        previousClicks: [],
        links: [],
        now: NOW,
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// Pemisahan kode resmi dari ketikan bebas
// ---------------------------------------------------------------------------

describe('isOfficialVoucher', () => {
    test('kode resmi dikenali apa pun spasi & kapitalisasinya', () => {
        expect(isOfficialVoucher('  jfusuhud ')).toBe(true);
        expect(isOfficialVoucher('JFUFEB')).toBe(true);
    });

    test('ketikan ngawur produksi ditolak semuanya', () => {
        for (const junk of ['TIDAK ADA', '-', '1933', '95022605674760085', 'JAKPAT20', 'JFGITA', '']) {
            expect(isOfficialVoucher(junk)).toBe(false);
        }
    });

    test('kode yang sudah pensiun TETAP resmi — ia penghasil revenue #2 sepanjang masa', () => {
        // Membuangnya ke keranjang "ngawur" akan menghapus Rp 8,59jt dari sejarah.
        expect(isOfficialVoucher('JAKPATUNIV2025')).toBe(true);
    });

    test('normalisasi tidak menelan string kosong jadi kode', () => {
        expect(normalizeVoucherCode('   ')).toBe('');
        expect(normalizeVoucherCode(null)).toBe('');
    });
});

describe('activePublicVoucherCount', () => {
    test('kode uji & kode pensiun tidak ikut jadi penyebut', () => {
        const atMs = Date.parse('2026-08-24T00:00:00Z');
        const n = activePublicVoucherCount(atMs);
        expect(n).toBeLessThan(VOUCHER_CATALOG.length);
        // JFUTGRX (internal) & JAKPATUNIV2025 (retired) keduanya di luar.
        expect(n).toBe(VOUCHER_CATALOG.filter((v) => !v.internal && !v.retired).length);
    });

    test('JFUSUHUD keluar dari hitungan sendiri setelah 31 Agu 2026', () => {
        const before = activePublicVoucherCount(Date.parse('2026-08-24T00:00:00Z'));
        const after = activePublicVoucherCount(Date.parse('2026-09-02T00:00:00Z'));
        expect(after).toBe(before - 1);
    });
});

// ---------------------------------------------------------------------------
// Revenue voucher — sumbernya transactions, BUKAN total_cost
// ---------------------------------------------------------------------------

describe('buildCampaignAnalytics · voucher', () => {
    const subs = new Map<string, any>([
        ['s1', { id: 's1', voucher_code: 'JFUSUHUD', email: 'a@kampus.ac.id' }],
        ['s2', { id: 's2', voucher_code: 'jfusuhud', email: 'b@kampus.ac.id' }],
        ['s3', { id: 's3', voucher_code: 'TIDAK ADA', email: 'c@kampus.ac.id' }],
        ['s4', { id: 's4', voucher_code: null, email: 'd@kampus.ac.id' }],
        ['s5', { id: 's5', voucher_code: 'JFUTGRX', email: 'e@jakpat.net' }],
    ]);

    test('hanya transaksi lunas yang menghasilkan revenue voucher', () => {
        const out = buildCampaignAnalytics(
            input({
                submissionsById: subs,
                transactions: [
                    { id: 't1', amount: 2_000_000, status: 'paid', form_submission_id: 's1' },
                    { id: 't2', amount: 1_500_000, status: 'pending', form_submission_id: 's2' },
                ],
            }),
        );
        expect(out.voucher.revenue.current).toBe(2_000_000);
        expect(out.voucher.byRevenue).toHaveLength(1);
        expect(out.voucher.byRevenue[0]).toMatchObject({ name: 'JFUSUHUD', value: 2_000_000, orders: 1 });
    });

    test('transaksi uji internal dibuang — persis seperti tab Revenue', () => {
        // Rp 3.000 di bawah INTERNAL_TEST_AMOUNT_THRESHOLD. Inilah angka yang muncul
        // kalau revenue-nya diambil dari `total_cost`: JFUTGRX seolah menghasilkan uang.
        const out = buildCampaignAnalytics(
            input({
                submissionsById: subs,
                transactions: [{ id: 't1', amount: 3_000, status: 'paid', form_submission_id: 's5' }],
            }),
        );
        expect(out.voucher.revenue.current).toBe(0);
        expect(out.voucher.byRevenue).toHaveLength(0);
    });

    test('kapitalisasi berbeda dilebur jadi satu baris', () => {
        const out = buildCampaignAnalytics(
            input({
                submissionsById: subs,
                transactions: [
                    { id: 't1', amount: 1_000_000, status: 'paid', form_submission_id: 's1' },
                    { id: 't2', amount: 500_000, status: 'completed', form_submission_id: 's2' },
                ],
            }),
        );
        expect(out.voucher.byRevenue).toHaveLength(1);
        expect(out.voucher.byRevenue[0].value).toBe(1_500_000);
        expect(out.voucher.byRevenue[0].orders).toBe(2);
    });

    test('porsi revenue dihitung terhadap SELURUH revenue lunas, bukan hanya yang ber-voucher', () => {
        const out = buildCampaignAnalytics(
            input({
                submissionsById: subs,
                transactions: [
                    { id: 't1', amount: 2_000_000, status: 'paid', form_submission_id: 's1' },
                    { id: 't2', amount: 8_000_000, status: 'paid', form_submission_id: 's4' },
                ],
                previousTransactions: [
                    { id: 'p1', amount: 100_000, status: 'paid', form_submission_id: 's1' },
                    { id: 'p2', amount: 900_000, status: 'paid', form_submission_id: 's4' },
                ],
            }),
        );
        expect(out.voucher.revenueShare.current).toBeCloseTo(0.2, 6);
        expect(out.voucher.revenueShare.previous).toBeCloseTo(0.1, 6);
    });

    test('rentang tanpa penjualan memberi porsi 0, bukan NaN', () => {
        const out = buildCampaignAnalytics(input({ submissionsById: subs }));
        expect(out.voucher.revenueShare.current).toBe(0);
        expect(Number.isNaN(out.voucher.revenueShare.current)).toBe(false);
    });

    test('ketikan ngawur dipisah dari peringkat tapi tetap dilaporkan', () => {
        const out = buildCampaignAnalytics(
            input({
                submissionsInRange: [
                    { voucher_code: 'JFUSUHUD' },
                    { voucher_code: 'JFUSUHUD' },
                    { voucher_code: 'JFUFEB' },
                    { voucher_code: 'TIDAK ADA' },
                    { voucher_code: '-' },
                    { voucher_code: '1933' },
                    { voucher_code: '1933' },
                    { voucher_code: '' },
                    { voucher_code: null },
                ],
            }),
        );
        expect(out.voucher.byOrders.map((r) => r.name)).toEqual(['JFUSUHUD', 'JFUFEB']);
        expect(out.voucher.ordersUsing.current).toBe(3);
        expect(out.voucher.codesUsed).toBe(2);
        // 4 isian ngawur dari 3 "kode" berbeda; isian kosong tidak dihitung derau.
        expect(out.voucher.unofficialEntries).toBe(4);
        expect(out.voucher.unofficialDistinct).toBe(3);
    });

    test('delta pemakaian memakai submission periode sebelumnya', () => {
        const out = buildCampaignAnalytics(
            input({
                submissionsInRange: [{ voucher_code: 'JFUSUHUD' }, { voucher_code: 'JFUFEB' }],
                previousSubmissionsInRange: [{ voucher_code: 'JFUSUHUD' }, { voucher_code: 'TIDAK ADA' }],
            }),
        );
        expect(out.voucher.ordersUsing.current).toBe(2);
        expect(out.voucher.ordersUsing.previous).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// Klik
// ---------------------------------------------------------------------------

describe('clickCoverage', () => {
    test('rentang yang seluruhnya mendahului log ditandai belum tercakup', () => {
        const old: DateRange = { from: wibMidnight('2026-07-01'), to: wibMidnight('2026-07-08') };
        const c = clickCoverage(old, '2026-08-24T00:00:00+07:00');
        expect(c.isFullyUncovered).toBe(true);
        expect(c.isPartiallyCovered).toBe(true);
    });

    test('rentang yang melintasi tanggal log tercakup sebagian', () => {
        const c = clickCoverage(RANGE, '2026-08-24T00:00:00+07:00');
        expect(c.isFullyUncovered).toBe(false);
        expect(c.isPartiallyCovered).toBe(true);
    });

    test('rentang setelah log mulai tidak memunculkan peringatan apa pun', () => {
        const later: DateRange = { from: wibMidnight('2026-09-01'), to: wibMidnight('2026-09-08') };
        const c = clickCoverage(later, '2026-08-24T00:00:00+07:00');
        expect(c.isFullyUncovered).toBe(false);
        expect(c.isPartiallyCovered).toBe(false);
    });
});

describe('buildDailyClicks', () => {
    test('satu bucket per hari kalender, menutupi rentang persis', () => {
        const points = buildDailyClicks([], RANGE, NOW);
        expect(points).toHaveLength(7);
        expect(points[0].dayKey).toBe('2026-08-18');
        expect(points[6].dayKey).toBe('2026-08-24');
    });

    test('hari berjalan ditandai parsial; hari lain tidak', () => {
        const points = buildDailyClicks([], RANGE, NOW);
        expect(points.filter((p) => p.isPartial).map((p) => p.dayKey)).toEqual(['2026-08-24']);
    });

    test('klik dibucket menurut kalender WIB, bukan UTC', () => {
        // 2026-08-19T18:00Z = 20 Agu 01:00 WIB — hari berikutnya menurut WIB.
        const points = buildDailyClicks(
            [{ source_name: 'ig', clicked_at: '2026-08-19T18:00:00Z' }],
            RANGE,
            NOW,
        );
        expect(points.find((p) => p.dayKey === '2026-08-19')?.clicks).toBe(0);
        expect(points.find((p) => p.dayKey === '2026-08-20')?.clicks).toBe(1);
    });

    test('jumlah seluruh batang = jumlah baris log di rentang', () => {
        const clicks = [
            { source_name: 'ig', clicked_at: '2026-08-19T03:00:00Z' },
            { source_name: 'ig', clicked_at: '2026-08-19T04:00:00Z' },
            { source_name: 'tiktok', clicked_at: '2026-08-21T03:00:00Z' },
        ];
        const total = buildDailyClicks(clicks, RANGE, NOW).reduce((s, p) => s + p.clicks, 0);
        expect(total).toBe(clicks.length);
    });
});

describe('buildCampaignAnalytics · klik', () => {
    test('total ber-rentang datang dari log; total seumur hidup dari penghitung', () => {
        const out = buildCampaignAnalytics(
            input({
                clicks: [
                    { source_name: 'blog-insight', clicked_at: '2026-08-24T02:00:00Z' },
                    { source_name: 'blog-insight', clicked_at: '2026-08-24T03:00:00Z' },
                ],
                previousClicks: [{ source_name: 'blog-insight', clicked_at: '2026-08-12T02:00:00Z' }],
                // Angka produksi: 42 + 1 + 1 = 44 klik sebelum log ada.
                links: [
                    { source_name: 'blog-insight', click_count: 42 },
                    { source_name: 'test-curl', click_count: 1 },
                    { source_name: 'blog-insigh', click_count: 1 },
                ],
            }),
        );
        expect(out.clicks.total.current).toBe(2);
        expect(out.clicks.total.previous).toBe(1);
        expect(out.clicks.lifetimeTotal).toBe(44);
        expect(out.clicks.bySource[0]).toMatchObject({ name: 'blog-insight', value: 2 });
    });

    test('link tanpa klik tidak membuat lifetimeTotal jadi NaN', () => {
        const out = buildCampaignAnalytics(input({ links: [{ source_name: 'x', click_count: null }] }));
        expect(out.clicks.lifetimeTotal).toBe(0);
    });
});

describe('emptyCampaignAnalytics', () => {
    test('bentuknya lengkap dan tidak ada NaN', () => {
        const out = emptyCampaignAnalytics(RANGE);
        expect(out.voucher.byRevenue).toEqual([]);
        expect(out.voucher.revenueShare.current).toBe(0);
        expect(out.clicks.lifetimeTotal).toBe(0);
        expect(out.voucher.codesRegistered).toBeGreaterThan(0);
    });
});
