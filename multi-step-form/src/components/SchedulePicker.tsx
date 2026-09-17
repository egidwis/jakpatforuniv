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
  const { t, language } = useLanguage();
  const { counts, maxPerDay } = availability;
  /*
    ⚠️ LOKAL IKUT BAHASA. Sebelumnya ketiga pemformat tanggal di berkas ini
    dipatok `'id-ID'`, jadi pengguna berbahasa Inggris tetap membaca "Sen",
    "Kam", "Agu" di setiap tile — kalender adalah satu-satunya bagian layar
    yang tidak pernah ikut berganti bahasa.
  */
  const locale = language === 'en' ? 'en-US' : 'id-ID';

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

  /*
    ⚠️ SKELETON, BUKAN TILE BERISI NOL.
    Selama ketersediaan belum terbaca, `counts` kosong dan tiap tile merender
    "0/4" — angka yang terlihat seperti data padahal cuma nilai default. User
    memilih tanggal berdasarkan angka bohong itu, lalu ditolak saat mengunci.
    Kalender admin sudah memakai skeleton untuk keadaan yang sama
    (`SlotCalendarSkeleton`); wizard tertinggal. Bentuknya ditiru dari tile
    aslinya supaya tidak ada lompatan tata letak saat data mendarat.
  */
  if (availability.isLoading && !availability.isReady) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 py-1"
        /* ⚠️ JARAK LEWAT STYLE INLINE, BUKAN `gap-2.5`.
           `styles.css` warisan dimuat SESUDAH Tailwind dan mendefinisikan
           `.grid { gap: 1.5rem }` polos. Pada spesifisitas yang sama, urutan
           sumber menang — terverifikasi di bundle terkirim: aturan legacy ada
           di offset 252203, `gap-2.5` di 50410. Akibatnya grid ini merender
           jarak 24px, bukan 10px, dan tile menyusut ~7px di ponsel.
           Style inline satu-satunya yang menang tanpa menyentuh berkas warisan. */
        style={{ gap: '0.625rem' }}>
          {Array.from({ length: HORIZON_DAYS }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2.5 h-[86px] animate-pulse"
            >
              <div className="h-2.5 w-7 rounded bg-slate-200" />
              <div className="h-4 w-12 rounded bg-slate-300" />
              <div className="h-3.5 w-9 rounded-full bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 py-1"
        /* ⚠️ JARAK LEWAT STYLE INLINE, BUKAN `gap-2.5`.
           `styles.css` warisan dimuat SESUDAH Tailwind dan mendefinisikan
           `.grid { gap: 1.5rem }` polos. Pada spesifisitas yang sama, urutan
           sumber menang — terverifikasi di bundle terkirim: aturan legacy ada
           di offset 252203, `gap-2.5` di 50410. Akibatnya grid ini merender
           jarak 24px, bukan 10px, dan tile menyusut ~7px di ponsel.
           Style inline satu-satunya yang menang tanpa menyentuh berkas warisan. */
        style={{ gap: '0.625rem' }}>
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
            /* ⚠️ TANPA `opacity-*`. Opacity pada <button> meredupkan teks DAN
               latarnya bersamaan, jadi teksnya menggelap MENUJU latar: tile
               lewat-cutoff terukur 1,87:1 — jauh di bawah ambang teks besar
               sekalipun. Warna diredam eksplisit supaya tetap terbaca. */
            statusColors = 'bg-slate-100 border-slate-200 cursor-not-allowed';
            textColor = 'text-slate-600';
          } else if (isFull) {
            statusColors = 'bg-slate-50 border-slate-200 cursor-not-allowed';
          }

          /* Warna -600, bukan -500: pada pil `slate-100/50` varian 500 terukur
             2,05:1 (amber) dan 2,42:1 (emerald) — gagal ambang non-teks 3:1. */
          const dotColor =
            displayCount > maxPerDay || (isFull && !isSelectedInRange)
              ? 'bg-red-600'
              : displayCount > 0
                ? 'bg-amber-600'
                : 'bg-emerald-600';

          /*
            ⚠️ SEBAB KETIDAKTERSEDIAAN DIUCAPKAN, bukan cuma diredupkan.
            Tile penuh dulu hanya `opacity-60` tanpa label apa pun, sementara
            tile lewat-cutoff punya pil "Tutup" — jadi tanggal kelabu pertama
            tidak terjelaskan BY CONSTRUCTION. Peneliti melihat abu dan tidak
            tahu apakah penuh, terlambat, atau rusak.
          */
          const reason = isClosed
            ? t('slotClosedReason')
            : isFull
              ? t('slotFullReason')
              : null;
          const dayLabel = date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

          return (
            <button
              key={ymd}
              type="button"
              disabled={isFull || isClosed}
              onClick={() => onChange(ymd)}
              /* Nama aksesibel merakit tanggal + sebab; tanpa ini pembaca layar
                 mengumumkan "Sen 12 Okt 4 garis miring 4, redup" tanpa sebab. */
              aria-label={reason ? `${dayLabel} — ${reason}` : dayLabel}
              aria-pressed={isSelectedInRange || undefined}
              title={reason ?? undefined}
              className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 ${statusColors}`}
            >
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                {date.toLocaleDateString(locale, { weekday: 'short' })}
              </span>
              <span className={`font-extrabold text-[15px] leading-tight mb-1 ${textColor}`}>
                {date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
              </span>
              {isClosed ? (
                <div className="flex items-center gap-1 mt-auto bg-slate-200/60 px-1.5 py-0.5 rounded-full border border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-700">{t('slotClosedTodayLabel')}</span>
                </div>
              ) : isFull && !isSelectedInRange ? (
                /* Kata, bukan cuma angka merah: "4/4" menuntut pembacanya tahu
                   bahwa penyebutnya kuota. "Penuh" tidak menuntut apa pun. */
                <div className="flex items-center gap-1 mt-auto bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">
                  <span className="text-[10px] font-semibold text-red-800">{t('slotFullLabel')}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 mt-auto bg-slate-100/50 px-1.5 py-0.5 rounded-full border border-slate-100">
                  <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} aria-hidden="true" />
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

      {/*
        LEGENDA — "4/4" adalah kosakata operator. Tanpa baris ini peneliti tidak
        punya cara tahu apakah 4/4 berarti empat tersedia atau empat terpakai,
        dan maknanya bersandar pada titik 4x4px yang amber-vs-emerald-nya
        berjarak luminansi 1,18:1 — praktis identik bagi mata buta warna.
        Kata-katanya yang membawa makna; titiknya kini cuma penguat.
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
        <span>{t('slotLegendTitle')}</span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
          {t('slotLegendOpen')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600" aria-hidden="true" />
          {t('slotLegendFilling')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600" aria-hidden="true" />
          {t('slotLegendFull')}
        </span>
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
  const { t, language } = useLanguage();
  // Lokal ikut bahasa — lihat catatan di `SchedulePicker`.
  const locale = language === 'en' ? 'en-US' : 'id-ID';
  const fmt = (d: Date) =>
    d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });

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
