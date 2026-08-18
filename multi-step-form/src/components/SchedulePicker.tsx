import { useMemo } from 'react';
import { CalendarCheck, Clock } from 'lucide-react';
import { isBookingClosedForDate, toAiringStartIso, toAiringLastDayIso, toLocalYmd } from '../utils/airing-window';
import type { SlotAvailability } from '../hooks/useSlotAvailability';
import { useLanguage } from '../i18n/LanguageContext';

interface SchedulePickerProps {
  availability: SlotAvailability;
  /** Panjang tayang yang dipesan — dipakai untuk menyorot rentang & cek kuota. */
  duration: number;
  mode?: 'regular' | 'kilat';
  /** YYYY-MM-DD, atau null bila belum ada yang dipilih. */
  value: string | null;
  onChange: (ymd: string) => void;
  /** Sembunyikan ringkasan "Tayang … → selesai …" bila pemanggil punya versinya sendiri. */
  showSummary?: boolean;
}

const HORIZON_DAYS = 14;

/**
 * Kalender pemilih tanggal tayang — murni presentasional.
 *
 * Diangkat keluar dari `StepSchedule` supaya halaman pembayaran bisa
 * menghidupkan kalender yang SAMA di tempat saat slot kedaluwarsa, alih-alih
 * melempar user balik ke wizard. Sumber ketersediaannya (`useSlotAvailability`)
 * sengaja dipegang pemanggil: halaman pembayaran perlu mengecualikan ordernya
 * sendiri dari hitungan, wizard tidak.
 */
export function SchedulePicker({
  availability,
  duration,
  mode = 'regular',
  value,
  onChange,
  showSummary = true,
}: SchedulePickerProps) {
  const { t } = useLanguage();
  const { counts, maxPerDay } = availability;

  const effectiveDuration = mode === 'kilat' ? 1 : Math.max(duration || 1, 1);

  const dates = useMemo(() => {
    const today = new Date();
    return Array.from({ length: HORIZON_DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d;
    });
  }, []);

  const selectedIndex = value ? dates.findIndex((d) => toLocalYmd(d) === value) : -1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5 sm:gap-3 py-1">
        {dates.map((date, i) => {
          const ymd = toLocalYmd(date);
          const baseCount = counts[ymd] || 0;
          const isFull = baseCount >= maxPerDay;
          const isClosed = isBookingClosedForDate(ymd);

          const isSelectedInRange =
            selectedIndex !== -1 && i >= selectedIndex && i < selectedIndex + effectiveDuration;
          const displayCount = isSelectedInRange ? baseCount + 1 : baseCount;

          let statusColors = 'bg-white border-slate-200 hover:border-blue-400 shadow-sm';
          let textColor = 'text-slate-800';

          if (isSelectedInRange) {
            if (displayCount > maxPerDay) {
              statusColors = 'bg-red-50 border-red-500 ring-1 ring-red-500 shadow-md';
              textColor = 'text-red-900';
            } else {
              statusColors =
                mode === 'kilat'
                  ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-500 shadow-md'
                  : 'bg-blue-50 border-blue-600 ring-1 ring-blue-600 shadow-md';
              textColor = mode === 'kilat' ? 'text-amber-900' : 'text-blue-900';
            }
          } else if (isClosed) {
            statusColors = 'bg-slate-100 border-slate-200 opacity-50 cursor-not-allowed';
            textColor = 'text-slate-500';
          } else if (isFull) {
            statusColors = 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed';
          }

          const dotColor =
            displayCount > maxPerDay || (isFull && !isSelectedInRange)
              ? 'bg-red-500'
              : displayCount > 0
                ? 'bg-amber-500'
                : 'bg-emerald-500';

          return (
            <button
              key={ymd}
              type="button"
              disabled={isFull || isClosed}
              onClick={() => onChange(ymd)}
              className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${statusColors}`}
            >
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                {date.toLocaleDateString('id-ID', { weekday: 'short' })}
              </span>
              <span className={`font-extrabold text-[15px] leading-tight mb-1 ${textColor}`}>
                {date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
              </span>
              {isClosed ? (
                <div className="flex items-center gap-1 mt-auto bg-slate-200/60 px-1.5 py-0.5 rounded-full border border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500">{t('slotClosedTodayLabel')}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 mt-auto bg-slate-100/50 px-1.5 py-0.5 rounded-full border border-slate-100">
                  <div className={`w-1 h-1 rounded-full ${dotColor}`} />
                  <span
                    className={`text-[10px] font-semibold ${
                      displayCount > maxPerDay || (isFull && !isSelectedInRange)
                        ? 'text-red-700'
                        : 'text-slate-600'
                    }`}
                  >
                    {displayCount}/{maxPerDay}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {showSummary && value && <AiringSummary ymd={value} duration={effectiveDuration} />}
    </div>
  );
}

/**
 * Satu kalimat "kapan tayang, sampai kapan" — pertanyaan yang sebenarnya
 * ditanyakan user di layar ini. Akhir jendela diambil dari helper yang sama
 * dengan yang menulis `end_date` ke database, jadi angka di layar dan di baris
 * order tidak bisa berbeda.
 */
export function AiringSummary({ ymd, duration }: { ymd: string; duration: number }) {
  const { t } = useLanguage();
  const fmt = (d: Date) =>
    d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });

  const start = new Date(toAiringStartIso(ymd));
  // Hari tayang terakhir, bukan batas eksklusif — lihat `toAiringLastDayIso`.
  const end = new Date(toAiringLastDayIso(ymd, Math.max(duration, 1)));
  const isSingleDay = fmt(start) === fmt(end);

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3.5 md:p-4 transition-all duration-200 animate-in fade-in slide-in-from-top-1 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Left: Icon + Micro-label + Bold Date Range */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100/80 text-jfu-primary flex items-center justify-center shrink-0 shadow-2xs">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {t('scheduleEstimatedTitle')}
            </span>
            <div className="text-sm md:text-base font-bold text-slate-900 leading-snug">
              {isSingleDay ? fmt(start) : `${fmt(start)} – ${fmt(end)}`}
            </div>
          </div>
        </div>

        {/* Right: Badges for Airing Time & Duration */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200/80 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            {t('airingStartsAt')}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 shadow-2xs">
            {t('airingDurationBadge', { days: `${duration} ${t('days')}` })}
          </span>
        </div>
      </div>
    </div>
  );
}
