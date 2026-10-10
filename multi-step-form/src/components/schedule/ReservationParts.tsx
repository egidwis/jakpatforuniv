import type { ReactNode } from 'react';
import { CalendarCheck, Clock, Lock } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations';
import { toAiringStartIso, toAiringLastDayIso } from '../../utils/airing-window';
import { formatIDR } from '../../utils/currency';

/**
 * Potongan bersama halaman Jadwal & Bayar. Dulu countdown dan kartu "Jadwal
 * Tayang Terkunci" disalin di dua halaman bayar, dan salinannya sudah
 * berselisih: satu memformat tanggal WIB yang benar, satu memotong ISO mentah
 * (`startDate.slice(0, 10)`) dan menampilkan `end_date` yang akhir-eksklusif —
 * jendela 1 hari terbaca "12 Okt – 13 Okt".
 */

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** "1 Hari" / "3 Hari", "1 Day" / "3 Days" — bukan "1 Days". */
export function dayCountLabel(days: number, t: T): string {
  return `${days} ${days === 1 ? t('daySingular') : t('days')}`;
}

/** Rentang tayang "12 Okt 2026" atau "30 Nov – 2 Des 2026", lokal ikut bahasa. */
function useAiringRange(startYmd: string | null, days: number): string | null {
  const { language } = useLanguage();
  if (!startYmd) return null;
  const locale = language === 'en' ? 'en-US' : 'id-ID';
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta',
    });
  // Akhir = hari tayang TERAKHIR (inklusif), dari helper yang sama dengan
  // yang menulis `end_date` — angka di layar tak bisa berbeda dari barisnya.
  const start = fmt(toAiringStartIso(startYmd));
  const last = fmt(toAiringLastDayIso(startYmd, Math.max(days, 1)));
  return start === last ? start : `${start} – ${last}`;
}

export interface SummaryRow {
  label: string;
  value: ReactNode;
}

/**
 * Kepala kolom kanan: apa yang sedang disetujui. Baris "Tanggal" terisi
 * langsung saat peneliti memilih tile, sebelum mengunci.
 */
export function ReservationSummary({
  startYmd,
  days,
  extraRows = [],
}: {
  startYmd: string | null;
  days: number;
  extraRows?: SummaryRow[];
}) {
  const { t } = useLanguage();
  const range = useAiringRange(startYmd, days);
  const rows: SummaryRow[] = [
    {
      label: t('summaryDateLabel'),
      value: range ? (
        <span className="text-slate-900">{range}</span>
      ) : (
        <span className="text-slate-400 font-normal">{t('summaryDateNotPicked')}</span>
      ),
    },
    { label: t('summaryDurationLabel'), value: dayCountLabel(days, t) },
    ...extraRows,
  ];

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {t('reservationSummaryTitle')}
      </h2>
      <dl className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 text-sm">
            <dt className="text-slate-500 shrink-0">{row.label}</dt>
            <dd className="font-semibold text-slate-800 text-right min-w-0">{row.value}</dd>
          </div>
        ))}
      </dl>
      {startYmd && (
        <p className="flex items-center justify-end gap-1.5 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          {t('airingStartsAt')}
        </p>
      )}
    </div>
  );
}

/**
 * Kartu cadangan untuk tanggal terkunci yang tak bisa digambar kalender 14
 * hari: di luar jendela, sudah lewat (kredit, sedang tayang). Bila tidak ada
 * tanggal sama sekali, pemanggil tidak merendernya.
 */
export function LockedScheduleCard({
  startYmd,
  days,
  outsideCalendar = false,
}: {
  startYmd: string;
  days: number;
  outsideCalendar?: boolean;
}) {
  const { t } = useLanguage();
  const range = useAiringRange(startYmd, days);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t('lockedScheduleTitle')}
        </span>
        <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-blue-50 border border-blue-100 text-jfu-primary">
          {dayCountLabel(days, t)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
        <CalendarCheck className="w-4 h-4 text-jfu-primary shrink-0" aria-hidden="true" />
        <span>{range}</span>
        <span className="text-slate-300" aria-hidden="true">•</span>
        <span className="text-xs font-normal text-slate-500">{t('airingStartsAt')}</span>
      </div>
      {outsideCalendar && (
        <p className="text-xs text-slate-500">{t('lockedOutsideCalendarNote')}</p>
      )}
    </div>
  );
}

export const formatMmSs = (seconds: number) => {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Countdown hold 1 jam + konsekuensinya, di kolom kanan tepat di atas tombol bayar. */
export function HoldCountdown({ seconds }: { seconds: number }) {
  const { t } = useLanguage();
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3.5 text-center space-y-1" role="timer" aria-live="off">
      <div className="inline-flex items-center gap-2 text-2xl font-bold text-jfu-primary tabular-nums">
        <Clock className="w-5 h-5 text-jfu-primary" aria-hidden="true" /> {formatMmSs(seconds)}
      </div>
      <p className="text-xs text-slate-600 leading-relaxed">{t('timerConsequenceNote')}</p>
    </div>
  );
}

/** Pengganti countdown untuk jadwal yang tidak pernah lepas sendiri (jadwal admin). */
export function AdminHoldNote() {
  const { t } = useLanguage();
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
      <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-slate-800">{t('slotHeldByAdminLabel')}</p>
        <p className="text-xs text-slate-500 leading-relaxed">{t('slotHeldByAdminNote')}</p>
      </div>
    </div>
  );
}

/** Sisi kiri bar bawah ponsel: total, dan countdown bila ada. */
export function MobileBarInfo({ total, seconds }: { total: number; seconds?: number | null }) {
  const { t } = useLanguage();
  return (
    <>
      <span className="min-w-0">
        <span className="block text-[11px] text-slate-500">{t('totalPayment')}</span>
        <span className="block font-bold text-slate-900 tabular-nums">{formatIDR(total)}</span>
      </span>
      {seconds != null && (
        <span className="inline-flex items-center gap-1.5 font-bold text-jfu-primary tabular-nums">
          <Clock className="w-4 h-4" aria-hidden="true" /> {formatMmSs(seconds)}
        </span>
      )}
    </>
  );
}
