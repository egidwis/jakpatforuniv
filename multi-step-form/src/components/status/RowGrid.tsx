import type { ReactNode } from 'react';

/**
 * Warna kolom value (kanan). Kartu yang masih menunggu review diredam jadi
 * abu-abu bersama labelnya: angkanya memang sudah final sejak checkout, tapi
 * belum mengikat apa pun sampai admin menyetujui — jangan tampil setegas kartu
 * yang sudah berjalan. Dipakai di semua titik yang dulu hardcode `#1a1a1a`,
 * supaya tidak ada value yang ketinggalan hitam sendirian.
 */
export const valueTone = (muted?: boolean) => (muted ? 'text-slate-400' : 'text-slate-900');

export interface RowDef {
    key: string;
    icon: ReactNode;
    label: string;
    value: ReactNode;
}

/**
 * Baris data gaya kuitansi: SATU pasangan label:value per baris di semua
 * viewport. Kolom label adaptif di mobile dan fixed 9.5rem di desktop.
 *
 * Dipakai bersama oleh Fase ① (identitas survei) dan Fase ② (rincian booking) —
 * dulu Fase ① punya salinan sendiri dengan warna `#888`/`gray-900` yang menyimpang
 * dari palet slate di sini.
 */
export function RowGrid({ rows, muted }: { rows: RowDef[]; muted?: boolean }) {
    if (rows.length === 0) return null;
    /* Ponsel: label DI ATAS, nilai di bawahnya, selebar penuh. Dua kolom di layar 380px menyisakan
       ±35% lebar untuk nilai — "@Rp 25.000 · 2 winner" dan rincian biaya terpotong/membungkus per
       kata. Mulai `sm` kembali ke dua kolom gaya kuitansi.

       ⚠️ Semua `display` ditulis sebagai properti arbitrer (`[display:grid]`, `sm:[display:contents]`):
       `.grid`/`.grid-cols-1`/`.contents` di styles.css dimuat setelah Tailwind dan mengalahkan
       varian responsifnya — lihat catatan cascade di proyek ini. */
    return (
        <dl className="[display:grid] grid-cols-[minmax(0,1fr)] sm:grid-cols-[9.5rem_1fr] gap-y-3 sm:gap-x-3 sm:gap-y-2.5 items-start">
            {rows.map((row) => (
                <div key={row.key} className="[display:grid] gap-0.5 min-w-0 sm:[display:contents]">
                    <dt className="flex items-center gap-1.5 text-xs text-slate-500 font-medium whitespace-nowrap sm:pt-0.5 sm:pr-1">
                        <span className="text-slate-400 shrink-0">{row.icon}</span>
                        {row.label}
                    </dt>
                    <dd className={`text-sm font-semibold min-w-0 break-words ${valueTone(muted)}`}>{row.value}</dd>
                </div>
            ))}
        </dl>
    );
}
