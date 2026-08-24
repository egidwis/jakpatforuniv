/**
 * Lapisan angka tab Revenue — fungsi murni, tanpa Supabase, tanpa React.
 *
 * Berkas ini lahir dari satu temuan berulang: selama logikanya tinggal di dalam
 * `useMemo` komponen 928 baris, tidak ada satu pun angkanya yang bisa diuji, dan
 * lima bug uang hidup bertahun-tahun tanpa ketahuan. Semua yang di sini menerima
 * data mentah lalu mengembalikan angka — pemanggil yang mengambil datanya.
 *
 * Dua aturan yang tidak boleh dilanggar di seluruh berkas:
 *
 *   1. **Hari selalu menurut WIB, bukan jam device.** Tim internal membuka
 *      dashboard ini dari WIB/WITA/WIT dan kadang dari luar negeri; instant yang
 *      sama wajib jatuh ke hari yang sama untuk semua orang. Konversinya dipinjam
 *      dari `utils/airing-window.ts` — jangan menulis formatter timezone baru.
 *
 *   2. **Breakdown harus selalu berjumlah sama dengan totalnya.** Uang yang tak
 *      bisa ditelusuri submission-nya tetap dihitung (jatuh ke "Tidak Diketahui")
 *      dan dilaporkan lewat `onMissingSubmission`, tidak pernah dibuang diam-diam.
 */

import { toWibYmd } from '../airing-window';
import type {
    CustomerSegment,
    DailyPoint,
    DateRange,
    Delta,
    IndexedDailyPoint,
    PpnBreakdown,
    RankedRow,
    RevenueAnalytics,
} from './types';

// ---------------------------------------------------------------------------
// Bentuk data mentah
// ---------------------------------------------------------------------------

/**
 * Baris `transactions` seadanya.
 *
 * SEMUA kolom opsional, dan itu disengaja. Barisnya datang dari PostgREST sebagai
 * `Record<string, any>` — tipe ketat di sini akan membuat dataset pemanggil gagal
 * di-assign, dan menambal jurang itu dengan `as` justru mengubur kolom yang
 * hilang. Lebih baik ketidakpastiannya jujur di batas, lalu dijinakkan sekali
 * lewat `numeric()`/`norm()` di dalam.
 */
export interface RevenueTransaction {
    id?: string;
    amount?: number;
    /** DPP sebelum PPN. NULL pada 315 dari 394 transaksi lama — lihat `splitPpn`. */
    subtotal?: number | null;
    status?: string;
    entity_type?: 'submission' | 'extend' | null;
    /** Enum channel DOKU. NULL untuk transaksi sebelum Juli 2026 — lihat `paymentChannelLabel`. */
    payment_channel?: string | null;
    form_submission_id?: string | null;
    created_at?: string | null;
}

/** Baris `form_submissions` sebatas kolom yang dipakai tab Revenue. */
export interface RevenueSubmission {
    id?: string;
    auth_user_id?: string | null;
    email?: string | null;
    university?: string | null;
    department?: string | null;
    referral_source?: string | null;
    created_at?: string | null;
    /**
     * Tabel `form_submissions` memakai DUA kolom status yang keduanya masih hidup:
     * `submission_status` yang baru dan `status` yang lama. Baris produksi bisa
     * mengisi salah satu saja, jadi keduanya harus dibaca ber-coalesce — bukan
     * dipilih satu. Dipakai untuk mengeluarkan spam dari penyebut konversi.
     */
    submission_status?: string | null;
    status?: string | null;
}

/**
 * Satu-satunya definisi "lunas" di tab Revenue.
 *
 * Sebelum ini kodenya menyaring `status === 'completed'` saja, membuang 8
 * transaksi berstatus `'paid'` senilai Rp 4.469.810 — uang yang benar-benar
 * masuk, hanya ditulis DOKU dengan kata lain. Akibatnya Analytics dan halaman
 * Customers melaporkan nominal berbeda untuk order yang sama. Konstanta ini
 * sengaja diekspor supaya Finance bisa mengimpornya alih-alih menyalin daftarnya.
 */
export const PAID_TX_STATUSES = ['paid', 'completed'] as const;

