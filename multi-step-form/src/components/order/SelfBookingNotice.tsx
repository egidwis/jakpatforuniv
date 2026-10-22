import { Link } from 'react-router-dom';
import { CalendarClock, Lock, MessageCircle } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import type { TranslationKey } from '@/i18n/translations';
import { useAdminAway, awayMessageFor } from '@/utils/operationalHolidays';
import type { SelfBookingClosure } from '@/utils/selfBookingClosure';

/**
 * Catatan "reservasi mandiri ditutup" (sql/125) — SATU komponen untuk semua
 * tempat yang biasanya menawarkan kalender atau "Pilih Tanggal":
 *
 *   checkout → Ringkasan, jalur otomatis saat ditutup: order tetap dikirim,
 *              tim yang menjadwalkan (menggantikan ReviewPathNotice).
 *   capped   → order bercap: tim menjadwalkan, PERMANEN (walau saklar dibuka).
 *   pick     → order tanpa cap yang belum bertanggal: SEMENTARA, sampai dibuka.
 *   extend   → perpanjangan mandiri: SEMENTARA.
 *
 * Janji "maks 1 hari kerja" bergeser ke "setelah tim kembali" bila mode libur
 * juga menyala — dua saklar admin tidak boleh saling membantah di satu layar.
 */
type Variant = 'checkout' | 'capped' | 'pick' | 'extend';

const COPY: Record<Variant, { title: TranslationKey; body: TranslationKey; bodyAway?: TranslationKey }> = {
  checkout: { title: 'selfBookingCheckoutTitle', body: 'selfBookingCheckoutBody', bodyAway: 'selfBookingCheckoutBodyAway' },
  capped: { title: 'bannerTitleAwaitingAdminSchedule', body: 'bannerSubAwaitingAdminSchedule', bodyAway: 'selfBookingCappedBodyAway' },
  pick: { title: 'selfBookingClosedTitle', body: 'selfBookingPickBody' },
  extend: { title: 'selfBookingExtendTitle', body: 'selfBookingExtendBody' },
};

export function SelfBookingNotice({ variant, closure, className = '' }: {
  variant: Variant;
  /** Saklar saat ini — sumber pesan admin. Order bercap boleh tanpa saklar. */
  closure: SelfBookingClosure | null;
  className?: string;
}) {
  const { t, language } = useLanguage();
  const away = useAdminAway();
  const copy = COPY[variant];
  const body = away && copy.bodyAway ? copy.bodyAway : copy.body;
  const message = closure ? awayMessageFor(closure, language).trim() : '';
  const temporary = variant === 'pick' || variant === 'extend';
  const Icon = variant === 'capped' ? CalendarClock : Lock;

  return (
    <div
      role="status"
      className={`rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-slate-900">{t(copy.title)}</p>
          <p className="text-xs text-slate-600 leading-relaxed">{t(body)}</p>
          {message && <p className="text-xs text-slate-700 italic break-words">“{message}”</p>}
          {temporary && (
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
