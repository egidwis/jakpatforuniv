/**
 * Palet chart Analytics — cerah, berbasis biru primer Jakpat for Universities.
 *
 * ⚠️ SETIAP NILAI DI SINI SUDAH LEWAT VALIDATOR. Jangan ubah tanpa menjalankan ulang:
 *
 *     node scripts/validate_palette.js "#1976D2,#E65100" --mode light --surface "#ffffff"
 *
 * Pasangan `accent` + `accentAlt` lulus keenam cek TANPA satu pun WARN: pita lightness,
 * lantai chroma, separasi CVD (ΔE 26,2 protan · 34,8 tritan), lantai penglihatan normal
 * (35,2), dan kontras ≥ 3:1 terhadap surface putih.
 *
 * ## Mencerahkan justru MENAIKKAN keamanan buta warna
 *
 * Palet sebelumnya sengaja diredam (`#3a6ea5` + `#b5654a`) dan lulus di angka yang jauh
 * lebih tipis: protan ΔE 14,9 · normal 21,6. Menaikkan chroma hampir MELIPATGANDAKAN
 * separasinya. Sebabnya persis yang dulu bikin palet muted susah: chroma adalah kanal
 * yang memisahkan kategori, dan meredam warna menekan kanal itu. Jadi "warna cerah" di
 * sini tidak menukar aksesibilitas dengan estetika — ia membeli keduanya.
 *
 * ## Kenapa TETAP hanya dua hue
 *
 * Mencerahkan TIDAK membuka pintu untuk hue ketiga. Sudah diuji dengan `--pairs all`:
 * set 4-hue cerah (`#1976D2,#E65100,#2E7D32,#6A1B9A`) GAGAL — hijau ↔ oranye jatuh ke
 * ΔE 2,3 di protanopia (praktis warna yang sama), dan ungu keluar dari pita lightness.
 *
 * Maka kategori TIDAK PERNAH dibedakan dengan menambah warna. Yang dipakai adalah
 * **emphasis**: satu entitas memakai `accent`, sisanya `context`, dan identitasnya
 * dibawa oleh label langsung. Bentuk ini menampung berapa pun jumlah kategori.
 */

export const CHART = {
    /** Revenue, dan elemen yang sedang disorot. `jfu.primary`. Kontras 4,6:1. */
    accent: '#1976D2',
    /** Order lunas — seri kedua di grafik utama. Kontras 3,5:1. */
    accentAlt: '#E65100',
    /** Semua yang BUKAN sorotan: batang non-hover, "Lainnya", hari berjalan. */
    context: '#a8a79f',
    /** Isian sangat redup untuk jejak/area di belakang garis. */
    contextSoft: '#e8e7e1',
    /** Hairline grid — SELALU solid. `strokeDasharray` terbaca sebagai ambang/proyeksi. */
    grid: '#e1e0d9',
    /** Baseline & sumbu. */
    axis: '#c3c2b7',
} as const;

/**
 * Ujung gradien. Ketiganya dari ramp brand `jfu` di `tailwind.config.js` — bukan hue
 * karangan baru, jadi grafiknya terbaca sebagai "biru JFU" dan bukan sekadar biru.
 *
 * ⚠️ `accentBright` sendirian berkontras 2,65:1 terhadap putih — DI BAWAH 3:1. Itu sah
 * di sini HANYA karena ia mahkota gradien, bukan warna identitas seri: massa batang ada
 * di `accent`/`accentDeep`, dan reliefnya bertumpuk tiga (label langsung di puncak,
 * legend, tampilan Tabel). Jangan pernah memakai `accentBright` sebagai isian rata.
 */
export const GRADIENT = {
    /** `jfu.light` — mahkota batang revenue. */
    accentBright: '#42A5F5',
    /** `jfu.dark` — dasar batang revenue. */
    accentDeep: '#1565C0',
    /** Puncak isian area order lunas. Strokenya tetap `accentAlt` opacity penuh. */
    accentAltBright: '#FB8C00',
} as const;

/** Warna TEKS. Angka & label tidak pernah memakai warna seri. */
export const INK = {
    primary: '#0b0b0b',
    secondary: '#52514e',
    /** Label sumbu & keterangan. */
    muted: '#898781',
} as const;

/** Khusus teks delta — selalu didampingi panah & label, tidak pernah warna saja. */
export const DELTA = {
    positive: '#006300',
    negative: '#d03b3b',
} as const;

/**
 * Aturan sorot: maksimal SATU elemen memakai `accent` penuh dalam satu waktu.
 * Dipakai oleh setiap chart bar agar "mana yang penting" tak pernah ambigu.
 */
export function emphasisFill(isEmphasized: boolean): string {
    return isEmphasized ? CHART.accent : CHART.context;
}

/**
 * Hari yang belum selesai: lebih redup + berpola garis.
 *
 * ⚠️ Jangan turunkan lagi. Pada 0,45 dengan pola yang dibangun dari `context` abu,
 * batangnya terbaca nyaris putih — revenue hari ini praktis lenyap dari panel, justru
 * membalik maksud penandanya. Polanya kini dibangun dari warna SERI supaya batangnya
 * tetap terbaca sebagai revenue, dan arsirnya yang menyampaikan "belum selesai".
 */
export const PARTIAL_DAY_OPACITY = 0.7;

/**
 * Durasi animasi. Area digambar lebih dulu (konteks), batang mendarat di atasnya —
 * urutan yang membaca sebagai "konteks dulu, angkanya kemudian".
 *
 * Semua ini WAJIB dimatikan saat `prefers-reduced-motion: reduce`.
 */
export const MOTION = {
    areaBegin: 0,
    areaDuration: 700,
    barBegin: 120,
    barDuration: 560,
    easing: 'ease-out',
} as const;
