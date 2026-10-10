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
import { CostBreakdown } from '../../components/CostBreakdown';
import { ScheduleReservationLayout } from '../../components/schedule/ScheduleReservationLayout';
import {
  ReservationSummary,
  LockedScheduleCard,
  HoldCountdown,
  AdminHoldNote,
  MobileBarInfo,
} from '../../components/schedule/ReservationParts';
import { lockedDateFitsHorizon } from '../../utils/scheduleHorizon';
import { toWibYmd, toAiringStartIso, isPaymentTooLateForDate } from '../../utils/airing-window';
import { airingDayCount } from './schedule/scheduleModel';
import { useSlotAvailability } from '../../hooks/useSlotAvailability';
import { scheduleLockGate } from '../../utils/scheduleLockGate';
import { isDailyQuotaFullError } from '../../utils/dailyQuotaError';
import { schedulePageState } from '../../utils/schedulePageState';
import { expiryPlanFor } from '../../utils/scheduleExpiry';
import { segmentTitleOf } from '../../utils/segmentTitle';
import { deriveScheduleMoney } from '../../utils/scheduleMoney';
import { slotReleaseDeadline, isSlotHoldReleased } from '../../utils/slotHold';
import { payLinkPath } from '../../utils/payLink';
import { creditPhaseOf } from '../../components/status/scheduleAxes';
import { isAutoReviewed } from '../../components/status/deriveOrderUiState';
import { createPayment, GroupBillError } from '../../utils/payment';
import { shouldAutoMint, canRepickInPlace, billExpiryFor } from '../../utils/jadwalBayarGates';
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
  const [isMinting, setIsMinting] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  /**
   * Kalender hidup lagi di keadaan bayar yang lewat 14.00 ("Pilih Tanggal
   * Lain"). `?pilih=1` datang dari tombol "Jadwalkan Ulang" di dashboard,
   * supaya peneliti tidak perlu mengklik niat yang sama dua kali.
   */
  const [repickMode, setRepickMode] = useState(searchParams.get('pilih') === '1');
  /** (jadwal, tanggal) yang sudah dicoba diterbitkan tagihannya di sesi ini. */
  const mintAttemptedFor = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const repickAllowed = !!entry && !!submission && canRepickInPlace({
    ordinal: entry.ordinal,
    siblingCount: siblings.length || 1,
    submissionStatus: submission.submission_status,
    scheduleStatus: entry.status,
    autoReviewed: isAutoReviewed(submission),
  });

  // Kuota ikut jenis distribusi jadwal ini. ⚠️ Order sendiri hanya dikecualikan
  // saat PILIH ULANG order berjadwal tunggal — tanggal yang sedang ia lepas
  // tidak boleh tampak penuh oleh dirinya sendiri. Untuk perpanjangan jangan:
  // jadwal pertama masih memakan kuota harinya (`assert_daily_ad_quota_free`).
  const availability = useSlotAvailability(
    entry?.distributionType === 'kilat' ? 'kilat' : 'regular',
    repickAllowed ? entry?.submissionId : undefined,
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
  /**
   * Batas bayar 14.00 WIB hari tayang sudah lewat. ⚠️ MURNI TAMPILAN — yang
   * habis bukan reservasinya, melainkan waktu admin menyiapkan halaman iklan.
   * Tidak pernah dipakai untuk melepas slot.
   */
  const tooLate = state?.screen === 'awaiting_payment' && !owedOnCredit
    && !!lockedYmd && isPaymentTooLateForDate(lockedYmd);
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
      }).toISOString(),
    });
  }, [entry, submission, lockedYmd]);

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
  useEffect(() => {
    if (!autoMint || !entry || !submission || isLoading) return;
    const key = `${entry.id}:${entry.startDate}`;
    if (mintAttemptedFor.current === key) return;
    mintAttemptedFor.current = key;

    setIsMinting(true);
    (async () => {
      try {
        await mintBill();
        if (mounted.current) await load();
      } catch (e) {
        /*
          ⚠️ 409 TAGIHAN GABUNGAN BUKAN KEGAGALAN: pesanan ini sudah ditanggung
          satu link bersama. `/bayar/<id>` menunjuk ke sana, jadi cukup nyatakan
          bahwa tagihannya ADA.
        */
        if (e instanceof GroupBillError) {
          if (mounted.current) setHasOpenBill(true);
          return;
        }
        console.warn('[jadwal-bayar] Gagal menerbitkan tagihan otomatis:', e);
      } finally {
        if (mounted.current) setIsMinting(false);
      }
    })();
  }, [autoMint, entry, submission, isLoading, mintBill, load]);

  /**
   * Bayar saat tagihan BELUM terbit (pemicu otomatis gagal, atau lewat 14.00
   * dan peneliti memilih "tetap bayar"). Tab dibuka sebelum await supaya tidak
   * kena popup blocker, lalu diarahkan ke `/bayar/<id>` — resolver yang
   * berwenang, bukan URL DOKU mentah dari respons.
   */
  const handlePayWithoutBill = async () => {
    if (!entry) return;
    const w = window.open('about:blank', '_blank');
    setIsMinting(true);
    try {
      await mintBill().catch((e) => {
        if (e instanceof GroupBillError) return null;
        throw e;
      });
      const href = payLinkPath(entry.id);
      if (w) w.location.href = href;
      else window.location.href = href;
      await load();
    } catch (e) {
      console.error('Gagal menerbitkan tagihan:', e);
      w?.close();
      toast.error(t('checkoutPaymentError'));
    } finally {
      setIsMinting(false);
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
    const verdict = scheduleLockGate({
      selected: picked,
      duration: entry.duration || 1,
      availability,
    });
    if (!verdict.ok) {
      toast.error(t(verdict.messageKey));
      if (verdict.clearSelection) setPicked(null);
      if (verdict.shouldReload) void availability.reload();
      return;
    }

    setIsWorking(true);
    try {
      await rebookSlotForSubmission(entry.submissionId, verdict.ymd, verdict.duration);
      toast.success(t('rebookSuccess'));
      setPicked(null);
      setRepickMode(false);
      await load();
    } catch (e) {
      console.error('Gagal mengunci tanggal:', e);
      if (isDailyQuotaFullError(e)) {
        // Ditolak trigger kuota harian (sql/111): kalender tertinggal dari
        // server. Kosongkan pilihan dan muat ulang supaya hari itu tampil penuh.
        toast.error(t('slotErrorFull'));
        setPicked(null);
        void availability.reload();
      } else {
        toast.error(t('rebookError'));
      }
    } finally {
      setIsWorking(false);
    }
  };

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
      toast.success(t('cancelScheduleSuccess'));
      navigate('/dashboard', { replace: true });
    } catch (e: any) {
      toast.error(e?.message || t('rebookError'));
    } finally {
      setIsWorking(false);
    }
  };

  if (isLoading && !entry) {
    return (
      <div className="pt-24 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-jfu-primary" />
      </div>
    );
  }

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

  const orderLabel = `${entry.title} · #${entry.bookingId}`;
  const mode = entry.distributionType === 'kilat' ? 'kilat' as const : 'regular' as const;

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

  const liveCalendar = (
    <div className="space-y-4">
      {calendarHeader}
      <SchedulePicker
        availability={availability}
        duration={entry.duration || 1}
        mode={mode}
        value={picked}
        onChange={setPicked}
        showSummary={false}
      />
    </div>
  );

  const lockCta = (label: string) => (
    <button
      type="button"
      onClick={handleLock}
      disabled={!picked || availability.isLoading || isWorking}
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
          backLabel={t('backToOrders')}
          isBusy={isWorking}
          orderLabel={orderLabel}
          title={t('segmentReservation')}
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
          summary={<ReservationSummary startYmd={picked} days={entry.duration || 1} />}
          mobileBarInfo={<MobileBarInfo total={quote.total} />}
          calendar={liveCalendar}
          cost={quoteCost}
          cta={lockCta(t('rebookCta'))}
        />
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
              onClick={() => navigate(`/dashboard/jadwal/baru/${entry.submissionId}`)}
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
    const selfPick = !!submission && isAutoReviewed(submission);
    return (
      <ScheduleReservationLayout
        onBack={() => navigate('/dashboard')}
        backLabel={t('backToOrders')}
        isBusy={isWorking}
        orderLabel={orderLabel}
        title={t(seg.key, seg.vars)}
        summary={<ReservationSummary startYmd={picked} days={entry.duration || 1} />}
        mobileBarInfo={selfPick ? <MobileBarInfo total={quote.total} /> : undefined}
        calendar={selfPick ? liveCalendar : (
          <p className="flex items-start gap-2 text-sm text-slate-600">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            {t('rescheduleHandledByTeam')}
          </p>
        )}
        cost={quoteCost}
        bottomNotice={selfPick ? undefined : null}
        cta={selfPick ? lockCta(t('scheduleLockCta')) : null}
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
          backLabel={t('backToOrders')}
          isBusy={isWorking}
          orderLabel={orderLabel}
          title={t('rebookPickTitle')}
          summary={
            <ReservationSummary
              startYmd={picked}
              days={entry.duration || 1}
              extraRows={lockedYmd ? [{ label: t('summaryPreviousDateLabel'), value: shortDate(lockedYmd) }] : []}
            />
          }
          mobileBarInfo={<MobileBarInfo total={quote.total} />}
          calendar={liveCalendar}
          cost={quoteCost}
          cta={lockCta(t('rebookCta'))}
          secondaryActions={lockedYmd ? (
            <button type="button" onClick={() => { setRepickMode(false); setPicked(null); }} disabled={isWorking} className={secondaryBtn}>
              {t('keepDateCta', { date: shortDate(lockedYmd) })}
            </button>
          ) : undefined}
        />
      );
    }

    /*
      Tombol bayar. ⚠️ `href` HANYA `payLinkPath(entry.id)` — resolver
      `/bayar/<id>` menjawab "tagihan mana yang berwenang" SAAT DIKLIK
      (`authoritative_payment_url`, sql/85), bukan saat link dirender. Halaman
      ini paling rawan: countdown-nya berjalan, jarak render→klik bisa satu jam.
    */
    const canSelfMint = entry.ordinal === 1 && entry.slotBookedBy === 'user' && !owedOnCredit && !holdExpired;
    const payLabel = offerRepick ? t('payAnywayCta') : t('payNow');
    const payButton = hasOpenBill ? (
      <a
        href={payLinkPath(entry.id)}
        target="_blank"
        rel="noopener noreferrer"
        className={offerRepick ? secondaryBtn : primaryBtn}
      >
        <CreditCard size={16} /> {payLabel}
      </a>
    ) : canSelfMint ? (
      <button
        type="button"
        onClick={handlePayWithoutBill}
        disabled={isMinting}
        className={offerRepick ? secondaryBtn : primaryBtn}
      >
        {isMinting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('checkoutProcessing')}
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
      <button type="button" onClick={() => setRepickMode(true)} className={primaryBtn}>
        <CalendarDays size={16} /> {t('repickOtherDateCta')}
      </button>
    );

    return (
      <ScheduleReservationLayout
        onBack={() => navigate('/dashboard')}
        backLabel={t('backToOrders')}
        isBusy={isWorking}
        orderLabel={orderLabel}
        title={creditPhase ? t('creditPageTitle') : t('paymentPhaseTitle')}
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
              <p className="text-xs font-semibold text-amber-900">{t('paymentPastCutoffTitle')}</p>
              <p className="text-xs text-amber-800 leading-relaxed">
                {offerRepick ? t('pastCutoffRepickBody') : t('paymentPastCutoffBody')}
              </p>
            </div>
          </div>
        ) : undefined}
        summary={<ReservationSummary startYmd={lockedYmd} days={lockedDays} />}
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
          lockedYmd && lockedFits ? (
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
        bottomNotice={
          /*
            Kredit: tanpa countdown dan tanpa "tim kami akan mengonfirmasi
            jadwalnya" — jadwalnya sudah pasti, tagihan tempo tanpa tenggat (K3).
          */
          creditPhase ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <CreditCard className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-amber-950">
                {creditPhase === 'stopped'
                  ? t('bannerTitleCreditStopped')
                  : creditPhase === 'ended'
                    ? t('bannerTitleCreditEnded')
                    : t('bannerTitleAiringOnCredit')}
              </p>
            </div>
          ) : state.showCountdown && timeLeft !== null ? (
            <HoldCountdown seconds={timeLeft} />
          ) : (
            <AdminHoldNote />
          )
        }
        cta={offerRepick ? repickButton : payButton}
        secondaryActions={
          <>
            {offerRepick && payButton}
            {!creditPhase && (hasOpenBill || canSelfMint) && (
              <button type="button" onClick={handleCheckPayment} disabled={isCheckingPayment} className={secondaryBtn}>
                {isCheckingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                    {t('checkoutCheckingStatus')}
                  </>
                ) : (
                  <>
                    <CheckCircle size={15} className="text-slate-400" />
                    {t('checkoutAlreadyPaid')}
                  </>
                )}
              </button>
            )}
            {state.canCancel && (
              <button type="button" onClick={handleCancel} disabled={isWorking} className={secondaryBtn}>
                {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('cancelOrderTitle')}
              </button>
            )}
          </>
        }
      />
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