/**
 * Status tagihan yang masih bisa ditagih.
 *
 * `expired` dan `cancelled` TIDAK termasuk: uangnya tidak akan datang, jadi
 * menampilkannya sebagai "Belum Tertagih" mengarang piutang.
 */
export const OUTSTANDING_TX_STATUSES = ['pending'] as const;

/** Ambang transaksi uji: order termurah yang sah Rp 200.000, uji selalu Rp 1.000–2.000. */
export const INTERNAL_TEST_AMOUNT_THRESHOLD = 10_000;

const INTERNAL_EMAIL_RE = /@jakpat\.(net|com)$/i;

const PAID_SET = new Set<string>(PAID_TX_STATUSES);
const OUTSTANDING_SET = new Set<string>(OUTSTANDING_TX_STATUSES);

const numeric = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const norm = (v: string | null | undefined): string => (v ?? '').trim().toLowerCase();
/** Epoch ms, `NaN` untuk yang tak terurai — dipakai untuk mengurutkan, bukan menghitung. */

/** Lunas menurut `PAID_TX_STATUSES`, case-insensitive karena status ditulis gateway. */
export function isPaidTx(tx: Pick<RevenueTransaction, 'status'>): boolean {
    return PAID_SET.has(norm(tx.status));
}

/** Tagihan yang masih hidup — bukan sekadar "belum lunas". */
export function isOutstandingTx(tx: Pick<RevenueTransaction, 'status'>): boolean {
    return OUTSTANDING_SET.has(norm(tx.status));
}

/**
 * Transaksi uji internal — bukan pendapatan.
 *
 * Dua penanda, dipakai sebagai ATAU karena masing-masing sendirian bocor:
 * sebagian uji dibuat dari email pribadi (`egidwisetiyono@gmail.com`) sehingga
 * lolos filter email, dan satu transaksi Rp 1.110 milik `product@jakpat.net`
 * berstatus `paid` sehingga lolos kalau hanya email yang dicek.
 */
export function isInternalTestTx(
    tx: Pick<RevenueTransaction, 'amount'>,
    sub?: RevenueSubmission | null,
): boolean {
    if (numeric(tx.amount) < INTERNAL_TEST_AMOUNT_THRESHOLD) return true;
    return INTERNAL_EMAIL_RE.test((sub?.email ?? '').trim());
}

// ---------------------------------------------------------------------------
// Normalisasi nama universitas
// ---------------------------------------------------------------------------

/**
 * Peta alias → nama kanonik.
 *
 * Kuncinya adalah bentuk hasil `normalizeUnivKey()` (huruf kecil, isi kurung
 * dibuang, tanda baca dibuang, spasi dirapatkan). Sengaja pencocokan PERSIS,
 * bukan `includes()`: "Universitas Indonesia" dan "Universitas Islam Negeri
 * Palopo" sama-sama diawali "universitas i", dan pernah ada dorongan menyingkat
 * ini jadi prefix-match — yang akan melipat belasan kampus Islam & Internasional
 * ke dalam UI.
 */
const UNIVERSITY_ALIASES: Record<string, string> = {
    // UNJ — 3 ejaan di produksi
    'unj': 'UNJ',
    'universitas negeri jakarta': 'UNJ',
    'univ negeri jakarta': 'UNJ',

    // UI — 4 ejaan, termasuk yang ditulis huruf kecil semua
    'ui': 'Universitas Indonesia',
    'universitas indonesia': 'Universitas Indonesia',
    'univ indonesia': 'Universitas Indonesia',

    // BINUS — 5 ejaan; "Business School" satu entitas komersial yang sama
    'binus': 'BINUS',
    'binus university': 'BINUS',
    'binus business school': 'BINUS',
    'bina nusantara': 'BINUS',
    'bina nusantara university': 'BINUS',
    'universitas bina nusantara': 'BINUS',

    // UGM
    'ugm': 'UGM',
    'universitas gadjah mada': 'UGM',
    'universitas gajah mada': 'UGM',

    // ITB — SBM adalah sekolah di dalam ITB, bukan kampus terpisah
    'itb': 'ITB',
    'institut teknologi bandung': 'ITB',
    'sbm itb': 'ITB',
    'sekolah bisnis dan manajemen itb': 'ITB',
};

