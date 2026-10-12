import { useMemo } from 'react';
import { CalendarCheck, Clock, Lock } from 'lucide-react';
import { isBookingClosedForDate, toAiringStartIso, toAiringLastDayIso } from '../utils/airing-window';
import { wibHorizonYmds, SCHEDULE_HORIZON_DAYS } from '../utils/scheduleHorizon';
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
  /**
   * KALENDER BEKU: tanggal (YYYY-MM-DD, hari WIB) yang sudah terkunci untuk
   * pesanan ini. Semua tile jadi tidak interaktif, rentang terkunci disorot
   * bergembok, dan hitungan kuota disembunyikan — saat membayar, "3/4" bukan
   * informasi, melainkan godaan untuk mengklik tanggal yang tidak bisa diganti.
   *
   * Pemanggil memastikan tanggalnya memang ada di jendela 14 hari
   * (`lockedDateFitsHorizon`); di luar itu ia memajang kartu jadwal terkunci.
   */
  lockedYmd?: string | null;
  /**
   * Jadwal TERAKHIR order ini (perpanjangan) — penanda visual saja. Tile-nya
   * tetap bisa dipilih bila kuotanya lowong; penanda ini cuma menjawab "jadwal
   * yang sudah ada jatuh di mana", supaya perpanjangan tidak dipilih buta.
   */
  ownRange?: { startYmd: string; days: number } | null;
}

const HORIZON_DAYS = SCHEDULE_HORIZON_DAYS;

/**
 * Tile memformat TANGGAL KALENDER, bukan instan: dibangun di tengah malam UTC
 * dan diformat dengan `timeZone: 'UTC'`, jadi "12 Okt" tetap 12 Okt di zona
 * perangkat mana pun. Tanggalnya sendiri sudah hari WIB (`wibHorizonYmds`).
 */
