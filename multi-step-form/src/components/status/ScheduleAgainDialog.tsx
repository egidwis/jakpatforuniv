import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Gift, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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

 ⚠️ SENGAJA BUKAN `ScheduleForm`. Formulir itu punya dua hal yang HANYA boleh
 dimiliki admin: toggle Iklan Tambahan (kolam kuota terpisah) dan kelonggaran
 cutoff hari-H (commit 920b3cb). Memakainya ulang di sini berarti memberi
 peneliti keduanya. Yang dipakai ulang adalah bagian yang memang netral:
 `SlotCalendar`, `useSlotAvailability`, dan `fetchBatchContext`.

 Urutan yang dijalankan tombolnya, dan kenapa urutannya begitu:

   1. `create_ad_schedule` (sql/86) — server yang memutuskan boleh/tidak.
      Ia memaksa slot_booked_by='user', slot_reserved_at=now(), is_extra_ad=false,
      total_cost=0, lalu menolak Kilat / belum approved / lewat 13.00 / batch
      baru tanpa hadiah / hari yang kuotanya penuh. Layar ini TIDAK mengulang
      keputusan itu — ia cuma menyampaikan penolakannya.
   2. `scheduleIdFromSourceId` — RPC memulangkan `source_id`, sementara
      `/bayar/<id>` dan `create-payment` butuh `ad_schedules.id`. Yang salah
      TIDAK error; ia cuma tidak menemukan tagihan apa pun.
   3. `createPayment({ scheduleId })` — tagihan lahir saat slot dikunci, bukan
      saat tombol bayar ditekan, supaya hold 1 jam benar-benar jendela MEMBAYAR.
   4. `onBooked()` — memuat ulang lewat `fetchSubmissions` milik StatusPage,
      jalur yang sama dengan `ReviewPhase.onDataUpdated`. Tanpa ini jadwalnya
      sudah ada di database tapi tidak muncul di layar.
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

