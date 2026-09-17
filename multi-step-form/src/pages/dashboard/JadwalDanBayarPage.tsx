import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Info, Lock, Clock, Pin, CreditCard, RefreshCw, AlertTriangle, Calendar, CheckCircle } from 'lucide-react';
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
  const [billedVoucher, setBilledVoucher] = useState<string | null>(null);
  /*
    ⚠️ KEBERADAANNYA, BUKAN ALAMATNYA. Kita menyimpan "tagihan ini sudah
    terbit?" sebagai boolean dan sengaja MEMBUANG URL DOKU-nya, supaya tidak
    ada nilai di komponen ini yang bisa menyelinap jadi `href` — itu cacat yang
    hidup di sini sampai 2026-09-17. Alamat bayar cuma satu:
    `payLinkPath(entry.id)`.
  */
  const [hasOpenBill, setHasOpenBill] = useState(false);
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
      setBilledVoucher(own?.openInvoice?.voucherCode ?? null);
      setHasOpenBill(!!own?.openInvoice);
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

  /*
    ⚠️ VOUCHER DIWARISKAN SAAT MENAGIH, BUKAN SAAT MENJADWALKAN.

    `ad_schedules.voucher_code` untuk perpanjangan bernilai NULL — servernya
    yang jatuh ke voucher ORDER lewat presedensi `billingVoucher ||
    scheduleVoucher || base.voucher_code` (`create-payment.js`). Jadi
    `deriveScheduleMoney` menghitung ulang TANPA voucher dan memulangkan baris
    yang tidak mungkin menjumlah ke tagihannya.

    Terukur pada #2KT24KKK: barisnya berbunyi Rp 300.000 + Rp 33.000, sementara
    tagihan sungguhannya Rp 1.110 — peneliti melihat total yang membantah
    rinciannya sendiri, tepat di layar tempat ia diminta membayar.

    `invoices.voucher_code` menyimpan voucher yang BENAR-BENAR dipakai menagih,
    jadi ia yang dioper. Sesudah ini baris-barisnya menjumlah persis ke
    `billedAmount` (Rp 300.000 − Rp 299.000 + Rp 110).
  */
  let money = deriveScheduleMoney(
    billedVoucher && !entry.voucherCode
      ? { ...entry, voucherCode: billedVoucher }
      : entry,
    {
      question_count: submission?.question_count ?? null,
      distribution_type: entry.distributionType,
      /*
        Cadangan terakhir dari presedensi server: tagihan > jadwal > ORDER.
        Dua tingkat pertama sudah ditangani di atas; yang ini dipegang
        `effectiveVoucher()` di dalam `deriveScheduleMoney`, sehingga layar
        ini tidak lagi jadi satu-satunya tempat aturannya ditegakkan.
      */
      voucher_code: submission?.voucher_code ?? null,
    },
  );

  // Jika jadwal lama statusnya cancelled/released dan user sedang memilih jadwal baru (rebooking ordinal 1),
  // deriveScheduleMoney menghasilkan 0 karena jadwal lama non-aktif.
  // Gunakan data submission aktif agar menampilkan nominal estimasi sebenarnya, bukan Rp 0.
  if (money.total === 0 && (state.screen === 'pick' || state.screen === 'released') && submission) {
    const subTotal = Number(submission.total_cost) || 0;
    if (subTotal > 0) {
      const activeEntry: AdScheduleEntry = {
        ...entry,
        status: 'waiting_payment',
        totalCost: subTotal,
        subtotal: submission.subtotal ?? subTotal,
        ppnAmount: submission.ppn_amount ?? 0,
        voucherCode: billedVoucher || entry.voucherCode || submission.voucher_code || null,
      };
      money = deriveScheduleMoney(activeEntry, {
        question_count: submission.question_count,
        distribution_type: submission.distribution_type,
        voucher_code: submission.voucher_code ?? null,
      });
    }
  }

  const phase = state.screen === 'pick'
    ? 'reservation' as const
    : state.screen === 'released'
      ? 'released' as const
      : 'payment' as const;
  const seg = segmentTitleOf({ phase, ordinal: entry.ordinal });

  const mmss = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (state.screen === 'pick' || state.screen === 'released') {
    return (
      <ScheduleReservationLayout
        onBack={() => navigate('/dashboard')}
        backLabel={t('backToOrders')}
        isBusy={isWorking}
        orderLabel={`${entry.title} · #${entry.bookingId}`}
        title={t(seg.key, seg.vars)}
        subtitle={t('scheduleSubtitle')}
        alertBanner={
          state.screen === 'released' ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{t('rebookPickTitle')}</p>
                <p className="text-xs text-amber-800 mt-0.5">{t('paymentExpiredHoldBody')}</p>
              </div>
            </div>
          ) : undefined
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
              duration={entry.duration || 1}
              mode={entry.distributionType === 'kilat' ? 'kilat' : 'regular'}
              value={picked}
              onChange={setPicked}
            />
          </div>
        }
        cost={
          <CostBreakdown
            total={money.total}
            lines={money.lines}
            note={money.note}
            isEstimate={money.isEstimate}
            variant="compact"
            defaultOpen={false}
          />
        }
        cta={
          <button
            type="button"
            onClick={handleLock}
            disabled={!picked || availability.isLoading || isWorking}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isWorking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('lockingSlotLoading')}
              </>
            ) : (
              <>
                <Lock size={15} />
                {t('scheduleLockCta')}
              </>
            )}
          </button>
        }
      />
    );
  }

  if (state.screen === 'awaiting_payment') {
    return (
      <ScheduleReservationLayout
        onBack={() => navigate('/dashboard')}
        backLabel={t('backToOrders')}
        orderLabel={`${entry.title} · #${entry.bookingId}`}
        title={t('paymentPhaseTitle')}
        subtitle={t('paymentPhaseSubtitle')}
        calendar={
          <div className="space-y-4">
            {state.showCountdown && timeLeft !== null ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 text-center space-y-1.5 shadow-2xs">
                <div className="inline-flex items-center gap-2 text-2xl md:text-3xl font-bold text-jfu-primary tabular-nums">
                  <Clock className="w-6 h-6 text-jfu-primary" /> {mmss(timeLeft)}
                </div>
                <p className="text-xs font-medium text-slate-600">
                  {t('scheduleHoldHint')}
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <Pin className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-700">
                  {t('bookingStatusAwaitingAdminSchedule')}
                </p>
              </div>
            )}

            {entry.startDate && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Jadwal Tayang Terkunci
                  </span>
                  <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-blue-50 border border-blue-100 text-jfu-primary">
                    {entry.duration || 1} {t('days')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                  <Calendar className="w-4 h-4 text-jfu-primary shrink-0" />
                  <span>
                    {entry.startDate.slice(0, 10)}
                    {entry.endDate ? ` – ${entry.endDate.slice(0, 10)}` : ''}
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
            total={billedAmount ?? money.total}
            lines={money.lines}
            note={money.note}
            isEstimate={billedAmount === null && money.isEstimate}
            variant="compact"
            defaultOpen={false}
          />
        }
        bottomNotice={
          <p className="text-xs text-slate-500 text-center leading-relaxed">
            {state.showCountdown ? t('timerConsequenceNote') : t('slotHeldByAdminNote')}
          </p>
        }
        cta={
          <div className="space-y-2.5 pt-1">
            {/*
              ⚠️ `payUrl` HANYA PENANDA KEBERADAAN, JANGAN PERNAH JADI `href`.

              Sebelumnya baris ini berbunyi `href={payUrl || payLinkPath(...)}`,
              dan URL DOKU mentah yang MENANG. Itu melewati resolver
              `/bayar/<id>` — satu-satunya tempat yang menjawab "tagihan mana
              yang berwenang" SAAT DIKLIK, bukan saat link dicetak
              (`functions/bayar/[id].js` → RPC `authoritative_payment_url`,
              sql/85). Aturan itu lahir dari insiden order `af004b84`, ketika
              peneliti membayar lewat link tagihan jadwal yang sudah lama.

              Halaman ini justru yang paling rawan: countdown-nya berjalan, jadi
              jarak antara link dirender dan link diklik bisa satu jam penuh.
            */}
            {hasOpenBill ? (
              <a
                href={payLinkPath(entry.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2"
              >
                <CreditCard size={16} /> {t('payNow')}
              </a>
            ) : (
              /*
                Jadwalnya menunggu pembayaran, tapi tagihannya BELUM terbit —
                jalur `needs_admin_invoice`. Sebelumnya tombolnya tetap tampil
                dan mengirim peneliti ke resolver yang tidak punya tagihan untuk
                ditunjuk; yang dia lihat hanyalah galat. Lebih jujur mengatakan
                apa yang sedang ditunggu.
              */
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
                {t('billNotIssuedYet')}
              </p>
            )}
            {state.canCancel && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={isWorking}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {isWorking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('cancelOrderTitle')}
              </button>
            )}
          </div>
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
