import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    CalendarClock,
    CalendarDays,
    Check,
    Clock,
    Gift,
    Info,
    Loader2,
    Minus,
    Plus,
    Sparkles,
    X,
} from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase, type FormSubmission } from '@/utils/supabase';
import { DAYS_AHEAD, SlotCalendar, daysCoveredBy, nextDays } from '@/components/schedule/SlotCalendar';
import { useSlotAvailability } from '@/hooks/useSlotAvailability';
import { fetchBatchContext, scheduleIdFromSourceId, type BatchContext } from '@/utils/batchContext';
import { toAiringEndIso, toAiringStartIso } from '@/utils/airing-window';
import { createPayment } from '@/utils/payment';
import { payLinkUrl } from '@/utils/payLink';
import { formatIDR } from '@/utils/currency';

/*
 ─────────────────────────────────────────────────────────────
 Dialog "Jadwalkan Iklan Lagi" — jalur SWALAYAN peneliti (Phase 4, Langkah 5).
 Mengadopsi design pattern modal popup modern (seperti CustomMissionModal & ProfileCompletionSheet):
 - Modal rounded-3xl dengan backdrop blur dan slide/zoom animation.
 - Header bergradasi lembut dengan brand icon squircle jfu-primary dan circular close button.
 - Mobile drag handle indicator untuk responsive bottom-sheet experience.
 - Pinned footer dengan tombol Batal dan aksi utama Kunci Jadwal & Lanjut Bayar.
 ─────────────────────────────────────────────────────────────
*/

export interface ScheduleAgainDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    submission: FormSubmission;
    /** Lama tayang jadwal pertama — nilai awal yang masuk akal untuk jadwal berikutnya. */
    defaultDuration: number;
    /** `fetchSubmissions` milik StatusPage. Dipanggil sesudah jadwal & tagihan lahir. */
    onBooked: () => void | Promise<void>;
}

const DURATION_PRESETS = [1, 2, 5, 7, 14];

