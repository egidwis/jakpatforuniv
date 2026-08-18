import { useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CalendarPlus, Check, ChevronDown, Copy, CreditCard, ExternalLink,
  FileText, Sparkles, Trash2, Zap,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { cn } from '@/lib/utils';
import type { AdScheduleEntry, SchedulePayment } from '@/utils/supabase';
import { formatIDR } from '@/utils/currency';
import { copyToClipboard } from '../types';
import { isPaymentTooLateForDate, paymentCutoffInstant, toWibYmd } from '@/utils/airing-window';
// Derivasi chip diimpor, TIDAK disalin. Papan Schedule dan drawer ini harus
// menamai keadaan yang sama dengan nama yang sama.
import { holdStateOf, isUnscheduled, formatWibShort, formatWibTime } from '@/pages/dashboard/schedule/scheduleModel';
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
  if (entry.reviewStatus === 'rejected' || entry.reviewStatus === 'spam' || entry.status === 'cancelled') {
    return 'cancelled';
  }
  if (isUnscheduled(entry)) {
    return 'choose_schedule';
  }
  const isPaid = payment?.hasEverPaid || ['paid', 'completed'].includes(entry.paymentStatus || '') || ['paid', 'completed'].includes(entry.status || '');
  if (isPaid) {
    return 'paid';
  }
  if (payment?.paymentId || payment?.paymentUrl) {
    return 'waiting_payment';
  }
  return 'awaiting_invoice';
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
function needsBilling(e: AdScheduleEntry): boolean {
  return holdStateOf(e, Date.now()) === 'lapsed';
}

/** Jadwal yang masih menunggu tindakan admin — inilah yang dibuka duluan. */
function needsWork(e: AdScheduleEntry, p: SchedulePayment | undefined): boolean {
  const state = cardStateOf(e, p);
  return state === 'choose_schedule' || state === 'awaiting_invoice' || state === 'waiting_payment';
}

/**
 * Kartu mana yang default terbuka saat drawer pertama kali dibuka.
 *
 * Logikanya mengikuti kartu di agenda: kalau order berjadwal satu, kartu itu
 * langsung terbuka; kalau berjadwal banyak, kartu PERTAMA YANG BUTUH TINDAKAN
 * (belum dijadwalkan, belum ditagih, atau belum dibayar) yang terbuka. Kalau
 * semua sudah beres (misal order lama yang lunas semua), kartu pertama yang
 * terbuka. Admin tidak perlu klik-klik ekstra pada 90% kasus harian, tapi tetap
 * punya kendali untuk mencari apa yang macet.
 */
function pickDefaultOpen(entries: AdScheduleEntry[], payments: Map<string, SchedulePayment>): string | null {
  if (entries.length <= 1) return entries[0]?.id ?? null;
  return entries.find((e) => needsWork(e, payments.get(e.id)))?.id ?? null;
}

function ScheduleDateTitle({ entry }: { entry: AdScheduleEntry }) {
  if (isUnscheduled(entry)) return <>Belum dijadwalkan</>;
  const startDay = formatWibShort(entry.startDate!);
  const startTime = `${formatWibTime(entry.startDate!)} WIB`;

  const endDay = entry.endDate ? formatWibShort(entry.endDate) : null;
  const endTime = entry.endDate ? `${formatWibTime(entry.endDate)} WIB` : null;

  const hasDistinctEnd = endDay && `${endDay}, ${endTime}` !== `${startDay}, ${startTime}`;

  return (
    <>
      <span>{startDay}, </span>
      <span className="font-normal text-slate-400">{startTime}</span>
      {hasDistinctEnd && (
        <>
          <span> – {endDay}, </span>
          <span className="font-normal text-slate-400">{endTime}</span>
        </>
      )}
    </>
  );
}

interface CardActions {
  onEditSchedule: (entry: AdScheduleEntry) => void;
  onCreateInvoice: (entry: AdScheduleEntry) => void;
  onMarkPaid: (() => void) | null;
  /** null = jadwal ini tidak boleh dibatalkan dari sini. */
  onCancel: ((entry: AdScheduleEntry) => void) | null;
  /** "Lepaskan Slot" — lepaskan slot jadwal jika belum dibayar. */
  onReleaseSlot: ((entry: AdScheduleEntry) => void) | null;
}

/**
 * Tagihan & pembayaran untuk SATU jadwal.
 *
 * ⚠️ SATU TAGIHAN, BUKAN DAFTAR. `SchedulePayment` sengaja memuat satu
 * pembayaran per jadwal: sebelum `schedule_id` (Task 11) ada, beberapa baris
 * `transactions` untuk satu jadwal adalah PERCOBAAN BAYAR BERULANG, bukan
 * tagihan terpisah — merendernya sebagai daftar akan menjumlahkan ulang uang
 * yang sama. Tampilan multi-invoice yang sebenarnya adalah pekerjaan Task 13;
 * rancangannya sudah dicatat di rencana itu.
 */
function PaymentSection({
  entry, payment, state, actions,
}: {
  entry: AdScheduleEntry;
  payment: SchedulePayment | undefined;
  state: CardState;
  actions: CardActions;
}) {
  if (state === 'cancelled') {
    const isSpamOrRejected = entry.reviewStatus === 'spam' || entry.reviewStatus === 'rejected';
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-100/90 px-3 py-2.5 text-xs text-slate-600 space-y-1">
        <p className="font-semibold text-slate-700">
          {isSpamOrRejected
            ? `Submission berstatus ${entry.reviewStatus === 'spam' ? 'Spam' : 'Ditolak'}`
            : 'Jadwal telah dibatalkan'}
        </p>
        <p className="text-[11px] text-slate-500 leading-snug">
          {isSpamOrRejected
            ? 'Jadwal dinonaktifkan. Silakan ubah status review menjadi Approved di tab Review jika ingin mengaktifkan kembali penjadwalan.'
            : 'Jadwal ini telah dibatalkan dari sistem.'}
        </p>
      </div>
    );
  }

  if (state === 'choose_schedule') {
    return (
      <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2.5 space-y-2">
        <p className="text-[11px] text-sky-900 leading-snug font-medium">
          Jadwal belum ditentukan. Pilih tanggal tayang untuk memesan slot kuota.
        </p>
        <Button size="sm" className="w-full h-7 text-[11px] bg-sky-600 hover:bg-sky-700 text-white font-medium" onClick={() => actions.onEditSchedule(entry)}>
          <CalendarClock className="w-3 h-3 mr-1.5" /> Pilih jadwal tayang
        </Button>
      </div>
    );
  }

  const ymd = entry.startDate ? toWibYmd(new Date(entry.startDate)) : null;
  const isLate = !payment?.hasEverPaid && state !== 'paid' && ymd ? isPaymentTooLateForDate(ymd) : false;
  const cutoff = ymd ? paymentCutoffInstant(ymd) : null;

  // ⚠️ CABANG LUNAS WAJIB DI ATAS CABANG "BELUM ADA TAGIHAN", JANGAN DIBALIK.
  // Sebagian order dibayar di luar sistem dan tidak pernah punya baris
  // `transactions` (lihat memo payment-status-not-proof-of-payment). Kalau
  // urutannya terbalik, jadwal yang sudah lunas malah menampilkan ajakan
  // "Terbitkan tagihan" lengkap dengan tombolnya.
  if (state === 'paid') {
    const isManual =
      !payment ||
      payment.paymentMethod === 'manual' ||
      payment.paymentChannel === 'MANUAL_VERIFIED' ||
      (!payment.paymentChannel && payment.paymentMethod !== 'doku');

    return (
      <div className="space-y-2 pt-1 border-t border-slate-200">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-700 inline-flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-slate-500" />
            Tagihan &amp; Pembayaran
          </span>
          {payment && payment.attempts > 1 && (
            <span className="text-[10px] font-medium text-slate-400" title="Jumlah percobaan bayar untuk jadwal ini">
              {payment.attempts} percobaan bayar
            </span>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="p-2.5 flex items-center justify-between gap-3 bg-slate-50/40">
            <div className="min-w-0 flex-1 space-y-1">
              {payment?.paymentId && (
                <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 truncate">
                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{payment.paymentId}</span>
                </span>
              )}
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                  <Check className="w-3.5 h-3.5" /> Lunas
                </span>
                {isManual && (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200"
                    title="Audit: Pembayaran ditandai lunas manual (Tandai Lunas oleh Admin, bukan dari gateway DOKU)"
                  >
                    Tandai Lunas
                  </span>
                )}
                {!payment && (
                  <span className="text-[10px] text-slate-400">tanpa catatan tagihan di sistem</span>
                )}
              </div>
            </div>

            <div className="text-right shrink-0 space-y-1">
              {payment && payment.amount > 0 && (
                <div className="text-xs font-bold text-slate-900 tabular-nums">
                  {formatIDR(payment.amount)}
                </div>
              )}
              {payment?.paymentId && (
                <a
                  href={`/invoices/${payment.paymentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1"
                >
                  Kuitansi <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Belum ada tagihan sama sekali untuk jadwal ini.
  if (!payment?.paymentId && !payment?.paymentUrl) {
    return (
      <div className="space-y-2 pt-1 border-t border-slate-200">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-700 inline-flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-slate-500" />
            Tagihan &amp; Pembayaran
          </span>
        </div>
        <div className={cn(
          "rounded-lg border px-3 py-2.5 space-y-2",
          isLate ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/60"
        )}>
          <p className={cn("text-[11px] leading-snug", isLate ? "text-red-900" : "text-amber-900")}>
            {isLate
              ? 'Batas waktu pembayaran untuk slot ini sudah terlewat. Silakan buat jadwal baru.'
              : 'Slot tayang sudah dipesan. Terbitkan tagihan supaya peneliti bisa membayar.'}
          </p>
          {!isLate && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="flex-1 h-7 text-[11px] bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => actions.onCreateInvoice(entry)}
              >
                <CreditCard className="w-3 h-3 mr-1.5" /> Buat Tagihan
              </Button>
              {actions.onMarkPaid && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] text-emerald-700 hover:bg-emerald-50 border-emerald-300 bg-white"
                  onClick={actions.onMarkPaid}
                >
                  <Check className="w-3 h-3 mr-1.5" /> Tandai Lunas
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const paymentId = payment.paymentId;
  const invoiceUrl = paymentId ? `/invoices/${paymentId}` : null;

  return (
    <div className="space-y-2 pt-1 border-t border-slate-200">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-700 inline-flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5 text-slate-500" />
          Tagihan &amp; Pembayaran
        </span>
        {payment.attempts > 1 && (
          <span className="text-[10px] font-medium text-slate-400" title="Jumlah percobaan bayar untuk jadwal ini">
            {payment.attempts} percobaan bayar
          </span>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className={cn(
          "p-2.5 flex items-center justify-between gap-3",
          isLate ? "bg-slate-50/80" : "bg-white"
        )}>
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isLate ? (
                <span
                  className="text-xs font-semibold text-slate-400 inline-flex items-center gap-1 truncate cursor-not-allowed"
                  title="Batas bayar terlewat — invoice sudah tidak berlaku"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  <span className="truncate line-through opacity-70">{paymentId}</span>
                </span>
              ) : (
                <>
                  {invoiceUrl && (
                    <a
                      href={invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1 truncate"
                      title="Buka halaman invoice"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="truncate">{paymentId}</span>
                      <ExternalLink className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                    </a>
                  )}

                  {payment.paymentUrl && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(payment.paymentUrl!, 'Link bayar berhasil disalin!')}
                      className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Salin link bayar"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="text-[10px] text-slate-500">
              {isLate ? (
                <span className="font-semibold text-red-600">Batas bayar terlewat</span>
              ) : cutoff ? (
                <span>Batas: <strong className="font-semibold text-slate-700">{formatWibShort(cutoff.toISOString())}</strong></span>
              ) : (
                <span className="text-amber-700 font-medium">Menunggu pembayaran</span>
              )}
            </div>
          </div>

          <div className="text-right shrink-0 space-y-1">
            <div className={cn(
              "text-xs font-bold tabular-nums",
              isLate ? "text-slate-400 line-through" : "text-slate-900"
            )}>
              {formatIDR(payment.amount)}
            </div>
            {actions.onMarkPaid && !isLate && (
              <Button
                size="sm"
                className="h-6 px-2 text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={actions.onMarkPaid}
              >
                <Check className="w-3 h-3 mr-1" /> Tandai Lunas
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleCard({
  entry, payment, submission, isOpen, isOnly, onToggle, actions,
}: {
  entry: AdScheduleEntry;
  payment: SchedulePayment | undefined;
  submission: {
    questionCount?: number | null;
    question_count?: number | null;
    distribution_type?: string | null;
    distributionType?: string | null;
  };
  isOpen: boolean;
  isOnly: boolean;
  onToggle: () => void;
  actions: CardActions;
}) {
  const money = deriveScheduleMoney(entry, submission);
  const state = cardStateOf(entry, payment);
  const isKilat = entry.distributionType === 'kilat';
  const isBookedByUser = entry.slotBookedBy?.toLowerCase() === 'user' || entry.slotBookedBy?.toLowerCase() === 'customer';
  const actor = isBookedByUser ? 'Customer' : 'Admin';
  const ymd = entry.startDate ? toWibYmd(new Date(entry.startDate)) : null;
  const isLate = !payment?.hasEverPaid && state !== 'paid' && ymd ? isPaymentTooLateForDate(ymd) : false;

  const summary = (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        {!isOnly && <span className="text-xs font-bold text-slate-400 tabular-nums shrink-0">#{entry.ordinal}</span>}
        <span className="text-sm font-semibold text-slate-900">
          <ScheduleDateTitle entry={entry} />
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
        <span className="text-slate-500 font-medium">
          Reserved by <strong className="font-bold text-slate-700">{actor}</strong>
        </span>
        {needsBilling(entry) && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1"
            title="Batas bayar 14.00 WIB pada hari tayang sudah lewat. Slotnya tidak dilepas — tagih manual, lalu jadwalkan ulang atau hapus dari list."
          >
            <AlertTriangle className="w-2.5 h-2.5" /> perlu ditagih
          </span>
        )}
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
              <span className={cn('font-medium tabular-nums',
                line.tone === 'discount' ? 'text-emerald-600' : line.tone === 'addon' ? 'text-amber-600' : 'text-slate-900')}>
                {line.tone === 'discount' ? '-' : ''}{formatIDR(Math.abs(line.amount))}
              </span>
            </div>
          ))}
          <div className="flex justify-between gap-3 pt-1 border-t border-slate-200">
            <span className="font-bold text-slate-900">{money.isEstimate ? 'Estimasi Total' : 'Total Penagihan'}</span>
            <span className="font-bold text-blue-600 tabular-nums">{formatIDR(money.total)}</span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 italic">{money.note}</p>
      )}

      <PaymentSection entry={entry} payment={payment} state={state} actions={actions} />

      {/* Aksi jadwal: Ganti Jadwal / Buat Jadwal Baru di kiri, Lepaskan Slot di kanan (hanya jika belum bayar) */}
      {state !== 'cancelled' && (
        <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
          <Button
            size="sm"
            variant={isLate ? 'default' : 'outline'}
            className={cn(
              'flex-1 h-7 text-[11px] font-medium transition-colors shadow-none',
              isLate
                ? 'bg-blue-600 hover:bg-blue-700 text-white font-semibold'
                : 'text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
            )}
            onClick={() => actions.onEditSchedule(entry)}
          >
            <CalendarClock className={cn('w-3 h-3 mr-1.5', isLate ? 'text-white' : 'text-slate-400')} />
            {isLate ? 'Buat Jadwal Baru' : isUnscheduled(entry) ? 'Pilih Jadwal' : 'Ganti Jadwal'}
          </Button>

          {actions.onReleaseSlot && !payment?.hasEverPaid && state !== 'paid' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-[11px] font-medium text-red-600 hover:text-red-700 bg-white hover:bg-red-50/60 border-slate-200 hover:border-red-200 shadow-none transition-colors"
              onClick={() => actions.onReleaseSlot!(entry)}
              title="Lepaskan slot jadwal agar kuota tanggal ini kembali bebas"
            >
              <Trash2 className="w-3 h-3 mr-1" /> Lepaskan Slot
            </Button>
          )}

          {actions.onCancel && entry.isExtension && !payment?.hasEverPaid && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0 shrink-0 bg-white text-slate-400 hover:text-red-600 hover:border-red-200 shadow-none"
              title="Batalkan jadwal perpanjangan ini"
              onClick={() => actions.onCancel!(entry)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (isOnly) {
    return (
      <div className="rounded-lg border border-slate-300 shadow-sm bg-white overflow-hidden">
        <div className="px-3 py-2.5">{summary}</div>
        {details}
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border bg-white overflow-hidden transition-all', isOpen ? 'border-blue-400 shadow-sm ring-1 ring-blue-400/20' : 'border-slate-300 hover:border-slate-400 shadow-sm')}>
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
  entries, payments, submission, onEditSchedule, onCreateSchedule, onCreateInvoice, onMarkPaid, onCancel, onReleaseSlot,
}: {
  entries: AdScheduleEntry[];
  payments: Map<string, SchedulePayment>;
  submission: { questionCount?: number | null; distribution_type?: string | null; submission_status?: string | null; status?: string | null };
  onEditSchedule: (entry: AdScheduleEntry) => void;
  onCreateSchedule?: (isExtraAd: boolean) => void;
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
    const isSpamOrRejected =
      ['rejected', 'spam'].includes(submission.submission_status || '') ||
      ['rejected', 'spam'].includes(submission.status || '');

    if (isSpamOrRejected) {
      return (
        <p className="text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg px-3 py-2.5">
          Belum ada jadwal untuk order ini.
        </p>
      );
    }

    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-700">Jadwal belum ditentukan</p>
          <p className="text-[11px] text-slate-500">Order ini belum memiliki jadwal tayang iklan aktif.</p>
        </div>
        {onCreateSchedule && (
          <Button
            size="sm"
            className="h-8 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-2xs"
            onClick={() => onCreateSchedule(false)}
          >
            <CalendarPlus className="w-3.5 h-3.5 mr-1.5" /> Buat Jadwal Tayang
          </Button>
        )}
      </div>
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

/**
 * Skeleton loading untuk memuat kartu jadwal dengan animasi pulse halus.
 */
export function ScheduleCardSkeleton() {
  return (
    <div className="rounded-lg border border-slate-300 shadow-sm bg-white overflow-hidden animate-pulse">
      {/* Header Skeleton */}
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-3/5 bg-slate-200" />
          <Skeleton className="h-3.5 w-14 bg-slate-100" />
        </div>
        <Skeleton className="h-3 w-1/4 bg-slate-100" />
      </div>

      {/* Details Skeleton */}
      <div className="border-t border-slate-100 px-3 py-2.5 space-y-3 bg-slate-50/50">
        {/* Breakdown lines */}
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <Skeleton className="h-3 w-20 bg-slate-200" />
            <Skeleton className="h-3 w-16 bg-slate-200" />
          </div>
          <div className="flex justify-between items-center">
            <Skeleton className="h-3 w-28 bg-slate-200" />
            <Skeleton className="h-3 w-16 bg-slate-200" />
          </div>
          <div className="flex justify-between items-center">
            <Skeleton className="h-3 w-16 bg-slate-200" />
            <Skeleton className="h-3 w-14 bg-slate-200" />
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-slate-200">
            <Skeleton className="h-3.5 w-24 bg-slate-300" />
            <Skeleton className="h-4 w-20 bg-blue-200" />
          </div>
        </div>

        {/* Invoice List Section Skeleton */}
        <div className="space-y-2 pt-1 border-t border-slate-200">
          <div className="flex justify-between items-center">
            <Skeleton className="h-3 w-28 bg-slate-200" />
            <Skeleton className="h-3 w-20 bg-slate-100" />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 flex justify-between items-center">
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-3.5 w-40 bg-slate-200" />
              <Skeleton className="h-2.5 w-24 bg-slate-100" />
            </div>
            <div className="space-y-1 text-right">
              <Skeleton className="h-3.5 w-16 ml-auto bg-slate-200" />
              <Skeleton className="h-5 w-16 ml-auto rounded bg-emerald-100" />
            </div>
          </div>
        </div>

        {/* Footer Action Skeleton */}
        <div className="pt-1 border-t border-slate-200">
          <Skeleton className="h-7 w-full rounded bg-slate-200" />
        </div>
      </div>
    </div>
  );
}
