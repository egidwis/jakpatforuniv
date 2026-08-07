import { ChevronRight, Zap } from 'lucide-react';
import { Chip } from '@/components/ui/chip';
import type { AdScheduleEntry } from '@/utils/supabase';
import {
  chipKindOf, tokenForChip, PAGE_LABEL, formatWibTime, formatWibShort,
  isUnscheduled, type DayGroup,
} from './scheduleModel';

// ─────────────────────────────────────────────────────────────
// Agenda: daftar per hari. Tampilan default papan, karena pertanyaan yang
// paling sering dibawa admin ke sini ("apa yang tayang minggu ini, mana yang
// macet") dijawab daftar, bukan kotak-kotak bulan.
//
// Satu komponen melayani desktop DAN mobile lewat kelas responsif, bukan dua
// pohon terpisah — supaya kolom yang ditambahkan nanti tidak bisa muncul di
// satu sisi saja.
// ─────────────────────────────────────────────────────────────

function ProgressBar({ entry, now }: { entry: AdScheduleEntry; now: number }) {
  if (!entry.startDate || !entry.endDate) return null;
  const start = new Date(entry.startDate).getTime();
  const end = new Date(entry.endDate).getTime();
  if (end <= start) return null;
  const pct = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
  return (
    <div className="h-1 w-full rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
      <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function EntryRow({
  entry, now, onOpen,
}: {
  entry: AdScheduleEntry;
  now: number;
  onOpen: (e: AdScheduleEntry) => void;
}) {
  const kind = chipKindOf(entry, now);
  const token = tokenForChip(kind);
  const isKilat = entry.distributionType === 'kilat';
  const unscheduled = isUnscheduled(entry);

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className="w-full text-left rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40 transition-colors px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
    >
      <div className="flex items-start gap-3">
        {/* Jam — selalu dari cermin, tidak pernah dari jam perangkat. */}
        <span className="shrink-0 w-14 pt-0.5 text-xs font-bold tabular-nums text-slate-700">
          {unscheduled ? '—' : formatWibTime(entry.startDate!)}
          {isKilat && <Zap className="inline w-3 h-3 ml-0.5 fill-amber-500 text-amber-500" />}
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-sm font-semibold text-slate-900">{entry.title}</span>
            {entry.ordinal > 1 && (
              <span
                className="shrink-0 text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded px-1"
                title="Jadwal perpanjangan — nomor urut jendela tayang order ini"
              >
                #{entry.ordinal}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {entry.researcherName}
            {entry.startDate && entry.endDate && !unscheduled && (
              <>
                {' · '}
                {formatWibShort(entry.startDate)} – {formatWibShort(entry.endDate)}
                {entry.duration ? ` · ${entry.duration} hari` : ''}
              </>
            )}
          </div>
          {kind === 'live' && <ProgressBar entry={entry} now={now} />}
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <Chip variant={token.variant} size="sm" dot={token.dot} pulse={token.pulse}>
            {token.label}
          </Chip>
          <span
            className={`hidden sm:inline text-[10px] font-medium w-12 text-right ${
              entry.pageStatus === 'none' ? 'text-amber-600' : 'text-slate-400'
            }`}
            title={entry.pageStatus === 'kilat' ? 'Kilat tidak pernah punya halaman iklan' : 'Status halaman iklan'}
          >
            {PAGE_LABEL[entry.pageStatus]}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-300" />
        </div>
      </div>
    </button>
  );
}

export function ScheduleAgenda({
  groups, unscheduledEntries, now, onOpen,
}: {
  groups: DayGroup[];
  unscheduledEntries: AdScheduleEntry[];
  now: number;
  onOpen: (e: AdScheduleEntry) => void;
}) {
  const isEmpty = groups.length === 0 && unscheduledEntries.length === 0;

  return (
    <div className="space-y-5">
      {/* Blok "Belum Dijadwalkan" berada DI LUAR periode dan selalu di atas:
          order tanpa jendela tayang tidak punya tanggal untuk disaring, dan
          justru itulah pekerjaan yang paling mudah terlupakan. */}
      {unscheduledEntries.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            ⚠ Belum Dijadwalkan
            <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
              {unscheduledEntries.length}
            </span>
          </h3>
          <div className="space-y-1.5">
            {unscheduledEntries.map((e) => (
              <EntryRow key={e.id} entry={e} now={now} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}

      {groups.map((group) => (
        <section key={group.ymd} className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span className="h-px flex-1 bg-slate-200" />
            {group.label}
            {group.isToday && (
              <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-bold">
                hari ini
              </span>
            )}
            <span className="h-px flex-1 bg-slate-200" />
          </h3>
          <div className="space-y-1.5">
            {group.entries.map((e) => (
              <EntryRow key={e.id} entry={e} now={now} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}

      {isEmpty && (
        <p className="text-center text-sm text-slate-400 py-16">
          Tidak ada jadwal pada periode ini dengan filter yang dipilih.
        </p>
      )}
    </div>
  );
}
