import { useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_EXTRA_ADS_PER_DAY, MAX_REGULAR_ADS_PER_DAY } from '@/utils/constants';
import { toWibYmd } from '@/utils/airing-window';
import type { AdScheduleEntry } from '@/utils/supabase';
import { agendaChipOf, airingDaysOf, occupiesSlot, tokenForChip, type ChipKind } from './scheduleModel';

// ─────────────────────────────────────────────────────────────
// Papan kapasitas IKLAN REGULER — kembaran papan Kilat, untuk jalur yang satunya.
//
// Pertanyaan yang dijawabnya sama: "hari mana yang sudah penuh". Yang berbeda
// cuma sumbunya. Kilat membagi hari jadi empat gelombang (2 order tiap
// gelombang); iklan reguler tayang serentak 15.00 WIB, jadi harinya utuh — yang
// membelah justru KOLAM KUOTA: 4 iklan reguler dan 4 iklan tambahan per hari,
// dua jatah yang tidak saling meminjam.
//
// Perbedaan kedua, dan ini yang membuat papannya tidak bisa disalin mentah dari
// Kilat: satu order Kilat menempati SATU sel, sedangkan satu iklan reguler
// berdurasi 7 hari menempati TUJUH sel. Judul yang sama muncul berulang — itu
// benar, ia memang menahan kuota tujuh hari itu. Hari pertamanya diberi garis
// biru di kiri supaya "mulai di sini" tetap terbaca.
//
// Datanya dari cermin `ad_schedules` yang sudah dimuat papan induk — tanpa query
// tambahan, dan tanpa aturan kedua yang bisa berbeda dari halaman Agenda.
// ─────────────────────────────────────────────────────────────

/** Warna titik status. Diturunkan dari chip yang sama dengan Agenda, bukan palet kedua. */
const DOT_CLASS: Partial<Record<ChipKind, string>> = {
  live: 'bg-emerald-500',
  page_scheduled: 'bg-indigo-500',
  paid: 'bg-purple-500',
  awaiting_payment: 'bg-amber-500',
  reserved: 'bg-blue-500',
  approved: 'bg-indigo-400',
};
const dotOf = (kind: ChipKind) => DOT_CLASS[kind] ?? 'bg-slate-400';

/** Senin dari minggu kalender yang memuat `date`. */
function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

