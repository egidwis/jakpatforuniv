import { useState } from 'react';
import type { SurveyFormData } from '../types';
import { toast } from 'sonner';
import { Loader2, Info, Lock, RefreshCw } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { ScheduleReservationLayout } from './schedule/ScheduleReservationLayout';
import { CostBreakdown } from './CostBreakdown';
import { calculateTotalCost } from '../utils/cost-calculator';
import { orderMoneyLines } from '../utils/orderMoneyLines';
import { useIlkomunyBlocked } from '../hooks/useIlkomunyBlocked';
import { segmentTitleOf } from '../utils/segmentTitle';
import { SchedulePicker } from './SchedulePicker';
import { useSlotAvailability } from '../hooks/useSlotAvailability';
import { scheduleLockGate } from '../utils/scheduleLockGate';

interface StepScheduleProps {
  formData: SurveyFormData;
  /**
   * Apa yang terjadi setelah tanggal dikunci. Mode reguler menulis order lalu
   * pindah ke halaman pembayaran; mode kilat kembali ke Ringkasan. Mengembalikan
   * false berarti gagal — tombol dipulihkan supaya user bisa mencoba lagi.
   */
  onConfirm: (ymd: string) => Promise<boolean> | boolean;
  onBack: () => void;
  mode?: 'regular' | 'kilat';
  /**
   * Ke mana "mundur" pergi.
   *
   * `'step'` (bawaan): tombol Kembali ke langkah wizard sebelumnya — benar
   * untuk order baru, yang memang punya Ringkasan di belakangnya.
   *
   * `'orders'`: tautan teks "Kembali ke Order Saya". Dipakai saat layar ini
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
  const availability = useSlotAvailability(mode);

  const [selected, setSelected] = useState<string | null>(
    formData.startDate ? String(formData.startDate).slice(0, 10) : null
  );
  const [isConfirming, setIsConfirming] = useState(false);

  const duration = mode === 'kilat' ? 1 : Math.max(formData.duration || 1, 1);

  const handleSelect = (ymd: string) => {
    setSelected(ymd);
    // Tanggal hanya ditulis ke formData saat onConfirm — di sini cukup
    // local state agar Step 2 tidak melihat tanggal yang belum ter-lock.
  };

  const handleConfirm = async () => {
    // Keempat gerbangnya hidup di `scheduleLockGate` — satu tempat, tiga
    // pemanggil. Termasuk "KOSONG BUKAN LOWONG": `isRangeAvailable` fail-open
    // selama ketersediaan belum terbaca, jadi urutan `isReady` lebih dulu itu
    // mengikat. Alasan lengkapnya ada di modulnya.
    const verdict = scheduleLockGate({ selected, duration, availability });
    if (!verdict.ok) {
      toast.error(t(verdict.messageKey));
      if (verdict.clearSelection) setSelected(null);
      if (verdict.shouldReload) void availability.reload();
      return;
    }

    setIsConfirming(true);
    try {
      const ok = await onConfirm(verdict.ymd);
      if (!ok) setIsConfirming(false);
    } catch (e) {
      console.error('Failed to lock schedule:', e);
      setIsConfirming(false);
    }
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
  const cost = calculateTotalCost(effectiveForm);

  const seg = segmentTitleOf({ phase: 'reservation', ordinal: 1 });

  return (
    <ScheduleReservationLayout
      onBack={onBack}
      backLabel={exitMode === 'orders' ? t('backToOrders') : t('backButton')}
      isBusy={isConfirming}
      orderLabel={formData.title || undefined}
      title={mode === 'kilat' ? t('kilatScheduleTitle') : t(seg.key, seg.vars)}
      subtitle={mode === 'kilat' ? undefined : t('scheduleSubtitle')}
      calendar={
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
          />
        </div>
      }
      cost={
        <CostBreakdown
          total={cost.totalCost}
          lines={orderMoneyLines(cost, {
            questionCount: formData.questionCount,
            duration: formData.duration,
            isKilat: formData.isKilatUpgrade,
            voucherCode: ilkomunyBlocked ? undefined : formData.voucherCode,
          })}
          variant="compact"
          totalLabel={t('totalPayment')}
        />
      }
      cta={
        <button
          onClick={handleConfirm}
          disabled={!selected || availability.isLoading || isConfirming}
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
              {mode === 'kilat' ? t('scheduleConfirmKilatCta') : t('scheduleLockCta')}
            </>
          )}
        </button>
      }
    />
  );
}
