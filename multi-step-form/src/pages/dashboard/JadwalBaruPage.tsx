import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, CheckCircle2, ChevronDown, Gift, Info, Loader2, Lock, PlusCircle, RefreshCw, Trophy,
} from 'lucide-react';
import { getFormSubmissionById, fetchAdSchedules, cancelSchedule, createResearcherExtension } from '../../utils/supabase';
import type { FormSubmission, AdScheduleEntry } from '../../utils/supabase';
import { useLanguage } from '../../i18n/LanguageContext';

function formatBatchPeriod(batchStr?: string | null, lang: 'id' | 'en' = 'id'): string {
  if (!batchStr) return '—';
  const parts = batchStr.split('-');
  if (parts.length >= 2) {
    const year = parts[0];
    const monthIdx = parseInt(parts[1], 10) - 1;
    const monthsId = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const monthsEn = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const months = lang === 'en' ? monthsEn : monthsId;
    if (months[monthIdx]) {
      return `${months[monthIdx]} ${year}`;
    }
  }
  return batchStr;
}

function renderHighlightedText(text: string) {
  if (!text.includes('**')) return text;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
import { SchedulePicker } from '../../components/SchedulePicker';
import { DurationPicker } from '../../components/DurationPicker';
import { useSlotAvailability } from '../../hooks/useSlotAvailability';
import { scheduleLockGate } from '../../utils/scheduleLockGate';
import { isDailyQuotaFullError } from '../../utils/dailyQuotaError';
import { newSchedulePlan } from '../../utils/newSchedulePlan';
import { segmentTitleOf } from '../../utils/segmentTitle';
import { fetchBatchContext, scheduleIdFromSourceId, type BatchContext } from '../../utils/batchContext';
import { toAiringEndIso, toAiringStartIso, toWibYmd } from '../../utils/airing-window';
import { airingDayCount } from './schedule/scheduleModel';
import { createPayment } from '../../utils/payment';
import { slotReleaseDeadline } from '../../utils/slotHold';
import { formatIDR } from '../../utils/currency';
import { CostBreakdown } from '../../components/CostBreakdown';
import { ScheduleReservationLayout, TicketSkeleton } from '../../components/schedule/ScheduleReservationLayout';
import { TicketStub, MobileBarInfo, useAiringRange } from '../../components/schedule/ReservationParts';
import { useLockFeedback } from '../../components/schedule/useLockFeedback';
import { lockGateFeedback, newScheduleBlockFeedback, newScheduleZoneHint, isStaleBlockFeedback } from '../../utils/reservationTicket';
import { draftScheduleMoney } from '../../utils/draftScheduleMoney';
import { InfoTooltip } from '@/components/status/InfoTooltip';
import { RewardRecommendationHint } from '../../components/RewardRecommendationHint';
import { getRecommendedPrize } from '../../utils/prizeRecommendation';
import {
  FieldRow,
  fieldInputClass,
  fieldRowListClass,
} from '../../components/SurveyFieldRow';
import { lockRollbackDecision } from '../../utils/lockRollback';
import { useAuth } from '@/context/AuthContext';
import { canUseKilatSelfServe } from '../../utils/kilatAccess';
import { KilatWavePicker } from '../../components/KilatWavePicker';
import { useKilatWaveAvailability } from '../../hooks/useKilatWaveAvailability';
import { bookingBlockedReason } from '../../utils/bookingFull';
import { BookingFullNotice } from '../../components/schedule/BookingFullNotice';
import { kilatLockGate, kilatWaveErrorMessageKey, formatWaveHour, type KilatWaveDraft } from '../../utils/kilatWaves';
import { kilatWaveErrorKind } from '../../utils/dailyQuotaError';
import { kilatWaveInstant } from '../../utils/airing-window';
import { billExpiryFor } from '../../utils/jadwalBayarGates';
import { kilatWaveClashesOwn } from '../../utils/canScheduleAgain';
import { awayBlocksKilatPick, awayGuard, awayGuardWouldOpen } from '../../components/status/AdminAwayModal';
import { useAdminAway } from '../../utils/operationalHolidays';
import { isSelfBookingClosedError, refreshSelfBookingClosure, useSelfBookingClosure } from '../../utils/selfBookingClosure';
import { SelfBookingNotice } from '../../components/order/SelfBookingNotice';

const DAY_MS = 24 * 60 * 60 * 1000;

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
 *
 * Phase 5 §5.10 (R8) — "Pesan gelombang lagi" untuk order KILAT memakai jalur
 * yang SAMA (`create_ad_schedule` → `createPayment`). Dua pengecualian Kilat
 * yang sama dengan wizard: tanpa pilihan durasi, dan kalender hari diganti
 * `KilatWavePicker`. Bentuk barisnya (jam gelombang, +24 jam, durasi 1)
 * dipaksa server (sql/119), bukan dipercayakan ke layar ini.
 */

export function JadwalBaruPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  /*
    Reservasi mandiri ditutup (sql/125): perpanjangan mandiri ikut ditutup —
    halaman ini (juga lewat URL langsung / CTA Mimin) menampilkan catatan 🔒,
    bukan kalender. Cap order TIDAK dibaca di sini: perpanjangan order bercap
    di kemudian hari mengikuti saklar saja (keputusan 22 Okt).
  */
  const selfBookingClosure = useSelfBookingClosure();

  const [submission, setSubmission] = useState<FormSubmission | null>(null);
  /** Semua jadwal order ini — teguran dini jarak 24 jam antargelombang Kilat. */
  const [entries, setEntries] = useState<AdScheduleEntry[]>([]);
  const [latestSchedule, setLatestSchedule] = useState<AdScheduleEntry | null>(null);
  const [ordinal, setOrdinal] = useState(2);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [duration, setDuration] = useState(2);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedWave, setPickedWave] = useState<KilatWaveDraft | null>(null);
  const [prizePerWinner, setPrizePerWinner] = useState(0);
  const [winnerCount, setWinnerCount] = useState(0);
  const [showOptionalReward, setShowOptionalReward] = useState(false);
  const [additionalPrize, setAdditionalPrize] = useState(0);
  const [batch, setBatch] = useState<BatchContext | null>(null);
  const [isResolvingBatch, setIsResolvingBatch] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  /** Teguran zona kunci tiket — inline + toast dari kunci yang sama. */
  const feedback = useLockFeedback();

  /*
    ⚠️ `excludeSubmissionId` TIDAK dioper. Order ini sedang menambah jadwal
    BERIKUTNYA, jadi jadwal-jadwal sebelumnya tetap memakan kuota hari yang
    mereka tempati — mengecualikannya menampilkan hari yang sebenarnya penuh
    sebagai lowong, dan `assert_daily_ad_quota_free` (sql/86) menolaknya di
    server sesudah penelitinya terlanjur memilih.
  */
  const availability = useSlotAvailability('regular');

  /*
    Kilat: mode dipilih dari KOLOM ORDER — kolom yang sama yang dibaca
    `create_ad_schedule` dan `pricingRowForSchedule`.

    ⚠️ `excludeSubmissionId` TIDAK dioper, alasan yang sama dengan kalender
    Iklan di atas: gelombang pertama order ini tetap memakan kursinya.
  */
  const isKilat = submission?.distribution_type === 'kilat';
  const waves = useKilatWaveAvailability(undefined, isKilat);
  /** Satu pemesanan Kilat = satu gelombang. Tidak pernah tampil (keputusan 7 Okt). */
  const effDuration = isKilat ? 1 : duration;

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
        setEntries(entries);

        /*
          Lama tayang jadwal berikutnya ditebak dari jadwal PERTAMA.

          ⚠️ DITURUNKAN DARI start→end LEWAT `airingDaysOf`, bukan dari kolom
          `duration` — kolom itu bisa berbohong (18 dari 992 baris meleset di
          produksi), jadi ia cuma cadangan. `airingDaysOf` juga yang memegang
          aturan akhir-eksklusif dan penjaga data rusak; menghitungnya ulang di
          sini akan jadi salinan kedua yang bisa berbeda pendapat.
        */
        const first = entries.find((e) => e.ordinal === 1) ?? entries[0];
        const latest = entries.length > 0 ? entries[entries.length - 1] : null;
        setLatestSchedule(latest);
        // Default durasi perpanjangan adalah 2 hari sesuai preferensi pengguna
        setDuration(2);
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

  const kilatPick = isKilat && pickedWave?.hour != null ? { ymd: pickedWave.ymd, hour: pickedWave.hour } : null;
  const kilatStartMs = kilatPick ? kilatWaveInstant(kilatPick.ymd, kilatPick.hour).getTime() : null;
  const startIso = isKilat
    ? (kilatStartMs !== null ? new Date(kilatStartMs).toISOString() : null)
    : (picked ? toAiringStartIso(picked) : null);
  const endIso = isKilat
    ? (kilatStartMs !== null ? new Date(kilatStartMs + DAY_MS).toISOString() : null)
    : (picked ? toAiringEndIso(picked, duration) : null);

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
    selected: isKilat ? (kilatPick?.ymd ?? null) : picked,
    availabilityReady: isKilat ? waves.isReady : availability.isReady,
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
  const prevPeriodBatch = useMemo(() => {
    if (latestSchedule?.periodBatch) return latestSchedule.periodBatch;
    if (latestSchedule?.endDate) return latestSchedule.endDate.slice(0, 7);
    if (submission?.end_date) return submission.end_date.slice(0, 7);
    return null;
  }, [latestSchedule, submission]);

  const currentPeriodBatch = useMemo(() => {
    if (batch?.periodBatch) return batch.periodBatch;
    if (endIso) return endIso.slice(0, 7);
    return null;
  }, [batch?.periodBatch, endIso]);

  const prevPeriodLabel = useMemo(
    () => formatBatchPeriod(prevPeriodBatch, language as 'id' | 'en'),
    [prevPeriodBatch, language],
  );

  const currentPeriodLabel = useMemo(
    () => formatBatchPeriod(currentPeriodBatch, language as 'id' | 'en'),
    [currentPeriodBatch, language],
  );

  const prevPrizePerWinner =
    batch && batch.poolPrizePerWinner > 0
      ? batch.poolPrizePerWinner
      : (latestSchedule && latestSchedule.prizePerWinner > 0
          ? latestSchedule.prizePerWinner
          : Number(submission?.prize_per_winner) || 0);

  const prevWinnerCount =
    batch && batch.poolWinnerCount > 0
      ? batch.poolWinnerCount
      : (latestSchedule && latestSchedule.winnerCount > 0
          ? latestSchedule.winnerCount
          : Number(submission?.winner_count) || 0);

  const prevTotalPrize = prevPrizePerWinner * prevWinnerCount;

  const hasExtraReward = !plan.needsReward && showOptionalReward && additionalPrize > 0;
  const willFundReward = plan.needsReward || hasExtraReward;
  const activePrize = plan.needsReward ? prizePerWinner : (hasExtraReward ? additionalPrize : 0);
  const activeWinners = plan.needsReward ? winnerCount : (hasExtraReward ? prevWinnerCount : 0);

  const money = draftScheduleMoney({
    ordinal,
    duration: effDuration,
    isNewBatch: willFundReward,
    prizePerWinner: activePrize,
    winnerCount: activeWinners,
    questionCount: submission?.question_count ?? null,
    distributionType: submission?.distribution_type ?? null,
    // Voucher melekat ke ORDER dan diwariskan; layar ini tidak punya input.
    voucherCode: submission?.voucher_code ?? null,
    orderCreatedAt: submission?.created_at ?? null,
  });

  // Prefill hadiah dari jadwal sebelumnya, hanya bila batch-nya memang baru.
  useEffect(() => {
    if (!plan.needsReward || !submission) return;
    const fallbackPrize = getRecommendedPrize(submission.question_count || 0);
    setPrizePerWinner((v) => (v > 0 ? v : (prevPrizePerWinner > 0 ? prevPrizePerWinner : Number(submission.prize_per_winner) || fallbackPrize)));
    setWinnerCount((v) => (v > 0 ? v : (prevWinnerCount > 0 ? prevWinnerCount : Number(submission.winner_count) || 2)));
  }, [plan.needsReward, submission, prevPrizePerWinner, prevWinnerCount]);

  const seg = useMemo(
    () => segmentTitleOf({ phase: 'reservation', ordinal }),
    [ordinal],
  );

  /*
    Jadwal TERAKHIR order ini — baris "Jadwal terakhir" di sobekan dan titik
    penanda di kalender. Hari WIB + panjang dari start→end (`airingDayCount`),
    bukan `startDate.slice(0, 10)`: kolomnya TIMESTAMPTZ, `end_date`
    akhir-eksklusif, dan `duration` bisa berbohong. Jadwal yang sudah batal
    tidak ditandai — ia tidak lagi jatuh di mana pun.
  */
  const latestShown = latestSchedule?.startDate
    && !['cancelled', 'slot_cancelled'].includes((latestSchedule.status || '').toLowerCase())
    ? latestSchedule
    : null;
  const latestYmd = latestShown?.startDate ? toWibYmd(new Date(latestShown.startDate)) : null;
  const latestDays = latestShown
    ? (airingDayCount(latestShown.startDate, latestShown.endDate) ?? latestShown.duration ?? 1)
    : 1;
  const latestRange = useAiringRange(latestYmd, latestDays);

  const pickDate = (ymd: string) => { setPicked(ymd); feedback.clear(); };
  const pickWave = (next: KilatWaveDraft) => { setPickedWave(next); feedback.clear(); };
  const pickDuration = (days: number) => { setDuration(days); feedback.clear(); };

  // Teguran blok yang sebabnya sudah hilang (hadiah kini terisi, periode selesai
  // dibaca) dicabut sendiri — tidak menunggu tombol diklik lagi.
  const { error: feedbackError, clear: clearFeedback } = feedback;
  useEffect(() => {
    if (isStaleBlockFeedback(feedbackError?.key ?? null, plan.block)) clearFeedback();
  }, [feedbackError, plan.block, clearFeedback]);

  const handleLock = async () => {
    // ⚠️ Tanggal kosong TIDAK lagi pulang diam — gerbang di bawah menegurnya.
    if (!submissionId) return;
    // Mode libur (sql/122): gelombang Kilat tidak bisa dipesan mandiri.
    if (isKilat && awayBlocksKilatPick({ leave: true })) return;

    /*
      ⚠️ GERBANG YANG SAMA dengan tiga pemanggil lain
      (`utils/scheduleLockGate.ts`), dan dievaluasi saat DITEKAN.

      Kalender memang mengunci tanggal lewat-cutoff, tapi gambarnya dibuat
      SEKALI: peneliti yang membuka layar 12.58 dan menekan kunci 13.01
      mengirim tanggal yang sudah tidak sah.
    */
    /*
      Kilat: gerbang gelombang yang SAMA dengan Step 3 wizard dan Jadwal &
      Bayar (`kilatLockGate`), ditambah teguran dini jarak 24 jam terhadap
      gelombang order ini sendiri — penegaknya tetap server.
    */
    let wave: { ymd: string; hour: number } | null = null;
    if (isKilat) {
      const v = kilatLockGate(pickedWave, waves);
      if (!v.ok) {
        feedback.report(
          { key: v.messageKey, tone: v.reason === 'no_date' || v.reason === 'no_wave' ? 'warning' : 'error' },
          { scroll: true },
        );
        if (v.clearSelection && pickedWave) setPickedWave({ ymd: pickedWave.ymd, hour: null });
        if (v.shouldReload) void waves.reload();
        return;
      }
      if (kilatWaveClashesOwn(v, entries)) {
        feedback.report({ key: 'kilatExtendTooClose', tone: 'error' }, { scroll: true });
        setPickedWave({ ymd: v.ymd, hour: null });
        return;
      }
      wave = { ymd: v.ymd, hour: v.hour };
    } else {
      const verdict = scheduleLockGate({
        selected: picked,
        duration,
        availability,
      });
      if (!verdict.ok) {
        feedback.report(lockGateFeedback(verdict), { scroll: true });
        if (verdict.clearSelection) setPicked(null);
        if (verdict.shouldReload) void availability.reload();
        return;
      }
    }
    if (!plan.canSubmit) {
      // Hadiah kosong = warning; periode belum/gagal terbaca = error.
      // `saving` bukan teguran (tombolnya memang sedang bekerja).
      const fb = newScheduleBlockFeedback(plan.block);
      if (fb) feedback.report(fb, { scroll: true });
      return;
    }
    // Lolos gerbang = `picked` ada, jadi keduanya terisi. Penjaga tipe saja.
    if (!startIso || !endIso) return;

    /*
      Mode libur: modal D sebelum mengunci (mengunci = langsung ke tagihan).
      Gerbang di atas sudah lolos; "Lanjutkan" mencatat ack, jadi panggilan
      ulang ini melewati modal dan menjalankan gerbang sekali lagi.
    */
    if (!isKilat && awayGuardWouldOpen()) {
      const schedule = new Date(startIso).toLocaleDateString(language === 'en' ? 'en-US' : 'id-ID', {
        weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta',
      });
      awayGuard({ kind: 'pay', product: 'ads', schedule }, () => { void handleLock(); });
      return;
    }

    feedback.clear();
    setIsSaving(true);
    /*
      ⚠️ DIDEKLARASIKAN DI LUAR `try` DENGAN SENGAJA. Mengunci jadwal adalah dua
      tulisan tanpa transaksi, dan blok `catch` di bawah adalah satu-satunya
      tempat yang tahu jadwalnya sudah terlanjur lahir. Kalau nilai ini hidup
      di dalam `try`, informasi itu hilang persis ketika dibutuhkan.
    */
    let bornSourceId: string | null = null;
    try {
      // 1. Jadwalnya lahir di server. Seluruh aturan kelayakan ada di sana.
      //    Lewat pintu jadwal (sql/123), bukan RPC dari browser.
      const sourceId = await createResearcherExtension({
        submissionId,
        startDate: startIso,
        endDate: endIso,
        duration: effDuration,
        prizePerWinner: willFundReward ? activePrize : 0,
        winnerCount: willFundReward ? activeWinners : 0,
        isNewPeriod: willFundReward,
      });
      if (!sourceId) throw new Error('create_ad_schedule tidak memulangkan id jadwal.');
      bornSourceId = String(sourceId);

      // 2. ⚠️ `create_ad_schedule` memulangkan `source_id`, sementara halaman
      //    jadwal & resolver `/bayar/` dikunci ke `ad_schedules.id`.
      const scheduleId = await scheduleIdFromSourceId(String(sourceId));
      if (!scheduleId) throw new Error('Jadwal tersimpan, tetapi id-nya tidak terbaca.');

      /*
        3. Tagihan lahir SEKARANG. `amount: 0` — server yang menghitung.

        ⚠️ `expiredAt` WAJIB DIKIRIM, dan ini bukan kosmetik.
        `payment_due_date` DOKU adalah DURASI MENIT SEJAK LINK DIBUAT, bukan
        sebuah instant (`create-payment.js`, satuannya dinyatakan di
        `checkout.js`). Tanpa `expiredAt`, `createPayment` memakai 60 menit
        tetap — jadi link yang lahir di detik terakhir hold akan hidup satu jam
        PENUH melewati tenggat slotnya.

        Akibatnya bukan sekadar angka yang tidak cocok: peneliti bisa membayar
        lewat link yang masih hidup untuk slot yang sudah dilepas. Uangnya tidak
        hilang — webhook menolaknya sebagai `paid_on_dead_bill` dan mengirim
        alert — tapi hasilnya tiket manual, dan peneliti melihat "pembayaran
        berhasil" sementara jadwalnya tidak menyala.

        Jadwal ini BARU SAJA lahir lewat `create_ad_schedule`, yang menulis
        `slot_reserved_at = now()` dan `slot_booked_by = 'user'`. Jadi
        tenggatnya `now + SLOT_HOLD_MS`, dan kita menghitungnya lewat
        `slotReleaseDeadline()` — sumber tunggal aturan hold — bukan dengan
        menjumlah 3_600_000 dengan tangan untuk keenam kalinya.
      */
      const reservedAt = new Date().toISOString();
      /*
        Kilat: link juga tidak boleh hidup melewati gelombang − 60 menit —
        `billExpiryFor` mengambil yang lebih dulu dari hold dan batas bayar
        (R6). Server memangkasnya lagi (`kilatPaymentGate`).
      */
      const holdDeadline = wave
        ? billExpiryFor({ slotBookedBy: 'user', slotReservedAt: reservedAt, lockedYmd: wave.ymd, kilatHour: wave.hour }).getTime()
        : slotReleaseDeadline({ slotBookedBy: 'user', slotReservedAt: reservedAt });

      await createPayment({
        formSubmissionId: submissionId,
        scheduleId,
        amount: 0,
        ...(holdDeadline !== null
          ? { expiredAt: new Date(holdDeadline).toISOString() }
          : {}),
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
      const needsAdminInvoice = !!e?.response?.data?.needs_admin_invoice;

      /*
        ── KOMPENSASI: kegagalan tidak boleh meninggalkan jadwal yatim ──────
        Tanpa blok ini, `createPayment` yang gagal meninggalkan baris
        `waiting_payment` tanpa tagihan — dan baris itu MEMAKAN KUOTA HARIAN
        (`assert_daily_ad_quota_free` menghitung menurut status). Peneliti lalu
        diblokir oleh slot miliknya sendiri yang tidak pernah bisa dibayar.

        Dilepas lewat `cancelSchedule()` yang SUDAH ADA — primitif yang sama
        yang dipakai layar pembatalan, jadi ia sudah lolos policy RLS "Peneliti
        melepas reservasinya sendiri". Menulis pelepasan kedua di sini akan
        jadi salinan yang menyimpang, persis jebakan `sync_ad_schedule`.
      */
      const rollback = lockRollbackDecision({
        sourceId: bornSourceId,
        needsAdminInvoice,
      });
      let orphanLeft = false;
      if (rollback.action === 'release') {
        try {
          await cancelSchedule({
            submissionId,
            sourceId: rollback.sourceId,
            isExtension: true,
            paymentStatus: null,
          });
        } catch (rollbackError) {
          /*
            ⚠️ JANGAN DIAM. Rollback yang gagal berarti jadwalnya hidup tanpa
            tagihan dan hanya admin yang bisa membereskannya. Menelan galat ini
            mengembalikan kita persis ke kebocoran yang sedang ditutup — bedanya
            sekarang kita TAHU dan tetap tidak memberi tahu siapa pun.
          */
          console.error('[JadwalBaruPage] rollback jadwal yatim GAGAL:', rollbackError);
          orphanLeft = true;
        }
      }

      if (needsAdminInvoice) {
        toast.info(t('scheduleAgainNeedsAdmin'));
        navigate('/dashboard', { replace: true });
        return;
      }

      console.error('[JadwalBaruPage] gagal mengunci jadwal:', e);

      // Saklar ditutup sesudah halaman terbuka (pintu 409 / trigger sql/125): jadwalnya
      // tidak pernah lahir; store disegarkan dan halaman berganti catatan 🔒.
      if (!orphanLeft && isSelfBookingClosedError(e)) {
        void refreshSelfBookingClosure();
        toast.error(t('selfBookingClosedToast'));
        return;
      }

      /*
        Gelombang ditolak server (sql/117 kuota, sql/119 klaim). ⚠️ SEBELUM
        `isDailyQuotaFullError`: pesan gelombang penuh juga memuat "sudah
        penuh" dan akan tertelan sebagai kuota harian Iklan.
      */
      const waveKind = isKilat ? kilatWaveErrorKind(e) : null;
      if (!orphanLeft && waveKind) {
        feedback.report({ key: kilatWaveErrorMessageKey(waveKind), tone: 'error' }, { scroll: true });
        setPickedWave((w) => (w ? { ymd: w.ymd, hour: null } : null));
        void waves.reload();
        return;
      }

      // Hari itu penuh menurut server (create_ad_schedule / trigger sql/111),
      // padahal kalender di layar ini masih menampilkannya lowong. Jadwalnya
      // tidak pernah lahir, jadi tidak ada yang perlu dikompensasi.
      if (!orphanLeft && isDailyQuotaFullError(e)) {
        // Teguran yang SAMA dengan penolakan klien `range_full`.
        feedback.report({ key: 'slotErrorFull', tone: 'error' }, { scroll: true });
        setPicked(null);
        void availability.reload();
        return;
      }

      const serverMsg = e?.response?.data?.error || e?.message;
      toast.error(
        orphanLeft
          ? t('scheduleAgainOrphanLeft')
          : (serverMsg || t('scheduleAgainFailed')),
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Bingkai tiket yang sama, berdenyut — bukan spinner di tengah layar.
  /*
    Mode libur (sql/122): halaman ini untuk Kilat ADALAH pemilih gelombang —
    modal F begitu dibuka (juga lewat URL langsung / CTA Mimin), dan grid
    diganti kartu pemberitahuan.
  */
  const awayNow = useAdminAway();
  const kilatAwayWarned = useRef(false);
  useEffect(() => {
    if (!awayNow || !isKilat || kilatAwayWarned.current) return;
    kilatAwayWarned.current = true;
    awayBlocksKilatPick({ leave: true });
  }, [awayNow, isKilat]);

  if (isLoading) return <TicketSkeleton />;

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

  /*
    ⚠️ PENJAGA KILAT — pintu yang sama dengan kartu Kilat
    (`canUseKilatSelfServe`). Kartu "Pesan gelombang lagi" sudah tersembunyi
    selama pintu tertutup (`SchedulePhase`), tapi alamat ini bisa dibuka
    langsung. Selama `KILAT_TARIFF_FROM` masih `null`, gelombang tambahan
    dihargai rumus lama — jadi jangan dijual sebelum Push B.
  */
  if (isKilat && !canUseKilatSelfServe(user?.email)) {
    return (
      <div className="max-w-3xl mx-auto px-6 pt-24 text-center space-y-4">
        <p className="text-sm text-slate-600">{t('kilatExtendNotYet')}</p>
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

  if (selfBookingClosure) {
    return (
      <div className="max-w-2xl mx-auto px-6 pt-24 space-y-5">
        <SelfBookingNotice variant="extend" closure={selfBookingClosure} />
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 rounded-xl bg-jfu-primary px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
        >
          <ArrowLeft className="w-4 h-4" /> {t('backToOrders')}
        </button>
      </div>
    );
  }

  /*
    Kuota penuh (27 Okt 2026): jadwal tambahan untuk order yang SUDAH ADA —
    cap "jadwal oleh tim" tidak bisa dipasang peneliti, jadi kartunya
    menunjuk "Tanya Mimin" (pola SelfBookingNotice varian extend).
  */
  const fullReason = bookingBlockedReason({
    isKilat,
    waves: awayNow ? { ...waves, adminAway: true } : waves,
    availability,
    duration,
  });
  const fullNotice = fullReason ? (
    <BookingFullNotice product={isKilat ? 'kilat' : 'regular'} reason={fullReason} durationDays={duration} action="mimin" />
  ) : null;

  return (
    <ScheduleReservationLayout
      onBack={() => navigate('/dashboard')}
      backLabel={t('backToOrdersShort')}
      isBusy={isSaving}
      title={t(seg.key, seg.vars)}
      cardTitle={isKilat ? t('kilatWavePickWave') : t('scheduleCardExtensionTitle')}
      feedback={feedback}
      stub={
        <TicketStub
          title={submission.title || undefined}
          bookingId={bookingId}
          tag={t('scheduleExtensionPrefix')}
          locked={false}
          startYmd={isKilat ? (pickedWave?.ymd ?? null) : picked}
          days={effDuration}
          kilatWaveHour={isKilat ? (pickedWave?.hour ?? null) : undefined}
          extraRows={[
            ...(latestRange ? [{
              label: t('summaryLatestScheduleLabel'),
              // Kilat: tanggal + gelombang, tanpa durasi (§5.8).
              value: isKilat && latestShown?.kilatSlotHour != null
                ? `${latestRange} · ${formatWaveHour(latestShown.kilatSlotHour)} WIB`
                : latestRange,
            }] : []),
            ...(picked && currentPeriodBatch && !isResolvingBatch
              ? [{ label: t('summaryPeriodLabel'), value: currentPeriodLabel }]
              : []),
          ]}
          deadline={{ kind: 'hold' }}
        />
      }
      mobileBarInfo={<MobileBarInfo total={money.total} />}
      duration={isKilat ? undefined : (
        /* Lama tayang */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">{t('scheduleAgainDuration')}</span>
          </div>
          <DurationPicker
            value={duration}
            onChange={pickDuration}
            disabled={isSaving}
          />
        </div>
      )}
      calendar={isKilat ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-start gap-2 text-sm text-slate-600">
              <Info className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
              <span>{t('kilatWaveCutoffNote')}</span>
            </div>
            {!waves.isLoading && waves.hasError && (
              <button
                type="button"
                onClick={() => void waves.reload()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('slotAvailabilityRetry')}
              </button>
            )}
          </div>
          <KilatWavePicker availability={awayNow ? { ...waves, adminAway: true } : waves} notice={fullNotice} value={pickedWave} onChange={pickWave} />
        </div>
      ) : (
        /* Tanggal — ⚠️ SchedulePicker, kalender PENELITI. Modal lama memakai
            SlotCalendar yang `isAdmin`-nya default `true`. */
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Info className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{t('scheduleCutoffNote')}</span>
            </div>
            {!availability.isLoading && availability.hasError && (
              <button
                type="button"
                onClick={() => void availability.reload()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('slotAvailabilityRetry')}
              </button>
            )}
          </div>
          <SchedulePicker
            availability={availability}
            duration={duration}
            mode="regular"
            value={picked}
            onChange={pickDate}
            showSummary={false}
            ownRange={latestYmd ? { startYmd: latestYmd, days: latestDays } : null}
            notice={fullNotice}
          />
        </div>
      )}
      reward={
        <>
          {/* Kondisi 2: Berbeda Periode (New Period) -> Layout Atas-Bawah Selaras Form Awal */}
          {plan.needsReward && (
            <div className="rounded-2xl border border-indigo-100 bg-white p-4 sm:p-5 shadow-xs space-y-4">
              {/* Header Kartu */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 text-jfu-primary flex items-center justify-center shrink-0 shadow-2xs">
                    <Gift className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {t('scheduleAgainPeriodRewardTitle', { period: currentPeriodLabel })}
                  </h4>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80 shrink-0">
                  {t('scheduleAgainNewPeriodBadge')}
                  <InfoTooltip
                    content={t('scheduleAgainNewPeriodTooltip', {
                      currentPeriod: currentPeriodLabel,
                      prevAmount: prevTotalPrize > 0 ? formatIDR(prevTotalPrize) : '-',
                    })}
                  />
                </span>
              </div>

              {/* Form Fields Selaras Form Pengajuan Awal */}
              <div className={fieldRowListClass}>
                <FieldRow
                  icon={Trophy}
                  label={t('winnerCountLabel')}
                  htmlFor="baru-winners"
                  required
                  compact
                  tooltip={t('maxWinnerWarning')}
                  error={
                    winnerCount > 0 && (winnerCount < 2 || winnerCount > 5)
                      ? winnerCount < 2
                        ? t('errorMinWinners')
                        : t('errorMaxWinners')
                      : undefined
                  }
                >
                  <input
                    id="baru-winners"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={winnerCount || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0;
                      setWinnerCount(val);
                    }}
                    disabled={isSaving}
                    placeholder="2"
                    className={fieldInputClass}
                  />
                  <span className="ml-1.5 shrink-0 text-sm font-medium text-slate-500">
                    {t('respondentUnit')}
                  </span>
                </FieldRow>

                <FieldRow
                  icon={Gift}
                  label={t('prizePerWinnerLabel')}
                  htmlFor="baru-prize"
                  required
                  compact
                  tooltip={t('prizePerWinnerHint')}
                  error={
                    prizePerWinner > 0 && prizePerWinner < 25000
                      ? t('errorMinPrize')
                      : undefined
                  }
                  hint={
                    <RewardRecommendationHint
                      value={prizePerWinner}
                      onChange={setPrizePerWinner}
                      questionCount={submission?.question_count ?? 0}
                      disabled={isSaving}
                    />
                  }
                >
                  <span className="mr-1.5 shrink-0 text-sm font-semibold text-slate-500">Rp</span>
                  <input
                    id="baru-prize"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={prizePerWinner ? prizePerWinner.toLocaleString('id-ID') : ''}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      setPrizePerWinner(Number(raw) || 0);
                    }}
                    disabled={isSaving}
                    placeholder="25.000"
                    className={fieldInputClass}
                  />
                  <span className="ml-1.5 shrink-0 text-sm font-medium text-slate-500">
                    {t('perWinner')}
                  </span>
                </FieldRow>
              </div>

              {/* Total Real-time */}
              {prizePerWinner > 0 && winnerCount > 0 && (
                <div className="mt-1 px-4 py-3 rounded-xl bg-slate-50/80 border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-800 font-semibold text-xs sm:text-sm">
                        {t('totalRewardTitle')}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-blue-50 text-jfu-primary border border-blue-200/80">
                        {t('billedInInvoiceBadge')}
                      </span>
                    </div>
                    <span className="font-bold text-slate-900 font-mono text-sm sm:text-base shrink-0">
                      {formatIDR(prizePerWinner * winnerCount)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    {t('totalRewardDetailNote', {
                      winners: winnerCount,
                      prize: formatIDR(prizePerWinner),
                    })}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Kondisi 1: Periode Sama (Same Period) -> 1 Kartu + Top-up Nominal Opsional */}
          {batch && !plan.needsReward && (
            <div className="rounded-2xl border border-emerald-100/90 bg-white p-4 sm:p-5 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                    <Gift className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">
                    {t('scheduleAgainPeriodRewardTitle', { period: currentPeriodLabel || prevPeriodLabel })}
                  </h4>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  {t('scheduleAgainSamePeriodFreeBadge')}
                  <InfoTooltip content={t('scheduleAgainSamePeriodTooltip')} />
                </span>
              </div>

              {/* Rincian Hadiah Aktif Periode Ini */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 py-2 px-3 rounded-xl bg-slate-50 border border-slate-100 text-xs sm:text-sm text-slate-700">
                <span className="font-semibold text-slate-900">
                  {prevPrizePerWinner > 0 ? formatIDR(prevPrizePerWinner) : '-'}
                  <span className="font-normal text-slate-500"> / {t('winnerCountUnit') || 'pemenang'}</span>
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-semibold text-slate-900">
                  {prevWinnerCount > 0 ? `${prevWinnerCount} ${t('winnerCountUnit') || 'pemenang'}` : '-'}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500 font-medium">
                  {t('scheduleAgainSamePeriodPoolTotal')}{' '}
                  <span className="font-bold font-mono text-slate-900">
                    {prevTotalPrize > 0 ? formatIDR(prevTotalPrize) : '-'}
                  </span>
                </span>
              </div>

              {/* Tombol Accordion Tambah Hadiah (Opsional) */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowOptionalReward((prev) => !prev)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all duration-200 cursor-pointer select-none text-left ${
                    showOptionalReward
                      ? 'bg-slate-100/90 border-slate-300 text-slate-900'
                      : 'bg-indigo-50/70 border-indigo-200/90 hover:bg-indigo-100/70 text-indigo-900 shadow-2xs hover:shadow-xs'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                      showOptionalReward ? 'bg-slate-200 text-slate-700' : 'bg-indigo-200/70 text-jfu-primary'
                    }`}>
                      <PlusCircle className={`w-4 h-4 transition-transform duration-200 ${showOptionalReward ? 'rotate-45 text-rose-500' : 'text-jfu-primary'}`} />
                    </span>
                    <span className="truncate sm:whitespace-normal font-semibold text-xs sm:text-sm">
                      {showOptionalReward ? t('scheduleAgainCloseRewardToggle') : t('scheduleAgainAddRewardToggle')}
                    </span>
                  </span>
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ml-2 ${showOptionalReward ? 'rotate-180 text-slate-600' : 'text-indigo-600'}`} />
                </button>

                {showOptionalReward && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    <p className="text-xs sm:text-sm leading-relaxed text-slate-600">
                      {t('scheduleAgainTopupHint', { count: prevWinnerCount })}
                    </p>

                    <div className={fieldRowListClass}>
                      <FieldRow
                        icon={Gift}
                        label={t('scheduleAgainTopupLabel')}
                        htmlFor="opt-prize"
                        compact
                        tooltip={t('prizePerWinnerHint')}
                        hint={
                          <span className="inline-flex items-center gap-1.5 flex-wrap text-xs text-slate-500">
                            <span>{t('topupEducationNote')}</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-600 font-medium">Pilihan cepat:</span>
                            {[10000, 25000].map((amt) => {
                              const isSelected = additionalPrize === amt;
                              return (
                                <button
                                  key={amt}
                                  type="button"
                                  onClick={() => setAdditionalPrize(amt)}
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                                    isSelected
                                      ? 'bg-blue-50 text-jfu-primary border border-jfu-primary/60 ring-1 ring-jfu-primary/20 shadow-2xs'
                                      : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700'
                                  }`}
                                >
                                  + Rp {amt.toLocaleString('id-ID')}
                                </button>
                              );
                            })}
                            {additionalPrize > 0 && (
                              <button
                                type="button"
                                onClick={() => setAdditionalPrize(0)}
                                className="text-slate-400 hover:text-slate-600 text-[11px] ml-1 underline cursor-pointer"
                              >
                                Reset
                              </button>
                            )}
                          </span>
                        }
                      >
                        <span className="mr-1.5 shrink-0 text-sm font-semibold text-slate-500">Rp</span>
                        <input
                          id="opt-prize"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={additionalPrize ? additionalPrize.toLocaleString('id-ID') : ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            setAdditionalPrize(Number(raw) || 0);
                          }}
                          disabled={isSaving}
                          placeholder="10.000"
                          className={fieldInputClass}
                        />
                        <span className="ml-1.5 shrink-0 text-sm font-medium text-slate-500">
                          {t('perWinner')}
                        </span>
                      </FieldRow>
                    </div>

                    {additionalPrize > 0 && (
                      <div className="mt-2 px-4 py-3 rounded-xl bg-slate-50/80 border border-slate-200/80 shadow-2xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-slate-800 font-semibold text-xs sm:text-sm">
                              {t('scheduleAgainTopupTotalTitle')}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-blue-50 text-jfu-primary border border-blue-200/80">
                              {t('billedInInvoiceBadge')}
                            </span>
                          </div>
                          <span className="font-bold text-emerald-700 font-mono text-sm sm:text-base shrink-0">
                            +{formatIDR(additionalPrize * prevWinnerCount)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                          {t('scheduleAgainTotalBecomes', {
                            amount: formatIDR(prevPrizePerWinner + additionalPrize),
                          })} ({prevWinnerCount} {t('respondentUnit')} × +{formatIDR(additionalPrize)})
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
          defaultOpen={false}
        />

      }
      lock={{
        kind: 'lock',
        /*
          Sebab tombol belum bisa mengunci, diucapkan PASIF sebelum diklik
          (periode sedang dibaca, hadiah belum diisi, …) — menggantikan
          `blockedReason` di kolom kanan. Tanpa sebab: catatan hold 1 jam.
          Tanggal kosong bukan sebab pasif: ia baru ditegur saat diklik.
          Aturannya di `newScheduleZoneHint`.
        */
        hint: (() => {
          // Teguran merah berkalimat sama menggantikan sebab pasifnya (null).
          const key = newScheduleZoneHint(plan.block, feedback.error?.key ?? null);
          return key ? t(key) : key;
        })(),
        cta: (
          <button
            type="button"
            onClick={handleLock}
            /* ⚠️ Mati HANYA saat menyimpan. Blok lain (tanggal, hadiah,
               periode) menegur saat diklik — tombol mati yang diam tidak
               memberi tahu apa pun. */
            disabled={isSaving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock size={15} />}
            {isSaving ? t('scheduleAgainBooking') : t('scheduleLockCta')}
          </button>
        ),
      }}
      pay={{ kind: 'needs_lock' }}
    />
  );
}
