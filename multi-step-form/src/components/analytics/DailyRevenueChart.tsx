import { useId, useMemo, useState } from 'react';
import {
    Area,
    Bar,
    CartesianGrid,
    Cell,
    ComposedChart,
    LabelList,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMediaQuery } from '@/lib/utils';
import { formatIDR } from '@/utils/currency';
import {
    bucketSeries,
    coverageGapDays,
    firstPaidDayKey,
    granularityFor,
    toShareSeries,
} from '@/utils/analytics/revenue';
import type { BucketPoint, DailyPoint } from '@/utils/analytics/types';
import { CHART, GRADIENT, INK, MOTION, PARTIAL_DAY_OPACITY } from './palette';
import { HatchDefs, LegendKey } from './ChartParts';
import { TogglePicker } from './TogglePicker';
import { formatCount, formatIDRCompact } from './format';

/**
 * Grafik utama tab Revenue: revenue masuk vs jumlah order lunas, per hari.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  SATU BIDANG — TAPI DUA SUMBU Y TETAP TERLARANG SELAMANYA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Versi paling awal menumpuk Revenue (0–3,4 juta rupiah) dan jumlah order (0–12) di
 * satu bidang dengan DUA SUMBU Y. Penjajaran semacam itu selalu arbitrer: tinggi
 * relatif kedua seri ditentukan oleh domain yang kebetulan dipilih Recharts, bukan
 * oleh hubungan apa pun di datanya. Dua garis jadi terlihat berimpit rapi dan
 * grafiknya MENGARANG KORELASI — di dashboard uang itu terbaca sebagai temuan bisnis.
 *
 * Versi berikutnya memisahnya jadi dua panel bertumpuk. Benar, tapi mahal di tempat.
 *
 * Versi ini menyatukannya lagi ke SATU bidang, dan itu sah — tapi hanya karena satu
 * syarat yang dipenuhi lebih dulu: **kedua seri dinormalisasi ke basis yang sama**
 * (`toShareSeries`, porsi terhadap total periode) sebelum digambar. Setelah keduanya
 * jadi besaran tanpa satuan yang sebanding, tinggal SATU sumbu, dan tidak ada lagi
 * penjajaran yang bisa dikarang.
 *
 * ⚠️ Konsekuensinya, dan ini pagarnya:
 *
 *   • JANGAN pernah menambahkan `yAxisId` kedua ke chart ini. Larangan dual-axis
 *     tidak dicabut oleh perubahan ini — ia justru satu-satunya alasan normalisasi
 *     itu ada.
 *   • Kalau suatu hari `toShareSeries` dicopot dan seri kembali digambar dalam
 *     satuan aslinya, panelnya WAJIB dipisah lagi. Satu bidang tanpa normalisasi
 *     adalah dual-axis dengan nama lain.
 *
 * Rupiah tidak hilang gara-gara sumbunya persen: ia tetap terbaca tanpa hover di tiga
 * tempat — baris penerjemah "100% = …", label langsung di batang puncak, dan
 * tooltip + tampilan Tabel.
 *
 * ─── Aturan lain yang di-encode di berkas ini ──────────────────────────────
 *
 * • BATANG untuk revenue, selalu, tanpa pengecualian. Metrik ini diskret — tidak ada
 *   nilai di antara dua bucket. `type="monotone"` yang lama menggambar kurva menanjak
 *   mulus melintasi dua hari yang nilainya benar-benar Rp 0.
 * • LEBAR BUCKET yang mengikuti rentang, BUKAN bentuk grafik yang berubah. Versi
 *   sebelumnya menjawab "365 batang jadi sub-pixel" dengan diam-diam berpindah ke
 *   mode area di atas 60 hari. Itu menambal gejalanya: 254 titik harian tetap 254
 *   titik, cuma digambar sebagai rumput gerigi alih-alih noda abu, dan tak satu pun
 *   bisa dibaca. Yang melebar seharusnya bucketnya (`granularityFor`), bukan
 *   marknya — setahun jadi 12 batang bulanan yang terbaca, dan bentuk grafiknya
 *   tidak pernah berubah di bawah kaki pembaca.
 * • BUCKET TAK PENUH diberi pola garis + opacity turun + keterangan. Di harian ini
 *   berarti "hari ini"; di bulanan ia juga menangkap bucket yang terpotong pilihan
 *   tanggal user. September berisi 11 hari akan terbaca sebagai bulan TERBURUK
 *   setahun kalau tidak ditandai — dan tidak seperti hari berjalan, ia bisa muncul
 *   di ujung KIRI sumbu juga.
 * • GRIDLINE solid, horizontal saja. Garis putus-putus terbaca sebagai ambang.
 * • LEGEND selalu ada, dan ada toggle TABEL. Tooltip tidak boleh jadi satu-satunya
 *   jalan membaca angka.
 * • Sumbu X memakai `dayKey` (YYYY-MM-DD), bukan `label`. Label "15 Agu" berulang
 *   tiap tahun; memakainya sebagai kategori akan menumpuk Agustus 2025 ke Agustus 2026.
 *   Di bucket mingguan/bulanan `dayKey` adalah tanggal PERTAMA bucket, jadi sifat itu
 *   bertahan apa pun granularitasnya.
 */

