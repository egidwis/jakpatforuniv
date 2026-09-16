import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Info, Lock, Clock, Pin, CreditCard, RefreshCw } from 'lucide-react';
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
import { useSlotAvailability } from '../../hooks/useSlotAvailability';
import { scheduleLockGate } from '../../utils/scheduleLockGate';
import { schedulePageState } from '../../utils/schedulePageState';
import { expiryPlanFor } from '../../utils/scheduleExpiry';
import { segmentTitleOf } from '../../utils/segmentTitle';
import { deriveScheduleMoney } from '../../utils/scheduleMoney';
import { slotReleaseDeadline } from '../../utils/slotHold';
import { payLinkPath } from '../../utils/payLink';

/**
 * Halaman terpusat "Jadwal & Bayar" — berkunci JADWAL, bukan order.
 *
 * ⚠️ RUTENYA MEMBAWA `ad_schedules.id`, dan itu BUKAN kunci yang dipakai aksi
 * mana pun di bawah. Tiga kunci bertetangga yang semuanya UUID:
 *
 *   `ad_schedules.id` → rute & `payLinkUrl`
 *   `submission_id`   → `fetchAdSchedules`, `releaseExpiredSlot`
 *   `source_id`       → `cancelSchedule`, `invoices.extend_id`
 *
 * Yang salah TIDAK PERNAH error — ia cuma tidak menemukan baris. Karena itu
 * halaman ini memuat `AdScheduleEntry` UTUH lebih dulu (`fetchAdScheduleById`)
 * dan menolak merender apa pun sebelum entry-nya ada.
 *
 * ⚠️ KEADAANNYA PUNYA NAMA (`schedulePageState`), bukan disimpulkan dari
 * `isExpired` di tengah render seperti `PaymentCheckoutPage`. Tanpa itu layar
 * berkedip antar-bentuk saat countdown menyentuh nol.
 *
 * ⚠️ KEDALUWARSA MEMILIH PRIMITIF (`expiryPlanFor`), tidak memanggil
 * `releaseExpiredSlot` begitu saja: primitif itu berlingkup ORDER dan akan ikut
 * mematikan tagihan jadwal SAUDARA.
 */
