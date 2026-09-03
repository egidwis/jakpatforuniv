import { ChevronRight, Copy, Zap } from 'lucide-react';
import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/utils';
import type { AdScheduleEntry } from '@/utils/supabase';
import { copyToClipboard } from '@/components/submissions/types';
import {
  agendaChipOf, tokenForChip, formatWibTime, formatWibShort,
  isUnscheduled, needsBannerSwap, type DayEntry, type DayGroup,
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
  id: 'w-[108px] shrink-0 hidden lg:block',
  survey: 'flex-1 min-w-0',
  period: 'w-[132px] shrink-0 hidden md:block',
  page: 'w-[64px] shrink-0 hidden sm:block text-right',
  status: 'w-[116px] shrink-0 flex justify-end',
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

/**
 * Satu baris = satu jadwal PADA SATU HARI tayangnya.
 *
 * ⚠️ HARI LANJUTAN TIDAK DIRENDER LEBIH RENDAH DARIPADA HARI PERTAMA. Tinggi,
 * kolom, bobot huruf, dan chip statusnya identik — karena datanya memang
 * identik: tidak ada satu pun sumbu keadaan yang membedakan hari ke-1 dari hari
 * ke-3 sebuah jadwal. `dayIndex` cuma posisi dalam rentang, dan setiap baris
 * memakainya setara ("hari 1/4", "hari 2/4", …). Keputusan pemilik produk
 * 2026-08-09; jangan diubah jadi baris sekunder/ramping tanpa membicarakannya.
 */
function EntryRow({
  item, now, onOpen,
}: {
  item: DayEntry;
  now: number;
  onOpen: (e: AdScheduleEntry) => void;
}) {
  const { entry, dayIndex, dayCount } = item;
  // `agendaChipOf`, BUKAN `chipKindOf` — chip harus sepakat dengan pita hari
  // yang menaungi barisnya. Alasan lengkapnya di scheduleModel.ts.
  const kind = agendaChipOf(entry, now);
  const token = tokenForChip(kind);
  const isKilat = entry.distributionType === 'kilat';
  const unscheduled = isUnscheduled(entry);
  const bannerTodo = needsBannerSwap(entry);

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

      {/* Booking ID JADWAL — sejak sql/51 kode yang sama persis dengan yang
          dilihat & disalin peneliti. Sebelumnya baris ini menampilkan
          `submissionId`, yang untuk jadwal ke-2 dst. BUKAN kode yang dikutip
          peneliti ke support. Jangan kembalikan ke id apa pun. */}
      <div className={cn(COL.id, 'flex items-center gap-1')}>
        <span className="font-mono text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5 truncate">
          #{entry.bookingId}
        </span>
        {/* `stopPropagation()`: baris ini seluruhnya `onClick={onOpen}` —
            tanpa ini, menyalin ID juga membuka drawer. Disalin TANPA `#`,
            sama seperti `CopyOrderIdButton` di dashboard peneliti. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(entry.bookingId, 'Booking ID disalin!');
          }}
          title="Salin Booking ID"
          aria-label="Salin Booking ID"
          className="shrink-0 p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Copy className="w-3 h-3" />
        </button>
      </div>

      {/* Survei + peneliti + university */}
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
        <span className="text-[11px] text-gray-500 truncate mt-0.5 flex items-center gap-1.5">
          <span className="truncate">
            {entry.researcherName}
            {entry.university ? ` · ${entry.university}` : ''}
            {/* Periode ikut di subtitle hanya saat kolomnya tersembunyi (mobile). */}
            {!unscheduled && entry.startDate && entry.endDate && (
              <span className="md:hidden">
                {' · '}{formatWibShort(entry.startDate)} – {formatWibShort(entry.endDate)}
              </span>
            )}
          </span>
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
            {/* Posisi dalam rentang, bukan peringkat. Jadwal sehari tidak
                menampilkannya sama sekali — "hari 1/1" cuma derau.

                ⚠️ Panjangnya DITURUNKAN DARI JENDELA (`dayCount`), bukan dari
                kolom `duration`. Keduanya tidak selalu sepakat di produksi:
                order #8462698a bertanggal 1–2 Agu (satu hari) tapi kolomnya
                berbunyi 3. Kolom itu dicetak tepat di sebelah rentangnya, jadi
                memakainya berarti memajang dua angka yang saling menyangkal —
                dan `dayCount` yang menang, karena ia juga yang menentukan kuota
                hari di tab Iklan. */}
            <span className="block text-gray-400">
              {dayCount > 1 ? `hari ${dayIndex}/${dayCount}` : `${dayCount} hari`}
            </span>
            {kind === 'live' && <ProgressBar entry={entry} now={now} />}
          </>
        )}
      </div>

      {/* Kolom Page: menampilkan badge ⚠ banner jika banner masih bawaan, atau status kesiapan halaman */}
      <div className={cn(COL.page, 'flex items-center justify-end')}>
        {bannerTodo ? (
          <span
            className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
            title="Halaman siap tayang, tetapi banner masih menggunakan gambar default — ganti lewat drawer"
          >
            ⚠ Banner
          </span>
        ) : entry.pageStatus === 'published' ? (
          <span
            className="text-[10px] font-semibold text-emerald-600"
            title="Halaman survei sudah siap & dipublish"
          >
            Siap
          </span>
        ) : entry.pageStatus === 'draft' ? (
          <span
            className="text-[10px] font-medium text-slate-500"
            title="Halaman masih tersimpan sebagai draft"
          >
            Draft
          </span>
        ) : (
          <span
            className="text-[10px] font-medium text-gray-300"
            title={
              entry.pageStatus === 'kilat'
                ? 'Kilat disiarkan langsung tanpa halaman web'
                : 'Halaman belum dibuat'
            }
          >
            —
          </span>
        )}
      </div>

      <div className={COL.status}>
        <Chip variant={token.variant} size="sm" dot={token.dot} pulse={token.pulse}>
          {token.label}
        </Chip>
      </div>

      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
    </div>
  );
}

