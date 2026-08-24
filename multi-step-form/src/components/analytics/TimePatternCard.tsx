import { useId, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    LabelList,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMediaQuery } from '@/lib/utils';
import type { HourPoint, RankedRow } from '@/utils/analytics/types';
import { CHART, GRADIENT, INK, MOTION } from './palette';
import { TogglePicker } from './TogglePicker';
import { formatCount, formatCountAxisTick, formatDecimal, formatPercent } from './format';

/**
 * Kapan responden mengerjakan survei — per jam WIB atau per hari dalam seminggu.
 *
 * ## Kenapa batang, bukan garis
 *
 * Versi lama menggambar trafik per jam sebagai garis. Garis menyiratkan nilai yang
 * berjalan terus di antara titiknya, padahal "pukul 14" dan "pukul 15" adalah dua
 * ember terpisah — tidak ada nilai di antaranya. Yang lebih menentukan: pertanyaan
 * yang dibawa kartu ini adalah *kapan puncaknya*, dan puncak paling cepat terbaca
 * saat satu batang memakai aksen dan sisanya abu konteks. Garis tidak punya tempat
 * untuk sorotan itu tanpa menambah mark kedua.
 *
 * ## Kenapa dua tab, bukan dua kartu
 *
 * Keduanya menjawab pertanyaan yang sama (*kapan*) dengan dua satuan waktu. Sebagai
 * dua kartu berdampingan masing-masing dapat separuh lebar, dan 24 batang di
 * separuh lebar jadi pita setipis rambut. Yang ditukar nyata: pola jam dan pola
 * hari tidak lagi bisa dilihat bersamaan.
 */

type PatternId = 'hour' | 'dow';

/**
 * Label sumbu tetap disingkat (tujuh "Senin"/"Selasa" tidak muat di 24 tick-lebar
 * yang sama), tapi KALIMAT di kaki kartu memakai nama penuh — "paling sepi Min"
 * terbaca seperti teks yang kepotong, bukan seperti hari.
 */
const DAY_LONG: Record<string, string> = {
    Sen: 'Senin', Sel: 'Selasa', Rab: 'Rabu', Kam: 'Kamis',
    Jum: 'Jumat', Sab: 'Sabtu', Min: 'Minggu',
};
const dayLong = (short: string): string => DAY_LONG[short] ?? short;

/**
 * "2,2× lebih ramai" untuk selisih besar, "49% lebih ramai" untuk selisih kecil.
 *
 * Di atas dua kali lipat, bentuk persen berhenti terbaca: "118% lebih ramai" menuntut
 * pembaca mengubahnya sendiri jadi "dua kali lipat lebih", dan pada rasio ekstrem ia
 * berubah jadi angka yang tampak seperti salah cetak.
 */
function compareRamai(peak: number, trough: number): string {
    const ratio = peak / trough;
    return ratio >= 2
        ? `${formatDecimal(ratio, 1)}\u00d7 lebih ramai`
        : `${formatPercent(ratio - 1, 0)} lebih ramai`;
}

interface PatternPoint {
    key: string;
    label: string;
    value: number;
}

export interface TimePatternCardProps {
    hourly: HourPoint[];
    /** Senin–Minggu, urutan kalender — JANGAN diurutkan menurut nilai. */
    dow: RankedRow[];
    className?: string;
}

