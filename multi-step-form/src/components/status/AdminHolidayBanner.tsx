import { CalendarOff } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useAdminHolidayToday } from '@/utils/operationalHolidays';

/**
 * Banner "tim admin libur" (Phase 5 §5.4b). Tampil HANYA pada tanggal libur
 * aktif di `operational_holidays` menurut kalender WIB — akhir pekan biasa
 * tidak memunculkannya. Gagal baca = tidak tampil (lihat loadAdminHolidayToday).
 */
export function AdminHolidayBanner({ className = '' }: { className?: string }) {
  const { t, language } = useLanguage();
  const holiday = useAdminHolidayToday();
  if (!holiday) return null;

  const date = new Date(`${holiday.resumesOn}T00:00:00.000Z`).toLocaleDateString(
    language === 'en' ? 'en-GB' : 'id-ID',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' },
  );
  const title = holiday.label
    ? t('adminHolidayTitle').replace('{label}', holiday.label)
    : t('adminHolidayTitleNoLabel');

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 ${className}`}
    >
      <CalendarOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="text-sm">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-amber-800 dark:text-amber-200">{t('adminHolidayBody').replace('{date}', date)}</p>
      </div>
    </div>
  );
}
