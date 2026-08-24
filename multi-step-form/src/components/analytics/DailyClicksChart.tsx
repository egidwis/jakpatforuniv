import { useId, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    LabelList,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { MousePointerClick } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMediaQuery } from '@/lib/utils';
import type { ClickAnalytics, DailyClickPoint } from '@/utils/analytics/types';
import { CHART, GRADIENT, INK, MOTION, PARTIAL_DAY_OPACITY } from './palette';
import { HatchDefs, LegendKey } from './ChartParts';
import { formatCount, formatCountAxisTick, formatDayLabel, formatDayLabelLong, formatWibDate } from './format';

/**
 * Klik campaign link per hari.
 *
 * ## Kenapa SATU seri, dan kenapa itu menyederhanakan banyak hal
 *
 * `DailyRevenueChart` menormalkan kedua serinya jadi porsi karena ia menggambar
 * rupiah dan jumlah order di satu bidang. Di sini cuma ada satu besaran, jadi
 * sumbunya boleh — dan HARUS — memakai satuan aslinya: jumlah klik. Menormalkan
 * seri tunggal jadi persen hanya akan menyembunyikan satu-satunya angka yang
 * dicari orang.
 *
 * Sisanya sengaja dipinjam apa adanya dari kartu revenue supaya kedua tab terbaca
 * sebagai satu bahasa: gradien batang yang sama, arsir hari berjalan yang sama
 * (`HatchDefs`), garis ambang putus-putus yang sama, grid solid horizontal saja,
 * dan legend yang selalu ada.
 *
 * ## ⚠️ Nol di sini bisa berarti dua hal yang sangat berbeda
 *
 * Pencatatan klik per-tanggal baru lahir di `sql/68` (24 Agu 2026). Sebelum itu
 * klik hanya ada sebagai `campaign_links.click_count` — satu angka kumulatif tanpa
 * tanggal — dan 44 klik lama itu TIDAK BISA dibangkitkan ulang. Rentang yang
 * seluruhnya mendahului tanggal itu karena itu tidak menggambar batang nol; ia
 * mengatakan bahwa datanya belum ada, dan menyebut totalnya yang seumur hidup.
 *
 * Menggambar tujuh batang nol untuk minggu di bulan Juli akan terbaca sebagai
 * "tidak ada yang mengklik" — kesimpulan yang salah, dan tidak ada di layar itu
 * yang bisa mengoreksinya.
 */

const CHART_MARGIN = { top: 22, right: 10, left: 0, bottom: 6 };
const Y_AXIS_WIDTH = 40;
const DIMMED_OPACITY = 0.32;

export interface DailyClicksChartProps {
    clicks: ClickAnalytics;
    /** "18 Agu – 24 Agu 2026" — pakai `formatRangeLabel(range)`. */
    rangeLabel: string;
    isRefetching?: boolean;
    className?: string;
}

