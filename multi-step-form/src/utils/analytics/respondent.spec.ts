import { describe, expect, test } from 'vitest';
import {
    airingCycleKey,
    AIRING_CYCLE_START_HOUR,
    buildRespondentAnalytics,
    criteriaRows,
    emptyRespondentAnalytics,
    ewalletLabel,
    formatDuration,
    normalizeCriteria,
    rankAndFold,
    studentStatusRows,
    toAiringCycleRange,
    toRankedRows,
    UNRECORDED_EWALLET,
    type RespondentRpcPayload,
} from './respondent';
import type { DateRange } from './types';

/**
 * Angka di berkas ini bukan karangan — semuanya disalin dari produksi
 * (project `zewuzezbmrmpttysjvpg`, rentang 26 Jul – 24 Agu 2026, diukur 2026-08-24):
 *
 *   respons 24.722 · responden unik 9.337 · survei 68 · median 293 dtk
 *   speeder 4.132 (16,7%) · jumlah responden unik HARIAN 16.680
 *
 * Pasangan terakhir itu inti seluruh berkas ini: 16.680 ≠ 9.337, dan setiap tes di
 * bawah yang menyentuh `daily` ada untuk menjaga jarak itu tetap terlihat.
 */

const wibMidnight = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00.000Z`) - 7 * 3600_000);
const RANGE: DateRange = { from: wibMidnight('2026-08-18'), to: wibMidnight('2026-08-25') };
/**
 * Jam mesin disuntik supaya "hari berjalan" tidak berubah tiap kali CI jalan.
 *
 * 12:00 WIB tanggal 24 sengaja dipilih SEBELUM pukul 15:00: gelombang yang sedang
 * tayang saat itu milik tanggal 23 (23 Agu 15:00 → 24 Agu 15:00), bukan 24. Memakai
 * jam sesudah 15:00 akan membuat tes ini lolos meski kodenya masih memotong per
 * tengah malam.
 */
const NOW = new Date(Date.parse('2026-08-24T05:00:00.000Z')); // 12:00 WIB 24 Agu

function payload(overrides: Partial<RespondentRpcPayload> = {}): RespondentRpcPayload {
    return {
        core: { responses: 5342, respondents: 2479, surveys: 21, survey_days: 38, median_loi: 284, speeders: 890, loi_covered: 5342 },
        prev: { responses: 4900, respondents: 2300, surveys: 20, survey_days: 35, median_loi: 300, speeders: 700, loi_covered: 4900 },
        daily: [
            { day: '2026-08-18', responses: 800, respondents: 560, surveys: 6 },
            { day: '2026-08-19', responses: 900, respondents: 610, surveys: 6 },
            { day: '2026-08-20', responses: 700, respondents: 500, surveys: 5 },
            { day: '2026-08-21', responses: 850, respondents: 590, surveys: 6 },
            { day: '2026-08-22', responses: 600, respondents: 430, surveys: 4 },
            { day: '2026-08-23', responses: 1023, respondents: 700, surveys: 8 },
            { day: '2026-08-24', responses: 469, respondents: 309, surveys: 3 },
        ],
        loyalty: [
            { ord: 1, label: '1 survei', respondents: 900 },
            { ord: 2, label: '2-3 survei', respondents: 800 },
            { ord: 3, label: '4-9 survei', respondents: 500 },
            { ord: 4, label: '10-24 survei', respondents: 200 },
            { ord: 5, label: '25+ survei', respondents: 79 },
        ],
        loi: [
            { ord: 1, label: '< 1 mnt', responses: 890 },
            { ord: 2, label: '1-3 mnt', responses: 800 },
            { ord: 3, label: '3-6 mnt', responses: 1500 },
            { ord: 4, label: '6-10 mnt', responses: 1100 },
            { ord: 5, label: '> 10 mnt', responses: 1052 },
        ],
        hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, responses: hour === 14 ? 700 : 200 })),
        dow: [
            { dow: 1, label: 'Sen', responses: 800 },
            { dow: 2, label: 'Sel', responses: 900 },
            { dow: 3, label: 'Rab', responses: 700 },
            { dow: 4, label: 'Kam', responses: 850 },
            { dow: 5, label: 'Jum', responses: 600 },
            { dow: 6, label: 'Sab', responses: 1023 },
            { dow: 7, label: 'Min', responses: 469 },
        ],
        ewallet: [
            { provider: 'dana', responses: 3400 },
            { provider: 'gopay', responses: 1900 },
            { provider: '(kosong)', responses: 42 },
        ],
        ...overrides,
    };
}

const build = (overrides: Partial<RespondentRpcPayload> = {}, submissions: any[] = []) =>
    buildRespondentAnalytics({ range: RANGE, payload: payload(overrides), submissions, now: NOW });

describe('siklus tayang', () => {
    test('rentang kalender digeser ke batas 15:00, panjangnya tidak berubah', () => {
        // 18–24 Agu (00:00 → 00:00) menjadi 18 Agu 15:00 → 25 Agu 15:00.
        const cycle = toAiringCycleRange(RANGE);
        expect(cycle.from.toISOString()).toBe('2026-08-18T08:00:00.000Z'); // 15:00 WIB
        expect(cycle.to.toISOString()).toBe('2026-08-25T08:00:00.000Z');
        expect(cycle.to.getTime() - cycle.from.getTime()).toBe(RANGE.to.getTime() - RANGE.from.getTime());
        expect(AIRING_CYCLE_START_HOUR).toBe(15);
    });

    test('instant tepat di 15:00 WIB memulai gelombang hari itu', () => {
        expect(airingCycleKey(new Date('2026-08-14T08:00:00.000Z'))).toBe('2026-08-14');
        expect(airingCycleKey(new Date('2026-08-14T07:59:59.000Z'))).toBe('2026-08-13');
    });

    test('pagi hari masih milik gelombang kemarin', () => {
        // 14 Agu 09:00 WIB = 02:00 UTC — gelombang yang tayang mulai 13 Agu 15:00.
        expect(airingCycleKey(new Date('2026-08-14T02:00:00.000Z'))).toBe('2026-08-13');
        // 14 Agu 23:00 WIB = 16:00 UTC — sudah gelombang 14 Agu.
        expect(airingCycleKey(new Date('2026-08-14T16:00:00.000Z'))).toBe('2026-08-14');
    });
});

describe('formatDuration', () => {
    test('di bawah satu menit hanya menulis detik', () => {
        // "0 mnt 47 dtk" memaksa pembaca membuang bagian pertama sebelum sampai ke angkanya.
        expect(formatDuration(47)).toBe('47 dtk');
        expect(formatDuration(0)).toBe('0 dtk');
    });

    test('median produksi 291 detik jadi "4 mnt 51 dtk"', () => {
        expect(formatDuration(291)).toBe('4 mnt 51 dtk');
    });

    test('menit bulat tidak menulis "0 dtk"', () => {
        expect(formatDuration(180)).toBe('3 mnt');
    });

    test('di atas satu jam TIDAK menulis detik', () => {
        // `loi_seconds` menyimpan outlier sampai 57 jam (tab dibiarkan terbuka).
        // Menuliskannya sampai detik adalah presisi palsu.
        expect(formatDuration(4320)).toBe('1 j 12 mnt');
        expect(formatDuration(3600)).toBe('1 j');
        expect(formatDuration(204946)).toBe('56 j 56 mnt');
    });

    test('null / NaN / negatif jadi "—", bukan angka karangan', () => {
        expect(formatDuration(null)).toBe('—');
        expect(formatDuration(undefined)).toBe('—');
        expect(formatDuration(Number.NaN)).toBe('—');
        expect(formatDuration(-5)).toBe('—');
    });
});

describe('baris peringkat', () => {
    test('toRankedRows MEMPERTAHANKAN urutan — bucket itu ordinal', () => {
        // Mengurutkan menurut nilai akan mengacak "< 1 mnt … > 10 mnt" jadi urutan
        // yang tidak berarti apa-apa.
        const rows = toRankedRows([
            { name: '< 1 mnt', value: 890 },
            { name: '1-3 mnt', value: 800 },
            { name: '3-6 mnt', value: 1500 },
        ]);
        expect(rows.map((r) => r.name)).toEqual(['< 1 mnt', '1-3 mnt', '3-6 mnt']);
        expect(rows[2].share).toBeCloseTo(1500 / 3190, 6);
    });

    test('total nol menghasilkan share nol, bukan NaN', () => {
        const rows = toRankedRows([{ name: 'a', value: 0 }, { name: 'b', value: 0 }]);
        expect(rows.every((r) => r.share === 0)).toBe(true);
    });

    test('rankAndFold mengurutkan menurun dan melipat ekornya', () => {
        const rows = rankAndFold(
            [
                { name: 'a', value: 10 },
                { name: 'b', value: 50 },
                { name: 'c', value: 3 },
                { name: 'd', value: 2 },
                { name: 'kosong', value: 0 },
            ],
            2,
        );
        expect(rows.map((r) => r.name)).toEqual(['b', 'a', 'Lainnya']);
        expect(rows[2].value).toBe(5);
        // Nilai nol dibuang, bukan dilipat jadi baris "Lainnya" bernilai nol.
        expect(rows.reduce((s, r) => s + r.value, 0)).toBe(65);
    });
});

describe('label e-wallet', () => {
    test('casing merek dikembalikan seperti tulisan resminya', () => {
        expect(ewalletLabel('dana')).toBe('DANA');
        expect(ewalletLabel('gopay')).toBe('GoPay');
    });

    test('kosong bukan "Lainnya" — ia lubang pencatatan, bukan sisa peringkat', () => {
        expect(ewalletLabel('(kosong)')).toBe(UNRECORDED_EWALLET);
        expect(ewalletLabel('')).toBe(UNRECORDED_EWALLET);
        expect(ewalletLabel(null)).toBe(UNRECORDED_EWALLET);
    });

    test('provider tak dikenal tetap tampil, bukan dibuang', () => {
        expect(ewalletLabel('seabank')).toBe('Seabank');
    });
});

describe('permintaan customer', () => {
    test('normalizeCriteria melebur ejaan mahasiswa jadi satu label', () => {
        expect(normalizeCriteria('mahasiswa aktif')).toBe('Mahasiswa');
        expect(normalizeCriteria('Mahasiswa S1')).toBe('Mahasiswa');
        expect(normalizeCriteria('mhs semester akhir')).toBe('Mahasiswa');
    });

    test('rentang usia jatuh ke ember, bukan jadi label per angka', () => {
        expect(normalizeCriteria('usia 18-24 tahun')).toBe('Usia 17-20 tahun');
        expect(normalizeCriteria('umur 22 sampai 28 tahun')).toBe('Usia 21-25 tahun');
    });

    test('potongan terlalu pendek diabaikan', () => {
        expect(normalizeCriteria('ya')).toBeNull();
        expect(normalizeCriteria('  ')).toBeNull();
    });

    test('satu submission tidak menyumbang dua kali ke label yang sama', () => {
        // "mahasiswa aktif, mahasiswa semester akhir" keduanya jadi "Mahasiswa";
        // tanpa penjaga `seen`, satu order akan terhitung dua permintaan.
        const rows = criteriaRows([
            { criteria_responden: 'mahasiswa aktif, mahasiswa semester akhir, mhs' },
        ]);
        const mahasiswa = rows.find((r) => r.name === 'Mahasiswa');
        expect(mahasiswa?.value).toBe(1);
    });

    test('kriteria kosong / bukan string dilewati tanpa menabrak', () => {
        expect(criteriaRows([{ criteria_responden: null }, {}, { criteria_responden: '   ' }])).toEqual([]);
    });

    test('status review TIDAK ditampilkan sebagai jenjang pendidikan', () => {
        // `form_submissions.status` dipakai ganda; tanpa daftar REVIEW_STATUSES
        // kartunya akan menulis "approved" sebagai status mahasiswa.
        const rows = studentStatusRows([
            { status: 'Mahasiswa' },
            { status: 'Mahasiswa' },
            { status: 'approved' },
            { status: 'spam' },
            { status: 'Umum' },
        ]);
        expect(rows.find((r) => r.name === 'approved')).toBeUndefined();
        expect(rows.find((r) => r.name === 'Mahasiswa')?.value).toBe(2);
        expect(rows.find((r) => r.name === 'Tidak Diketahui')?.value).toBe(2);
    });
});

describe('buildRespondentAnalytics', () => {
    test('KPI dasar + delta terhadap periode sebelumnya', () => {
        const a = build();
        expect(a.responses.current).toBe(5342);
        expect(a.responses.previous).toBe(4900);
        expect(a.respondents.current).toBe(2479);
        expect(a.surveys).toBe(21);
    });

    test('JUMLAH BATANG HARIAN = KPI Respons, dan BUKAN KPI Responden unik', () => {
        // Inti tab ini. Tab Revenue menetapkan aturan "jumlah batang = angka hero";
        // di sini aturan itu hanya bisa dipenuhi oleh `responses`.
        const a = build();
        const barSum = a.daily.reduce((s, d) => s + d.responses, 0);
        expect(barSum).toBe(a.responses.current);
        expect(barSum).not.toBe(a.respondents.current);
    });

    test('responden unik harian TIDAK boleh dijumlahkan jadi angka periode', () => {
        // Angka produksi: menjumlahkan kolom unik harian pada rentang 30 hari
        // menghasilkan 16.680 sementara uniknya 9.337 — inflasi 79%. Tes ini
        // mengunci fakta itu supaya tidak ada yang "memperbaiki"-nya jadi sama.
        const a = build();
        const uniqueSum = a.daily.reduce((s, d) => s + d.respondents, 0);
        expect(uniqueSum).toBeGreaterThan(a.respondents.current);
    });

    test('yang ditandai berjalan adalah SIKLUS yang sedang tayang, bukan tanggal hari ini', () => {
        // 12:00 WIB tanggal 24 → gelombang yang sedang tayang mulai 23 Agu 15:00.
        // Kalau hasilnya '2026-08-24', kodenya kembali memotong per tengah malam.
        const a = build();
        expect(a.daily.filter((d) => d.isPartial).map((d) => d.dayKey)).toEqual(['2026-08-23']);
    });

    test('median dari PostgREST yang berupa STRING tetap jadi angka', () => {
        // `percentile_cont` mengembalikan `numeric`, dan PostgREST mengirim numeric
        // sebagai string. Tanpa konversi, aritmetika delta-nya jadi NaN.
        const a = build({
            core: { responses: 10, respondents: 5, surveys: 2, survey_days: 4, median_loi: '291.5', speeders: 1, loi_covered: 10 },
        });
        expect(a.medianLoi.current).toBeCloseTo(291.5, 6);
        expect(Number.isNaN(a.medianLoi.current)).toBe(false);
    });

    test('speeder dihitung atas baris yang PUNYA durasi, bukan atas semua respons', () => {
        const a = build({
            core: { responses: 1000, respondents: 400, surveys: 3, survey_days: 8, median_loi: 200, speeders: 100, loi_covered: 400 },
        });
        expect(a.speederShare.current).toBeCloseTo(100 / 400, 6);
        expect(a.speederShare.current).not.toBeCloseTo(100 / 1000, 6);
    });

    test('cakupan durasi: rentang yang menjangkau sebelum Juli 2026', () => {
        const a = build({
            core: { responses: 122877, respondents: 39616, surveys: 300, survey_days: 900, median_loi: 288, speeders: 10000, loi_covered: 64479 },
        });
        expect(a.loiMissing).toBe(122877 - 64479);
        expect(a.loiMissingShare).toBeCloseTo(0.4753, 3);
        // Ambang footnote 10% — rentang seperti ini WAJIB memunculkannya.
        expect(a.loiMissingShare).toBeGreaterThanOrEqual(0.1);
    });

    test('cakupan penuh tidak memunculkan footnote', () => {
        expect(build().loiMissingShare).toBe(0);
    });

    test('nol respons tidak menghasilkan NaN di mana pun', () => {
        const a = build({
            core: { responses: 0, respondents: 0, surveys: 0, survey_days: 0, median_loi: null, speeders: 0, loi_covered: 0 },
            prev: { responses: 0, respondents: 0, surveys: 0, survey_days: 0, median_loi: null, speeders: 0, loi_covered: 0 },
            daily: [{ day: '2026-08-24', responses: 0, respondents: 0, surveys: 0 }],
        });
        expect(a.surveysPerRespondent.current).toBe(0);
        expect(a.responsesPerSurvey.current).toBe(0);
        expect(a.daily[0].perSurvey).toBe(0);
        expect(a.speederShare.current).toBe(0);
        expect(a.loiMissingShare).toBe(0);
        expect(a.medianLoi.current).toBe(0);
        for (const value of [a.responses.current, a.respondents.current, a.surveysPerRespondent.current]) {
            expect(Number.isNaN(value)).toBe(false);
        }
    });

    test('urutan bucket loyalitas & durasi mengikuti SQL, bukan besar nilai', () => {
        const a = build();
        expect(a.loyalty.map((r) => r.name)).toEqual([
            '1 survei', '2-3 survei', '4-9 survei', '10-24 survei', '25+ survei',
        ]);
        expect(a.loi.map((r) => r.name)).toEqual(['< 1 mnt', '1-3 mnt', '3-6 mnt', '6-10 mnt', '> 10 mnt']);
    });

    test('bucket loyalitas menjumlah ke jumlah RESPONDEN, bukan ke partisipasi', () => {
        // Mencampur "responden aktif periode ini" dengan "total partisipasi mereka"
        // menghasilkan angka yang tidak bisa direkonsiliasi dengan KPI mana pun.
        const a = build();
        expect(a.loyalty.reduce((s, r) => s + r.value, 0)).toBe(a.respondents.current);
    });

    test('e-wallet diurutkan menurun dan yang kosong diberi label tersendiri', () => {
        const a = build();
        expect(a.ewallet[0].name).toBe('DANA');
        expect(a.ewallet.map((r) => r.name)).toContain(UNRECORDED_EWALLET);
    });

    test('sumbu jam selalu lengkap 24 dengan label berimbuhan nol', () => {
        const a = build();
        expect(a.hourly).toHaveLength(24);
        expect(a.hourly[0].label).toBe('00:00');
        expect(a.hourly[14].label).toBe('14:00');
    });

    test('laju per survei memakai HARI-SURVEI, bukan jumlah survei', () => {
        // Satu survei yang tayang tujuh hari adalah tujuh penyebut, bukan satu.
        // Memakai `surveys` (21) alih-alih `survey_days` (38) akan membuat survei
        // berumur panjang tampak jauh lebih produktif daripada survei sehari.
        const a = build();
        expect(a.surveyDays).toBe(38);
        expect(a.responsesPerSurvey.current).toBeCloseTo(5342 / 38, 6);
        expect(a.responsesPerSurvey.current).not.toBeCloseTo(5342 / 21, 6);
        expect(a.responsesPerSurvey.previous).toBeCloseTo(4900 / 35, 6);
    });

    test('KPI laju = rata-rata TERTIMBANG laju harian, bukan rata-rata polos', () => {
        // Rata-rata polos menyamakan bobot hari bersurvei-tiga dengan hari
        // bersurvei-delapan dan menghasilkan angka lain. Invarian yang dijaga:
        // sum(responses) / sum(surveys) == KPI.
        const a = build();
        const sumResponses = a.daily.reduce((s, d) => s + d.responses, 0);
        const sumSurveyDays = a.daily.reduce((s, d) => s + d.surveys, 0);
        expect(sumSurveyDays).toBe(a.surveyDays);
        expect(sumResponses / sumSurveyDays).toBeCloseTo(a.responsesPerSurvey.current, 6);

        const plainMean = a.daily.reduce((s, d) => s + d.perSurvey, 0) / a.daily.length;
        expect(plainMean).not.toBeCloseTo(a.responsesPerSurvey.current, 3);
    });

    test('perSurvey harian membalik peringkat hari — itu justru gunanya', () => {
        // 23 Agu punya respons TERBANYAK (1.023) tapi juga survei terbanyak (8),
        // jadi tiap surveinya justru di bawah 19 Agu. Persis kekeliruan yang
        // membuat batang mentah tidak bisa dipakai sebagai patokan.
        const a = build();
        const byResponses = [...a.daily].sort((x, y) => y.responses - x.responses)[0];
        const byPerSurvey = [...a.daily].sort((x, y) => y.perSurvey - x.perSurvey)[0];
        expect(byResponses.dayKey).toBe('2026-08-23');
        expect(byPerSurvey.dayKey).not.toBe('2026-08-23');
        expect(byResponses.perSurvey).toBeCloseTo(1023 / 8, 6);
    });

    test('hari tanpa survei menghasilkan perSurvey nol, bukan Infinity', () => {
        const a = build({ daily: [{ day: '2026-08-20', responses: 0, respondents: 0, surveys: 0 }] });
        expect(a.daily[0].perSurvey).toBe(0);
        expect(Number.isFinite(a.daily[0].perSurvey)).toBe(true);
    });

    test('payload kosong / null tidak menabrak', () => {
        const a = buildRespondentAnalytics({ range: RANGE, payload: null, submissions: [], now: NOW });
        expect(a.responses.current).toBe(0);
        expect(a.daily).toEqual([]);
        expect(a.loyalty).toEqual([]);
    });

    test('emptyRespondentAnalytics punya bentuk yang sah', () => {
        const a = emptyRespondentAnalytics(RANGE);
        expect(a.range).toBe(RANGE);
        expect(a.hourly).toEqual([]);
        expect(a.surveyDays).toBe(0);
        expect(a.responsesPerSurvey.current).toBe(0);
        expect(a.medianLoi.pctChange).toBeNull();
    });
});
