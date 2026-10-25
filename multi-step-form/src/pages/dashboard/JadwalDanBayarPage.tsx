import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Info, Lock, CreditCard, RefreshCw, AlertTriangle, CheckCircle, CalendarDays } from 'lucide-react';
import {
  fetchAdScheduleById,
  fetchScheduleSiblings,
  fetchScheduleBilling,
  cancelSchedule,
  releaseExpiredSlot,
  rebookSlotForSubmission,
  getFormSubmissionById,
} from '../../utils/supabase';
import type { AdScheduleEntry, FormSubmission } from '../../utils/supabase';
import { useLanguage } from '../../i18n/LanguageContext';
import { SchedulePicker } from '../../components/SchedulePicker';
import { KilatWavePicker } from '../../components/KilatWavePicker';
import { CostBreakdown } from '../../components/CostBreakdown';
import { ScheduleReservationLayout, TicketSkeleton } from '../../components/schedule/ScheduleReservationLayout';
import {
  TicketStub,
  LockedScheduleCard,
  MobileBarInfo,
} from '../../components/schedule/ReservationParts';
import { useLockFeedback } from '../../components/schedule/useLockFeedback';
import { lockGateFeedback, deadlineRowOf } from '../../utils/reservationTicket';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { lockedDateFitsHorizon } from '../../utils/scheduleHorizon';
import { toWibYmd, toAiringStartIso, isPayDeadlinePassed, payDeadlineFor, formatWibTime } from '../../utils/airing-window';
import { airingDayCount } from './schedule/scheduleModel';
import { useSlotAvailability } from '../../hooks/useSlotAvailability';
import { useKilatWaveAvailability } from '../../hooks/useKilatWaveAvailability';
import { kilatLockGate, kilatWaveErrorMessageKey, formatWaveHour, type KilatWaveDraft } from '../../utils/kilatWaves';
import { scheduleLockGate } from '../../utils/scheduleLockGate';
import { isDailyQuotaFullError, kilatWaveErrorKind } from '../../utils/dailyQuotaError';
import { schedulePageState } from '../../utils/schedulePageState';
import { expiryPlanFor } from '../../utils/scheduleExpiry';
import { segmentTitleOf } from '../../utils/segmentTitle';
import { deriveScheduleMoney } from '../../utils/scheduleMoney';
import { slotReleaseDeadline, isSlotHoldReleased } from '../../utils/slotHold';
import { payLinkPath } from '../../utils/payLink';
import { creditPhaseOf } from '../../components/status/scheduleAxes';
import { isAutoReviewed } from '../../components/status/deriveOrderUiState';
import { awayBlocksKilatPick, awayGuard, awayGuardWouldOpen } from '../../components/status/AdminAwayModal';
import { useAdminAway } from '../../utils/operationalHolidays';
import { isSelfBookingClosedError, refreshSelfBookingClosure, selfBookingBlocked, useSelfBookingClosure } from '../../utils/selfBookingClosure';
import { SelfBookingNotice } from '../../components/order/SelfBookingNotice';
import { createPayment, GroupBillError } from '../../utils/payment';
import { shouldAutoMint, canRepickInPlace, billExpiryFor } from '../../utils/jadwalBayarGates';
import { createInFlightGate } from '../../utils/inFlightGate';
import { repickEstimate } from '../../utils/repickPrice';
import { formatIDR } from '../../utils/currency';

/**
 * Halaman "Jadwal & Bayar" — SATU halaman untuk memilih, membayar, dan memilih
 * ulang, berkunci JADWAL. Rute lama berkunci order (`/dashboard/payment/:id`)
 * kini hanya menerjemahkan order → jadwal ordinal 1 lalu mendarat di sini.
 *
 * ⚠️ RUTENYA MEMBAWA `ad_schedules.id`, dan itu BUKAN kunci yang dipakai aksi
 * mana pun di bawah. Tiga kunci bertetangga yang semuanya UUID:
 *
 *   `ad_schedules.id` → rute & `payLinkPath`
 *   `submission_id`   → `fetchAdSchedules`, `releaseExpiredSlot`, `createPayment`
 *   `source_id`       → `cancelSchedule`, `invoices.extend_id`
 *
 * Yang salah TIDAK PERNAH error — ia cuma tidak menemukan baris. Karena itu
 * halaman ini memuat `AdScheduleEntry` UTUH lebih dulu dan menolak merender
 * apa pun sebelum entry-nya ada.
 *
 * ⚠️ KEADAANNYA PUNYA NAMA (`schedulePageState`), bukan disimpulkan dari
 * `isExpired` di tengah render. Keputusan uangnya (terbitkan tagihan? boleh
 * pilih ulang di tempat?) hidup di `jadwalBayarGates.ts`, teruji tanpa render.
 *
 * ⚠️ KEDALUWARSA MEMILIH PRIMITIF (`expiryPlanFor`), tidak memanggil
 * `releaseExpiredSlot` begitu saja: primitif itu berlingkup ORDER dan akan ikut
 * mematikan tagihan jadwal SAUDARA.
 *
 * ⚠️ TAGIHAN TERBIT DI SINI, SATU PEMICU (keputusan 19 Agu 2026). Tidak di
 * wizard, tidak di fungsi rebook. Pilih ulang di tempat memindahkan tanggal,
 * memuat ulang, lalu pemicu yang SAMA menerbitkan tagihan untuk tanggal baru —
 * dan `create-payment.js` mencabut tagihan lama jadwal ini (tanggalnya beda,
 * `is_stale`) sebelum mencetak yang baru.
 */
