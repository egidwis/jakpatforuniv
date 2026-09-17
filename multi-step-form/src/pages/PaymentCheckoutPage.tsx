import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getFormSubmissionById,
  releaseExpiredSlot,
  rebookSlotForSubmission,
  fetchScheduleBilling,
} from '../utils/supabase';
import { createPayment, GroupBillError } from '../utils/payment';
import { toast } from 'sonner';
import {
  CreditCard,
  AlertTriangle,
  Clock,
  ArrowRight,
  CheckCircle,
  CalendarCheck,
  Lock,
  Loader2,
  Info,
  RefreshCw,
} from 'lucide-react';
import type { FormSubmission, AdScheduleEntry } from '../utils/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import {
  normalizeScheduleDate,
  paymentCutoffInstant,
  toWibYmd,
  toAiringStartIso,
  toAiringLastDayIso,
} from '../utils/airing-window';
import { slotReleaseDeadline } from '../utils/slotHold';
import { airingDayCount } from './dashboard/schedule/scheduleModel';
import { SchedulePicker } from '../components/SchedulePicker';
import { CostBreakdown } from '../components/CostBreakdown';
import { ScheduleReservationLayout } from '../components/schedule/ScheduleReservationLayout';
import { deriveScheduleMoney } from '../utils/scheduleMoney';
import { useSlotAvailability } from '../hooks/useSlotAvailability';
import { scheduleLockGate } from '../utils/scheduleLockGate';

/**
 * Fase B dari langkah "Jadwal & Bayar": jadwal sudah terkunci, tinggal dibayar.
 *
 * Punya route sendiri karena ada DUA pintu masuk "kembali setelah pergi" yang
 * tidak bisa dilayani state wizard (draft sudah dihapus begitu order tersimpan):
 * auto-redirect saat user punya order `waiting_payment`, dan CTA "Bayar
 * Sekarang" di kartu order.
 *
 * Saat waktunya habis, layar ini TIDAK melempar user balik ke wizard lagi.
 * Kalendernya hidup kembali di tempat, dan tanggal baru meng-update order yang
 * sama lewat id yang eksplisit — bukan lewat draft localStorage yang bisa basi
 * dan pernah membuat survei LAIN tertimpa.
 */
