/**
 * Formatter angka & tanggal untuk kartu-kartu tab Revenue.
 *
 * ## Kenapa berkas ini ada
 *
 * Sumbu chart butuh bentuk uang yang PENDEK ("Rp 5,3 jt"), sedangkan
 * `utils/currency.ts#formatIDR` sengaja selalu menulis rupiah penuh
 * ("Rp 5.318.010") karena dipakai di invoice dan halaman bayar. Dua kebutuhan
 * berbeda, jadi yang pendek tinggal di sini dan yang penuh TETAP diambil dari
 * `formatIDR` — jangan pernah menulis formatter rupiah penuh yang ketiga.
 *
 * Bentuk singkatnya sengaja Indonesia: `rb` / `jt` / `M` / `T`, desimal koma.
 * Tick lama `${v/1000000}M` menghasilkan "0.85M" — bukan bahasa produk ini, dan
 * praktis tak terbaca untuk nilai di bawah satu juta.
 */

import { toLocalYmd, toWibYmd } from '@/utils/airing-window';
import type { DateRange } from '@/utils/analytics/types';

/**
 * Nama bulan ditulis tangan, bukan lewat `Intl`, karena versi ICU yang berbeda
 * mengembalikan "Agu" atau "Agt" untuk bulan yang sama. Label sumbu tidak boleh
 * berubah bentuk hanya karena browser pembacanya beda.
 */
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'] as const;
const MONTH_LONG = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const;

const MS_PER_DAY = 86_400_000;

function idNumber(value: number, maxFractionDigits: number): string {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: maxFractionDigits }).format(value);
}

/** Urut dari besar ke kecil supaya `find()` yang pertama cocok adalah unit terbesar. */
const COMPACT_UNITS = [
    { limit: 1e12, suffix: 'T' },
    { limit: 1e9, suffix: 'M' },
    { limit: 1e6, suffix: 'jt' },
    { limit: 1e3, suffix: 'rb' },
] as const;

export interface CompactOptions {
    /** Paksa jumlah desimal. Default: 1 desimal di bawah 100, 0 desimal di atasnya. */
    decimals?: number;
    /** Matikan awalan "Rp" bila konteksnya sudah menyebut rupiah. */
    withPrefix?: boolean;
}

/**
 * "Rp 5,3 jt" · "Rp 850 rb" · "Rp 0".
 *
 * Nilai di bawah 1.000 ditulis utuh — "Rp 0,9 rb" tidak dibaca siapa pun sebagai
 * sembilan ratus rupiah.
 */
export function formatIDRCompact(value: number, options: CompactOptions = {}): string {
    const { decimals, withPrefix = true } = options;
    const prefix = withPrefix ? 'Rp ' : '';
    if (!Number.isFinite(value)) return `${prefix}0`;

    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs < 1000) return `${sign}${prefix}${idNumber(abs, 0)}`;

    const unit = COMPACT_UNITS.find((u) => abs >= u.limit) ?? COMPACT_UNITS[COMPACT_UNITS.length - 1];
    const scaled = abs / unit.limit;
    const fractionDigits = decimals ?? (scaled >= 100 ? 0 : 1);
    return `${sign}${prefix}${idNumber(scaled, fractionDigits)} ${unit.suffix}`;
}

/** Tick sumbu Y panel revenue. Dipisah namanya supaya niatnya kelihatan di JSX. */
export function formatIDRAxisTick(value: number): string {
    return formatIDRCompact(value);
}

/**
 * Tick sumbu Y panel order. Jumlah order itu bilangan bulat; tick pecahan
 * ("2,5 order") mengarang satuan yang tidak ada, jadi dibuang jadi string kosong.
 * Sabuk pengaman kedua di JSX: `allowDecimals={false}` pada `<YAxis>`.
 */
export function formatCountAxisTick(value: number): string {
    return Number.isInteger(value) ? idNumber(value, 0) : '';
}

/**
 * "2,6" — desimal koma Indonesia. Untuk rasio yang bukan uang dan bukan persen,
 * mis. "survei per responden". Default satu desimal: dua desimal pada rasio
 * sekecil ini adalah presisi palsu.
 */
export function formatDecimal(value: number, decimals = 1): string {
    if (!Number.isFinite(value)) return '—';
    return idNumber(value, decimals);
}

/** "1.284" — pengelompokan ribuan Indonesia, tanpa satuan. */
export function formatCount(value: number): string {
    return idNumber(Math.round(value), 0);
}

/** `0.462` → "46,2%". Masukan selalu FRAKSI, bukan angka persen. */
export function formatPercent(fraction: number, decimals = 1): string {
    if (!Number.isFinite(fraction)) return '—';
    return `${idNumber(fraction * 100, decimals)}%`;
}

