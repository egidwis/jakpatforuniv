/**
 * Aritmetika jendela tayang iklan JFU.
 *
 * Aturan operasionalnya dua lapis:
 *   - Iklan tayang serentak pukul 15.00 WIB dan berjalan kelipatan 24 jam.
 *   - Halaman iklan dibangun admin lebih dulu, jendela kerjanya 14.00–15.00.
 *
 * Maka sebuah order hanya bisa tayang hari-H kalau DIPESAN sebelum 13.00 WIB
 * dan LUNAS sebelum 14.00 WIB hari itu juga.
 *
 * Semua perhitungan di sini WAJIB memakai jam WIB, bukan jam device — user di
 * WITA/WIT (atau yang jam sistemnya digeser) harus mendapat keputusan yang
 * sama persis untuk instant yang sama.
 */

import { KILAT_BOOKING_LEAD_MIN, KILAT_PAY_LEAD_MIN, KILAT_SLOT_HOURS } from './constants';

export const AIRING_HOUR_WIB = 15;
export const BOOKING_CUTOFF_HOUR_WIB = 13;
export const PAYMENT_CUTOFF_HOUR_WIB = 14;

/*
  ⚠️ JARAK ANTARA KEDUA CUTOFF DI ATAS ADALAH SEBUAH KONTRAK, BUKAN KEBETULAN.

  14 − 13 = 1 jam = PERSIS `MIN_INVOICE_MINUTES` di `payment.ts`. Itulah yang
  membuat cabang `invoiceLifetimeMinutes(...) === null` MUSTAHIL DICAPAI
  PENELITI: pemesanan sah paling akhir untuk tayang hari-H adalah 12:59:59, dan
  itu selalu menyisakan lebih dari 60 menit ke 14.00. Penolakan itu karena itu
  de facto GERBANG ADMIN — lihat catatannya di `invoiceLifetimeMinutes`.

  Menggeser salah satu angka di atas (atau menaikkan lantai di `payment.ts`)
  akan membuat jalur peneliti diam-diam mulai kena penolakan yang bukan untuk
  mereka. Kaitannya dijaga `invoiceLifetime.spec.ts` → describe "invarian
  cutoff"; ubah angkanya di sini dan tes itu MERAH, bukan diam.
*/

/** WIB = UTC+7, jadi jam X WIB = jam (X-7) UTC pada tanggal yang sama. */
const WIB_UTC_OFFSET_HOURS = 7;

const pad = (n: number) => String(n).padStart(2, '0');

const wibParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

const wibTimeFmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
});
const wibDayFmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const wibShortDayFmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short',
});

/**
 * Tampilan WIB untuk layar dan pesan.
 *
 * Tinggal di sini, bukan di `scheduleModel`, karena `utils/` tidak boleh
 * mengimpor dari `pages/` — dan `waMessage` butuh yang sama persis. Satu
 * deklarasi, supaya papan jadwal dan pesan WhatsApp tidak pernah menyebut
 * instant yang sama dengan tanggal berbeda.
 */
export const formatWibTime = (iso: string) => wibTimeFmt.format(new Date(iso)).replace(':', '.');
export const formatWibDay = (iso: string) => wibDayFmt.format(new Date(iso));
export const formatWibShort = (iso: string) => wibShortDayFmt.format(new Date(iso));

const ymdIdFmt = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
});

/**
 * Tanggal KALENDER `YYYY-MM-DD` → "30 Nov 2026". Dibaca sebagai tanggal, bukan
 * instan (UTC), supaya tidak bergeser sehari di zona device mana pun. Bentuk
 * lain dikembalikan apa adanya. Kembaran berbahasa: `localizeDateVars`
 * (CostBreakdown) — utils tidak boleh mengimpor komponen.
 */
