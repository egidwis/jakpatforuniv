/**
 * Kontrak bersama untuk tab Revenue di Analytics.
 *
 * Berkas ini sengaja hanya berisi tipe — ia adalah batas antara lapisan angka
 * (`revenue.ts`, murni & teruji) dan lapisan tampilan (`components/analytics/*`).
 * Keduanya dikerjakan terpisah, jadi apa pun yang melintasi batas ini harus
 * dideklarasikan di sini lebih dulu, bukan disimpulkan dari implementasi.
 */

/** Rentang yang dipilih user. `to` EKSKLUSIF: 00:00 WIB hari SESUDAH tanggal akhir. */
export interface DateRange {
    from: Date;
    to: Date;
}

/**
 * Satu hari di sumbu X.
 *
 * `dayKey` adalah `YYYY-MM-DD` menurut WIB — bukan menurut jam device, dan selalu
 * membawa tahun. Kunci lama (`"15 Agu"`) menumpuk Agustus 2025 ke Agustus 2026.
 */
export interface DailyPoint {
    dayKey: string;
    /** Label sumbu siap pakai, mis. "15 Agu". Boleh berulang antar tahun — jangan dipakai sebagai kunci. */
    label: string;
    revenue: number;
    paidOrders: number;
    /** Hari ini menurut WIB: belum selesai, jadi tidak boleh dibaca sebagai hari penuh. */
    isPartial: boolean;
}

/**
 * `DailyPoint` + porsinya terhadap TOTAL periode, 0–100.
 *
 * Grafik utama menggambar kedua seri di SATU bidang, jadi keduanya harus jadi besaran
 * tanpa satuan lebih dulu. Nilai mentah `revenue`/`paidOrders` SENGAJA dipertahankan —
 * tooltip, label langsung, dan tampilan Tabel membaca dari sana, jadi Rupiah tidak
 * pernah hilang meski sumbunya persen.
 */
export interface IndexedDailyPoint extends DailyPoint {
    /** Porsi revenue hari ini terhadap total periode, 0–100. */
    revenueShare: number;
    /** Porsi order lunas hari ini terhadap total periode, 0–100. */
    ordersShare: number;
}

/** Nilai + pembandingnya di periode sebelumnya yang berdurasi sama. */
export interface Delta {
    current: number;
    previous: number;
    /** null kalau `previous` nol — hindari pembagian nol yang jadi Infinity di layar. */
    pctChange: number | null;
}

/** Pecahan PPN. `gross` = yang ditagihkan; `subtotal` = sebelum pajak. */
export interface PpnBreakdown {
    gross: number;
    subtotal: number;
    ppn: number;
}

/** Satu baris di kartu "Revenue per Universitas" / "Top Spenders". */
export interface RankedRow {
    /** Nama kanonik — sudah lewat `canonicalUniversity()`. */
    name: string;
    value: number;
    /** Porsi terhadap total, 0–1. */
    share: number;
    orders: number;
}

/** Kartu "Baru vs Repeat Customer". */
export interface CustomerSegment {
    segment: 'new' | 'repeat';
    customers: number;
    orders: number;
    revenue: number;
    aov: number;
}

/** Seluruh angka tab Revenue. Satu objek — komponen tidak menghitung apa pun sendiri. */
export interface RevenueAnalytics {
    range: DateRange;
    totalRevenue: Delta;
    paidOrders: Delta;
    aov: Delta;
    payingCustomers: Delta;
    ppn: PpnBreakdown;
    daily: DailyPoint[];
    /**
     * Order masuk vs yang akhirnya lunas, di rentang yang sama.
     *
     * `spamOrders` SUDAH dikeluarkan dari `ordersIn` — ia disebut di sini semata
     * supaya footnote kartunya bisa mengatakan BERAPA yang dikecualikan. Tanpa
     * itu, "spam tidak dihitung" adalah klaim yang tidak bisa diperiksa pembaca.
     * Ia satu-satunya angka yang tersisa dari tab Platform yang dihapus.
     */
    conversion: { ordersIn: number; ordersPaid: number; rate: number; spamOrders: number };
    /**
     * Revenue per channel pembayaran. `payment_channel` NULL diberi label
     * "Tidak tercatat" — pencatatannya baru mulai Juli 2026, jadi rentang panjang
     * WAJIB memunculkan footnote cakupan alih-alih menyamarkan lubangnya.
     */
    byPaymentChannel: RankedRow[];
    byUniversity: RankedRow[];
    byCustomer: RankedRow[];
    byDepartment: RankedRow[];
    byReferral: RankedRow[];
    segments: CustomerSegment[];
}

