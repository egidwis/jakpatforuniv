import { useState, type ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { RankedRow } from '@/utils/analytics/types';
import { CHART, INK, emphasisFill } from './palette';
import { formatCount, formatIDRCompact, formatPercent } from './format';

/**
 * Daftar bar horizontal dengan SATU baris tersorot.
 *
 * ## Kenapa emphasis, bukan satu hue per kategori
 *
 * Kode lama memberi warna lewat `COLORS[index % COLORS.length]`, artinya warna
 * mengikuti PERINGKAT, bukan entitas: begitu urutannya berubah, universitas yang
 * sama berganti warna dan pembaca yang sudah hafal "UNJ itu biru" jadi salah
 * baca. Selain itu paletnya cuma punya dua hue kategorikal yang lulus validasi
 * (menambah hue ketiga sudah diuji dan gagal — lihat `palette.ts`), jadi bentuk
 * berbasis warna tidak akan pernah muat untuk daftar sepanjang ini.
 *
 * Bentuk ini menampung berapa pun jumlah kategori tanpa hue tambahan: identitas
 * dibawa nama di kiri, besaran dibawa panjang batang dan label langsung di kanan.
 * Warna hanya menjawab satu pertanyaan — "mana yang sedang jadi pokok bahasan".
 *
 * Karena setiap nilai sudah ditulis sebagai label langsung, tidak ada satu pun
 * angka yang terkunci di balik hover.
 */

/**
 * Props badan daftar — tanpa apa pun yang berkaitan dengan Card.
 *
 * Dipisah supaya daftar yang sama bisa dipakai di dua rangka: `RankedBarList`
 * (satu kartu, satu daftar) dan `RankedTabsCard` (satu kartu, beberapa daftar
 * bertab). Tanpa pemisahan ini, menaruh tiga `RankedBarList` di satu kartu akan
 * menghasilkan kartu bersarang — border di dalam border.
 */
export interface RankedBarRowsProps {
    rows: RankedRow[];
    /** Format nilai di ujung baris. Default: bentuk ringkas 2 desimal ("Rp 82,69 jt"). */
    valueFormatter?: (value: number) => string;
    /** Nama baris yang disorot saat tidak ada hover. Default: baris teratas. */
    emphasizedName?: string | null;
    /**
     * Berapa banyak aksen yang boleh diklaim kartu ini.
     *
     * `'top'` (bawaan) menyorot baris teratas terus-menerus. Itu benar untuk kartu
     * yang berdiri sendiri, tapi di halaman berisi tujuh kartu semuanya mengklaim
     * aksen sekaligus — dan aksen turun makna dari "ini yang penting di layar ini"
     * jadi "ini baris pertama daftar", informasi yang sudah dibawa urutan dan label.
     * `'hover-only'` menyimpan aksen untuk baris yang sedang ditunjuk saja.
     */
    emphasis?: 'top' | 'hover-only' | 'none';
    /** Nama yang tidak pernah boleh disorot — "Lainnya" itu sisa, bukan temuan. */
    contextOnlyNames?: string[];
    /** Tampilkan persentase di samping nilai. */
    showShare?: boolean;
    /** Tampilkan jumlah order sebagai keterangan kecil. */
    showOrders?: boolean;
    /** Potong daftar; sisanya sudah dilipat jadi "Lainnya" oleh lapisan angka. */
    maxRows?: number;
    footnote?: ReactNode;
    emptyMessage?: string;
}

export interface RankedBarListProps extends RankedBarRowsProps {
    title: string;
    /** Baris konteks di bawah judul, mis. total + rentang. */
    subtitle?: ReactNode;
    className?: string;
}

const DEFAULT_CONTEXT_ONLY = ['Lainnya'];

export function RankedBarRows({
    rows,
    valueFormatter,
    emphasizedName,
    emphasis = 'top',
    contextOnlyNames = DEFAULT_CONTEXT_ONLY,
    showShare = true,
    showOrders = false,
    maxRows,
    footnote,
    emptyMessage = 'Belum ada data pada rentang ini.',
}: RankedBarRowsProps) {
    const [hovered, setHovered] = useState<number | null>(null);
    const format = valueFormatter ?? ((value: number) => formatIDRCompact(value, { decimals: 2 }));

    const visible = maxRows ? rows.slice(0, maxRows) : rows;
    // Panjang batang relatif terhadap nilai TERBESAR, bukan terhadap total: pada
    // ekor panjang, bar relatif-total semuanya jadi garis rambut yang tak terbaca.
    // Skala diambil dari baris NYATA saja. "Lainnya" adalah agregat semua sisanya
    // dan hampir selalu terbesar — memasukkannya membuat baris teratas yang asli
    // menciut jadi serpihan (terukur 56px dari 1118px di Top Individual Spenders).
    // Baris konteks dijepit ke 100% supaya tetap terbaca sebagai "sisanya".
    const realRows = visible.filter((row) => !contextOnlyNames.includes(row.name));
    const max = (realRows.length ? realRows : visible).reduce(
        (acc, row) => Math.max(acc, row.value),
        0,
    );

    // `findIndex` mengembalikan -1 kalau `emphasizedName` tidak cocok dengan baris
    // mana pun — tanpa fallback, seluruh kartu jadi abu dan tak ada yang tersorot.
    const firstRealIndex = visible.findIndex((row) => !contextOnlyNames.includes(row.name));
    const namedIndex = emphasizedName
        ? visible.findIndex((row) => row.name === emphasizedName)
        : -1;
    const defaultIndex =
        emphasis === 'top' ? (namedIndex >= 0 ? namedIndex : firstRealIndex) : namedIndex;
    // Hover di baris konteks ("Lainnya") tidak boleh mencabut aksen dari semua baris:
    // kalau barisnya memang bukan kandidat sorotan, sorotannya tetap di tempat semula.
    const hoveredIsReal =
        hovered !== null && !contextOnlyNames.includes(visible[hovered]?.name ?? '');
    const activeIndex = hoveredIsReal ? hovered : emphasis === 'none' ? -1 : defaultIndex;

    return (
        <>
            {visible.length === 0 ? (
                    <p className="py-8 text-center text-sm" style={{ color: INK.muted }}>
                        {emptyMessage}
                    </p>
                ) : (
                    <ul className="space-y-3.5">
                        {visible.map((row, index) => {
                            const isEmphasized = index === activeIndex && !contextOnlyNames.includes(row.name);
                            const widthPct = max > 0 ? Math.min(100, (row.value / max) * 100) : 0;
                            return (
                                <li
                                    key={row.name}
                                    onMouseEnter={() => setHovered(index)}
                                    onMouseLeave={() => setHovered(null)}
                                    className="min-w-0"
                                >
                                    <div
                                        /*
                                          Bentuk arbitrary-property, BUKAN `flex flex-col sm:flex-row`.
                                          `styles.css` (di-import setelah Tailwind di App.tsx) mendeklarasi
                                          ulang `.flex` dan `.flex-col` pada spesifisitas yang sama, jadi
                                          varian `sm:` yang tinggal lebih awal di layer Tailwind TIDAK
                                          PERNAH menang — barisnya tetap menumpuk di desktop.
                                        */
                                        className="[display:flex] [flex-direction:column] gap-0.5 sm:[flex-direction:row] sm:items-baseline sm:justify-between sm:gap-3"
                                    >
                                        {/* di bawah sm: nama satu baris penuh, nilai & share berbagi baris berikutnya */}
                                        <span
                                            // `line-clamp-2`, BUKAN `truncate`: `title` tidak bisa
                                            // dijangkau di layar sentuh, jadi nama panjang akan
                                            // terkunci di balik hover — identitas baris hilang.
                                            className="min-w-0 flex-1 break-words text-[13px] font-medium [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden"
                                            style={{ color: INK.primary }}
                                            title={row.name}
                                        >
                                            {row.name}
                                        </span>
                                        {/*
                                          `tabular-nums` DI SINI saja: angka-angka ini berdiri
                                          dalam satu kolom dan harus lurus ke bawah. Angka hero
                                          tetap proporsional.
                                        */}
                                        {/* Di bawah sm nilai & share BERBAGI satu baris. Sebagai
                                            sibling langsung dari kolom, keduanya mengambil baris
                                            sendiri-sendiri dan tiap baris jadi ~4 baris tinggi. */}
                                        <span className="[display:flex] shrink-0 items-baseline gap-2 sm:[display:contents]">
                                            <span
                                                className="shrink-0 text-[13px] font-semibold tabular-nums"
                                                style={{ color: INK.primary }}
                                            >
                                                {format(row.value)}
                                            </span>
                                            {showShare && (
                                                <span
                                                    className="w-11 shrink-0 text-right text-[13px] tabular-nums"
                                                    style={{ color: INK.muted }}
                                                >
                                                    {formatPercent(row.share, 0)}
                                                </span>
                                            )}
                                        </span>
                                    </div>

                                    <div className="mt-1.5 h-2 w-full">
                                        {/*
                                          Ujung data membulat 4px, pangkalnya siku — batang tumbuh
                                          dari satu baseline dan pangkal yang ikut membulat bikin
                                          nilai kecil terlihat lebih besar dari sebenarnya.
                                        */}
                                        <div
                                            className="h-2 rounded-r-[4px] transition-[width,background-color] duration-200"
                                            style={{
                                                width: `${Math.max(widthPct, row.value > 0 ? 1.5 : 0)}%`,
                                                backgroundColor: emphasisFill(isEmphasized),
                                            }}
                                        />
                                    </div>

                                    {showOrders && (
                                        <p className="mt-1 text-[12px]" style={{ color: INK.muted }}>
                                            {formatCount(row.orders)} order lunas
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}

            {footnote && (
                <p
                    className="mt-5 border-t pt-3 text-[12px] leading-snug"
                    style={{ color: INK.muted, borderColor: CHART.grid }}
                >
                    {footnote}
                </p>
            )}
        </>
    );
}

/** Satu kartu, satu daftar. Rangka tipis di atas `RankedBarRows`. */
export function RankedBarList({ title, subtitle, className = '', ...rows }: RankedBarListProps) {
    return (
        <Card className={className} style={{ borderColor: CHART.grid }}>
            <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold" style={{ color: INK.primary }}>
                    {title}
                </CardTitle>
                {subtitle && <CardDescription className="text-[13px]">{subtitle}</CardDescription>}
            </CardHeader>

            <CardContent className="pt-0">
                <RankedBarRows {...rows} />
            </CardContent>
        </Card>
    );
}

export default RankedBarList;
