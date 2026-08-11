import { useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarClock, Check, ChevronDown, Copy, CreditCard, ExternalLink,
  FileText, Sparkles, Trash2, Zap,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import { cn } from '@/lib/utils';
import type { AdScheduleEntry, SchedulePayment } from '@/utils/supabase';
import { formatIDR } from '@/utils/currency';
import { copyToClipboard } from '../types';
import { isPaymentTooLateForDate, paymentCutoffInstant, toWibYmd } from '@/utils/airing-window';
// Derivasi chip diimpor, TIDAK disalin. Papan Schedule dan drawer ini harus
// menamai keadaan yang sama dengan nama yang sama.
import { chipKindOf, holdStateOf, isUnscheduled, tokenForChip, formatWibShort } from '@/pages/dashboard/schedule/scheduleModel';
import { deriveScheduleMoney } from './scheduleMoney';

// ─────────────────────────────────────────────────────────────
// Satu kartu per JADWAL — dan pembayarannya ADA DI DALAM kartu itu.
//
// Jadwal dan pembayaran satu kesatuan: yang dibayar adalah jendela tayang
// tertentu, bukan "order". Memisahkannya jadi blok sendiri memaksa admin
// mencocokkan sendiri tagihan mana milik jadwal mana — dan untuk order
// berjadwal banyak, tidak ada cara melakukannya dari layar.
//
// Bentuknya meniru dashboard user (`SchedulePhase.tsx`): tiap kartu punya
// banner yang DIGERAKKAN KEADAAN dengan aksi yang berlaku di keadaan itu, lalu
// rincian biaya dan tagihan di bawahnya. Peneliti sudah melihat order-nya
// begitu; admin melihat order yang sama sebaiknya melihat kerangka yang sama.
// ─────────────────────────────────────────────────────────────

type CardState = 'cancelled' | 'choose_schedule' | 'awaiting_invoice' | 'waiting_payment' | 'paid';

function cardStateOf(entry: AdScheduleEntry, payment: SchedulePayment | undefined): CardState {
  const kind = chipKindOf(entry);
  if (kind === 'rejected' || kind === 'spam') return 'cancelled';
  if (payment?.hasEverPaid || ['paid', 'completed'].includes(entry.paymentStatus || '')) return 'paid';
  if (isUnscheduled(entry)) return 'choose_schedule';
  if (!payment) return 'awaiting_invoice';
  return 'waiting_payment';
}

/**
 * Jadwal yang slotnya masih ditahan tapi batas bayarnya sudah lewat — inilah
 * yang admin perlu tagih manual.
 *
 * Sengaja `holdStateOf` dan BUKAN definisi baru: papan Schedule sudah memakai
 * fungsi yang sama untuk pil "perlu ditagih", jadi angka di papan dan badge di
 * drawer tidak bisa menyimpang. Ia sudah memagari keluar `in_review`/`requested`
 * yang memilih tanggal saat checkout tanpa pernah memesan apa pun.
 */
function needsBilling(entry: AdScheduleEntry, now: number = Date.now()): boolean {
  return holdStateOf(entry, now) === 'lapsed';
}

/** Jadwal yang masih menunggu tindakan admin — inilah yang dibuka duluan. */
function needsWork(entry: AdScheduleEntry, payment: SchedulePayment | undefined): boolean {
  const state = cardStateOf(entry, payment);
  return state === 'choose_schedule' || state === 'awaiting_invoice' || state === 'waiting_payment';
}

/**
 * Yang terbuka default adalah yang PALING BUTUH DIKERJAKAN, bukan yang sedang
 * tayang. Sengaja berbeda dari `pickDefaultExpandedKey()` di dashboard user:
 * peneliti membuka layar untuk melihat surveinya berjalan, admin membukanya
 * untuk mencari apa yang macet.
 */
function pickDefaultOpen(entries: AdScheduleEntry[], payments: Map<string, SchedulePayment>): string | null {
  if (entries.length <= 1) return entries[0]?.id ?? null;
  return entries.find((e) => needsWork(e, payments.get(e.id)))?.id ?? null;
}

function dateRangeOf(e: AdScheduleEntry): string {
  if (isUnscheduled(e)) return 'Belum dijadwalkan';
  const start = formatWibShort(e.startDate!);
  const end = e.endDate ? formatWibShort(e.endDate) : null;
  return end && end !== start ? `${start} – ${end}` : start;
}

interface CardActions {
  onEditSchedule: (entry: AdScheduleEntry) => void;
  onCreateInvoice: (entry: AdScheduleEntry) => void;
  onMarkPaid: (() => void) | null;
  /** null = jadwal ini tidak boleh dibatalkan dari sini. */
  onCancel: ((entry: AdScheduleEntry) => void) | null;
  /** "Hapus dari list" — lepaskan slot jadwal yang batas bayarnya sudah lewat. */
  onReleaseSlot: ((entry: AdScheduleEntry) => void) | null;
}

function PaymentBanner({
  entry, payment, state, actions,
}: {
  entry: AdScheduleEntry;
  payment: SchedulePayment | undefined;
  state: CardState;
  actions: CardActions;
}) {
  // Sejak jadwal & tagihan pindah ke sub-tampilan drawer, setiap aksi berlingkup
  // SATU jadwal — jadi tidak ada lagi pagar ordinal di sini. Pagar lamanya ada
  // semata karena SchedulePaymentView selalu menyunting jadwal pertama.
  //
  // ⚠️ PEMBAGIAN PERANNYA: banner menjelaskan KEADAAN dan hanya memuat aksi yang
  // khas keadaan itu (tandai lunas, salin link bayar, kuitansi). Dua aksi tetap —
  // "Jadwalkan ulang" dan "Buat tagihan" — hidup di baris aksi di dasar kartu,
  // SATU tempat saja. Sempat ada di kedua tempat, dan admin jadi harus menebak
  // tombol mana yang benar.
  if (state === 'cancelled') return null;

  if (state === 'paid') {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-emerald-800 inline-flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> Lunas
          {payment && payment.attempts > 1 && (
            <span className="font-normal text-emerald-600">· {payment.attempts} percobaan bayar</span>
          )}
        </span>
        {payment?.paymentId && (
          <a
            href={`/invoices/${payment.paymentId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-emerald-700 hover:underline inline-flex items-center gap-1 shrink-0"
          >
            <FileText className="w-3 h-3" /> Kuitansi <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
    );
  }

  if (state === 'choose_schedule') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
        <p className="text-[11px] text-amber-900 inline-flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5 shrink-0" /> Slot belum dipilih.
        </p>
      </div>
    );
  }

  if (state === 'awaiting_invoice') {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-2">
        <p className="text-[11px] text-slate-600 inline-flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5 shrink-0" /> Belum ada tagihan untuk jadwal ini.
        </p>
        {actions.onMarkPaid && (
          <Button size="sm" className="w-full h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={actions.onMarkPaid}>
            <Check className="w-3 h-3 mr-1.5" /> Tandai Lunas
          </Button>
        )}
      </div>
    );
  }

  // waiting_payment — batas bayar 14.00 WIB pada hari tayang (airing-window.ts)
  const ymd = entry.startDate ? toWibYmd(new Date(entry.startDate)) : null;
  const isLate = ymd ? isPaymentTooLateForDate(ymd) : false;
  const cutoff = ymd ? paymentCutoffInstant(ymd) : null;

  return (
    <div className={cn('rounded-lg border px-3 py-2.5 space-y-2', isLate ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60')}>
      <p className={cn('text-[11px] inline-flex items-center gap-1.5', isLate ? 'text-red-800' : 'text-amber-900')}>
        <CreditCard className="w-3.5 h-3.5 shrink-0" />
        {isLate ? (
          <span><strong>Batas bayar terlewat</strong> — 14.00 WIB pada hari tayang.</span>
        ) : cutoff ? (
          <span>
            Batas bayar <strong>14.00 WIB, {formatWibShort(cutoff.toISOString())}</strong>
          </span>
        ) : (
          <span>Menunggu pembayaran.</span>
        )}
      </p>
      <div className="flex gap-2">
        {payment?.paymentUrl && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-[11px] bg-white"
            onClick={() => copyToClipboard(payment.paymentUrl!, 'Payment link copied!')}
          >
            <Copy className="w-3 h-3 mr-1.5" /> Salin link bayar
          </Button>
        )}
        {actions.onMarkPaid && (
          <Button size="sm" className="flex-1 h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={actions.onMarkPaid}>
            <Check className="w-3 h-3 mr-1.5" /> Tandai Lunas
          </Button>
        )}
      </div>
    </div>
  );
}

function ScheduleCard({
  entry, payment, submission, isOpen, isOnly, onToggle, actions,
}: {
  entry: AdScheduleEntry;
  payment: SchedulePayment | undefined;
  submission: { questionCount?: number | null; distribution_type?: string | null };
  isOpen: boolean;
  isOnly: boolean;
  onToggle: () => void;
  actions: CardActions;
}) {
  const token = tokenForChip(chipKindOf(entry));
  const money = deriveScheduleMoney(entry, submission);
  const state = cardStateOf(entry, payment);
  const isKilat = entry.distributionType === 'kilat';

  const summary = (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        {!isOnly && <span className="text-xs font-bold text-slate-400 tabular-nums shrink-0">#{entry.ordinal}</span>}
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
        {/* Tanggal saja TIDAK cukup membedakan kartu: sebuah jadwal baru bisa
            membuka pool hadiah baru untuk jendela yang sama persis. */}
        {entry.isNewPeriod && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded px-1"
            title="Membuka pool hadiah baru, bukan menambah pool berjalan"
          >
            <Sparkles className="w-2.5 h-2.5" /> batch baru
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <Chip variant={token.variant} size="sm" dot={token.dot} pulse={token.pulse}>{token.label}</Chip>
        {/* Slotnya MASIH ditahan — yang lewat cuma batas bayarnya. Badge ini
            ada supaya keadaan itu terbaca tanpa membuka kartu; sebelumnya ia
            cuma hidup di dalam banner, dan di papan Schedule barisnya malah
            disembunyikan secara default. */}
        {needsBilling(entry) && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1"
            title="Batas bayar 14.00 WIB pada hari tayang sudah lewat. Slotnya tidak dilepas — tagih manual, lalu jadwalkan ulang atau hapus dari list."
          >
            <AlertTriangle className="w-2.5 h-2.5" /> perlu ditagih
          </span>
        )}
        <span className="text-slate-600">
          {formatIDR(money.total)}
          {money.isEstimate && <span className="text-slate-400"> · estimasi</span>}
        </span>
        <span className={state === 'paid' ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
          {state === 'paid' ? 'lunas' : entry.paymentStatus === 'failed' ? 'gagal' : 'belum dibayar'}
        </span>
      </div>
    </div>
  );

  const details = (
    <div className="border-t border-slate-100 px-3 py-2.5 space-y-2.5 bg-slate-50/50">
      <PaymentBanner entry={entry} payment={payment} state={state} actions={actions} />

      {money.lines ? (
        <div className="space-y-1 text-xs">
          {money.lines.map((line, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span className="text-slate-500">
                {line.label}
                {line.hint && <span className="text-[10px] text-slate-400 ml-1">({line.hint})</span>}
              </span>
              <span className={cn('font-medium tabular-nums',
                line.tone === 'discount' ? 'text-emerald-600' : line.tone === 'addon' ? 'text-amber-600' : 'text-slate-900')}>
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

      {(payment?.paymentId || entry.slotBookedBy || entry.voucherCode) && (
        <div className="grid grid-cols-[auto_1fr] [display:grid] gap-x-3 gap-y-1 text-[11px] pt-1 border-t border-slate-200">
          {payment?.paymentId && state !== 'paid' && (
            <>
              <span className="text-slate-400">Tagihan</span>
              <a
                href={`/invoices/${payment.paymentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 hover:underline inline-flex items-center gap-1 truncate"
              >
                <FileText className="w-3 h-3 shrink-0" />
                <span className="truncate">{payment.paymentId}</span>
                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
              </a>
            </>
          )}
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
        </div>
      )}

      {/* Aksi jadwal — berlaku untuk SEMUA ordinal sejak keduanya jadi
          sub-tampilan drawer yang berlingkup satu jadwal. */}
      {state !== 'cancelled' && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-200">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-[11px] bg-white"
            onClick={() => actions.onEditSchedule(entry)}
          >
            <CalendarClock className="w-3 h-3 mr-1.5" />
            {isUnscheduled(entry) ? 'Pilih jadwal' : 'Jadwalkan ulang'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-[11px] bg-white"
            onClick={() => actions.onCreateInvoice(entry)}
          >
            <CreditCard className="w-3 h-3 mr-1.5" /> Buat tagihan
          </Button>
          {/* ⚠️ Syarat pembatalan SENGAJA sama persis dengan tombol lama di
              ExtendSection: hanya jadwal perpanjangan, hanya selama belum ada
              tagihan yang menempel. Melonggarkannya berarti menyelundupkan
              kemampuan baru ke dalam pemindahan permukaan — itu Task 13. */}
          {actions.onCancel && entry.isExtension && !payment && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0 shrink-0 bg-white text-slate-400 hover:text-red-600 hover:border-red-200"
              title="Batalkan jadwal ini"
              onClick={() => actions.onCancel!(entry)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      )}

      {/* Jalan keluar kedua untuk jadwal yang batas bayarnya lewat: lepaskan
          slotnya. Pasangannya "Jadwalkan ulang" sudah ada di baris di atas —
          admin memilih salah satu setelah menagih di luar sistem.

          Dipisah dari baris aksi supaya tidak bersaing perhatian dengan dua
          aksi tetap itu: melepas slot adalah keputusan akhir, bukan langkah
          rutin. */}
      {actions.onReleaseSlot && needsBilling(entry) && state !== 'paid' && (
        <button
          type="button"
          onClick={() => actions.onReleaseSlot!(entry)}
          className="w-full text-[11px] text-slate-400 hover:text-red-600 transition-colors inline-flex items-center justify-center gap-1.5 py-1"
        >
          <Trash2 className="w-3 h-3" /> Hapus dari list — lepaskan slotnya
        </button>
      )}
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
  entries, payments, submission, onEditSchedule, onCreateInvoice, onMarkPaid, onCancel, onReleaseSlot,
}: {
  entries: AdScheduleEntry[];
  payments: Map<string, SchedulePayment>;
  submission: { questionCount?: number | null; distribution_type?: string | null };
  onEditSchedule: (entry: AdScheduleEntry) => void;
  onCreateInvoice: (entry: AdScheduleEntry) => void;
  /**
   * null = jadwal ini tidak boleh dibatalkan dari sini.
   *
   * ⚠️ Syaratnya SENGAJA sama persis dengan tombol lama di ExtendSection:
   * hanya jadwal perpanjangan, hanya selama belum ada tagihan. Ini bukan
   * kemampuan baru — cuma pindah rumah. Versi benarnya (melewatkan transaksi
   * pending jadi `expired`, melepas `slot_booked_by`, berlaku semua ordinal)
   * adalah Task 13 Langkah 3.
   */
  onCancel: ((entry: AdScheduleEntry) => void) | null;
  /**
   * null = tombolnya tidak boleh dirender di dalam kartu.
   *
   * ⚠️ `updatePaymentStatus` masih menyaring `form_submission_id` saja, jadi ia
   * melunasi SELURUH invoice order. Untuk order berjadwal satu itu tidak
   * berbeda — "semua tagihan order" persis "tagihan jadwal ini". Untuk order
   * berjadwal banyak ia berbohong, jadi pemanggil mengirim null dan tombolnya
   * pindah ke luar beserta peringatannya. Penyempitannya ada di Task 11.
   */
  onMarkPaid: (() => void) | null;
  /**
   * "Hapus dari list" — melepas slot SATU jadwal yang batas bayarnya lewat.
   *
   * Berlaku semua ordinal, dan pembayarannya disaring per jadwal lewat
   * `releaseScheduleSlot` (utils/supabase.ts). Ini fondasi Task 13 Langkah 3;
   * yang tersisa di sana tinggal menukar penautan `entity_type`/`extend_id`
   * ke `schedule_id` dan mempertahankan tanggal alih-alih mengosongkannya.
   */
  onReleaseSlot: ((entry: AdScheduleEntry) => void) | null;
}) {
  const [openId, setOpenId] = useState<string | null>(() => pickDefaultOpen(entries, payments));
  const isOnly = entries.length === 1;

  const summary = useMemo(() => {
    const billed = entries.reduce((sum, e) => sum + e.totalCost, 0);
    const unpaid = entries.filter((e) => {
      const s = cardStateOf(e, payments.get(e.id));
      return s !== 'paid' && s !== 'cancelled';
    }).length;
    return { billed, unpaid };
  }, [entries, payments]);

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
          payment={payments.get(e.id)}
          submission={submission}
          isOnly={isOnly}
          isOpen={openId === e.id}
          onToggle={() => setOpenId((prev) => (prev === e.id ? null : e.id))}
          actions={{ onEditSchedule, onCreateInvoice, onMarkPaid, onCancel, onReleaseSlot }}
        />
      ))}
    </div>
  );
}
