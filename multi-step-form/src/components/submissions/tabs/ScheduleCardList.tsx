import { useMemo, useState } from 'react';
import { ChevronDown, Sparkles, Zap } from 'lucide-react';
import { Chip } from '../../ui/chip';
import { cn } from '@/lib/utils';
import type { AdScheduleEntry } from '@/utils/supabase';
import { formatIDR } from '@/utils/currency';
// Derivasi chip diimpor, TIDAK disalin. Papan Schedule dan drawer ini harus
// menamai keadaan yang sama dengan nama yang sama; menyalin logikanya berarti
// menyiapkan dua sumber yang akan menyimpang diam-diam.
import { chipKindOf, isUnscheduled, tokenForChip, formatWibShort } from '@/pages/dashboard/schedule/scheduleModel';
import { deriveScheduleMoney } from './scheduleMoney';

// ─────────────────────────────────────────────────────────────
// Satu kartu per JADWAL, bukan satu blok per order.
//
// KENAPA: sebuah order bisa punya beberapa jendela tayang, dan tiap jendela
// punya tanggal, biaya, dan status pembayarannya SENDIRI. Sampai Phase 3 tab ini
// menampilkan satu "Status Reservasi" (selalu dari jadwal #1) dan satu "Status
// Pembayaran" (dari invoice TERAKHIR, yang bisa milik jadwal lain) — jadi untuk
// order berjadwal banyak ia memasangkan tanggal #1 dengan pembayaran #2 dan
// menampilkan satu baris yang tidak pernah ada.
//
// Terukur di produksi 2026-08-08: 9 order punya >1 jadwal, dan nilainya memang
// berbeda per jadwal — "Order Request" #1 lunas, #2 dibatalkan dengan pembayaran
// gagal, #3 menunggu bayar.
//
// Bentuknya sengaja MENIRU dashboard user (`airingPeriods.ts` → `ScheduleCard`,
// accordion ber-"#1"): peneliti sudah melihat order-nya begitu, dan admin yang
// melihat order yang sama sebaiknya melihat kerangka yang sama.
// ─────────────────────────────────────────────────────────────

/** Jadwal yang masih menunggu tindakan admin — inilah yang dibuka duluan. */
function needsWork(e: AdScheduleEntry): boolean {
  return ['unscheduled', 'requested', 'slot_reserved', 'waiting_payment'].includes(e.status);
}

/**
 * Yang terbuka default adalah yang PALING BUTUH DIKERJAKAN, bukan yang sedang
 * tayang. Ini sengaja berbeda dari `pickDefaultExpandedKey()` di dashboard user:
 * peneliti membuka layar untuk melihat surveinya berjalan, admin membukanya
 * untuk mencari apa yang macet. Kalau tidak ada yang macet, semuanya tertutup.
 */
function pickDefaultOpen(entries: AdScheduleEntry[]): string | null {
  if (entries.length <= 1) return entries[0]?.id ?? null;
  return entries.find(needsWork)?.id ?? null;
}

function dateRangeOf(e: AdScheduleEntry): string {
  if (isUnscheduled(e)) return 'Belum dijadwalkan';
  const start = formatWibShort(e.startDate!);
  const end = e.endDate ? formatWibShort(e.endDate) : null;
  return end && end !== start ? `${start} – ${end}` : start;
}