export function JadwalDanBayarPage() {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [entry, setEntry] = useState<AdScheduleEntry | null>(null);
  const [siblings, setSiblings] = useState<AdScheduleEntry[]>([]);
  const [submission, setSubmission] = useState<FormSubmission | null>(null);
  const [billedAmount, setBilledAmount] = useState<number | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  // Kuota ikut jenis distribusi jadwal ini. ⚠️ TANPA `excludeSubmissionId` untuk
  // perpanjangan: jadwal pertama masih memakan kuota harinya, dan
  // mengecualikannya membuat hari penuh tampak lowong sampai
  // `assert_daily_ad_quota_free` (sql/86) menolaknya di server.
  const availability = useSlotAvailability(
    entry?.distributionType === 'kilat' ? 'kilat' : 'regular',
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
        fetchScheduleBilling(found.submissionId).catch(() => null),
        getFormSubmissionById(found.submissionId).catch(() => null),
      ]);
      setSiblings(sibs);
      setSubmission(sub);

      const own = billings?.get(found.id) ?? null;
      setBilledAmount(own?.openInvoice?.amount ?? null);
      setPayUrl(own?.openInvoice?.paymentUrl ?? null);
    } catch (e) {
      console.error('Gagal memuat jadwal:', e);
      toast.error(t('paymentLoadError'));
    } finally {
      setIsLoading(false);
    }
  }, [scheduleId, t]);

  useEffect(() => { void load(); }, [load]);

  const state = entry
    ? schedulePageState({
        startDate: entry.startDate,
        slotBookedBy: entry.slotBookedBy,
        paymentStatus: entry.paymentStatus,
        status: entry.status,
        slotReservedAt: entry.slotReservedAt,
      })
    : null;

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
   * Kunci tanggal untuk jadwal ini.
   *
   * ⚠️ HANYA ORDINAL 1. `rebookSlotForSubmission` menulis ke `form_submissions`,
   * jadi ia tidak punya arti untuk perpanjangan — barisnya hidup di
   * `form_submissions_extend`. Padanan berlingkup-jadwal BELUM ADA, dan
   * menulisnya berarti menyentuh jalur uang; sampai itu lahir, perpanjangan
   * yang perlu pilih-ulang tanggal diarahkan ke jalur yang memang bekerja.
   *
   * Gerbangnya tetap `scheduleLockGate` supaya keempat pemeriksaannya tidak
   * bercabang dari tiga pemanggil lain.
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

    if (entry.ordinal >= 2) {
      // Berkata jujur, bukan diam-diam gagal.
      toast.error(t('rebookExtensionUnsupported'));
      return;
    }

    setIsWorking(true);
    try {
      await rebookSlotForSubmission(entry.submissionId, verdict.ymd, verdict.duration);
      toast.success(t('rebookSuccess'));
      setPicked(null);
      await load();
    } catch (e) {
      console.error('Gagal mengunci tanggal:', e);
      toast.error(t('rebookError'));
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
      toast.success(t('rebookSuccess'));
      await load();
    } catch (e: any) {
      toast.error(e?.message || t('rebookError'));
    } finally {
      setIsWorking(false);
    }
  };

  if (isLoading) {
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

  const money = deriveScheduleMoney(entry, {
    question_count: submission?.question_count ?? null,
    distribution_type: entry.distributionType,
  });

  const phase = state.screen === 'pick'
    ? 'reservation' as const
    : state.screen === 'released'
      ? 'released' as const
      : 'payment' as const;
  const seg = segmentTitleOf({ phase, ordinal: entry.ordinal });

  const mmss = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="max-w-3xl mx-auto px-6 pt-8 pb-12 space-y-4">
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors -ml-1 px-1 py-1"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('backToOrders')}
      </button>

      {/* Konteks order — yang HILANG saat perpanjangan masih berupa modal. */}
      <div className="space-y-1">
        <p className="text-xs text-slate-500 font-medium truncate">
          {entry.title} · #{entry.bookingId}
        </p>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 leading-snug tracking-tight">
          {t(seg.key, seg.vars)}
        </h1>
      </div>

      {state.screen === 'released' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('rebookPickTitle')}
        </div>
      )}

      {(state.screen === 'pick' || state.screen === 'released') && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs md:text-sm text-slate-500">{t('scheduleSubtitle')}</p>
            {!availability.isLoading && availability.hasError && (
              <button
                type="button"
                onClick={() => void availability.reload()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('slotAvailabilityRetry')}
              </button>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-4 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{t('scheduleCutoffNote')}</span>
            </div>
            <SchedulePicker
              availability={availability}
              duration={entry.duration || 1}
              mode={entry.distributionType === 'kilat' ? 'kilat' : 'regular'}
              value={picked}
              onChange={setPicked}
            />
          </div>
          <button
            type="button"
            onClick={handleLock}
            disabled={!picked || availability.isLoading || isWorking}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Lock size={15} />
            {t('scheduleLockCta')}
          </button>
        </div>
      )}

      {state.screen === 'awaiting_payment' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm space-y-4">
          {/* ⚠️ Timer HANYA kalau state-nya mengizinkan. Jadwal admin tidak
              pernah lepas sendiri — 31 order produksi menunggu di sana, dan
              hitung mundur untuk mereka berbohong. */}
          {state.showCountdown && timeLeft !== null ? (
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-2 text-2xl font-bold text-jfu-primary tabular-nums">
                <Clock className="w-5 h-5" /> {mmss(timeLeft)}
              </div>
              <p className="text-xs text-slate-500">{t('scheduleHoldHint')}</p>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Pin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700">
                {t('bookingStatusAwaitingAdminSchedule')}
              </p>
            </div>
          )}

          <CostBreakdown
            total={billedAmount ?? money.total}
            lines={money.lines}
            note={money.note}
            isEstimate={billedAmount === null && money.isEstimate}
            variant="compact"
            // ⚠️ Perpanjangan: TERBUKA sejak awal. Tidak ada Ringkasan di
            // belakangnya, jadi layar ini satu-satunya tempat harga muncul.
            defaultOpen={entry.ordinal >= 2}
          />

          <div className="space-y-2">
            {payUrl && (
              <a
                href={payUrl}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-jfu-dark"
              >
                <CreditCard size={15} /> {t('payNow')}
              </a>
            )}
            {!payUrl && (
              <a
                href={payLinkPath(entry.id)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-jfu-dark"
              >
                <CreditCard size={15} /> {t('payNow')}
              </a>
            )}
            {/* Jadwal admin: TANPA tombol batalkan — itu keputusan tim. */}
            {state.canCancel && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={isWorking}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-6 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('cancelOrderTitle')}
              </button>
            )}
          </div>
        </div>
      )}

      {state.screen === 'settled' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          {t('checkoutPaidSuccess')}
        </div>
      )}
    </div>
  );
}
