import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMediaQuery } from '@/lib/utils';
import type { RankedRow } from '@/utils/analytics/types';
import { CHART, INK } from './palette';
import { RankedBarRows } from './RankedBarList';
import { TogglePicker } from './TogglePicker';

/**
 * Beberapa daftar peringkat sejenis dalam SATU kartu bertab.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  KENAPA DILEBUR, DAN APA YANG DITUKAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Revenue per Universitas", "Top Jurusan", dan "Top Individual Spenders" menjawab
 * satu pertanyaan yang sama — *siapa yang membelanjakan uangnya* — dengan tiga
 * potongan berbeda. Sebagai tiga kartu berdampingan, ketiganya berebut lebar: tiap
 * daftar dapat sepertiga kolom, dan batang terpanjangnya menciut jadi pita tipis.
 *
 * Sebagai satu kartu bertab, daftar yang tampil mendapat SELURUH lebar kartu.
 * Yang ditukar nyata: dua potongan lain jadi tak terlihat sekaligus, sehingga
 * Universitas dan Jurusan tidak lagi bisa dibandingkan berdampingan.
 *
 * ⚠️ `contextOnlyNames`, `footnote`, dan `subtitle` WAJIB per tab, bukan per kartu.
 * Catatan normalisasi nama ("UNJ, UI dan BINUS tersebar di beberapa ejaan") hanya
 * benar untuk tab Universitas; ikut tampil di tab Jurusan ia jadi klaim yang salah
 * tentang data yang sedang dilihat.
 */

export interface RankedTab {
    /** Kunci stabil, dipakai juga untuk `id` ARIA. */
    id: string;
    /** Label tab. Pendek — ini bersaing dengan judul kartu. */
    label: string;
    rows: RankedRow[];
    /** Baris konteks di bawah judul kartu. Berganti mengikuti tab. */
    subtitle?: ReactNode;
    /** Keterangan di kaki daftar. Berganti mengikuti tab. */
    footnote?: ReactNode;
    contextOnlyNames?: string[];
    valueFormatter?: (value: number) => string;
    showShare?: boolean;
    showOrders?: boolean;
    emptyMessage?: string;
}

export interface RankedTabsCardProps {
    title: string;
    tabs: RankedTab[];
    /**
     * Berapa banyak aksen yang boleh diklaim kartu ini. Default `top`.
     *
     * Kartu satelit yang sempit memakai `hover-only` supaya tidak ada tujuh kartu yang
     * sama-sama mengklaim aksen. Kartu INI berbeda: ia fokus kedua halaman, selebar
     * dua pertiga baris, dan baris teratasnya memang temuannya. Dengan `hover-only`
     * seluruh isinya abu sampai disentuh — biru JFU tidak muncul sama sekali di kartu
     * terbesar kedua di layar.
     */
    emphasis?: 'top' | 'hover-only' | 'none';
    /** Tab yang aktif saat pertama render. Default: tab pertama. */
    defaultTabId?: string;
    ariaLabel?: string;
    className?: string;
}

export function RankedTabsCard({
    title,
    tabs,
    emphasis = 'top',
    defaultTabId,
    ariaLabel = 'Pilih rincian peringkat',
    className = '',
}: RankedTabsCardProps) {
    const [activeId, setActiveId] = useState(defaultTabId ?? tabs[0]?.id ?? '');
    const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
    // `useId` bisa memuat titik dua, yang tidak sah di dalam selector `querySelector`.
    const idBase = `ranked-tabs-${useId().replace(/:/g, '')}`;

    const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
    if (!active) return null;

    return (
        <Card className={className} style={{ borderColor: CHART.grid }}>
            <CardHeader className="pb-3">
                {/*
                  Judul dan tab dibuat di dalam SATU anak `CardHeader`, bukan dengan
                  menimpa `flex-col` bawaannya: `styles.css` men-declare `.flex-col`
                  lagi SETELAH Tailwind, jadi `flex-row` di elemen yang sama akan
                  kalah dan tata letaknya diam-diam kembali menumpuk vertikal.
                */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <CardTitle className="text-base font-semibold" style={{ color: INK.primary }}>
                            {title}
                        </CardTitle>
                        {active.subtitle && (
                            <CardDescription className="mt-1 text-[13px]">
                                {active.subtitle}
                            </CardDescription>
                        )}
                    </div>
                    <TogglePicker
                        mode="tabs"
                        idBase={idBase}
                        ariaLabel={ariaLabel}
                        value={active.id}
                        onChange={setActiveId}
                        options={tabs.map((t) => ({ value: t.id, label: t.label }))}
                    />
                </div>
            </CardHeader>

            <CardContent className="pt-0">
                <div
                    id={`${idBase}-panel`}
                    role="tabpanel"
                    aria-labelledby={`${idBase}-tab-${active.id}`}
                    tabIndex={0}
                    /*
                      `key` memaksa remount tiap ganti tab, jadi animasi masuknya
                      terputar ulang. Tanpa ini React mempertahankan node-nya dan
                      pergantian daftarnya terjadi tanpa isyarat apa pun — di kartu
                      yang isinya berubah total, itu terbaca seperti layar yang loncat.
                    */
                    key={reduceMotion ? undefined : active.id}
                    className={
                        reduceMotion
                            ? 'focus-visible:outline-none'
                            : 'animate-in fade-in slide-in-from-bottom-1 duration-200 focus-visible:outline-none'
                    }
                >
                    <RankedBarRows
                        rows={active.rows}
                        contextOnlyNames={active.contextOnlyNames}
                        valueFormatter={active.valueFormatter}
                        showShare={active.showShare}
                        showOrders={active.showOrders}
                        footnote={active.footnote}
                        emptyMessage={active.emptyMessage}
                        emphasis={emphasis}
                    />
                </div>
            </CardContent>
        </Card>
    );
}

export default RankedTabsCard;