export function formatYmdId(ymd: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    return m ? ymdIdFmt.format(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : ymd;
}

export interface WibNow {
    /** Tanggal menurut kalender WIB, format YYYY-MM-DD */
    ymd: string;
    hour: number;
    minute: number;
}

/**
 * Tanggal & jam sekarang menurut WIB. `en-CA` dipilih karena formatnya sudah
 * YYYY-MM-DD, jadi tidak perlu menyusun ulang dari bagian-bagiannya.
 */
export function nowWib(now: Date = new Date()): WibNow {
    const parts = wibParts.formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    // `hourCycle` h23 bisa memberi "24" untuk tengah malam di sebagian runtime.
    const rawHour = Number(get('hour'));
    return {
        ymd: `${get('year')}-${get('month')}-${get('day')}`,
        hour: rawHour === 24 ? 0 : rawHour,
        minute: Number(get('minute')),
    };
}

/** Instant UTC untuk jam WIB tertentu pada tanggal (YMD) tertentu. */
function wibInstant(ymd: string, hourWib: number, minuteWib: number = 0): Date {
    // Lewat epoch, bukan menyusun string jam — supaya jam WIB di bawah 07.00
    // (yang jatuh di tanggal UTC sebelumnya) tetap benar.
    const midnightUtc = new Date(`${ymd}T00:00:00.000Z`).getTime();
    const totalMinutesWib = hourWib * 60 + minuteWib;
    return new Date(midnightUtc + (totalMinutesWib - WIB_UTC_OFFSET_HOURS * 60) * 60000);
}

/**
 * Angkat string tanggal jadi instant tayang.
 *
 * String date-only ("2026-04-13") diurai JS sebagai tengah malam UTC = 07.00
 * WIB — delapan jam sebelum iklan benar-benar tayang. Fungsi ini mendeteksi
 * bentuk itu dan menetapkannya ke 08:00 UTC (= 15.00 WIB); nilai yang sudah
 * memuat jam dibiarkan apa adanya.
 *
 * ⚠️ **Hanya untuk kolom `DATE` di `form_submissions`.** Sejak Task 9B seluruh
 * dashboard peneliti membaca instant dari `ad_schedules`, yang sudah Kilat-aware
 * (gelombang 08/11/14/17 WIB). Memakai fungsi ini di atas jadwal Kilat akan
 * mengembalikan 15.00 untuk iklan yang sebenarnya didorong pukul 08.00.
 * Sebelumnya bernama sama di `components/ProgressTracker.tsx`, yang dipensiunkan
 * bersama Task 9B.
 */
export function normalizeScheduleDate(dateStr: string | null | undefined): Date {
    if (!dateStr || typeof dateStr !== 'string') return new Date();
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return new Date();
    if (!dateStr.includes('T')) d.setUTCHours(AIRING_HOUR_WIB - WIB_UTC_OFFSET_HOURS, 0, 0, 0);
    return d;
}

/**
 * Tanggal mulai tayang menurut jam WIB (bawaan 15.00 WIB = 08:00 UTC).
 */
export function toAiringStartIso(ymd: string, hourWib: number = AIRING_HOUR_WIB, minuteWib: number = 0): string {
    return wibInstant(ymd, hourWib, minuteWib).toISOString();
}

/** Akhir jendela tayang: `days` × 24 jam setelah start. */
export function toAiringEndIso(ymd: string, days: number, hourWib: number = AIRING_HOUR_WIB, minuteWib: number = 0): string {
    const start = wibInstant(ymd, hourWib, minuteWib);
    return new Date(start.getTime() + days * 86400000).toISOString();
}

/**
 * Hari tayang TERAKHIR — bukan akhir jendela tayang.
 *
 * `toAiringEndIso` mengembalikan batas yang EKSKLUSIF: 15.00 WIB di hari
 * setelah tayang berhenti. Itu benar untuk `end_date` di database, dan
 * `airingDaysOf()` memang menghitungnya begitu. Tapi begitu angka yang sama
 * ditulis ke layar sebagai ujung rentang telanjang — "1 – 8 Sep" untuk pesanan
 * 7 hari — ia terbaca satu hari lebih panjang daripada yang dibayar.
 *
 * Layar memakai helper ini, database tetap memakai `toAiringEndIso`. Keduanya
 * diturunkan dari `ymd` yang sama, jadi tidak bisa berselisih.
 */
export function toAiringLastDayIso(ymd: string, days: number, hourWib: number = AIRING_HOUR_WIB, minuteWib: number = 0): string {
    return toAiringEndIso(ymd, Math.max(days, 1) - 1, hourWib, minuteWib);
}

/** Batas pelunasan agar jadwal `ymd` masih bisa dikejar: 14.00 WIB = 07:00 UTC. */
export function paymentCutoffInstant(ymd: string): Date {
    return wibInstant(ymd, PAYMENT_CUTOFF_HOUR_WIB);
}

/**
 * Tanggal `ymd` sudah tidak bisa dipesan? True kalau tanggalnya sudah lewat,
 * atau hari ini tapi sudah melewati 13.00 WIB. Tanggal di masa depan selalu
 * terbuka.
 */
export function isBookingClosedForDate(ymd: string, now: Date = new Date()): boolean {
    const wib = nowWib(now);
    if (ymd < wib.ymd) return true;
    if (ymd > wib.ymd) return false;
    return wib.hour >= BOOKING_CUTOFF_HOUR_WIB;
}

/**
 * Pembayaran untuk jadwal `ymd` sudah terlambat? True kalau tanggalnya sudah
 * lewat, atau hari ini tapi sudah melewati 14.00 WIB — admin tidak lagi punya
 * waktu membangun halaman iklan sebelum 15.00.
 */
export function isPaymentTooLateForDate(ymd: string, now: Date = new Date()): boolean {
    const wib = nowWib(now);
    if (ymd < wib.ymd) return true;
    if (ymd > wib.ymd) return false;
    return wib.hour >= PAYMENT_CUTOFF_HOUR_WIB;
}

// ─────────────────────────────────────────────────────────────
// JFU Kilat — gelombang push (Phase 5)
//
// Kilat tidak mengikuti jam 15.00/13.00/14.00 di atas: tiap gelombang punya
// batas pesan H-2 jam dan batas bayar H-1 jam sendiri. Batas pesan dicerminkan
// di sql/117 (`kilat_booking_closes_at`) dan ditegakkan trigger untuk peneliti.
// ─────────────────────────────────────────────────────────────

/** Instan gelombang Kilat `hour`.00 WIB pada tanggal `ymd`. */
export function kilatWaveInstant(ymd: string, hour: number): Date {
    return wibInstant(ymd, hour);
}

/** Batas pesan gelombang: H-2 jam (11.00 → 09.00, 15.00 → 13.00 WIB). */
export function kilatBookingClosesAt(ymd: string, hour: number): Date {
    return new Date(kilatWaveInstant(ymd, hour).getTime() - KILAT_BOOKING_LEAD_MIN * 60000);
}

/** Batas bayar gelombang: H-1 jam (11.00 → 10.00, 15.00 → 14.00 WIB). */
export function kilatPayDeadline(ymd: string, hour: number): Date {
    return new Date(kilatWaveInstant(ymd, hour).getTime() - KILAT_PAY_LEAD_MIN * 60000);
}

/**
 * Batas bayar sebuah jadwal — SATU pintu untuk kedua produk (Phase 5 §5.7, R6).
 *
 * Kilat: gelombang − 60 menit. Iklan: 14.00 WIB hari tayang. `kilatHour` diisi
 * pemanggil HANYA untuk baris Kilat (`distribution_type === 'kilat'`) — baris
 * Iklan hasil konversi bisa masih membawa `kilat_slot_hour` lama. Kilat tanpa
 * jam (mustahil dikunci peneliti sejak sql/117) jatuh ke aturan Iklan.
 *
 * Cermin server: `kilatPaymentGate` di `create-payment.js` (paritas diuji).
 */
export function payDeadlineFor(ymd: string, kilatHour?: number | null): Date {
    return kilatHour != null ? kilatPayDeadline(ymd, kilatHour) : paymentCutoffInstant(ymd);
}

/**
 * Batas bayar jadwal ini sudah lewat? Iklan = `isPaymentTooLateForDate`
 * persis (14.00 tepat sudah terlambat). Kilat: tepat di detik batas masih
 * boleh — aturan yang sama dengan batas pesan dan dengan server (`now >`).
 */
export function isPayDeadlinePassed(ymd: string, kilatHour?: number | null, now: Date = new Date()): boolean {
    if (kilatHour == null) return isPaymentTooLateForDate(ymd, now);
    return now.getTime() > kilatPayDeadline(ymd, kilatHour).getTime();
}

/** Senin–Jumat menurut kalender (tanggal YMD tidak punya zona). */
export function isWeekdayYmd(ymd: string): boolean {
    const dow = new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
    return dow !== 0 && dow !== 6;
}

/**
 * Bisakah peneliti memesan gelombang ini sekarang? Aturan yang sama dengan
 * trigger `validate_kilat_wave_claim` (sql/117), minus hari libur — itu datang
 * dari `get_kilat_wave_occupancy`. Tepat di detik batas masih boleh.
 */
export function isKilatWaveBookable(ymd: string, hour: number, now: Date = new Date()): boolean {
    return (KILAT_SLOT_HOURS as readonly number[]).includes(hour)
        && isWeekdayYmd(ymd)
        // sql/122 K3: semua pemanggil fungsi ini jalur PENELITI (wizard, Jadwal &
        // Bayar, Jadwal Baru). Papan admin memakai `nextWibWorkdays` sendiri.
        && ymd <= kilatLastBookableYmd(now)
        && now.getTime() <= kilatBookingClosesAt(ymd, hour).getTime();
}

/**
 * Jendela pesan Kilat PENELITI (keputusan 21 Okt 2026, sql/122 K3): Kilat
 * menjual kecepatan, jadi hanya 3 hari kerja mulai hari ini WIB — hari ini
 * ikut dihitung walau gelombangnya sudah tutup. Admin tetap 2 minggu.
 */
export const KILAT_SELF_SERVE_WORKDAYS = 3;

/**
 * Hari terakhir yang boleh dipesan peneliti. Kembaran SQL:
 * `kilat_last_bookable_date((now() AT TIME ZONE 'Asia/Jakarta')::date)` —
 * diuji paritas di kilatWaveRules.spec.ts; ubah keduanya bersama.
 */
export function kilatLastBookableYmd(now: Date = new Date()): string {
    return nextWibWorkdays(KILAT_SELF_SERVE_WORKDAYS, now)[KILAT_SELF_SERVE_WORKDAYS - 1];
}

/**
 * `count` hari kerja (Senin–Jumat) mulai hari ini menurut kalender WIB —
 * bukan kalender device, yang di zona barat UTC bisa tertinggal sehari
 * (insiden 6 Okt 2026).
 */
export function nextWibWorkdays(count: number, now: Date = new Date()): string[] {
    const days: string[] = [];
    let ymd = toWibYmd(now);
    while (days.length < count) {
        if (isWeekdayYmd(ymd)) days.push(ymd);
        ymd = addDaysToYmd(ymd, 1);
    }
    return days;
}

/** YYYY-MM-DD dari sebuah Date menurut kalender WIB. */
export function toWibYmd(date: Date): string {
    return nowWib(date).ymd;
}

/** Tambah n hari ke sebuah YYYY-MM-DD tanpa melewati zona waktu sama sekali. */
export function addDaysToYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
}

