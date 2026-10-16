import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Zap, Calendar, Info, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    fetchKilatSlotAvailability,
    updateKilatSchedule,
    type KilatDayAvailability,
} from '../utils/supabase';
import { KILAT_SLOT_HOURS, KILAT_QUOTA_PER_SLOT } from '../utils/constants';
import {
    formatWibTime,
    kilatBookingClosesAt,
    kilatPayDeadline,
    kilatWaveInstant,
    nextWibWorkdays,
} from '../utils/airing-window';

// ─────────────────────────────────────────────────────────────
// Penjadwalan JFU Kilat — sengaja TIDAK memakai kalender 14-hari milik iklan
// regular. Keduanya tidak berbagi satu pun aturan:
//
//   iklan regular : tayang 15.00 WIB, berjalan `duration` × 24 jam, kuota
//                   per-HARI, tujuh hari seminggu.
//   JFU Kilat     : dua gelombang push (11/15 WIB), kuota per-GELOMBANG,
//                   hanya Senin–Jumat (sql/117 menegakkan kuotanya untuk
//                   admin juga — gelombang penuh ditolak database).
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
    /**
     * Order sudah lunas? Menentukan peringatan batas bayar: gelombang yang
     * ditugaskan terlalu mepet menyisakan < 60 menit bagi peneliti untuk
     * membayar. `undefined` = tidak diketahui, peringatan tetap tampil.
     */
    isPaid?: boolean;
    onCancel: () => void;
    onScheduled: () => void;
    onRemoveSchedule?: () => void;
    /**
     * Dipanggil TEPAT SETELAH gelombang tersimpan, hanya bila tanggalnya
     * benar-benar berpindah.
     *
     * ⚠️ Ada supaya notifikasi Fase ② tidak punya lubang senyap di jalur Kilat.
     * Komponen ini melayani DUA pemanggil dengan arti yang berlawanan: wizard
     * checkout (peneliti memesan slotnya sendiri — tidak boleh dikabari, ia
     * sedang menatap hasilnya) dan drawer admin (tim memindahkan tanggal orang
     * lain — wajib dikabari). Keputusannya karena itu TIDAK diambil di sini;
     * yang tahu bedanya adalah pemanggilnya, dan hanya drawer yang mengisinya.
     */
    onRescheduled?: (newYmd: string) => void;
}

/**
 * Tanggal YMD sebagai Date untuk DITAMPILKAN (format id-ID, zona WIB). Tengah
 * hari WIB supaya tidak ada zona device yang menggesernya ke hari lain.
 *
 * Sabtu & Minggu tidak dirender sama sekali (`nextWibWorkdays`), bukan
 * dirender lalu di-disable: tile yang tidak pernah bisa diklik hanya menambah
 * lebar grid dan mengundang pertanyaan "kenapa abu-abu?".
 */
const dateOfYmd = (ymd: string) => new Date(`${ymd}T12:00:00+07:00`);
const WIB = { timeZone: 'Asia/Jakarta' } as const;

const formatHour = (h: number) => `${String(h).padStart(2, '0')}.00`;

