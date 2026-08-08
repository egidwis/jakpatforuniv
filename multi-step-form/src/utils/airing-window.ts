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

export const AIRING_HOUR_WIB = 15;
export const BOOKING_CUTOFF_HOUR_WIB = 13;
export const PAYMENT_CUTOFF_HOUR_WIB = 14;

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
function wibInstant(ymd: string, hourWib: number): Date {
    // Lewat epoch, bukan menyusun string jam — supaya jam WIB di bawah 07.00
    // (yang jatuh di tanggal UTC sebelumnya) tetap benar.
    const midnightUtc = new Date(`${ymd}T00:00:00.000Z`).getTime();
    return new Date(midnightUtc + (hourWib - WIB_UTC_OFFSET_HOURS) * 3600000);
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
 * Tanggal mulai tayang: selalu 15.00 WIB = 08:00 UTC.
 *
 * Nilai ini sengaja identik dengan yang disintesis `normalizeScheduleDate`
 * di atas — supaya jalur wizard dan jalur dashboard tidak pernah berbeda
 * pendapat soal kapan iklan mulai.
 */
export function toAiringStartIso(ymd: string): string {
    return wibInstant(ymd, AIRING_HOUR_WIB).toISOString();
}

/** Akhir jendela tayang: `days` × 24 jam setelah start. */
export function toAiringEndIso(ymd: string, days: number): string {
    const start = wibInstant(ymd, AIRING_HOUR_WIB);
    return new Date(start.getTime() + days * 86400000).toISOString();
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

/** YYYY-MM-DD dari sebuah Date menurut kalender WIB. */
export function toWibYmd(date: Date): string {
    return nowWib(date).ymd;
}

/**
 * YYYY-MM-DD dari sebuah Date menurut kalender LOKAL device — dipakai untuk
 * tile kalender di wizard, yang memang dibangun dari `new Date()` lokal.
 */
export function toLocalYmd(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
