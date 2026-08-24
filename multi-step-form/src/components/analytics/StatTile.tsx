import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { Delta } from '@/utils/analytics/types';
import { DELTA, INK } from './palette';
import { formatCount, formatPercentMagnitude } from './format';

/**
 * Satu angka KPI: label kecil, angka besar, dan pembanding periode sebelumnya.
 *
 * ## Kenapa delta dihitung ulang dari `current`/`previous`
 *
 * `Delta.pctChange` tidak menyebutkan satuannya — 0,342 atau 34,2 sama-sama bisa
 * dibaca "34,2%", dan salah tebak berarti layar menampilkan "3420%" tanpa ada
 * yang error. `current` dan `previous` tidak punya ambiguitas itu, jadi persennya
 * diturunkan di sini. `pctChange` tetap ada di kontrak untuk konsumen lain.
 *
 * ## Kenapa panah + label, bukan warna saja
 *
 * Merah/hijau adalah satu-satunya kanal yang hilang total untuk pembaca
 * deuteranopia. Arah perubahan karena itu selalu dibawa tiga kali: ikon panah,
 * kata ("naik"/"turun", lewat `aria-label`), dan baru warna sebagai penguat.
 */

export interface StatTileProps {
    /** Label kecil di atas angka. Kalimat pendek, tanpa titik dua. */
    label: string;
    /** Angka utama, SUDAH diformat oleh pemanggil (`formatIDR`, `formatCount`, …). */
    value: string;
    /** Pembanding periode sebelumnya. `null`/undefined → baris delta tidak dirender. */
    delta?: Delta | null;
    /**
     * `percent` (default) → "▲ 25,0%".
     * `absolute` → "▲ 2 customer" — dipakai saat basisnya kecil dan persen jadi
     * berisik (2 dari 10 customer bukan cerita "naik 20%").
     * `points` → "▲ 17,1 poin" — WAJIB dipakai kalau `value`-nya sendiri sudah
     * persen. 2,1% yang naik ke 19,2% adalah kenaikan 17,1 POIN; menyebutnya
     * "naik 814%" secara teknis benar tapi tak seorang pun membacanya begitu.
     */
    deltaMode?: 'percent' | 'absolute' | 'points';
    /** Satuan untuk `deltaMode="absolute"`, mis. "order". */
    deltaUnit?: string;
    /** Ekor kalimat delta. Default "vs periode sebelumnya". */
    comparisonLabel?: string;
    /** Untuk metrik yang justru bagus kalau turun (mis. tagihan tertunggak). */
    higherIsBetter?: boolean;
    /** Baris keterangan di bawah angka — rincian, bukan pengulangan label. */
    caption?: ReactNode;
    /** Ukuran hero (≥40px). Pakai maksimal satu per layar. */
    hero?: boolean;
    className?: string;
}

interface DeltaView {
    direction: 'up' | 'down' | 'flat';
    text: string;
    tone: 'positive' | 'negative' | 'neutral';
}

function buildDeltaView(
    delta: Delta,
    mode: 'percent' | 'absolute' | 'points',
    unit: string | undefined,
    higherIsBetter: boolean,
): DeltaView | null {
    const diff = delta.current - delta.previous;
    const direction: DeltaView['direction'] = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const isGood = direction === 'flat' ? null : (direction === 'up') === higherIsBetter;
    const tone: DeltaView['tone'] = isGood === null ? 'neutral' : isGood ? 'positive' : 'negative';

    // Selisihnya SUDAH dalam satuan fraksi (0,171), jadi cukup dijadikan persen —
    // jangan dibagi `previous` lagi seperti mode `percent`.
    if (mode === 'points') {
        return { direction, tone, text: `${formatPercentMagnitude(diff)} poin` };
    }

    if (mode === 'absolute') {
        const magnitude = formatCount(Math.abs(diff));
        return { direction, tone, text: unit ? `${magnitude} ${unit}` : magnitude };
    }

    // Pembagi nol tidak menghasilkan "∞%" di layar — periode sebelumnya yang
    // kosong itu fakta tersendiri, jadi dikatakan dengan kata.
    if (delta.previous === 0) {
        if (diff === 0) return { direction: 'flat', tone: 'neutral', text: 'tidak ada data pembanding' };
        return { direction, tone, text: 'periode sebelumnya kosong' };
    }
    return { direction, tone, text: formatPercentMagnitude(diff / delta.previous) };
}

const TONE_COLOR: Record<DeltaView['tone'], string> = {
    positive: DELTA.positive,
    negative: DELTA.negative,
    neutral: INK.muted,
};

const DIRECTION_WORD: Record<DeltaView['direction'], string> = {
    up: 'naik',
    down: 'turun',
    flat: 'tidak berubah',
};

export function StatTile({
    label,
    value,
    delta,
    deltaMode = 'percent',
    deltaUnit,
    comparisonLabel = 'vs periode sebelumnya',
    higherIsBetter = true,
    caption,
    hero = false,
    className = '',
}: StatTileProps) {
    const view = delta ? buildDeltaView(delta, deltaMode, deltaUnit, higherIsBetter) : null;
    const Arrow = view?.direction === 'up' ? ArrowUpRight : view?.direction === 'down' ? ArrowDownRight : Minus;

    return (
        <div className={`min-w-0 ${className}`}>
            <p
                className="text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: INK.muted }}
            >
                {label}
            </p>

            {/*
              Figur proporsional, BUKAN `tabular-nums`. Lebar digit yang dipaksa
              sama bikin angka besar seperti "15" terlihat renggang; tabular hanya
              dipakai di kolom yang harus lurus ke bawah (tabel & tick sumbu).
            */}
            {/*
              Non-hero turun ke 22px di bawah `sm`.
              
              Rail KPI jadi grid 2 kolom di mobile, dan kotak angkanya cuma 139px di
              375px. Terukur pada 26px: "Rp 3.787.300" (PPN sebulan, angka produksi
              nyata) memakan 153px — melimpah 14px keluar kotaknya, menabrak tile
              sebelah. "Rp 587.958" pun cuma sisa 6px. Pada 22px keduanya muat dengan
              lega, dan nilai sampai 8 digit ("Rp 12.345.678", 142px) masih hampir pas.
              Angka hero tidak ikut turun — ia selebar penuh, jadi tidak pernah sempit.
            */}
            <p
                className={`mt-1.5 font-semibold leading-[1.05] tracking-tight ${hero ? 'text-[40px] sm:text-[46px]' : 'text-[22px] sm:text-[26px]'
                    }`}
                style={{ color: INK.primary, fontVariantNumeric: 'proportional-nums' }}
            >
                {value}
            </p>

            {view && (
                <p
                    className="mt-2 flex items-center gap-1 text-[13px] font-medium"
                    style={{ color: TONE_COLOR[view.tone] }}
                    aria-label={`${DIRECTION_WORD[view.direction]} ${view.text} ${comparisonLabel}`}
                >
                    <Arrow className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{view.text}</span>
                    <span className="font-normal" style={{ color: INK.muted }}>
                        {comparisonLabel}
                    </span>
                </p>
            )}

            {caption && (
                <p className="mt-1.5 text-[13px] leading-snug" style={{ color: INK.secondary }}>
                    {caption}
                </p>
            )}
        </div>
    );
}

export default StatTile;