/**
 * Kekosongan sependek ini tidak perlu dijelaskan — lihat `showCoverageNote`.
 * 45 hari: cukup panjang untuk bukan sekadar kanal sepi, cukup pendek untuk
 * menangkap rentang "Semua waktu" yang kosongnya berbulan-bulan.
 */
const COVERAGE_NOTE_MIN_GAP_DAYS = 45;

const Y_AXIS_WIDTH = 52;

/**
 * `bottom` TIDAK boleh 0. Dengan 0, garis grid nol tetap digambar tapi label ticknya
 * terpotong keluar kotak. `top` diberi ruang ekstra untuk label langsung di batang
 * puncak — tanpa itu labelnya terpotong plafon di hari tertinggi.
 */
const CHART_MARGIN = { top: 22, right: 10, left: 0, bottom: 6 };

/** Batang non-hover diredupkan, bukan diganti warna: emphasis lewat opacity. */
const DIMMED_OPACITY = 0.32;

type ViewMode = 'chart' | 'table';

export interface DailyRevenueChartProps {
    /** Satu titik per hari dalam rentang, TERMASUK hari yang nilainya nol. */
    data: DailyPoint[];
    /**
     * "15 Agu – 21 Agu 2026" — pakai `formatRangeLabel(range)`.
     *
     * Angka hero revenue TIDAK lagi tinggal di kartu ini; ia pindah ke rail KPI di
     * sebelahnya supaya semua angka periode terbaca dalam satu kolom. Yang tersisa di
     * sini cuma rentangnya, sebagai konteks sumbu X.
     */
    rangeLabel: string;
    /**
     * Sedang mengambil data baru. Render sebelumnya DITAHAN pada opacity turun,
     * jangan dibalikkan ke skeleton — layar yang melompat tiap ganti periode bikin
     * orang kehilangan tempat bacanya.
     */
    isRefetching?: boolean;
    className?: string;
}