const fmtDateShort = (ymd: string) => {
    const parts = ymd.split('-');
    if (parts.length !== 3) return ymd;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

export function ScheduleAgainDialog({
    open,
    onOpenChange,
    submission,
    defaultDuration: _defaultDuration,
    onBooked,
}: ScheduleAgainDialogProps) {
    const { t } = useLanguage();

    const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
    const [duration, setDuration] = useState(2);
    const [prizePerWinner, setPrizePerWinner] = useState(0);
    const [winnerCount, setWinnerCount] = useState(0);
    const [batch, setBatch] = useState<BatchContext | null>(null);
    const [isResolvingBatch, setIsResolvingBatch] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Reset dan lock body scroll saat modal terbuka
    useEffect(() => {
        if (open) {
            setDuration(2);
            setSelectedYmd(null);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [open]);

    // Handle ESC key untuk menutup modal (kecuali sedang proses simpan)
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isSaving) onOpenChange(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, isSaving, onOpenChange]);

    /*
      ⚠️ `excludeSubmissionId` TIDAK dioper. Order ini sedang menambah jadwal
      KEDUA, jadi jadwal pertamanya tetap memakan kuota hari yang ditempatinya —
      mengecualikannya akan menampilkan hari yang sebenarnya penuh sebagai
      lowong, dan `assert_daily_ad_quota_free` (sql/86) menolaknya di server
      setelah peneliti terlanjur memilih.
    */
    const { counts, maxPerDay, isLoading, isReady, hasError } = useSlotAvailability('regular');

    const days = useMemo(() => nextDays(DAYS_AHEAD), []);
    const covered = useMemo(
        () => (selectedYmd ? daysCoveredBy(selectedYmd, duration) : []),
        [selectedYmd, duration],
    );

    const startIso = selectedYmd ? toAiringStartIso(selectedYmd) : null;
    const endIso = selectedYmd ? toAiringEndIso(selectedYmd, duration) : null;

    // Batch ditanyakan ke SERVER, bukan disimpulkan di browser
    useEffect(() => {
        if (!open || !endIso || !submission.id) {
            setBatch(null);
            return;
        }
        let cancelled = false;
        setIsResolvingBatch(true);
        fetchBatchContext(submission.id, endIso)
            .then((ctx) => { if (!cancelled) setBatch(ctx); })
            .finally(() => { if (!cancelled) setIsResolvingBatch(false); });
        return () => { cancelled = true; };
    }, [open, endIso, submission.id]);

    const isNewBatch = batch?.isNewBatch ?? false;

    // Prefill hadiah dari jadwal sebelumnya jika periode baru
    useEffect(() => {
        if (!isNewBatch) return;
        setPrizePerWinner((v) => (v > 0 ? v : Number(submission.prize_per_winner) || 0));
        setWinnerCount((v) => (v > 0 ? v : Number(submission.winner_count) || 0));
    }, [isNewBatch, submission.prize_per_winner, submission.winner_count]);

    const fullDayIn = (ymd: string): string | null =>
        daysCoveredBy(ymd, duration).find((d) => (counts[d] || 0) >= maxPerDay) ?? null;

    const rewardMissing = isNewBatch && (prizePerWinner <= 0 || winnerCount <= 0);
    const canSubmit =
        !!selectedYmd && !isSaving && !isLoading && isReady && !isResolvingBatch && !rewardMissing;

    const selectedRangeText = useMemo(() => {
        if (!selectedYmd || covered.length === 0) return null;
        const startFmt = fmtDateShort(selectedYmd);
        const endFmt = fmtDateShort(covered[covered.length - 1]);
        return `${startFmt} – ${endFmt} (${duration} Hari)`;
    }, [selectedYmd, covered, duration]);

    const handleSubmit = async () => {
        if (!selectedYmd || !startIso || !endIso || !submission.id) return;

        const blocked = fullDayIn(selectedYmd);
        if (blocked) {
            toast.error(t('scheduleAgainFull'));
            return;
        }

        setIsSaving(true);
        try {
            // 1. Jadwalnya lahir di server. Seluruh aturan kelayakan ada di sana.
            const { data: sourceId, error } = await supabase.rpc('create_ad_schedule', {
                p_submission_id: submission.id,
                p_start_date: startIso,
                p_end_date: endIso,
                p_duration: duration,
                p_prize_per_winner: isNewBatch ? prizePerWinner : 0,
                p_winner_count: isNewBatch ? winnerCount : 0,
                p_additional_prize_per_winner: 0,
                p_is_new_period: isNewBatch,
            });
            if (error) throw error;
            if (!sourceId) throw new Error('create_ad_schedule tidak memulangkan id jadwal.');

            // 2. ⚠️ source_id -> ad_schedules.id
            const scheduleId = await scheduleIdFromSourceId(String(sourceId));
            if (!scheduleId) throw new Error('Jadwal tersimpan, tetapi id-nya tidak terbaca.');

            // 3. Tagihan lahir SEKARANG
            await createPayment({
                formSubmissionId: submission.id,
                scheduleId,
                amount: 0, // server yang menghitung
                customerInfo: {
                    title: submission.title || 'Survey',
                    fullName: submission.full_name || 'Pengguna',
                    email: submission.email || 'user@example.com',
                    phoneNumber: submission.phone_number || '-',
                },
            });

            await onBooked();
            onOpenChange(false);
            window.location.assign(payLinkUrl(scheduleId));
        } catch (e: any) {
            if (e?.response?.data?.needs_admin_invoice) {
                toast.info(t('scheduleAgainNeedsAdmin'));
                await onBooked();
                onOpenChange(false);
                return;
            }
            const serverMsg = e?.response?.data?.error || e?.message;
            console.error('[ScheduleAgainDialog] gagal mengunci jadwal:', e);
            toast.error(serverMsg || t('scheduleAgainFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6 md:p-8 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget && !isSaving) onOpenChange(false);
            }}
        >
            <div className="bg-white rounded-t-3xl sm:rounded-3xl border border-gray-100 shadow-2xl w-full sm:max-w-xl md:max-w-2xl max-h-[90vh] sm:max-h-[86vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
                
                {/* Mobile Drag Handle Indicator */}
                <div className="sm:hidden pt-2.5 pb-1 flex justify-center bg-gradient-to-r from-blue-50/80 via-blue-50/40 to-white shrink-0">
                    <div className="w-10 h-1 bg-slate-300 rounded-full" />
                </div>

                {/* Header */}
                <div className="px-5 sm:px-8 py-4 sm:py-5 border-b border-gray-100 bg-gradient-to-r from-blue-50/80 via-blue-50/40 to-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-jfu-primary text-white flex items-center justify-center shadow-md shadow-jfu-primary/25 shrink-0">
                            <CalendarClock className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm sm:text-base font-extrabold text-gray-900 leading-tight truncate">
                                {t('scheduleAgainTitle')}
                            </h2>
                            <p className="text-[11px] sm:text-xs text-gray-500 truncate mt-0.5">
                                {t('scheduleAgainDesc')}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => !isSaving && onOpenChange(false)}
                        disabled={isSaving}
                        aria-label={t('closePopup')}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors cursor-pointer shrink-0 ml-3 disabled:opacity-50"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Scrollable Modal Body */}
                <div className="overflow-y-auto p-5 sm:p-7 space-y-5 flex-1 overscroll-contain text-xs">
                    {/* Hold 1-Hour Notice Alert */}
                    <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-100/80 flex items-center gap-3 text-xs text-blue-900">
                        <Clock className="w-4 h-4 text-jfu-primary shrink-0" />
                        <p className="leading-relaxed">
                            Slot jadwal akan <strong>ditahan selama 1 jam</strong> setelah dikunci. Selesaikan pembayaran dalam kurun waktu tersebut agar tanggal tayang tidak dilepas.
                        </p>
                    </div>

                    {/* Section: Lama Tayang Iklan */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-jfu-primary shrink-0" />
                                <span className="font-bold text-gray-900 text-xs sm:text-sm">
                                    {t('scheduleAgainDuration')} <span className="text-rose-500">*</span>
                                </span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-jfu-primary border border-blue-100/80">
                                {duration} {t('scheduleAgainDays')}
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            {/* Preset Buttons */}
                            <div className="flex flex-wrap items-center gap-1.5 flex-1">
                                {DURATION_PRESETS.map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        disabled={isSaving}
                                        onClick={() => setDuration(preset)}
                                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                                            duration === preset
                                                ? 'bg-jfu-primary text-white shadow-xs'
                                                : 'bg-slate-100/80 hover:bg-slate-200/80 text-slate-700'
                                        }`}
                                    >
                                        {preset} Hari
                                    </button>
                                ))}
                            </div>

                            {/* Stepper Controls */}
                            <div className="flex items-center gap-1.5 bg-slate-100/80 border border-slate-200/70 rounded-xl p-1 shrink-0">
                                <button
                                    type="button"
                                    disabled={isSaving || duration <= 1}
                                    onClick={() => setDuration((prev) => Math.max(1, prev - 1))}
                                    className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200/60 flex items-center justify-center text-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
                                    aria-label="Kurangi durasi"
                                >
                                    <Minus className="w-3.5 h-3.5" />
                                </button>
                                <div className="flex items-center px-1">
                                    <input
                                        id="again-duration"
                                        type="number"
                                        min={1}
                                        max={30}
                                        value={duration}
                                        onChange={(e) => setDuration(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                                        disabled={isSaving}
                                        className="w-10 text-center font-bold text-slate-900 bg-transparent text-xs focus:outline-none"
                                    />
                                    <span className="text-[11px] text-slate-500 font-medium">hari</span>
                                </div>
                                <button
                                    type="button"
                                    disabled={isSaving || duration >= 30}
                                    onClick={() => setDuration((prev) => Math.min(30, prev + 1))}
                                    className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200/60 flex items-center justify-center text-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
                                    aria-label="Tambah durasi"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Section: Pilih Tanggal Mulai Tayang */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CalendarDays className="w-4 h-4 text-jfu-primary shrink-0" />
                                <span className="font-bold text-gray-900 text-xs sm:text-sm">
                                    Pilih Tanggal Mulai Tayang <span className="text-rose-500">*</span>
                                </span>
                            </div>
                            {selectedRangeText ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center gap-1">
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    {selectedRangeText}
                                </span>
                            ) : (
                                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500">
                                    Belum dipilih
                                </span>
                            )}
                        </div>

                        {/* Calendar Card Container */}
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-3 sm:p-4 space-y-2.5">
                            {/* ⚠️ `isAdmin={false}` WAJIB. Defaultnya `true`, dan itu membuka
                                tanggal hari ini meski sudah lewat 14.00 WIB — kelonggaran
                                yang memang hanya untuk admin. */}
                            <SlotCalendar
                                days={days}
                                counts={counts}
                                quota={maxPerDay}
                                selectedYmd={selectedYmd}
                                coveredDays={covered}
                                onSelect={setSelectedYmd}
                                columns={7}
                                isLoading={isLoading}
                                isAdmin={false}
                            />

                            <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500 border-t border-slate-200/60">
                                <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <p className="leading-tight">
                                    Angka menunjukkan <strong>(terisi / kuota)</strong>. Tanggal terkunci bila slot penuh atau lewat batas 13.00 WIB.
                                </p>
                            </div>
                        </div>
                    </div>

                    {hasError && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                            {t('scheduleAgainFailed')}
                        </p>
                    )}

                    {/* Section: New Batch Reward */}
                    {isNewBatch ? (
                        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 space-y-3">
                            <p className="text-xs font-bold text-amber-900 flex items-center gap-2">
                                <Gift className="w-4 h-4 text-amber-600 shrink-0" />
                                {t('scheduleAgainRewardTitle')}
                            </p>
                            <p className="text-[11px] leading-relaxed text-amber-800">
                                {t('scheduleAgainRewardWhy')}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                <div className="space-y-1.5">
                                    <label htmlFor="again-prize" className="text-[11px] font-bold text-amber-900 block">
                                        {t('scheduleAgainRewardPrize')} (Rp)
                                    </label>
                                    <input
                                        id="again-prize"
                                        type="number"
                                        min={0}
                                        value={prizePerWinner || ''}
                                        onChange={(e) => setPrizePerWinner(Math.max(0, Number(e.target.value) || 0))}
                                        disabled={isSaving}
                                        className="h-10 w-full px-3 text-xs border border-amber-300 rounded-xl bg-white text-gray-900 focus:border-jfu-primary focus:outline-none font-semibold font-mono"
                                        placeholder="Contoh: 50000"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="again-winners" className="text-[11px] font-bold text-amber-900 block">
                                        {t('scheduleAgainRewardWinners')} (Orang)
                                    </label>
                                    <input
                                        id="again-winners"
                                        type="number"
                                        min={0}
                                        value={winnerCount || ''}
                                        onChange={(e) => setWinnerCount(Math.max(0, Number(e.target.value) || 0))}
                                        disabled={isSaving}
                                        className="h-10 w-full px-3 text-xs border border-amber-300 rounded-xl bg-white text-gray-900 focus:border-jfu-primary focus:outline-none font-semibold font-mono"
                                        placeholder="Contoh: 2"
                                    />
                                </div>
                            </div>
                            {prizePerWinner > 0 && winnerCount > 0 && (
                                <div className="pt-2 flex items-center justify-between border-t border-amber-200 text-xs">
                                    <span className="text-amber-800 font-medium">Total Hadiah Responden:</span>
                                    <span className="font-extrabold text-amber-950 font-mono">
                                        {formatIDR(prizePerWinner * winnerCount)}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : batch ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 flex items-start gap-2.5 text-xs text-slate-600">
                            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                            <p className="leading-relaxed">
                                {t('scheduleAgainPoolReused')}
                            </p>
                        </div>
                    ) : null}
                </div>

                {/* Pinned Desktop & Mobile Footer */}
                <div className="px-5 sm:px-8 py-3.5 sm:py-4.5 border-t border-gray-100 bg-gray-50/80 flex flex-col-reverse sm:flex-row items-center justify-between gap-2 sm:gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={() => !isSaving && onOpenChange(false)}
                        disabled={isSaving}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white hover:bg-gray-100 text-gray-600 font-semibold text-xs border border-gray-200 transition-colors cursor-pointer text-center disabled:opacity-50"
                    >
                        {t('cancel')}
                    </button>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-jfu-primary hover:bg-jfu-dark text-white font-bold text-xs shadow-md shadow-jfu-primary/20 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>{t('scheduleAgainBooking')}</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>{t('scheduleAgainSubmit')}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