/**
 * Pita pemisah hari. Sticky di bawah header kolom (top-10) supaya saat menggulung
 * panjang, admin tidak pernah kehilangan jawaban atas "ini hari apa".
 */
/**
 * Tone `today` ADA KARENA PITA HARI INI DULU TIDAK BISA DITEMUKAN.
 *
 * Sebelumnya ia identik dengan pita hari lain — `bg-gray-50/95` yang sama —
 * dan satu-satunya penanda adalah badge biru kecil di ujungnya. Di antara
 * puluhan pita abu yang serupa itu praktis tak terlihat, dan sesudah pemekaran
 * per hari daftarnya jauh lebih panjang lagi.
 *
 * Yang diwarnai hanya PEMISAHNYA, bukan baris-baris di bawahnya: yang dicari
 * mata adalah batas harinya, dan mewarnai barisnya justru mengaburkan chip
 * status di dalam tiap baris.
 */
function GroupHeader({
  label, count, tone, badge,
}: {
  label: string;
  count: number;
  tone: 'day' | 'warn' | 'today';
  badge?: string;
}) {
  const toneClass = {
    warn: 'bg-amber-50/95 border-amber-200 text-amber-800',
    today: 'bg-blue-600/95 border-blue-700 text-white border-l-4 border-l-blue-300 shadow-sm',
    day: 'bg-gray-50/95 border-gray-200 text-gray-600',
  }[tone];

  const countClass = {
    warn: 'bg-amber-200/70 text-amber-900',
    today: 'bg-white/25 text-white',
    day: 'bg-gray-200/80 text-gray-600',
  }[tone];

  return (
    <div className={cn('sticky top-10 z-[9] flex items-center gap-2 px-4 h-8 border-b', toneClass)}>
      <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      <span className={cn('rounded-full px-1.5 text-[10px] font-bold tabular-nums', countClass)}>
        {count}
      </span>
      {badge && (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
            tone === 'today' ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-700'
          )}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

/** Entri tanpa hari (blok "belum dijadwalkan" / "gugur") dibungkus jadi DayEntry sehari. */
const asSingleDay = (e: AdScheduleEntry): DayEntry => ({ entry: e, dayIndex: 1, dayCount: 1 });

export function ScheduleAgenda({
  groups, unscheduledEntries, lapsedEntries, alertEntries, alertTitle, now, onOpen,
}: {
  groups: DayGroup[];
  unscheduledEntries: AdScheduleEntry[];
  /**
   * Jadwal yang tahanan slotnya gugur. Tidak ikut daftar hari — slotnya sudah
   * dilepas, jadi menghitungnya di sana membuat hari terlihat lebih penuh
   * daripada yang bisa dijual. Tapi ia tetap butuh jalan masuk: dari sinilah
   * admin membuka drawer dan menjadwalkannya ulang.
   */
  lapsedEntries: AdScheduleEntry[];
  /**
   * Ketika filter alert/indikator chip aktif, tampilkan HANYA baris-baris
   * yang relevan dengan alert tersebut (isolasi hasil filter).
   */
  alertEntries?: AdScheduleEntry[] | null;
  alertTitle?: string;
  now: number;
  onOpen: (e: AdScheduleEntry) => void;
}) {
  const isAlertMode = alertEntries !== null && alertEntries !== undefined;
  const isEmpty = isAlertMode
    ? alertEntries.length === 0
    : groups.length === 0 && unscheduledEntries.length === 0 && lapsedEntries.length === 0;

  return (
    <>
      {/* Header kolom — sticky di puncak wilayah gulung, sama seperti Submissions. */}
      <div className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200 px-4 h-10 flex items-center gap-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
        <span className={COL.time}>Jam</span>
        <span className={COL.id}>ID</span>
        <span className={COL.survey}>Survei</span>
        <span className={COL.period}>Periode</span>
        <span className={COL.page}>Page</span>
        <span className={cn(COL.status, 'text-right')}>Status</span>
        <span className="w-4 shrink-0" aria-hidden="true" />
      </div>

      {/* ── Mode Alert / Isolasi Chip ── */}
      {isAlertMode && alertEntries.length > 0 && (
        <div>
          <GroupHeader label={alertTitle || 'Hasil Filter'} count={alertEntries.length} tone="warn" />
          <div className="divide-y divide-gray-100">
            {alertEntries.map((e) => (
              <EntryRow key={e.id} item={asSingleDay(e)} now={now} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}

      {/* ── Mode Normal ── */}
      {!isAlertMode && unscheduledEntries.length > 0 && (
        <div>
          <GroupHeader label="⚠ Belum dijadwalkan" count={unscheduledEntries.length} tone="warn" />
          <div className="divide-y divide-gray-100">
            {unscheduledEntries.map((e) => (
              <EntryRow key={e.id} item={asSingleDay(e)} now={now} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}

      {!isAlertMode && lapsedEntries.length > 0 && (
        <div>
          <GroupHeader label="⚠ Batas bayar terlewat" count={lapsedEntries.length} tone="warn" />
          <div className="divide-y divide-gray-100">
            {lapsedEntries.map((e) => (
              <EntryRow key={e.id} item={asSingleDay(e)} now={now} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}

      {!isAlertMode && groups.map((group) => (
        <div key={group.ymd} id={dayGroupDomId(group.ymd)} className="scroll-mt-10">
          <GroupHeader
            label={group.label}
            count={group.entries.length}
            tone={group.isToday ? 'today' : 'day'}
            badge={group.isToday ? 'hari ini' : undefined}
          />
          <div className="divide-y divide-gray-100">
            {/* Kunci gabungan: satu jadwal muncul di beberapa hari, jadi `entry.id`
                saja tidak unik lagi di seluruh daftar. */}
            {group.entries.map((item) => (
              <EntryRow
                key={`${item.entry.id}-${group.ymd}`}
                item={item}
                now={now}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      ))}

      {isEmpty && (
        <p className="text-center text-sm text-gray-400 py-20">
          {isAlertMode
            ? 'Tidak ada jadwal pada periode ini yang sesuai dengan filter.'
            : 'Tidak ada jadwal pada periode ini dengan filter yang dipilih.'}
        </p>
      )}
    </>
  );
}
