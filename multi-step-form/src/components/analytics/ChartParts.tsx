import { useId } from 'react';
import { CHART, INK, PARTIAL_DAY_OPACITY } from './palette';

/**
 * Potongan SVG yang dipakai bersama oleh grafik harian tab Revenue dan tab Responden.
 *
 * Keduanya menandai "hari berjalan" dengan cara yang sama — batang berarsir 45°
 * plus garis batas — dan keduanya butuh legend yang menampilkan penanda itu apa
 * adanya. Menyalinnya per tab berarti dua definisi tekstur yang bisa menyimpang,
 * dan tekstur di sini BUKAN hiasan: ia satu-satunya isyarat bahwa data hari itu
 * belum lengkap.
 */

/** Pola 45° untuk hari yang belum selesai. */
export function HatchDefs({ id, color = CHART.context }: { id: string; color?: string }) {
    return (
        <defs>
            <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <rect width="6" height="6" fill={color} fillOpacity={0.22} />
                <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="2.5" />
            </pattern>
        </defs>
    );
}

/**
 * Kunci legend. Varian `hatch` membawa `<defs>`-nya SENDIRI di dalam svg-nya:
 * merujuk pattern milik chart lewat `url(#…)` dari svg terpisah tidak dijamin bekerja
 * di semua browser, dan svg 0×0 sebagai wadah defs adalah cara paling umum swatch-nya
 * gagal digambar diam-diam.
 */
export type LegendGlyph = 'dot' | 'rule';

export function LegendKey({
    color,
    label,
    glyph = 'dot',
}: {
    color?: string;
    label: string;
    glyph?: LegendGlyph;
}) {
    const localId = `${useId().replace(/:/g, '')}-legend-hatch`;
    return (
        <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: INK.secondary }}>
            {glyph === 'rule' ? (
                /* Hari berjalan digambar DUA mark: batang berarsir (nilai yang sudah
                   masuk) + garis batas (penanda "ini hari ini"). Kuncinya menampilkan
                   keduanya, supaya tak ada mark tanpa keterangan. */
                <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true" className="shrink-0">
                    <HatchDefs id={localId} color={color ?? CHART.accent} />
                    <rect width="9" height="12" rx="2" fill={`url(#${localId})`} fillOpacity={PARTIAL_DAY_OPACITY} />
                    <rect x="12.5" width="2" height="12" fill={CHART.context} fillOpacity={0.6} />
                </svg>
            ) : (
                <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                />
            )}
            {label}
        </span>
    );
}
