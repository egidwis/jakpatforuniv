import { useState } from 'react';
import type { SurveyFormData } from '../types';
import { toast } from 'sonner';
import { Loader2, AlertCircle, Lock } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { SectionLabel } from './SurveyFieldRow';
import { SchedulePicker } from './SchedulePicker';
import { useSlotAvailability } from '../hooks/useSlotAvailability';
import { isBookingClosedForDate } from '../utils/airing-window';

interface StepScheduleProps {
  formData: SurveyFormData;
  updateFormData: (data: Partial<SurveyFormData>) => void;
  /**
   * Apa yang terjadi setelah tanggal dikunci. Mode reguler menulis order lalu
   * pindah ke halaman pembayaran; mode kilat kembali ke Ringkasan. Mengembalikan
   * false berarti gagal — tombol dipulihkan supaya user bisa mencoba lagi.
   */
  onConfirm: (ymd: string) => Promise<boolean> | boolean;
  mode?: 'regular' | 'kilat';
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
export function StepSchedule({ formData, updateFormData, onConfirm, mode = 'regular' }: StepScheduleProps) {
  const { t } = useLanguage();
  const availability = useSlotAvailability(mode);

  const [selected, setSelected] = useState<string | null>(
    formData.startDate ? String(formData.startDate).slice(0, 10) : null
  );
  const [isConfirming, setIsConfirming] = useState(false);

  const duration = mode === 'kilat' ? 1 : Math.max(formData.duration || 1, 1);

  const handleSelect = (ymd: string) => {
    setSelected(ymd);
    // Ikut ditulis ke draft supaya reload tab tidak menghapus pilihan.
    updateFormData({ startDate: ymd, startTime: '15:00' });
  };

  const handleConfirm = async () => {
    if (!selected) {
      toast.error(t('slotErrorNoDate'));
      return;
    }
    if (isBookingClosedForDate(selected)) {
      toast.error(t('slotErrorPastCutoff'));
      setSelected(null);
      updateFormData({ startDate: '', startTime: '' });
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
      <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 shadow-sm overflow-hidden space-y-4">
        <div className="flex items-center justify-between">
          <SectionLabel>{mode === 'kilat' ? t('kilatScheduleTitle') : t('scheduleStepLabel')}</SectionLabel>
          {availability.isLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
        </div>

        <div>
          <h2 className="text-lg md:text-xl font-bold text-gray-900">{t('scheduleTitle')}</h2>
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">
            {t('scheduleSubtitle', { days: `${duration} ${t('days')}` })}
          </p>
        </div>

        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-800 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
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

      <div className="space-y-2 pb-4">
        <button
          onClick={handleConfirm}
          disabled={!selected || availability.isLoading || isConfirming}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:bg-blue-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {isConfirming ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {t('lockingSlotLoading')}
            </>
          ) : (
            <>
              <Lock size={18} />
              {mode === 'kilat' ? t('scheduleConfirmKilatCta') : t('scheduleLockCta')}
              <span aria-hidden="true">→</span>
            </>
          )}
        </button>

        {/* Countdown dideklarasikan SEBELUM terjadi — layar berikutnya membuka
            timer, dan itu tidak boleh terasa seperti kejutan. */}
        <p className="text-xs text-gray-500 text-center leading-relaxed px-4">
          {mode === 'kilat' ? t('scheduleKilatHint') : t('scheduleHoldHint')}
        </p>
      </div>
    </div>
  );
}