/** Senin–Minggu. Iklan reguler tidak mengenal hari kerja — ia tayang tiap hari. */
function weekFrom(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

interface Occupancy {
  entry: AdScheduleEntry;
  /** Hari ini adalah hari PERTAMA tayangnya. */
  isStart: boolean;
}

export function AdsWeekBoard({
  entries, now, onOpen,
}: {
  entries: AdScheduleEntry[];
  now: number;
  onOpen: (e: AdScheduleEntry) => void;
}) {
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const days = useMemo(() => weekFrom(weekStart), [weekStart]);
  const todayYmd = toWibYmd(new Date(now));

  /**
   * Peta `hari|kolam` → daftar iklan. Rentangnya AKHIR-EKSKLUSIF: tanggal akhir
   * adalah hari serah-terima, bukan hari tayang — aturan yang sama dipakai
   * `fetchSlotAvailability`. Salah di sini berarti tiap iklan terlihat menahan
   * satu hari lebih banyak daripada yang sebenarnya.
   */
  const byCell = useMemo(() => {
    const map = new Map<string, Occupancy[]>();
    for (const e of entries) {
      if (e.distributionType === 'kilat') continue;
      // ⚠️ Saringan `occupiesSlot` TETAP milik papan ini dan tidak ikut pindah ke
      // `airingDaysOf`. Papan kapasitas menjawab "siapa yang menahan kuota";
      // Agenda menjawab "apa yang tayang". Dua pertanyaan berbeda di atas
      // pemekaran hari yang sama.
      if (!occupiesSlot(e, now)) continue;

      const pool = e.isExtraAd ? 'extra' : 'regular';
      airingDaysOf(e).forEach((ymd, i) => {
        const key = `${ymd}|${pool}`;
        const item: Occupancy = { entry: e, isStart: i === 0 };
        const list = map.get(key);
        if (list) list.push(item);
        else map.set(key, [item]);
      });
    }
    return map;
  }, [entries, now]);

  const hasExtra = useMemo(
    () => entries.some((e) => e.isExtraAd && e.distributionType !== 'kilat'),
    [entries]
  );

  const headerLabel =
    `${days[0].toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' })} – ` +
    `${days[6].toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`;

  const shiftWeek = (deltaDays: number) =>
    setWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + deltaDays);
      return next;
    });

  const pools: Array<{ id: 'regular' | 'extra'; label: string; quota: number }> = [
    { id: 'regular', label: 'Reguler', quota: MAX_REGULAR_ADS_PER_DAY },
    ...(hasExtra ? [{ id: 'extra' as const, label: 'Tambahan', quota: MAX_EXTRA_ADS_PER_DAY }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-xs">
        <CalendarRange className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" />
        <span>
          <strong>Papan Kapasitas Iklan Reguler.</strong> Semua tayang 15.00 WIB, jatahnya{' '}
          {MAX_REGULAR_ADS_PER_DAY} iklan reguler dan {MAX_EXTRA_ADS_PER_DAY} iklan tambahan per hari
          — dua kolam terpisah. Iklan berdurasi banyak hari muncul di tiap hari yang ditahannya;
          garis biru menandai hari pertamanya. Klik untuk membuka order-nya di Submissions.
        </span>
      </div>

      <div className="flex items-center gap-2 bg-gray-50/80 p-1.5 rounded-lg border border-gray-200/50 w-fit">
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white hover:shadow-sm" onClick={() => shiftWeek(-7)}>
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </Button>
        <h2 className="text-sm font-semibold min-w-[200px] text-center text-gray-700 select-none">
          {headerLabel}
        </h2>
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white hover:shadow-sm" onClick={() => shiftWeek(7)}>
          <ChevronRight className="h-4 w-4 text-gray-600" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-3 ml-2 text-xs font-medium text-slate-600 hover:text-blue-700 hover:bg-white border border-transparent hover:border-slate-200 hover:shadow-sm"
          onClick={() => setWeekStart(mondayOf(new Date()))}
        >
          Hari ini
        </Button>
      </div>

      <div className="overflow-x-auto">
        {/* `[display:grid]` bukan `grid`: styles.css lama memaksa `gap: 1.5rem`
            pada tiap `.grid` dan mengalahkan `gap-2`. Lebar kolom `minmax(0,1fr)`
            juga wajib — `1fr` polos tidak boleh menyusut di bawah isinya, jadi
            satu judul panjang cukup untuk merusak seluruh kisi. */}
        <div className="min-w-[900px] space-y-2">
          <div className="[display:grid] grid-cols-[92px_repeat(7,minmax(0,1fr))] gap-2">
            <div />
            {days.map((day) => {
              const isToday = toWibYmd(day) === todayYmd;
              return (
                <div
                  key={toWibYmd(day)}
                  className={`text-center rounded-lg py-0.5 ${isToday ? 'bg-blue-50 border border-blue-200' : ''}`}
                >
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-blue-700' : 'text-slate-500'}`}>
                    {day.toLocaleDateString('id-ID', { weekday: 'short' })}
                  </div>
                  <div className={`text-[13px] font-extrabold ${isToday ? 'text-blue-800' : 'text-slate-800'}`}>
                    {day.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              );
            })}
          </div>

          {pools.map((pool) => (
            <div key={pool.id} className="[display:grid] grid-cols-[92px_repeat(7,minmax(0,1fr))] gap-2">
              <div className="flex flex-col items-center justify-center text-center rounded-lg border border-blue-200 bg-blue-50 px-1 py-2">
                <span className="text-[11px] font-bold text-blue-900">{pool.label}</span>
                <span className="text-[9px] font-medium text-blue-700/70">{pool.quota} / hari</span>
              </div>

              {days.map((day) => {
                const ymd = toWibYmd(day);
                const list = byCell.get(`${ymd}|${pool.id}`) || [];
                const used = list.length;
                const isFull = used >= pool.quota;
                const isOver = used > pool.quota;

                return (
                  <div
                    key={ymd}
                    className={`min-w-0 rounded-lg border p-1.5 min-h-[84px] flex flex-col gap-1 ${
                      isOver
                        ? 'bg-red-50/70 border-red-300'
                        : isFull
                          ? 'bg-amber-50/60 border-amber-300'
                          : 'bg-white border-slate-200'
                    }`}
                  >
                    <span
                      className={`self-start text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                        isOver || isFull ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {used}/{pool.quota}
                    </span>

                    <div className="flex flex-col gap-1 min-w-0">
                      {list.map(({ entry, isStart }) => {
                        // Titik status ikut sumbu waktu, sama dengan Agenda —
                        // dua papan bertanggal tidak boleh memberi warna berbeda
                        // untuk order yang sama. Kuota di atasnya tetap dihitung
                        // `occupiesSlot()`/`chipKindOf`, dan itu memang beda soal.
                        const kind = agendaChipOf(entry, now);
                        return (
                          <button
                            key={`${entry.id}-${ymd}`}
                            type="button"
                            onClick={() => onOpen(entry)}
                            title={`${entry.title} — ${entry.researcherName} · ${tokenForChip(kind).label}${entry.duration ? ` · ${entry.duration} hari` : ''}`}
                            className={`flex w-full min-w-0 items-center gap-1 px-1.5 py-1 rounded-md bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                              isStart ? 'border-l-2 border-l-blue-500' : ''
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotOf(kind)}`} />
                            <span className="min-w-0 flex-1 text-[10px] font-medium text-slate-700 truncate">
                              {entry.title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