export function DailyClicksChart({
    clicks,
    rangeLabel,
    isRefetching = false,
    className = '',
}: DailyClicksChartProps) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const isWide = useMediaQuery('(min-width: 640px)');
    const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

    const uid = useId().replace(/:/g, '');
    const gradId = `${uid}-grad-click`;
    const hatchId = `${uid}-hatch-click`;

    const data = clicks.daily;
    const total = useMemo(() => data.reduce((s, p) => s + p.clicks, 0), [data]);
    const partialPoint = data.find((p) => p.isPartial) ?? null;

    const labelByKey = useMemo(() => {
        const map = new Map<string, string>();
        data.forEach((p) => map.set(p.dayKey, p.label || formatDayLabel(p.dayKey)));
        return map;
    }, [data]);

    /** Hanya batang tertinggi yang diberi label langsung. */
    const peakIndex = useMemo(() => {
        let best = -1;
        let bestValue = 0;
        data.forEach((p, i) => {
            if (p.clicks > bestValue) {
                bestValue = p.clicks;
                best = i;
            }
        });
        return best;
    }, [data]);

    const chartHeight = isWide ? 220 : 184;

    const handleMove = (state: any) => {
        const raw = state?.activeTooltipIndex ?? state?.activeIndex;
        const index = typeof raw === 'string' ? Number(raw) : raw;
        setActiveIndex(Number.isInteger(index) ? (index as number) : null);
    };

    const cellOpacity = (point: DailyClickPoint, index: number): number => {
        if (point.isPartial) return PARTIAL_DAY_OPACITY;
        if (activeIndex === null) return 1;
        return index === activeIndex ? 1 : DIMMED_OPACITY;
    };

    const renderTooltip = (props: any) => {
        const point: DailyClickPoint | undefined = props?.payload?.[0]?.payload;
        if (!props?.active || !point) return null;
        return (
            <div className="rounded-md border bg-white px-3 py-2 shadow-md" style={{ borderColor: CHART.grid }}>
                <p className="text-[12px] font-semibold" style={{ color: INK.primary }}>
                    {formatDayLabelLong(point.dayKey)}
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px]" style={{ color: INK.secondary }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART.accent }} aria-hidden="true" />
                    Klik
                    <strong className="ml-auto pl-3 font-semibold tabular-nums" style={{ color: INK.primary }}>
                        {formatCount(point.clicks)}
                    </strong>
                </p>
                {point.isPartial && (
                    <p className="mt-1.5 text-[11px]" style={{ color: INK.muted }}>
                        Hari berjalan — belum selesai
                    </p>
                )}
            </div>
        );
    };

    const renderPeakLabel = (props: any) => {
        if (props?.index !== peakIndex || peakIndex < 0) return null;
        const { x, y, width } = props;
        if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number') return null;
        return (
            <text x={x + width / 2} y={y - 7} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK.primary}>
                {formatCount(data[peakIndex]?.clicks ?? 0)}
            </text>
        );
    };

    return (
        <Card className={className} style={{ borderColor: CHART.grid }}>
            <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold" style={{ color: INK.primary }}>
                    Klik Campaign Link
                </CardTitle>
                <CardDescription className="mt-1 text-[13px]">{rangeLabel}</CardDescription>
            </CardHeader>

            <CardContent className="pt-0">
                {clicks.isFullyUncovered ? (
                    /* Bukan grafik nol — lihat catatan di kepala berkas. */
                    <div
                        className="flex h-[220px] flex-col items-center justify-center rounded-md border border-dashed px-6 text-center"
                        style={{ borderColor: CHART.grid }}
                    >
                        <MousePointerClick className="mb-2 h-7 w-7" style={{ color: CHART.axis }} aria-hidden="true" />
                        <p className="text-[13px] font-medium" style={{ color: INK.secondary }}>
                            Klik belum dicatat per tanggal pada rentang ini
                        </p>
                        <p className="mt-1 text-[12px]" style={{ color: INK.muted }}>
                            Pencatatan harian dimulai {formatWibDate(clicks.logSince)}. Sebelum itu yang
                            tersimpan hanya total seumur hidup: {formatCount(clicks.lifetimeTotal)} klik.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                            <LegendKey color={CHART.accent} label="Klik" />
                            {partialPoint && (
                                <LegendKey
                                    glyph="rule"
                                    color={CHART.accent}
                                    label={`${labelByKey.get(partialPoint.dayKey) ?? ''} — hari berjalan`}
                                />
                            )}
                        </div>

                        <p className="mb-3 text-[12px] tabular-nums" style={{ color: INK.muted }}>
                            {formatCount(total)} klik pada rentang ini · {formatCount(clicks.lifetimeTotal)} seumur hidup
                        </p>

                        <div
                            style={{ opacity: isRefetching ? 0.5 : 1, transition: 'opacity 160ms ease-out' }}
                            aria-busy={isRefetching}
                        >
                            <ResponsiveContainer width="100%" height={chartHeight}>
                                <BarChart
                                    data={data}
                                    margin={CHART_MARGIN}
                                    onMouseMove={handleMove}
                                    onMouseLeave={() => setActiveIndex(null)}
                                    barCategoryGap="22%"
                                >
                                    <defs>
                                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={GRADIENT.accentBright} />
                                            <stop offset="45%" stopColor={CHART.accent} />
                                            <stop offset="100%" stopColor={GRADIENT.accentDeep} />
                                        </linearGradient>
                                    </defs>
                                    <HatchDefs id={hatchId} color={CHART.accent} />

                                    <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="0" />
                                    <XAxis
                                        dataKey="dayKey"
                                        tickFormatter={(key: string) => labelByKey.get(key) ?? formatDayLabel(key)}
                                        interval="preserveStartEnd"
                                        minTickGap={20}
                                        tickLine={false}
                                        axisLine={{ stroke: CHART.axis }}
                                        tick={{ fill: INK.muted, fontSize: 11 }}
                                        height={28}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: INK.muted, fontSize: 11 }}
                                        width={Y_AXIS_WIDTH}
                                        /* Klik itu bilangan bulat; domain minimum 4 menahan
                                           sumbu supaya rentang sepi tidak menghasilkan tick
                                           pecahan "0,5 klik". */
                                        domain={[0, total > 0 ? 'auto' : 4]}
                                        allowDecimals={false}
                                        tickFormatter={formatCountAxisTick}
                                        className="tabular-nums"
                                    />
                                    <Tooltip
                                        cursor={{ fill: CHART.contextSoft, fillOpacity: 0.55 }}
                                        content={renderTooltip}
                                        wrapperStyle={{ outline: 'none' }}
                                    />
                                    {partialPoint && (
                                        <ReferenceLine
                                            x={partialPoint.dayKey}
                                            stroke={CHART.axis}
                                            strokeWidth={1.5}
                                            strokeDasharray="3 3"
                                            ifOverflow="extendDomain"
                                        />
                                    )}
                                    <Bar
                                        dataKey="clicks"
                                        maxBarSize={44}
                                        radius={[4, 4, 0, 0]}
                                        isAnimationActive={!reduceMotion}
                                        animationBegin={MOTION.barBegin}
                                        animationDuration={MOTION.barDuration}
                                        animationEasing={MOTION.easing}
                                    >
                                        {data.map((point, index) => (
                                            <Cell
                                                key={point.dayKey}
                                                fill={point.isPartial ? `url(#${hatchId})` : `url(#${gradId})`}
                                                fillOpacity={cellOpacity(point, index)}
                                            />
                                        ))}
                                        <LabelList dataKey="clicks" content={renderPeakLabel} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Rentang yang MELINTASI tanggal mulai pencatatan: batangnya benar,
                            tapi hari-hari awalnya kosong bukan karena sepi. */}
                        {clicks.isPartiallyCovered && (
                            <p
                                className="mt-4 border-t pt-3 text-[12px] leading-snug"
                                style={{ color: INK.muted, borderColor: CHART.grid }}
                            >
                                Klik baru dicatat per tanggal sejak {formatWibDate(clicks.logSince)} — hari
                                sebelum itu kosong karena belum tercatat, bukan karena tidak ada klik.
                                Total seumur hidup {formatCount(clicks.lifetimeTotal)} klik.
                            </p>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}

export default DailyClicksChart;