export function KilatScheduleStep({
    submissionId,
    initialYmd,
    initialHour,
    isRescheduling,
    isPaid,
    onCancel,
    onScheduled,
    onRemoveSchedule,
    onRescheduled,
}: KilatScheduleStepProps) {
    const [availability, setAvailability] = useState<Record<string, KilatDayAvailability>>({});
    const [isFetching, setIsFetching] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedYmd, setSelectedYmd] = useState<string | null>(initialYmd || null);
    const [selectedHour, setSelectedHour] = useState<number | null>(initialHour ?? null);

    const workdays = nextWibWorkdays(WORKDAYS_AHEAD);
    const nowMs = Date.now();
    const isWavePast = (ymd: string, hour: number) => nowMs >= kilatWaveInstant(ymd, hour).getTime();

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
            toast.success(`Jadwal Kilat pukul ${formatHour(selectedHour)} WIB berhasil dibooking!`);
            if (selectedYmd !== initialYmd) onRescheduled?.(selectedYmd);
            onScheduled();
        } catch (error: any) {
            console.error('Gagal booking jadwal Kilat:', error);
            toast.error(error?.message || 'Gagal booking jadwal Kilat');
        } finally {
            setIsSaving(false);
        }
    };

    const selectedDate = selectedYmd ? dateOfYmd(selectedYmd) : null;

    /*
      Peringatan bayar — hanya untuk order yang belum lunas, karena gelombang
      dipesan admin tetap harus dibayar peneliti sebelum batas bayarnya.
      Sisa < 60 menit ⇔ sudah lewat batas pesan peneliti (H-2 jam): trigger
      sql/117 melewatkan admin, jadi penugasan semepet ini tetap tersimpan.
    */
    const payWarning = (() => {
        if (isPaid || !selectedYmd || selectedHour === null) return null;
        if (nowMs <= kilatBookingClosesAt(selectedYmd, selectedHour).getTime()) return null;
        const deadline = kilatPayDeadline(selectedYmd, selectedHour);
        const minutesLeft = Math.floor((deadline.getTime() - nowMs) / 60000);
        return minutesLeft > 0
            ? `Peneliti hanya punya ${minutesLeft} menit untuk membayar (batas bayar ${formatWibTime(deadline.toISOString())} WIB).`
            : `Batas bayar gelombang ini (${formatWibTime(deadline.toISOString())} WIB) sudah lewat. Pastikan order ini memang dibayar di luar sistem.`;
    })();

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Penanda jalur — admin bisa saja sampai di sini dari tab yang salah */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                <Zap className="w-4 h-4 mt-0.5 shrink-0 fill-amber-600 text-amber-600" />
                <span>
                    <strong>Distribusi JFU Kilat.</strong> Push notifikasi langsung ke responden dalam
                    gelombang {KILAT_SLOT_HOURS.map(formatHour).join(' / ')} WIB, {KILAT_QUOTA_PER_SLOT} order
                    per gelombang, hanya hari kerja. Tidak tampil di daftar iklan publik.
                </span>
            </div>

            {/* Tanggal */}
            <div className="space-y-2">
                <Label className="flex items-center justify-between">
                    <span>Pilih Tanggal (Senin–Jumat)</span>
                </Label>
                {isFetching ? (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-1 px-1">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div
                                key={i}
                                className="flex flex-col items-center justify-center p-1 h-[80px] rounded-xl border border-slate-200 bg-white space-y-1.5 animate-pulse"
                            >
                                <div className="h-2.5 w-6 rounded bg-slate-200" />
                                <div className="h-4 w-12 rounded bg-slate-300" />
                                <div className="h-3.5 w-8 rounded-full bg-slate-100 mt-auto" />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-1 px-1">
                        {workdays.map((ymd) => {
                        const date = dateOfYmd(ymd);
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
                                    {date.toLocaleDateString('id-ID', { ...WIB, weekday: 'short' })}
                                </span>
                                <span className={`font-extrabold text-[15px] leading-tight mb-1 ${isSelected ? 'text-amber-900' : 'text-slate-800'}`}>
                                    {date.toLocaleDateString('id-ID', { ...WIB, day: 'numeric', month: 'short' })}
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
                )}
            </div>

            {/* Gelombang */}
            <div className="space-y-2">
                <Label>Pilih Gelombang Push (WIB)</Label>
                {!selectedYmd ? (
                    <p className="text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-3">
                        Pilih tanggal dulu untuk melihat gelombang yang tersisa.
                    </p>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {KILAT_SLOT_HOURS.map((hour) => {
                            const used = hourUsage(selectedYmd, hour);
                            const isFull = used >= KILAT_QUOTA_PER_SLOT;
                            const isPast = isWavePast(selectedYmd, hour);
                            const isSelected = selectedHour === hour;
                            return (
                                <button
                                    key={hour}
                                    type="button"
                                    disabled={(isFull || isPast) && !isSelected}
                                    onClick={() => setSelectedHour(hour)}
                                    className={`flex flex-col items-center justify-center gap-1 h-[68px] rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${isSelected
                                        ? 'bg-amber-50 border-amber-600 ring-1 ring-amber-600 shadow-md'
                                        : isFull || isPast
                                            ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                                            : 'bg-white border-slate-200 hover:border-amber-400 shadow-sm'
                                        }`}
                                >
                                    <span className={`font-extrabold text-[15px] ${isSelected ? 'text-amber-900' : 'text-slate-800'}`}>
                                        {formatHour(hour)} WIB
                                    </span>
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isFull ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                        {isPast ? 'sudah lewat' : `${used}/${KILAT_QUOTA_PER_SLOT} ${isFull ? '· penuh' : 'terisi'}`}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
                {payWarning && (
                    <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{payWarning}</span>
                    </div>
                )}
                {/* ⚠️ SEMENTARA, hapus di rilis R6 (jalur bayar Kilat). Sampai itu,
                    tagihan Kilat masih memakai batas bayar Iklan 14.00 WIB —
                    gelombang 11.00 yang belum lunas bisa terbayar SESUDAH
                    tayang. Aturan jeda R2→R6 di rencana Phase 5. */}
                {!isPaid && selectedHour === 11 && (
                    <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>
                            Untuk order yang belum lunas, pakai gelombang <strong>15.00</strong> dulu: link bayar
                            Kilat masih memakai batas bayar 14.00 WIB, jadi gelombang 11.00 bisa terbayar sesudah tayang.
                        </span>
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
                                ? selectedDate.toLocaleDateString('id-ID', { ...WIB, weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
                                : '-'}
                        </span>
                    </div>
                    <div className="flex-1 flex flex-col justify-center bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                        <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Gelombang</span>
                        <span className="font-bold text-gray-900">
                            {selectedHour !== null ? `${formatHour(selectedHour)} WIB` : '-'}
                        </span>
                    </div>
                    {/* Kilat tanpa durasi (Phase 5 §5.8) — yang berguna bagi admin
                        adalah kapan peneliti paling lambat membayar. */}
                    <div className="flex-1 flex flex-col justify-center bg-white px-3 py-2.5 rounded-md border border-gray-100 shadow-sm">
                        <span className="text-gray-500 text-[10px] uppercase font-semibold tracking-wider mb-0.5">Batas bayar</span>
                        <span className="font-bold text-gray-900">
                            {selectedYmd && selectedHour !== null
                                ? `${formatWibTime(kilatPayDeadline(selectedYmd, selectedHour).toISOString())} WIB`
                                : '-'}
                        </span>
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
                                {isRescheduling ? 'Update Jadwal Kilat' : 'Kunci Jadwal Kilat'}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
