import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Loader2, Zap, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
    fetchKilatSchedule,
    countKilatPagesLeak,
    type KilatScheduleEntry,
} from '../utils/supabase';
import { KILAT_SLOT_HOURS, KILAT_QUOTA_PER_SLOT } from '../utils/constants';
import { toLocalYmd } from '../utils/airing-window';

// ─────────────────────────────────────────────────────────────
// Papan jadwal Kilat — ringkasan LINTAS ORDER untuk satu minggu kalender,
// dipakai admin untuk melihat siapa mengisi gelombang mana. Beda dengan
// KilatScheduleStep (yang memesankan SATU order ke SATU slot): board ini
// tidak menulis apa pun, hanya membaca dan melempar admin ke drawer detail
// order lewat onOpenSubmission.
// ─────────────────────────────────────────────────────────────

interface KilatScheduleBoardProps {
    onOpenSubmission: (params: { id: string; createdAt: string }) => void;
    /**
     * Dirender DI DALAM kartu lain (papan Schedule), jadi kartu luarnya sendiri
     * dilepas — kartu di dalam kartu membuat batas ganda yang tidak berarti apa
     * pun. Navigasi minggunya tetap ikut: gelombang Kilat Senin–Jumat adalah
     * periode yang berbeda dari periode papan induknya, jadi ia harus punya
     * kendali sendiri.
     *
     * Sejak Page Calendar dipensiunkan (2026-08-08) hanya papan Schedule yang
     * memakainya, jadi `embedded` selalu `true` di praktiknya. Default `false`
     * dipertahankan supaya komponen ini tetap bisa berdiri sendiri.
     */
    embedded?: boolean;
}

const formatHour = (h: number) => `${String(h).padStart(2, '0')}.00`;

/**
 * Kartu pembungkus kisi gelombang — dilepas saat papan ini dirender DI DALAM
 * kartu lain, karena kartu di dalam kartu cuma menghasilkan batas ganda.
 *
 * Didefinisikan di tingkat modul, bukan di dalam komponennya: komponen yang
 * lahir ulang tiap render akan me-remount seluruh kisi dan membuang posisi
 * gulung horizontalnya setiap kali data masuk.
 */
function BoardShell({ embedded, children }: { embedded: boolean; children: ReactNode }) {
    if (embedded) return <div>{children}</div>;
    return (
        <Card className="shadow-sm border-slate-200 bg-white">
            <CardContent className="p-4">{children}</CardContent>
        </Card>
    );
}

/** Senin dari minggu kalender yang memuat `date`. Bukan "5 hari kerja ke depan" — ini dijangkarkan ke batas minggu supaya navigasi ←/→ punya arti. */
function mondayOf(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay(); // 0=Minggu ... 6=Sabtu
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + diffToMonday);
    return d;
}

/** Senin–Jumat dari sebuah Senin. Sabtu/Minggu tidak pernah dibangkitkan. */
function weekdaysFrom(monday: Date): Date[] {
    return Array.from({ length: 5 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        return d;
    });
}

const cellKey = (ymd: string, hour: number) => `${ymd}|${hour}`;

function statusMeta(entry: KilatScheduleEntry): { label: string; dotClass: string } {
    const isPaid = entry.paymentStatus === 'paid' || entry.paymentStatus === 'completed';
    if (entry.submissionStatus === 'completed') {
        return { label: 'Selesai', dotClass: 'bg-slate-400' };
    }
    if (isPaid) {
        return { label: 'Lunas/Live', dotClass: 'bg-emerald-500' };
    }
    return { label: 'Menunggu bayar', dotClass: 'bg-amber-500' };
}

