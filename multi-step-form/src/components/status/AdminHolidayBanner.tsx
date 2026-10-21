import { CalendarOff, PauseCircle } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { awayMessageFor, useAdminAway, type AdminAway } from '@/utils/operationalHolidays';

/**
 * Pengumuman "tim admin libur" (mode libur, sql/120). Isinya: judul tetap,
 * pesan admin (versi Inggris bila ada), lalu kalimat tetap tentang apa yang
 * tetap jalan dan apa yang menunggu. Dipakai juga sebagai PRATINJAU di popup
 * admin — karena itu `away` diterima sebagai prop.
 */
export function AdminHolidayNotice({ away, className = '' }: { away: AdminAway; className?: string }) {
  const { t, language } = useLanguage();
  const message = awayMessageFor(away, language);
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 ${className}`}
    >
      <CalendarOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="text-sm min-w-0">
        <p className="font-semibold">{t('adminHolidayTitle')}</p>
        {message && <p className="mt-0.5 text-amber-950 break-words">{message}</p>}
        <p className="mt-0.5 text-amber-800">{t('adminHolidayBody')}</p>
      </div>
    </div>
  );
}

/**
 * Satu baris amber di bawah kalimat yang menjanjikan waktu admin ("maks 2 hari
 * kerja", "maks 1 hari kerja"). Tidak libur = tidak dirender sama sekali.
 */
export function AdminAwayInlineNote({ className = '', textKey = 'adminAwayInlineNote' }: {
  className?: string;
  textKey?: 'adminAwayInlineNote' | 'reviewModalAwayNote';
}) {
  const { t } = useLanguage();
  const away = useAdminAway();
  if (!away) return null;
  return (
    // <span>, bukan <p>: dipasang juga di dalam <span> langkah modal terima kasih.
    <span className={`flex items-start gap-1.5 text-xs font-medium leading-relaxed text-amber-800 ${className}`}>
      <PauseCircle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
      <span>{t(textKey)}</span>
    </span>
  );
}

/** Banner pasif di dashboard, halaman status, dan chat Mimin. Tidak libur = tidak tampil. */
export function AdminHolidayBanner({ className = '', away: given }: { className?: string; away?: AdminAway | null }) {
  const polled = useAdminAway();
  const away = given === undefined ? polled : given;
  if (!away) return null;
  return <AdminHolidayNotice away={away} className={className} />;
}
