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
import type { RespondentDailyPoint } from '@/utils/analytics/types';
import { CHART, GRADIENT, INK, MOTION, PARTIAL_DAY_OPACITY } from './palette';
import { HatchDefs, LegendKey } from './ChartParts';
import { TogglePicker } from './TogglePicker';
import { formatCount, formatCountAxisTick, formatDayLabel, formatDayLabelLong, formatDecimal } from './format';

/**
 * Grafik utama tab Responden: RESPONS per hari.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  KENAPA BATANGNYA RESPONS, BUKAN "RESPONDEN UNIK"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rancangan pertama memplot responden unik per hari — pilihan yang terlihat wajar
 * karena judul tabnya "Responden". Ia salah, dan salahnya tidak kelihatan sampai
 * angkanya dijumlahkan.
 *
 * Satu orang mengerjakan rata-rata 5,8 survei yang tayang tiap hari, dan datang
 * lagi di hari-hari berikutnya. Terukur produksi 2026-08-24 pada rentang 30 hari:
 * menjumlahkan responden unik harian menghasilkan **16.680**, sementara responden
 * unik sebenarnya di rentang itu **9.337** — inflasi 79%. Tab Revenue sudah
 * menetapkan aturan "jumlah batang = angka hero"; dengan responden unik sebagai
 * batang, aturan itu MUSTAHIL dipenuhi dan grafiknya akan bertengkar dengan KPI
 * di sebelahnya tanpa ada satu pun angka yang bisa dibenarkan.
 *
 * Maka: batang = `responses` (bisa dijumlahkan, dan jumlahnya PERSIS KPI Respons),
 * responden unik hidup sebagai KPI tersendiri yang dihitung sekali atas seluruh
 * rentang, dan angka unik HARIAN hanya muncul di tooltip — di sana ia informasi
 * yang berguna, bukan tinggi yang mengundang penjumlahan.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  KENAPA ADA SAKELAR "PER SURVEI"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Jumlah respons harian dikacaukan oleh JUMLAH SURVEI yang kebetulan tayang hari
 * itu — terukur berayun antara 1 dan 8. 10 Agustus mencatat 1.307 respons, tapi
 * hari itu ada 5 survei; hari bersurvei-dua tidak akan pernah menyamainya
 * sekalipun tiap surveinya berkinerja lebih baik. Batang mentah karena itu TIDAK
 * bisa dipakai sebagai patokan "seberapa banyak responden yang kita dapat".
 *
 * Sakelar "Per survei" membagi tiap hari dengan jumlah surveinya, jadi tingginya
 * bisa dibandingkan antar hari. Yang ditukar: seri itu RATA-RATA, jadi aturan
 * "jumlah batang = angka hero" tidak berlaku di sana — kalimat penerjemah di
 * bawah legend berganti supaya tidak ada yang menjumlahkannya.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  SATU SERI, JADI SATU SKALA — TIDAK PERLU NORMALISASI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Grafik tab Revenue menormalkan kedua serinya jadi persen karena ia menggambar
 * rupiah dan cacah order di satu bidang. Di sini hanya ada SATU besaran, jadi
 * sumbunya boleh — dan harus — memakai cacah aslinya: setiap normalisasi yang
 * tidak diperlukan hanya menambah satu langkah terjemahan antara mata dan angka.
 */

/*
 * ═══════════════════════════════════════════════════════════════════════════
 *  "HARI" DI SINI ADALAH SIKLUS TAYANG 15:00 → 15:00, BUKAN TANGGAL KALENDER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Iklan tayang 15:00 → 15:00 WIB. Dipotong per tengah malam, satu batang memuat
 * DUA gelombang: 14 Agustus 2026 menunjukkan delapan survei — empat gelombang
 * pagi (mulai 13 Agu 15:00), tiga gelombang sore (mulai 14 Agu 15:00), plus satu
 * extra ad — padahal yang tayang BERSAMAAN tidak pernah lebih dari lima. Angka
 * yang benar, ember yang salah.
 *
 * Sejak embernya digeser, satu batang = satu gelombang tayang, dan rata-rata
 * survei per batang turun 5,80 → 4,67.
 *
 * Sisa selisihnya soal lain: halaman survei tetap bisa dibuka lewat tautan
 * langsung setelah iklannya berhenti tayang, jadi ia masih kejatuhan satu-dua
 * jawaban susulan dan ikut terhitung sebagai "survei". Karena itu RPC menyaring
 * penyebutnya (jebakan 2d di sql/67) — 14 Agustus kini 4 survei, persis seperti
 * papan Jadwal, dan rata-ratanya 3,50 per siklus di rentang 30 hari. Respons
 * susulannya TETAP masuk `responses`; hanya penyebutnya yang dibuang (0,24%).
 *
 * ⚠️ Label WAJIB menyebutkan ini di tiga tempat — deskripsi kartu, kalimat di
 * bawah legend, dan judul tooltip. Tanpa itu "18 Agu" di tab ini terbaca sama
 * dengan "18 Agu" di tab Revenue, padahal keduanya bergeser 15 jam.
 */

