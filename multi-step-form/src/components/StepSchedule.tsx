import { useState } from 'react';
import type { SurveyFormData } from '../types';
import { Loader2, Info, Lock, RefreshCw } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { ScheduleReservationLayout } from './schedule/ScheduleReservationLayout';
import { TicketStub, MobileBarInfo } from './schedule/ReservationParts';
import { useLockFeedback } from './schedule/useLockFeedback';
import { lockGateFeedback } from '../utils/reservationTicket';
import { CostBreakdown } from './CostBreakdown';
import { calculateTotalCost } from '../utils/cost-calculator';
import { orderMoneyLines } from '../utils/orderMoneyLines';
import { useIlkomunyBlocked } from '../hooks/useIlkomunyBlocked';
import { segmentTitleOf } from '../utils/segmentTitle';
import { SchedulePicker } from './SchedulePicker';
import { KilatWavePicker } from './KilatWavePicker';
import { useSlotAvailability } from '../hooks/useSlotAvailability';
import { useKilatWaveAvailability } from '../hooks/useKilatWaveAvailability';
import { scheduleLockGate } from '../utils/scheduleLockGate';
import { kilatLockGate, type KilatWaveDraft } from '../utils/kilatWaves';

interface StepScheduleProps {
  formData: SurveyFormData;
  /**
   * Apa yang terjadi setelah jadwal dikunci: menulis order lalu pindah ke
   * halaman pembayaran — SAMA untuk kedua mode (Phase 5 §5.6). `kilatHour`
   * hanya terisi di mode kilat. Mengembalikan false berarti gagal — tombol
   * dipulihkan supaya user bisa mencoba lagi.
   */
  onConfirm: (ymd: string, kilatHour?: number) => Promise<boolean> | boolean;
  onBack: () => void;
  mode?: 'regular' | 'kilat';
  /**
   * Ke mana "mundur" pergi.
   *
   * `'step'` (bawaan): pil "Ubah Pesanan" di kepala kartu, kembali ke langkah
   * wizard sebelumnya — benar untuk order baru, yang memang punya Ringkasan di
   * belakangnya.
   *
   * `'orders'`: pil "My Order" di kepala kartu. Dipakai saat layar ini
   * dimasuki lewat JADWAL ULANG dari My Order: order-nya sudah ada, tidak ada
   * Ringkasan yang sah untuk dikembalikan — mundur ke step 2 menampilkan layar
   * submit untuk order yang sedang di-reset, dan CTA-nya bisa melahirkan order
   * kembar. Pemanggil WAJIB membuang draft reschedule di `onBack`-nya sendiri;
   * draft berniat-reschedule yang tertinggal adalah akar insiden survei
   * tertimpa (lihat resolveSubmissionMode).
   */
  exitMode?: 'step' | 'orders';
}

/**
 * Fase A dari langkah "Jadwal & Bayar": memilih tanggal.
 *
 * Fase B (countdown + tombol bayar) hidup di `/dashboard/payment/:id` dan baru
 * bisa dialamati setelah baris order lahir — batas route-nya jatuh tepat di
 * tombol "Kunci Jadwal & Lanjut Bayar" di bawah. Secara pengalaman keduanya
 * satu layar; secara alamat mereka terpisah karena Fase B punya dua pintu masuk
 * "kembali setelah pergi" yang tidak bisa dilayani state wizard.
 */