export function PaymentCheckoutPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [submission, setSubmission] = useState<FormSubmission | null>(null);
  /** `payment_id` tagihan yang MASIH HIDUP untuk jadwal ini — bukan baris mana pun. */
  const [invoicePaymentId, setInvoicePaymentId] = useState<string | null>(null);
  /** Link DOKU tagihan hidup itu. Ada = "Bayar Sekarang" tinggal membukanya. */
  const [livePayUrl, setLivePayUrl] = useState<string | null>(null);
  /**
   * Nominal yang BENAR-BENAR ditagihkan oleh tagihan hidup itu.
   *
   * ⚠️ BUKAN `submission.total_cost`. Kolom itu catatan saat order lahir dan
   * bisa menyimpang dari `invoices.amount` — `recordedVsBilled` sudah mengukur
   * selisihnya di produksi (88 baris, 11 di antaranya bukan kesengajaan).
   * Yang harus dibaca peneliti di layar bayar adalah angka yang akan ditarik
   * dari kartunya, bukan angka yang tercatat waktu itu.
   *
   * `null` = belum ada tagihan terbit; `total_cost` jadi cadangan, dan ia
   * memang estimasi pada tahap itu.
   */
  const [liveBilledAmount, setLiveBilledAmount] = useState<number | null>(null);
  /** Order yang sudah pernah dicoba diterbitkan tagihannya otomatis di sesi ini. */
  const mintAttemptedFor = useRef<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number>(3600);
  const [isExpired, setIsExpired] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  /** Batas bayar 14.00 WIB pada hari tayang sudah lewat.
   *
   *  ⚠️ Ini MURNI TAMPILAN dan tidak boleh dipakai untuk melepas slot. Yang
   *  habis di jam 14.00 bukan reservasinya, melainkan waktu admin menyiapkan
   *  halaman iklan untuk tayang 15.00 — perbedaan yang sudah dinyatakan di
   *  `components/status/airingPeriods.ts` dan dulu dilanggar tepat di sini. */
  const [isTooLateToday, setIsTooLateToday] = useState(false);
  /** Slot yang tidak pernah lepas sendiri tidak punya hitung mundur untuk
   *  ditampilkan. Lihat `utils/slotHold.ts`. */
  const [hasHoldDeadline, setHasHoldDeadline] = useState(false);

  // Kalender pemulihan: hanya relevan setelah kedaluwarsa, tapi hook harus
  // tetap dipanggil tanpa syarat. Order ini dikecualikan dari hitungan supaya
  // tanggal yang baru saja dilepasnya tidak tampak penuh oleh dirinya sendiri.
  //
  // Kuotanya ikut jenis distribusi order — kalau tidak, order Kilat akan
  // memesan ulang terhadap kolam slot reguler dan menembus kuota Kilat.
  // Sebelum submission-nya termuat, 'regular' hanya nilai sementara; hook
  // memuat ulang sendiri begitu mode-nya berubah.
  const availability = useSlotAvailability(
    submission?.distribution_type === 'kilat' ? 'kilat' : 'regular',
    submissionId
  );
  const [repickDate, setRepickDate] = useState<string | null>(null);
  const [isRebooking, setIsRebooking] = useState(false);

  const handleExpired = useCallback(async (id: string) => {
    setIsExpired(true);
    setTimeLeft(0);
    try {
      await releaseExpiredSlot(id);
    } catch (e) {
      console.error('Failed to release expired slot:', e);
    }
  }, []);

  const loadSubmission = useCallback(async () => {
    if (!submissionId) return;
    setIsLoading(true);
    try {
      const data = await getFormSubmissionById(submissionId);
      if (!data) {
        toast.error(t('paymentSubmissionNotFound'));
        navigate('/dashboard');
        return;
      }

      setSubmission(data);

      /*
        ⚠️ TAGIHAN YANG HIDUP UNTUK JADWAL INI — bukan `invoices[0]`.

        Versi sebelumnya mengambil baris terbaru milik seluruh ORDER, tanpa
        saringan status maupun jadwal. Sesudah peneliti menjadwalkan ulang,
        yang tersisa adalah tagihan lama yang sudah kedaluwarsa — dan link
        "Lihat invoice" memajangnya sebagai tagihan berjalan, lengkap dengan
        tanggal terbit yang sudah lewat. Pola yang sama sudah dibersihkan di
        kartu admin dan dashboard peneliti; halaman ini yang terakhir.
      */
      try {
        const billings = await fetchScheduleBilling(submissionId);
        const own = [...billings.values()].find((b) => b.sourceId === submissionId) ?? null;
        setInvoicePaymentId(own?.openInvoice?.paymentId ?? null);
        setLivePayUrl(own?.openInvoice?.paymentUrl ?? null);
        setLiveBilledAmount(own?.openInvoice?.amount ?? null);
      } catch (e) {
        console.error('Failed to load live billing:', e);
        setInvoicePaymentId(null);
        setLivePayUrl(null);
        setLiveBilledAmount(null);
      }

      if (data.payment_status === 'paid') {
        navigate('/dashboard?payment_status=paid');
        return;
      }

      // ⚠️ HANYA RESERVASI MANDIRI YANG BISA LEPAS KARENA WAKTU.
      //
      // Jadwal yang dibuat admin — dan baris lama tanpa `slot_booked_by` —
      // tidak pernah lepas sendiri; melepasnya keputusan admin. Aturan itu
      // sudah dijaga di tujuh tempat lain (holdsSlot, deriveLifecycle,
      // deriveOrderUiState, isExpiredHold, PaymentRetryPage, CampaignActions,
      // create-payment.js); halaman inilah satu-satunya yang dulu
      // melanggarnya — dan satu-satunya yang memanggil `releaseExpiredSlot`.
      //
      // Terukur 2026-08-10 sebelum perbaikan ini: 35 jadwal admin belum lunas
      // yang hold 1 jam-nya sudah lewat (6 tayang 10–13 Agu), plus 264 baris
      // tanpa `slot_booked_by` yang cabang `else` lama hapus SEKETIKA.
      const releaseAt = slotReleaseDeadline({
        slotBookedBy: data.slot_booked_by,
        slotReservedAt: data.slot_reserved_at,
      });
      const now = Date.now();

      // Batas 14.00 WIB tidak lagi ikut menentukan pelepasan — ia hanya
      // memberi tahu bahwa TANGGAL itu sudah tidak terkejar.
      const cutoff = data.start_date
        ? paymentCutoffInstant(toWibYmd(normalizeScheduleDate(data.start_date))).getTime()
        : null;

      setIsTooLateToday(cutoff !== null && now > cutoff);
      setHasHoldDeadline(releaseAt !== null);

      // Slot yang SUDAH dilepas harus tetap dikenali sesudah reload.
      // `releaseExpiredSlot` mengosongkan `slot_booked_by`, jadi aturan hold di
      // atas mengembalikan "tidak pernah lepas" untuk baris yang justru sudah
      // lepas. `payment_status` yang menyimpan faktanya — pola yang sama sudah
      // dipakai PaymentRetryPage.
      if (data.payment_status === 'expired') {
        setIsExpired(true);
        setTimeLeft(0);
        return;
      }

      if (releaseAt === null) {
        setTimeLeft(0);
        setIsExpired(false);
      } else if (now > releaseAt) {
        handleExpired(data.id);
      } else {
        setTimeLeft(Math.floor((releaseAt - now) / 1000));
        setIsExpired(false);
      }
    } catch (error) {
      console.error('Failed to load submission:', error);
      toast.error(t('paymentLoadError'));
    } finally {
      setIsLoading(false);
    }
  }, [submissionId, navigate, handleExpired, t]);

  useEffect(() => {
    loadSubmission();
  }, [loadSubmission]);

  // Timer countdown — hanya untuk slot yang memang bisa lepas sendiri.
  // Tanpa `hasHoldDeadline`, jadwal admin akan ikut menghitung mundur dan
  // memanggil `handleExpired` saat mencapai nol.
  useEffect(() => {
    if (isLoading || isExpired || !hasHoldDeadline || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (submission?.id) handleExpired(submission.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLoading, isExpired, hasHoldDeadline, timeLeft, submission, handleExpired]);

  // Polling status pembayaran — user biasanya membayar di tab lain.
  useEffect(() => {
    if (isExpired || !submissionId || isLoading) return;

    const poll = setInterval(async () => {
      try {
        const data = await getFormSubmissionById(submissionId);
        if (data && data.payment_status === 'paid') {
          clearInterval(poll);
          navigate('/dashboard?payment_status=paid');
        }
      } catch (e) {
        console.warn('Payment poll failed, will retry:', e);
      }
    }, 5000);

    return () => clearInterval(poll);
  }, [isExpired, submissionId, isLoading, navigate]);

  /**
   * Umur link DOKU mengikuti umur reservasinya. Untuk jadwal admin — yang
   * tidak punya umur — dulu baris ini membaca `slot_reserved_at!` yang NULL
   * dan mengirim "Invalid Date" ke DOKU. Jalur itu baru benar-benar terpakai
   * sejak halaman ini berhenti menganggap jadwal admin kedaluwarsa, jadi
   * fallback-nya wajib ada.
   *
   * Diangkat jadi fungsi sendiri karena kini ada DUA pemanggil: penerbitan
   * otomatis saat halaman dibuka, dan tombol bayar.
   */
  const billExpiryFor = useCallback((sub: FormSubmission): Date => {
    const releaseAt = slotReleaseDeadline({
      slotBookedBy: sub.slot_booked_by,
      slotReservedAt: sub.slot_reserved_at,
    });
    const cutoffMs = sub.start_date
      ? paymentCutoffInstant(toWibYmd(normalizeScheduleDate(sub.start_date))).getTime()
      : null;
    // Batas bayar hari tayang selagi masih di depan; kalau sudah lewat,
    // 7 hari — sama dengan tagihan manual admin (utils/payment.ts).
    const fallback =
      cutoffMs !== null && cutoffMs > Date.now()
        ? cutoffMs
        : Date.now() + 7 * 24 * 60 * 60 * 1000;
    return new Date(releaseAt ?? fallback);
  }, []);

  /*
    ── TAGIHAN TERBIT SAAT SLOT DIKUNCI, BUKAN SAAT TOMBOL BAYAR DITEKAN ──

    Keputusan pemilik produk 2026-08-19 (opsi A). Sebelumnya `createPayment`
    hanya berjalan dari tombol bayar, jadi antara "Kunci Jadwal" dan klik itu
    tidak ada satu pun baris tagihan: admin melihat "belum ada tagihan" dengan
    tombol "Terbitkan Tagihan" AKTIF. Kalau admin menekannya lalu peneliti
    menekan bayar, lahir DUA tagihan terbuka untuk satu jadwal — persis yang
    dilarang aturan satu-tagihan-terbuka-per-jadwal (sql/53).

    Halaman ini adalah tujuan otomatis sesudah penguncian, jadi menerbitkan di
    sini setara "saat dikunci" tanpa perlu menambah pemicu di dua tempat
    (wizard dan rebook) yang nanti bisa berselisih.

    Umur link tidak berubah: ia SUDAH dipatok ke `slot_reserved_at + 1 jam`,
    bukan ke saat diklik — jadi menerbitkan lebih awal tidak memotong waktu
    peneliti sedetik pun.

    Kegagalan DOKU TIDAK boleh merusak halaman: kalau gagal, tombol bayar
    tetap bisa menerbitkan sendiri seperti dulu. Karena itu diam-diam.
  */
  useEffect(() => {
    if (!submission?.id || isLoading || isExpired || isTooLateToday) return;
    if (invoicePaymentId) return;                       // sudah ada yang hidup
    if (['paid', 'completed'].includes(submission.payment_status || '')) return;
    /*
      ⚠️ SATU PERCOBAAN PER ORDER, DIJAGA REF.
      Sukses menerbitkan memicu `loadSubmission`, yang membalik `isLoading` dan
      menjalankan efek ini lagi. Biasanya tidak apa-apa: `invoicePaymentId`
      sudah terisi, jadi ia langsung keluar. Tapi kalau tagihan yang baru
      terbit TIDAK terbaca hidup — misalnya INSERT `invoices` gagal dan hanya
      baris `transactions` yang lahir, yang mana `create-payment` cuma mencatat
      dan tidak menggagalkan — syarat keluarnya tak pernah terpenuhi dan
      halaman ini akan menerbitkan tagihan berulang-ulang ke DOKU.
    */
    if (mintAttemptedFor.current === submission.id) return;
    mintAttemptedFor.current = submission.id;

    let cancelled = false;
    (async () => {
      try {
        await createPayment({
          formSubmissionId: submission.id!,
          amount: submission.total_cost || 0,
          customerInfo: {
            title: submission.title || 'Survey',
            fullName: submission.full_name || 'Pengguna',
            email: submission.email || 'user@example.com',
            phoneNumber: submission.phone_number || '-',
          },
          expiredAt: billExpiryFor(submission).toISOString(),
        });
        if (!cancelled) await loadSubmission();
      } catch (e) {
        /*
          ⚠️ 409 TAGIHAN GABUNGAN BUKAN KEGAGALAN — ia jawaban yang benar.
          Pesanan ini sudah ditanggung satu link bersama pesanan lain, jadi
          server menolak mencetak yang kedua (A3). Kalau ditelan seperti error
          biasa, halaman ini berakhir tanpa link bayar sama sekali dan peneliti
          terdampar: tagihannya ADA, cuma tidak terlihat dari sini.

          `fetchScheduleBilling` di `loadSubmission` seharusnya sudah
          menemukannya lewat `openInvoice`; kalau ternyata tidak (mis. barisnya
          milik jadwal lain di order yang sama), link dari 409 itu yang dipakai.
        */
        if (e instanceof GroupBillError && e.paymentUrl && !cancelled) {
          console.info('[payment] Order ini ditanggung tagihan gabungan; memakai link grupnya.');
          setLivePayUrl(e.paymentUrl);
          if (e.paymentId) setInvoicePaymentId(e.paymentId);
          return;
        }
        // Sengaja senyap — tombol bayar masih jadi jaring pengamannya.
        console.warn('[payment] Gagal menerbitkan tagihan otomatis:', e);
      }
    })();
    return () => { cancelled = true; };
    // `loadSubmission` sengaja tidak jadi dependency: ia memicu ulang efek ini
    // lewat state yang ia sendiri ubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission?.id, invoicePaymentId, isLoading, isExpired, isTooLateToday]);

  const handleProceedPayment = async () => {
    if (!submission?.id || isExpired) return;

    // Tagihannya sudah terbit saat slot dikunci — tinggal dibuka. Tanpa await
    // di jalur ini, jadi tidak ada urusan popup blocker sama sekali.
    if (livePayUrl) {
      window.open(livePayUrl, '_blank');
      return;
    }

    setIsProcessingPayment(true);

    let paymentWindow: Window | null = null;
    try {
      const expirationDate = billExpiryFor(submission);

      // Tab baru dibuka di awal supaya tidak kena popup blocker (ada await di bawah)
      paymentWindow = window.open('about:blank', '_blank');

      const paymentUrl = await createPayment({
        formSubmissionId: submission.id,
        amount: submission.total_cost || 0,
        customerInfo: {
          title: submission.title || 'Survey',
          fullName: submission.full_name || 'Pengguna',
          email: submission.email || 'user@example.com',
          phoneNumber: submission.phone_number || '-'
        },
        expiredAt: expirationDate.toISOString()
      });

      if (paymentWindow) {
        paymentWindow.location.href = paymentUrl;
      } else {
        window.location.href = paymentUrl;
      }
    } catch (error) {
      console.error(error);
      if (paymentWindow) paymentWindow.close();
      toast.error(t('checkoutPaymentError'));
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleCheckPayment = async () => {
    if (!submissionId) return;
    setIsCheckingPayment(true);
    try {
      const data = await getFormSubmissionById(submissionId);
      if (data && data.payment_status === 'paid') {
        toast.success(t('checkoutPaidSuccess'));
        setTimeout(() => navigate('/dashboard?payment_status=paid'), 1000);
      } else {
        toast.info(t('checkoutNotPaidYet'));
      }
    } catch (e) {
      toast.error(t('checkoutCheckError'));
    } finally {
      setIsCheckingPayment(false);
    }
  };

  /** Kunci ulang tanggal untuk order yang sama, tanpa meninggalkan halaman. */
  const handleRebook = async () => {
    if (!submission?.id) return;
    /*
      Gerbangnya sama persis dengan StepSchedule — kini lewat `scheduleLockGate`
      alih-alih disalin. ⚠️ Dan di jalur INI ia satu-satunya yang berdiri:
      `rebookSlotForSubmission` hanya menolak order yang sudah lunas, tidak
      memeriksa kuota sama sekali. Tidak ada pemeriksaan ulang di server.
    */
    const verdict = scheduleLockGate({
      selected: repickDate,
      duration: submission.duration || 1,
      availability,
    });
    if (!verdict.ok) {
      toast.error(t(verdict.messageKey));
      if (verdict.clearSelection) setRepickDate(null);
      if (verdict.shouldReload) void availability.reload();
      return;
    }

    setIsRebooking(true);
    try {
      await rebookSlotForSubmission(submission.id, verdict.ymd, verdict.duration);
      toast.success(t('rebookSuccess'));
      setRepickDate(null);
      setIsExpired(false);
      await loadSubmission();
    } catch (e) {
      console.error('Failed to rebook slot:', e);
      toast.error(t('rebookError'));
    } finally {
      setIsRebooking(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="pt-24 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!submission) return null;

  const airingDays = airingDayCount(submission.start_date, submission.end_date) ?? submission.duration ?? 1;
  const startYmd = submission.start_date
    ? toWibYmd(normalizeScheduleDate(submission.start_date))
    : null;

  // Rentang tayang untuk slip. Ujungnya diambil dari helper yang sama dengan
  // yang dipakai ringkasan di layar jadwal, supaya kedua layar tidak bisa
  // menyebut tanggal akhir yang berbeda untuk order yang sama.
  const fmtSlipDate = (d: Date) =>
    d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
  // Keduanya diturunkan dari `startYmd` yang sudah dinormalkan ke WIB, bukan
  // dari kolom mentah — kalau tidak, ujung dan pangkal rentang bisa memakai
  // dua penafsiran zona waktu yang berbeda untuk baris yang sama.
  const airingStartLabel = startYmd ? fmtSlipDate(new Date(toAiringStartIso(startYmd))) : null;
  const airingLastDayLabel = startYmd
    ? fmtSlipDate(new Date(toAiringLastDayIso(startYmd, airingDays)))
    : null;

  /*
    ⚠️ ENTRY SEMENTARA, bukan baris jadwal sungguhan — layar ini milik ORDER
    (ordinal 1), yang barisnya hidup di `form_submissions`.

    Pola `Pick` + cast terjaga diambil dari `draftScheduleMoney.ts`: hanya kolom
    yang BENAR-BENAR dibaca `deriveScheduleMoney` yang diisi. Mengarang 15 kolom
    lain supaya lolos tipe justru membuat objek ini terlihat seperti data, dan
    salah satunya (`additionalPrizePerWinner`) adalah gerbang yang memutuskan
    apakah insentif boleh dipecah sama sekali — ia harus dinyatakan, bukan
    kebetulan `undefined`.
  */
  const pricingEntry: Pick<
    AdScheduleEntry,
    | 'ordinal' | 'duration' | 'status' | 'distributionType' | 'totalCost'
    | 'subtotal' | 'ppnAmount' | 'voucherCode' | 'prizePerWinner'
    | 'winnerCount' | 'additionalPrizePerWinner' | 'isNewPeriod'
  > = {
      ordinal: 1,
      duration: submission.duration ?? 1,
      distributionType: submission.distribution_type ?? 'regular',
      additionalPrizePerWinner: 0,
      isNewPeriod: false,
      totalCost: liveBilledAmount ?? submission.total_cost ?? 0,
      subtotal: submission.subtotal ?? null,
      ppnAmount: submission.ppn_amount ?? null,
      /*
        ⚠️ Voucher ORDER saja. Voucher TAGIHAN tidak dibaca di layar ini —
        `liveBilledAmount` sudah membawa nominal tagihan hidup apa adanya, jadi
        totalnya benar tanpa perlu menilai ulang vouchernya. Presedensi
        selengkapnya dipegang `effectiveVoucher()` di `scheduleMoney.ts`.
      */
      voucherCode: submission.voucher_code || null,
      prizePerWinner: submission.prize_per_winner ?? 0,
      winnerCount: submission.winner_count ?? 0,
      status: isExpired ? 'waiting_payment' : (submission.status || 'waiting_payment'),
  };

  const money = deriveScheduleMoney(pricingEntry as AdScheduleEntry, {
    question_count: submission.question_count,
    distribution_type: submission.distribution_type,
    voucher_code: submission.voucher_code || null,
  });

  if (isExpired) {
    return (
      <ScheduleReservationLayout
        onBack={() => navigate('/dashboard')}
        backLabel={t('backToOrders')}
        isBusy={isRebooking}
        orderLabel={submission.title || 'Untitled Form'}
        title={t('segmentReservation')}
        subtitle={t('scheduleSubtitle')}
        alertBanner={
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <AlertTriangle size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-amber-900">{t('paymentExpiredTitle')}</h3>
              <p className="text-xs text-amber-800 leading-relaxed mt-0.5">
                {isTooLateToday ? t('paymentExpiredCutoffBody') : t('paymentExpiredHoldBody')}
              </p>
            </div>
          </div>
        }
        calendar={
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
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t('slotAvailabilityRetry')}
                </button>
              )}
            </div>
            <SchedulePicker
              availability={availability}
              duration={submission.duration || 1}
              mode={submission.distribution_type === 'kilat' ? 'kilat' : 'regular'}
              value={repickDate}
              onChange={setRepickDate}
            />
          </div>
        }
        cost={
          <CostBreakdown
            total={liveBilledAmount ?? submission.total_cost ?? 0}
            lines={money.lines}
            note={money.note}
            variant="compact"
            defaultOpen={false}
          />
        }
        cta={
          <button
            type="button"
            onClick={handleRebook}
            disabled={!repickDate || isRebooking || availability.isLoading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {isRebooking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('lockingSlotLoading')}
              </>
            ) : (
              <>
                <Lock size={15} />
                <span>{t('rebookCta')}</span>
              </>
            )}
          </button>
        }
      />
    );
  }

  return (
    <ScheduleReservationLayout
      onBack={() => navigate('/dashboard')}
      backLabel={t('backToOrders')}
      orderLabel={submission.title || 'Untitled Form'}
      title={t('paymentPhaseTitle')}
      subtitle={t('paymentPhaseSubtitle')}
      alertBanner={
        isTooLateToday ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3 shadow-2xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-amber-900">{t('paymentPastCutoffTitle')}</p>
              <p className="text-xs text-amber-800 leading-relaxed">{t('paymentPastCutoffBody')}</p>
            </div>
          </div>
        ) : undefined
      }
      calendar={
        <div className="space-y-4">
          {/* Timer Countdown Card */}
          {hasHoldDeadline ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 text-center space-y-1.5 shadow-2xs">
              <div className="inline-flex items-center gap-2 text-2xl md:text-3xl font-bold text-jfu-primary tabular-nums">
                <Clock className="w-6 h-6 text-jfu-primary" /> {formatTime(timeLeft)}
              </div>
              <p className="text-xs font-medium text-slate-600">
                {t('scheduleHoldHint')}
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700">{t('slotHeldByAdminLabel')}</p>
            </div>
          )}

          {/* Locked Schedule Info */}
          {startYmd && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Jadwal Tayang Terkunci
                </span>
                <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-blue-50 border border-blue-100 text-jfu-primary">
                  {airingDays} {t('days')}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                <CalendarCheck className="w-4 h-4 text-jfu-primary shrink-0" />
                <span>
                  {airingStartLabel}
                  {airingLastDayLabel !== airingStartLabel && ` – ${airingLastDayLabel}`}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-xs font-normal text-slate-500">{t('airingStartsAt')}</span>
              </div>
            </div>
          )}
        </div>
      }
      cost={
        <CostBreakdown
          total={liveBilledAmount ?? submission.total_cost ?? 0}
          lines={money.lines}
          note={money.note}
          variant="compact"
          defaultOpen={false}
        />
      }
      bottomNotice={
        <div className="space-y-1 text-center">
          <p className="text-xs text-slate-500 leading-relaxed">
            {hasHoldDeadline ? t('timerConsequenceNote') : t('slotHeldByAdminNote')}
          </p>
        </div>
      }
      cta={
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={handleProceedPayment}
            disabled={isProcessingPayment}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {isProcessingPayment ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('checkoutProcessing')}
              </>
            ) : (
              <>
                <CreditCard size={16} />
                <span>{t('checkoutPayNow')}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCheckPayment}
            disabled={isCheckingPayment}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-6 py-2.5 text-sm font-semibold text-slate-600 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isCheckingPayment ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                {t('checkoutCheckingStatus')}
              </>
            ) : (
              <>
                <CheckCircle size={15} className="text-slate-400" />
                <span>{t('checkoutAlreadyPaid')}</span>
              </>
            )}
          </button>
        </div>
      }
    />
  );
}