/** Di atas ambang ini batang jadi sub-pixel, jadi bentuknya otomatis jatuh ke area. */
const LINE_MODE_MIN_DAYS = 60;

const Y_AXIS_WIDTH = 46;

/** `bottom` tidak boleh 0 — label tick grid nol akan terpotong keluar kotak. */
const CHART_MARGIN = { top: 22, right: 10, left: 0, bottom: 6 };

/** Batang non-hover diredupkan, bukan diganti warna: emphasis lewat opacity. */
const DIMMED_OPACITY = 0.32;

/**
 * "15 Agu" untuk kunci "2026-08-14" — ujung siklus tayangnya.
 *
 * Ditulis lewat epoch UTC, bukan `new Date(y, m, d)`, supaya pergantian bulan dan
 * tahun ikut benar tanpa bergantung zona waktu perangkat pembaca.
 */
function nextDayLabel(ymd: string): string {
    const next = new Date(Date.parse(`${ymd}T00:00:00.000Z`) + 86_400_000);
    return formatDayLabel(next.toISOString().slice(0, 10));
}

type ViewMode = 'chart' | 'table';
/** `total` = respons apa adanya (bisa dijumlahkan). `perSurvey` = rata-rata (tidak). */
type Metric = 'total' | 'perSurvey';

export interface DailyRespondentsChartProps {
    /** Satu titik per hari dalam rentang, TERMASUK hari yang nilainya nol. */
    data: RespondentDailyPoint[];
    /** "15 Agu – 21 Agu 2026" — pakai `formatRangeLabel(range)`. */
    rangeLabel: string;
    /**
     * Responden unik SE-PERIODE, dihitung sekali di SQL.
     *
     * Dikirim sebagai prop dan TIDAK diturunkan dari `data`: menjumlahkan kolom
     * `respondents` akan menghasilkan angka yang 79% terlalu besar. Ia dipakai di
     * kaki tampilan Tabel, tepat di kolom yang tidak boleh dijumlahkan.
     */
    uniqueRespondents: number;
    /**
     * Laju respons per survei per hari untuk SELURUH rentang, dari RPC.
     *
     * Dikirim sebagai prop, bukan dirata-ratakan dari `data`: yang benar adalah
     * `total respons / total hari-survei` (tertimbang), sementara merata-ratakan
     * kolom `perSurvey` secara polos menyamakan bobot hari bersurvei-satu dengan
     * hari bersurvei-delapan dan menghasilkan angka lain.
     */
    perSurveyRate: number;
    isRefetching?: boolean;
    className?: string;
}