export function StepSchedule({ formData, onConfirm, onBack, mode = 'regular', exitMode = 'step' }: StepScheduleProps) {
  const { t } = useLanguage();
  const isKilat = mode === 'kilat';
  // Kedua hook selalu dipanggil (aturan hooks); hanya satu yang mengambil data.
  const availability = useSlotAvailability('regular', undefined, !isKilat);
  const waves = useKilatWaveAvailability(undefined, isKilat);
  const [wave, setWave] = useState<KilatWaveDraft | null>(() =>
    isKilat && formData.startDate
      ? { ymd: String(formData.startDate).slice(0, 10), hour: formData.kilatSlotHour ?? null }
      : null
  );

  const [selected, setSelected] = useState<string | null>(
    formData.startDate ? String(formData.startDate).slice(0, 10) : null
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const feedback = useLockFeedback();

  const duration = mode === 'kilat' ? 1 : Math.max(formData.duration || 1, 1);

  const handleSelect = (ymd: string) => {
    setSelected(ymd);
    feedback.clear();
    // Tanggal hanya ditulis ke formData saat onConfirm — di sini cukup
    // local state agar Step 2 tidak melihat tanggal yang belum ter-lock.
  };

  const confirmWith = async (ymd: string, kilatHour?: number) => {
    feedback.clear();
    setIsConfirming(true);
    try {
      const ok = await onConfirm(ymd, kilatHour);
      if (!ok) {
        setIsConfirming(false);
        // Penolakan paling umum di sini datang dari server (kuota harian
        // sql/111, kuota/batas gelombang sql/117): pilihan yang baru saja
        // ditolak masih tampak lowong sampai ketersediaannya dibaca ulang.
        void (isKilat ? waves.reload() : availability.reload());
      }
    } catch (e) {
      console.error('Failed to lock schedule:', e);
      setIsConfirming(false);
    }
  };

  const handleConfirm = async () => {
    if (isKilat) {
      const verdict = kilatLockGate(wave, waves);
      if (!verdict.ok) {
        feedback.report(
          { key: verdict.messageKey, tone: verdict.reason === 'no_date' || verdict.reason === 'no_wave' ? 'warning' : 'error' },
          { scroll: true },
        );
        if (verdict.clearSelection && wave) setWave({ ymd: wave.ymd, hour: null });
        if (verdict.shouldReload) void waves.reload();
        return;
      }
      await confirmWith(verdict.ymd, verdict.hour);
      return;
    }

    // Keempat gerbangnya hidup di `scheduleLockGate` — satu tempat, tiga
    // pemanggil. Termasuk "KOSONG BUKAN LOWONG": `isRangeAvailable` fail-open
    // selama ketersediaan belum terbaca, jadi urutan `isReady` lebih dulu itu
    // mengikat. Alasan lengkapnya ada di modulnya.
    const verdict = scheduleLockGate({ selected, duration, availability });
    if (!verdict.ok) {
      // Teguran di zona kunci + toast dari kunci yang sama. Gulir: di ponsel
      // tombolnya di bar bawah, zonanya bisa di luar layar.
      feedback.report(lockGateFeedback(verdict), { scroll: true });
      if (verdict.clearSelection) setSelected(null);
      if (verdict.shouldReload) void availability.reload();
      return;
    }

    await confirmWith(verdict.ymd);
  };

  /*
    ⚠️ HARGA DI LAYAR YANG MELAHIRKAN TAGIHAN.

    Menekan tombol di bawah menulis order, menerbitkan tagihan, dan menyalakan
    hold 1 jam — dan sampai sekarang layar ini tidak pernah memajang satu angka
    pun. Ironisnya kalimat yang menyebut bahaya itu sudah ditulis di halaman
    perpanjangan; perbaikannya diterapkan ke pengguna BERULANG dan ditahan dari
    pengguna PERTAMA KALI, yang justru paling butuh.

    ⚠️ Menghitung NOL: `calculateTotalCost` adalah sumber yang SAMA dengan
    Ringkasan, dan `orderMoneyLines` hanya memetakan bentuknya. Jadi angka di
    sini tidak bisa berbeda diam-diam dari angka yang baru saja disetujui
    peneliti satu langkah sebelumnya.

    ⚠️ `useIlkomunyBlocked` ikut, sebab yang sama dengan `StepCheckout`: voucher
    ILKOMUNY yang sudah dipakai akun ini tidak boleh memunculkan harga diskon
    yang tidak berhak.
  */
  const ilkomunyBlocked = useIlkomunyBlocked(formData.voucherCode);
  const effectiveForm = ilkomunyBlocked ? { ...formData, voucherCode: '' } : formData;
  const cost = calculateTotalCost(effectiveForm, Date.now());

  const seg = segmentTitleOf({ phase: 'reservation', ordinal: 1 });

  return (
    <ScheduleReservationLayout
      onBack={onBack}
      backLabel={exitMode === 'orders' ? t('backToOrdersShort') : t('editOrder')}
      backKind={exitMode === 'orders' ? 'exit' : 'edit'}
      isBusy={isConfirming}
      embedded
      title={t(seg.key, seg.vars)}
      cardTitle={isKilat ? t('kilatWavePickWave') : t('scheduleCardPickTitle')}
      feedback={feedback}
      stub={
        <TicketStub
          title={formData.title || undefined}
          locked={false}
          startYmd={isKilat ? wave?.ymd ?? null : selected}
          days={duration}
          // Kilat: tanggal + gelombang, tanpa lama tayang dan tanpa 15.00.
          kilatWaveHour={isKilat ? wave?.hour ?? null : undefined}
          deadline={{ kind: 'hold' }}
        />
      }
      /*
        Bayar redup sejak awal (keputusan 12 Okt): peneliti melihat ke mana
        tiket ini berujung. Menekannya menegur di zona kunci. Kilat sama persis
        (Phase 5 §5.6): kunci gelombang → bayar.
      */
      pay={{ kind: 'needs_lock' }}
      mobileBarInfo={<MobileBarInfo total={cost.totalCost} />}
      calendar={isKilat ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-start gap-2 text-sm text-slate-600">
              <Info className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
              <span>{t('kilatWaveCutoffNote')}</span>
            </div>
            {waves.isLoading && waves.isReady && (
              <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
            )}
            {!waves.isLoading && waves.hasError && (
              <button
                type="button"
                onClick={() => void waves.reload()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('slotAvailabilityRetry')}
              </button>
            )}
          </div>
          <KilatWavePicker
            availability={waves}
            value={wave}
            onChange={(next) => { setWave(next); feedback.clear(); }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Info className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{t('scheduleCutoffNote')}</span>
            </div>
            {/* Muat PERTAMA diceritakan skeleton kalendernya, bukan spinner ini. */}
            {availability.isLoading && availability.isReady && (
              <Loader2 className="w-4 h-4 animate-spin text-jfu-primary shrink-0" />
            )}
            {/* Gagal memuat harus KELIHATAN: nol slot mustahil dibedakan dari
                "semua tanggal kosong" kalau kegagalannya cuma masuk console. */}
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
          <SchedulePicker
            availability={availability}
            duration={duration}
            mode={mode}
            value={selected}
            onChange={handleSelect}
            showSummary={false}
          />
        </div>
      )}
      cost={
        <CostBreakdown
          total={cost.totalCost}
          lines={orderMoneyLines(cost, {
            questionCount: formData.questionCount,
            duration: formData.duration,
            isKilat: isKilat,
            voucherCode: ilkomunyBlocked ? undefined : formData.voucherCode,
          })}
          variant="compact"
          totalLabel={t('totalPayment')}
        />
      }
      lock={{
        kind: 'lock',
        cta: (
        <button
          type="button"
          onClick={handleConfirm}
          /* ⚠️ TIDAK mati karena tanggal kosong: klik tanpa tanggal harus
             menegur ("pilih tanggal dulu"), bukan diam. */
          disabled={(isKilat ? waves.isLoading : availability.isLoading) || isConfirming}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-jfu-primary"
        >
          {isConfirming ? (
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
        ),
      }}
    />
  );
}