export function ScheduleAgainDialog({
    open,
    onOpenChange,
    submission,
    defaultDuration,
    onBooked,
}: ScheduleAgainDialogProps) {
    const { t } = useLanguage();

    const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
    const [duration, setDuration] = useState(() => Math.max(1, defaultDuration || 7));
    const [prizePerWinner, setPrizePerWinner] = useState(0);
    const [winnerCount, setWinnerCount] = useState(0);
    const [batch, setBatch] = useState<BatchContext | null>(null);
    const [isResolvingBatch, setIsResolvingBatch] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

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

    // Batch ditanyakan ke SERVER, bukan disimpulkan di browser — ekspresi
    // batch-nya harus sama persis dengan yang menghitung `period_batch`
    // tersimpan (sql/37).
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

    // Prefill hadiah dari jadwal sebelumnya: angka yang sudah dipakai peneliti
    // ini, bukan nol yang harus ia tebak ulang.
    useEffect(() => {
        if (!isNewBatch) return;
        setPrizePerWinner((v) => (v > 0 ? v : Number(submission.prize_per_winner) || 0));
        setWinnerCount((v) => (v > 0 ? v : Number(submission.winner_count) || 0));
    }, [isNewBatch, submission.prize_per_winner, submission.winner_count]);

    /*
      Kalender mengunci tile hari yang penuh, tapi iklan multi-hari bisa MULAI di
      hari kosong lalu menabrak hari penuh di tengah jendelanya. Penjaga yang
      sama dipakai `ScheduleForm`; server tetap penjaga terakhirnya.
    */
    const fullDayIn = (ymd: string): string | null =>
        daysCoveredBy(ymd, duration).find((d) => (counts[d] || 0) >= maxPerDay) ?? null;

    const rewardMissing = isNewBatch && (prizePerWinner <= 0 || winnerCount <= 0);
    const canSubmit =
        !!selectedYmd && !isSaving && !isLoading && isReady && !isResolvingBatch && !rewardMissing;

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
                // `slot_booked_by`, `slot_reserved_at`, `total_cost`, dan
                // `is_extra_ad` sengaja TIDAK dikirim: sql/86 memaksanya sendiri
                // untuk pemanggil non-admin, dan nilai dari browser tidak dipercaya.
            });
            if (error) throw error;
            if (!sourceId) throw new Error('create_ad_schedule tidak memulangkan id jadwal.');

            // 2. ⚠️ `source_id` → `ad_schedules.id`. Melewatkan langkah ini tidak
            //    error; link bayarnya cuma tidak menemukan tagihan apa pun.
            const scheduleId = await scheduleIdFromSourceId(String(sourceId));
            if (!scheduleId) throw new Error('Jadwal tersimpan, tetapi id-nya tidak terbaca.');

            // 3. Tagihan lahir SEKARANG, supaya hold 1 jam adalah jendela membayar.
            await createPayment({
                formSubmissionId: submission.id,
                scheduleId,
                amount: 0, // server yang menghitung; nominal dari browser tidak dipakai
                customerInfo: {
                    title: submission.title || 'Survey',
                    fullName: submission.full_name || 'Pengguna',
                    email: submission.email || 'user@example.com',
                    phoneNumber: submission.phone_number || '-',
                },
            });

            await onBooked();
            onOpenChange(false);
            // Link bayar per jadwal — SELALU lewat resolver, tidak pernah URL DOKU mentah.
            window.location.assign(payLinkUrl(scheduleId));
        } catch (e: any) {
            // Penolakan top-up (409 `needs_admin_invoice`) punya kalimatnya
            // sendiri: jadwalnya sah, cuma harganya harus diterbitkan admin.
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

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!isSaving) onOpenChange(next); }}>
            <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-blue-600 shrink-0" />
                        {t('scheduleAgainTitle')}
                    </DialogTitle>
                    <DialogDescription>{t('scheduleAgainDesc')}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-1">
                    <div className="space-y-1.5">
                        <label htmlFor="again-duration" className="text-xs font-semibold text-slate-700">
                            {t('scheduleAgainDuration')}
                        </label>
                        <div className="flex items-center gap-2">
                            <Input
                                id="again-duration"
                                type="number"
                                min={1}
                                max={30}
                                value={duration}
                                onChange={(e) => setDuration(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                                className="w-24"
                                disabled={isSaving}
                            />
                            <span className="text-xs text-slate-500">{t('scheduleAgainDays')}</span>
                        </div>
                    </div>

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

                    {hasError && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            {t('scheduleAgainFailed')}
                        </p>
                    )}

                    {isNewBatch ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-3">
                            <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5">
                                <Gift className="w-3.5 h-3.5 shrink-0" />
                                {t('scheduleAgainRewardTitle')}
                            </p>
                            <p className="text-[11px] leading-relaxed text-amber-800">
                                {t('scheduleAgainRewardWhy')}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <label htmlFor="again-prize" className="text-[11px] font-medium text-amber-900">
                                        {t('scheduleAgainRewardPrize')}
                                    </label>
                                    <Input
                                        id="again-prize"
                                        type="number"
                                        min={0}
                                        value={prizePerWinner || ''}
                                        onChange={(e) => setPrizePerWinner(Math.max(0, Number(e.target.value) || 0))}
                                        disabled={isSaving}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="again-winners" className="text-[11px] font-medium text-amber-900">
                                        {t('scheduleAgainRewardWinners')}
                                    </label>
                                    <Input
                                        id="again-winners"
                                        type="number"
                                        min={0}
                                        value={winnerCount || ''}
                                        onChange={(e) => setWinnerCount(Math.max(0, Number(e.target.value) || 0))}
                                        disabled={isSaving}
                                    />
                                </div>
                            </div>
                            {prizePerWinner > 0 && winnerCount > 0 && (
                                <p className="text-[11px] text-amber-900 font-medium">
                                    {formatIDR(prizePerWinner * winnerCount)}
                                </p>
                            )}
                        </div>
                    ) : batch ? (
                        <p className="text-[11px] leading-relaxed text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                            {t('scheduleAgainPoolReused')}
                        </p>
                    ) : null}
                </div>

                <DialogFooter>
                    <Button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {t('scheduleAgainBooking')}
                            </>
                        ) : (
                            t('scheduleAgainSubmit')
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