export function KilatScheduleBoard({ onOpenSubmission, embedded = false }: KilatScheduleBoardProps) {
    const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
    const [entries, setEntries] = useState<KilatScheduleEntry[]>([]);
    const [isFetching, setIsFetching] = useState(true);
    const [pagesLeakCount, setPagesLeakCount] = useState(0);

    const weekdays = weekdaysFrom(weekStart);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setIsFetching(true);
            try {
                const days = weekdaysFrom(weekStart);
                const fromYmd = toLocalYmd(days[0]);
                const toYmd = toLocalYmd(days[days.length - 1]);
                const [schedule, leakCount] = await Promise.all([
                    fetchKilatSchedule(fromYmd, toYmd),
                    countKilatPagesLeak(),
                ]);
                if (!cancelled) {
                    setEntries(schedule);
                    setPagesLeakCount(leakCount);
                }
            } catch (e) {
                console.error('Gagal memuat papan jadwal Kilat:', e);
                if (!cancelled) toast.error('Gagal memuat papan jadwal Kilat.');
            } finally {
                if (!cancelled) setIsFetching(false);
            }
        })();
        return () => { cancelled = true; };
    }, [weekStart]);

    // Dikelompokkan sekali per fetch, bukan di-filter ulang untuk tiap sel grid.
    const byCell = useMemo(() => {
        const map = new Map<string, KilatScheduleEntry[]>();
        entries.forEach((e) => {
            if (e.hour === null) return;
            const key = cellKey(e.ymd, e.hour);
            const list = map.get(key);
            if (list) list.push(e); else map.set(key, [e]);
        });
        return map;
    }, [entries]);

    const unassignedByYmd = useMemo(() => {
        const map = new Map<string, KilatScheduleEntry[]>();
        entries.forEach((e) => {
            if (e.hour !== null) return;
            const list = map.get(e.ymd);
            if (list) list.push(e); else map.set(e.ymd, [e]);
        });
        return map;
    }, [entries]);

    const hasUnassigned = unassignedByYmd.size > 0;

    const shiftWeek = (days: number) => {
        setWeekStart((prev) => {
            const next = new Date(prev);
            next.setDate(next.getDate() + days);
            return next;
        });
    };

    const headerLabel =
        `${weekdays[0].toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' })} – ` +
        `${weekdays[4].toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`;

    return (
        <div className="space-y-4">
            {/* Penanda jalur, senada dengan banner KilatScheduleStep */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                <Zap className="w-4 h-4 mt-0.5 shrink-0 fill-amber-600 text-amber-600" />
                <span>
                    <strong>Papan Jadwal JFU Kilat.</strong> Ringkasan gelombang{' '}
                    {KILAT_SLOT_HOURS.map(formatHour).join(' / ')} WIB, {KILAT_QUOTA_PER_SLOT} order per
                    gelombang, Senin–Jumat. Klik sebuah entri untuk membuka order-nya di Submissions.
                </span>
            </div>

            {pagesLeakCount > 0 && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />
                    <span>
                        <strong>{pagesLeakCount}</strong> halaman iklan menempel ke order Kilat — kemungkinan
                        sql/40 dijalankan ulang tanpa sql/42. Jalankan ulang bagian 2 dari
                        sql/42_kilat_slots.sql.
                    </span>
                </div>
            )}

            {/* Navigasi minggu */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 bg-gray-50/80 p-1.5 rounded-lg border border-gray-200/50 shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-white hover:shadow-sm"
                        onClick={() => shiftWeek(-7)}
                    >
                        <ChevronLeft className="h-4 w-4 text-gray-600" />
                    </Button>
                    <h2 className="text-sm font-semibold min-w-[200px] text-center text-gray-700 select-none">
                        {headerLabel}
                    </h2>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-white hover:shadow-sm"
                        onClick={() => shiftWeek(7)}
                    >
                        <ChevronRight className="h-4 w-4 text-gray-600" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-3 ml-2 text-xs font-medium text-slate-600 hover:text-amber-700 hover:bg-white border border-transparent hover:border-slate-200 hover:shadow-sm"
                        onClick={() => setWeekStart(mondayOf(new Date()))}
                    >
                        Hari ini
                    </Button>
                </div>
                {isFetching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            <BoardShell embedded={embedded}>
                    {isFetching ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <div className="min-w-[720px]">
                                {/* Header hari */}
                                <div className="[display:grid] grid-cols-[92px_repeat(5,minmax(0,1fr))] gap-2 mb-2">
                                    <div />
                                    {weekdays.map((day) => {
                                        const isToday = toLocalYmd(day) === toLocalYmd(new Date());
                                        return (
                                            <div
                                                key={toLocalYmd(day)}
                                                className={`text-center rounded-lg py-0.5 ${isToday ? 'bg-blue-50 border border-blue-200' : ''}`}
                                            >
                                                <div className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-blue-700' : 'text-slate-500'}`}>
                                                    {day.toLocaleDateString('id-ID', { weekday: 'short' })}
                                                </div>
                                                <div className={`text-[13px] font-extrabold ${isToday ? 'text-blue-800' : 'text-slate-800'}`}>
                                                    {day.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Baris per gelombang */}
                                {KILAT_SLOT_HOURS.map((hour) => (
                                    <div key={hour} className="[display:grid] grid-cols-[92px_repeat(5,minmax(0,1fr))] gap-2 mb-2">
                                        <div className="flex items-center justify-center text-center text-[11px] font-bold text-amber-800 bg-amber-50 rounded-lg border border-amber-200 px-1">
                                            {formatHour(hour)} WIB
                                        </div>
                                        {weekdays.map((day) => {
                                            const ymd = toLocalYmd(day);
                                            const cellEntries = byCell.get(cellKey(ymd, hour)) || [];
                                            const used = cellEntries.length;
                                            const isFull = used >= KILAT_QUOTA_PER_SLOT;

                                            return (
                                                <div
                                                    key={ymd}
                                                    className={`min-w-0 rounded-lg border p-1.5 min-h-[76px] flex flex-col gap-1 ${isFull
                                                        ? 'bg-amber-50/60 border-amber-300'
                                                        : 'bg-white border-slate-200'
                                                        }`}
                                                >
                                                    <span
                                                        className={`self-start text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${isFull ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
                                                            }`}
                                                    >
                                                        {used}/{KILAT_QUOTA_PER_SLOT}
                                                    </span>
                                                    <div className="flex flex-col gap-1">
                                                        {cellEntries.map((entry) => {
                                                            const meta = statusMeta(entry);
                                                            return (
                                                                <button
                                                                    key={entry.id}
                                                                    type="button"
                                                                    onClick={() => onOpenSubmission({ id: entry.id, createdAt: entry.createdAt })}
                                                                    title={`${entry.title} — ${entry.researcherName} (${meta.label})`}
                                                                    className="flex w-full min-w-0 items-center gap-1 px-1.5 py-1 rounded-md bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
                                                                >
                                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotClass}`} title={meta.label} />
                                                                    {/* min-w-0 WAJIB: tanpa itu `truncate` tidak pernah menyala pada
                                                                        anak flex, dan judul survei yang panjang akan melebarkan
                                                                        kolomnya sendiri sampai kisinya berantakan. */}
                                                                    <span className="min-w-0 flex-1 text-[10px] font-medium text-slate-700 truncate">
                                                                        {entry.title}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
            </BoardShell>

            {/* Order Kilat dari wizard user yang belum ditugaskan gelombangnya oleh admin. */}
            {!isFetching && hasUnassigned && (
                <div className="space-y-2">
                    <Label className="text-xs text-gray-500 uppercase tracking-wider">Tanpa Gelombang</Label>
                    <div className="flex flex-col gap-2">
                        {weekdays.map((day) => {
                            const ymd = toLocalYmd(day);
                            const list = unassignedByYmd.get(ymd);
                            if (!list || list.length === 0) return null;
                            return (
                                <div key={ymd} className="flex items-start gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                                    <span className="text-[11px] font-bold text-slate-500 uppercase shrink-0 w-20 pt-0.5">
                                        {day.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
                                    </span>
                                    <div className="flex min-w-0 flex-wrap gap-1.5">
                                        {list.map((entry) => (
                                            <button
                                                key={entry.id}
                                                type="button"
                                                onClick={() => onOpenSubmission({ id: entry.id, createdAt: entry.createdAt })}
                                                title={`${entry.title} — ${entry.researcherName}`}
                                                className="max-w-[280px] truncate px-2 py-1 rounded-full bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-[10px] font-medium text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
                                            >
                                                {entry.title}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