export function TimePatternCard({ hourly, dow, className = '' }: TimePatternCardProps) {
    const [active, setActive] = useState<PatternId>('hour');
    const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const isWide = useMediaQuery('(min-width: 640px)');
    // `useId` bisa memuat titik dua, yang tidak sah di `querySelector` maupun `url(#…)`.
    const idBase = `time-pattern-${useId().replace(/:/g, '')}`;
    const gradId = `${idBase}-grad`;

    const hourPoints: PatternPoint[] = useMemo(
        () => hourly.map((h) => ({ key: String(h.hour), label: h.label, value: h.responses })),
        [hourly],
    );
    const dowPoints: PatternPoint[] = useMemo(
        () => dow.map((d) => ({ key: d.name, label: d.name, value: d.value })),
        [dow],
    );

    const points = active === 'hour' ? hourPoints : dowPoints;
    const total = useMemo(() => points.reduce((acc, p) => acc + p.value, 0), [points]);

    const peakIndex = useMemo(() => {
        let best = -1;
        let bestValue = 0;
        points.forEach((p, i) => {
            if (p.value > bestValue) {
                bestValue = p.value;
                best = i;
            }
        });
        return best;
    }, [points]);

    const peak = peakIndex >= 0 ? points[peakIndex] : null;
    const trough = useMemo(() => {
        const nonZero = points.filter((p) => p.value > 0);
        if (nonZero.length < 2) return null;
        return nonZero.reduce((low, p) => (p.value < low.value ? p : low), nonZero[0]);
    }, [points]);

    const renderTooltip = (props: any) => {
        const point: PatternPoint | undefined = props?.payload?.[0]?.payload;
        if (!props?.active || !point) return null;
        return (
            <div className="rounded-md border bg-white px-3 py-2 shadow-md" style={{ borderColor: CHART.grid }}>
                <p className="text-[12px] font-semibold" style={{ color: INK.primary }}>
                    {active === 'hour' ? `Pukul ${point.label} WIB` : point.label}
                </p>
                <p className="mt-1 text-[12px] tabular-nums" style={{ color: INK.secondary }}>
                    {formatCount(point.value)} respons · {formatPercent(total > 0 ? point.value / total : 0, 1)}
                </p>
            </div>
        );
    };

    /** Label langsung HANYA di batang puncak — bukan angka di tiap batang. */
    const renderPeakLabel = (props: any) => {
        if (props?.index !== peakIndex || peakIndex < 0) return null;
        const { x, y, width } = props;
        if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number') return null;
        return (
            <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK.primary}>
                {formatCount(points[peakIndex]?.value ?? 0)}
            </text>
        );
    };

    return (
        <Card className={className} style={{ borderColor: CHART.grid }}>
            <CardHeader className="pb-3">
                {/* Judul dan tab di dalam SATU anak `CardHeader`: `styles.css` men-declare
                    `.flex-col` lagi SETELAH Tailwind, jadi `flex-row` di elemen yang sama
                    akan kalah dan tata letaknya diam-diam menumpuk vertikal. */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <CardTitle className="text-base font-semibold" style={{ color: INK.primary }}>
                            Pola Waktu
                        </CardTitle>
                        <CardDescription className="mt-1 text-[13px]">
                            {active === 'hour'
                                ? 'Kapan respons masuk, per jam WIB'
                                : 'Kapan respons masuk, per hari tayang (15:00 → 15:00 WIB)'}
                        </CardDescription>
                    </div>
                    <TogglePicker<PatternId>
                        mode="tabs"
                        idBase={idBase}
                        ariaLabel="Pilih satuan waktu"
                        value={active}
                        onChange={setActive}
                        options={[
                            { value: 'hour', label: 'Per Jam' },
                            { value: 'dow', label: 'Per Hari' },
                        ]}
                    />
                </div>
            </CardHeader>

            <CardContent className="pt-0">
                <div
                    id={`${idBase}-panel`}
                    role="tabpanel"
                    aria-labelledby={`${idBase}-tab-${active}`}
                    tabIndex={0}
                    /* `key` memaksa remount tiap ganti tab supaya animasi masuknya
                       terputar ulang; tanpa itu pergantian isinya tanpa isyarat apa pun. */
                    key={reduceMotion ? undefined : active}
                    className={
                        reduceMotion
                            ? 'focus-visible:outline-none'
                            : 'animate-in fade-in slide-in-from-bottom-1 duration-200 focus-visible:outline-none'
                    }
                >
                    {total === 0 ? (
                        <p
                            className="flex h-[200px] items-center justify-center rounded-md border border-dashed text-sm"
                            style={{ borderColor: CHART.grid, color: INK.muted }}
                        >
                            Belum ada respons pada rentang ini.
                        </p>
                    ) : (
                        <>
                            {/* 330, bukan 236: 24 batang di kartu selebar dua pertiga baris terbaca
                                  squat pada tinggi lama, dan kartu ini duduk di baris yang
                                  tingginya ditentukan tetangganya — ruang itu ada, tinggal
                                  dipakai untuk data alih-alih dibiarkan kosong di dalam border. */}
                            <ResponsiveContainer width="100%" height={isWide ? 330 : 208}>
                                <BarChart
                                    data={points}
                                    margin={{ top: 20, right: 8, left: 0, bottom: 4 }}
                                    barCategoryGap={active === 'hour' ? '18%' : '30%'}
                                >
                                    <defs>
                                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={GRADIENT.accentBright} />
                                            <stop offset="45%" stopColor={CHART.accent} />
                                            <stop offset="100%" stopColor={GRADIENT.accentDeep} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="0" />
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={{ stroke: CHART.axis }}
                                        tick={{ fill: INK.muted, fontSize: 10 }}
                                        // 24 label jam tidak muat di 375px; sisipkan tiap 2 jam.
                                        interval={active === 'hour' ? (isWide ? 1 : 3) : 0}
                                        height={24}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: INK.muted, fontSize: 10 }}
                                        width={42}
                                        allowDecimals={false}
                                        tickFormatter={formatCountAxisTick}
                                        className="tabular-nums"
                                    />
                                    <Tooltip
                                        cursor={{ fill: CHART.contextSoft, fillOpacity: 0.55 }}
                                        content={renderTooltip}
                                        wrapperStyle={{ outline: 'none' }}
                                    />
                                    <Bar
                                        dataKey="value"
                                        maxBarSize={active === 'hour' ? 22 : 56}
                                        radius={[3, 3, 0, 0]}
                                        isAnimationActive={!reduceMotion}
                                        animationBegin={MOTION.barBegin}
                                        animationDuration={MOTION.barDuration}
                                        animationEasing={MOTION.easing}
                                    >
                                        {/* Emphasis: HANYA puncak yang memakai aksen. Itu satu-satunya
                                            pertanyaan yang dibawa kartu ini, dan warna menjawabnya
                                            tanpa pembaca perlu membandingkan 24 tinggi satu per satu. */}
                                        {points.map((point, index) => (
                                            <Cell
                                                key={point.key}
                                                fill={index === peakIndex ? `url(#${gradId})` : CHART.context}
                                            />
                                        ))}
                                        <LabelList dataKey="value" content={renderPeakLabel} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>

                            {peak && (
                                <p
                                    className="mt-3 border-t pt-3 text-[12px] leading-snug"
                                    style={{ color: INK.secondary, borderColor: CHART.grid }}
                                >
                                    {active === 'hour' ? (
                                        /*
                                          Per jam SENGAJA tidak dibandingkan dengan jam
                                          paling sepi. Lawannya selalu pukul 03.00, dan
                                          "1.658% lebih ramai daripada pukul 00.00" bukan
                                          temuan — ia cuma cara berbelit mengatakan orang
                                          tidak mengerjakan survei saat tidur. Yang
                                          benar-benar menjawab "seberapa terpusat trafiknya"
                                          adalah porsi jam puncak terhadap seluruh rentang.
                                        */
                                        <>
                                            Puncak{' '}
                                            <strong className="font-semibold" style={{ color: INK.primary }}>
                                                pukul {peak.label} WIB
                                            </strong>{' '}
                                            — {formatCount(peak.value)} respons,{' '}
                                            {formatPercent(peak.value / total, 1)} dari seluruh respons di rentang ini.
                                        </>
                                    ) : (
                                        <>
                                            Paling ramai{' '}
                                            <strong className="font-semibold" style={{ color: INK.primary }}>
                                                {dayLong(peak.label)}
                                            </strong>{' '}
                                            ({formatCount(peak.value)} respons)
                                            {trough && trough.value > 0 && peak.value > trough.value && (
                                                <>
                                                    , paling sepi {dayLong(trough.label)} ({formatCount(trough.value)}) —{' '}
                                                    {compareRamai(peak.value, trough.value)}.
                                                </>
                                            )}
                                        </>
                                    )}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export default TimePatternCard;
