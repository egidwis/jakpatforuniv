import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFormSubmissionById, releaseExpiredSlot, rebookSlotForSubmission } from '../utils/supabase';
import { createPayment } from '../utils/payment';
import { toast } from 'sonner';
import { CreditCard, AlertTriangle, Clock, ArrowRight, CheckCircle, ArrowLeft, CalendarCheck, Lock, Loader2 } from 'lucide-react';
import type { FormSubmission } from '../utils/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import {
  normalizeScheduleDate,
  paymentCutoffInstant,
  toWibYmd,
  isBookingClosedForDate,
} from '../utils/airing-window';
import { slotReleaseDeadline } from '../utils/slotHold';
import { airingDayCount } from './dashboard/schedule/scheduleModel';
import { SchedulePicker, AiringSummary } from '../components/SchedulePicker';
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

  const handleProceedPayment = async () => {
    if (!submission?.id || isExpired) return;
    setIsProcessingPayment(true);

    let paymentWindow: Window | null = null;
    try {
      // Umur link DOKU mengikuti umur reservasinya. Untuk jadwal admin —
      // yang tidak punya umur — dulu baris ini membaca `slot_reserved_at!`
      // yang NULL dan mengirim "Invalid Date" ke DOKU. Jalur itu baru
      // benar-benar terpakai sejak halaman ini berhenti menganggap jadwal
      // admin kedaluwarsa, jadi fallback-nya wajib ada.
      const releaseAt = slotReleaseDeadline({
        slotBookedBy: submission.slot_booked_by,
        slotReservedAt: submission.slot_reserved_at,
      });
      const cutoffMs = submission.start_date
        ? paymentCutoffInstant(toWibYmd(normalizeScheduleDate(submission.start_date))).getTime()
        : null;
      // Batas bayar hari tayang selagi masih di depan; kalau sudah lewat,
      // 7 hari — sama dengan tagihan manual admin (utils/payment.ts).
      const fallback =
        cutoffMs !== null && cutoffMs > Date.now()
          ? cutoffMs
          : Date.now() + 7 * 24 * 60 * 60 * 1000;
      const expirationDate = new Date(releaseAt ?? fallback);

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

  return (
    <div className="min-h-screen bg-gray-50/50 pb-12">
      {/* Header back — bar kedua yang menempel di bawah AppNav */}
      <div className="sticky top-14 md:top-16 z-30 bg-gray-50/90 backdrop-blur-md border-b border-gray-200/70">
        <div className="max-w-xl mx-auto px-4 h-12 flex items-center">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors -ml-1 px-1 py-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('backToOrders')}
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-6 pt-8">
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

            <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">{t('rebookPickTitle')}</h3>
                {availability.isLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
              </div>

              <SchedulePicker
                availability={availability}
                duration={submission.duration || 1}
                mode={submission.distribution_type === 'kilat' ? 'kilat' : 'regular'}
                value={repickDate}
                onChange={setRepickDate}
              />
            </div>

            <button
              onClick={handleRebook}
              disabled={!repickDate || isRebooking || availability.isLoading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-base shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRebooking ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('lockingSlotLoading')}
                </>
              ) : (
                <>
                  <Lock size={18} />
                  {t('rebookCta')}
                </>
              )}
            </button>

            <p className="text-xs text-gray-500 text-center leading-relaxed">{t('scheduleHoldHint')}</p>
          </div>
        ) : (
          /* ── Fase B: jadwal terkunci, tinggal dibayar ────────────────────── */
          <>
            <div className="mb-6">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('paymentPhaseTitle')}</h1>
              <p className="text-gray-500 text-sm mt-1 leading-relaxed">{t('paymentPhaseSubtitle')}</p>
            </div>

            {/* Kalender mengatup jadi satu blok — penegasan mundur supaya
                perpindahan dari layar sebelumnya terasa menyambung, bukan
                berganti halaman. */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 mb-3.5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <CalendarCheck size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-900">{t('scheduleLockedLabel')}</p>
                  {startYmd ? (
                    <p className="text-sm text-emerald-800 mt-0.5 leading-relaxed">
                      {t('scheduleLockedDetail', {
                        date: new Date(submission.start_date!).toLocaleDateString('id-ID', {
                          day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
                        }),
                        days: `${airingDays} ${t('days')}`,
                      })}
                    </p>
                  ) : (
                    <p className="text-sm text-emerald-800 mt-0.5">{submission.title}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Batas 14.00 WIB lewat — tanggalnya tidak terkejar, TAPI slotnya
                tidak dilepas. Pembayaran sengaja tetap dibuka: admin menagih
                order seperti ini secara manual, lalu menjadwalkan ulang. */}
            {isTooLateToday && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 mb-3.5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-amber-900">{t('paymentPastCutoffTitle')}</p>
                    <p className="text-sm text-amber-800 mt-0.5 leading-relaxed">
                      {t('paymentPastCutoffBody')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
              {/* Hitung mundur hanya ada kalau slotnya memang bisa lepas
                  sendiri — yaitu reservasi mandiri. Jadwal yang dibuat admin
                  tidak punya umur, dan menampilkan angka yang berjalan untuknya
                  adalah janji yang tidak ditepati siapa pun. */}
              {hasHoldDeadline ? (
                <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 opacity-80" />
                    <span className="font-medium text-sm">{t('timerLabelHold')}</span>
                  </div>
                  <div className="text-2xl font-mono font-bold tracking-wider bg-black/20 px-3 py-1 rounded-lg shadow-inner">
                    {formatTime(timeLeft)}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-700 text-white px-6 py-4 flex items-center gap-3">
                  <Lock className="w-5 h-5 opacity-80" />
                  <span className="font-medium text-sm">{t('slotHeldByAdminLabel')}</span>
                </div>
              )}

              <div className="p-6 md:p-8 space-y-4">
                <p className="text-xs text-gray-500 leading-relaxed text-center">
                  {hasHoldDeadline ? t('timerConsequenceNote') : t('slotHeldByAdminNote')}
                </p>

                <div className="space-y-3 bg-gray-50 p-5 rounded-xl border border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-900">{submission.title}</h4>
                  <div className="flex justify-between items-end pt-3 border-t border-gray-200 border-dashed">
                    <div>
                      <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider block">
                        {t('checkoutTotalLabel')}
                      </span>
                      {submission.ppn_amount != null && (
                        <span className="text-[10px] text-gray-400">{t('totalIncludesTax')}</span>
                      )}
                    </div>
                    <span className="text-xl font-bold text-blue-600">
                      Rp {new Intl.NumberFormat('id-ID').format(submission.total_cost || 0)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleProceedPayment}
                  disabled={isProcessingPayment}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {isProcessingPayment ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      {t('checkoutProcessing')}
                    </>
                  ) : (
                    <>
                      <CreditCard size={20} />
                      {t('checkoutPayNow')}
                      <ArrowRight size={20} className="ml-1 opacity-80" />
                    </>
                  )}
                </button>

                <p className="text-xs text-gray-500 leading-relaxed text-center">{t('checkoutPaymentInfo')}</p>

                <button
                  onClick={handleCheckPayment}
                  disabled={isCheckingPayment}
                  className="w-full py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isCheckingPayment ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                      {t('checkoutCheckingStatus')}
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} className="text-gray-400" />
                      {t('checkoutAlreadyPaid')}
                    </>
                  )}
                </button>
              </div>
            </div>

            {startYmd && (
              <div className="mt-3.5">
                <AiringSummary ymd={startYmd} duration={airingDays} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
