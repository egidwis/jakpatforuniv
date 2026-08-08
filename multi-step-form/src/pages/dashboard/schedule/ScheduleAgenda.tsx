import { ChevronRight, Zap } from 'lucide-react';
import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/utils';
import type { AdScheduleEntry } from '@/utils/supabase';
import {
  chipKindOf, tokenForChip, PAGE_LABEL, formatWibTime, formatWibShort,
  isUnscheduled, type DayGroup,
} from './scheduleModel';

// ─────────────────────────────────────────────────────────────
// Agenda — daftar per hari, dengan BENTUK TABEL YANG SAMA seperti daftar
// Submissions: kolom tetap, header sticky, baris rata tanpa bingkai sendiri.
//
// Sebelumnya tiap entri adalah kotak ber-border dengan jarak antar kotak, jadi
// dua permukaan yang menampilkan order yang sama terlihat seperti dua produk.
// Kolomnya kini sejajar: Submissions punya Submitted · ID · Survey · Status,
// papan ini punya Jam · ID · Survei · Periode · Status · Halaman — ID-nya
// identik (8 hex pertama order), jadi admin bisa mengadu dua layar tanpa
// menerjemahkan apa pun.
//
// Satu komponen melayani desktop DAN mobile lewat kelas responsif, bukan dua
// pohon terpisah — supaya kolom yang ditambahkan nanti tidak bisa muncul di
// satu sisi saja.
// ─────────────────────────────────────────────────────────────

/**
 * Jangkar DOM sebuah hari, dipakai tombol "Hari ini" untuk melompat. Dibuat
 * lewat fungsi supaya yang menulis id dan yang mencarinya tidak bisa berbeda.
 */
export const dayGroupDomId = (ymd: string) => `sched-day-${ymd}`;

/** Lebar kolom dipusatkan di sini supaya header dan baris tidak bisa bergeser sendiri-sendiri. */
const COL = {
  time: 'w-[58px] shrink-0',
  id: 'w-[84px] shrink-0 hidden lg:block',
  survey: 'flex-1 min-w-0',
  period: 'w-[132px] shrink-0 hidden md:block',
  status: 'w-[116px] shrink-0 flex justify-end',
  page: 'w-[52px] shrink-0 hidden sm:block text-right',
};

function ProgressBar({ entry, now }: { entry: AdScheduleEntry; now: number }) {
  if (!entry.startDate || !entry.endDate) return null;
  const start = new Date(entry.startDate).getTime();
  const end = new Date(entry.endDate).getTime();
  if (end <= start) return null;
  const pct = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
  return (
    <div className="mt-1 h-0.5 w-full rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
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
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(entry)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(entry);
        }
      }}
      className="group flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-gray-50"
    >
      {/* Jam — selalu dari cermin, tidak pernah dari jam perangkat. */}
      <div className={cn(COL.time, 'text-xs font-bold tabular-nums text-gray-900')}>
        {unscheduled ? <span className="text-gray-300">—</span> : formatWibTime(entry.startDate!)}
        {isKilat && <Zap className="inline w-3 h-3 ml-0.5 -mt-0.5 fill-amber-500 text-amber-500" />}
      </div>

      {/* ID order — bentuk yang sama persis dengan kolom ID di Submissions. */}
      <span className={cn(COL.id, 'font-mono text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5 truncate')}>
        #{entry.submissionId.slice(0, 8)}
      </span>

      {/* Survei + peneliti */}
      <div className={cn(COL.survey, 'flex flex-col leading-tight')}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-sm font-semibold text-gray-900" title={entry.title}>
            {entry.title}
          </span>
          {entry.ordinal > 1 && (
            <span
              className="shrink-0 text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded px-1"
              title="Jadwal iklan ke-berapa dari order ini"
            >
              #{entry.ordinal}
            </span>
          )}
        </div>
        <span className="text-[11px] text-gray-500 truncate mt-0.5">
          {entry.researcherName}
          {/* Periode ikut di subtitle hanya saat kolomnya tersembunyi (mobile). */}
          {!unscheduled && entry.startDate && entry.endDate && (
            <span className="md:hidden">
              {' · '}{formatWibShort(entry.startDate)} – {formatWibShort(entry.endDate)}
            </span>
          )}
        </span>
      </div>

      {/* Periode + bilah kemajuan untuk yang sedang tayang */}
      <div className={cn(COL.period, 'text-[11px] leading-tight')}>
        {unscheduled || !entry.startDate ? (
          <span className="text-gray-300">—</span>
        ) : (
          <>
            <span className="text-gray-700 font-medium">
              {formatWibShort(entry.startDate)}
              {entry.endDate ? ` – ${formatWibShort(entry.endDate)}` : ''}
            </span>
            <span className="block text-gray-400">{entry.duration ? `${entry.duration} hari` : ''}</span>
            {kind === 'live' && <ProgressBar entry={entry} now={now} />}
          </>
        )}
      </div>

      <div className={COL.status}>
        <Chip variant={token.variant} size="sm" dot={token.dot} pulse={token.pulse}>
          {token.label}
        </Chip>
      </div>

      <span
        className={cn(
          COL.page,
          'text-[10px] font-medium',
          entry.pageStatus === 'none' ? 'text-amber-600' : 'text-gray-400'
        )}
        title={entry.pageStatus === 'kilat' ? 'Kilat tidak pernah punya halaman iklan' : 'Status halaman iklan'}
      >
        {PAGE_LABEL[entry.pageStatus]}
      </span>

      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
    </div>
  );
}

