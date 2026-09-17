import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Gift, Info, Loader2, Lock, Minus, Plus, RefreshCw,
} from 'lucide-react';
import { supabase, getFormSubmissionById, fetchAdSchedules } from '../../utils/supabase';
import type { FormSubmission } from '../../utils/supabase';
import { useLanguage } from '../../i18n/LanguageContext';
import { SchedulePicker } from '../../components/SchedulePicker';
import { useSlotAvailability } from '../../hooks/useSlotAvailability';
import { scheduleLockGate } from '../../utils/scheduleLockGate';
import { newSchedulePlan, NEW_SCHEDULE_BLOCK_KEY } from '../../utils/newSchedulePlan';
import { segmentTitleOf } from '../../utils/segmentTitle';
import { fetchBatchContext, scheduleIdFromSourceId, type BatchContext } from '../../utils/batchContext';
import { toAiringEndIso, toAiringStartIso } from '../../utils/airing-window';
import { airingDaysOf } from './schedule/scheduleModel';
import { createPayment } from '../../utils/payment';
import { formatIDR } from '../../utils/currency';
import { CostBreakdown } from '../../components/CostBreakdown';
import { ScheduleReservationLayout } from '../../components/schedule/ScheduleReservationLayout';
import { draftScheduleMoney } from '../../utils/draftScheduleMoney';

/**
 * Halaman "Jadwal Baru" — tempat jadwal perpanjangan LAHIR.
 *
 * ⚠️ RUTENYA MEMBAWA `submission_id`, BUKAN `ad_schedules.id`. Alamat terpisah
 * dari `/dashboard/jadwal/:scheduleId` justru karena subjeknya berbeda: di sini
 * barisnya BELUM ADA. Menyatukan keduanya di satu param berarti satu UUID yang
 * kadang jadwal kadang order — persis jebakan tiga-kunci yang sudah dicatat di
 * `payLink.ts`, dan yang salah tidak pernah error, ia cuma tidak menemukan
 * baris.
 *
 * Menggantikan `ScheduleAgainDialog`. Yang dipindahkan UTUH, bukan ditulis
 * ulang:
 *
 *   • `fetchBatchContext` — batch ditanyakan SERVER, bukan disimpulkan browser
 *   • `create_ad_schedule` → `scheduleIdFromSourceId` → `createPayment`
 *   • dua cabang hasil: `needs_admin_invoice`, dan gagal-sesudah-RPC-berhasil
 *   • `scheduleLockGate` dievaluasi saat DITEKAN, bukan saat kalender digambar
 *
 * Yang DIPERBAIKI saat pindah:
 *
 *   • `SlotCalendar` (kalender ADMIN, `isAdmin` default `true`) → `SchedulePicker`
 *   • tombol mati kini selalu menyebutkan sebabnya (`newSchedulePlan`)
 *   • mendarat di halaman jadwal, bukan `window.location.assign` reload putih
 */

const DURATION_PRESETS = [1, 2, 5, 7, 14];

