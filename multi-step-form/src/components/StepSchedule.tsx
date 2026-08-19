import { useState } from 'react';
import type { SurveyFormData } from '../types';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Info, Lock, RefreshCw } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { SchedulePicker } from './SchedulePicker';
import { useSlotAvailability } from '../hooks/useSlotAvailability';
import { isBookingClosedForDate } from '../utils/airing-window';

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
    if (!selected) {
      toast.error(t('slotErrorNoDate'));
      return;
    }
    if (isBookingClosedForDate(selected)) {
      toast.error(t('slotErrorPastCutoff'));
      setSelected(null);
      return;
    }
    /*
      ⚠️ KOSONG BUKAN LOWONG.
      `isRangeAvailable` membaca `counts[ymd] || 0`, jadi selama ketersediaan
      belum terbaca ia menjawab TRUE untuk SETIAP tanggal — termasuk yang
      sudah penuh. Tanpa gerbang ini, pengambilan data yang gagal atau
      menggantung berubah dari "kalender belum siap" menjadi "kalender bilang
      semuanya lowong", dan tanggal penuh pun ikut terkunci.
    */
    if (!availability.isReady) {
      toast.error(t('slotErrorAvailabilityUnknown'));
      void availability.reload();
      return;
    }
    if (!availability.isRangeAvailable(selected, duration)) {
      toast.error(t('slotErrorFull'));
      return;
    }

    setIsConfirming(true);
    try {
      const ok = await onConfirm(selected);
      if (!ok) setIsConfirming(false);
    } catch (e) {
      console.error('Failed to lock schedule:', e);
      setIsConfirming(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-3.5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Jalan keluar diletakkan DI ATAS kartu, sejajar dengan halaman bayar:
          ia menjawab "aku ada di mana dan bagaimana keluar", pertanyaan yang
          muncul SEBELUM isinya dibaca — bukan aksi yang bersaing dengan CTA
          di bawah. */}
      {exitMode === 'orders' && (
        <button
          type="button"
          onClick={onBack}
          disabled={isConfirming}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed -ml-1 px-1 py-1"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('backToOrders')}
        </button>
      )}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm overflow-hidden space-y-4">
        {/* Title + subtitle grouped so gap between them is tight */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            {/* Kilat bukan iklan, jadi judul reguler ("kapan iklanmu tayang")
                salah alamat di sini. Wording-nya dikembalikan lewat judul yang
                sudah ada, bukan dengan menambah label baru. */}
            <h2 className="text-lg md:text-xl font-bold text-gray-900 leading-snug">
              {mode === 'kilat' ? t('kilatScheduleTitle') : t('scheduleTitle')}
            </h2>
            {/* Muat PERTAMA diceritakan skeleton kalendernya, bukan spinner ini —
                dua indikator untuk satu keadaan cuma bising. Spinner tinggal
                untuk pemuatan ulang, saat kalendernya sudah berisi. */}
            {availability.isLoading && availability.isReady && (
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            )}
            {/* Gagal memuat harus KELIHATAN. Sebelumnya kegagalan hanya masuk
                console.error, jadi layar tampak normal padahal angka slotnya
                nol semua — mustahil dibedakan dari "semua tanggal kosong". */}
            {!availability.isLoading && availability.hasError && (
              <button
                type="button"
                onClick={() => void availability.reload()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('slotAvailabilityRetry')}
              </button>
            )}
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
            duration={duration}
            mode={mode}
            value={selected}
            onChange={handleSelect}
          />
        </div>
      </div>

      <div className="space-y-2 pb-4">
        <div className="flex items-center gap-3">
          {exitMode === 'step' && (
            <button
              type="button"
              onClick={onBack}
              disabled={isConfirming}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('backButton')}
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={!selected || availability.isLoading || isConfirming}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-jfu-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-jfu-dark disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-jfu-primary"
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
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>
        </div>

        {/* Countdown dideklarasikan SEBELUM terjadi — layar berikutnya membuka
            timer, dan itu tidak boleh terasa seperti kejutan. */}
        <p className="text-xs text-gray-500 text-center leading-relaxed px-4">
          {mode === 'kilat' ? t('scheduleKilatHint') : t('scheduleHoldHint')}
        </p>
      </div>
    </div>
  );
}
