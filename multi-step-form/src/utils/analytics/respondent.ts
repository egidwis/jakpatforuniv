/**
 * Lapisan angka tab Responden — murni, tanpa I/O, dan diuji seperti `revenue.ts`.
 *
 * ## Pembagian kerja dengan `sql/67_respondent_analytics.sql`
 *
 * Agregasi berat (count distinct, median, bucket, histogram) hidup di RPC, karena
 * memindahkan 122.929 baris lewat PostgREST butuh 123 round-trip. Yang tersisa di
 * sini adalah pekerjaan yang TIDAK boleh ada di SQL: menghitung delta terhadap
 * periode sebelumnya, membentuk share, memberi label hari berjalan, dan menormalkan
 * teks bebas dari `form_submissions`.
 *
 * ⚠️ Satu aturan yang tidak boleh dilanggar di berkas ini: **jangan pernah
 * menjumlahkan `respondents` harian.** Lihat catatan di `RespondentDailyPoint`.
 */

import type {
    DateRange,
    Delta,
    HourPoint,
    RankedRow,
    RespondentAnalytics,
    RespondentDailyPoint,
} from './types';
import { cleanLabel, computeDelta, wibDayKey, wibDayLabel } from './revenue';

/** Nama fungsi RPC. Satu tempat, supaya salah ketik jadi error kompilasi. */
export const RESPONDENT_RPC = 'get_respondent_analytics';

// ---------------------------------------------------------------------------
// Siklus tayang — "hari" di tab ini BUKAN hari kalender
// ---------------------------------------------------------------------------

/**
 * Iklan tayang 15:00 → 15:00 WIB, jadi satu tanggal kalender memuat DUA gelombang.
 *
 * Terukur 14 Agustus 2026: delapan halaman menerima respons dalam satu tanggal —
 * empat gelombang pagi (mulai 13 Agu 15:00), tiga gelombang sore (mulai 14 Agu
 * 15:00), plus satu extra ad. Padahal yang tayang BERSAMAAN tidak pernah lebih
 * dari lima sepanjang hari itu (4 reguler + 1 extra), jadi kuotanya tidak pernah
 * dilanggar — embernya saja yang salah potong.
 *
 * Dengan ember digeser ke 15:00, rata-rata survei per ember turun dari 5,80 ke
 * 4,67. Sisanya diselesaikan di RPC, yang membuang pasangan (siklus, survei)
 * berisi respons susulan setelah iklannya tutup — lihat jebakan 2d di sql/67.
 * Hasil akhirnya 3,50 survei per siklus, maks 5, sejalan dengan model slot
 * (4 reguler + extra khusus admin).
 *
 * ⚠️ Konsekuensi yang harus selalu disebut di UI: jendela tab ini BERGESER 15 jam
 * dari tab Revenue. "18 Agu" di sini berarti 18 Agu 15:00 – 19 Agu 15:00, jadi
 * angka hariannya tidak bisa diadu langsung dengan angka harian tab Revenue.
 */
export const AIRING_CYCLE_START_HOUR = 15;
const CYCLE_OFFSET_MS = AIRING_CYCLE_START_HOUR * 3_600_000;

/**
 * Rentang kalender yang dipilih user → batas SIKLUS TAYANG.
 *
 * `18–24 Agu` (00:00 → 00:00) jadi `18 Agu 15:00 → 25 Agu 15:00`. Jumlah embernya
 * tetap sama (tujuh), namanya tetap 18–24 Agu, tapi tiap ember kini berisi satu
 * gelombang utuh alih-alih potongan dua gelombang.
 *
 * RPC MENGANDALKAN pergeseran ini: ia mengelompokkan dengan `wib - 15 jam`, jadi
 * mengirim batas tengah malam ke sana akan menghasilkan ember pertama & terakhir
 * yang separuh terisi.
 */
export function toAiringCycleRange(range: DateRange): DateRange {
    return {
        from: new Date(range.from.getTime() + CYCLE_OFFSET_MS),
        to: new Date(range.to.getTime() + CYCLE_OFFSET_MS),
    };
}

/** Siklus tayang yang MEMUAT sebuah instant, sebagai `YYYY-MM-DD`. */
export function airingCycleKey(instant: Date): string {
    return wibDayKey(new Date(instant.getTime() - CYCLE_OFFSET_MS).toISOString());
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRow = Record<string, any>;

/** Bentuk `jsonb` yang dikembalikan RPC. Divalidasi longgar — lihat `numeric()`. */
export interface RespondentRpcPayload {
    core?: AnyRow | null;
    prev?: AnyRow | null;
    daily?: Array<AnyRow> | null;
    loyalty?: Array<AnyRow> | null;
    loi?: Array<AnyRow> | null;
    hourly?: Array<AnyRow> | null;
    dow?: Array<AnyRow> | null;
    ewallet?: Array<AnyRow> | null;
}

/**
 * `percentile_cont` mengembalikan `numeric`, dan PostgREST mengirim `numeric`
 * sebagai STRING supaya presisinya tidak hilang. Tanpa langkah ini median masuk
 * ke React sebagai `"293"` dan aritmetika delta-nya jadi `NaN`.
 */
const numeric = (v: unknown): number => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
};

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Bagi yang tidak pernah menghasilkan `Infinity`/`NaN` di layar. */
const ratio = (a: number, b: number): number => (b > 0 ? a / b : 0);

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