function ScheduleCard({
  entry, submission, isOpen, isOnly, onToggle,
}: {
  entry: AdScheduleEntry;
  submission: { questionCount?: number | null; distribution_type?: string | null };
  isOpen: boolean;
  isOnly: boolean;
  onToggle: () => void;
}) {
  const token = tokenForChip(chipKindOf(entry));
  const money = deriveScheduleMoney(entry, submission);
  const isPaid = entry.paymentStatus === 'paid' || entry.paymentStatus === 'completed';
  const isKilat = entry.distributionType === 'kilat';

  const summary = (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        {!isOnly && (
          <span className="text-xs font-bold text-slate-400 tabular-nums shrink-0">#{entry.ordinal}</span>
        )}
        <span className="text-sm font-semibold text-slate-900">
          {dateRangeOf(entry)}
          {entry.duration ? <span className="font-normal text-slate-500"> · {entry.duration} hari</span> : null}
        </span>
        {isKilat && entry.kilatSlotHour != null && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-700">
            <Zap className="w-3 h-3 fill-amber-500 text-amber-500" />
            {String(entry.kilatSlotHour).padStart(2, '0')}.00
          </span>
        )}
        {/* Tanggal saja TIDAK cukup membedakan kartu: sebuah perpanjangan bisa
            membuka pool hadiah baru untuk jendela yang sama persis. Terukur di
            "Studi Pengambilan Keputusan" — #1 dan #2 keduanya 2–4 Agu. */}
        {entry.isNewPeriod && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded px-1"
            title="Membuka pool hadiah baru, bukan menambah pool berjalan"
          >
            <Sparkles className="w-2.5 h-2.5" /> batch baru
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <Chip variant={token.variant} size="sm" dot={token.dot} pulse={token.pulse}>
          {token.label}
        </Chip>
        <span className="text-slate-600">
          {formatIDR(money.total)}
          {money.isEstimate && <span className="text-slate-400"> · estimasi</span>}
        </span>
        <span className={isPaid ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
          {isPaid ? 'lunas' : entry.paymentStatus === 'failed' ? 'gagal' : 'belum dibayar'}
        </span>
      </div>
    </div>
  );

  const details = (
    <div className="border-t border-slate-100 px-3 py-2.5 space-y-2.5 bg-slate-50/50">
      {money.lines ? (
        <div className="space-y-1 text-xs">
          {money.lines.map((line, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span className="text-slate-500">
                {line.label}
                {line.hint && <span className="text-[10px] text-slate-400 ml-1">({line.hint})</span>}
              </span>
              <span
                className={cn(
                  'font-medium tabular-nums',
                  line.tone === 'discount' ? 'text-emerald-600' : line.tone === 'addon' ? 'text-amber-600' : 'text-slate-900'
                )}
              >
                {line.tone === 'discount' ? '-' : ''}{formatIDR(Math.abs(line.amount))}
              </span>
            </div>
          ))}
          <div className="flex justify-between gap-3 pt-1 border-t border-slate-200">
            <span className="font-medium text-slate-600">{money.isEstimate ? 'Estimasi' : 'Ditagih'}</span>
            <span className="font-bold text-blue-600 tabular-nums">{formatIDR(money.total)}</span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 italic">{money.note}</p>
      )}

      <div className="grid grid-cols-[auto_1fr] [display:grid] gap-x-3 gap-y-1 text-[11px] pt-1 border-t border-slate-200">
        {entry.slotBookedBy && (
          <>
            <span className="text-slate-400">Dipesan</span>
            <span className="font-medium text-slate-700 capitalize">{entry.slotBookedBy}</span>
          </>
        )}
        {entry.voucherCode && (
          <>
            <span className="text-slate-400">Voucher</span>
            <span className="font-mono text-slate-700">{entry.voucherCode}</span>
          </>
        )}
        <span className="text-slate-400">Sumber</span>
        <span className="text-slate-600">{entry.isExtension ? 'Perpanjangan' : 'Jadwal pertama'}</span>
      </div>
    </div>
  );

  if (isOnly) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-3 py-2.5">{summary}</div>
        {details}
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border bg-white overflow-hidden', isOpen ? 'border-blue-300' : 'border-slate-200')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50/70 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
      >
        {summary}
        <ChevronDown className={cn('w-4 h-4 shrink-0 mt-0.5 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
      </button>
      {isOpen && details}
    </div>
  );
}

export function ScheduleCardList({
  entries, submission,
}: {
  entries: AdScheduleEntry[];
  submission: { questionCount?: number | null; distribution_type?: string | null };
}) {
  const [openId, setOpenId] = useState<string | null>(() => pickDefaultOpen(entries));
  const isOnly = entries.length === 1;

  const summary = useMemo(() => {
    const billed = entries.reduce((sum, e) => sum + e.totalCost, 0);
    const unpaid = entries.filter(
      (e) => e.status !== 'cancelled' && e.paymentStatus !== 'paid' && e.paymentStatus !== 'completed'
    ).length;
    return { billed, unpaid };
  }, [entries]);

  if (entries.length === 0) {
    return (
      <p className="text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg px-3 py-2.5">
        Belum ada jadwal untuk order ini.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {!isOnly && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <span className="font-semibold">{entries.length} jadwal</span>
          <span className="text-slate-300">·</span>
          <span>{formatIDR(summary.billed)} ditagih</span>
          {summary.unpaid > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-amber-700 font-medium">⚠ {summary.unpaid} belum dibayar</span>
            </>
          )}
        </div>
      )}

      {entries.map((e) => (
        <ScheduleCard
          key={e.id}
          entry={e}
          submission={submission}
          isOnly={isOnly}
          isOpen={openId === e.id}
          onToggle={() => setOpenId((prev) => (prev === e.id ? null : e.id))}
        />
      ))}
    </div>
  );
}
