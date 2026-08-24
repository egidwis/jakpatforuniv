import { useId, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMediaQuery } from '@/lib/utils';
import { VOUCHER_CATALOG, isVoucherActive, type VoucherCatalogEntry } from '@/utils/cost-calculator';
import { CHART, DELTA, INK } from './palette';
import { formatCount, formatWibDate } from './format';
import { TogglePicker } from './TogglePicker';

/**
 * Katalog voucher — DITURUNKAN dari `cost-calculator.ts`, tidak ditulis tangan.
 *
 * ## Kenapa ini penting, dengan buktinya
 *
 * Kartu ini menggantikan tabel `<TableRow>` yang isinya diketik langsung di JSX.
 * Tabel itu sudah menyimpang dari kode yang benar-benar berjalan, dan tak ada yang
 * tahu selama berbulan-bulan karena tidak ada satu pun tempat yang membandingkan
 * keduanya (terukur produksi 2026-08-24):
 *
 *   • JFUSUHUD — penghasil revenue TERBESAR (Rp 7,61jt, 22 pemakaian, 19,2% dari
 *     seluruh revenue Agustus) — tidak terdaftar di tabel itu sama sekali.
 *   • JAKPATUNIV2025 dicoret "EXPIRED" tanpa menyebut ia penghasil revenue nomor
 *     dua sepanjang masa (Rp 8,59jt).
 *   • PPISWEDIA dipajang "berlaku sampai 30 Juni 2026" — dua bulan lewat.
 *
 * Karena statusnya kini dihitung dari `Date.now()` terhadap konstanta yang SAMA
 * dengan yang dipakai `calculateDiscount()`, kartu ini tidak bisa basi lagi:
 * JFUSUHUD berpindah sendiri ke tab "Berakhir" pada 1 September 2026, tanpa satu
 * baris kode pun diubah.
 *
 * ⚠️ `validUntil: null` BUKAN "berlaku selamanya sesuai promosi" — ia berarti
 * kodenya tidak menegakkan batas apa pun. PPISWEDIA persis begitu: materinya
 * menyebut 30 Juni 2026, tapi `calculateDiscount()` masih memberi diskon 20% hari
 * ini. Selisih itu ditulis apa adanya di `note`, bukan dirapikan jadi "berakhir".
 */

/** Di bawah ini voucher dianggap segera mati dan diberi peringatan. */
const EXPIRING_SOON_DAYS = 14;
const DAY_MS = 86_400_000;
/** Baris yang tampil sebelum "Lihat semua" — kartu ini kini berbagi baris
 * dengan dua kartu lain, jadi daftar penuh (19 kode) tidak boleh mendorong
 * tinggi seluruh baris. */
const COLLAPSED_ROWS = 5;

type CatalogTab = 'active' | 'ended';

export interface VoucherCatalogCardProps {
    /**
     * Pemakaian kode di rentang terpilih — dari `CampaignAnalytics.voucher.byOrders`.
     * Kode yang tidak muncul di peta ini tidak diberi keterangan apa pun; "0×"
     * eksplisit di sebelah dua belas kode ambassador cuma jadi kolom nol.
     */
    usageByCode?: Map<string, number>;
    /** Jam mesin — disuntik di tes supaya status tidak berubah tiap hari. */
    now?: Date;
    className?: string;
}

function daysLeft(entry: VoucherCatalogEntry, atMs: number): number | null {
    if (!entry.validUntil) return null;
    const end = Date.parse(entry.validUntil);
    if (Number.isNaN(end)) return null;
    return Math.ceil((end - atMs) / DAY_MS);
}