function calendarDateOf(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

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
  lockedYmd = null,
  ownRange = null,
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

  /*
    ⚠️ HARI WIB, BUKAN HARI PERANGKAT. Dulu tile dibangun dari `new Date()`
    lokal; peneliti di WITA/WIT/luar negeri dekat tengah malam melihat "Hari
    ini" bergeser sehari dari hari yang dinilai cutoff 13.00 dan kuota harian.
  */
  const ymds = useMemo(() => wibHorizonYmds(), []);
  const isFrozen = !!lockedYmd;
  const anchor = isFrozen ? lockedYmd : value;
  const selectedIndex = anchor ? ymds.indexOf(anchor) : -1;
  // Jadwal terakhir boleh MULAI sebelum hari ini; yang ditandai cuma hari-hari
  // yang masih jatuh di jendela 14 hari.
  const ownDays = new Set<string>();
  if (ownRange) {
    const [y, m, d] = ownRange.startYmd.split('-').map(Number);
    for (let k = 0; k < Math.max(ownRange.days, 1); k++) {
      ownDays.add(new Date(Date.UTC(y, m - 1, d + k)).toISOString().slice(0, 10));
    }
  }
  const showOwnLegend = !isFrozen && ymds.some((ymd) => ownDays.has(ymd));
  const fmt = (ymd: string, opts: Intl.DateTimeFormatOptions) =>
    calendarDateOf(ymd).toLocaleDateString(locale, { ...opts, timeZone: 'UTC' });

  /*
    ⚠️ SKELETON, BUKAN TILE BERISI NOL.
    Selama ketersediaan belum terbaca, `counts` kosong dan tiap tile merender
    "0/4" — angka yang terlihat seperti data padahal cuma nilai default. User
    memilih tanggal berdasarkan angka bohong itu, lalu ditolak saat mengunci.
    Kalender admin sudah memakai skeleton untuk keadaan yang sama
    (`SlotCalendarSkeleton`); wizard tertinggal. Bentuknya ditiru dari tile
    aslinya supaya tidak ada lompatan tata letak saat data mendarat.
  */
  // Kalender beku tidak memajang kuota, jadi ia tidak perlu menunggu kuota.
  if (!isFrozen && availability.isLoading && !availability.isReady) {
    return (
      <div className="space-y-4">
        <div
          className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 py-1"
          style={{ gap: '0.75rem' }}
        >
          {Array.from({ length: HORIZON_DAYS }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center justify-between rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-3 min-h-[96px] sm:min-h-[102px] animate-pulse"
            >
              <div className="h-2.5 w-8 rounded bg-slate-200" />
              <div className="h-4 w-12 rounded bg-slate-300 my-1" />
              <div className="h-4 w-12 rounded-full bg-slate-100 mt-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={`grid ${isFrozen ? 'grid-cols-4' : 'grid-cols-2 sm:grid-cols-4'} md:grid-cols-7 py-1`}
        /* ⚠️ JARAK LEWAT STYLE INLINE, BUKAN `gap-2.5`.
           `styles.css` warisan dimuat SESUDAH Tailwind dan mendefinisikan
           `.grid { gap: 1.5rem }` polos. Pada spesifisitas yang sama, urutan
           sumber menang — terverifikasi di bundle terkirim: aturan legacy ada
           di offset 252203, `gap-2.5` di 50410. Akibatnya grid ini merender
           jarak 24px, bukan 10px, dan tile menyusut ~7px di ponsel.
           Style inline satu-satunya yang menang tanpa menyentuh berkas warisan. */
        style={{ gap: '0.75rem' }}
      >
        {ymds.map((ymd, i) => {
          const baseCount = counts[ymd] || 0;
          const isFull = baseCount >= maxPerDay;
          const isClosed = isBookingClosedForDate(ymd);

          const isSelectedInRange =
            selectedIndex !== -1 && i >= selectedIndex && i < selectedIndex + effectiveDuration;
          // Pesanan terkunci SUDAH termasuk dalam hitungan; jangan tambah dirinya lagi.
          const displayCount = isSelectedInRange && !isFrozen ? baseCount + 1 : baseCount;

          let statusColors =
            'bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50/20 shadow-xs cursor-pointer';
          let textColor = 'text-slate-800';

          if (isFrozen) {
            statusColors = isSelectedInRange
              ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-600/20 shadow-xs cursor-default'
              : 'bg-slate-50/90 border-slate-200/70 cursor-default';
            textColor = isSelectedInRange ? 'text-blue-900' : 'text-slate-500';
          } else if (isSelectedInRange) {
            if (displayCount > maxPerDay) {
              statusColors = 'bg-red-50/80 border-red-500 ring-2 ring-red-500/20 shadow-xs';
              textColor = 'text-red-900';
            } else {
              statusColors =
                mode === 'kilat'
                  ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                  : 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-600/20 shadow-xs';
              textColor = mode === 'kilat' ? 'text-amber-900' : 'text-blue-900';
            }
          } else if (isClosed) {
            /* ⚠️ TANPA `opacity-*`. Opacity pada <button> meredupkan teks DAN
               latarnya bersamaan, jadi teksnya menggelap MENUJU latar: tile
               lewat-cutoff terukur 1,87:1 — jauh di bawah ambang teks besar
               sekalipun. Warna diredam eksplisit supaya tetap terbaca. */
            statusColors = 'bg-slate-50/90 border-slate-200/70 cursor-not-allowed';
            textColor = 'text-slate-500';
          } else if (isFull) {
            statusColors = 'bg-slate-50/90 border-slate-200/70 cursor-not-allowed';
            textColor = 'text-slate-500';
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
          const reason = isFrozen
            ? (isSelectedInRange ? t('lockedTileLabel') : null)
            : isClosed
              ? t('slotClosedReason')
              : isFull
                ? t('slotFullReason')
                : null;
          const isOwn = !isFrozen && ownDays.has(ymd);
          const isToday = i === 0;
          const isTomorrow = i === 1;
          const dayLabel = isToday
            ? `${t('calendarToday')}, ${fmt(ymd, { day: 'numeric', month: 'long' })}`
            : isTomorrow
              ? `${t('calendarTomorrow')}, ${fmt(ymd, { day: 'numeric', month: 'long' })}`
              : fmt(ymd, { weekday: 'long', day: 'numeric', month: 'long' });

          return (
            <button
              key={ymd}
              type="button"
              disabled={isFrozen || isFull || isClosed}
              onClick={() => { if (!isFrozen) onChange(ymd); }}
              /* Nama aksesibel merakit tanggal + sebab; tanpa ini pembaca layar
                 mengumumkan "Sen 12 Okt 4 garis miring 4, redup" tanpa sebab. */
              aria-label={[dayLabel, reason, isOwn ? t('slotLegendOwn') : null].filter(Boolean).join(' — ')}
              aria-pressed={isSelectedInRange || undefined}
              title={reason ?? undefined}
              /* Beku: tanpa pil kuota, jadi tile lebih pendek dan 4 kolom di
                 ponsel — 14 tile kosong 2 kolom mendorong ringkasan dua layar
                 ke bawah tanpa memberi informasi apa pun.
                 `lg:px-1.5`: di desktop kalender hidup di kolom kiri 7/12 —
                 tujuh tile ±60px. Padding samping sm:p-3 menyisakan 36px untuk
                 "12 Okt"; kelasnya bukan milik styles.css, jadi variannya menang. */
              className={`group relative flex flex-col items-center justify-between p-2.5 sm:p-3 lg:px-1.5 ${isFrozen ? 'min-h-[76px]' : 'min-h-[96px] sm:min-h-[102px]'} rounded-2xl border transition-all duration-150 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jfu-primary focus-visible:ring-offset-2 ${statusColors}`}
            >
              {/* Penanda jadwal terakhir — titik di pojok, tidak menimpa warna status. */}
              {isOwn && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-white" aria-hidden="true" />
              )}
              {/* 1. Header label: Hari ini / Besok / Nama Hari */}
              <span
                className={`text-[10px] font-bold uppercase tracking-wider truncate max-w-full ${
                  isSelectedInRange
                    ? textColor
                    : isToday && !isClosed
                      ? 'text-jfu-primary'
                      : 'text-slate-400'
                }`}
              >
                {isToday
                  ? t('calendarToday')
                  : isTomorrow
                    ? t('calendarTomorrow')
                    : fmt(ymd, { weekday: 'short' })}
              </span>

              {/* 2. Tanggal & Bulan: Tampil seragam untuk SEMUA 14 hari */}
              <span className={`text-sm sm:text-base font-bold leading-tight my-0.5 tracking-tight ${textColor}`}>
                {fmt(ymd, { day: 'numeric', month: 'short' })}
              </span>

              {/* 3. Status kuota / tutup — kalender beku: gembok, bukan kuota */}
              {isFrozen ? (
                isSelectedInRange ? (
                  <div className="flex items-center justify-center mt-auto bg-blue-100/70 px-2 py-0.5 rounded-full border border-blue-200 text-blue-900">
                    <Lock className="w-3 h-3" aria-hidden="true" />
                  </div>
                ) : (
                  <div className="mt-auto h-[18px]" aria-hidden="true" />
                )
              ) : isClosed ? (
                <div className="flex items-center gap-1 mt-auto bg-slate-200/60 px-2 py-0.5 rounded-full border border-slate-200">
                  <span className="text-[10px] font-medium text-slate-600">{t('slotClosedTodayLabel')}</span>
                </div>
              ) : isFull && !isSelectedInRange ? (
                /* Kata, bukan cuma angka merah: "4/4" menuntut pembacanya tahu
                   bahwa penyebutnya kuota. "Penuh" tidak menuntut apa pun. */
                <div className="flex items-center gap-1 mt-auto bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                  <span className="text-[10px] font-semibold text-red-700">{t('slotFullLabel')}</span>
                </div>
              ) : (
                <div
                  className={`flex items-center gap-1.5 mt-auto px-2 py-0.5 rounded-full border ${
                    isSelectedInRange
                      ? mode === 'kilat'
                        ? 'bg-amber-100/70 border-amber-200 text-amber-900'
                        : 'bg-blue-100/70 border-blue-200 text-blue-900'
                      : 'bg-slate-100/60 border-slate-200/60 text-slate-600'
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
                  <span
                    className={`text-[10px] font-medium tabular-nums ${
                      displayCount > maxPerDay || (isFull && !isSelectedInRange)
                        ? 'text-red-700 font-semibold'
                        : isSelectedInRange
                          ? 'font-semibold'
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
      {/* Kalender beku tanpa legenda: kalimat "ditahan untukmu" kini tinggal di
          kotak zona kunci tiket, tepat di tempat tombol Kunci tadi berdiri. */}
      {!isFrozen && (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
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
        {showOwnLegend && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500" aria-hidden="true" />
            {t('slotLegendOwn')}
          </span>
        )}
      </div>
      )}

      {showSummary && !isFrozen && value && <AiringSummary ymd={value} duration={effectiveDuration} />}
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
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t('scheduleEstimatedTitle')}
            </span>
            <div className="text-sm md:text-base font-semibold text-slate-900 leading-snug">
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
