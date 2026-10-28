import { useMemo, type ReactNode } from 'react';
import { CalendarOff, Zap } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import type { KilatWaveAvailability } from '../hooks/useKilatWaveAvailability';
import { formatWibTime } from '../utils/airing-window';
import {
  formatWaveHour,
  kilatPreviewDayYmd,
  kilatWaveDays,
  KILAT_WAVE_WORKDAYS,
  type KilatWaveCell,
  type KilatWaveDraft,
} from '../utils/kilatWaves';

/* Dipisah dari kondisinya supaya tiap pil membawa SATU pasangan warna yang
   kontrasnya jelas (teks abu hanya di atas latar abu). */
const DAY_PILL_OPEN = 'border-emerald-200 bg-emerald-50 text-emerald-800';
const DAY_PILL_CLOSED = 'border-slate-200 bg-slate-200/60 text-slate-700';

/**
 * Pemilih gelombang JFU Kilat untuk PENELITI (Phase 5 §5.5, R5).
 *
 * Pengecualian kedua alur Kilat terhadap Iklan: Step 3 berisi pilihan
 * gelombang, bukan kalender hari. Satu pilihan = satu gelombang; tidak ada
 * durasi yang ditampilkan.
 *
 * Grid-nya turunan `KilatScheduleStep` (picker admin), tetapi sumber datanya
 * RPC okupansi (`useKilatWaveAvailability`) — peneliti tidak punya hak baca
 * order orang lain, dan hitungan tanpa identitas memang cukup.
 *
 * ⚠️ Sebab ketidaktersediaan DIUCAPKAN (Penuh / Pemesanan tutup / Libur),
 * tanpa `opacity-*` — pola `SchedulePicker`: opacity pada tombol menggelapkan
 * teks menuju latarnya sampai di bawah ambang kontras.
 */
