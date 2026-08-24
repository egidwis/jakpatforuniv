import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART, INK } from './palette';
import { formatPercent } from './format';

/**
 * Meter busur untuk SATU rasio terhadap batasnya.
 *
 * ## Kenapa meter, dan kenapa cuma satu angka
 *
 * Meter sah hanya ketika ada batas alami yang bermakna (di sini: 100% order yang
 * masuk akhirnya lunas). Ia BUKAN pengganti bar chart untuk membandingkan
 * beberapa kategori — busur bikin panjang jadi sulit dibanding, dan itu persis
 * alasan cincin donat di referensi ditolak.
 *
 * Isian memakai `accent`; jalur kosongnya `contextSoft` — satu langkah lebih
 * terang dari ramp yang sama, supaya "sudah sejauh mana" terbaca di seluruh
 * busur, bukan cuma di ujung isian.
 *
 * Angka persennya ditulis di tengah, jadi nilainya tidak pernah tergantung pada
 * kemampuan mata mengukur sudut.
 */

const CX = 100;
const CY = 104;
const RADIUS = 76;
const STROKE = 13;
/** Mulai dari kiri-bawah, memutar 270° searah jarum jam ke kanan-bawah. */
const START_ANGLE = 135;
const SWEEP = 270;

function polar(angleDeg: number): { x: number; y: number } {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: CX + RADIUS * Math.cos(rad), y: CY + RADIUS * Math.sin(rad) };
}

function arcPath(fromAngle: number, toAngle: number): string {
    const start = polar(fromAngle);
    const end = polar(toAngle);
    const largeArc = Math.abs(toAngle - fromAngle) > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export interface MeterCardProps {
    title: string;
    /** Rasio 0–1. Nilai di luar rentang dijepit, bukan digambar melewati busur. */
    value: number;
    /** Teks di tengah busur. Default: persen dari `value`. */
    valueLabel?: string;
    /** Keterangan singkat di bawah angka tengah, mis. "order jadi bayar". */
    centerCaption: string;
    /** Rincian penyusun rasio — inilah yang membuat angkanya bisa diaudit. */
    footnote?: ReactNode;
    className?: string;
}

export function MeterCard({
    title,
    value,
    valueLabel,
    centerCaption,
    footnote,
    className = '',
}: MeterCardProps) {
    const ratio = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    const label = valueLabel ?? formatPercent(ratio);
    // 0% tetap menggambar setitik isian; tanpa ini busurnya terlihat "belum dimuat".
    const endAngle = START_ANGLE + SWEEP * Math.max(ratio, 0.001);

    return (
        <Card className={className} style={{ borderColor: CHART.grid }}>
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold" style={{ color: INK.primary }}>
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
                <svg
                    viewBox="0 0 200 176"
                    className="mx-auto block h-auto w-full max-w-[248px]"
                    role="img"
                    aria-label={`${title}: ${label} — ${centerCaption}`}
                >
                    <path
                        d={arcPath(START_ANGLE, START_ANGLE + SWEEP)}
                        fill="none"
                        stroke={CHART.contextSoft}
                        strokeWidth={STROKE}
                        strokeLinecap="round"
                    />
                    <path
                        d={arcPath(START_ANGLE, endAngle)}
                        fill="none"
                        stroke={CHART.accent}
                        strokeWidth={STROKE}
                        strokeLinecap="round"
                    />
                    <text
                        x={CX}
                        y={CY + 2}
                        textAnchor="middle"
                        fontSize={34}
                        fontWeight={600}
                        letterSpacing="-0.02em"
                        fill={INK.primary}
                    >
                        {label}
                    </text>
                    <text x={CX} y={CY + 26} textAnchor="middle" fontSize={13} fill={INK.muted}>
                        {centerCaption}
                    </text>
                </svg>

                {footnote && (
                    <p
                        className="mt-1 border-t pt-3 text-center text-[13px] leading-snug"
                        style={{ color: INK.secondary, borderColor: CHART.grid }}
                    >
                        {footnote}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

export default MeterCard;
