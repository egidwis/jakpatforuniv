import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getFormSubmissionById,
  releaseExpiredSlot,
  rebookSlotForSubmission,
  fetchScheduleBilling,
} from '../utils/supabase';
import { createPayment } from '../utils/payment';
import { toast } from 'sonner';
import {
  CreditCard,
  AlertTriangle,
  Clock,
  ArrowRight,
  CheckCircle,
  ArrowLeft,
  CalendarCheck,
  Lock,
  Loader2,
  Info,
  FileText,
  ExternalLink,
} from 'lucide-react';
import type { FormSubmission } from '../utils/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import {
  normalizeScheduleDate,
  paymentCutoffInstant,
  toWibYmd,
  isBookingClosedForDate,
  toAiringStartIso,
  toAiringLastDayIso,
} from '../utils/airing-window';
import { slotReleaseDeadline } from '../utils/slotHold';
import { airingDayCount } from './dashboard/schedule/scheduleModel';
import { SchedulePicker } from '../components/SchedulePicker';
import { useSlotAvailability } from '../hooks/useSlotAvailability';

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
      } catch (e) {
        console.error('Failed to load live billing:', e);
        setInvoicePaymentId(null);
        setLivePayUrl(null);
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
    if (!submission?.id || !repickDate) return;
    if (isBookingClosedForDate(repickDate)) {
      toast.error(t('slotErrorPastCutoff'));
      setRepickDate(null);
      return;
    }
    const days = submission.duration || 1;
    // Sama seperti di StepSchedule: `counts` kosong menjawab "lowong" untuk
    // semua tanggal. Jalur ini bahkan tidak punya pemeriksaan ulang di server
    // (`rebookSlotForSubmission` hanya menolak order yang sudah lunas), jadi
    // gerbang ini satu-satunya yang berdiri.
    if (!availability.isReady) {
      toast.error(t('slotErrorAvailabilityUnknown'));
      void availability.reload();
      return;
    }
    if (!availability.isRangeAvailable(repickDate, days)) {
      toast.error(t('slotErrorFull'));
      return;
    }

    setIsRebooking(true);
    try {
      await rebookSlotForSubmission(submission.id, repickDate, days);
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

  return (
    <div className="min-h-screen bg-gray-50/50 pb-12">
      {/* Header back — bar kedua yang menempel di bawah AppNav */}
      <div className="sticky top-14 md:top-16 z-30 bg-gray-50/90 backdrop-blur-md border-b border-gray-200/70">
        <div className={`${isExpired ? 'max-w-3xl' : 'max-w-xl'} mx-auto px-4 h-12 flex items-center`}>
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors -ml-1 px-1 py-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToOrders')}
          </button>
        </div>
      </div>

      <div className={`${isExpired ? 'max-w-3xl' : 'max-w-xl'} mx-auto px-6 pt-8`}>
        {isExpired ? (
          /* ── Kedaluwarsa: kalender hidup kembali DI TEMPAT ───────────────── */
          <div className="space-y-3.5 animate-in fade-in duration-300">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 md:p-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-amber-900">{t('paymentExpiredTitle')}</h2>
                  <p className="text-sm text-amber-800 leading-relaxed mt-1">
                    {isTooLateToday ? t('paymentExpiredCutoffBody') : t('paymentExpiredHoldBody')}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm overflow-hidden space-y-4">
              {/* Title + subtitle grouped with tight spacing */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg md:text-xl font-bold text-gray-900 leading-snug">
                    {t('rebookPickTitle')}
                  </h2>
                  {availability.isLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                </div>
                <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
                  {t('scheduleSubtitle')}
                </p>
              </div>

              {/* Calendar picker wrapped in card */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-4 shadow-2xs">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{t('scheduleCutoffNote')}</span>
                </div>
                <SchedulePicker
                  availability={availability}
                  duration={submission.duration || 1}
                  mode={submission.distribution_type === 'kilat' ? 'kilat' : 'regular'}
                  value={repickDate}
                  onChange={setRepickDate}
                />
              </div>
            </div>

            <div className="space-y-2 pb-4">
              <button
                onClick={handleRebook}
                disabled={!repickDate || isRebooking || availability.isLoading}
                className="w-full h-11 sm:h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-jfu-primary to-jfu-light hover:from-jfu-dark hover:to-jfu-primary text-white font-bold text-sm sm:text-base shadow-xs hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                    <span aria-hidden="true">→</span>
                  </>
                )}
              </button>

              <p className="text-xs text-gray-500 text-center leading-relaxed px-4">{t('scheduleHoldHint')}</p>
            </div>
          </div>
        ) : (
          /* ── Fase B: jadwal terkunci, tinggal dibayar ────────────────────── */
          <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm space-y-5 text-left animate-in fade-in duration-300">
            {/* Header: Title + Subtitle + Timer Badge */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-snug">
                  {t('paymentPhaseTitle')}
                </h1>
                <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
                  {t('paymentPhaseSubtitle')}
                </p>
              </div>

              {/* Timer Countdown Badge (Dark Slate / Navy modern badge) */}
              {hasHoldDeadline ? (
                <div className="inline-flex items-center gap-1.5 bg-slate-900 text-white px-3.5 py-1.5 rounded-xl shrink-0 shadow-2xs">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-300 font-medium">{t('timerLabelHold')}</span>
                  <span className="font-mono font-bold text-sm tracking-wider text-white">
                    {formatTime(timeLeft)}
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 bg-slate-800 text-white px-3.5 py-1.5 rounded-xl shrink-0 shadow-2xs">
                  <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-300 font-medium">{t('slotHeldByAdminLabel')}</span>
                </div>
              )}
            </div>

            {/* Batas 14.00 WIB lewat — tanggalnya tidak terkejar, TAPI slotnya
                tidak dilepas. Pembayaran sengaja tetap dibuka: admin menagih
                order seperti ini secara manual, lalu menjadwalkan ulang. Tanpa
                peringatan ini user membayar tanpa tahu tanggalnya sudah geser. */}
            {isTooLateToday && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3 shadow-2xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-amber-900">{t('paymentPastCutoffTitle')}</p>
                  <p className="text-xs text-amber-800 leading-relaxed">{t('paymentPastCutoffBody')}</p>
                </div>
              </div>
            )}

            {/* Single Ticket Slip (Fintech Style) */}
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 md:p-5 space-y-3.5 text-left shadow-2xs">
              {/* Row 1: Survey Title + Duration */}
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm md:text-base font-bold text-gray-900 leading-snug line-clamp-2">
                  {submission.title || 'Untitled Form'}
                </h3>
                <span className="shrink-0 inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs">
                  {airingDays} {t('days')}
                </span>
              </div>

              {/* Row 2: Airing schedule */}
              {startYmd && (
                <div className="flex items-center gap-2 text-xs md:text-sm text-slate-600">
                  <CalendarCheck className="w-4 h-4 text-blue-500 shrink-0" />
                  <span className="font-medium">
                    {airingStartLabel}
                    {airingLastDayLabel !== airingStartLabel && ` – ${airingLastDayLabel}`}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-500">{t('airingStartsAt')}</span>
                </div>
              )}

              {/* Row 3: Dashed divider + Total & Invoice */}
              <div className="border-t border-dashed border-slate-200/90 pt-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      {t('checkoutTotalLabel')}
                    </span>
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      <span className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
                        Rp {new Intl.NumberFormat('id-ID').format(submission.total_cost || 0)}
                      </span>
                      {submission.ppn_amount != null && (
                        <span className="text-[11px] text-slate-400 font-normal">
                          ({t('totalIncludesTax')})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Invoice link — muncul hanya kalau invoice-nya memang sudah
                      ada. `/invoices/:paymentId` mencari baris transaksi lewat
                      kolom `payment_id`, dan baris itu baru lahir saat tombol
                      bayar ditekan untuk pertama kali. Sebelum itu tidak ada id
                      yang bisa dipakai: memaksakan id submission ke sini hanya
                      mendaratkan user di halaman "Invoice not found". */}
                  {invoicePaymentId && (
                    <a
                      href={`/invoices/${invoicePaymentId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-white hover:bg-slate-50 border border-slate-200/90 px-3 py-2 rounded-xl transition-colors shadow-2xs shrink-0"
                    >
                      <FileText size={13} className="text-blue-500" />
                      <span>{t('viewInvoiceLink')}</span>
                      <ExternalLink size={11} className="opacity-70" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2.5 pt-1">
              <button
                onClick={handleProceedPayment}
                disabled={isProcessingPayment}
                className="w-full h-11 sm:h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-jfu-primary to-jfu-light hover:from-jfu-dark hover:to-jfu-primary text-white font-bold text-sm sm:text-base shadow-xs hover:shadow transition-all disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
              >
                {isProcessingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('checkoutProcessing')}
                  </>
                ) : (
                  <>
                    <CreditCard size={17} />
                    <span>{t('checkoutPayNow')}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <button
                onClick={handleCheckPayment}
                disabled={isCheckingPayment}
                className="w-full h-10 sm:h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-white hover:bg-slate-50/80 border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-xs sm:text-sm shadow-2xs transition-all disabled:opacity-60 cursor-pointer"
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

              {/* Apa yang terjadi kalau angka di atas habis. Hitung mundur
                  tanpa akibat yang dinyatakan hanya menakuti — bagian "detail
                  surveimu tetap tersimpan" justru yang paling perlu dibaca. */}
              <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-1">
                {hasHoldDeadline ? t('timerConsequenceNote') : t('slotHeldByAdminNote')}
              </p>

              <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                {t('checkoutPaymentInfo')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