/**
 * Detik → "4 mnt 51 dtk".
 *
 * Di bawah satu menit hanya detiknya yang ditulis ("47 dtk"): "0 mnt 47 dtk"
 * memaksa pembaca membuang bagian pertama sebelum sampai ke angkanya. Di atas
 * satu jam ditulis "1 j 12 mnt" — detik pada durasi sepanjang itu adalah presisi
 * palsu, dan kolom `loi_seconds` memang menyimpan outlier sampai 57 jam (tab
 * dibiarkan terbuka), yang tidak layak ditulis sampai detik.
 */
export function formatDuration(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
        return '—';
    }
    const total = Math.round(seconds);
    if (total < 60) return `${total} dtk`;
    if (total < 3600) {
        const m = Math.floor(total / 60);
        const s = total % 60;
        return s === 0 ? `${m} mnt` : `${m} mnt ${s} dtk`;
    }
    const h = Math.floor(total / 3600);
    const m = Math.round((total % 3600) / 60);
    return m === 0 ? `${h} j` : `${h} j ${m} mnt`;
}

// ---------------------------------------------------------------------------
// Baris peringkat
// ---------------------------------------------------------------------------

/**
 * Deret bucket → `RankedRow`, dengan share terhadap TOTAL deret.
 *
 * `orders` diisi nilai yang sama, bukan nol: `RankedRow` lahir untuk tab Revenue
 * di mana `value` adalah rupiah dan `orders` cacahnya. Di sini keduanya memang satu
 * angka, dan kartu-kartunya memakai `showOrders={false}`.
 *
 * Urutan deret DIPERTAHANKAN apa adanya. Bucket durasi dan loyalitas itu ORDINAL —
 * mengurutkannya menurut besar nilai akan mengacak "< 1 mnt … > 10 mnt" jadi urutan
 * yang tidak berarti apa-apa.
 */
export function toRankedRows(items: Array<{ name: string; value: number }>): RankedRow[] {
    const total = items.reduce((acc, item) => acc + item.value, 0);
    return items.map((item) => ({
        name: item.name,
        value: item.value,
        share: ratio(item.value, total),
        orders: item.value,
    }));
}

/** Urut menurun + lipat ekornya jadi "Lainnya". Untuk deret NOMINAL, bukan ordinal. */
export function rankAndFold(items: Array<{ name: string; value: number }>, topN: number): RankedRow[] {
    const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
    if (sorted.length <= topN) return toRankedRows(sorted);
    const head = sorted.slice(0, topN);
    const tail = sorted.slice(topN).reduce((acc, i) => acc + i.value, 0);
    return toRankedRows(tail > 0 ? [...head, { name: 'Lainnya', value: tail }] : head);
}

const EWALLET_LABELS: Record<string, string> = {
    dana: 'DANA',
    gopay: 'GoPay',
    ovo: 'OVO',
    shopeepay: 'ShopeePay',
    linkaja: 'LinkAja',
};

/** Label NULL/kosong. Bukan "Lainnya" — ini lubang pencatatan, bukan sisa peringkat. */
export const UNRECORDED_EWALLET = 'Tidak tercatat';

