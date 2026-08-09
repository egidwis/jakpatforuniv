import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isBookingClosedForDate, toLocalYmd } from '@/utils/airing-window';

// ─────────────────────────────────────────────────────────────
// Kalender kapasitas slot — SATU-SATUNYA di aplikasi ini.
//
// Sebelumnya ada tiga salinan (SchedulePaymentView, ExtendSection,
// RescheduleDialog) dan mereka TIDAK setuju satu sama lain: hanya salinan
// RescheduleDialog yang memanggil `isBookingClosedForDate`, jadi dua permukaan
// pemesanan lainnya mengizinkan admin memesan slot yang batas pesannya (13.00
// WIB) sudah lewat. Berkas ini diangkat dari salinan yang benar itu.
//
// ⚠️ JUMLAH KOLOM ADALAH PROP, BUKAN BREAKPOINT. Bentuk lamanya
// `grid-cols-4 sm:grid-cols-7` — dan `sm:` mengukur VIEWPORT, bukan lebar
// kontainer. Di layar desktop ia jadi 7 kolom walaupun hidup di dalam panel
// 480px, lalu menggulung mendatar. Pemanggil di drawer mengirim 4; dialog
// papan Schedule mengirim 7.
// ─────────────────────────────────────────────────────────────

/** Kolom yang punya kelas Tailwind statis — jangan disusun dari template string. */
const COLUMN_CLASS: Record<4 | 7, string> = {
  4: 'grid-cols-4',
  7: 'grid-cols-7',
};

export interface SlotCalendarProps {
  /** Hari yang ditawarkan, biasanya 14 hari ke depan. */
  days: Date[];
  /** Jumlah iklan yang sudah menempati tiap tanggal, dikunci YMD lokal. */
  counts: Record<string, number>;
  /** Kuota kolam yang sedang dilihat — reguler dan tambahan punya kolam sendiri. */
  quota: number;
  selectedYmd: string | null;
  /**
   * Hari yang akan ikut ditempati kalau mulai di `selectedYmd`.
   *
   * Hari-hari ini dihitung **+1** di angka yang ditampilkan: iklan 7 hari memakai
   * tujuh slot, bukan satu. Tanpa itu tile hari ke-2 dst. tetap berbunyi "0/4"
   * sementara pemesanan yang sedang disusun justru mengisinya, dan admin tidak
   * punya cara melihat bahwa ia akan melewati kuota sampai simpanannya ditolak.
   */
  coveredDays?: string[];
  onSelect: (ymd: string) => void;
  columns?: 4 | 7;
  isLoading?: boolean;
}

export function SlotCalendar({
  days,
  counts,
  quota,
  selectedYmd,
  coveredDays = [],
  onSelect,
  columns = 7,
  isLoading = false,
}: SlotCalendarProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className={cn('[display:grid] gap-2', COLUMN_CLASS[columns])}>
      {days.map((day) => {
        // Tile dibangun dari `new Date()` lokal, jadi kuncinya YMD lokal —
        // sama seperti kalender wizard. Keputusan waktunya tetap WIB.
        const ymd = toLocalYmd(day);
        const booked = counts[ymd] || 0;
        const covered = coveredDays.includes(ymd);
        // Yang MENGUNCI tile adalah kuota yang benar-benar sudah terpakai; yang
        // DITAMPILKAN sudah termasuk pemesanan yang sedang disusun.
        const isFull = booked >= quota;
        const used = booked + (covered ? 1 : 0);
        const isOver = used > quota;
        const isClosed = isBookingClosedForDate(ymd);
        const disabled = isFull || isClosed;
        const isStart = selectedYmd === ymd;

        return (
          <button
            key={ymd}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(ymd)}
            title={
              isClosed ? 'Sudah lewat batas pesan 13.00 WIB'
                : isOver ? `Melebihi kuota harian (${quota}) kalau jadwal ini diambil`
                  : undefined
            }
            className={cn(
              'flex flex-col items-center justify-center rounded-lg border p-1 h-[70px] text-center transition-all',
              isOver
                ? 'bg-red-50 border-red-500 ring-1 ring-red-500'
                : isStart
                  ? 'bg-blue-50 border-blue-600 ring-1 ring-blue-600'
                  : covered
                    ? 'bg-blue-50/50 border-blue-300'
                    : disabled
                      ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
                      : 'bg-white border-slate-200 hover:border-blue-400'
            )}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {day.toLocaleDateString('id-ID', { weekday: 'short' })}
            </span>
            <span
              className={cn(
                'text-[13px] font-extrabold leading-tight',
                isOver ? 'text-red-900' : isStart ? 'text-blue-900' : 'text-slate-800'
              )}
            >
              {day.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
            </span>
            <span
              className={cn(
                'mt-0.5 rounded-full px-1.5 text-[9px] font-semibold tabular-nums',
                isOver || isFull ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
              )}
            >
              {used}/{quota}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Dua minggu ke depan — jendela yang dipakai semua permukaan pemesanan. */
export const DAYS_AHEAD = 14;

export function nextDays(count: number = DAYS_AHEAD): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/**
 * Hari yang ditempati kalau tayang mulai `ymd` selama `duration` hari.
 * Akhir-eksklusif, sama seperti papan Schedule.
 */
export function daysCoveredBy(ymd: string, duration: number): string[] {
  const out: string[] = [];
  const cursor = new Date(`${ymd}T00:00:00.000Z`);
  for (let i = 0; i < Math.max(1, duration); i += 1) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