export function JadwalBaruPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [submission, setSubmission] = useState<FormSubmission | null>(null);
  const [ordinal, setOrdinal] = useState(2);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [duration, setDuration] = useState(7);
  const [picked, setPicked] = useState<string | null>(null);
  const [prizePerWinner, setPrizePerWinner] = useState(0);
  const [winnerCount, setWinnerCount] = useState(0);
  const [batch, setBatch] = useState<BatchContext | null>(null);
  const [isResolvingBatch, setIsResolvingBatch] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  /*
    ⚠️ `excludeSubmissionId` TIDAK dioper. Order ini sedang menambah jadwal
    BERIKUTNYA, jadi jadwal-jadwal sebelumnya tetap memakan kuota hari yang
    mereka tempati — mengecualikannya menampilkan hari yang sebenarnya penuh
    sebagai lowong, dan `assert_daily_ad_quota_free` (sql/86) menolaknya di
    server sesudah penelitinya terlanjur memilih.
  */
  const availability = useSlotAvailability('regular');

  // Konteks order + durasi awal dari jadwal PERTAMA.
  useEffect(() => {
    if (!submissionId) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [sub, entries] = await Promise.all([
          getFormSubmissionById(submissionId),
          fetchAdSchedules(submissionId).catch(() => []),
        ]);
        if (cancelled) return;
        if (!sub) { setNotFound(true); return; }
        setSubmission(sub);

        /*
          Lama tayang jadwal berikutnya ditebak dari jadwal PERTAMA.

          ⚠️ DITURUNKAN DARI start→end LEWAT `airingDaysOf`, bukan dari kolom
          `duration` — kolom itu bisa berbohong (18 dari 992 baris meleset di
          produksi), jadi ia cuma cadangan. `airingDaysOf` juga yang memegang
          aturan akhir-eksklusif dan penjaga data rusak; menghitungnya ulang di
          sini akan jadi salinan kedua yang bisa berbeda pendapat.
        */
        const first = entries.find((e) => e.ordinal === 1) ?? entries[0];
        const hari = first
          ? (airingDaysOf(first).length || first.duration || 7)
          : 7;
        setDuration(Math.max(1, Math.min(30, hari)));
        setOrdinal(Math.max(2, entries.length + 1));
        setBookingId(first?.bookingId ?? null);
      } catch (e) {
        console.error('Gagal memuat order:', e);
        if (!cancelled) toast.error(t('paymentLoadError'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [submissionId, t]);

  const startIso = picked ? toAiringStartIso(picked) : null;
  const endIso = picked ? toAiringEndIso(picked, duration) : null;

  /*
    ⚠️ BATCH DITANYAKAN KE SERVER, bukan disimpulkan di browser — dipindahkan
    apa adanya dari modal. Menyimpulkannya di browser adalah yang dulu membuat
    jadwal #3 ditagih untuk pool yang sudah didanai jadwal #2.
  */
  useEffect(() => {
    if (!endIso || !submissionId) { setBatch(null); return; }
    let cancelled = false;
    setIsResolvingBatch(true);
    fetchBatchContext(submissionId, endIso)
      .then((ctx) => { if (!cancelled) setBatch(ctx); })
      .finally(() => { if (!cancelled) setIsResolvingBatch(false); });
    return () => { cancelled = true; };
  }, [endIso, submissionId]);

  const plan = newSchedulePlan({
    selected: picked,
    availabilityReady: availability.isReady,
    batch,
    isResolvingBatch,
    prizePerWinner,
    winnerCount,
    isSaving,
  });

  /*
    Estimasi biaya — blok RINCIAN yang rencana taruh di antara kalender dan
    tombol.

    ⚠️ MODAL YANG DIGANTI HALAMAN INI TIDAK PUNYA HARGA SAMA SEKALI. Peneliti
    mengunci tanggal — tindakan yang melahirkan tagihan — tanpa pernah melihat
    satu angka pun.

    ⚠️ Menghitung NOL di sini: `draftScheduleMoney` menyerahkannya ke
    `deriveScheduleMoney`, sumber yang sama dengan kartu jadwal & halaman bayar.
    Gerbang hadiah (`fundsPrizePool`, sql/37) ikut terbawa, jadi perpanjangan
    batch lama TIDAK menawarkan hadiah yang tidak akan ditagih.
  */
  const money = draftScheduleMoney({
    ordinal,
    duration,
    isNewBatch: plan.needsReward,
    prizePerWinner,
    winnerCount,
    questionCount: submission?.question_count ?? null,
    distributionType: submission?.distribution_type ?? null,
    // Voucher melekat ke ORDER dan diwariskan; layar ini tidak punya input.
    voucherCode: submission?.voucher_code ?? null,
  });

  // Prefill hadiah dari jadwal sebelumnya, hanya bila batch-nya memang baru.
  useEffect(() => {
    if (!plan.needsReward || !submission) return;
    setPrizePerWinner((v) => (v > 0 ? v : Number(submission.prize_per_winner) || 0));
    setWinnerCount((v) => (v > 0 ? v : Number(submission.winner_count) || 0));
  }, [plan.needsReward, submission]);

  const seg = useMemo(
    () => segmentTitleOf({ phase: 'reservation', ordinal }),
    [ordinal],
  );

  const handleLock = async () => {
    if (!submissionId || !picked || !startIso || !endIso) return;

    /*
      ⚠️ GERBANG YANG SAMA dengan tiga pemanggil lain
      (`utils/scheduleLockGate.ts`), dan dievaluasi saat DITEKAN.

      Kalender memang mengunci tanggal lewat-cutoff, tapi gambarnya dibuat
      SEKALI: peneliti yang membuka layar 12.58 dan menekan kunci 13.01
      mengirim tanggal yang sudah tidak sah.
    */
    const verdict = scheduleLockGate({
      selected: picked,
      duration,
      availability,
    });
    if (!verdict.ok) {
      toast.error(t(verdict.messageKey));
      if (verdict.clearSelection) setPicked(null);
      if (verdict.shouldReload) void availability.reload();
      return;
    }
    if (!plan.canSubmit) {
      if (plan.block) toast.error(t(NEW_SCHEDULE_BLOCK_KEY[plan.block]));
      return;
    }

    setIsSaving(true);
    try {
      // 1. Jadwalnya lahir di server. Seluruh aturan kelayakan ada di sana.
      const { data: sourceId, error } = await supabase.rpc('create_ad_schedule', {
        p_submission_id: submissionId,
        p_start_date: startIso,
        p_end_date: endIso,
        p_duration: duration,
        p_prize_per_winner: plan.needsReward ? prizePerWinner : 0,
        p_winner_count: plan.needsReward ? winnerCount : 0,
        p_additional_prize_per_winner: 0,
        p_is_new_period: plan.needsReward,
      });
      if (error) throw error;
      if (!sourceId) throw new Error('create_ad_schedule tidak memulangkan id jadwal.');

      // 2. ⚠️ `create_ad_schedule` memulangkan `source_id`, sementara halaman
      //    jadwal & resolver `/bayar/` dikunci ke `ad_schedules.id`.
      const scheduleId = await scheduleIdFromSourceId(String(sourceId));
      if (!scheduleId) throw new Error('Jadwal tersimpan, tetapi id-nya tidak terbaca.');

      // 3. Tagihan lahir SEKARANG. `amount: 0` — server yang menghitung.
      await createPayment({
        formSubmissionId: submissionId,
        scheduleId,
        amount: 0,
        customerInfo: {
          title: submission?.title || 'Survey',
          fullName: submission?.full_name || 'Pengguna',
          email: submission?.email || 'user@example.com',
          phoneNumber: submission?.phone_number || '-',
        },
      });

      /*
        Mendarat di halaman jadwal — countdown, rincian harga, tombol bayar.
        Sebelumnya `window.location.assign` melempar langsung ke DOKU lewat
        reload putih, dan peneliti tidak pernah melihat satu pun dari ketiganya.
      */
      toast.success(t('scheduleAgainCreated'));
      navigate(`/dashboard/jadwal/${scheduleId}`, { replace: true });
    } catch (e: any) {
      /*
        ⚠️ DUA CABANG HASIL yang sudah benar di modal, dipertahankan.
        `needs_admin_invoice`: jadwalnya LAHIR, tagihannya menyusul manual —
        jadi ini kabar, bukan kegagalan.
      */
      if (e?.response?.data?.needs_admin_invoice) {
        toast.info(t('scheduleAgainNeedsAdmin'));
        navigate('/dashboard', { replace: true });
        return;
      }
      const serverMsg = e?.response?.data?.error || e?.message;
      console.error('[JadwalBaruPage] gagal mengunci jadwal:', e);
      toast.error(serverMsg || t('scheduleAgainFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="pt-24 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-jfu-primary" />
      </div>
    );
  }

  if (notFound || !submission) {
    return (
      <div className="max-w-3xl mx-auto px-6 pt-24 text-center space-y-4">
        <p className="text-sm text-slate-600">{t('paymentSubmissionNotFound')}</p>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 text-sm font-semibold text-jfu-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> {t('backToOrders')}
        </button>
      </div>
    );
  }

  return (
    <ScheduleReservationLayout
      onBack={() => navigate('/dashboard')}
      backLabel={t('backToOrders')}
      isBusy={isSaving}
      orderLabel={`${submission.title}${bookingId ? ` · #${bookingId}` : ''}`}
      title={t(seg.key, seg.vars)}
      subtitle={t('scheduleSubtitle')}
      duration={
        /* Lama tayang */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">{t('scheduleAgainDuration')}</span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-jfu-primary border border-blue-100">
              {duration} {t('scheduleAgainDays')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1.5 flex-1">
              {DURATION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={isSaving}
                  onClick={() => setDuration(preset)}
                  className={`min-h-10 px-4 rounded-xl font-bold text-sm transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 disabled:opacity-50 ${
                    duration === preset
                      ? 'bg-jfu-primary text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {preset} {t('scheduleAgainDays')}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-xl p-1 shrink-0">
              <button
                type="button"
                disabled={isSaving || duration <= 1}
                onClick={() => setDuration((p) => Math.max(1, p - 1))}
                aria-label={t('scheduleAgainDurationLess')}
                className="w-10 h-10 rounded-lg bg-white hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary disabled:opacity-40 cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                min={1}
                max={30}
                value={duration}
                onChange={(e) => setDuration(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                disabled={isSaving}
                aria-label={t('scheduleAgainDuration')}
                className="w-12 h-10 text-center font-bold text-slate-900 bg-transparent text-sm rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary"
              />
              <button
                type="button"
                disabled={isSaving || duration >= 30}
                onClick={() => setDuration((p) => Math.min(30, p + 1))}
                aria-label={t('scheduleAgainDurationMore')}
                className="w-10 h-10 rounded-lg bg-white hover:bg-slate-200 flex items-center justify-center text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

      }
      calendar={
        /* Tanggal — ⚠️ SchedulePicker, kalender PENELITI. Modal lama memakai
            SlotCalendar yang `isAdmin`-nya default `true`. */
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-900">{t('scheduleAgainPickDate')}</span>
            {!availability.isLoading && availability.hasError && (
              <button
                type="button"
                onClick={() => void availability.reload()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('slotAvailabilityRetry')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{t('scheduleCutoffNote')}</span>
          </div>
          <SchedulePicker
            availability={availability}
            duration={duration}
            mode="regular"
            value={picked}
            onChange={setPicked}
          />
        </div>

      }
      reward={
        <>
          {/* Hadiah — HANYA batch baru. Batch lama ikut kolam yang sudah didanai;
              menanyakan hadiah lagi di sana menagih dua kali. */}
          {plan.needsReward && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
              <p className="text-sm font-bold text-amber-900 flex items-center gap-2">
                <Gift className="w-4 h-4 text-amber-600 shrink-0" />
                {t('scheduleAgainRewardTitle')}
              </p>
              <p className="text-sm leading-relaxed text-amber-800">{t('scheduleAgainRewardWhy')}</p>
              {/* ⚠️ TANPA `grid-cols-1`. `styles.css` warisan mendefinisikan
                  `.grid-cols-1 { grid-template-columns: 1fr }` polos dan dimuat
                  sesudah Tailwind, jadi ia mengalahkan `sm:grid-cols-2` pada
                  spesifisitas sama — panel ini tetap satu kolom di SEMUA lebar.
                  Grid tanpa kelas kolom sudah default satu kolom, jadi membuangnya
                  memulihkan breakpoint. Pola yang sama sudah dipakai 3x di
                  AnalyticsDashboard.tsx. Jarak juga inline, sebab yang sama. */}
              <div className="grid sm:grid-cols-2" style={{ gap: '0.75rem' }}>
                <div className="space-y-1.5">
                  <label htmlFor="baru-prize" className="text-xs font-bold text-amber-900 block">
                    {t('scheduleAgainRewardPrize')}
                  </label>
                  <input
                    id="baru-prize"
                    type="number"
                    min={0}
                    value={prizePerWinner || ''}
                    onChange={(e) => setPrizePerWinner(Math.max(0, Number(e.target.value) || 0))}
                    disabled={isSaving}
                    className="h-10 w-full px-3 text-sm border border-amber-300 rounded-xl bg-white text-gray-900 focus-visible:border-jfu-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary/30 font-semibold tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="baru-winners" className="text-xs font-bold text-amber-900 block">
                    {t('scheduleAgainRewardWinners')}
                  </label>
                  <input
                    id="baru-winners"
                    type="number"
                    min={0}
                    value={winnerCount || ''}
                    onChange={(e) => setWinnerCount(Math.max(0, Number(e.target.value) || 0))}
                    disabled={isSaving}
                    className="h-10 w-full px-3 text-sm border border-amber-300 rounded-xl bg-white text-gray-900 focus-visible:border-jfu-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary/30 font-semibold tabular-nums"
                  />
                </div>
              </div>
              {prizePerWinner > 0 && winnerCount > 0 && (
                <div className="pt-2 flex items-center justify-between border-t border-amber-200 text-xs">
                  <span className="text-amber-800 font-medium">{t('scheduleAgainTotalPrize')}</span>
                  <span className="font-extrabold text-amber-950 font-mono">
                    {formatIDR(prizePerWinner * winnerCount)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Batch lama: katakan kenapa tidak ada panel hadiah. */}
          {batch && !plan.needsReward && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-start gap-2.5 text-sm text-slate-600">
              <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{t('scheduleAgainPoolReused')}</p>
            </div>
          )}

        </>
      }
      cost={
        /* RINCIAN — di antara kalender dan tombol, seperti rencana.
            ⚠️ `defaultOpen` untuk perpanjangan: tidak ada Ringkasan di
            belakangnya, jadi layar ini SATU-SATUNYA tempat harga pernah muncul.
            ⚠️ Berlabel "estimasi", bukan tagihan — `recordedVsBilled`
            membuktikan `total_cost` bisa menyimpang dari `invoices.amount`. */
        <CostBreakdown
          total={money.total}
          lines={money.lines}
          note={money.note}
          isEstimate={money.isEstimate}
          variant="compact"
          defaultOpen
        />

      }
      blockedReason={
        plan.block && plan.block !== 'saving' ? (
          <p className="flex items-start gap-1.5 text-sm text-slate-500">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span>{t(NEW_SCHEDULE_BLOCK_KEY[plan.block])}</span>
          </p>
        ) : null
      }
      cta={
        <button
          type="button"
          onClick={handleLock}
          disabled={!plan.canSubmit}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock size={15} />}
          {isSaving ? t('scheduleAgainBooking') : t('scheduleLockCta')}
        </button>
      }
    />
  );
}