export function DailyRevenueChart({
    data,
    rangeLabel,
    isRefetching = false,
    className = '',
}: DailyRevenueChartProps) {
    const [view, setView] = useState<ViewMode>('chart');
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const isWide = useMediaQuery('(min-width: 640px)');
    const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

    // `useId` bisa memuat titik dua, yang tidak sah di dalam `url(#…)`; dibersihkan
    // supaya dua instance chart tidak saling merebut gradien & pattern.
    const uid = useId().replace(/:/g, '');
    const revenueHatchId = `${uid}-hatch-rev`;
    const revenueGradId = `${uid}-grad-rev`;
    const ordersGradId = `${uid}-grad-ord`;

    /**
     * BATANG adalah bentuk grafik ini — selalu, tanpa pengecualian dan tanpa kontrol.
     *
     * Yang menyesuaikan diri dengan rentang adalah LEBAR BUCKET, bukan bentuk mark:
     * setahun digambar sebagai 12 batang bulanan, bukan 365 batang sub-pixel dan
     * bukan pula kurva area. Keputusannya milik data (`granularityFor`), bukan user.
     */
    const buckets = useMemo(() => bucketSeries(data, granularityFor(data.length)), [data]);
    const granularity = buckets[0]?.granularity ?? 'day';

    const indexed = useMemo(() => toShareSeries(buckets), [buckets]);

    const labelByKey = useMemo(() => {
        const map = new Map<string, string>();
        buckets.forEach((bucket) => map.set(bucket.dayKey, bucket.label));
        return map;
    }, [buckets]);

    /**
     * Bucket tak penuh — bisa DUA sekarang, di kedua ujung sumbu.
     *
     * Versi harian hanya pernah punya satu ("hari ini"), selalu di kanan. Begitu
     * bucketnya melebar, bucket pertama juga bisa terpotong oleh tanggal awal yang
     * dipilih user, dan penanda yang cuma melihat ujung kanan akan melewatkannya.
     */
    const partialPoints = useMemo(() => buckets.filter((bucket) => bucket.isPartial), [buckets]);
    const totals = useMemo(
        () =>
            buckets.reduce(
                (acc, bucket) => ({
                    revenue: acc.revenue + bucket.revenue,
                    paidOrders: acc.paidOrders + bucket.paidOrders,
                }),
                { revenue: 0, paidOrders: 0 },
            ),
        [buckets],
    );

    /** Hanya batang TERTINGGI yang diberi label langsung — bukan angka di tiap titik. */
    const peakIndex = useMemo(() => {
        let best = -1;
        let bestValue = 0;
        buckets.forEach((bucket, index) => {
            if (bucket.revenue > bestValue) {
                bestValue = bucket.revenue;
                best = index;
            }
        });
        return best;
    }, [buckets]);

    const chartHeight = isWide ? 272 : 216;
    const hasRevenue = totals.revenue > 0;

    /** Kata untuk satu bucket — dipakai di keterangan parsial & judul kolom tabel. */
    const bucketNoun = granularity === 'month' ? 'Bulan' : granularity === 'week' ? 'Pekan' : 'Hari';

    /**
     * Catatan cakupan — muncul HANYA kalau sumbu berdiri kosong cukup lama di kiri.
     *
     * `transactions` baru memuat pembayaran sejak Januari 2026, sementara order 2025
     * dibayar di luar sistem. Tanpa catatan ini, "Semua waktu" menggambar delapan
     * bulan datar di nol lalu melonjak — dan terbaca sebagai "bisnis ini lahir
     * Januari 2026", bukan sebagai "pencatatan transaksi baru dimulai di sana".
     *
     * Ambangnya sengaja tidak nol. Satu-dua hari sepi di awal rentang itu wajar dan
     * tidak perlu dijelaskan; catatan yang muncul di setiap rentang akan jadi bising
     * lalu berhenti dibaca — dan kehilangan dayanya justru di rentang yang butuh.
     */
    const gapDays = useMemo(() => coverageGapDays(data), [data]);
    const coverageStart = useMemo(() => firstPaidDayKey(data), [data]);
    const showCoverageNote = gapDays >= COVERAGE_NOTE_MIN_GAP_DAYS && coverageStart !== null;
    /**
     * Label bucket yang MEMUAT hari pertama tercatat.
     *
     * Bukan `coverageStart` mentah: di sumbu bulanan, "pencatatan dimulai 2026-01-02"
     * menyebut tanggal yang tidak ada di sumbu mana pun. Bucket terakhir yang mulai
     * pada atau sebelum hari itu adalah bucket yang memuatnya.
     */
    const coverageStartLabel = useMemo(() => {
        if (!coverageStart) return '';
        let found = '';
        for (const bucket of buckets) {
            if (bucket.dayKey <= coverageStart) found = bucket.label;
            else break;
        }
        return found || coverageStart;
    }, [buckets, coverageStart]);

    const handleMove = (state: any) => {
        const raw = state?.activeTooltipIndex ?? state?.activeIndex;
        const index = typeof raw === 'string' ? Number(raw) : raw;
        setActiveIndex(Number.isInteger(index) ? (index as number) : null);
    };
    const handleLeave = () => setActiveIndex(null);

    const cellOpacity = (point: BucketPoint, index: number): number => {
        if (point.isPartial) return PARTIAL_DAY_OPACITY;
        if (activeIndex === null) return 1;
        return index === activeIndex ? 1 : DIMMED_OPACITY;
    };

    const renderTooltip = (props: any) => {
        const point: BucketPoint | undefined = props?.payload?.[0]?.payload;
        if (!props?.active || !point) return null;
        return (
            <div className="rounded-md border bg-white px-3 py-2 shadow-md" style={{ borderColor: CHART.grid }}>
                <p className="text-[12px] font-semibold" style={{ color: INK.primary }}>
                    {point.longLabel}
                </p>
                {/* Nominal ASLI, bukan porsinya — sumbu boleh persen, angka tidak. */}
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px]" style={{ color: INK.secondary }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART.accent }} aria-hidden="true" />
                    Revenue
                    <strong className="ml-auto pl-3 font-semibold tabular-nums" style={{ color: INK.primary }}>
                        {formatIDR(point.revenue)}
                    </strong>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[12px]" style={{ color: INK.secondary }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART.accentAlt }} aria-hidden="true" />
                    Order lunas
                    <strong className="ml-auto pl-3 font-semibold tabular-nums" style={{ color: INK.primary }}>
                        {formatCount(point.paidOrders)}
                    </strong>
                </p>
                {point.isPartial && (
                    // Angka hari yang benar-benar tercakup disebutkan, bukan cuma
                    // "belum lengkap": tanpa itu pembaca tidak bisa menilai SEBERAPA
                    // jauh batangnya kurang tinggi dari bucket penuh di sebelahnya.
                    <p className="mt-1.5 text-[11px]" style={{ color: INK.muted }}>
                        {bucketNoun} tak penuh — {formatCount(point.days)} hari
                    </p>
                )}
            </div>
        );
    };

    /**
     * Penanda "hari berjalan".
     *
     * Dua jebakan yang ditutup di sini:
     *  1. `ReferenceArea` dengan `x1 === x2` di sumbu kategori berlebar NOL — di mode
     *     area penandanya sama sekali tidak tergambar, padahal mode area justru
     *     dipakai untuk rentang panjang, saat penurunan hari terakhir paling sulit
     *     dinilai.
     *  2. Kalau revenue hari ini masih Rp 0, tidak ada batang untuk diarsir. Itu
     *     keadaan SETIAP PAGI. Penanda harus berdiri sendiri, tidak menumpang mark.
     *  3. Sejak sumbu bisa bermodus bulanan, bucket tak penuh bisa ada DUA — satu di
     *     tiap ujung. Penanda karena itu di-map dari `partialPoints`, bukan dari satu
     *     titik; versi lama yang mencari satu `find()` akan diam-diam melewatkan
     *     bucket pertama yang terpotong tanggal awal pilihan user.
     *
     * PUTUS-PUTUS, bukan solid: solid 2px di tepi kanan panel terbaca sebagai bingkai
     * area plot, bukan anotasi. Gridline di sini solid & horizontal saja, jadi rule
     * vertikal putus-putus tidak mungkin tertukar dengannya; dan "hari berjalan" memang
     * sebuah ambang — makna yang justru dilambangkan garis putus-putus.
     */
    const renderPartialMarkers = () =>
        partialPoints.map((point) => (
            <ReferenceLine
                key={point.dayKey}
                x={point.dayKey}
                stroke={CHART.axis}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                ifOverflow="extendDomain"
            />
        ));

    /** Label langsung di batang puncak. `content` dipakai supaya hanya SATU yang tergambar. */
    const renderPeakLabel = (props: any) => {
        if (props?.index !== peakIndex || peakIndex < 0) return null;
        const { x, y, width } = props;
        if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number') return null;
        return (
            <text
                x={x + width / 2}
                y={y - 7}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={INK.primary}
            >
                {formatIDRCompact(buckets[peakIndex]?.revenue ?? 0, { decimals: 2 })}
            </text>
        );
    };

    return (
        <Card className={className} style={{ borderColor: CHART.grid }}>
            <CardHeader className="pb-3">
                {/*
                  Baris judul dibuat di dalam SATU anak `CardHeader`, bukan dengan
                  menimpa `flex-col` bawaannya: `styles.css` men-declare `.flex-col`
                  lagi SETELAH Tailwind, jadi `flex-row` di elemen yang sama akan kalah
                  dan tata letaknya diam-diam kembali menumpuk vertikal.
                */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <CardTitle className="text-base font-semibold" style={{ color: INK.primary }}>
                            Revenue &amp; Order Lunas
                        </CardTitle>
                        <CardDescription className="mt-1 text-[13px]">{rangeLabel}</CardDescription>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                        {/* Tidak ada toggle bentuk grafik, dan tidak ada toggle
                            granularitas. Batang adalah bentuknya; lebar bucket
                            ditentukan data (lihat `granularityFor`), bukan kontrol di
                            header. Dua kontrol lebih sedikit di bawah angka terbesar
                            halaman — dan tak ada cara bagi pembaca memilih resolusi
                            yang menggambar 365 batang sub-pixel. */}
                        <TogglePicker<ViewMode>
                            ariaLabel="Tampilan data"
                            value={view}
                            onChange={setView}
                            options={[
                                { value: 'chart', label: 'Grafik', icon: BarChart3 },
                                { value: 'table', label: 'Tabel', icon: Table2 },
                            ]}
                        />
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-0">
                {/* Legend SELALU ada untuk dua seri — identitas tidak pernah cuma lewat warna. */}
                <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <LegendKey color={CHART.accent} label="Revenue" />
                    <LegendKey color={CHART.accentAlt} label="Order lunas" />
                    {partialPoints.length > 0 && (
                        <LegendKey
                            glyph="rule"
                            color={CHART.accent}
                            label={
                                partialPoints.length === 1
                                    ? `${partialPoints[0].label} — ${bucketNoun.toLowerCase()} tak penuh`
                                    : `${bucketNoun} tak penuh di kedua ujung`
                            }
                        />
                    )}
                </div>

                {/*
                  Baris penerjemah. Sumbunya persen, jadi tanpa baris ini tidak ada cara
                  mengubah tinggi mana pun kembali jadi rupiah tanpa hover. Penyebutnya
                  sengaja PERSIS angka hero di atas, supaya grafik dan KPI terkunci.
                */}
                {view === 'chart' && buckets.length > 0 && (
                    <p className="mb-3 text-[12px] tabular-nums" style={{ color: INK.muted }}>
                        100% = {formatIDR(totals.revenue)} · {formatCount(totals.paidOrders)} order lunas
                    </p>
                )}

                {buckets.length === 0 ? (
                    <p
                        className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm"
                        style={{ borderColor: CHART.grid, color: INK.muted }}
                    >
                        Belum ada transaksi lunas pada rentang ini.
                    </p>
                ) : (
                    <div
                        // Refetch: tahan render sebelumnya pada opacity turun. Balik ke
                        // skeleton bikin layar melompat tiap kali periode diganti.
                        style={{ opacity: isRefetching ? 0.5 : 1, transition: 'opacity 160ms ease-out' }}
                        aria-busy={isRefetching}
                    >
                        {view === 'table' ? (
                            <TableView data={buckets} totals={totals} bucketNoun={bucketNoun} />
                        ) : (
                            <>
                                <p
                                    className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
                                    style={{ color: INK.muted }}
                                >
                                    % dari total periode
                                </p>
                                <ResponsiveContainer width="100%" height={chartHeight}>
                                    <ComposedChart
                                        data={indexed}
                                        margin={CHART_MARGIN}
                                        onMouseMove={handleMove}
                                        onMouseLeave={handleLeave}
                                        barCategoryGap="22%"
                                    >
                                        <defs>
                                            {/*
                                              Gradien batang: mahkota `jfu.light`, badan
                                              `jfu.primary`, dasar `jfu.dark`. Primer JFU
                                              sengaja diletakkan di 45% — pusat massa
                                              visual batang — supaya grafiknya terbaca
                                              sebagai biru JFU, bukan sekadar biru.
                                            */}
                                            <linearGradient id={revenueGradId} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={GRADIENT.accentBright} />
                                                <stop offset="45%" stopColor={CHART.accent} />
                                                <stop offset="100%" stopColor={GRADIENT.accentDeep} />
                                            </linearGradient>
                                            {/*
                                              Isian area boleh memudar sampai nyaris tak
                                              terlihat KARENA identitas serinya dibawa
                                              stroke `accentAlt` yang opacity penuh.
                                              Jangan pernah membalik ini.
                                            */}
                                            <linearGradient id={ordersGradId} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={GRADIENT.accentAltBright} stopOpacity={0.3} />
                                                <stop offset="100%" stopColor={GRADIENT.accentAltBright} stopOpacity={0.02} />
                                            </linearGradient>
                                        </defs>
                                        <HatchDefs id={revenueHatchId} color={CHART.accent} />

                                        {/* Horizontal saja, dan SOLID — `strokeDasharray` terbaca sebagai ambang. */}
                                        <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="0" />
                                        <XAxis
                                            dataKey="dayKey"
                                            padding={{ left: 0, right: 0 }}
                                            tickFormatter={(key: string) => labelByKey.get(key) ?? key}
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
                                            domain={[0, hasRevenue ? 'auto' : 10]}
                                            tickFormatter={(v: number) => `${Math.round(v)}%`}
                                            className="tabular-nums"
                                        />
                                        <Tooltip
                                            cursor={{ fill: CHART.contextSoft, fillOpacity: 0.55 }}
                                            content={renderTooltip}
                                            wrapperStyle={{ outline: 'none' }}
                                        />
                                        {renderPartialMarkers()}

                                        {/*
                                          Order lunas digambar LEBIH DULU: urutan cat SVG
                                          mengikuti urutan dokumen, jadi ini yang membuat
                                          areanya jatuh di BELAKANG batang revenue.
                                        */}
                                        <Area
                                            type="linear"
                                            dataKey="ordersShare"
                                            stroke={CHART.accentAlt}
                                            strokeWidth={2}
                                            strokeLinejoin="round"
                                            strokeLinecap="round"
                                            fill={`url(#${ordersGradId})`}
                                            dot={false}
                                            activeDot={{ r: 3.5, fill: CHART.accentAlt, stroke: '#ffffff', strokeWidth: 1.5 }}
                                            isAnimationActive={!reduceMotion}
                                            animationBegin={MOTION.areaBegin}
                                            animationDuration={MOTION.areaDuration}
                                            animationEasing={MOTION.easing}
                                        />

                                        <Bar
                                            dataKey="revenueShare"
                                            /* 26px terukur terlalu kurus di rentang
                                               7 hari: tujuh batang di ~875px membuat
                                               grafiknya terbaca renggang, dan
                                               gradiennya nyaris tak terlihat karena
                                               tak punya lebar untuk dibaca. Di
                                               rentang panjang angka ini tidak
                                               berpengaruh — lebar per kategori sudah
                                               jauh di bawahnya. */
                                            maxBarSize={44}
                                            radius={[4, 4, 0, 0]}
                                            isAnimationActive={!reduceMotion}
                                            animationBegin={MOTION.barBegin}
                                            animationDuration={MOTION.barDuration}
                                            animationEasing={MOTION.easing}
                                        >
                                            {indexed.map((point, index) => (
                                                <Cell
                                                    key={point.dayKey}
                                                    fill={
                                                        point.isPartial
                                                            ? `url(#${revenueHatchId})`
                                                            : `url(#${revenueGradId})`
                                                    }
                                                    fillOpacity={cellOpacity(point, index)}
                                                />
                                            ))}
                                            <LabelList dataKey="revenueShare" content={renderPeakLabel} />
                                        </Bar>
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </>
                        )}

                        {/*
                          Catatan cakupan. Ditempatkan DI BAWAH grafik & tabel — ia
                          menjelaskan sesuatu yang baru jadi pertanyaan SETELAH
                          kekosongan di kiri terlihat, jadi menaruhnya di atas berarti
                          menjawab sebelum ditanya dan menambah beban baca di tempat
                          angka utama seharusnya mendarat lebih dulu.
                        */}
                        {showCoverageNote && (
                            <p
                                className="mt-3 border-t pt-2.5 text-[11px] leading-relaxed"
                                style={{ borderColor: CHART.grid, color: INK.muted }}
                            >
                                Transaksi lunas baru tercatat sejak <strong>{coverageStartLabel}</strong>.
                                Order sebelum itu umumnya dibayar di luar sistem, jadi tidak muncul
                                di grafik ini — kekosongan di kiri adalah batas pencatatan, bukan
                                penjualan yang nol.
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function TableView({
    data,
    totals,
    bucketNoun,
}: {
    data: BucketPoint[];
    totals: { revenue: number; paidOrders: number };
    /** "Hari" / "Pekan" / "Bulan" — judul kolom ikut granularitas yang digambar. */
    bucketNoun: string;
}) {
    return (
        // Konten lebar dapat scroll-nya SENDIRI; body halaman tidak pernah ikut
        // menggeser ke samping di 375px.
        <div className="overflow-x-auto">
            <table className="w-full min-w-[340px] border-collapse text-[13px]">
                <caption className="sr-only">
                    Revenue dan jumlah order lunas per {bucketNoun.toLowerCase()} — angka yang sama dengan grafik
                </caption>
                <thead>
                    <tr style={{ color: INK.muted }}>
                        <th scope="col" className="py-2 text-left font-medium">Periode</th>
                        <th scope="col" className="py-2 text-right font-medium">Revenue</th>
                        <th scope="col" className="py-2 text-right font-medium">Order lunas</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((point) => (
                        <tr key={point.dayKey} style={{ borderTop: `1px solid ${CHART.grid}` }}>
                            <th scope="row" className="py-1.5 text-left font-normal" style={{ color: INK.secondary }}>
                                {point.label}
                                {point.isPartial && (
                                    <span className="ml-1.5 text-[11px]" style={{ color: INK.muted }}>
                                        ({formatCount(point.days)} hari)
                                    </span>
                                )}
                            </th>
                            {/* `tabular-nums` di kolom angka: di sini digit memang harus lurus ke bawah. */}
                            <td className="py-1.5 text-right tabular-nums" style={{ color: INK.primary }}>
                                {formatIDR(point.revenue)}
                            </td>
                            <td className="py-1.5 text-right tabular-nums" style={{ color: INK.primary }}>
                                {formatCount(point.paidOrders)}
                            </td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr style={{ borderTop: `2px solid ${CHART.axis}` }}>
                        <th scope="row" className="py-2 text-left font-semibold" style={{ color: INK.primary }}>
                            Total
                        </th>
                        <td className="py-2 text-right font-semibold tabular-nums" style={{ color: INK.primary }}>
                            {formatIDR(totals.revenue)}
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums" style={{ color: INK.primary }}>
                            {formatCount(totals.paidOrders)}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

export default DailyRevenueChart;