// ---------------------------------------------------------------------------
// Tab Responden
// ---------------------------------------------------------------------------

/**
 * Satu hari di sumbu X tab Responden.
 *
 * ⚠️ DUA angka, dan hanya SATU yang boleh dijumlahkan.
 *
 * `responses` bisa dijumlahkan — jumlah seluruh hari SAMA DENGAN KPI "Respons".
 * `respondents` TIDAK: orang yang sama datang lagi di hari lain, jadi menjumlahkan
 * kolom itu menghasilkan 16.680 untuk rentang yang responden uniknya 9.337
 * (terukur produksi 2026-08-24 — inflasi 79%). Karena itu tinggi batang SELALU
 * `responses`; `respondents` harian hanya muncul di tooltip, dan angka unik
 * se-periode dihitung sekali di `RespondentAnalytics.respondents`.
 */
export interface RespondentDailyPoint {
    dayKey: string;
    /** Label sumbu siap pakai, mis. "15 Agu". Berulang antar tahun — jangan jadi kunci. */
    label: string;
    responses: number;
    respondents: number;
    /** Survei berbeda yang menerima respons hari itu. Terukur berayun 1–8. */
    surveys: number;
    /**
     * `responses / surveys` — respons yang didapat SATU survei pada hari itu.
     *
     * Inilah angka yang boleh dipakai membandingkan hari dengan hari. `responses`
     * mentah tidak bisa: 10 Agustus mencatat 1.307 respons dengan 5 survei tayang,
     * dan hari bersurvei-dua tidak akan pernah menyamainya sekalipun tiap surveinya
     * berkinerja lebih baik.
     *
     * ⚠️ Ini RATA-RATA, jadi ia tidak bisa dijumlahkan — sama seperti `respondents`.
     * Nol survei menghasilkan nol, bukan `NaN`.
     */
    perSurvey: number;
    isPartial: boolean;
}

/** Satu titik histogram jam WIB. Sumbu SELALU lengkap 0–23, termasuk jam nol. */
export interface HourPoint {
    hour: number;
    /** "14:00". */
    label: string;
    responses: number;
}

/** Seluruh angka tab Responden. Satu objek — komponen tidak menghitung apa pun sendiri. */
export interface RespondentAnalytics {
    range: DateRange;
    /** Baris `page_respondents` di rentang ini — satu baris = satu orang mengerjakan satu survei. */
    responses: Delta;
    /** Orang berbeda, identitas SUDAH dinormalisasi (`upper(btrim(jakpat_id))`). */
    respondents: Delta;
    /** Survei berbeda yang menerima respons di rentang ini. */
    surveys: number;
    /**
     * Pasangan (hari, survei) di rentang ini — penyebut laju per-survei.
     *
     * SENGAJA bukan `surveys`: satu survei yang tayang tujuh hari menyumbang tujuh,
     * bukan satu. Tanpa itu survei berumur panjang tampak jauh lebih produktif
     * daripada survei sehari.
     */
    surveyDays: number;
    /**
     * `responses / surveyDays` — respons yang didapat satu survei dalam satu hari.
     *
     * Angka pembanding antar periode yang sebenarnya, karena ia sudah dibersihkan
     * dari pengaruh "berapa banyak survei yang kebetulan tayang". Rata-rata
     * TERTIMBANG dari `daily[].perSurvey` persis sama dengan angka ini.
     */
    responsesPerSurvey: Delta;
    /** `responses / respondents`. Menjawab "satu orang mengerjakan berapa survei". */
    surveysPerRespondent: Delta;
    /** Median `loi_seconds`, DETIK. `null` bila tak ada satu pun baris yang punya data. */
    medianLoi: Delta;
    /** Porsi respons < 60 detik, 0–1. Dihitung hanya atas baris yang PUNYA durasi. */
    speederShare: Delta;
    /** Respons tanpa `loi_seconds` — pencatatannya baru mulai Juli 2026. */
    loiMissing: number;
    /** Porsi respons tanpa durasi, 0–1. Ambang footnote cakupan: ≥ 0,1. */
    loiMissingShare: number;
    daily: RespondentDailyPoint[];
    /**
     * Bucket loyalitas. SEUMUR HIDUP, bukan sebatas rentang: "berapa survei sudah
     * diikuti orang ini" dalam jendela 7 hari akan membuat hampir semua orang
     * tampak baru. Nilainya jumlah RESPONDEN, bukan jumlah partisipasi.
     */
    loyalty: RankedRow[];
    /** Bucket durasi pengerjaan. Nilainya jumlah RESPONS yang punya durasi. */
    loi: RankedRow[];
    hourly: HourPoint[];
    /** Senin–Minggu. Nilainya jumlah respons. */
    dow: RankedRow[];
    ewallet: RankedRow[];
    /** Kriteria responden yang diminta customer, dari `form_submissions` di rentang ini. */
    criteria: RankedRow[];
    /** Status pendidikan yang diminta customer. */
    studentStatus: RankedRow[];
}