export function ewalletLabel(raw: string | null | undefined): string {
    const key = (raw ?? '').trim().toLowerCase();
    if (!key || key === '(kosong)') return UNRECORDED_EWALLET;
    return EWALLET_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

// ---------------------------------------------------------------------------
// Permintaan customer (dari `form_submissions`, bukan dari RPC)
// ---------------------------------------------------------------------------

/**
 * Status yang dipakai alur REVIEW, bukan status pendidikan responden.
 *
 * Kolom `form_submissions.status` dipakai ganda: sebagian baris menyimpan status
 * pendidikan target ("Mahasiswa", "Umum"), sebagian lagi menyimpan status review
 * order ("spam", "approved"). Tanpa daftar ini kartunya akan menampilkan "approved"
 * sebagai jenjang pendidikan.
 */
export const REVIEW_STATUSES = new Set([
    'spam', 'approved', 'in_review', 'rejected', 'published', 'drafted',
    'slot_reserved', 'waiting_payment', 'paid', 'scheduled', 'live', 'completed',
    'slot_cancelled',
]);

const JABODETABEK = ['jakarta', 'bogor', 'depok', 'tangerang', 'bekasi', 'jabodetabek', 'jabotabek', 'jadetabek'];

/**
 * Satu potongan `criteria_responden` → label kanonik, atau `null` bila tak berarti.
 *
 * Kolomnya teks bebas yang ditulis customer, jadi tanpa normalisasi "mahasiswa
 * aktif", "Mahasiswa S1", dan "mhs" jadi tiga baris berbeda di kartu peringkat.
 */
export function normalizeCriteria(raw: string): string | null {
    const s = raw.toLowerCase().trim();
    if (s.length < 3) return null;

    const ages = s.match(/(\d{2})/g);
    if (ages && /tahun|usia|umur|age/.test(s)) {
        const parsed = ages.map(Number).filter((a) => a >= 10 && a <= 99);
        if (parsed.length > 0) {
            const min = Math.min(...parsed);
            if (min <= 20) return 'Usia 17-20 tahun';
            if (min <= 25) return 'Usia 21-25 tahun';
            if (min <= 30) return 'Usia 26-30 tahun';
            return 'Usia 31+ tahun';
        }
    }
    if (/mahasiswa|kuliah|mhs/.test(s)) return 'Mahasiswa';
    if (JABODETABEK.some((city) => s.includes(city)) || s.includes('domisili jabo')) return 'Jabodetabek';
    if (/domisili|wilayah|daerah/.test(s)) {
        const cleaned = s.replace(/domisili|wilayah|daerah|di|area/gi, '').trim();
        return cleaned.length > 2 ? `Domisili: ${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}` : null;
    }
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Kriteria yang paling sering diminta, dihitung per SUBMISSION.
 *
 * `seen` mencegah satu submission menyumbang dua kali ke label yang sama — teks
 * "mahasiswa aktif, mahasiswa semester akhir" keduanya jadi "Mahasiswa", dan tanpa
 * penjaga itu satu order akan terhitung dua permintaan.
 */
export function criteriaRows(submissions: AnyRow[], topN = 6): RankedRow[] {
    const counts = new Map<string, number>();
    for (const sub of submissions) {
        const raw = sub?.criteria_responden;
        if (typeof raw !== 'string' || !raw.trim()) continue;
        const seen = new Set<string>();
        for (const part of raw.split(/[,;\n]+/)) {
            const label = normalizeCriteria(part);
            if (!label || seen.has(label)) continue;
            seen.add(label);
            counts.set(label, (counts.get(label) ?? 0) + 1);
        }
    }
    return rankAndFold([...counts].map(([name, value]) => ({ name, value })), topN);
}

/**
 * Status pendidikan yang diminta, dihitung per SUBMISSION.
 *
 * Diperingkat menurut JUMLAH ORDER, bukan revenue seperti versi lama. Kartu ini
 * tinggal di tab Responden dan menjawab "responden seperti apa yang diminta" —
 * pertanyaan cacah. Memeringkatnya dengan uang juga akan memaksa tab ini menarik
 * `transactions`, satu round-trip untuk sumbu yang bukan miliknya.
 */
export function studentStatusRows(submissions: AnyRow[], topN = 6): RankedRow[] {
    const counts = new Map<string, number>();
    for (const sub of submissions) {
        const raw = typeof sub?.status === 'string' ? sub.status.trim() : '';
        const label = raw && !REVIEW_STATUSES.has(raw.toLowerCase()) ? cleanLabel(raw) : 'Tidak Diketahui';
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return rankAndFold([...counts].map(([name, value]) => ({ name, value })), topN);
}

// ---------------------------------------------------------------------------
// Perakitan
// ---------------------------------------------------------------------------

export interface RespondentInput {
    range: DateRange;
    payload: RespondentRpcPayload | null | undefined;
    /** `form_submissions` yang DIBUAT di rentang ini. Kolom: `status`, `criteria_responden`. */
    submissions: AnyRow[];
    /** Disuntik di tes supaya "hari berjalan" tidak bergantung jam mesin CI. */
    now?: Date;
}

const EMPTY_DELTA: Delta = { current: 0, previous: 0, pctChange: null };

export function buildRespondentAnalytics(input: RespondentInput): RespondentAnalytics {
    const { range, payload, submissions, now = new Date() } = input;

    const core = payload?.core ?? {};
    const prev = payload?.prev ?? {};

    const responses = numeric(core.responses);
    const respondents = numeric(core.respondents);
    const loiCovered = numeric(core.loi_covered);
    const surveyDays = numeric(core.survey_days);
    const prevResponses = numeric(prev.responses);
    const prevRespondents = numeric(prev.respondents);
    const prevLoiCovered = numeric(prev.loi_covered);
    const prevSurveyDays = numeric(prev.survey_days);

    /*
     * Median `null` berarti TIDAK ADA satu pun baris berdurasi di rentang ini —
     * keadaan nyata untuk rentang sebelum Juli 2026. Itu bukan "nol detik", jadi
     * lapisan tampilan menuliskannya "—" saat `loiCovered` nol, dan
     * `loiMissingShare` yang menerangkan sebabnya.
     */
    const medianLoi = computeDelta(
        core.median_loi === null || core.median_loi === undefined ? 0 : numeric(core.median_loi),
        prev.median_loi === null || prev.median_loi === undefined ? 0 : numeric(prev.median_loi),
    );

    // Siklus yang sedang BERJALAN, bukan tanggal hari ini: pukul 12:00 WIB tanggal
    // 24, gelombang yang sedang tayang adalah milik 23 Agu (23 Agu 15:00 → 24 Agu
    // 15:00). Memakai tanggal kalender akan menandai ember yang salah sebagai parsial.
    const todayKey = airingCycleKey(now);
    const daily: RespondentDailyPoint[] = (payload?.daily ?? []).map((row) => {
        const dayKey = text(row.day);
        const dayResponses = numeric(row.responses);
        const daySurveys = numeric(row.surveys);
        return {
            dayKey,
            label: dayKey ? wibDayLabel(dayKey) : '',
            responses: dayResponses,
            respondents: numeric(row.respondents),
            surveys: daySurveys,
            perSurvey: ratio(dayResponses, daySurveys),
            isPartial: dayKey === todayKey,
        };
    });

    const hourly: HourPoint[] = (payload?.hourly ?? []).map((row) => {
        const hour = numeric(row.hour);
        return {
            hour,
            label: `${String(hour).padStart(2, '0')}:00`,
            responses: numeric(row.responses),
        };
    });

    // Bucket ORDINAL — urutan dari SQL dipertahankan, jangan diurutkan ulang.
    const loyalty = toRankedRows(
        (payload?.loyalty ?? []).map((row) => ({ name: text(row.label), value: numeric(row.respondents) })),
    );
    const loi = toRankedRows(
        (payload?.loi ?? []).map((row) => ({ name: text(row.label), value: numeric(row.responses) })),
    );
    const dow = toRankedRows(
        (payload?.dow ?? []).map((row) => ({ name: text(row.label), value: numeric(row.responses) })),
    );

    // E-wallet itu NOMINAL, jadi ia yang boleh diurutkan menurun.
    const ewallet = rankAndFold(
        (payload?.ewallet ?? []).map((row) => ({
            name: ewalletLabel(text(row.provider)),
            value: numeric(row.responses),
        })),
        5,
    );

    return {
        range,
        responses: computeDelta(responses, prevResponses),
        respondents: computeDelta(respondents, prevRespondents),
        surveys: numeric(core.surveys),
        surveyDays,
        /*
         * Laju, BUKAN rata-rata dari rata-rata. `sum(responses) / sum(surveyDays)`
         * memberi bobot yang benar; merata-ratakan laju harian secara polos
         * menyamakan hari bersurvei-satu dengan hari bersurvei-delapan dan
         * menghasilkan angka lain (149,5 vs 144,1 pada rentang yang sama).
         */
        responsesPerSurvey: computeDelta(
            ratio(responses, surveyDays),
            ratio(prevResponses, prevSurveyDays),
        ),
        surveysPerRespondent: computeDelta(
            ratio(responses, respondents),
            ratio(prevResponses, prevRespondents),
        ),
        medianLoi,
        speederShare: computeDelta(
            ratio(numeric(core.speeders), loiCovered),
            ratio(numeric(prev.speeders), prevLoiCovered),
        ),
        loiMissing: Math.max(0, responses - loiCovered),
        loiMissingShare: ratio(Math.max(0, responses - loiCovered), responses),
        daily,
        loyalty,
        loi,
        hourly,
        dow,
        ewallet,
        criteria: criteriaRows(submissions),
        studentStatus: studentStatusRows(submissions),
    };
}

/** Dipakai saat payload belum datang — komponen tetap punya bentuk yang sah. */
export function emptyRespondentAnalytics(range: DateRange): RespondentAnalytics {
    return {
        range,
        responses: EMPTY_DELTA,
        respondents: EMPTY_DELTA,
        surveys: 0,
        surveyDays: 0,
        responsesPerSurvey: EMPTY_DELTA,
        surveysPerRespondent: EMPTY_DELTA,
        medianLoi: EMPTY_DELTA,
        speederShare: EMPTY_DELTA,
        loiMissing: 0,
        loiMissingShare: 0,
        daily: [],
        loyalty: [],
        loi: [],
        hourly: [],
        dow: [],
        ewallet: [],
        criteria: [],
        studentStatus: [],
    };
}