export function DailyRespondentsChart({
    data,
    rangeLabel,
    uniqueRespondents,
    perSurveyRate,
    isRefetching = false,
    className = '',
}: DailyRespondentsChartProps) {
    const [view, setView] = useState<ViewMode>('chart');
    const [metric, setMetric] = useState<Metric>('total');
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const isWide = useMediaQuery('(min-width: 640px)');
    const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

    // `useId` bisa memuat titik dua, yang tidak sah di dalam `url(#…)`.
    const uid = useId().replace(/:/g, '');
    const hatchId = `${uid}-hatch-resp`;
    const gradId = `${uid}-grad-resp`;

    const useArea = data.length > LINE_MODE_MIN_DAYS;

    const labelByKey = useMemo(() => {
        const map = new Map<string, string>();
        data.forEach((point) => map.set(point.dayKey, point.label || formatDayLabel(point.dayKey)));
        return map;
    }, [data]);

    const partialPoint = data.find((point) => point.isPartial) ?? null;
    const totalResponses = useMemo(
        () => data.reduce((acc, point) => acc + point.responses, 0),
        [data],
    );
    /*
     * Hari-survei BOLEH dijumlahkan — satu survei yang tayang tujuh hari memang
     * tujuh ember. Ini penyebut yang sama dengan `core.survey_days` di RPC, dan
     * kesamaan itu diverifikasi (172 = 172 pada rentang 30 hari produksi).
     */
    const totalSurveyDays = useMemo(
        () => data.reduce((acc, point) => acc + point.surveys, 0),
        [data],
    );

    const dataKey = metric === 'total' ? 'responses' : 'perSurvey';
    const valueOf = (point: RespondentDailyPoint) =>
        metric === 'total' ? point.responses : point.perSurvey;

    /** Hanya batang TERTINGGI yang diberi label langsung — bukan angka di tiap titik. */
    const peakIndex = useMemo(() => {
        let best = -1;
        let bestValue = 0;
        data.forEach((point, index) => {
            const value = metric === 'total' ? point.responses : point.perSurvey;
            if (value > bestValue) {
                bestValue = value;
                best = index;
            }
        });
        return best;
    }, [data, metric]);

    /*
     * 300, bukan 272 seperti tab Revenue. Rail KPI di sebelahnya membawa LIMA tile
     * (Revenue cuma empat + hero) sehingga ia yang menentukan tinggi baris; tanpa
     * tambahan ini kartu grafik menyisakan ±106 px kosong DI DALAM border, yang
     * terbaca seperti gagal render. Ruangnya sudah ada — dipakai untuk plot.
     */
    const chartHeight = isWide ? 300 : 224;

    const handleMove = (state: any) => {
        const raw = state?.activeTooltipIndex ?? state?.activeIndex;
        const index = typeof raw === 'string' ? Number(raw) : raw;
        setActiveIndex(Number.isInteger(index) ? (index as number) : null);
    };
    const handleLeave = () => setActiveIndex(null);

    const cellOpacity = (point: RespondentDailyPoint, index: number): number => {
        if (point.isPartial) return PARTIAL_DAY_OPACITY;
        if (activeIndex === null) return 1;
        return index === activeIndex ? 1 : DIMMED_OPACITY;
    };

    const renderTooltip = (props: any) => {
        const point: RespondentDailyPoint | undefined = props?.payload?.[0]?.payload;
        if (!props?.active || !point) return null;
        return (
            <div className="rounded-md border bg-white px-3 py-2 shadow-md" style={{ borderColor: CHART.grid }}>
                <p className="text-[12px] font-semibold" style={{ color: INK.primary }}>
                    {formatDayLabelLong(point.dayKey)}
                </p>
                {/* Jendela siklusnya ditulis apa adanya: tanpa baris ini "14 Agustus"
                    terbaca sebagai tanggal kalender, dan pembaca akan mengadu angkanya
                    dengan tab Revenue yang memang memakai tanggal kalender. */}
                <p className="text-[11px]" style={{ color: INK.muted }}>
                    hari tayang 15:00 → {nextDayLabel(point.dayKey)} 15:00 WIB
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[12px]" style={{ color: INK.secondary }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART.accent }} aria-hidden="true" />
                    Respons
                    <strong className="ml-auto pl-3 font-semibold tabular-nums" style={{ color: INK.primary }}>
                        {formatCount(point.responses)}
                    </strong>
                </p>
                {/* Tanpa titik warna: ia BUKAN seri kedua di grafik ini, cuma keterangan
                    hari itu. Memberinya swatch akan mengundang mata mencarinya di plot. */}
                <p className="mt-1 flex items-center gap-1.5 text-[12px]" style={{ color: INK.secondary }}>
                    Responden unik
                    <strong className="ml-auto pl-3 font-semibold tabular-nums" style={{ color: INK.primary }}>
                        {formatCount(point.respondents)}
                    </strong>
                </p>
                {/*
                  Dua baris ini yang menjawab "kenapa batang hari ini lebih tinggi":
                  hampir selalu karena survei yang tayang lebih banyak, bukan karena
                  tiap survei berkinerja lebih baik. Keduanya selalu tampil, di mode
                  mana pun, supaya angka mentah tidak pernah dibaca tanpa penyebutnya.
                */}
                <p
                    className="mt-1.5 flex items-center gap-1.5 border-t pt-1.5 text-[12px]"
                    style={{ color: INK.secondary, borderColor: CHART.grid }}
                >
                    {/* Survei yang BENAR-BENAR TAYANG di siklus ini, bukan sekadar
                        "menerima respons": halaman tetap bisa dibuka lewat tautan langsung
                        setelah iklannya tutup, jadi ia masih kejatuhan satu-dua jawaban
                        susulan. RPC menyaringnya (jebakan 2d di sql/67); angka ini karena
                        itu cocok dengan papan Jadwal. Respons susulannya TETAP terhitung
                        di baris Respons di atas — yang dibuang hanya penyebutnya. */}
                    Survei tayang
                    <strong className="ml-auto pl-3 font-semibold tabular-nums" style={{ color: INK.primary }}>
                        {formatCount(point.surveys)}
                    </strong>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[12px]" style={{ color: INK.secondary }}>
                    Rata-rata per survei
                    <strong className="ml-auto pl-3 font-semibold tabular-nums" style={{ color: INK.primary }}>
                        {formatCount(point.perSurvey)}
                    </strong>
                </p>
                {point.isPartial && (
                    <p className="mt-1.5 text-[11px]" style={{ color: INK.muted }}>
                        Hari tayang berjalan — belum selesai
                    </p>
                )}
            </div>
        );
    };

    /**
     * Penanda "hari berjalan". PUTUS-PUTUS, bukan solid: solid 2px di tepi kanan
     * panel terbaca sebagai bingkai area plot, bukan anotasi. Ia berdiri sendiri
     * dan tidak menumpang mark — setiap pagi hari berjalan masih bernilai nol.
     */
    const renderPartialMarker = () =>
        partialPoint ? (
            <ReferenceLine
                x={partialPoint.dayKey}
                stroke={CHART.axis}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                ifOverflow="extendDomain"
            />
        ) : null;

    const renderPeakLabel = (props: any) => {
        if (props?.index !== peakIndex || peakIndex < 0) return null;
        const { x, y, width } = props;
        if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number') return null;
        return (
            <text x={x + width / 2} y={y - 7} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK.primary}>
                {formatCount(data[peakIndex] ? valueOf(data[peakIndex]) : 0)}
            </text>
        );
    };

    return (
        <Card className={className} style={{ borderColor: CHART.grid }}>
            <CardHeader className="pb-3">
                {/* Baris judul dibuat di dalam SATU anak `CardHeader`: `styles.css`
                    men-declare `.flex-col` lagi SETELAH Tailwind, jadi `flex-row` di
                    elemen yang sama akan kalah dan tata letaknya menumpuk vertikal. */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <CardTitle className="text-base font-semibold" style={{ color: INK.primary }}>
                            Respons Masuk
                        </CardTitle>
                        <CardDescription className="mt-1 text-[13px]">
                            {rangeLabel} · hari tayang 15:00 → 15:00 WIB
                        </CardDescription>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                        {/* Sakelar SATUAN, bukan sakelar bentuk grafik. Batang tetap
                            batang; yang berganti adalah apa yang diukur tingginya. */}
                        <TogglePicker<Metric>
                            ariaLabel="Satuan batang"
                            value={metric}
                            onChange={setMetric}
                            options={[
                                { value: 'total', label: 'Total', title: 'Jumlah respons apa adanya' },
                                {
                                    value: 'perSurvey',
                                    label: 'Per survei',
                                    title: 'Respons dibagi jumlah survei yang tayang hari itu',
                                },
                            ]}
                        />
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
                {/* Satu seri saja — legend-nya ada bukan untuk membedakan warna,
                    melainkan untuk menerangkan penanda hari berjalan. */}
                <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <LegendKey
                        color={CHART.accent}
                        label={metric === 'total' ? 'Respons' : 'Respons per survei'}
                    />
                    {partialPoint && (
                        <LegendKey
                            glyph="rule"
                            color={CHART.accent}
                            label={`${labelByKey.get(partialPoint.dayKey) ?? ''} — hari tayang berjalan`}
                        />
                    )}
                </div>

                {/*
                  Kalimat ini SENGAJA permanen, bukan disembunyikan di balik tooltip.
                  Ia menjawab pertanyaan yang pasti muncul begitu seseorang melihat
                  "9.337 responden unik" di rail sebelah lalu menjumlahkan batangnya
                  sendiri dan mendapat angka lain. Menyembunyikannya berarti membiarkan
                  orang menyimpulkan salah satu angkanya bohong.
                */}
                {view === 'chart' && data.length > 0 && (
                    <p className="mb-3 text-[12px] leading-snug" style={{ color: INK.muted }}>
                        {metric === 'total' ? (
                            <>
                                <span className="tabular-nums">{formatCount(totalResponses)}</span> respons — tinggi
                                batang menjumlah ke angka ini, tapi ia ikut naik-turun mengikuti{' '}
                                <strong className="font-semibold" style={{ color: INK.secondary }}>
                                    berapa survei yang tayang
                                </strong>{' '}
                                hari itu. Untuk membandingkan hari dengan hari, pakai &ldquo;Per survei&rdquo;.
                            </>
                        ) : (
                            <>
                                Rata-rata <span className="tabular-nums">{formatDecimal(perSurveyRate)}</span> respons
                                per survei per hari tayang, dari{' '}
                                <span className="tabular-nums">{formatCount(totalSurveyDays)}</span> hari-survei.
                                Tinggi batang di sini{' '}
                                <strong className="font-semibold" style={{ color: INK.secondary }}>
                                    rata-rata, bukan jumlah
                                </strong>{' '}
                                — jangan dijumlahkan.
                            </>
                        )}
                    </p>
                )}

                {/*
                  Peringatan TETAP, bukan hanya di tooltip. Sumbu X memakai nama tanggal
                  yang sama dengan tab Revenue ("18 Agu"), padahal jendelanya bergeser 15
                  jam — tanpa baris ini dua tab itu akan diadu langsung dan selisihnya
                  terbaca sebagai data yang tidak konsisten.
                */}
                {view === 'chart' && data.length > 0 && (
                    <p className="mb-3 text-[11px] leading-snug" style={{ color: INK.muted }}>
                        Satu batang = satu gelombang tayang (15:00 → 15:00 WIB), bukan tanggal kalender — iklan
                        berganti pukul 15:00, jadi satu tanggal kalender memuat dua gelombang.
                    </p>
                )}

                {data.length === 0 ? (
                    <p
                        className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm"
                        style={{ borderColor: CHART.grid, color: INK.muted }}
                    >
                        Belum ada respons pada rentang ini.
                    </p>
                ) : (
                    <div
                        // Refetch: tahan render sebelumnya pada opacity turun. Balik ke
                        // skeleton bikin layar melompat tiap kali periode diganti.
                        style={{ opacity: isRefetching ? 0.5 : 1, transition: 'opacity 160ms ease-out' }}
                        aria-busy={isRefetching}
                    >
                        {view === 'table' ? (
                            <TableView
                                data={data}
                                totalResponses={totalResponses}
                                uniqueRespondents={uniqueRespondents}
                                totalSurveyDays={totalSurveyDays}
                                perSurveyRate={perSurveyRate}
                            />
                        ) : (
                            <ResponsiveContainer width="100%" height={chartHeight}>
                                <ComposedChart
                                    data={data}
                                    margin={CHART_MARGIN}
                                    onMouseMove={handleMove}
                                    onMouseLeave={handleLeave}
                                    barCategoryGap="22%"
                                >
                                    <defs>
                                        {/* Mahkota `jfu.light`, badan `jfu.primary` di 45% —
                                            pusat massa visual batang — dasar `jfu.dark`. */}
                                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={GRADIENT.accentBright} />
                                            <stop offset="45%" stopColor={CHART.accent} />
                                            <stop offset="100%" stopColor={GRADIENT.accentDeep} />
                                        </linearGradient>
                                        <linearGradient id={`${gradId}-area`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={GRADIENT.accentBright} stopOpacity={0.34} />
                                            <stop offset="100%" stopColor={CHART.accent} stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <HatchDefs id={hatchId} color={CHART.accent} />

                                    {/* Horizontal saja, dan SOLID — `strokeDasharray` terbaca sebagai ambang. */}
                                    <CartesianGrid vertical={false} stroke={CHART.grid} strokeDasharray="0" />
                                    <XAxis
                                        dataKey="dayKey"
                                        padding={useArea ? { left: 4, right: 10 } : { left: 0, right: 0 }}
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
                                        allowDecimals={false}
                                        domain={[0, totalResponses > 0 ? 'auto' : 10]}
                                        tickFormatter={formatCountAxisTick}
                                        className="tabular-nums"
                                    />
                                    <Tooltip
                                        cursor={{ fill: CHART.contextSoft, fillOpacity: 0.55 }}
                                        content={renderTooltip}
                                        wrapperStyle={{ outline: 'none' }}
                                    />
                                    {renderPartialMarker()}

                                    {useArea ? (
                                        <Area
                                            type="linear"
                                            dataKey={dataKey}
                                            stroke={CHART.accent}
                                            strokeWidth={2}
                                            strokeLinejoin="round"
                                            strokeLinecap="round"
                                            fill={`url(#${gradId}-area)`}
                                            dot={false}
                                            activeDot={{ r: 3.5, fill: CHART.accent, stroke: '#ffffff', strokeWidth: 1.5 }}
                                            isAnimationActive={!reduceMotion}
                                            animationBegin={MOTION.barBegin}
                                            animationDuration={MOTION.barDuration}
                                            animationEasing={MOTION.easing}
                                        />
                                    ) : (
                                        <Bar
                                            dataKey={dataKey}
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
                                            <LabelList dataKey={dataKey} content={renderPeakLabel} />
                                        </Bar>
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function TableView({
    data,
    totalResponses,
    uniqueRespondents,
    totalSurveyDays,
    perSurveyRate,
}: {
    data: RespondentDailyPoint[];
    totalResponses: number;
    uniqueRespondents: number;
    totalSurveyDays: number;
    perSurveyRate: number;
}) {
    return (
        // Konten lebar dapat scroll-nya SENDIRI; body halaman tidak pernah ikut
        // menggeser ke samping di 375px.
        <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-[13px]">
                <caption className="sr-only">
                    Respons, responden unik, survei yang tayang, dan rata-rata per survei — per hari tayang (15:00 → 15:00 WIB)
                </caption>
                <thead>
                    <tr style={{ color: INK.muted }}>
                        <th scope="col" className="py-2 text-left font-medium">Hari tayang</th>
                        <th scope="col" className="py-2 text-right font-medium">Respons</th>
                        <th scope="col" className="py-2 text-right font-medium">Responden unik</th>
                        <th scope="col" className="py-2 text-right font-medium">Survei</th>
                        <th scope="col" className="py-2 text-right font-medium">Per survei</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((point) => (
                        <tr key={point.dayKey} style={{ borderTop: `1px solid ${CHART.grid}` }}>
                            <th scope="row" className="py-1.5 text-left font-normal" style={{ color: INK.secondary }}>
                                {point.label || formatDayLabel(point.dayKey)}
                                {point.isPartial && (
                                    <span className="ml-1.5 text-[11px]" style={{ color: INK.muted }}>
                                        (berjalan)
                                    </span>
                                )}
                            </th>
                            <td className="py-1.5 text-right tabular-nums" style={{ color: INK.primary }}>
                                {formatCount(point.responses)}
                            </td>
                            <td className="py-1.5 text-right tabular-nums" style={{ color: INK.primary }}>
                                {formatCount(point.respondents)}
                            </td>
                            <td className="py-1.5 text-right tabular-nums" style={{ color: INK.secondary }}>
                                {formatCount(point.surveys)}
                            </td>
                            <td className="py-1.5 text-right tabular-nums" style={{ color: INK.primary }}>
                                {formatCount(point.perSurvey)}
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
                            {formatCount(totalResponses)}
                        </td>
                        {/*
                          Dua sel di bawah SENGAJA bukan jumlah kolomnya, dan itu ditulis
                          di selnya sendiri supaya pembaca yang menjumlah sendiri langsung
                          tahu kenapa hasilnya beda. Responden unik dihitung sekali atas
                          seluruh rentang (menjumlahkan kolomnya memberi 16.680 untuk
                          rentang yang uniknya 9.337); "per survei" adalah laju tertimbang
                          total respons / total hari-survei, bukan rata-rata kolom.
                        */}
                        <td className="py-2 text-right font-semibold tabular-nums" style={{ color: INK.primary }}>
                            {formatCount(uniqueRespondents)}
                            <span className="ml-1 block text-[10px] font-normal leading-tight" style={{ color: INK.muted }}>
                                bukan jumlah kolom
                            </span>
                        </td>
                        {/* Kolom survei JUSTRU boleh dijumlahkan: satu survei yang tayang
                            tujuh hari memang tujuh hari-survei, dan itulah penyebutnya. */}
                        <td className="py-2 text-right font-semibold tabular-nums" style={{ color: INK.secondary }}>
                            {formatCount(totalSurveyDays)}
                            <span className="ml-1 block text-[10px] font-normal leading-tight" style={{ color: INK.muted }}>
                                hari-survei
                            </span>
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums" style={{ color: INK.primary }}>
                            {formatDecimal(perSurveyRate)}
                            <span className="ml-1 block text-[10px] font-normal leading-tight" style={{ color: INK.muted }}>
                                tertimbang
                            </span>
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
}

export default DailyRespondentsChart;