export function VoucherCatalogCard({
    usageByCode,
    now = new Date(),
    className = '',
}: VoucherCatalogCardProps) {
    const [tab, setTab] = useState<CatalogTab>('active');
    const [expanded, setExpanded] = useState(false);
    const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    const idBase = `voucher-catalog-${useId().replace(/:/g, '')}`;
    const atMs = now.getTime();

    const { active, ended } = useMemo(() => {
        const live: VoucherCatalogEntry[] = [];
        const dead: VoucherCatalogEntry[] = [];
        for (const entry of VOUCHER_CATALOG) {
            (isVoucherActive(entry, atMs) ? live : dead).push(entry);
        }
        // Yang paling cepat mati tampil lebih dulu — itu informasi yang punya
        // tenggat. Kode tanpa batas mengekor, urut abjad.
        live.sort((a, b) => {
            const da = daysLeft(a, atMs);
            const db = daysLeft(b, atMs);
            if (da === null && db === null) return a.code.localeCompare(b.code);
            if (da === null) return 1;
            if (db === null) return -1;
            return da - db;
        });
        dead.sort((a, b) => a.code.localeCompare(b.code));
        return { active: live, ended: dead };
    }, [atMs]);

    const rows = tab === 'active' ? active : ended;
    const visibleRows = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);
    const hiddenCount = rows.length - visibleRows.length;

    return (
        <Card className={className} style={{ borderColor: CHART.grid }}>
            <CardHeader className="pb-3">
                {/* Judul & tab dalam SATU anak `CardHeader` — `styles.css` men-declare
                    `.flex-col` lagi setelah Tailwind, jadi `flex-row` di elemen yang
                    sama akan kalah. Lihat catatan yang sama di `RankedTabsCard`. */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <CardTitle className="text-base font-semibold" style={{ color: INK.primary }}>
                            Katalog Voucher
                        </CardTitle>
                        <CardDescription className="mt-1 text-[13px]">
                            {tab === 'active'
                                ? `${active.length} kode masih memberi diskon hari ini`
                                : `${ended.length} kode sudah tidak berlaku`}
                        </CardDescription>
                    </div>
                    <TogglePicker<CatalogTab>
                        mode="tabs"
                        idBase={idBase}
                        ariaLabel="Pilih status voucher"
                        value={tab}
                        onChange={(next) => { setTab(next); setExpanded(false); }}
                        options={[
                            { value: 'active', label: 'Aktif' },
                            { value: 'ended', label: 'Berakhir' },
                        ]}
                    />
                </div>
            </CardHeader>

            <CardContent className="pt-0">
                <div
                    id={`${idBase}-panel`}
                    role="tabpanel"
                    aria-labelledby={`${idBase}-tab-${tab}`}
                    tabIndex={0}
                    key={reduceMotion ? undefined : tab}
                    className={
                        reduceMotion
                            ? 'focus-visible:outline-none'
                            : 'animate-in fade-in slide-in-from-bottom-1 duration-200 focus-visible:outline-none'
                    }
                >
                    {rows.length === 0 ? (
                        <p className="py-8 text-center text-sm" style={{ color: INK.muted }}>
                            Tidak ada kode di kelompok ini.
                        </p>
                    ) : (
                        <ul className="space-y-3.5">
                            {visibleRows.map((entry) => {
                                const left = daysLeft(entry, atMs);
                                const expiringSoon =
                                    tab === 'active' && left !== null && left <= EXPIRING_SOON_DAYS;
                                const used = usageByCode?.get(entry.code) ?? 0;
                                return (
                                    <li
                                        key={entry.code}
                                        className="border-t pt-3 first:border-t-0 first:pt-0"
                                        style={{ borderColor: CHART.grid }}
                                    >
                                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                            <span
                                                className="text-[13px] font-semibold"
                                                style={{
                                                    color: tab === 'active' ? INK.primary : INK.muted,
                                                }}
                                            >
                                                {entry.code}
                                            </span>
                                            {entry.internal && (
                                                <span
                                                    className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                                                    style={{ backgroundColor: CHART.contextSoft, color: INK.secondary }}
                                                >
                                                    Uji sistem
                                                </span>
                                            )}
                                            {used > 0 && (
                                                <span className="text-[12px] tabular-nums" style={{ color: INK.secondary }}>
                                                    dipakai {formatCount(used)}× di rentang ini
                                                </span>
                                            )}
                                        </div>

                                        <p className="mt-1 text-[12px] leading-snug" style={{ color: INK.secondary }}>
                                            {entry.terms}
                                        </p>

                                        {/* Tenggat dibawa TEKS, bukan hanya warna — peringatan
                                            yang cuma merah hilang total bagi pembaca deuteranopia. */}
                                        {entry.validUntil && (
                                            <p
                                                className="mt-1 text-[12px]"
                                                style={{ color: expiringSoon ? DELTA.negative : INK.muted }}
                                            >
                                                {tab === 'active'
                                                    ? `Berlaku s/d ${formatWibDate(new Date(Date.parse(entry.validUntil) - 1))}`
                                                    : `Berakhir ${formatWibDate(new Date(Date.parse(entry.validUntil) - 1))}`}
                                                {expiringSoon && left !== null && (
                                                    <strong className="ml-1.5 font-semibold">
                                                        — tinggal {formatCount(left)} hari
                                                    </strong>
                                                )}
                                            </p>
                                        )}

                                        {entry.note && (
                                            <p className="mt-1 text-[12px] leading-snug" style={{ color: INK.muted }}>
                                                {entry.note}
                                            </p>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {hiddenCount > 0 && (
                        <button
                            type="button"
                            onClick={() => setExpanded(true)}
                            className="mt-3.5 text-[12px] font-semibold hover:underline focus-visible:outline-none focus-visible:underline"
                            style={{ color: CHART.accent }}
                        >
                            Lihat {formatCount(hiddenCount)} kode lainnya
                        </button>
                    )}
                    {expanded && rows.length > COLLAPSED_ROWS && (
                        <button
                            type="button"
                            onClick={() => setExpanded(false)}
                            className="mt-3.5 text-[12px] font-semibold hover:underline focus-visible:outline-none focus-visible:underline"
                            style={{ color: INK.muted }}
                        >
                            Tampilkan lebih sedikit
                        </button>
                    )}
                </div>

                <p
                    className="mt-5 border-t pt-3 text-[12px] leading-snug"
                    style={{ color: INK.muted, borderColor: CHART.grid }}
                >
                    Diturunkan langsung dari aturan di <code>cost-calculator.ts</code> — daftar ini
                    tidak bisa menyimpang dari kode yang menghitung diskonnya.
                </p>
            </CardContent>
        </Card>
    );
}

export default VoucherCatalogCard;
