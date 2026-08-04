import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Zap, Calendar, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    fetchKilatSlotAvailability,
    updateKilatSchedule,
    type KilatDayAvailability,
} from '../utils/supabase';
import { KILAT_SLOT_HOURS, KILAT_QUOTA_PER_SLOT } from '../utils/constants';
import { toLocalYmd } from '../utils/airing-window';

// ─────────────────────────────────────────────────────────────
// Penjadwalan JFU Kilat — sengaja TIDAK memakai kalender 14-hari milik iklan
// regular. Keduanya tidak berbagi satu pun aturan:
//
//   iklan regular : tayang 15.00 WIB, berjalan `duration` × 24 jam, kuota
//                   per-HARI, tujuh hari seminggu.
//   JFU Kilat     : empat gelombang push (08/11/14/17 WIB), ~2 jam,
//                   kuota per-GELOMBANG, hanya Senin–Jumat.
//
// Mencangkokkan Kilat ke kalender regular berarti menyembunyikan perbedaan itu
// di balik dropdown jam yang isinya 96 pilihan 15-menit — 92 di antaranya tidak
// pernah sah.
// ─────────────────────────────────────────────────────────────

/** Berapa hari kerja ke depan yang ditawarkan. Dua minggu kerja. */
const WORKDAYS_AHEAD = 10;

interface KilatScheduleStepProps {
    submissionId: string;
    /** Jadwal Kilat yang sudah tersimpan, kalau ini penjadwalan ulang. */
    initialYmd?: string | null;
    initialHour?: number | null;
    isRescheduling: boolean;
    onCancel: () => void;
    onScheduled: () => void;
    onRemoveSchedule?: () => void;
}

/**
 * Sabtu & Minggu tidak dirender sama sekali, bukan dirender lalu di-disable.
 * Tile yang tidak pernah bisa diklik hanya menambah lebar grid dan mengundang
 * pertanyaan "kenapa abu-abu?".
 */
