import type { ReactNode } from 'react';
import { CalendarCheck, Clock, Lock } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations';
import { toAiringStartIso, toAiringLastDayIso } from '../../utils/airing-window';
import { formatIDR } from '../../utils/currency';
import type { DeadlineRow } from '../../utils/reservationTicket';

/**
 * Potongan bersama tiket reservasi. Dulu countdown dan kartu "Jadwal Tayang
 * Terkunci" disalin di dua halaman bayar, dan salinannya sudah berselisih:
 * satu memformat tanggal WIB yang benar, satu memotong ISO mentah
 * (`startDate.slice(0, 10)`) dan menampilkan `end_date` yang akhir-eksklusif —
 * jendela 1 hari terbaca "12 Okt – 13 Okt".
 */

type T = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** "1 Hari" / "3 Hari", "1 Day" / "3 Days" — bukan "1 Days". */
export function dayCountLabel(days: number, t: T): string {
  return `${days} ${days === 1 ? t('daySingular') : t('days')}`;
}

/** Rentang tayang "12 Okt 2026" atau "30 Nov – 2 Des 2026", lokal ikut bahasa. */
export function useAiringRange(startYmd: string | null, days: number): string | null {
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

export interface TicketRow {
  label: string;
  value: ReactNode;
  /** Baris kecil di bawah nilai (misal "2 Hari · Mulai 15.00 WIB"). */
  sub?: ReactNode;
}

/**
 * Satu baris bergaya boarding pass: label kapital kecil, nilai tebal di
 * bawahnya. Bertumpuk, bukan kiri-kanan — sobekan cuma 2/5 lebar tiket, dan
 * rentang "Sen, 12 Okt – Sel, 13 Okt 2026" tidak muat di separuh baris.
 */
function TicketRowView({ label, value, sub }: TicketRow) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-900 leading-snug">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-slate-500 leading-relaxed">{sub}</dd>}
    </div>
  );
}

export const formatMmSs = (seconds: number) => {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Baris "Batas bayar". Bentuknya SAMA sebelum dan sesudah dikunci — yang
 * berganti cuma isinya ("1 jam setelah dikunci" → "59:48 tersisa"), supaya
 * mengunci tidak menukar blok di sobekan.
 */
export function DeadlineRowView({ row }: { row: DeadlineRow }) {
  const { t } = useLanguage();
  switch (row.kind) {
    case 'hold':
      return <TicketRowView label={t('ticketDeadlineLabel')} value={t('ticketDeadlineHold')} />;
    case 'countdown':
      return (
        <TicketRowView
          label={t('ticketDeadlineLabel')}
          value={
            <span className="inline-flex items-center gap-1.5 text-jfu-primary tabular-nums" role="timer" aria-live="off">
              <Clock className="w-4 h-4" aria-hidden="true" />
              {/* "--:--" selama timer belum berdetak — bukan catatan admin yang berkedip. */}
              {t('ticketTimeLeft', { time: row.seconds === null ? '--:--' : formatMmSs(row.seconds) })}
            </span>
          }
        />
      );
    case 'admin':
      return (
        <TicketRowView
          label={t('ticketDeadlineLabel')}
          value={
            <span className="inline-flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              {t('slotHeldByAdminLabel')}
            </span>
          }
          sub={t('slotHeldByAdminNote')}
        />
      );
    case 'credit':
      return (
        <TicketRowView
          label={t('ticketStatusLabel')}
          value={
            <span className="text-amber-800">
              {row.phase === 'stopped'
                ? t('bannerTitleCreditStopped')
                : row.phase === 'ended'
                  ? t('bannerTitleCreditEnded')
                  : t('bannerTitleAiringOnCredit')}
            </span>
          }
        />
      );
  }
}

/**
 * Kepala sobekan tiket: survei apa, tanggal berapa, sampai kapan harus bayar.
 *
 * ⚠️ BARISNYA TETAP DI TEMPAT SAAT DIKUNCI. Sebelum dikunci baris Tanggal
 * terisi langsung dari tile pilihan, chip "Belum dikunci" di kepala, dan
 * Batas bayar "1 jam setelah dikunci"; sesudahnya chip hilang dan Batas bayar
 * jadi countdown. Dulu kolom ini menukar ringkasan + catatan hold + tiga
 * tombol sekaligus, dan dua keadaan halaman yang sama terbaca dua halaman.
 */
export function TicketStub({
  title,
  bookingId,
  tag,
  locked,
  startYmd,
  days,
  showStartTime = true,
  extraRows = [],
  deadline,
}: {
  /** Judul survei. Draft wizard bisa belum berjudul — barisnya dilewati. */
  title?: string;
  bookingId?: string | null;
  /** Penanda jalur, misal "Perpanjangan". */
  tag?: string;
  locked: boolean;
  startYmd: string | null;
  days: number;
  /** Kilat tidak tayang 15.00 — jangan menjanjikannya. */
  showStartTime?: boolean;
  extraRows?: TicketRow[];
  deadline?: DeadlineRow | null;
}) {
  const { t } = useLanguage();
  const range = useAiringRange(startYmd, days);
  const daysLabel = dayCountLabel(days, t);

  return (
    <div className="min-w-0">
      <div className="min-w-0 pb-3.5 border-b border-dashed border-slate-200">
        {title && <p className="text-sm font-bold text-slate-900 truncate" title={title}>{title}</p>}
        {(bookingId || tag || !locked) && (
          <div className={`${title ? 'mt-1 ' : ''}flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500`}>
            {bookingId && <span className="font-mono tracking-tight">#{bookingId}</span>}
            {tag && <span>{bookingId ? `· ${tag}` : tag}</span>}
            {!locked && (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                {t('ticketNotLocked')}
              </span>
            )}
          </div>
        )}
      </div>
      <dl className="pt-3.5 space-y-3">
        <TicketRowView
          label={t('summaryDateLabel')}
          value={range ?? <span className="font-normal text-slate-400">{t('summaryDateNotPicked')}</span>}
          sub={showStartTime ? `${daysLabel} · ${t('airingStartsAt')}` : daysLabel}
        />
        {extraRows.map((row) => <TicketRowView key={row.label} {...row} />)}
        {deadline && <DeadlineRowView row={deadline} />}
      </dl>
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