export function JadwalDanBayarPage() {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, language } = useLanguage();

  const [entry, setEntry] = useState<AdScheduleEntry | null>(null);
  const [siblings, setSiblings] = useState<AdScheduleEntry[]>([]);
  const [submission, setSubmission] = useState<FormSubmission | null>(null);
  const [billedAmount, setBilledAmount] = useState<number | null>(null);
  const [billedVoucher, setBilledVoucher] = useState<string | null>(null);
  /*
    ⚠️ KEBERADAANNYA, BUKAN ALAMATNYA. Kita menyimpan "tagihan ini sudah
    terbit?" sebagai boolean dan sengaja MEMBUANG URL DOKU-nya, supaya tidak
    ada nilai di komponen ini yang bisa menyelinap jadi `href` — itu cacat yang
    hidup di sini sampai 2026-09-17. Alamat bayar cuma satu:
    `payLinkPath(entry.id)`.
  */
  const [hasOpenBill, setHasOpenBill] = useState(false);
  /** Tagihan jadwal ini BERHASIL terbaca. Gagal baca bukan bukti "belum ada". */
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  /** Tagihan sedang diterbitkan (otomatis sesudah kunci, atau dari klik Bayar). */
  const [isMinting, setIsMinting] = useState(false);
  /** Peneliti menekan Bayar dan tab-nya menunggu tagihan — cegah klik ganda. */
  const [isOpeningPay, setIsOpeningPay] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  /** Pilihan gelombang — jadwal KILAT saja (Phase 5 §5.7, R6). */
  const [pickedWave, setPickedWave] = useState<KilatWaveDraft | null>(null);
  /** Teguran zona kunci tiket — inline + toast dari kunci yang sama. */
  const feedback = useLockFeedback();
  /**
   * Dialog konfirmasi batal (keputusan 12 Okt). Tautan batal kini berdiri
   * tepat di bawah Bayar — satu salah tekan dulu langsung membatalkan.
   */
  const [confirmCancel, setConfirmCancel] = useState(false);
  /**
   * Kalender hidup lagi di keadaan bayar yang lewat 14.00 ("Pilih Tanggal
   * Lain"). `?pilih=1` datang dari tombol "Jadwalkan Ulang" di dashboard,
   * supaya peneliti tidak perlu mengklik niat yang sama dua kali.
   */
  const [repickMode, setRepickMode] = useState(searchParams.get('pilih') === '1');
  /** (jadwal, tanggal) yang sudah dicoba diterbitkan tagihannya di sesi ini. */
  const mintAttemptedFor = useRef<string | null>(null);
  /**
   * ⚠️ SATU PENERBITAN BERJALAN. Klik Bayar selama pemicu otomatis masih
   * menunggu DOKU MENUNGGU permintaan itu (`createInFlightGate`, teruji) —
   * dulu tombolnya mati beberapa detik; menerbitkan sendiri = link kedua.
   */
  const mintGate = useRef(createInFlightGate<'issued' | 'group'>());
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const repickEligible = !!entry && !!submission && canRepickInPlace({
    ordinal: entry.ordinal,
    siblingCount: siblings.length || 1,
    submissionStatus: submission.submission_status,
    scheduleStatus: entry.status,
    autoReviewed: isAutoReviewed(submission),
  });
  /*
    Reservasi mandiri ditutup (sql/125: saklar admin atau cap order) menahan
    SETIAP pilih tanggal di halaman ini — layar `pick`, pilih ulang sesudah
    waktu habis, dan "Pilih Tanggal Lain" lewat 14.00. Membayar slot yang
    SUDAH terkunci tetap jalan (keputusan 22 Okt). Server menolak juga
    (lock.js 409), jadi ini soal tampilan, bukan satu-satunya penjaga.
  */
  const selfBookingClosure = useSelfBookingClosure();
  const selfBookingHeld = !!submission && selfBookingBlocked(submission, selfBookingClosure);
  const repickAllowed = repickEligible && !selfBookingHeld;

  // Kuota ikut jenis distribusi jadwal ini. ⚠️ Order sendiri hanya dikecualikan
  // saat PILIH ULANG order berjadwal tunggal — tanggal yang sedang ia lepas
  // tidak boleh tampak penuh oleh dirinya sendiri. Untuk perpanjangan jangan:
  // jadwal pertama masih memakan kuota harinya (`assert_daily_ad_quota_free`).
  /*
    ⚠️ KILAT MEMILIH GELOMBANG, BUKAN HARI (Phase 5 §5.7, R6). Kedua hook selalu
    dipanggil (aturan hooks); hanya satu yang mengambil data. Pengecualian
    order sendiri sama alasannya dengan kalender Iklan di atas.
  */
  const isKilatEntry = entry?.distributionType === 'kilat';
  const availability = useSlotAvailability(
    'regular',
    repickAllowed ? entry?.submissionId : undefined,
    !!entry && !isKilatEntry,
  );
  const waves = useKilatWaveAvailability(
    repickAllowed ? entry?.submissionId : undefined,
    isKilatEntry,
  );

  const load = useCallback(async () => {
    if (!scheduleId) return;
    setIsLoading(true);
    try {
      const found = await fetchAdScheduleById(scheduleId);
      if (!found) {
        setNotFound(true);
        return;
      }
      setEntry(found);

      // Saudara diperlukan SEBELUM aksi apa pun: `expiryPlanFor` memilih
      // primitif dari jumlahnya, bukan dari ordinal semata.
      const [sibs, billings, sub] = await Promise.all([
        fetchScheduleSiblings(scheduleId),
        fetchScheduleBilling(found.submissionId).catch((e) => {
          console.error('Gagal memuat tagihan jadwal:', e);
          return null;
        }),
        getFormSubmissionById(found.submissionId).catch(() => null),
      ]);
      setSiblings(sibs);
      setSubmission(sub);

      const own = billings?.get(found.id) ?? null;
      setBilledAmount(own?.openInvoice?.amount ?? null);
      setBilledVoucher(own?.openInvoice?.voucherCode ?? null);
      setHasOpenBill(!!own?.openInvoice);
      setBillingLoaded(billings !== null);
    } catch (e) {
      console.error('Gagal memuat jadwal:', e);
      toast.error(t('paymentLoadError'));
    } finally {
      setIsLoading(false);
    }
  }, [scheduleId, t]);

  useEffect(() => { void load(); }, [load]);

  /*
    Tayang sebelum lunas (sql/102) dan masih berutang — aturan yang sama dengan
    `isOwedOnCredit` (scheduleAxes), dibaca dari `hasOpenBill` karena komponen
    ini sengaja tidak menyimpan URL tagihan: kredit yang DIHENTIKAN (`cancelled`)
    hanya berutang selama tagihan temponya masih terbuka.
  */
  const owedOnCredit = !!entry?.airOnCreditAt
    && !['paid', 'completed'].includes((entry.paymentStatus || '').toLowerCase())
    && (hasOpenBill || (entry.status || '').toLowerCase() !== 'cancelled');
  const creditPhase = entry && owedOnCredit ? creditPhaseOf(entry) : null;

  const state = entry
    ? schedulePageState({
        startDate: entry.startDate,
        slotBookedBy: entry.slotBookedBy,
        paymentStatus: entry.paymentStatus,
        status: entry.status,
        slotReservedAt: entry.slotReservedAt,
        owedOnCredit,
      })
    : null;

  /*
    Tanggal terkunci sebagai HARI WIB + panjang tayang dari jendelanya.
    ⚠️ Bukan `startDate.slice(0, 10)`: kolomnya TIMESTAMPTZ, dan `end_date`
    akhir-eksklusif — potongan mentah dulu menampilkan jendela 1 hari sebagai
    "2026-10-12 – 2026-10-13". `duration` juga bisa berbohong; panjang tayang
    diturunkan dari start→end (`airingDayCount`), `duration` cuma cadangan.
  */
  const lockedYmd = entry?.startDate ? toWibYmd(new Date(entry.startDate)) : null;
  const lockedDays = entry ? (airingDayCount(entry.startDate, entry.endDate) ?? entry.duration ?? 1) : 1;
  const lockedFits = lockedDateFitsHorizon(lockedYmd);
  /** Jam gelombang jadwal ini — `null` untuk Iklan (lihat `payDeadlineFor`). */
  const kilatHour = isKilatEntry ? entry?.kilatSlotHour ?? null : null;
  /**
   * Batas bayar hari tayang sudah lewat: Iklan 14.00 WIB, Kilat gelombang − 60
   * menit (R6). ⚠️ MURNI TAMPILAN — yang habis bukan reservasinya, melainkan
   * waktu admin menyiapkan halaman/push. Tidak pernah dipakai untuk melepas slot.
   */
  const tooLate = state?.screen === 'awaiting_payment' && !owedOnCredit
    && !!lockedYmd && isPayDeadlinePassed(lockedYmd, kilatHour);
  /**
   * ⚠️ KILAT TIDAK PUNYA "TETAP BAYAR". Iklan lewat 14.00 masih boleh dibayar
   * (tim mengonfirmasi tanggal baru); gelombang Kilat yang lewat batas bayar
   * ditolak server (`kilatPaymentGate`, create-payment.js) — tombol yang pasti
   * berujung 409 tidak boleh dirender.
   */
  const kilatPayClosed = isKilatEntry && tooLate;
  const holdExpired = !!entry && isSlotHoldReleased({
    slotBookedBy: entry.slotBookedBy,
    slotReservedAt: entry.slotReservedAt,
  });

  /**
   * Hold habis — lepas jadwal ini, dan HANYA jadwal ini.
   *
   * ⚠️ Primitifnya dipilih `expiryPlanFor`, tidak dipilih di sini. Order
   * berjadwal banyak memakai `cancelSchedule` meski ordinal-nya 1, karena
   * `releaseExpiredSlot` menulis ke baris ORDER dan tagihan saudaranya ikut
   * mati.
   */
  const handleExpired = useCallback(async () => {
    if (!entry) return;
    const plan = expiryPlanFor({
      ordinal: entry.ordinal,
      siblingCount: siblings.length || 1,
      slotBookedBy: entry.slotBookedBy,
      paymentStatus: entry.paymentStatus,
    });
    if (plan.primitive === 'none') return;

    try {
      if (plan.primitive === 'cancelSchedule') {
        await cancelSchedule({
          submissionId: entry.submissionId,
          sourceId: entry.sourceId,
          isExtension: entry.isExtension,
          paymentStatus: entry.paymentStatus,
          id: entry.id,
        });
      } else {
        await releaseExpiredSlot(entry.submissionId);
      }
      await load();
    } catch (e) {
      console.error('Gagal melepas reservasi:', e);
    }
  }, [entry, siblings.length, load]);

  // Countdown — hanya untuk reservasi yang memang bisa lepas sendiri.
  useEffect(() => {
    if (!entry || !state?.showCountdown) { setTimeLeft(null); return; }
    const deadline = slotReleaseDeadline({
      slotBookedBy: entry.slotBookedBy,
      slotReservedAt: entry.slotReservedAt,
    });
    if (deadline === null) { setTimeLeft(null); return; }

    const tick = () => {
      const sisa = Math.floor((deadline - Date.now()) / 1000);
      if (sisa <= 0) { setTimeLeft(0); void handleExpired(); return true; }
      setTimeLeft(sisa);
      return false;
    };
    if (tick()) return;
    const id = setInterval(() => { if (tick()) clearInterval(id); }, 1000);
    return () => clearInterval(id);
  }, [entry, state?.showCountdown, handleExpired]);

  /**
   * Sudah lunas? Order ke-1 dibaca dari `form_submissions` (tempat webhook
   * menulis), perpanjangan dari barisnya sendiri. Ordinal 1 di `ad_schedules`
   * memang ikut tersinkron, tapi sumbernya yang dibaca — satu lompatan lebih
   * sedikit untuk salah.
   */
  const fetchIsPaid = useCallback(async (): Promise<boolean> => {
    if (!entry) return false;
    const PAID = ['paid', 'completed'];
    if (entry.ordinal === 1) {
      const sub = await getFormSubmissionById(entry.submissionId);
      return PAID.includes((sub?.payment_status || '').toLowerCase());
    }
    const fresh = await fetchAdScheduleById(entry.id);
    return PAID.includes((fresh?.paymentStatus || '').toLowerCase());
  }, [entry]);

  // Polling lunas — peneliti biasanya membayar di tab lain.
  useEffect(() => {
    if (isLoading || state?.screen !== 'awaiting_payment') return;
    const poll = setInterval(async () => {
      try {
        if (await fetchIsPaid()) {
          clearInterval(poll);
          navigate('/dashboard?payment_status=paid');
        }
      } catch (e) {
        console.warn('Payment poll failed, will retry:', e);
      }
    }, 5000);
    return () => clearInterval(poll);
  }, [isLoading, state?.screen, fetchIsPaid, navigate]);

  const handleCheckPayment = async () => {
    setIsCheckingPayment(true);
    try {
      if (await fetchIsPaid()) {
        toast.success(t('checkoutPaidSuccess'));
        setTimeout(() => navigate('/dashboard?payment_status=paid'), 1000);
      } else {
        toast.info(t('checkoutNotPaidYet'));
      }
    } catch {
      toast.error(t('checkoutCheckError'));
    } finally {
      setIsCheckingPayment(false);
    }
  };

  /** Terbitkan tagihan order ke-1. Tanpa `scheduleId` = jalur ordinal 1 server. */
  const mintBill = useCallback(async () => {
    if (!entry || !submission) throw new Error('entry/submission belum termuat');
    return createPayment({
      formSubmissionId: entry.submissionId,
      // Server menghitung ulang nominalnya dari DB; angka ini tidak dipercaya.
      amount: submission.total_cost || 0,
      customerInfo: {
        title: submission.title || 'Survey',
        fullName: submission.full_name || 'Pengguna',
        email: submission.email || 'user@example.com',
        phoneNumber: submission.phone_number || '-',
      },
      expiredAt: billExpiryFor({
        slotBookedBy: entry.slotBookedBy,
        slotReservedAt: entry.slotReservedAt,
        lockedYmd,
        kilatHour,
      }).toISOString(),
    });
  }, [entry, submission, lockedYmd, kilatHour]);

  /*
    ── SATU PEMICU PENERBITAN TAGIHAN ──
    Syaratnya di `shouldAutoMint` (teruji). Ref dikunci per (jadwal, tanggal):
    satu percobaan per tanggal supaya kegagalan yang tidak terbaca hidup tidak
    mengulang ke DOKU tanpa henti, tapi pilih ulang tanggal di tempat tetap
    menerbitkan lagi. Kegagalan senyap — tombol bayar jadi jaring pengamannya.
  */
  const autoMint = !!entry && !!state && shouldAutoMint({
    screen: state.screen,
    ordinal: entry.ordinal,
    slotBookedBy: entry.slotBookedBy,
    paymentStatus: entry.paymentStatus,
    billingLoaded,
    hasOpenBill,
    owedOnCredit,
    tooLate,
    holdExpired,
  });
  /**
   * Terbitkan tagihan lewat gerbang — dipakai pemicu otomatis DAN klik Bayar.
   *
   * ⚠️ TOMBOL MENYALA BEGITU TAGIHAN TERBIT, tanpa menunggu `load()`.
   * `hasOpenBill` dinyatakan langsung; tombolnya jadi tautan `/bayar/<id>`,
   * resolver berwenang yang mencari link yang benar di server. `load()` jalan
   * di belakang untuk nominal & status. Dulu tombol berputar sampai empat
   * kueri muat ulang selesai.
   *
   * ⚠️ 409 TAGIHAN GABUNGAN BUKAN KEGAGALAN: pesanan ini sudah ditanggung satu
   * link bersama, dan `/bayar/<id>` menunjuk ke sana. Cukup nyatakan tagihannya
   * ADA — TANPA `load()`, yang membaca tagihan milik jadwal ini saja dan akan
   * membaliknya ke "belum ada".
   */
  const issueBill = useCallback(() => mintGate.current.run(async () => {
    setIsMinting(true);
    try {
      const outcome = await mintBill().then(
        () => 'issued' as const,
        (e) => {
          if (e instanceof GroupBillError) return 'group' as const;
          throw e;
        },
      );
      if (mounted.current) {
        setHasOpenBill(true);
        if (outcome === 'issued') void load();
      }
      return outcome;
    } finally {
      if (mounted.current) setIsMinting(false);
    }
  }), [mintBill, load]);

  useEffect(() => {
    if (!autoMint || !entry || !submission || isLoading) return;
    const key = `${entry.id}:${entry.startDate}`;
    if (mintAttemptedFor.current === key) return;
    mintAttemptedFor.current = key;

    issueBill().catch((e) => {
      // Senyap: tombol Bayar (menerbitkan sendiri) jadi jaring pengamannya.
      console.warn('[jadwal-bayar] Gagal menerbitkan tagihan otomatis:', e);
    });
  }, [autoMint, entry, submission, isLoading, issueBill]);

  /**
   * Bayar saat tagihan BELUM terbit (pemicu otomatis gagal, atau lewat 14.00
   * dan peneliti memilih "tetap bayar"). Tab dibuka sebelum await supaya tidak
   * kena popup blocker, lalu diarahkan ke `/bayar/<id>` — resolver yang
   * berwenang, bukan URL DOKU mentah dari respons.
   */
  const handlePayWithoutBill = async () => {
    if (!entry || isOpeningPay) return;
    const w = window.open('about:blank', '_blank');
    setIsOpeningPay(true);
    try {
      // Pemicu otomatis masih berjalan? `issueBill` mengembalikan permintaan
      // ITU — tab ini menunggunya, tidak menerbitkan tagihan kedua.
      await issueBill();
      const href = payLinkPath(entry.id);
      if (w) w.location.href = href;
      else window.location.href = href;
    } catch (e) {
      console.error('Gagal menerbitkan tagihan:', e);
      w?.close();
      toast.error(t('checkoutPaymentError'));
    } finally {
      if (mounted.current) setIsOpeningPay(false);
    }
  };

  /**
   * Kunci tanggal (keadaan `pick`) atau pilih ulang tanggal (waktu habis /
   * lewat 14.00) — SATU primitif, `rebookSlotForSubmission`, berlingkup ORDER.
   *
   * ⚠️ HANYA ORDER BERJADWAL TUNGGAL (`canRepickInPlace`) atau ordinal 1 yang
   * belum pernah bertanggal. `rebookSchedule` (lingkup jadwal) DIHAPUS
   * 2026-09-18: ia menghidupkan jadwal tanpa menerbitkan tagihan.
   *
   * ⚠️ MEMUAT ULANG DI TEMPAT — JANGAN NAVIGATE. Dulu keadaan `pick` melempar
   * ke `/payment/<id>` (tanpa `/dashboard`, rute tak ada, halaman kosong,
   * tagihan tak pernah terbit — 2bb1244). Sesudah `load()`, keadaannya
   * `awaiting_payment` dan pemicu tunggal di atas menerbitkan tagihannya.
   */
  const handleLock = async () => {
    if (!entry) return;
    if (isKilatEntry && awayBlocksKilatPick({ leave: true })) return;
    if (isKilatEntry) {
      await handleLockWave();
      return;
    }
    const verdict = scheduleLockGate({
      selected: picked,
      duration: entry.duration || 1,
      availability,
    });
    if (!verdict.ok) {
      feedback.report(lockGateFeedback(verdict), { scroll: true });
      if (verdict.clearSelection) setPicked(null);
      if (verdict.shouldReload) void availability.reload();
      return;
    }

    feedback.clear();
    setIsWorking(true);
    try {
      await rebookSlotForSubmission(entry.submissionId, verdict.ymd, verdict.duration);
      toast.success(t('rebookSuccess'));
      setPicked(null);
      setRepickMode(false);
      await load();
    } catch (e) {
      console.error('Gagal mengunci tanggal:', e);
      if (isSelfBookingClosedError(e)) {
        // Saklar ditutup sesudah halaman terbuka: segarkan store — kalender
        // berganti catatan 🔒 di render berikutnya.
        void refreshSelfBookingClosure();
        setPicked(null);
        setRepickMode(false);
        toast.error(t('selfBookingClosedToast'));
        void load();
      } else if (isDailyQuotaFullError(e)) {
        // Ditolak trigger kuota harian (sql/111): kalender tertinggal dari
        // server. Kosongkan pilihan dan muat ulang supaya hari itu tampil penuh.
        // Teguran yang SAMA dengan penolakan klien `range_full`.
        feedback.report({ key: 'slotErrorFull', tone: 'error' }, { scroll: true });
        setPicked(null);
        void availability.reload();
      } else {
        toast.error(t('rebookError'));
      }
    } finally {
      setIsWorking(false);
    }
  };

  /**
   * Kunci / pilih ulang GELOMBANG Kilat — primitif yang SAMA
   * (`rebookSlotForSubmission`), kini dengan jam gelombang. Gerbangnya
   * `kilatLockGate`, sama dengan Step 3 wizard; trigger sql/117 tetap penjaga
   * terakhir dan galatnya dipetakan lewat HINT, bukan teks.
   */
  const handleLockWave = async () => {
    if (!entry) return;
    const verdict = kilatLockGate(pickedWave, waves);
    if (!verdict.ok) {
      feedback.report(
        { key: verdict.messageKey, tone: verdict.reason === 'no_date' || verdict.reason === 'no_wave' ? 'warning' : 'error' },
        { scroll: true },
      );
      if (verdict.clearSelection && pickedWave) setPickedWave({ ymd: pickedWave.ymd, hour: null });
      if (verdict.shouldReload) void waves.reload();
      return;
    }

    feedback.clear();
    setIsWorking(true);
    try {
      await rebookSlotForSubmission(entry.submissionId, verdict.ymd, 1, { kilatHour: verdict.hour });
      toast.success(t('rebookSuccess'));
      setPickedWave(null);
      setRepickMode(false);
      await load();
    } catch (e) {
      console.error('Gagal mengunci gelombang:', e);
      const kind = kilatWaveErrorKind(e);
      if (kind) {
        feedback.report({ key: kilatWaveErrorMessageKey(kind), tone: 'error' }, { scroll: true });
        setPickedWave((w) => (w ? { ymd: w.ymd, hour: null } : null));
        void waves.reload();
      } else {
        toast.error(t('rebookError'));
      }
    } finally {
      setIsWorking(false);
    }
  };

  /** Dipanggil dari dialog konfirmasi — tautan di sobekan hanya membukanya. */
  const handleCancel = async () => {
    if (!entry) return;
    setIsWorking(true);
    try {
      await cancelSchedule({
        submissionId: entry.submissionId,
        sourceId: entry.sourceId,
        isExtension: entry.isExtension,
        paymentStatus: entry.paymentStatus,
        id: entry.id,
      });
      /*
        ⚠️ PULANG KE DASHBOARD, BUKAN MEMUAT ULANG DI TEMPAT (perbaikan
        2026-09-18). Pembatalan bukan "waktu habis": `canRepickInPlace` menolak
        `slot_cancelled`, dan pesanan berikutnya lahir lewat `JadwalBaruPage`.
      */
      toast.success(entry.isExtension ? t('cancelExtensionSuccess') : t('cancelScheduleSuccess'));
      navigate('/dashboard', { replace: true });
    } catch (e: any) {
      toast.error(e?.message || t('rebookError'));
      setConfirmCancel(false);
    } finally {
      setIsWorking(false);
    }
  };

  // Bingkai tiket yang sama, berdenyut — bukan spinner di tengah layar.
  /*
    Mode libur (sql/122): pemilih gelombang Kilat TIDAK PERNAH tampil. Halaman
    yang dibuka untuk memilih gelombang (pick jalur mandiri, waktu habis yang
    boleh pilih ulang, atau "pilih gelombang lain") langsung memunculkan modal
    F; kalau peneliti menutupnya, slot pemilih berisi kartu pemberitahuan.
  */
  const awayNow = useAdminAway();
  const kilatAwayWarned = useRef(false);
  const kilatNeedsPick = isKilatEntry && !!state && (
    (state.screen === 'pick' && !!submission && isAutoReviewed(submission))
    || (state.screen === 'released' && repickAllowed)
    || (state.screen === 'awaiting_payment' && tooLate && repickAllowed && repickMode)
  );
  useEffect(() => {
    if (!awayNow || !kilatNeedsPick || kilatAwayWarned.current) return;
    kilatAwayWarned.current = true;
    awayBlocksKilatPick({ leave: true });
  }, [awayNow, kilatNeedsPick]);

  if (isLoading && !entry) return <TicketSkeleton />;

  // ⚠️ Menolak merender tanpa entry — lihat catatan tiga kunci di kepala berkas.
  if (notFound || !entry || !state) {
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
    ⚠️ VOUCHER DIWARISKAN SAAT MENAGIH, BUKAN SAAT MENJADWALKAN.
    `ad_schedules.voucher_code` perpanjangan bernilai NULL — servernya jatuh ke
    voucher ORDER (`billingVoucher || scheduleVoucher || base.voucher_code`).
    `invoices.voucher_code` menyimpan yang BENAR-BENAR dipakai menagih, jadi ia
    yang dioper; tanpa itu rincian membantah totalnya sendiri (#2KT24KKK).
  */
  const money = deriveScheduleMoney(
    billedVoucher && !entry.voucherCode
      ? { ...entry, voucherCode: billedVoucher }
      : entry,
    {
      question_count: submission?.question_count ?? null,
      distribution_type: entry.distributionType,
      voucher_code: submission?.voucher_code ?? null,
    },
  );
  const payTotal = billedAmount ?? money.total;

  /*
    ⚠️ HARGA SAAT MEMILIH = TARIF HARI INI (sql/103, keputusan 10 Okt).
    Memindahkan tanggal sebelum lunas mengunci ulang tarif ke "sekarang", dan
    yang ditagih create-payment.js adalah angka itu — bukan `total_cost` lama.
    Bila berbeda dari yang terakhir dilihat peneliti, dua-duanya disebut.
  */
  const quote = submission
    ? repickEstimate(entry, submission, { voucherCode: billedVoucher || entry.voucherCode || submission.voucher_code || null })
    : money;
  const previousTotal = billedAmount ?? (Number(submission?.total_cost) || 0);
  // Order yang belum pernah bertanggal ditagih dengan instan order lahir, bukan
  // "hari ini" (lihat `repickEstimate`) — kalimat tarif-hari-ini salah untuknya.
  const quoteAtNow = entry.startDate != null || entry.rateLockedAt == null;
  const priceNote = !quoteAtNow
    ? null
    : previousTotal > 0 && previousTotal !== quote.total
      ? t('repickPriceChange', { old: formatIDR(previousTotal), new: formatIDR(quote.total) })
      : t('repickPriceNote');

  const locale = language === 'en' ? 'en-US' : 'id-ID';
  const shortDate = (ymd: string) =>
    new Date(toAiringStartIso(ymd)).toLocaleDateString(locale, {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta',
    });

  const mode = entry.distributionType === 'kilat' ? 'kilat' as const : 'regular' as const;
  const stubBase = {
    title: entry.title,
    bookingId: entry.bookingId,
    tag: entry.isExtension ? t('scheduleExtensionPrefix') : undefined,
    // Kilat tidak tayang 15.00 — jangan menjanjikannya. Barisnya menyebut
    // gelombang, bukan lama tayang (Phase 5 §5.8).
    showStartTime: mode !== 'kilat',
    kilatWaveHour: mode === 'kilat' ? entry.kilatSlotHour : undefined,
  };
  const pickDate = (ymd: string) => { setPicked(ymd); feedback.clear(); };
  /** Isi tiket saat MEMILIH: Kilat = tanggal + gelombang pilihan, Iklan = tanggal. */
  const pickStub = mode === 'kilat'
    ? { startYmd: pickedWave?.ymd ?? null, kilatWaveHour: pickedWave?.hour ?? null }
    : { startYmd: picked };
  /** Jadwal lama sebagai teks pendek — Kilat ikut menyebut gelombangnya. */
  const lockedLabel = lockedYmd
    ? kilatHour != null
      ? `${shortDate(lockedYmd)} · ${formatWaveHour(kilatHour)} WIB`
      : shortDate(lockedYmd)
    : null;
  const payDeadlineLabel = lockedYmd ? formatWibTime(payDeadlineFor(lockedYmd, kilatHour).toISOString()) : '';
  /** Tautan teks di sobekan (cek status, batal, tetap tanggal lama). */
  const textLink =
    'inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 underline-offset-2 transition-colors hover:text-slate-900 hover:underline disabled:opacity-50 disabled:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 rounded';

  const primaryBtn =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
  const secondaryBtn =
    'inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50';

  const calendarHeader = (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Info className="w-4 h-4 text-slate-400 shrink-0" />
        <span>{t('scheduleCutoffNote')}</span>
      </div>
      {!availability.isLoading && availability.hasError && (
        <button
          type="button"
          onClick={() => void availability.reload()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t('slotAvailabilityRetry')}
        </button>
      )}
    </div>
  );

  const liveCalendar = mode === 'kilat' ? (
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
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('slotAvailabilityRetry')}
          </button>
        )}
      </div>
      <KilatWavePicker
        // Libur dari store (bukan hanya dari RPC): kartu pemberitahuan langsung
        // menggantikan grid begitu toggle admin terbaca menyala.
        availability={awayNow ? { ...waves, adminAway: true } : waves}
        value={pickedWave}
        onChange={(next) => { setPickedWave(next); feedback.clear(); }}
      />
    </div>
  ) : (
    <div className="space-y-4">
      {calendarHeader}
      <SchedulePicker
        availability={availability}
        duration={entry.duration || 1}
        mode={mode}
        value={picked}
        onChange={pickDate}
        showSummary={false}
      />
    </div>
  );

  const lockCta = (label: string) => (
    <button
      type="button"
      onClick={handleLock}
      /* ⚠️ Tidak mati karena tanggal kosong — klik tanpa tanggal menegur. */
      disabled={(mode === 'kilat' ? waves.isLoading : availability.isLoading) || isWorking}
      className={primaryBtn}
    >
      {isWorking ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('lockingSlotLoading')}
        </>
      ) : (
        <>
          <Lock size={15} />
          {label}
        </>
      )}
    </button>
  );

  const quoteCost = (
    <div className="space-y-2">
      <CostBreakdown
        total={quote.total}
        lines={quote.lines}
        note={quote.note}
        isEstimate={quote.isEstimate}
        variant="compact"
        defaultOpen={false}
      />
      {priceNote && <p className="text-xs text-slate-500 leading-relaxed">{priceNote}</p>}
    </div>
  );

  // ── WAKTU HABIS / DIBATALKAN ───────────────────────────────────────────
  if (state.screen === 'released') {
    /*
      Order berjadwal tunggal yang lepas karena WAKTU: kalender hidup di tempat,
      bentuk halaman sama. Selain itu (dibatalkan, perpanjangan, order
      berjadwal banyak, jalur manual) TIDAK ADA kalender — banner dan jalan
      keluar. Kalender di layar ini dulu memanggil `rebookSchedule()`, yang
      menghidupkan jadwal tanpa tagihan; jangan dikembalikan.
    */
    if (repickAllowed) {
      return (
        <ScheduleReservationLayout
          onBack={() => navigate('/dashboard')}
          backLabel={t('backToOrdersShort')}
          isBusy={isWorking}
          title={t('segmentReservation')}
          subtitle={t('reservationPickSubtitle')}
          alertBanner={
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-amber-900">{t('paymentExpiredTitle')}</h3>
                <p className="text-xs text-amber-800 leading-relaxed mt-0.5">{t('paymentExpiredHoldBody')}</p>
              </div>
            </div>
          }
          feedback={feedback}
          cardTitle={mode === 'kilat' ? t('kilatWavePickWave') : t('scheduleCardPickTitle')}
          stub={<TicketStub {...stubBase} {...pickStub} locked={false} days={entry.duration || 1} deadline={{ kind: 'hold' }} />}
          mobileBarInfo={<MobileBarInfo total={quote.total} />}
          calendar={liveCalendar}
          cost={quoteCost}
          lock={{ kind: 'lock', cta: lockCta(t('rebookCta')) }}
          pay={{ kind: 'needs_lock' }}
        />
      );
    }

    // Sah pilih ulang di tempat, tapi reservasi mandiri ditutup: catatan 🔒.
    if (repickEligible && selfBookingHeld) {
      return (
        <div className="max-w-2xl mx-auto px-6 pt-24 space-y-5">
          <SelfBookingNotice variant={submission?.self_booking_closed_at ? 'capped' : 'pick'} closure={selfBookingClosure} />
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

    return (
      <div className="max-w-2xl mx-auto px-6 pt-24 space-y-5">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">{t('rebookPickTitle')}</p>
            <p className="text-xs text-amber-800 mt-0.5">
              {entry.isExtension ? t('scheduleExpiredHint') : t('cancelScheduleSuccess')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {entry.isExtension && (
            <button
              type="button"
              onClick={() => {
                if (isKilatEntry && awayBlocksKilatPick({ leave: false })) return;
                navigate(`/dashboard/jadwal/baru/${entry.submissionId}`);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-jfu-primary px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              <CalendarDays className="w-4 h-4" /> {t('bookNewScheduleCta')}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className={entry.isExtension
              ? 'inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50'
              : 'inline-flex items-center gap-2 rounded-xl bg-jfu-primary px-5 py-3 text-sm font-semibold text-white hover:opacity-90'}
          >
            <ArrowLeft className="w-4 h-4" /> {t('backToOrders')}
          </button>
        </div>
      </div>
    );
  }

  // ── BELUM BERTANGGAL ───────────────────────────────────────────────────
  if (state.screen === 'pick') {
    const seg = segmentTitleOf({ phase: 'reservation', ordinal: entry.ordinal });
    /*
      Jalur review manual: tanggalnya milik tim (keputusan 25 Agu 2026) —
      dashboard tidak memberinya tombol pilih jadwal, dan halaman ini tidak
      boleh menjadi jalan memutarnya.
    */
    const selfPickEligible = !!submission && isAutoReviewed(submission);
    // sql/125: bercap = tim yang menjadwalkan (permanen); saklar tutup = sementara.
    const selfPick = selfPickEligible && !selfBookingHeld;
    return (
      <ScheduleReservationLayout
        onBack={() => navigate('/dashboard')}
        backLabel={t('backToOrdersShort')}
        isBusy={isWorking}
        title={t(seg.key, seg.vars)}
        cardTitle={selfPick ? (mode === 'kilat' ? t('kilatWavePickWave') : t('scheduleCardPickTitle')) : t('scheduleCardLockedTitle')}
        subtitle={selfPick ? t('reservationPickSubtitle') : undefined}
        feedback={feedback}
        stub={
          <TicketStub
            {...stubBase}
            // Jalur manual: tanggalnya milik tim — chip "Belum dikunci" dan
            // batas bayar 1 jam tidak berlaku untuknya.
            locked={!selfPick}
            {...(selfPick ? pickStub : { startYmd: null })}
            days={entry.duration || 1}
            deadline={selfPick ? { kind: 'hold' } : null}
          />
        }
        mobileBarInfo={selfPick ? <MobileBarInfo total={quote.total} /> : undefined}
        calendar={selfPick ? liveCalendar : selfPickEligible ? (
          <SelfBookingNotice variant={submission?.self_booking_closed_at ? 'capped' : 'pick'} closure={selfBookingClosure} />
        ) : (
          <p className="flex items-start gap-2 text-sm text-slate-600">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            {t('rescheduleHandledByTeam')}
          </p>
        )}
        cost={quoteCost}
        /* Jalur manual: kalimat "ditangani tim" sudah berdiri di slot kalender,
           jadi tanpa zona kunci dan tanpa Bayar. */
        lock={selfPick ? { kind: 'lock', cta: lockCta(t('scheduleLockCta')) } : null}
        pay={selfPick ? { kind: 'needs_lock' } : { kind: 'none' }}
      />
    );
  }

  // ── MENUNGGU PEMBAYARAN ────────────────────────────────────────────────
  if (state.screen === 'awaiting_payment') {
    /*
      Lewat 14.00, slot belum dilepas: DUA pilihan (keputusan 9 Okt). "Pilih
      tanggal lain" utama, hanya bila pilih ulang di tempat sah. Slot lama baru
      berganti saat tanggal baru BERHASIL dikunci; sebelum itu tidak ada yang
      dilepas.
    */
    const offerRepick = tooLate && repickAllowed;
    const inRepick = offerRepick && repickMode;

    if (inRepick) {
      return (
        <ScheduleReservationLayout
          onBack={() => navigate('/dashboard')}
          backLabel={t('backToOrdersShort')}
          isBusy={isWorking}
          title={mode === 'kilat' ? t('kilatRebookPickTitle') : t('rebookPickTitle')}
          cardTitle={mode === 'kilat' ? t('kilatWavePickWave') : t('scheduleCardPickTitle')}
          subtitle={t('reservationPickSubtitle')}
          feedback={feedback}
          stub={
            <TicketStub
              {...stubBase}
              locked={false}
              {...pickStub}
              days={entry.duration || 1}
              extraRows={lockedLabel ? [{ label: t('summaryPreviousDateLabel'), value: lockedLabel }] : []}
              deadline={{ kind: 'hold' }}
            />
          }
          mobileBarInfo={<MobileBarInfo total={quote.total} />}
          calendar={liveCalendar}
          cost={quoteCost}
          lock={{
            kind: 'lock',
            cta: lockCta(t('rebookCta')),
            // Slot lama BELUM dilepas — kembali ke sana tanpa mengubah apa pun.
            secondary: lockedLabel ? (
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setRepickMode(false); setPicked(null); setPickedWave(null); feedback.clear(); }}
                  disabled={isWorking}
                  className={textLink}
                >
                  {t('keepDateCta', { date: lockedLabel })}
                </button>
              </div>
            ) : undefined,
          }}
          pay={{ kind: 'needs_lock' }}
        />
      );
    }

    /*
      Tombol bayar. ⚠️ `href` HANYA `payLinkPath(entry.id)` — resolver
      `/bayar/<id>` menjawab "tagihan mana yang berwenang" SAAT DIKLIK
      (`authoritative_payment_url`, sql/85), bukan saat link dirender. Halaman
      ini paling rawan: countdown-nya berjalan, jarak render→klik bisa satu jam.
    */
    // Modal libur D (Iklan) / E (Kilat) sebelum bayar — sekali per masa libur.
    const payCtx = {
      kind: 'pay' as const,
      product: isKilatEntry ? 'kilat' as const : 'ads' as const,
      schedule: lockedLabel ?? undefined,
      wave: lockedLabel ?? undefined,
    };
    const canSelfMint = entry.ordinal === 1 && entry.slotBookedBy === 'user' && !owedOnCredit && !holdExpired && !kilatPayClosed;
    const payLabel = offerRepick ? t('payAnywayCta') : t('payNow');
    const payButton = kilatPayClosed ? (
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
        {t('kilatPayClosedNote')}
      </p>
    ) : hasOpenBill ? (
      <a
        href={payLinkPath(entry.id)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!awayGuardWouldOpen()) return;
          e.preventDefault();
          // Dibuka dari klik "Lanjutkan" — masih gestur pengguna.
          awayGuard(payCtx, () => { window.open(payLinkPath(entry.id), '_blank', 'noopener,noreferrer'); });
        }}
        className={offerRepick ? secondaryBtn : primaryBtn}
      >
        <CreditCard size={16} /> {payLabel}
      </a>
    ) : canSelfMint ? (
      <button
        type="button"
        onClick={() => awayGuard(payCtx, () => { void handlePayWithoutBill(); })}
        /*
          ⚠️ TIDAK mati selama tagihan disiapkan — klik membuka tab yang
          menunggu tagihan yang sama. Mati hanya sesudah diklik (tab sedang
          menunggu), supaya klik ganda tidak membuka dua tab.
        */
        disabled={isOpeningPay}
        aria-busy={isMinting || isOpeningPay}
        className={offerRepick ? secondaryBtn : primaryBtn}
      >
        {isOpeningPay ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('checkoutProcessing')}
          </>
        ) : isMinting ? (
          // Jujur: yang disiapkan TAGIHANNYA; jadwalnya sudah terkunci.
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('payPreparingBill')}
          </>
        ) : (
          <>
            <CreditCard size={16} /> {payLabel}
          </>
        )}
      </button>
    ) : (
      /*
        Jadwal admin / perpanjangan yang tagihannya BELUM terbit — jalur
        `needs_admin_invoice`. Lebih jujur mengatakan apa yang ditunggu daripada
        tombol yang mendarat di galat resolver.
      */
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
        {t('billNotIssuedYet')}
      </p>
    );

    const repickButton = (
      <button
        type="button"
        onClick={() => {
          if (isKilatEntry && awayBlocksKilatPick({ leave: false })) return;
          setRepickMode(true);
        }}
        className={primaryBtn}
      >
        <CalendarDays size={16} /> {mode === 'kilat' ? t('kilatRepickOtherWaveCta') : t('repickOtherDateCta')}
      </button>
    );

    return (
      <>
      <ScheduleReservationLayout
        onBack={() => navigate('/dashboard')}
        backLabel={t('backToOrdersShort')}
        isBusy={isWorking}
        title={creditPhase ? t('creditPageTitle') : t('paymentPhaseTitle')}
        cardTitle={t('scheduleCardLockedTitle')}
        /*
          ⚠️ Kredit TIDAK boleh membaca "Bayar sebelum batas waktu untuk
          mengamankan jadwal tayang" — tagihan tempo tanpa tenggat (K3), dan
          jadwalnya sudah aman (bahkan mungkin sudah tayang).
        */
        subtitle={creditPhase === 'stopped'
          ? t('bannerSubCreditStopped')
          : creditPhase ? t('bannerSubAiringOnCredit') : t('paymentPhaseSubtitle')}
        alertBanner={tooLate ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3 shadow-2xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-amber-900">
                {mode === 'kilat' ? t('kilatPastPayTitle') : t('paymentPastCutoffTitle')}
              </p>
              <p className="text-xs text-amber-800 leading-relaxed">
                {mode === 'kilat'
                  ? t(offerRepick ? 'kilatPastPayRepickBody' : 'kilatPastPayBody', { time: payDeadlineLabel })
                  : offerRepick ? t('pastCutoffRepickBody') : t('paymentPastCutoffBody')}
              </p>
            </div>
          </div>
        ) : undefined}
        feedback={feedback}
        stub={
          <TicketStub
            {...stubBase}
            locked
            startYmd={lockedYmd}
            days={lockedDays}
            /*
              Baris yang SAMA dengan "1 jam setelah dikunci" sebelum kunci —
              kini countdown, ditahan tim, atau status kredit. Kredit: tanpa
              tenggat (K3), jadi yang tampil statusnya, bukan batas bayar.
            */
            deadline={deadlineRowOf({
              locked: true,
              creditPhase,
              showCountdown: state.showCountdown,
              timeLeft,
            })}
          />
        }
        mobileBarInfo={
          <MobileBarInfo
            total={payTotal}
            seconds={!creditPhase && state.showCountdown ? timeLeft : null}
          />
        }
        calendar={
          /*
            Kalender beku — bentuk yang sama dengan saat memilih. Kredit yang
            sudah tayang dan jadwal admin jauh ke depan jatuh ke kartu teks.
          */
          lockedYmd && mode === 'kilat' ? (
            /* Kilat: tanggal + gelombang. Pemilih gelombang tidak punya
               bentuk beku, dan papan 10 hari kerja belum tentu memuatnya. */
            <LockedScheduleCard startYmd={lockedYmd} days={1} kilatWaveHour={kilatHour} />
          ) : lockedYmd && lockedFits ? (
            <SchedulePicker
              availability={availability}
              duration={lockedDays}
              mode={mode}
              value={null}
              onChange={() => {}}
              lockedYmd={lockedYmd}
            />
          ) : lockedYmd ? (
            <LockedScheduleCard
              startYmd={lockedYmd}
              days={lockedDays}
              outsideCalendar={lockedYmd > toWibYmd(new Date())}
            />
          ) : (
            <p className="text-sm text-slate-500">{t('summaryDateNotPicked')}</p>
          )
        }
        cost={
          <CostBreakdown
            total={payTotal}
            lines={money.lines}
            note={money.note}
            isEstimate={billedAmount === null && money.isEstimate}
            variant="compact"
            defaultOpen={false}
          />
        }
        /*
          Zona kunci sesudah dikunci: kotak "ditahan untukmu" di tempat tombol
          Kunci tadi berdiri. Lewat 14.00 (dan pilih ulang sah): "Pilih Tanggal
          Lain" jadi aksi utama zona ini. Kredit: tanpa zona — jadwalnya sudah
          pasti, bahkan mungkin sudah tayang.
        */
        lock={creditPhase
          ? null
          : offerRepick
            ? { kind: 'action', cta: repickButton }
            // Kilat lewat batas tanpa pilih ulang: "ditahan untukmu" tidak lagi
            // benar — gelombangnya tak bisa dibayar; banner di atas yang bicara.
            : kilatPayClosed
              ? null
              : { kind: 'held', hint: state.showCountdown ? t('timerConsequenceNote') : null }}
        /*
          ⚠️ `payButton` TIDAK DIUBAH — tiga cabangnya (tagihan terbit → `/bayar/`,
          boleh mint → `handlePayWithoutBill`, selain itu catatan) tetap
          satu-satunya yang memutuskan. Di sini cuma dipilih slotnya: tombol
          sungguhan = `ready`, catatan "tagihan belum terbit" = `note`.
        */
        pay={!kilatPayClosed && (hasOpenBill || canSelfMint) ? { kind: 'ready', cta: payButton } : { kind: 'note', node: payButton }}
        secondaryActions={
          (!creditPhase && !kilatPayClosed && (hasOpenBill || canSelfMint)) || state.canCancel ? (
            <>
              {!creditPhase && !kilatPayClosed && (hasOpenBill || canSelfMint) && (
                <button type="button" onClick={handleCheckPayment} disabled={isCheckingPayment} className={textLink}>
                  {isCheckingPayment ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                      {t('checkoutCheckingStatus')}
                    </>
                  ) : (
                    <>
                      <CheckCircle size={14} className="text-slate-400" />
                      {t('checkoutAlreadyPaid')}
                    </>
                  )}
                </button>
              )}
              {state.canCancel && (
                <button type="button" onClick={() => setConfirmCancel(true)} disabled={isWorking} className={`${textLink} text-slate-500 hover:text-rose-700`}>
                  {entry.isExtension ? t('btnCancelExtension') : t('btnCancelOrder')}
                </button>
              )}
            </>
          ) : undefined
        }
      />
      {/*
        Konfirmasi batal — pola dialog batal order di StatusPage. Kunci
        `cancelOrderConfirm*` (order TERSIMPAN), BUKAN `cancelOrderTitle/Body`
        (itu membuang DRAFT, menjanjikan "data hilang"). Perpanjangan punya
        kalimatnya sendiri: hanya jadwal itu yang dilepas, iklan utamanya jalan.
      */}
      <Dialog open={confirmCancel} onOpenChange={(open) => { if (!open && !isWorking) setConfirmCancel(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {entry.isExtension ? t('cancelExtensionConfirmTitle') : t('cancelOrderConfirmTitle')}
            </DialogTitle>
            <DialogDescription className="pt-1 leading-relaxed">
              <strong className="font-semibold text-gray-900">{entry.title || t('untitledSurvey')}</strong>
              {' — '}
              {entry.isExtension
                ? t(entry.distributionType === 'kilat' ? 'cancelExtensionConfirmBodyKilat' : 'cancelExtensionConfirmBody')
                : t('cancelOrderConfirmBody')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmCancel(false)}
              disabled={isWorking}
              className="max-md:w-full rounded-full"
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void handleCancel()}
              disabled={isWorking}
              className="max-md:w-full rounded-full bg-slate-700 hover:bg-slate-800 text-white font-semibold"
            >
              {isWorking && <Loader2 className="w-4 h-4 animate-spin" />}
              {entry.isExtension ? t('cancelExtensionConfirmAction') : t('cancelOrderConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-16">
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="inline-flex items-center gap-2 -ml-2 mb-4 px-2 py-2 rounded-lg text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 hover:bg-slate-200/60"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('backToOrders')}
      </button>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-2">
        <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto" />
        <h2 className="text-base font-bold text-emerald-950">{t('checkoutPaidSuccess')}</h2>
        <p className="text-sm text-emerald-800">{entry.title} · #{entry.bookingId}</p>
      </div>
    </div>
  );
}