export function KilatWavePicker({
  availability,
  value,
  onChange,
  notice = null,
}: {
  availability: KilatWaveAvailability;
  /** `hour: null` = tanggal sudah dipilih, gelombangnya belum. */
  value: KilatWaveDraft | null;
  onChange: (pick: KilatWaveDraft) => void;
  /**
   * Kartu di atas grid saat tidak ada gelombang yang bisa dipesan
   * (`BookingFullNotice`, keputusan 27 Okt 2026). Dulu di sini ada kalimat
   * "coba cek lagi nanti" tanpa tombol apa pun — layar buntu.
   */
  notice?: ReactNode;
}) {
  const { t, language } = useLanguage();
  const locale = language === 'en' ? 'en-US' : 'id-ID';
  const days = useMemo(() => kilatWaveDays(availability.rows), [availability.rows]);
  const previewYmd = kilatPreviewDayYmd();
  const fmt = (ymd: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(`${ymd}T12:00:00+07:00`).toLocaleDateString(locale, { ...opts, timeZone: 'Asia/Jakarta' });

  if (!availability.isReady) {
    return (
      <div className="grid grid-cols-4 gap-2" aria-busy="true">
        {Array.from({ length: KILAT_WAVE_WORKDAYS + 1 }).map((_, i) => (
          <div key={i} className="h-[84px] rounded-2xl border border-slate-200 bg-white animate-pulse" />
        ))}
      </div>
    );
  }

  // Jaring pengaman mode libur (sql/122). Setiap pintu ke pemilih ini sudah
  // memunculkan modal F lebih dulu; grid "semua Libur" tidak pernah tampil.
  if (availability.adminAway) {
    return (
      <p className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
        <CalendarOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        {t('kilatAdminAwayNotice')}
      </p>
    );
  }

  const selectedDay = value ? days.find((d) => d.ymd === value.ymd) ?? null : null;

  const waveReason = (w: KilatWaveCell): string | null => {
    if (w.status === 'full') return t('kilatWaveFull');
    if (w.status === 'cutoff') return t('kilatWaveCutoff');
    if (w.status === 'holiday') return t('kilatWaveHoliday');
    return null;
  };

  return (
    <div className="space-y-5">
      {notice}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-800 mb-2">{t('kilatWavePickDay')}</legend>
        {/* Tiga hari kerja (sql/122 K3) + hari ke-4 terkunci — satu baris, juga di ponsel. */}
        <div className="grid grid-cols-4 gap-2">
          {days.map((day) => {
            const isSelected = value?.ymd === day.ymd;
            const disabled = !day.hasOpenWave;
            const openSeats = day.waves.filter((w) => w.status === 'open').reduce((n, w) => n + w.remaining, 0);
            // Hari yang tertutup karena KUOTA berbunyi "Penuh", bukan "Tutup" —
            // sejak 27 Okt grid tetap tampil di bawah kartu penuh.
            const dayFull = day.waves.some((w) => w.status === 'full')
              && day.waves.every((w) => w.status === 'full' || w.status === 'cutoff');
            const reason = day.isHoliday
              ? t('kilatWaveHoliday')
              : disabled ? t(dayFull ? 'kilatWaveFull' : 'kilatWaveDayClosed') : null;
            const label = fmt(day.ymd, { weekday: 'long', day: 'numeric', month: 'long' });
            return (
              <button
                key={day.ymd}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected || undefined}
                aria-label={[label, reason].filter(Boolean).join(' — ')}
                onClick={() => {
                  // Gelombang direset saat tanggal berganti; bila hanya satu
                  // gelombang yang masih terbuka, langsung terpilih.
                  const open = day.waves.filter((w) => w.status === 'open');
                  onChange({ ymd: day.ymd, hour: open.length === 1 ? open[0].hour : null });
                }}
                className={`flex min-h-[84px] flex-col items-center justify-between rounded-2xl border p-2.5 text-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50/80 ring-2 ring-amber-500/20 shadow-xs'
                    : disabled
                      ? 'cursor-not-allowed border-slate-200/70 bg-slate-50/90'
                      : 'cursor-pointer border-slate-200 bg-white shadow-xs hover:border-amber-400 hover:bg-amber-50/30'
                }`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isSelected ? 'text-amber-900' : 'text-slate-500'}`}>
                  {fmt(day.ymd, { weekday: 'short' })}
                </span>
                <span className={`text-sm sm:text-base font-bold leading-tight ${isSelected ? 'text-amber-900' : disabled ? 'text-slate-500' : 'text-slate-800'}`}>
                  {fmt(day.ymd, { day: 'numeric', month: 'short' })}
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${disabled ? DAY_PILL_CLOSED : DAY_PILL_OPEN}`}>
                  {reason ?? t('kilatWaveSeatsLeft', { n: String(openSeats) })}
                </span>
              </button>
            );
          })}
          {/* Bukan tombol: tidak ada yang bisa dipilih di sini, hanya batas jendelanya. */}
          <div
            role="note"
            aria-label={[fmt(previewYmd, { weekday: 'long', day: 'numeric', month: 'long' }), t('kilatWaveDayNotYet')].join(' — ')}
            className="flex min-h-[84px] cursor-not-allowed flex-col items-center justify-between rounded-2xl border border-dashed border-slate-300 bg-slate-50/90 p-2.5 text-center"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {fmt(previewYmd, { weekday: 'short' })}
            </span>
            <span className="text-sm sm:text-base font-bold leading-tight text-slate-500">
              {fmt(previewYmd, { day: 'numeric', month: 'short' })}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight ${DAY_PILL_CLOSED}`}>
              {t('kilatWaveDayNotYet')}
            </span>
          </div>
        </div>
      </fieldset>

      {/* Tanpa hari terbuka, "pilih hari dulu" di sini menyesatkan — kartu di atas yang bicara. */}
      {days.some((d) => d.hasOpenWave) && (
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-800 mb-2">{t('kilatWavePickWave')}</legend>
        {!selectedDay ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
            {t('kilatWavePickDayFirst')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {selectedDay.waves.map((w) => {
              const isSelected = value?.hour === w.hour;
              const disabled = w.status !== 'open';
              const reason = waveReason(w);
              const waveLabel = t('kilatWaveLabel', { hour: formatWaveHour(w.hour) });
              return (
                <button
                  key={w.hour}
                  type="button"
                  disabled={disabled}
                  aria-pressed={isSelected || undefined}
                  aria-label={[waveLabel, reason].filter(Boolean).join(' — ')}
                  onClick={() => onChange({ ymd: selectedDay.ymd, hour: w.hour })}
                  className={`flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50/80 ring-2 ring-amber-500/20 shadow-xs'
                      : disabled
                        ? 'cursor-not-allowed border-slate-200/70 bg-slate-50/90'
                        : 'cursor-pointer border-slate-200 bg-white shadow-xs hover:border-amber-400 hover:bg-amber-50/30'
                  }`}
                >
                  <span className={`inline-flex items-center gap-1.5 text-sm sm:text-base font-bold ${isSelected ? 'text-amber-900' : disabled ? 'text-slate-500' : 'text-slate-800'}`}>
                    <Zap className={`w-3.5 h-3.5 ${disabled ? 'text-slate-400' : 'text-amber-600'}`} aria-hidden="true" />
                    {waveLabel}
                  </span>
                  <span className="text-[11px] font-medium text-slate-600">
                    {reason ?? `${t('kilatWaveSeatsLeft', { n: String(w.remaining) })} · ${t('kilatWaveBookBy', { time: formatWibTime(w.bookingClosesAt) })}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
      )}
    </div>
  );
}
