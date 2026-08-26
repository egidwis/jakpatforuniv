import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nowWib } from '@/utils/airing-window';
import type { DateRange } from '@/utils/analytics/types';
import { CHART, INK } from './palette';
import {
    calendarDaysFromRange,
    formatMonthYear,
    formatRangeLabel,
    rangeFromCalendarDays,
    ymdToLocalDate,
} from './format';

/**
 * Pemilih rentang "Dari … sampai …" untuk seluruh tab Revenue.
 *
 * ## Kenapa satu picker di atas segalanya, bukan selektor per kartu
 *
 * Selektor periode di dalam tiap kartu (seperti di referensi yang dikirim) bikin
 * dua kartu bersebelahan diam-diam membicarakan periode yang berbeda, dan tak ada
 * di layar yang memberi tahu pembacanya. Satu baris filter men-scope semuanya.
 *
 * ## Kenapa batas harinya WIB
 *
 * Semua konversi tanggal lewat `rangeFromCalendarDays`, yang menancapkan hari ke
 * 00:00 WIB lewat offset eksplisit. Kalau dipotong menurut jam perangkat, angka
 * di layar tidak akan pernah cocok dengan query rekonsiliasi di produksi bagi
 * siapa pun yang membuka dashboard dari luar WIB. `to` selalu EKSKLUSIF.
 *
 * Komponen ini murni presentasional: ia tidak pernah mengambil data, hanya
 * mengembalikan `DateRange` lewat `onChange`.
 */

const MS_PER_DAY = 86_400_000;

/** Header & nama hari ditulis sendiri supaya kalender berbahasa Indonesia tanpa menambah paket locale. */
const WEEKDAY_ID: Record<string, string> = {
    Monday: 'Sn', Tuesday: 'Sl', Wednesday: 'Rb', Thursday: 'Km',
    Friday: 'Jm', Saturday: 'Sb', Sunday: 'Mg',
    Mon: 'Sn', Tue: 'Sl', Wed: 'Rb', Thu: 'Km', Fri: 'Jm', Sat: 'Sb', Sun: 'Mg',
};

/**
 * react-datepicker membawa CSS biru bawaannya sendiri. Alih-alih menambal
 * `styles.css` global (yang sudah jadi sumber masalah cascade di repo ini),
 * override-nya dikurung di bawah satu kelas milik komponen ini.
 */
/** Tinta di atas `CHART.accent`. Diberi nama supaya bukan hex liar di tengah CSS. */
const ON_ACCENT = '#ffffff';

const CALENDAR_CSS = `
.jfu-daterange .react-datepicker { border: none; font-family: inherit; background: transparent; width: 100%; }
.jfu-daterange .react-datepicker__month-container { width: 100%; float: none; }
.jfu-daterange .react-datepicker__header { background: transparent; border-bottom: none; padding-top: 0; }
.jfu-daterange .react-datepicker__day-name {
  color: ${INK.muted}; font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; width: 2rem; line-height: 2rem; margin: 0.1rem;
}
.jfu-daterange .react-datepicker__day {
  color: ${INK.primary}; width: 2rem; line-height: 2rem; margin: 0.1rem; border-radius: 6px; font-size: 13px;
}
.jfu-daterange .react-datepicker__day:hover { background: ${CHART.contextSoft}; }
.jfu-daterange .react-datepicker__day--outside-month { color: ${INK.muted}; opacity: 0.5; }
.jfu-daterange .react-datepicker__day--disabled { color: ${INK.muted}; opacity: 0.35; }
.jfu-daterange .react-datepicker__day--in-range,
.jfu-daterange .react-datepicker__day--in-selecting-range { background: ${CHART.contextSoft}; color: ${INK.primary}; border-radius: 0; }
/* HARUS di atas blok --selected: react-datepicker menaruh --keyboard-selected
   pada hari AWAL rentang juga, dan pada spesifisitas yang sama aturan terakhir
   yang menang. Ketika ia ada di bawah, ujung awal rentang kehilangan aksennya
   dan terbaca seperti hari biasa — rentangnya cuma punya satu jangkar. */
.jfu-daterange .react-datepicker__day--keyboard-selected { background: ${CHART.contextSoft}; color: ${INK.primary}; }
.jfu-daterange .react-datepicker__day--selected,
.jfu-daterange .react-datepicker__day--range-start,
.jfu-daterange .react-datepicker__day--range-end,
.jfu-daterange .react-datepicker__day--selecting-range-start {
  background: ${CHART.accent}; color: ${ON_ACCENT}; border-radius: 6px;
}
.jfu-daterange .react-datepicker__day--today { font-weight: 700; }
`;