/**
 * Pita pemisah hari. Sticky di bawah header kolom (top-10) supaya saat menggulung
 * panjang, admin tidak pernah kehilangan jawaban atas "ini hari apa".
 */
function GroupHeader({
  label, count, tone, badge,
}: {
  label: string;
  count: number;
  tone: 'day' | 'warn';
  badge?: string;
}) {
  return (
    <div
      className={cn(
        'sticky top-10 z-[9] flex items-center gap-2 px-4 h-8 border-b',
        tone === 'warn'
          ? 'bg-amber-50/95 border-amber-200 text-amber-800'
          : 'bg-gray-50/95 border-gray-200 text-gray-600'
      )}
    >
      <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
          tone === 'warn' ? 'bg-amber-200/70 text-amber-900' : 'bg-gray-200/80 text-gray-600'
        )}
      >
        {count}
      </span>
      {badge && (
        <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-bold">
          {badge}
        </span>
      )}
    </div>
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
    <>
      {/* Header kolom — sticky di puncak wilayah gulung, sama seperti Submissions. */}
      <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-4 h-10 flex items-center gap-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
        <span className={COL.time}>Jam</span>
        <span className={COL.id}>ID</span>
        <span className={COL.survey}>Survei</span>
        <span className={COL.period}>Periode</span>
        <span className={cn(COL.status, 'text-right')}>Status</span>
        <span className={COL.page}>Hlm</span>
        <span className="w-4 shrink-0" aria-hidden="true" />
      </div>

      {/* Blok "Belum Dijadwalkan" berada DI LUAR periode dan selalu di atas:
          order tanpa jendela tayang tidak punya tanggal untuk disaring, dan
          justru itulah pekerjaan yang paling mudah terlupakan. */}
      {/* Order tanpa jendela tayang. TIDAK tampil secara default — papan ini untuk
          melihat jadwal, dan yang belum punya jadwal bukan jadwal. Ia muncul hanya
          saat pil "belum dijadwalkan" dinyalakan, dan induknya yang memutuskan itu
          (di sini daftarnya cukup dikosongkan).

          Pembungkus <div> ini BUKAN hiasan: ia jadi containing block pita sticky
          di dalamnya, jadi pitanya berhenti menempel begitu bloknya habis. Tanpa
          pembungkus, ia akan menempel sepanjang gulungan dan menimpa pita hari di
          bawahnya. */}
      {unscheduledEntries.length > 0 && (
        <div>
          <GroupHeader label="⚠ Belum dijadwalkan" count={unscheduledEntries.length} tone="warn" />
          <div className="divide-y divide-gray-100">
            {unscheduledEntries.map((e) => (
              <EntryRow key={e.id} entry={e} now={now} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.ymd} id={dayGroupDomId(group.ymd)} className="scroll-mt-10">
          <GroupHeader
            label={group.label}
            count={group.entries.length}
            tone="day"
            badge={group.isToday ? 'hari ini' : undefined}
          />
          <div className="divide-y divide-gray-100">
            {group.entries.map((e) => (
              <EntryRow key={e.id} entry={e} now={now} onOpen={onOpen} />
            ))}
          </div>
        </div>
      ))}

      {isEmpty && (
        <p className="text-center text-sm text-gray-400 py-20">
          Tidak ada jadwal pada periode ini dengan filter yang dipilih.
        </p>
      )}
    </>
  );
}