/**
 * `0.342` → "34,2%" tanpa tanda, karena arah naik/turun DIBAWA OLEH PANAH dan
 * label di sebelahnya, bukan oleh warna atau tanda saja. Lihat `StatTile`.
 */
export function formatPercentMagnitude(fraction: number, decimals = 1): string {
    return formatPercent(Math.abs(fraction), decimals);
}

/** "YYYY-MM-DD" → `Date` tengah malam menurut kalender LOKAL (untuk react-datepicker). */
export function ymdToLocalDate(ymd: string): Date {
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** "2026-08-15" → "15 Agu". Dipakai untuk label sumbu X dan baris tabel. */
export function formatDayLabel(ymd: string): string {
    const [, month, day] = ymd.split('-').map(Number);
    return `${day} ${MONTH_SHORT[(month ?? 1) - 1]}`;
}

/** "2026-08-15" → "15 Agustus 2026". Untuk tooltip, yang punya ruang lebih. */
export function formatDayLabelLong(ymd: string): string {
    const [year, month, day] = ymd.split('-').map(Number);
    return `${day} ${MONTH_LONG[(month ?? 1) - 1]} ${year}`;
}

/** `Date` lokal → "Agustus 2026". Untuk header kalender picker. */
export function formatMonthYear(date: Date): string {
    return `${MONTH_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** `Date` → "15 Agu 2026" menurut kalender WIB. */
export function formatWibDate(date: Date): string {
    const ymd = toWibYmd(date);
    const [year] = ymd.split('-');
    return `${formatDayLabel(ymd)} ${year}`;
}

/** ISO string transaksi → "18 Agu" menurut WIB. */
export function formatWibDayShort(iso: string): string {
    return formatDayLabel(toWibYmd(new Date(iso)));
}

/**
 * Instant 00:00 WIB pada tanggal kalender sebuah `Date` lokal.
 *
 * Ditulis lewat offset eksplisit `+07:00`, bukan `setHours`, karena `setHours`
 * memakai zona waktu perangkat pembaca — dashboard yang dibuka dari luar WIB
 * akan memotong hari di tempat yang salah dan angkanya beda dari query produksi.
 */
export function wibDayStart(day: Date): Date {
    return new Date(`${toLocalYmd(day)}T00:00:00.000+07:00`);
}

/**
 * Tanggal kalender yang dipilih user → `DateRange` yang dipakai untuk fetch.
 *
 * `to` sengaja EKSKLUSIF (00:00 WIB hari SESUDAH tanggal akhir), sesuai kontrak
 * di `types.ts`. Satu nilai ini yang dipakai untuk fetch DAN untuk menggambar
 * sumbu, jadi tinggi batang tidak pernah lagi berbeda dari angka hero.
 */
export function rangeFromCalendarDays(start: Date, endInclusive: Date): DateRange {
    return {
        from: wibDayStart(start),
        to: wibDayStart(new Date(endInclusive.getTime() + MS_PER_DAY)),
    };
}

/** Kebalikan `rangeFromCalendarDays` — untuk mengisi ulang kalender dari state. */
export function calendarDaysFromRange(range: DateRange): { start: Date; endInclusive: Date } {
    return {
        start: ymdToLocalDate(toWibYmd(range.from)),
        // Mundur satu milidetik dulu: `to` eksklusif, jadi tanggalnya sendiri
        // sudah di luar rentang dan tidak boleh ikut tampil di kalender.
        endInclusive: ymdToLocalDate(toWibYmd(new Date(range.to.getTime() - 1))),
    };
}

/** Jumlah hari dalam rentang (akhir-eksklusif). */
export function rangeLengthInDays(range: DateRange): number {
    return Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / MS_PER_DAY));
}

/**
 * "15 Agu – 21 Agu 2026". Tahun ditulis sekali di ujung bila sama; kalau rentang
 * melompati tahun, keduanya ditulis supaya Agustus 2025 tak terbaca sebagai 2026.
 */
export function formatRangeLabel(range: DateRange): string {
    const { start, endInclusive } = calendarDaysFromRange(range);
    const startYmd = toLocalYmd(start);
    const endYmd = toLocalYmd(endInclusive);
    const startYear = startYmd.slice(0, 4);
    const endYear = endYmd.slice(0, 4);

    if (startYmd === endYmd) return `${formatDayLabel(startYmd)} ${startYear}`;
    if (startYear === endYear) return `${formatDayLabel(startYmd)} – ${formatDayLabel(endYmd)} ${endYear}`;
    return `${formatDayLabel(startYmd)} ${startYear} – ${formatDayLabel(endYmd)} ${endYear}`;
}
