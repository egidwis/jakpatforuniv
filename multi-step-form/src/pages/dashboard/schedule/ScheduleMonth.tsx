import { useMemo } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import type { AdScheduleEntry } from '@/utils/supabase';
import { chipKindOf, formatWibTime, isUnscheduled, type ChipKind } from './scheduleModel';

// ─────────────────────────────────────────────────────────────
// Tampilan Bulan. Satu-satunya alasan ia ada: pertanyaan KAPASITAS —
// "seberapa penuh minggu depan" — tidak bisa dijawab daftar per hari.
// Ia sengaja jauh lebih sederhana dari kalender di Page Calendar: tanpa
// multi-select, tanpa aksi, tanpa palet lokal. Klik = buka order.
// ─────────────────────────────────────────────────────────────

const localizer = momentLocalizer(moment);

/**
 * Warna diturunkan dari chip yang SAMA dengan tampilan Agenda, bukan dari palet
 * kedua. Page Calendar punya STATUS_PALETTES sendiri (delapan warna yang tidak
 * pernah sepakat dengan Submissions); mengulangi itu di sini berarti membuat
 * sistem warna ketiga yang harus dijaga sinkron selamanya.
 */
const CHIP_COLOR: Record<ChipKind, { bg: string; border: string; text: string }> = {
  in_review:         { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' },
  approved:          { bg: '#eef2ff', border: '#a5b4fc', text: '#4338ca' },
  rejected:          { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c' },
  spam:              { bg: '#fff7ed', border: '#fdba74', text: '#c2410c' },
  reserved:          { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' },
  reserved_expiring: { bg: '#fffbeb', border: '#fcd34d', text: '#b45309' },
  reserved_expired:  { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c' },
  awaiting_payment:  { bg: '#fffbeb', border: '#fcd34d', text: '#b45309' },
  paid:              { bg: '#faf5ff', border: '#d8b4fe', text: '#7e22ce' },
  completed:         { bg: '#f8fafc', border: '#cbd5e1', text: '#334155' },
  page_scheduled:    { bg: '#eef2ff', border: '#a5b4fc', text: '#4338ca' },
  live:              { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
};

interface MonthEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  entry: AdScheduleEntry;
}

export function ScheduleMonth({
  entries, date, onNavigate, now, onOpen,
}: {
  entries: AdScheduleEntry[];
  date: Date;
  onNavigate: (d: Date) => void;
  now: number;
  onOpen: (e: AdScheduleEntry) => void;
}) {
  const events = useMemo<MonthEvent[]>(
    () =>
      entries
        // Entri tanpa jendela tayang tidak punya kotak untuk ditempati. Ia tetap
        // terlihat di blok "Belum Dijadwalkan" pada tampilan Agenda.
        .filter((e) => !isUnscheduled(e))
        .map((e) => ({
          id: e.id,
          title: e.ordinal > 1 ? `#${e.ordinal} ${e.title}` : e.title,
          start: new Date(e.startDate!),
          end: new Date(e.endDate || e.startDate!),
          entry: e,
        })),
    [entries]
  );

  return (
    <div className="h-[70vh] min-h-[480px]">
      <Calendar<MonthEvent>
        toolbar={false}
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: '100%' }}
        view={Views.MONTH}
        onView={() => {}}
        views={[Views.MONTH]}
        date={date}
        onNavigate={onNavigate}
        popup
        onSelectEvent={(ev) => onOpen(ev.entry)}
        eventPropGetter={(ev) => {
          const c = CHIP_COLOR[chipKindOf(ev.entry, now)];
          return {
            style: {
              backgroundColor: c.bg,
              border: `1px solid ${c.border}`,
              borderLeft: `3px solid ${c.text}`,
              color: c.text,
              fontSize: '11px',
              fontWeight: 600,
              padding: '1px 4px',
              borderRadius: '4px',
            },
          };
        }}
        components={{
          event: ({ event }: { event: MonthEvent }) => (
            <span className="truncate block" title={`${event.entry.title} — ${event.entry.researcherName}`}>
              {event.entry.distributionType === 'kilat' ? '⚡ ' : ''}
              {formatWibTime(event.entry.startDate!)} {event.title}
            </span>
          ),
        }}
      />
    </div>
  );
}