function nextWorkdays(count: number): Date[] {
    const days: Date[] = [];
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (days.length < count) {
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) {
            days.push(new Date(cursor));
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return days;
}

const formatHour = (h: number) => `${String(h).padStart(2, '0')}.00`;

export function KilatScheduleStep({
    submissionId,
    initialYmd,
    initialHour,
    isRescheduling,
    onCancel,
    onScheduled,
    onRemoveSchedule,
}: KilatScheduleStepProps) {
    const [availability, setAvailability] = useState<Record<string, KilatDayAvailability>>({});
    const [isFetching, setIsFetching] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedYmd, setSelectedYmd] = useState<string | null>(initialYmd || null);
    const [selectedHour, setSelectedHour] = useState<number | null>(initialHour ?? null);

    const workdays = nextWorkdays(WORKDAYS_AHEAD);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setIsFetching(true);
            try {
                // Order ini sendiri dikecualikan, supaya penjadwalan ulang tidak
                // pernah menghitung slotnya sendiri sebagai saingan.
                const data = await fetchKilatSlotAvailability(submissionId);
                if (!cancelled) setAvailability(data);
            } catch (e) {
                console.error('Gagal memuat ketersediaan slot Kilat:', e);
                if (!cancelled) toast.error('Gagal memuat ketersediaan slot Kilat.');
            } finally {
                if (!cancelled) setIsFetching(false);
            }
        })();
        return () => { cancelled = true; };
    }, [submissionId]);

    const dayUsage = (ymd: string) => availability[ymd] || { byHour: {}, unassigned: 0, details: [] };
    const hourUsage = (ymd: string, hour: number) => dayUsage(ymd).byHour[hour] || 0;
    const dayTotal = (ymd: string) => {
        const usage = dayUsage(ymd);
        return KILAT_SLOT_HOURS.reduce((sum, h) => sum + (usage.byHour[h] || 0), 0) + usage.unassigned;
    };
    const dayCapacity = KILAT_SLOT_HOURS.length * KILAT_QUOTA_PER_SLOT;

    const handleSave = async () => {
        if (!selectedYmd || selectedHour === null) {
            toast.error('Pilih tanggal dan gelombang Kilat dulu.');
            return;
        }
        // Sabuk pengaman untuk state yang basi: grid dimuat sekali, dan slot bisa
        // terisi orang lain sementara admin masih memilih.
        if (hourUsage(selectedYmd, selectedHour) >= KILAT_QUOTA_PER_SLOT) {
            toast.error(`Gelombang ${formatHour(selectedHour)} WIB sudah penuh. Pilih gelombang lain.`);
            return;
        }

        setIsSaving(true);
        try {
            await updateKilatSchedule(submissionId, selectedYmd, selectedHour);
            toast.success(`Slot Kilat ${formatHour(selectedHour)} WIB berhasil dibooking!`);
            onScheduled();
        } catch (error: any) {
            console.error('Gagal booking slot Kilat:', error);
            toast.error(error?.message || 'Gagal booking slot Kilat');
        } finally {
            setIsSaving(false);
        }
    };

    const selectedDate = selectedYmd
        ? workdays.find((d) => toLocalYmd(d) === selectedYmd) || new Date(`${selectedYmd}T00:00:00`)
        : null;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Penanda jalur — admin bisa saja sampai di sini dari tab yang salah */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                <Zap className="w-4 h-4 mt-0.5 shrink-0 fill-amber-600 text-amber-600" />
                <span>
                    <strong>Distribusi JFU Kilat.</strong> Push notifikasi langsung ke responden dalam
                    gelombang {KILAT_SLOT_HOURS.map(formatHour).join(' / ')} WIB, {KILAT_QUOTA_PER_SLOT} order
                    per gelombang, hanya hari kerja. Tidak menggunakan halaman iklan.
                </span>
            </div>

            {/* Tanggal */}
            <div className="space-y-2">
                <Label className="flex items-center justify-between">
                    <span>Pilih Tanggal (Senin–Jumat)</span>
                    {isFetching && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-1 px-1">
                    {workdays.map((date) => {
                        const ymd = toLocalYmd(date);
                        const used = dayTotal(ymd);
                        const isFull = used >= dayCapacity;
                        const isSelected = selectedYmd === ymd;
                        const unassigned = dayUsage(ymd).unassigned;

                        return (
                            <button
                                key={ymd}
                                type="button"
                                disabled={isFull && !isSelected}
                                onClick={() => {
                                    setSelectedYmd(ymd);
                                    // Gelombang direset saat tanggal berganti: kuota
                                    // 11.00 di Senin tidak mengatakan apa pun soal
                                    // 11.00 di Selasa.
                                    if (ymd !== initialYmd) setSelectedHour(null);
                                    else setSelectedHour(initialHour ?? null);
                                }}
                                className={`flex flex-col items-center justify-center p-1 h-[80px] rounded-xl border transition-all text-center focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${isSelected
                                    ? 'bg-amber-50 border-amber-600 ring-1 ring-amber-600 shadow-md'
                                    : isFull
                                        ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                                        : 'bg-white border-slate-200 hover:border-amber-400 shadow-sm'
                                    }`}
                            >
                                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                                    {date.toLocaleDateString('id-ID', { weekday: 'short' })}
                                </span>
                                <span className={`font-extrabold text-[15px] leading-tight mb-1 ${isSelected ? 'text-amber-900' : 'text-slate-800'}`}>
                                    {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                </span>
                                <div className="flex items-center gap-1 mt-auto bg-slate-100/50 px-1.5 py-0.5 rounded-full border border-slate-100">
                                    <div className={`w-1 h-1 rounded-full ${isFull ? 'bg-red-500' : used > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                    <span className={`text-[9px] font-semibold ${isFull ? 'text-red-700' : 'text-slate-600'}`}>
                                        {used}/{dayCapacity}
                                    </span>
                                </div>
                                {/* Order Kilat dari wizard user belum punya gelombang.
                                    Menyembunyikannya akan menjual kapasitas yang sudah terpakai. */}
                                {unassigned > 0 && (
                                    <span className="text-[8px] font-semibold text-amber-700 mt-0.5">
                                        {unassigned} tanpa slot
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Gelombang */}
            <div className="space-y-2">
                <Label>Pilih Gelombang Push (WIB)</Label>
                {!selectedYmd ? (
                    <p className="text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-3">
                        Pilih tanggal dulu untuk melihat gelombang yang tersisa.
                    </p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {KILAT_SLOT_HOURS.map((hour) => {
                            const used = hourUsage(selectedYmd, hour);
                            const isFull = used >= KILAT_QUOTA_PER_SLOT;
                            const isSelected = selectedHour === hour;
                            return (
                                <button
                                    key={hour}
                                    type="button"
                                    disabled={isFull && !isSelected}
                                    onClick={() => setSelectedHour(hour)}
                                    className={`flex flex-col items-center justify-center gap-1 h-[68px] rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${isSelected
                                        ? 'bg-amber-50 border-amber-600 ring-1 ring-amber-600 shadow-md'
                                        : isFull
                                            ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                                            : 'bg-white border-slate-200 hover:border-amber-400 shadow-sm'
                                        }`}
                                >
                                    <span className={`font-extrabold text-[15px] ${isSelected ? 'text-amber-900' : 'text-slate-800'}`}>
                                        {formatHour(hour)} WIB
                                    </span>
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isFull ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                        {used}/{KILAT_QUOTA_PER_SLOT} {isFull ? '· penuh' : 'terisi'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
                {selectedYmd && dayUsage(selectedYmd).unassigned > 0 && (
                    <div className="flex items-start gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>
                            {dayUsage(selectedYmd).unassigned} order Kilat di tanggal ini belum ditugaskan
                            gelombangnya (dipesan lewat wizard user). Angka per-gelombang di atas belum
                            memperhitungkannya.
                        </span>
                    </div>
                )}
            </div>

            {/* Ringkasan */}
            <div className="space-y-2 p-4 bg-gray-50 rounded-lg border border-gray-100">
                <Label className="text-xs text-gray-500 uppercase tracking-wider">Ringkasan Jadwal</Label>
                <div className="flex flex-row overflow-x-auto gap-2 mt-1 text-sm pb-1">
                    <div className="flex-1 flex flex-col justify-center bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                        <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Tanggal</span>
                        <span className="font-bold text-gray-900">
                            {selectedDate
                                ? selectedDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
                                : '-'}
                        </span>
                    </div>
                    <div className="flex-1 flex flex-col justify-center bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                        <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Gelombang</span>
                        <span className="font-bold text-gray-900">
                            {selectedHour !== null ? `${formatHour(selectedHour)} WIB` : '-'}
                        </span>
                    </div>
                    <div className="flex-1 flex flex-col justify-center bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                        <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Durasi</span>
                        <span className="font-bold text-gray-900">~2 jam</span>
                    </div>
                </div>
            </div>

            {/* Aksi */}
            <div className="flex items-center justify-between pt-2">
                {isRescheduling && onRemoveSchedule && (
                    <Button variant="destructive" onClick={onRemoveSchedule} disabled={isSaving}>
                        Hapus Jadwal
                    </Button>
                )}
                <div className="flex items-center gap-3 ml-auto">
                    <Button variant="outline" onClick={onCancel} disabled={isSaving}>
                        Batal
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isSaving || !selectedYmd || selectedHour === null}
                        className="bg-amber-600 hover:bg-amber-700"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Booking...
                            </>
                        ) : (
                            <>
                                <Calendar className="mr-2 h-4 w-4" />
                                {isRescheduling ? 'Update Slot Kilat' : 'Book Slot Kilat'}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
