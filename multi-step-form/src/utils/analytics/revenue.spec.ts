import { describe, expect, test, vi } from 'vitest';
import {
    buildDailySeries,
    buildRevenueAnalytics,
    canonicalUniversity,
    collectMissingSubmissionIds,
    computeDelta,
    isInternalTestTx,
    PAID_TX_STATUSES,
    paymentChannelLabel,
    rankBy,
    splitPpn,
    toShareSeries,
    UNRECORDED_CHANNEL,
    wibDayKey,
    type RevenueSubmission,
    type RevenueTransaction,
} from './revenue';
import type { DailyPoint } from './types';

/**
 * Angka di berkas ini bukan karangan — semuanya disalin dari produksi
 * (project `zewuzezbmrmpttysjvpg`, per 2026-08-21). Delapan transaksi
 * berstatus `'paid'` senilai Rp 4.469.810 dan delapan transaksi uji Rp 1.000–2.000
 * adalah baris yang benar-benar ada, dan persis merekalah yang dulu dihitung salah.
 */

/** 00:00 WIB tanggal `ymd` — batas hari yang dipakai seluruh dashboard. */
const wibMidnight = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00.000Z`) - 7 * 3600_000);

let seq = 0;
const tx = (over: Partial<RevenueTransaction> = {}): RevenueTransaction => ({
    id: `tx-${(seq += 1)}`,
    amount: 500_000,
    subtotal: null,
    status: 'completed',
    entity_type: 'submission',
    form_submission_id: 'sub-1',
    created_at: '2026-08-18T06:00:00.000Z',
    ...over,
});

const sub = (over: Partial<RevenueSubmission> = {}): RevenueSubmission => ({
    id: 'sub-1',
    auth_user_id: 'user-1',
    email: 'peneliti@kampus.ac.id',
    university: 'UNJ',
    department: 'Manajemen',
    referral_source: 'Instagram',
    ...over,
});

const mapOf = (...subs: RevenueSubmission[]) =>
    new Map<string, RevenueSubmission>(subs.map((s) => [String(s.id), s]));

/** Rentang 15–21 Agu 2026 — `to` eksklusif, jadi 00:00 WIB tanggal 22. */
const AGU_15_21 = { from: wibMidnight('2026-08-15'), to: wibMidnight('2026-08-22') };
const NOW = new Date('2026-08-21T10:00:00.000Z'); // 17.00 WIB, 21 Agu

describe('definisi lunas (V1)', () => {
    test("status 'paid' ikut terhitung, bukan cuma 'completed'", () => {
        expect([...PAID_TX_STATUSES]).toEqual(['paid', 'completed']);

        // Delapan baris `status='paid'` yang persis dibuang filter lama.
        const paidRows = [200_000, 260_000, 670_000, 375_000, 999_000, 499_500, 1_465_200, 1_110];
        const txs = paidRows.map((amount, i) =>
            tx({ amount, status: 'paid', created_at: `2026-08-1${(i % 5) + 5}T06:00:00.000Z` }),
        );

        const result = buildRevenueAnalytics({
            range: { from: wibMidnight('2026-08-01'), to: wibMidnight('2026-09-01') },
            transactions: txs,
            submissionsById: mapOf(sub()),
            now: NOW,
        });

        // Rp 1.110 adalah transaksi uji internal, sisanya nyata.
        expect(result.totalRevenue.current).toBe(4_469_810 - 1_110);
        expect(result.paidOrders.current).toBe(7);
    });

    test("status mati ('expired', 'cancelled', 'pending') tidak pernah jadi revenue", () => {
        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: [
                tx({ amount: 832_500, status: 'expired' }),
                tx({ amount: 2_494_500, status: 'cancelled' }),
                tx({ amount: 721_500, status: 'pending' }),
            ],
            submissionsById: mapOf(sub()),
            now: NOW,
        });

        expect(result.totalRevenue.current).toBe(0);
        expect(result.paidOrders.current).toBe(0);
        // …dan tidak menyelinap lewat breakdown mana pun.
        expect(result.byUniversity).toEqual([]);
        expect(result.byPaymentChannel).toEqual([]);
    });
});

describe('transaksi uji internal (V3)', () => {
    const internal: Array<[number, string, string]> = [
        [2_000, 'egi@jakpat.net', 'UIIIII'],
        [2_000, 'tegar@jakpat.com', 'ui'],
        [1_000, 'product@jakpat.net', 'UIIIII'],
        [1_000, 'egidwisetiyono@gmail.com', 'UIIIII'],
        [1_000, 'ainu.rakhma@jakpat.net', 'UIIIII'],
        [1_110, 'product@jakpat.net', 'Universitas Indonesia (UI)'],
    ];

    test('semua baris uji produksi terbuang dari setiap angka', () => {
        const subs = internal.map(([, email, university], i) =>
            sub({ id: `t-${i}`, auth_user_id: `u-${i}`, email, university }),
        );
        const txs = internal.map(([amount], i) =>
            tx({ amount, form_submission_id: `t-${i}`, created_at: '2026-08-18T06:00:00.000Z' }),
        );

        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: txs,
            submissionsById: mapOf(...subs),
            now: NOW,
        });

        expect(result.totalRevenue.current).toBe(0);
        expect(result.paidOrders.current).toBe(0);
        expect(result.byUniversity).toEqual([]);
        expect(result.daily.every((d) => d.revenue === 0)).toBe(true);
    });

    test('email @jakpat sendirian sudah cukup — nominalnya boleh besar', () => {
        expect(isInternalTestTx({ amount: 5_000_000 }, sub({ email: 'product@jakpat.net' }))).toBe(true);
        expect(isInternalTestTx({ amount: 5_000_000 }, sub({ email: 'qa@jakpat.com' }))).toBe(true);
        expect(isInternalTestTx({ amount: 5_000_000 }, sub({ email: 'riset@unj.ac.id' }))).toBe(false);
    });

    test('nominal di bawah Rp 10.000 sendirian sudah cukup — emailnya boleh pribadi', () => {
        expect(isInternalTestTx({ amount: 1_000 }, sub({ email: 'egidwisetiyono@gmail.com' }))).toBe(true);
        // Order sah termurah Rp 200.000; ambangnya tidak boleh menyentuhnya.
        expect(isInternalTestTx({ amount: 200_000 }, sub({ email: 'egidwisetiyono@gmail.com' }))).toBe(false);
    });

    test('submission yang hilang tidak membuat transaksi besar dikira uji', () => {
        expect(isInternalTestTx({ amount: 1_465_200 }, undefined)).toBe(false);
    });
});

describe('normalisasi nama universitas (V2)', () => {
    test('tiga ejaan UNJ menyatu jadi satu baris', () => {
        const spellings = ['UNJ', 'Universitas Negeri Jakarta', 'Universitas Negeri Jakarta (UNJ)'];
        expect(spellings.map(canonicalUniversity)).toEqual(['UNJ', 'UNJ', 'UNJ']);

        const subs = spellings.map((university, i) =>
            sub({ id: `s-${i}`, auth_user_id: `u-${i}`, university }),
        );
        const txs = [
            tx({ amount: 56_280_000, form_submission_id: 's-0' }),
            tx({ amount: 13_110_000, form_submission_id: 's-1' }),
            tx({ amount: 11_310_400, form_submission_id: 's-2' }),
        ];

        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: txs,
            submissionsById: mapOf(...subs),
            now: NOW,
        });

        expect(result.byUniversity).toHaveLength(1);
        expect(result.byUniversity[0]).toMatchObject({
            name: 'UNJ',
            value: 80_700_400,
            orders: 3,
            share: 1,
        });
    });

    test('UI menyatu tanpa menelan kampus Islam / Internasional', () => {
        for (const raw of ['Universitas Indonesia', 'Universitas Indonesia (UI)', 'universitas indonesia', 'ui']) {
            expect(canonicalUniversity(raw)).toBe('Universitas Indonesia');
        }
        for (const raw of [
            'Universitas Islam Negeri Palopo',
            'INTI INTERNATIONAL UNIVERSITY',
            'Universitas Islam Indonesia',
            'UIIIII',
        ]) {
            expect(canonicalUniversity(raw)).not.toBe('Universitas Indonesia');
        }
        // Nama tak dikenal dikembalikan apa adanya, bukan dilipat ke tetangga terdekat.
        expect(canonicalUniversity('UIIIII')).toBe('UIIIII');
    });

    test('lima ejaan BINUS menyatu', () => {
        for (const raw of [
            'Universitas Bina Nusantara',
            'BINUS',
            'BINUS ',
            'Binus University',
            'BINUS University',
            'Binus Business School',
            'Bina Nusantara',
            'Bina Nusantara University (BINUS)',
        ]) {
            expect(canonicalUniversity(raw)).toBe('BINUS');
        }
    });

    test('UGM dan ITB, termasuk SBM yang ditulis sebagai sekolah terpisah', () => {
        expect(canonicalUniversity('Universitas Gadjah Mada')).toBe('UGM');
        expect(canonicalUniversity('ugm')).toBe('UGM');
        expect(canonicalUniversity('Institut Teknologi Bandung')).toBe('ITB');
        expect(canonicalUniversity('Sekolah Bisnis dan Manajemen (SBM) ITB')).toBe('ITB');
    });

    test('kosong jadi "Tidak Diketahui", bukan string kosong di sumbu', () => {
        expect(canonicalUniversity('')).toBe('Tidak Diketahui');
        expect(canonicalUniversity('   ')).toBe('Tidak Diketahui');
        expect(canonicalUniversity(null)).toBe('Tidak Diketahui');
        expect(canonicalUniversity(undefined)).toBe('Tidak Diketahui');
    });

    test('placeholder tanpa huruf/angka bukan nama kampus', () => {
        // Terlihat di produksi: sebuah "-" muncul jadi baris peringkat sungguhan
        // senilai Rp 555.000 (5% revenue seminggu), lengkap dengan batangnya sendiri.
        // `normalizeUnivKey` membuang titik & koma tapi TIDAK tanda hubung.
        for (const raw of ['-', '--', '.', '?', '???', ' - ', '_']) {
            expect(canonicalUniversity(raw)).toBe('Tidak Diketahui');
        }
    });

    test('token sampah yang kebetulan punya huruf juga ditangkap', () => {
        for (const raw of ['n/a', 'N/A', 'na', 'none', 'null', 'Tidak Ada']) {
            expect(canonicalUniversity(raw)).toBe('Tidak Diketahui');
        }
    });

    test('placeholder dilipat di SEMUA breakdown free-text, bukan cuma universitas', () => {
        // Regresi nyata: perbaikan versi pertama hanya menambal `canonicalUniversity`,
        // dan "-" langsung muncul lagi di kartu Jurusan lewat jalur `department`.
        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: [tx({ amount: 555_000 })],
            submissionsById: mapOf(sub({ university: '-', department: '-', referral_source: '-' })),
            now: NOW,
        });
        expect(result.byUniversity.map((r) => r.name)).toEqual(['Tidak Diketahui']);
        expect(result.byDepartment.map((r) => r.name)).toEqual(['Tidak Diketahui']);
        // Referral punya fallback sendiri: tidak diisi artinya datang sendiri.
        expect(result.byReferral.map((r) => r.name)).toEqual(['Organik']);
    });

    test('nama pendek yang SAH tidak ikut terbuang', () => {
        // Pagar di atas hanya boleh menangkap placeholder — bukan kampus asing
        // bernama pendek, dan bukan nama tak dikenal yang memang harus lolos apa adanya.
        expect(canonicalUniversity('Pusan National University')).toBe('Pusan National University');
        expect(canonicalUniversity('UIIIII')).toBe('UIIIII');
    });
});

describe('hari menurut WIB (V5)', () => {
    test('transaksi 02.00 WIB masuk hari WIB-nya, bukan hari UTC-nya', () => {
        // 19:00 UTC 17 Agu = 02:00 WIB 18 Agu. Jam device tidak boleh menentukan.
        expect(wibDayKey('2026-08-17T19:00:00.000Z')).toBe('2026-08-18');
        expect(wibDayKey('2026-08-17T16:59:59.000Z')).toBe('2026-08-17');
        expect(wibDayKey('2026-08-17T17:00:00.000Z')).toBe('2026-08-18');

        const series = buildDailySeries(
            [tx({ amount: 1_465_200, created_at: '2026-08-17T19:00:00.000Z' })],
            AGU_15_21,
            NOW,
        );
        expect(series.find((d) => d.dayKey === '2026-08-18')?.revenue).toBe(1_465_200);
        expect(series.find((d) => d.dayKey === '2026-08-17')?.revenue).toBe(0);
    });

    test('kunci bucket membawa tahun, jadi Agustus 2025 tidak menumpuk ke 2026', () => {
        const range = { from: wibMidnight('2025-09-01'), to: wibMidnight('2026-09-01') };
        const series = buildDailySeries(
            [
                tx({ amount: 1_000_000, created_at: '2025-09-15T06:00:00.000Z' }),
                tx({ amount: 2_000_000, created_at: '2026-08-15T06:00:00.000Z' }),
            ],
            range,
            NOW,
        );

        expect(series.find((d) => d.dayKey === '2025-09-15')?.revenue).toBe(1_000_000);
        expect(series.find((d) => d.dayKey === '2026-08-15')?.revenue).toBe(2_000_000);
        expect(new Set(series.map((d) => d.dayKey)).size).toBe(series.length);
    });

    test('tanggal tak terurai jadi string kosong, tidak diam-diam jadi hari ini', () => {
        expect(wibDayKey('bukan tanggal')).toBe('');
        expect(wibDayKey(null)).toBe('');
    });
});

describe('rentang sumbu harian (V6, V7)', () => {
    test('rentang 7 hari menghasilkan tepat 7 bucket, ujung ke ujung', () => {
        const series = buildDailySeries([], AGU_15_21, NOW);
        expect(series).toHaveLength(7);
        expect(series[0].dayKey).toBe('2026-08-15');
        expect(series[6].dayKey).toBe('2026-08-21');
    });

    test('rentang 365 hari menghasilkan 365 bucket — bukan 30 seperti fallback lama', () => {
        const range = { from: wibMidnight('2025-09-01'), to: wibMidnight('2026-09-01') };
        const series = buildDailySeries([], range, NOW);

        expect(series).toHaveLength(365);
        expect(series[0].dayKey).toBe('2025-09-01');
        expect(series[364].dayKey).toBe('2026-08-31');
        expect(new Set(series.map((d) => d.dayKey)).size).toBe(365);
    });

    test('hari berjalan ditandai parsial, hari lain tidak', () => {
        const series = buildDailySeries([], AGU_15_21, NOW); // NOW = 21 Agu 17.00 WIB
        expect(series[series.length - 1]).toMatchObject({ dayKey: '2026-08-21', isPartial: true });
        expect(series.slice(0, -1).every((d) => d.isPartial)).toBe(false);
        expect(series.filter((d) => d.isPartial)).toHaveLength(1);
    });

    test('rentang yang seluruhnya di masa lalu tidak punya hari parsial', () => {
        const range = { from: wibMidnight('2026-07-01'), to: wibMidnight('2026-07-08') };
        expect(buildDailySeries([], range, NOW).some((d) => d.isPartial)).toBe(false);
    });

    test('label sumbu boleh berulang antar tahun — karena itu bukan dia kuncinya', () => {
        const range = { from: wibMidnight('2025-09-01'), to: wibMidnight('2026-09-01') };
        const series = buildDailySeries([], range, NOW);
        const agu15 = series.filter((d) => d.dayKey.endsWith('-08-15'));
        expect(agu15).toHaveLength(1);
        expect(agu15[0].label).toMatch(/15/);
    });
});

describe('breakdown selalu berjumlah sama dengan totalnya (V4)', () => {
    const orphanTx = tx({
        id: 'tx-yatim',
        amount: 444_000,
        form_submission_id: 'sub-di-luar-window',
        created_at: '2026-08-20T06:00:00.000Z',
    });

    test('transaksi yang submission-nya hilang dilaporkan, bukan diuapkan', () => {
        const onMissingSubmission = vi.fn();
        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: [tx({ amount: 1_465_200 }), orphanTx],
            submissionsById: mapOf(sub()),
            now: NOW,
            onMissingSubmission,
        });

        expect(onMissingSubmission).toHaveBeenCalledTimes(1);
        expect(onMissingSubmission.mock.calls[0][0].id).toBe('tx-yatim');

        // Uangnya tetap masuk KPI…
        expect(result.totalRevenue.current).toBe(1_909_200);
        // …DAN tetap muncul di setiap breakdown.
        const sumOf = (rows: Array<{ value: number }>) => rows.reduce((s, r) => s + r.value, 0);
        expect(sumOf(result.byUniversity)).toBe(result.totalRevenue.current);
        expect(sumOf(result.byCustomer)).toBe(result.totalRevenue.current);
        expect(sumOf(result.byDepartment)).toBe(result.totalRevenue.current);
        expect(sumOf(result.byReferral)).toBe(result.totalRevenue.current);
        expect(result.byUniversity.some((r) => r.name === 'Tidak Diketahui')).toBe(true);
    });

    test('grafik harian juga berjumlah sama dengan total', () => {
        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: [tx({ amount: 1_465_200 }), orphanTx],
            submissionsById: mapOf(sub()),
            now: NOW,
        });
        expect(result.daily.reduce((s, d) => s + d.revenue, 0)).toBe(result.totalRevenue.current);
        expect(result.daily.reduce((s, d) => s + d.paidOrders, 0)).toBe(result.paidOrders.current);
    });

    test('sisa peringkat dilipat ke "Lainnya", tidak dipotong hilang', () => {
        const rows = rankBy(
            [100, 90, 80, 70, 60, 50].map((n) => tx({ amount: n })),
            (t) => `k-${t.amount}`,
            4,
        );
        expect(rows).toHaveLength(5);
        expect(rows[4]).toMatchObject({ name: 'Lainnya', value: 110, orders: 2 });
        expect(rows.reduce((s, r) => s + r.value, 0)).toBe(450);
        expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 10);
    });

    test('id submission yang belum terambil bisa dikumpulkan untuk disusul fetch', () => {
        expect(collectMissingSubmissionIds([tx(), orphanTx], mapOf(sub()))).toEqual([
            'sub-di-luar-window',
        ]);
    });
});

describe('AOV per order lunas (V9)', () => {
    test('penyebutnya transaksi, bukan submission unik', () => {
        // Satu submission, tiga transaksi Rp 1,5jt — pola nyata `3ffe752e…`.
        const txs = [1_500_000, 1_500_000, 1_500_000].map((amount) => tx({ amount }));
        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: txs,
            submissionsById: mapOf(sub()),
            now: NOW,
        });

        expect(result.paidOrders.current).toBe(3);
        expect(result.aov.current).toBe(1_500_000); // bukan 4.500.000
        // Pelanggan tetap satu orang — itu ukuran yang berbeda, dan memang beda.
        expect(result.payingCustomers.current).toBe(1);
    });
});

describe('pecahan PPN (V8)', () => {
    test('subtotal NULL diperlakukan sebagai sudah-net, jadi PPN tidak pernah negatif', () => {
        expect(splitPpn([tx({ amount: 200_000, subtotal: null })])).toEqual({
            gross: 200_000,
            subtotal: 200_000,
            ppn: 0,
        });
    });

    test('campuran baris lama dan baru dijumlahkan benar', () => {
        const result = splitPpn([
            tx({ amount: 999_000, subtotal: 900_000 }),
            tx({ amount: 499_500, subtotal: 450_000 }),
            tx({ amount: 1_465_200, subtotal: 1_320_000 }),
            tx({ amount: 375_000, subtotal: null }),
        ]);
        expect(result.gross).toBe(3_338_700);
        expect(result.subtotal).toBe(3_045_000);
        expect(result.ppn).toBe(293_700);
    });
});

describe('delta terhadap periode sebelumnya', () => {
    test('pembanding nol memberi null, tidak pernah Infinity', () => {
        expect(computeDelta(8_981_010, 0)).toEqual({
            current: 8_981_010,
            previous: 0,
            pctChange: null,
        });
        expect(computeDelta(0, 0).pctChange).toBeNull();
    });

    test('pctChange dalam persen, bertanda, dan dibulatkan oleh lapisan tampilan', () => {
        expect(computeDelta(150, 100).pctChange).toBeCloseTo(50, 10);
        expect(computeDelta(50, 100).pctChange).toBeCloseTo(-50, 10);
    });

    test('perakit mengisi keempat KPI dari periode pembanding', () => {
        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: [tx({ amount: 1_000_000 })],
            previousTransactions: [tx({ amount: 800_000, created_at: '2026-08-10T06:00:00.000Z' })],
            submissionsById: mapOf(sub()),
            now: NOW,
        });
        expect(result.totalRevenue).toMatchObject({ current: 1_000_000, previous: 800_000 });
        expect(result.totalRevenue.pctChange).toBeCloseTo(25, 10);
        expect(result.paidOrders).toMatchObject({ current: 1, previous: 1 });
    });
});

describe('konversi & segmen', () => {
    test('konversi memakai order MASUK sebagai penyebut', () => {
        const subs = Array.from({ length: 4 }, (_, i) =>
            sub({ id: `s-${i}`, auth_user_id: `u-${i}` }),
        );
        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: [tx({ form_submission_id: 's-0' }), tx({ form_submission_id: 's-1' })],
            submissionsInRange: subs,
            submissionsById: mapOf(...subs),
            now: NOW,
        });
        expect(result.conversion).toEqual({ ordersIn: 4, ordersPaid: 2, rate: 0.5, spamOrders: 0 });
    });

    test('submission spam tidak ikut jadi penyebut konversi', () => {
        // Spam bukan penjualan yang hilang, ia derau. Memasukkannya membuat konversi
        // terlihat lebih buruk daripada kenyataannya. Angka produksi 7 hari:
        // 26 submission - 3 spam = 23 penyebut, 11 lunas => 47,8% (bukan 46,2%).
        const bersih = Array.from({ length: 3 }, (_, i) =>
            sub({ id: `ok-${i}`, auth_user_id: `u-${i}` }),
        );
        const spam = [
            sub({ id: 'spam-1', auth_user_id: 'u-s1', submission_status: 'spam' }),
            // Kolom lama `status` juga masih dipakai di tabel ini.
            sub({ id: 'spam-2', auth_user_id: 'u-s2', submission_status: null, status: 'spam' }),
        ];
        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: [tx({ form_submission_id: 'ok-0' })],
            submissionsInRange: [...bersih, ...spam],
            submissionsById: mapOf(...bersih, ...spam),
            now: NOW,
        });
        expect(result.conversion.ordersIn).toBe(3);
        expect(result.conversion.ordersPaid).toBe(1);
        // Jumlahnya ikut dibuka: footnote kartunya menyebut angka ini, jadi "spam
        // tidak dihitung" bisa diperiksa pembaca, bukan cuma diklaim.
        expect(result.conversion.spamOrders).toBe(2);
    });

    test('order cancelled TETAP dihitung sebagai penyebut', () => {
        // Berbeda dari spam: order yang dibatalkan memang penjualan yang gagal.
        const subs = [
            sub({ id: 'a', auth_user_id: 'u-a' }),
            sub({ id: 'b', auth_user_id: 'u-b', submission_status: 'cancelled' }),
        ];
        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: [tx({ form_submission_id: 'a' })],
            submissionsInRange: subs,
            submissionsById: mapOf(...subs),
            now: NOW,
        });
        expect(result.conversion.ordersIn).toBe(2);
        expect(result.conversion.rate).toBe(0.5);
    });

    test('rasio konversi tidak pernah melewati 100%', () => {
        // Terjadi di produksi: satu submission ber-flag spam TAPI punya transaksi
        // lunas. Pembilang dari `transactions`, penyebut dari `form_submissions`,
        // jadi keduanya bisa berselisih dan rasionya bisa meledak tanpa jepitan.
        const spamTapiBayar = sub({ id: 'x', auth_user_id: 'u-x', submission_status: 'spam' });
        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: [tx({ form_submission_id: 'x' })],
            submissionsInRange: [spamTapiBayar],
            submissionsById: mapOf(spamTapiBayar),
            now: NOW,
        });
        expect(result.conversion.ordersIn).toBe(0);
        expect(result.conversion.rate).toBeLessThanOrEqual(1);
    });

    test('pelanggan yang sudah pernah bayar sebelum rentang dihitung repeat', () => {
        const lama = sub({ id: 's-lama', auth_user_id: 'u-lama' });
        const baru = sub({ id: 's-baru', auth_user_id: 'u-baru' });
        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: [
                tx({ amount: 1_000_000, form_submission_id: 's-lama' }),
                tx({ amount: 400_000, form_submission_id: 's-lama' }),
                tx({ amount: 600_000, form_submission_id: 's-baru' }),
            ],
            submissionsById: mapOf(lama, baru),
            firstPaidAtByCustomer: new Map([
                ['u-lama', wibMidnight('2026-05-01').getTime()],
                ['u-baru', wibMidnight('2026-08-18').getTime()],
            ]),
            now: NOW,
        });

        const bySegment = Object.fromEntries(result.segments.map((s) => [s.segment, s]));
        expect(bySegment.repeat).toMatchObject({ customers: 1, orders: 2, revenue: 1_400_000 });
        expect(bySegment.new).toMatchObject({ customers: 1, orders: 1, revenue: 600_000 });
        // Tidak ada orang yang muncul di dua segmen sekaligus.
        expect(bySegment.new.customers + bySegment.repeat.customers).toBe(2);
    });
});

describe('batas terhadap PostgREST', () => {
    test('baris mentah Record<string, any> bisa masuk apa adanya', () => {
        // `fetchRevenueData` mengembalikan `Record<string, any>` — barisnya tidak
        // pernah divalidasi di lapisan fetch. Kalau tipe di sini diketatkan lagi,
        // tes ini gagal DIKOMPILASI, bukan gagal diam-diam di layar pemanggil.
        type AnyRow = Record<string, any>;
        const rows: AnyRow[] = [
            { id: 'r1', amount: 999_000, subtotal: 900_000, status: 'paid', form_submission_id: 's-1', created_at: '2026-08-18T06:00:00.000Z' },
        ];
        const byId: Map<string, AnyRow> = new Map([['s-1', { id: 's-1', university: 'BINUS' }]]);

        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: rows,
            previousTransactions: [],
            submissionsInRange: [],
            submissionsById: byId,
            now: NOW,
        });

        expect(result.totalRevenue.current).toBe(999_000);
        expect(result.byUniversity[0].name).toBe('BINUS');
        expect(result.ppn).toEqual({ gross: 999_000, subtotal: 900_000, ppn: 99_000 });
    });

    test('kolom yang hilang tidak menabrakkan perakit', () => {
        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: [{ status: 'completed' }, { amount: 250_000, status: 'completed' }],
            submissionsById: new Map(),
            now: NOW,
        });
        expect(result.totalRevenue.current).toBe(250_000);
        expect(result.byUniversity.every((r) => r.name === 'Tidak Diketahui')).toBe(true);
    });
});

describe('channel pembayaran', () => {
    test('enum DOKU diterjemahkan, NULL jadi "Tidak tercatat"', () => {
        expect(paymentChannelLabel('QRIS_DOKU')).toBe('QRIS');
        expect(paymentChannelLabel('VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI')).toBe('VA BSI');
        expect(paymentChannelLabel(null)).toBe(UNRECORDED_CHANNEL);
        expect(paymentChannelLabel('   ')).toBe(UNRECORDED_CHANNEL);
    });

    test('channel yang belum terdaftar dipulangkan apa adanya, bukan dibuang', () => {
        // Lebih baik satu baris berlabel jelek daripada revenue yang hilang diam-diam.
        expect(paymentChannelLabel('GOPAY_NEW')).toBe('GOPAY_NEW');
    });

    test('revenue dikelompokkan per channel, yang NULL tidak menguap', () => {
        const result = buildRevenueAnalytics({
            range: AGU_15_21,
            transactions: [
                tx({ amount: 600_000, payment_channel: 'QRIS_DOKU' }),
                tx({ amount: 400_000, payment_channel: 'QRIS_DOKU' }),
                tx({ amount: 250_000, payment_channel: null }),
            ],
            submissionsById: mapOf(sub()),
            now: NOW,
        });

        const byName = Object.fromEntries(result.byPaymentChannel.map((r) => [r.name, r.value]));
        expect(byName['QRIS']).toBe(1_000_000);
        expect(byName[UNRECORDED_CHANNEL]).toBe(250_000);
        // Jumlah seluruh baris HARUS sama dengan total revenue — kartu tidak boleh
        // berselisih dengan angka hero di atasnya.
        const sum = result.byPaymentChannel.reduce((acc, r) => acc + r.value, 0);
        expect(sum).toBe(result.totalRevenue.current);
    });
});

describe('toShareSeries', () => {
    const point = (overrides: Partial<DailyPoint> = {}): DailyPoint => ({
        dayKey: '2026-08-15',
        label: '15 Agu',
        revenue: 0,
        paidOrders: 0,
        isPartial: false,
        ...overrides,
    });

    test('tiap hari jadi porsi terhadap TOTAL periode, dan jumlahnya 100', () => {
        const out = toShareSeries([
            point({ dayKey: 'a', revenue: 250_000, paidOrders: 1 }),
            point({ dayKey: 'b', revenue: 750_000, paidOrders: 3 }),
        ]);

        expect(out[0].revenueShare).toBeCloseTo(25);
        expect(out[1].revenueShare).toBeCloseTo(75);
        expect(out[0].ordersShare).toBeCloseTo(25);
        expect(out.reduce((s, p) => s + p.revenueShare, 0)).toBeCloseTo(100);
    });

    test('nilai mentah dipertahankan — sumbu boleh persen, tooltip tidak', () => {
        const out = toShareSeries([point({ revenue: 410_700, paidOrders: 2 })]);
        expect(out[0].revenue).toBe(410_700);
        expect(out[0].paidOrders).toBe(2);
    });

    test('rentang tanpa penjualan menghasilkan 0, BUKAN NaN', () => {
        // Akhir pekan panjang / kanal baru itu wajar; NaN akan merambat jadi sumbu kosong.
        const out = toShareSeries([point({ dayKey: 'a' }), point({ dayKey: 'b' })]);
        expect(out.every((p) => p.revenueShare === 0 && p.ordersShare === 0)).toBe(true);
        expect(out.some((p) => Number.isNaN(p.revenueShare))).toBe(false);
    });

    test('satu seri nol tidak merusak seri satunya', () => {
        const out = toShareSeries([point({ dayKey: 'a', revenue: 500_000, paidOrders: 0 })]);
        expect(out[0].revenueShare).toBeCloseTo(100);
        expect(out[0].ordersShare).toBe(0);
    });
});
