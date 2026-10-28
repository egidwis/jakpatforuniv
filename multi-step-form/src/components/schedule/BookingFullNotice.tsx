import { Link } from 'react-router-dom';
import { CalendarX2, MessageCircle } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

/**
 * Kuota penuh → pemesanan dibantu tim (keputusan 27 Okt 2026).
 *
 * SATU kartu untuk tiga layar yang biasanya menawarkan pemilih jadwal:
 *
 *   team  → wizard, order BARU: order tetap dikirim tanpa tanggal lewat pintu
 *           "jadwal oleh tim" (cap sql/125); tombolnya hidup di zona kunci
 *           layar pemanggil, bukan di kartu ini.
 *   mimin → order yang SUDAH ADA (pilih ulang di Jadwal & Bayar, Jadwal Baru):
 *           peneliti tidak bisa memasang cap lewat UPDATE, jadi jalannya
 *           "Tanya Mimin" — pola `SelfBookingNotice` varian pick/extend.
 *
 * ⚠️ Pemanggil WAJIB hanya merender ini saat ketersediaan sudah terbaca tanpa
 * galat. Data kosong bukan penuh; kartu ini menjanjikan bantuan tim.
 */
export function BookingFullNotice({
  product,
  reason = 'full',
  durationDays = 1,
  action,
  className = '',
}: {
  product: 'regular' | 'kilat';
  /** Kilat saja: `closed` = buntu karena libur / lewat batas, bukan kuota. */
  reason?: 'full' | 'closed';
  durationDays?: number;
  action: 'team' | 'mimin';
  className?: string;
}) {
  const { t } = useLanguage();
  const isKilat = product === 'kilat';
  const title = isKilat
    ? t(reason === 'closed' ? 'bookingFullTitleKilatClosed' : 'bookingFullTitleKilat')
    : t('bookingFullTitleAds', { days: String(Math.max(durationDays, 1)) });
  const body = action === 'mimin'
    ? t('bookingFullBodyMimin')
    : t(isKilat ? 'bookingFullBodyTeamKilat' : 'bookingFullBodyTeamAds');

  return (
    <div role="status" className={`rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
          <CalendarX2 className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-600 leading-relaxed">{body}</p>
          {action === 'mimin' && (
            <Link
              to="/dashboard/chat"
              className="inline-flex items-center gap-1.5 pt-1 text-xs font-semibold text-jfu-primary hover:text-jfu-dark"
            >
              <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
              {t('selfBookingAskMimin')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