interface Preset {
    label: string;
    /** Mengembalikan [tanggal awal, tanggal akhir INKLUSIF] menurut kalender. */
    resolve: (today: Date, earliest: Date) => [Date, Date];
}

const PRESETS: Preset[] = [
    { label: '7 hari terakhir', resolve: (today) => [addDays(today, -6), today] },
    { label: '30 hari terakhir', resolve: (today) => [addDays(today, -29), today] },
    { label: '90 hari terakhir', resolve: (today) => [addDays(today, -89), today] },
    { label: 'Bulan ini', resolve: (today) => [new Date(today.getFullYear(), today.getMonth(), 1), today] },
    {
        label: 'Bulan lalu',
        resolve: (today) => [
            new Date(today.getFullYear(), today.getMonth() - 1, 1),
            new Date(today.getFullYear(), today.getMonth(), 0),
        ],
    },
    { label: 'Tahun ini', resolve: (today) => [new Date(today.getFullYear(), 0, 1), today] },
    { label: 'Semua waktu', resolve: (today, earliest) => [earliest, today] },
];

function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * MS_PER_DAY);
}

function sameDay(a: Date | null, b: Date | null): boolean {
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export interface DateRangePickerProps {
    /** Rentang aktif. `to` EKSKLUSIF, sesuai kontrak `types.ts`. */
    value: DateRange;
    onChange: (range: DateRange) => void;
    /** Tanggal data paling awal — dipakai preset "Semua waktu". Default 1 Jan 2024. */
    earliestDate?: Date;
    /** Nonaktifkan saat fetch berjalan supaya rentang tidak diganti dua kali beruntun. */
    disabled?: boolean;
    className?: string;
    /** Penjajaran popover pada breakpoint sm ke atas: 'left' (default) atau 'right'. */
    align?: 'left' | 'right';
}

export function DateRangePicker({
    value,
    onChange,
    earliestDate,
    disabled = false,
    className = '',
    align = 'left',
}: DateRangePickerProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // "Hari ini" menurut WIB, bukan menurut jam perangkat pembaca.
    // Dihitung ulang tiap kali popover dibuka. Dengan `useMemo(..., [])` dashboard
    // yang dibiarkan terbuka melewati tengah malam WIB akan menahan preset dan
    // `maxDate` milik kemarin.
    const today = useMemo(() => ymdToLocalDate(nowWib().ymd), [open]);
    const earliest = earliestDate ?? new Date(2024, 0, 1);

    const applied = useMemo(() => calendarDaysFromRange(value), [value]);
    const [draftStart, setDraftStart] = useState<Date | null>(applied.start);
    const [draftEnd, setDraftEnd] = useState<Date | null>(applied.endInclusive);

    // Buka ulang popover selalu dimulai dari rentang yang sedang berlaku, bukan
    // dari sisa pilihan setengah jadi yang tadi dibatalkan.
    useEffect(() => {
        if (open) {
            setDraftStart(applied.start);
            setDraftEnd(applied.endInclusive);
        }
    }, [open, applied.start, applied.endInclusive]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        const onPointerDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onPointerDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('mousedown', onPointerDown);
        };
    }, [open]);

    const apply = (start: Date, endInclusive: Date) => {
        onChange(rangeFromCalendarDays(start, endInclusive));
        setOpen(false);
    };

    const activePresetLabel = PRESETS.find((preset) => {
        const [start, end] = preset.resolve(today, earliest);
        return sameDay(start, applied.start) && sameDay(end, applied.endInclusive);
    })?.label;

    return (
        // `--jfu-soft` diturunkan dari palet, bukan hex baru: `hover:bg-[var(--jfu-soft)]`
        // di bawah memakainya supaya permukaan hover tetap satu sumber dengan chart.
        <div
            ref={containerRef}
            className={`relative ${className}`}
            style={{ '--jfu-soft': CHART.contextSoft } as CSSProperties}
        >
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((prev) => !prev)}
                aria-haspopup="dialog"
                aria-expanded={open}
                className="inline-flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--jfu-soft)] disabled:opacity-60 sm:w-auto"
                style={{ borderColor: CHART.grid, color: INK.primary }}
            >
                <span className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" style={{ color: INK.muted }} aria-hidden="true" />
                    <span className="tabular-nums">{formatRangeLabel(value)}</span>
                </span>
                <ChevronDown className="h-4 w-4" style={{ color: INK.muted }} aria-hidden="true" />
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label="Pilih periode"
                    /*
                       Di bawah sm popover-nya dijangkarkan ke VIEWPORT, bukan ke tombolnya.
                       Dijangkarkan ke tombol, ia mewarisi offset kiri baris header (label
                       "Periode" + gap ≈ 81px), jadi lebar 94vw meluber 58px ke luar layar —
                       dan karena posisinya out-of-flow, halaman tidak bisa digulir untuk
                       mencapainya: tombol "Terapkan" benar-benar tak terjangkau di ponsel.
                       Pada breakpoint sm+, dijangkarkan ke sisi kiri tombol (atau kanan jika align='right')
                       agar tidak meluber ke kiri menabrak sidebar admin.
                    */
                    className={`jfu-daterange fixed inset-x-3 top-auto z-50 mt-2 overflow-hidden rounded-lg border bg-white shadow-lg sm:absolute sm:inset-x-auto ${align === 'right' ? 'sm:right-0' : 'sm:left-0'} sm:w-[min(94vw,34rem)]`}
                    style={{ borderColor: CHART.grid }}
                >
                    <style>{CALENDAR_CSS}</style>

                    {/*
                      `[display:grid]` dan bukan `grid`: `styles.css` menetapkan
                      `.grid { gap: 1.5rem }` SETELAH Tailwind, jadi tiap utility
                      `gap-*` pada elemen ber-class `grid` diam-diam ditimpa.
                    */}
                    <div className="[display:grid] [grid-template-columns:1fr] sm:[grid-template-columns:11rem_1fr]">
                        <ul
                            className="border-b p-2 sm:border-b-0 sm:border-r"
                            style={{ borderColor: CHART.grid }}
                        >
                            {PRESETS.map((preset) => {
                                const isActive = preset.label === activePresetLabel;
                                return (
                                    <li key={preset.label}>
                                        {/*
                                          Preset langsung diterapkan dan menutup popover: satu
                                          klik itu sudah pilihan yang utuh. Pemilihan manual di
                                          kalender butuh dua klik, jadi baru di situ "Terapkan"
                                          punya pekerjaan.
                                        */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const [start, end] = preset.resolve(today, earliest);
                                                apply(start, end);
                                            }}
                                            aria-current={isActive}
                                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-[var(--jfu-soft)]"
                                            style={{
                                                color: isActive ? INK.primary : INK.secondary,
                                                fontWeight: isActive ? 600 : 400,
                                            }}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="h-1.5 w-1.5 shrink-0 rounded-full"
                                                style={{ backgroundColor: isActive ? CHART.accent : 'transparent' }}
                                            />
                                            {preset.label}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>

                        <div className="p-3">
                            <DatePicker
                                inline
                                selectsRange
                                calendarStartDay={1}
                                startDate={draftStart ?? undefined}
                                endDate={draftEnd ?? undefined}
                                minDate={earliest}
                                maxDate={today}
                                formatWeekDay={(day: string) => WEEKDAY_ID[day] ?? day.slice(0, 2)}
                                renderCustomHeader={({ date, decreaseMonth, increaseMonth, prevMonthButtonDisabled, nextMonthButtonDisabled }) => (
                                    <div className="mb-2 flex items-center justify-between px-1">
                                        <button
                                            type="button"
                                            onClick={decreaseMonth}
                                            disabled={prevMonthButtonDisabled}
                                            aria-label="Bulan sebelumnya"
                                            className="rounded-md p-1 transition-colors hover:bg-[var(--jfu-soft)] disabled:opacity-30"
                                        >
                                            <ChevronLeft className="h-4 w-4" style={{ color: INK.secondary }} />
                                        </button>
                                        <span className="text-[13px] font-semibold" style={{ color: INK.primary }}>
                                            {formatMonthYear(date)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={increaseMonth}
                                            disabled={nextMonthButtonDisabled}
                                            aria-label="Bulan berikutnya"
                                            className="rounded-md p-1 transition-colors hover:bg-[var(--jfu-soft)] disabled:opacity-30"
                                        >
                                            <ChevronRight className="h-4 w-4" style={{ color: INK.secondary }} />
                                        </button>
                                    </div>
                                )}
                                onChange={(dates) => {
                                    const [start, end] = dates as [Date | null, Date | null];
                                    setDraftStart(start);
                                    setDraftEnd(end);
                                }}
                            />
                        </div>
                    </div>

                    <div
                        className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-3"
                        style={{ borderColor: CHART.grid, backgroundColor: 'transparent' }}
                    >
                        <p className="text-[13px] tabular-nums" style={{ color: INK.secondary }}>
                            {draftStart && draftEnd
                                ? formatRangeLabel(rangeFromCalendarDays(draftStart, draftEnd))
                                : 'Pilih tanggal akhir'}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                                Batal
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={!draftStart || !draftEnd}
                                onClick={() => {
                                    if (draftStart && draftEnd) apply(draftStart, draftEnd);
                                }}
                                className="text-white"
                                style={{ backgroundColor: CHART.accent }}
                            >
                                Terapkan
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DateRangePicker;