/** Label untuk universitas yang kosong ATAU yang submission-nya tidak tersedia. */
export const UNKNOWN_UNIVERSITY = 'Tidak Diketahui';

const PARENTHETICAL_RE = /\(([^)]*)\)/g;

/** Isian "kosong" yang tetap punya huruf, jadi lolos dari uji huruf/angka di bawah. */
const PLACEHOLDER_KEYS = new Set(['n/a', 'na', 'none', 'null', 'nil', 'tidak ada', 'belum ada', '-']);

/**
 * Apakah teks free-text ini sebetulnya "kosong yang diketik"?
 *
 * SEMUA kolom free-text di tabel ini diisi sendiri oleh peneliti — universitas,
 * jurusan, sumber referensi — jadi semuanya kena penyakit yang sama. Di produksi
 * sebuah "-" di kolom `university` muncul sebagai baris peringkat sungguhan senilai
 * Rp 555.000 (5% revenue seminggu), lengkap dengan batangnya sendiri.
 *
 * ⚠️ Helper ini harus dipakai oleh SETIAP breakdown free-text, bukan cuma universitas.
 * Versi pertama perbaikan ini hanya menambal `canonicalUniversity()`, dan "-" langsung
 * muncul lagi di kartu Jurusan lewat jalur `department` yang cuma `.trim()`.
 *
 * Uji "tidak ada satu pun huruf/angka" menangkap seluruh keluarga tanda baca
 * ("-", "--", ".", "?", "???") tanpa perlu mendaftar satu per satu.
 */
export function isPlaceholderText(raw: string | null | undefined): boolean {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return true;
    const key = normalizeUnivKey(trimmed);
    if (!key) return true;
    if (!/[\p{L}\p{N}]/u.test(key)) return true;
    return PLACEHOLDER_KEYS.has(key);
}

/** Free-text jadi label peringkat: placeholder dilipat ke `fallback`, sisanya di-trim. */
export function cleanLabel(raw: string | null | undefined, fallback = UNKNOWN_UNIVERSITY): string {
    return isPlaceholderText(raw) ? fallback : String(raw).trim();
}

