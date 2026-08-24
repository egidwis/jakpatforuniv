import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CustomerSegment } from '@/utils/analytics/types';
import { CHART, INK, emphasisFill } from './palette';
import { formatCount, formatIDRCompact, formatPercent } from './format';

/**
 * Customer baru vs repeat: dua batang, satu skala.
 *
 * ## Kenapa dua batang dan bukan donat dua irisan
 *
 * Dua irisan pie adalah satu angka yang dipaksa jadi gambar — sudut lebih sulit
 * dibandingkan daripada panjang, dan di sini yang ditanya justru "seberapa jauh
 * bedanya", bukan "berapa bagiannya dari satu lingkaran".
 *
 * Kedua batang memakai satu skala yang sama (nilai terbesar = penuh), jadi
 * perbandingannya dibaca langsung. Satu segmen memakai `accent` sebagai pokok
 * bahasan, satunya `context` — bukan dua hue kategorikal, karena keduanya bukan
 * dua identitas setara melainkan satu cerita: sedikit customer repeat menyumbang
 * porsi revenue yang tidak sebanding dengan jumlahnya.
 */

const SEGMENT_LABEL: Record<CustomerSegment['segment'], string> = {
    new: 'Baru',
    repeat: 'Repeat',
};

export interface SegmentCardProps {
    /** Biasanya dua entri: `new` dan `repeat`. Urutan render mengikuti urutan ini. */
    segments: CustomerSegment[];
    /** Segmen yang jadi pokok bahasan. Default `repeat` — di situ ceritanya. */
    emphasize?: CustomerSegment['segment'];
    /** Kalimat kesimpulan di kaki kartu. Default: diturunkan dari `segments`. */
    insight?: ReactNode;
    className?: string;
}

function buildInsight(segments: CustomerSegment[]): ReactNode {
    const repeat = segments.find((s) => s.segment === 'repeat');
    const fresh = segments.find((s) => s.segment === 'new');
    if (!repeat || !fresh) return null;

    const totalRevenue = repeat.revenue + fresh.revenue;
    const totalCustomers = repeat.customers + fresh.customers;
    if (totalRevenue <= 0 || totalCustomers <= 0) return null;

    /*
     * Rentang yang SELURUH customer-nya baru itu wajar (periode pendek, atau bulan
     * pertama sebuah kanal). Tanpa cabang ini kalimatnya jadi "0% revenue datang
     * dari 0 customer repeat (0% dari basis)" — tiga angka nol yang tidak
     * memberi tahu apa pun. Guard `totalRevenue <= 0` di atas tidak menangkapnya:
     * revenue-nya ada, yang nol cuma sisi repeat-nya.
     */
    if (repeat.customers === 0) {
        return (
            <>
                Belum ada <strong className="font-semibold" style={{ color: INK.primary }}>customer repeat</strong> di
                rentang ini — {formatCount(fresh.customers)} customer yang bayar semuanya baru pertama kali.
            </>
        );
    }

    const revenueShare = formatPercent(repeat.revenue / totalRevenue, 0);
    const customerShare = formatPercent(repeat.customers / totalCustomers, 0);
    const lift = fresh.aov > 0 ? repeat.aov / fresh.aov - 1 : null;

    return (
        <>
            <strong className="font-semibold" style={{ color: INK.primary }}>
                {revenueShare} revenue
            </strong>{' '}
            datang dari {formatCount(repeat.customers)} customer repeat ({customerShare} dari basis)
            {lift !== null && lift > 0 && <> · AOV mereka {formatPercent(lift, 0)} lebih tinggi</>}.
        </>
    );
}

export function SegmentCard({
    segments,
    emphasize = 'repeat',
    insight,
    className = '',
}: SegmentCardProps) {
    const max = segments.reduce((acc, s) => Math.max(acc, s.revenue), 0);
    const resolvedInsight = insight ?? buildInsight(segments);

    return (
        <Card className={className} style={{ borderColor: CHART.grid }}>
            <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold" style={{ color: INK.primary }}>
                    Baru vs Repeat Customer
                </CardTitle>
                <CardDescription className="text-[13px]">Revenue & AOV per segmen, dalam rentang terpilih</CardDescription>
            </CardHeader>

            <CardContent className="pt-0">
                {segments.length === 0 ? (
                    <p className="py-8 text-center text-sm" style={{ color: INK.muted }}>
                        Belum ada customer yang membayar pada rentang ini.
                    </p>
                ) : (
                    <ul className="space-y-5">
                        {segments.map((segment) => {
                            const widthPct = max > 0 ? (segment.revenue / max) * 100 : 0;
                            return (
                                <li key={segment.segment} className="min-w-0">
                                    <div className="flex items-baseline justify-between gap-3">
                                        <span className="text-[13px] font-medium" style={{ color: INK.primary }}>
                                            {SEGMENT_LABEL[segment.segment]}
                                        </span>
                                        <span
                                            className="text-[13px] font-semibold tabular-nums"
                                            style={{ color: INK.primary }}
                                        >
                                            {formatIDRCompact(segment.revenue, { decimals: 2 })}
                                        </span>
                                    </div>

                                    <div className="mt-1.5 h-2 w-full">
                                        <div
                                            className="h-2 rounded-r-[4px]"
                                            style={{
                                                width: `${Math.max(widthPct, segment.revenue > 0 ? 1.5 : 0)}%`,
                                                backgroundColor: emphasisFill(segment.segment === emphasize),
                                            }}
                                        />
                                    </div>

                                    <p className="mt-1.5 text-[12px]" style={{ color: INK.muted }}>
                                        {formatCount(segment.customers)} customer · {formatCount(segment.orders)} order · AOV{' '}
                                        {formatIDRCompact(segment.aov)}
                                    </p>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {resolvedInsight && (
                    <p
                        className="mt-5 border-t pt-3 text-[13px] leading-snug"
                        style={{ color: INK.secondary, borderColor: CHART.grid }}
                    >
                        {resolvedInsight}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

export default SegmentCard;