/**
 * Hari WIB sebuah ujung jendela okupansi. Kolom DATE (`form_submissions`)
 * sudah berupa hari kalender dan dipakai apa adanya; TIMESTAMPTZ (jadwal
 * lanjutan) diterjemahkan ke kalender WIB. Jangan pernah lewat `new Date(ymd)`
 * + jam lokal: di perangkat berzona barat UTC hasilnya mundur sehari
 * (insiden 6 Okt 2026).
 */
export function occupancyDayYmd(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toWibYmd(new Date(value));
}

/**
 * YYYY-MM-DD dari sebuah Date menurut kalender LOKAL device — dipakai untuk
 * tile kalender di wizard, yang memang dibangun dari `new Date()` lokal.
 */
export function toLocalYmd(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Di mana sebuah jendela tayang berada relatif jam dinding.
 *
 * Akhir-EKSKLUSIF, mengikuti seluruh repo ini: jendela 25 Agu 15.00 → 26 Agu
 * 15.00 berarti satu hari tayang, dan pada 26 Agu 15.00 tepat ia sudah selesai.
 *
 * Sengaja **tidak** mengenal `status`, pembayaran, atau pembatalan — ia murni
 * aritmetika tanggal. Pemanggil yang punya kolom status wajib memeriksanya
 * lebih dulu dan hanya jatuh ke sini untuk sisanya; lihat `publicationStateOf`
 * di `components/status/airingPeriods.ts`. Itu juga alasan ia tinggal di sini
 * alih-alih di sana: `PageBuilderModal` cuma memegang dua tanggal, bukan baris
 * jadwal, dan memaksanya merakit baris palsu demi memakai aturan yang sama akan
 * melahirkan salinan ketiga.
 */
export function airingWindowState(
    start: Date | null,
    end: Date | null,
    now: Date = new Date(),
): 'scheduled' | 'live' | 'completed' {
    if (end && end < now) return 'completed';
    if (start && start > now) return 'scheduled';
    // Tanpa tanggal mulai, jendela yang belum berakhir dianggap sudah berjalan —
    // itu yang dilakukan `SurveyPage` di gerbang publiknya (start NULL = tidak
    // menahan siapa pun).
    return 'live';
}