// ---------------------------------------------------------------------------
// Tab Campaign
// ---------------------------------------------------------------------------

/**
 * Satu hari di sumbu X grafik klik.
 *
 * Kalender WIB biasa — TIDAK digeser 15:00 seperti tab Responden. Klik campaign
 * link tidak ada hubungannya dengan jendela tayang iklan; menggesernya hanya akan
 * membuat angkanya tidak bisa diadu dengan tab mana pun.
 */
export interface DailyClickPoint {
    dayKey: string;
    label: string;
    clicks: number;
    isPartial: boolean;
}

/**
 * Angka voucher.
 *
 * ⚠️ `revenue` DATANG DARI `transactions`, bukan `form_submissions.total_cost`.
 * `total_cost` adalah nilai order, bukan uang yang masuk, dan ia tidak melewati
 * koreksi `isPaidTx`/`isInternalTestTx` yang dipakai tab Revenue — memakainya
 * membuat dua tab menyebut angka berbeda untuk hal yang sama. Terukur pada
 * JFUTGRX: `total_cost` lunasnya Rp 3.000, transaksi uji yang tab Revenue
 * memang buang.
 */
export interface VoucherAnalytics {
    /** Peringkat kode resmi menurut revenue. `orders` = order lunas yang memakainya. */
    byRevenue: RankedRow[];
    /** Peringkat kode resmi menurut jumlah order yang memakainya (lunas maupun belum). */
    byOrders: RankedRow[];
    /** Revenue lunas dari order ber-voucher resmi. */
    revenue: Delta;
    /** Porsi `revenue` terhadap SELURUH revenue lunas periode itu, 0–1. */
    revenueShare: Delta;
    /** Order (submission) di rentang ini yang memakai kode resmi. */
    ordersUsing: Delta;
    /** Kode resmi berbeda yang dipakai di rentang ini. */
    codesUsed: number;
    /** Kode di katalog yang masih hidup & publik — penyebut "x dari y". */
    codesRegistered: number;
    /**
     * Ketikan yang tidak cocok dengan katalog mana pun.
     *
     * Kolom `voucher_code` adalah teks bebas: sepanjang masa 46 dari 119 isian
     * (39%) berupa `TIDAK ADA`, `-`, `1933`, bahkan `jakpat_id`. Angka-angka ini
     * SENGAJA dipisahkan dari peringkat — sumbu berisi 31 kode palsu tidak
     * menceritakan apa pun — tapi tetap dilaporkan supaya besarnya derau itu
     * terlihat, bukan disembunyikan.
     */
    unofficialEntries: number;
    unofficialDistinct: number;
}

/** Angka klik campaign link. */
export interface ClickAnalytics {
    /** Klik di rentang ini, dari tabel log. */
    total: Delta;
    daily: DailyClickPoint[];
    bySource: RankedRow[];
    /** `sum(campaign_links.click_count)` — kumulatif seumur hidup, TIDAK ber-rentang. */
    lifetimeTotal: number;
    /** Instan pertama yang klik-nya tercatat per tanggal (sql/68). */
    logSince: Date;
    /** Rentang mulai sebelum pencatatan — sebagian datanya memang tidak pernah ada. */
    isPartiallyCovered: boolean;
    /** Seluruh rentang mendahului pencatatan — grafiknya WAJIB EmptyState, bukan nol. */
    isFullyUncovered: boolean;
}

/** Seluruh angka tab Campaign. Satu objek — komponen tidak menghitung apa pun sendiri. */
export interface CampaignAnalytics {
    range: DateRange;
    voucher: VoucherAnalytics;
    clicks: ClickAnalytics;
}