function normalizeUnivKey(raw: string): string {
    return raw
        .toLowerCase()
        .replace(PARENTHETICAL_RE, ' ')
        .replace(/[.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Satukan nama universitas free-text jadi satu entitas.
 *
 * Kolomnya diketik sendiri oleh peneliti, jadi UNJ terpecah tiga dan BINUS lima.
 * Hero kartu Komposisi dulu menunjuk pecahan KETIGA UNJ (Rp 11,3jt) dan menyebutnya
 * kampus teratas, padahal UNJ utuh Rp 80,7jt.
 *
 * Nama yang tak dikenali dikembalikan apa adanya (hanya di-`trim()`) — lebih baik
 * satu baris tambahan di daftar daripada dua kampus berbeda yang tergabung salah.
 */
export function canonicalUniversity(raw: string | null | undefined): string {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return UNKNOWN_UNIVERSITY;

    // Placeholder ("-", ".", "n/a") bukan nama kampus — lihat `isPlaceholderText`.
    if (isPlaceholderText(trimmed)) return UNKNOWN_UNIVERSITY;

    const key = normalizeUnivKey(trimmed);

    const direct = UNIVERSITY_ALIASES[key];
    if (direct) return direct;

    // Bentuk "Nama Panjang (AKRONIM)" yang nama panjangnya belum terdaftar tapi
    // akronimnya sudah — mis. "Univ. Negeri Jakarta (UNJ)".
    for (const match of trimmed.toLowerCase().matchAll(PARENTHETICAL_RE)) {
        const inner = UNIVERSITY_ALIASES[normalizeUnivKey(match[1] ?? '')];
        if (inner) return inner;
    }

    return trimmed;
}

// ---------------------------------------------------------------------------
// Hari WIB
// ---------------------------------------------------------------------------

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** Pagar pengaman loop tanggal — ±10 tahun sudah jauh di atas umur data. */
const MAX_DAILY_BUCKETS = 4000;

const wibDayLabelFmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
});

/**
 * Kunci bucket harian `YYYY-MM-DD` menurut WIB.
 *
 * Kunci lama `"15 Agu"` tidak membawa tahun, jadi empat transaksi Juli–Agustus
 * 2025 ditumpuk ke bucket Agustus 2026 begitu rentangnya melebihi setahun.
 * Mengembalikan string kosong untuk tanggal yang tidak bisa diurai — pemanggil
 * melewatinya, bukan menabraknya ke hari ini.
 */
export function wibDayKey(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return toWibYmd(d);
}

/** Instant UTC untuk 00:00 WIB pada tanggal `ymd`. */
function wibDayStartMs(ymd: string): number {
    return Date.parse(`${ymd}T00:00:00.000Z`) - WIB_OFFSET_MS;
}

function nextYmd(ymd: string): string {
    return new Date(Date.parse(`${ymd}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);
}

/** "15 Agu" — label sumbu saja; jangan dipakai sebagai kunci, ia berulang tiap tahun. */
export function wibDayLabel(ymd: string): string {
    // Tengah hari WIB, supaya pembulatan zona waktu apa pun tetap di tanggal ini.
    return wibDayLabelFmt.format(new Date(wibDayStartMs(ymd) + DAY_MS / 2));
}

/**
 * Satu bucket per hari, MENUTUPI RENTANG YANG DIMINTA PERSIS.
 *
 * Versi lama menurunkan jumlah hari dari preset periode dengan fallback ke 30,
 * jadi "1 Tahun" dan "Semua" cuma menggambar 30 batang sementara KPI di atasnya
 * menghitung setahun penuh — sumbu dan angka hero bicara periode berbeda.
 * Di sini sumbu lahir dari `range` yang sama dengan yang di-fetch, jadi keduanya
 * tidak bisa berselisih.
 *
 * `range.to` EKSKLUSIF (00:00 WIB hari sesudah tanggal akhir), maka rentang
 * 7 hari menghasilkan tepat 7 bucket — tanpa off-by-one di ujung mana pun.
 *
 * Hanya transaksi lunas yang dijumlahkan; penyaringan transaksi uji internal
 * tetap tugas pemanggil (butuh submission, yang tidak dibawa fungsi ini).
 */
export function buildDailySeries(
    txs: RevenueTransaction[],
    range: DateRange,
    now: Date = new Date(),
): DailyPoint[] {
    const revenueByDay = new Map<string, number>();
    const ordersByDay = new Map<string, number>();

    for (const tx of txs) {
        if (!isPaidTx(tx)) continue;
        const key = wibDayKey(tx.created_at);
        if (!key) continue;
        revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + numeric(tx.amount));
        ordersByDay.set(key, (ordersByDay.get(key) ?? 0) + 1);
    }

    // Hari berjalan belum selesai. Diplot sebagai hari penuh, chart SELALU
    // berakhir terjun bebas ke nol — pola yang terbaca sebagai kolaps bisnis
    // padahal cuma jam yang belum lewat.
    const todayKey = toWibYmd(now);
    const endMs = range.to.getTime();

    const out: DailyPoint[] = [];
    let ymd = wibDayKey(range.from.toISOString());
    for (let i = 0; ymd && i < MAX_DAILY_BUCKETS && wibDayStartMs(ymd) < endMs; i += 1) {
        out.push({
            dayKey: ymd,
            label: wibDayLabel(ymd),
            revenue: revenueByDay.get(ymd) ?? 0,
            paidOrders: ordersByDay.get(ymd) ?? 0,
            isPartial: ymd === todayKey,
        });
        ymd = nextYmd(ymd);
    }
    return out;
}

/**
 * Jadikan tiap hari porsi terhadap TOTAL periodenya, 0–100.
 *
 * ## Kenapa basisnya total periode, bukan nilai puncak
 *
 * Grafik utama menggambar revenue (jutaan rupiah) dan jumlah order (0–8) di SATU
 * bidang. Supaya itu sah — dan bukan dual-axis yang menjajarkan dua skala secara
 * arbitrer — keduanya harus jadi besaran tanpa satuan lebih dulu.
 *
 * Basis "persen dari puncak masing-masing" juga menyatukan skalanya, tapi memaksa
 * KEDUA seri menyentuh 100% tepat sekali. Dua kurva yang sama-sama dipaku ke plafon
 * terlihat jauh lebih mirip daripada datanya — versi lebih halus dari korelasi
 * karangan yang justru dihindari.
 *
 * Basis total periode tidak punya artefak itu, dan selisih dua seri jadi PUNYA makna:
 * hari yang porsi revenue-nya melebihi porsi ordernya adalah hari dengan nilai per
 * order di atas rata-rata. Bonusnya, penyebutnya persis angka hero di atas grafik,
 * jadi "100% = Rp 10.112.100" menerjemahkan tinggi mana pun kembali ke rupiah.
 *
 * Total nol menghasilkan share nol — BUKAN `NaN`. Rentang tanpa penjualan itu wajar
 * (akhir pekan panjang, kanal baru), dan `NaN` akan merambat jadi sumbu kosong.
 */
export function toShareSeries(points: DailyPoint[]): IndexedDailyPoint[] {
    let revenueTotal = 0;
    let ordersTotal = 0;
    for (const p of points) {
        revenueTotal += p.revenue;
        ordersTotal += p.paidOrders;
    }
    const share = (value: number, total: number) => (total > 0 ? (value / total) * 100 : 0);
    return points.map((p) => ({
        ...p,
        revenueShare: share(p.revenue, revenueTotal),
        ordersShare: share(p.paidOrders, ordersTotal),
    }));
}

// ---------------------------------------------------------------------------
// Channel pembayaran
// ---------------------------------------------------------------------------

/** Label untuk NULL. Bukan "Lainnya" — ini lubang pencatatan, bukan sisa peringkat. */
export const UNRECORDED_CHANNEL = 'Tidak tercatat';

/**
 * Enum DOKU → label yang layak tampil.
 *
 * Nilai mentahnya (`VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI`) tidak pernah boleh sampai
 * ke layar. Peta ini sengaja TIDAK exhaustive: channel baru yang belum terdaftar
 * dipulangkan apa adanya, bukan dibuang — lebih baik satu baris berlabel jelek
 * daripada revenue yang diam-diam hilang dari kartu.
 */
export const PAYMENT_CHANNEL_LABELS: Record<string, string> = {
    QRIS_DOKU: 'QRIS',
    VIRTUAL_ACCOUNT_BANK_MANDIRI: 'VA Mandiri',
    VIRTUAL_ACCOUNT_BANK_SYARIAH_MANDIRI: 'VA BSI',
    VIRTUAL_ACCOUNT_BRI: 'VA BRI',
    VIRTUAL_ACCOUNT_BNI: 'VA BNI',
    VIRTUAL_ACCOUNT_BCA: 'VA BCA',
    VIRTUAL_ACCOUNT_PERMATA: 'VA Permata',
    CREDIT_CARD: 'Kartu Kredit',
    MANUAL_VERIFIED: 'Transfer Manual',
};

export function paymentChannelLabel(raw: string | null | undefined): string {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return UNRECORDED_CHANNEL;
    return PAYMENT_CHANNEL_LABELS[trimmed.toUpperCase()] ?? trimmed;
}

// ---------------------------------------------------------------------------
// Agregat kecil
// ---------------------------------------------------------------------------

/**
 * Pisahkan PPN dari revenue.
 *
 * Datanya campur: transaksi pra-PPN menyimpan `subtotal` NULL dan `amount`-nya
 * SUDAH net, sedangkan transaksi baru menyimpan `amount` gross + `subtotal` DPP.
 * `coalesce(subtotal, amount)` memperlakukan baris lama sebagai bebas pajak —
 * satu-satunya pembacaan yang benar, dan yang membuat `ppn` tidak pernah negatif.
 */
export function splitPpn(txs: RevenueTransaction[]): PpnBreakdown {
    let gross = 0;
    let subtotal = 0;
    for (const tx of txs) {
        const amount = numeric(tx.amount);
        gross += amount;
        subtotal += typeof tx.subtotal === 'number' && Number.isFinite(tx.subtotal) ? tx.subtotal : amount;
    }
    return { gross, subtotal, ppn: gross - subtotal };
}

/**
 * Nilai sekarang vs periode sebelumnya.
 *
 * `pctChange` dalam PERSEN (34.2 berarti +34,2%), `null` kalau pembandingnya nol
 * — pembagian nol jadi `Infinity`, dan `Infinity%` pernah sampai ke layar.
 */
export function computeDelta(current: number, previous: number): Delta {
    return {
        current,
        previous,
        pctChange: previous === 0 ? null : ((current - previous) / previous) * 100,
    };
}

/**
 * Peringkat revenue per entitas, dengan sisanya dilipat ke satu baris "Lainnya".
 *
 * Melipat sisa (bukan memotongnya) yang menjaga jumlah baris = total revenue —
 * kartu Komposisi tidak boleh berselisih dengan angka hero di sebelahnya.
 */
export function rankBy(
    txs: RevenueTransaction[],
    keyOf: (tx: RevenueTransaction) => string,
    topN?: number,
    otherLabel = 'Lainnya',
): RankedRow[] {
    const bucket = new Map<string, { value: number; orders: number }>();
    let total = 0;

    for (const tx of txs) {
        const name = keyOf(tx) || UNKNOWN_UNIVERSITY;
        const amount = numeric(tx.amount);
        const row = bucket.get(name) ?? { value: 0, orders: 0 };
        row.value += amount;
        row.orders += 1;
        bucket.set(name, row);
        total += amount;
    }

    const sorted = [...bucket.entries()]
        .map(([name, row]) => ({ name, value: row.value, orders: row.orders }))
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

    const head = typeof topN === 'number' && topN > 0 ? sorted.slice(0, topN) : sorted;
    const tail = typeof topN === 'number' && topN > 0 ? sorted.slice(topN) : [];

    const rows = head.map((r) => ({ ...r, share: total === 0 ? 0 : r.value / total }));
    if (tail.length > 0) {
        const value = tail.reduce((s, r) => s + r.value, 0);
        rows.push({
            name: otherLabel,
            value,
            orders: tail.reduce((s, r) => s + r.orders, 0),
            share: total === 0 ? 0 : value / total,
        });
    }
    return rows;
}

/** Kunci pelanggan: akun auth kalau ada, email kalau datanya pra-Phase 1. */
export function customerKeyOf(sub: RevenueSubmission | null | undefined): string {
    if (!sub) return '';
    return sub.auth_user_id || norm(sub.email);
}

/**
 * Baru vs repeat, diklasifikasi PER PELANGGAN (bukan per transaksi).
 *
 * Seorang pelanggan disebut "repeat" bila pembayaran lunas PERTAMA-nya terjadi
 * sebelum rentang ini — jadi dua order di minggu yang sama dari pelanggan baru
 * tetap dihitung satu pelanggan baru, dan tidak ada orang yang muncul di kedua
 * segmen sekaligus. `firstPaidAtByCustomer` harus dihitung dari SELURUH riwayat,
 * bukan dari rentang terpilih; pelanggan yang tidak ada di peta dianggap baru.
 */
export function segmentNewVsRepeat(
    txs: RevenueTransaction[],
    submissionsById: Map<string, RevenueSubmission>,
    firstPaidAtByCustomer: Map<string, number>,
    range: DateRange,
): CustomerSegment[] {
    const agg = new Map<'new' | 'repeat', { customers: Set<string>; orders: number; revenue: number }>([
        ['new', { customers: new Set(), orders: 0, revenue: 0 }],
        ['repeat', { customers: new Set(), orders: 0, revenue: 0 }],
    ]);
    const fromMs = range.from.getTime();

    for (const tx of txs) {
        const sub = tx.form_submission_id ? submissionsById.get(tx.form_submission_id) : undefined;
        const key = customerKeyOf(sub) || `tx:${tx.id}`;
        const firstPaid = firstPaidAtByCustomer.get(key);
        const segment: 'new' | 'repeat' = firstPaid !== undefined && firstPaid < fromMs ? 'repeat' : 'new';
        const slot = agg.get(segment)!;
        slot.customers.add(key);
        slot.orders += 1;
        slot.revenue += numeric(tx.amount);
    }

    return (['new', 'repeat'] as const).map((segment) => {
        const slot = agg.get(segment)!;
        return {
            segment,
            customers: slot.customers.size,
            orders: slot.orders,
            revenue: slot.revenue,
            aov: slot.orders === 0 ? 0 : Math.round(slot.revenue / slot.orders),
        };
    });
}

// ---------------------------------------------------------------------------
// Perakit
// ---------------------------------------------------------------------------

export interface RevenueInput {
    range: DateRange;
    /** Semua transaksi di `range`, SEGALA status. Yang tidak lunas disaring di sini. */
    transactions: RevenueTransaction[];
    /** Transaksi di periode pembanding berdurasi sama, tepat sebelum `range.from`. */
    previousTransactions?: RevenueTransaction[];
    /** Order yang MASUK di `range` — penyebut kartu Konversi. */
    submissionsInRange?: RevenueSubmission[];
    /**
     * Peta submission untuk SETIAP `form_submission_id` yang dirujuk transaksi
     * mana pun di atas — termasuk submission yang dibuat sebelum rentang ini.
     *
     * Ini inti perbaikan V4. Dulu kodenya `submissions.find(...)` di dalam array
     * yang hanya berisi submission dalam window, jadi transaksi milik order lama
     * gagal ditemukan: uangnya tetap masuk KPI tapi lenyap dari setiap breakdown
     * (7 hari Rp 444.000, 30 hari Rp 1.221.000 menguap). Pakai
     * `collectMissingSubmissionIds()` untuk menyusul yang belum terambil.
     */
    submissionsById: Map<string, RevenueSubmission>;
    /** Epoch ms pembayaran lunas pertama tiap pelanggan, dari SELURUH riwayat. */
    firstPaidAtByCustomer?: Map<string, number>;
    now?: Date;
    /** Banyak baris sebelum sisanya dilipat ke "Lainnya". */
    topN?: number;
    /** Dipanggil untuk tiap transaksi yang submission-nya tidak ada di peta. */
    onMissingSubmission?: (tx: RevenueTransaction) => void;
}

/**
 * `form_submission_id` yang dirujuk transaksi tapi belum ada di peta.
 *
 * Pemanggil menyusulnya dengan satu `.in('id', ids)` sebelum memanggil
 * `buildRevenueAnalytics` — jauh lebih murah daripada memperlebar window fetch,
 * dan menutup V4 di sumbernya alih-alih menambal gejalanya.
 */
export function collectMissingSubmissionIds(
    txs: RevenueTransaction[],
    submissionsById: Map<string, RevenueSubmission>,
): string[] {
    const missing = new Set<string>();
    for (const tx of txs) {
        const id = tx.form_submission_id;
        if (id && !submissionsById.has(id)) missing.add(id);
    }
    return [...missing];
}

export function buildRevenueAnalytics(input: RevenueInput): RevenueAnalytics {
    const {
        range,
        transactions,
        previousTransactions = [],
        submissionsInRange = [],
        submissionsById,
        firstPaidAtByCustomer = new Map<string, number>(),
        now = new Date(),
        topN = 5,
        onMissingSubmission,
    } = input;

    // `subOf` dipanggil ulang untuk tiap breakdown, jadi laporannya di-dedupe —
    // yang ingin diketahui pemanggil adalah DAFTAR transaksi yatim, bukan berapa
    // kali kita menanyakannya.
    const reported = new Set<string>();
    const subOf = (tx: RevenueTransaction): RevenueSubmission | undefined => {
        const id = tx.form_submission_id;
        if (!id) return undefined;
        const sub = submissionsById.get(id);
        // Dilaporkan, tidak dibuang: uangnya tetap ikut, hanya kehilangan atributnya.
        if (!sub && !reported.has(tx.id ?? id)) {
            reported.add(tx.id ?? id);
            onMissingSubmission?.(tx);
        }
        return sub;
    };

    const keepReal = (txs: RevenueTransaction[]) =>
        txs.filter((tx) => isPaidTx(tx) && !isInternalTestTx(tx, subOf(tx)));

    const paid = keepReal(transactions);
    const prevPaid = keepReal(previousTransactions);

    const sum = (txs: RevenueTransaction[]) => txs.reduce((s, tx) => s + numeric(tx.amount), 0);
    const totalRevenue = sum(paid);
    const prevRevenue = sum(prevPaid);

    // AOV per ORDER LUNAS, bukan per submission. Penyebut lama memakai submission
    // unik, jadi satu order dengan 3 transaksi (Rp 4,5jt) menaikkan AOV semua orang.
    const aovOf = (total: number, orders: number) => (orders === 0 ? 0 : Math.round(total / orders));

    const customersOf = (txs: RevenueTransaction[]) => {
        const keys = new Set<string>();
        for (const tx of txs) keys.add(customerKeyOf(subOf(tx)) || `tx:${tx.id}`);
        return keys.size;
    };

    const paidSubmissionIds = new Set(
        paid.map((tx) => tx.form_submission_id).filter((id): id is string => !!id),
    );
    // Penyebut konversi MENGECUALIKAN submission spam. Spam bukan penjualan yang
    // hilang — ia derau, dan menghitungnya sebagai kegagalan konversi menutupi
    // performa yang sebenarnya. Di window 7 hari produksi ada 3 spam dari 26
    // submission: memasukkannya memberi 46,2%, mengecualikannya memberi 47,8%.
    // `cancelled` TETAP dihitung — itu memang penjualan yang gagal.
    //
    // Statusnya dibaca lewat coalesce karena tabel ini memakai DUA kolom status
    // yang keduanya masih hidup.
    const isSpam = (s: RevenueSubmission) =>
        norm(s.submission_status ?? s.status ?? '') === 'spam';
    const convertible = submissionsInRange.filter((s) => !isSpam(s));
    // Jumlahnya dibuka, bukan cuma dipakai lalu dibuang: footnote kartu Konversi
    // menyebut "spam tidak dihitung", dan klaim itu harus bisa diperiksa pembaca.
    // Ini juga satu-satunya angka yang diselamatkan dari tab Platform yang dihapus —
    // dua kartu lainnya di sana mengukur hal yang datanya memang tidak ada.
    const spamOrders = submissionsInRange.length - convertible.length;

    const ordersIn = convertible.length;
    const ordersPaid = convertible.filter((s) => !!s.id && paidSubmissionIds.has(s.id)).length;

    // Pembilang datang dari `transactions`, penyebut dari `form_submissions`, jadi
    // keduanya bisa berselisih: di produksi ada satu submission ber-flag spam yang
    // justru punya transaksi lunas. Rasionya dijepit supaya tidak pernah > 100%.
    const conversionRate = ordersIn === 0 ? 0 : Math.min(1, ordersPaid / ordersIn);

    const univOf = (tx: RevenueTransaction) => canonicalUniversity(subOf(tx)?.university);

    return {
        range,
        totalRevenue: computeDelta(totalRevenue, prevRevenue),
        paidOrders: computeDelta(paid.length, prevPaid.length),
        aov: computeDelta(aovOf(totalRevenue, paid.length), aovOf(prevRevenue, prevPaid.length)),
        payingCustomers: computeDelta(customersOf(paid), customersOf(prevPaid)),
        ppn: splitPpn(paid),
        daily: buildDailySeries(paid, range, now),
        conversion: { ordersIn, ordersPaid, rate: conversionRate, spamOrders },
        byPaymentChannel: rankBy(paid, (tx) => paymentChannelLabel(tx.payment_channel), topN),
        byUniversity: rankBy(paid, univOf, topN),
        byCustomer: rankBy(paid, (tx) => {
            const sub = subOf(tx);
            return norm(sub?.email) || customerKeyOf(sub) || UNKNOWN_UNIVERSITY;
        }, topN),
        byDepartment: rankBy(paid, (tx) => cleanLabel(subOf(tx)?.department), topN),
        byReferral: rankBy(paid, (tx) => cleanLabel(subOf(tx)?.referral_source, 'Organik'), topN),
        segments: segmentNewVsRepeat(paid, submissionsById, firstPaidAtByCustomer, range),
    };
}
