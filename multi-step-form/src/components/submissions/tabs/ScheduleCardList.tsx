import { useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CalendarPlus, Check, ChevronDown, Copy, CreditCard, ExternalLink,
  FileText, Sparkles, Trash2, Zap,
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { cn } from '@/lib/utils';
import type { AdScheduleEntry, ScheduleBilling, ScheduleInvoice } from '@/utils/supabase';
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

type CardState =
  | 'cancelled' | 'choose_schedule' | 'awaiting_invoice'
  | 'waiting_payment' | 'partially_paid' | 'paid';

/**
 * ⚠️ `isSettled`, BUKAN "ada yang pernah lunas".
 *
 * Pendahulunya memakai `payment.hasEverPaid` — satu invoice lunas sudah cukup
 * untuk mengumumkan "Lunas". Begitu satu jadwal boleh punya beberapa tagihan
 * itu jadi kebohongan uang: `76XKVW5P` dibayar Rp 1.470.750 lalu ditagih
 * Rp 61.050 lagi, dan kartunya tetap berkata lunas. `partially_paid` adalah
 * keadaan yang dulu tidak punya nama.
 */
function cardStateOf(entry: AdScheduleEntry, billing: ScheduleBilling | undefined): CardState {
  if (entry.reviewStatus === 'rejected' || entry.reviewStatus === 'spam' || entry.status === 'cancelled') {
    return 'cancelled';
  }
  if (isUnscheduled(entry)) {
    return 'choose_schedule';
  }
  if (billing?.isSettled) return 'paid';
  // Sebagian order dibayar DI LUAR SISTEM dan tidak pernah punya baris tagihan
  // (lihat memo payment-status-not-proof-of-payment). Untuk mereka status di
  // baris jadwalnya satu-satunya bukti yang ada.
  if (!billing?.invoices.length
      && (['paid', 'completed'].includes(entry.paymentStatus || '')
          || ['paid', 'completed'].includes(entry.status || ''))) {
    return 'paid';
  }
  if (billing && billing.paid > 0) return 'partially_paid';
  /**
   * ⚠️ "ADA BARIS TAGIHAN" BUKAN "ADA TAGIHAN HIDUP".
   *
   * Versi sebelumnya memakai `invoices.length`, dan barisnya tidak pernah
   * dihapus — sesudah peneliti menjadwalkan ulang, satu-satunya tagihan yang
   * tersisa sudah kedaluwarsa tapi kartunya tetap berkata "menunggu
   * pembayaran". Admin disuruh menunggu uang yang tidak mungkin datang: tidak
   * ada satu pun link yang masih bisa dibayar.
   *
   * Kartunya juga sudah menampilkan "Rp 0 ditagih" untuk keadaan itu — dua
   * pernyataan yang saling membantah di satu kartu yang sama.
   *
   * `openInvoice` (tagihan admin yang belum lunas, tidak mati, tidak tersusul,
   * tidak basi) menjawab pertanyaan yang sebenarnya. Yang lewat batas bayar
   * TETAP terhitung terbuka — itu piutang, bukan tagihan mati.
   */
  if (billing?.openInvoice) return 'waiting_payment';
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
function needsWork(e: AdScheduleEntry, b: ScheduleBilling | undefined): boolean {
  const state = cardStateOf(e, b);
  return state === 'choose_schedule' || state === 'awaiting_invoice'
      || state === 'waiting_payment' || state === 'partially_paid';
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
function pickDefaultOpen(entries: AdScheduleEntry[], billings: Map<string, ScheduleBilling>): string | null {
  if (entries.length <= 1) return entries[0]?.id ?? null;
  return entries.find((e) => needsWork(e, billings.get(e.id)))?.id ?? null;
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
  /** Menerima `entry`: pelunasan berlingkup SATU jadwal sejak sql/51. */
  onMarkPaid: ((entry: AdScheduleEntry) => void) | null;
  /** Batalkan pelunasan manual. Tombolnya hanya tampil kalau `billing.paymentChannel === 'MANUAL_VERIFIED'` — lihat gerbang di `unmarkScheduleAsPaid`. */
  onUnmarkPaid: ((entry: AdScheduleEntry) => void) | null;
  /**
   * Batalkan SATU tagihan yang belum dibayar. Berlingkup tagihan, bukan
   * jadwal: jadwalnya tetap berdiri dan slotnya tidak dilepas.
   */
  onCancelInvoice: ((inv: ScheduleInvoice) => void) | null;
  /**
   * "Batalkan Jadwal" — hanya untuk jadwal yang belum dibayar.
   *
   * Tanggalnya DIPERTAHANKAN sebagai riwayat sejak sql/62; yang membebaskan
   * kuota adalah statusnya ('cancelled'), bukan pengosongan tanggal.
   */
  onCancelSchedule: ((entry: AdScheduleEntry) => void) | null;
}

/** Satu baris tagihan di dalam daftar. */
function InvoiceRow({
  inv, index, total, entry, actions,
}: {
  inv: ScheduleInvoice;
  index: number;
  total: number;
  entry: AdScheduleEntry;
  actions: CardActions;
}) {
  const ymd = entry.startDate ? toWibYmd(new Date(entry.startDate)) : null;
  const isLate = !inv.isPaid && ymd ? isPaymentTooLateForDate(ymd) : false;
  const cutoff = ymd ? paymentCutoffInstant(ymd) : null;

  // Checkout yang ditinggalkan: baris `transactions` pending tanpa invoice.
  // Ia BUKAN tagihan — nol rupiah pernah ditagihkan — tapi tetap ditampilkan
  // supaya admin tahu peneliti sempat membuka halaman bayar.
  const isAbandoned = !inv.isPaid && !inv.isDead && inv.source === 'transaction';
  const isStruck = inv.isDead || inv.isSuperseded || inv.isStale || isAbandoned || isLate;
  const invoiceUrl = inv.paymentId ? `/invoices/${inv.paymentId}` : null;

  /**
   * ⚠️ DICORET ≠ TIDAK DITAGIHKAN. `isLate` diturunkan dari tanggal tayang di
   * KLIEN; `schedule_billing_summary` (sql/53) tidak tahu apa-apa soal itu dan
   * tetap menghitung tagihan pending sebagai piutang — dan itu benar, karena
   * admin memang masih menagihnya di luar sistem. Coretan di sini hanya
   * berarti "link bayar ini sudah tidak berguna untuk slot tersebut".
   *
   * Kalau kedua arti itu dicampur, kartu mencoret satu baris lalu tetap
   * menjumlahkannya di "belum masuk" — tampak seperti bug padahal keduanya
   * benar untuk pertanyaan masing-masing. Karena itu labelnya dieja lengkap.
   */
  const isBillable = !inv.isPaid && !inv.isDead && !inv.isSuperseded && !inv.isStale
    && inv.source === 'invoice';

  /**
   * ⚠️ CORETAN PADA NOMINAL BERARTI SATU HAL SAJA: ANGKA INI TIDAK IKUT
   * DIHITUNG. Jangan dipakai untuk "link-nya sudah mati" — itu pertanyaan
   * lain, dan mencampurnya membuat kartu mencoret Rp 1.440.000 lalu tetap
   * menjumlahkannya di "belum masuk" tepat di atasnya.
   */
  const countsTowardBilled = inv.isPaid || isBillable;

  /** Masih bisa dibayar lewat link-nya. */
  const canPay = isBillable && !isLate;

  /**
   * ⚠️ PEMBATALAN JUSTRU PALING DIBUTUHKAN PADA BARIS YANG DICORET.
   * Versi pertama fitur ini menyembunyikan SELURUH aksi saat `isStruck`, jadi
   * tagihan yang lewat batas bayar — persis yang ingin dibersihkan admin —
   * tidak punya tombolnya sama sekali. Syaratnya cuma: ia tagihan sungguhan
   * (dari `invoices`), belum dibayar, dan belum mati. Terlewat dan tersusul
   * TETAP boleh dibatalkan.
   */
  const canCancel = !inv.isPaid && !inv.isDead && inv.source === 'invoice' && !!inv.paymentId;

  const label =
    inv.isPaid ? null
    : inv.status.toLowerCase() === 'cancelled' ? 'Tagihan dibatalkan'
    : inv.isDead ? 'Kedaluwarsa'
    : inv.isSuperseded ? 'Tersusul tagihan baru'
    // Jadwalnya pindah sesudah tagihan ini terbit (sql/60). Tanggal LAMA-nya
    // disebut supaya admin bisa mencocokkan dengan tagihan yang terlanjur
    // dikirim ke peneliti — kalimat yang sama muncul di layar peneliti.
    : inv.isStale ? `Jadwal berubah — ditagihkan untuk ${
        inv.billedStartDate
          ? new Date(inv.billedStartDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
          : 'tanggal lain'}`
    : isAbandoned ? 'Checkout ditinggalkan'
    : isLate ? 'Batas bayar terlewat — masih dihitung piutang'
    : null;

  return (
    <div className={cn('p-2.5 flex items-start justify-between gap-3', isStruck && 'bg-slate-50/60')}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {total > 1 && (
            <span className="text-[10px] font-bold text-slate-400 tabular-nums shrink-0">#{index + 1}</span>
          )}
          {invoiceUrl && !isStruck ? (
            <a
              href={invoiceUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1 truncate"
              title="Buka halaman invoice"
            >
              <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="truncate">{inv.paymentId}</span>
              <ExternalLink className="w-2.5 h-2.5 text-blue-400 shrink-0" />
            </a>
          ) : (
            <span className={cn(
              'text-xs font-semibold inline-flex items-center gap-1 truncate',
              isStruck ? 'text-slate-400' : 'text-slate-700',
            )}>
              <FileText className={cn('w-3.5 h-3.5 shrink-0', isStruck ? 'text-slate-300' : 'text-slate-400')} />
              <span className={cn('truncate', isStruck && 'line-through opacity-70')}>{inv.paymentId}</span>
            </span>
          )}

          {inv.paymentUrl && !inv.isPaid && !isStruck && (
            <button
              type="button"
              onClick={() => copyToClipboard(inv.paymentUrl!, 'Link bayar berhasil disalin!')}
              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Salin link bayar"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap text-[10px]">
          {inv.isPaid && (
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 text-xs">
              <Check className="w-3.5 h-3.5" /> Lunas
            </span>
          )}
          {inv.isPaid && inv.paymentChannel === 'MANUAL_VERIFIED' && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded font-bold bg-amber-50 text-amber-800 border border-amber-200"
              title="Audit: ditandai lunas manual oleh admin, bukan dari gateway DOKU"
            >
              Tandai Lunas
            </span>
          )}
          {label && <span className="font-medium text-slate-500">{label}</span>}
          {!inv.isPaid && !isStruck && cutoff && (
            <span className="text-slate-500">
              Batas: <strong className="font-semibold text-slate-700">{formatWibShort(cutoff.toISOString())}</strong>
            </span>
          )}
          {inv.attempts > 1 && (
            <span className="text-slate-400" title="Percobaan bayar untuk tagihan ini">
              {inv.attempts} percobaan
            </span>
          )}
        </div>
      </div>

      <div className="text-right shrink-0 space-y-1">
        <div className={cn(
          'text-xs font-bold tabular-nums',
          !countsTowardBilled ? 'text-slate-400 line-through'
            : isStruck ? 'text-slate-500'
            : 'text-slate-900',
        )}>
          {formatIDR(inv.amount)}
        </div>

        {inv.isPaid && inv.paymentId && (
          <a
            href={`/invoices/${inv.paymentId}`} target="_blank" rel="noopener noreferrer"
            className="text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1"
          >
            Kuitansi <ExternalLink className="w-3 h-3" />
          </a>
        )}

        {(canPay || canCancel) && (
          <div className="flex flex-col items-end gap-1">
            {canPay && actions.onMarkPaid && (
              <Button
                size="sm"
                className="h-6 px-2 text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => actions.onMarkPaid!(entry)}
              >
                <Check className="w-3 h-3 mr-1" /> Tandai Lunas
              </Button>
            )}
            {canCancel && actions.onCancelInvoice && (
              <button
                type="button"
                /*
                  ⚠️ AKSI TIDAK IKUT DIREDUPKAN BERSAMA BARISNYA. Versi
                  pertama memakai `text-slate-400` — warna yang sama dengan
                  isi baris yang dicoret — sehingga tautannya terbaca sebagai
                  keterangan, bukan tombol, dan dilaporkan "tidak ada".
                */
                className="text-[10px] font-semibold text-red-600 hover:text-red-700 underline underline-offset-2 decoration-red-300 hover:decoration-red-600 transition-colors"
                onClick={() => actions.onCancelInvoice!(inv)}
              >
                Batalkan tagihan
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Tagihan & pembayaran untuk SATU jadwal — sebuah DAFTAR.
 *
 * ⚠️ Pendahulunya (`PaymentSection`) sengaja BUKAN daftar, dan komentarnya
 * menjelaskan kenapa: sebelum `schedule_id` ada, beberapa baris untuk satu
 * jadwal tidak bisa dibedakan dari percobaan bayar berulang. Task 11
 * memberikan penautan itu dan `sql/53` memisahkan keduanya di SQL, jadi
 * larangan tersebut sudah kedaluwarsa — dan dihapus bersama komponennya
 * supaya tidak terbaca sebagai aturan yang masih berlaku.
 */
function BillingSection({
  entry, billing, state, actions,
}: {
  entry: AdScheduleEntry;
  billing: ScheduleBilling | undefined;
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

  const invoices = billing?.invoices ?? [];
  const ymd = entry.startDate ? toWibYmd(new Date(entry.startDate)) : null;
  const isLate = state !== 'paid' && ymd ? isPaymentTooLateForDate(ymd) : false;

  // ⚠️ CABANG "BELUM ADA TAGIHAN" DIUKUR DARI DAFTAR YANG KOSONG, BUKAN DARI
  // KEADAAN KARTU. Sebagian order dibayar di luar sistem dan tidak pernah punya
  // baris tagihan sama sekali (lihat memo payment-status-not-proof-of-payment);
  // untuk mereka `cardStateOf` sudah mengembalikan 'paid' lewat status baris
  // jadwal, jadi mereka tidak pernah sampai ke ajakan "Terbitkan tagihan".
  if (invoices.length === 0) {
    if (state === 'paid') {
      return (
        <div className="space-y-2 pt-1 border-t border-slate-200">
          <SectionHeader count={0} />
          <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <Check className="w-3.5 h-3.5" /> Lunas
            </span>
            <span className="text-[10px] text-slate-400">tanpa catatan tagihan di sistem</span>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2 pt-1 border-t border-slate-200">
        <SectionHeader count={0} />
        <div className={cn(
          'rounded-lg border px-3 py-2.5 space-y-2',
          isLate ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60',
        )}>
          <p className={cn('text-[11px] leading-snug', isLate ? 'text-red-900' : 'text-amber-900')}>
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
                  onClick={() => actions.onMarkPaid!(entry)}
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

  const b = billing!;
  // Aturan SATU TAGIHAN TERBUKA PER JADWAL. Bukan kerapian: peneliti hanya
  // melihat tagihan TERAKHIR, jadi menerbitkan tagihan kedua selagi ada yang
  // menggantung akan menyembunyikan yang pertama dari orang yang harus
  // membayarnya. Penjaga keduanya ada di DB (`schedule_billing_summary`).
  const canTopUp = b.openInvoice === null;
  // Ada riwayat tagihan, tapi semuanya sudah mati dan nol rupiah masuk —
  // yang dibutuhkan tagihan PERTAMA yang sungguhan, bukan susulan.
  const needsFreshInvoice = state === 'awaiting_invoice';

  return (
    <div className="space-y-2 pt-1 border-t border-slate-200">
      <SectionHeader count={invoices.length} />

      {b.billed > 0 && (
        <div className="flex items-center justify-between gap-2 text-[11px] px-0.5">
          <span className="text-slate-500">
            <strong className="font-semibold text-slate-700 tabular-nums">{formatIDR(b.billed)}</strong> ditagih
          </span>
          {b.outstanding > 0 ? (
            <span className="font-semibold text-amber-700 tabular-nums">
              {formatIDR(b.outstanding)} belum masuk
            </span>
          ) : (
            <span className="font-semibold text-emerald-700">Lunas seluruhnya</span>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
        {invoices.map((inv, i) => (
          <InvoiceRow
            key={inv.paymentId ?? `${inv.createdAt}-${i}`}
            inv={inv}
            index={i}
            total={invoices.length}
            entry={entry}
            actions={actions}
          />
        ))}
      </div>

      {/*
        Semua barisnya mati dan tidak ada uang yang masuk. Tanpa kalimat ini
        admin cuma melihat daftar coretan lalu harus menyimpulkan sendiri
        bahwa gilirannya yang bertindak — dan tombolnya berbunyi "Tagih
        Susulan", padahal tidak ada tagihan pertama yang bisa disusuli.
      */}
      {needsFreshInvoice && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
          <p className="text-[11px] leading-snug text-amber-900">
            Tidak ada tagihan yang masih bisa dibayar
            {isLate ? '' : ' — terbitkan tagihan baru supaya peneliti bisa melanjutkan'}.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        {actions.onCreateInvoice && (
          <Button
            size="sm"
            variant={needsFreshInvoice ? 'default' : 'outline'}
            disabled={!canTopUp}
            title={canTopUp
              ? 'Terbitkan tagihan tambahan untuk jadwal ini'
              : 'Masih ada tagihan yang belum dibayar. Peneliti hanya melihat tagihan terakhir, jadi tagihan baru akan menyembunyikannya.'}
            className={cn(
              'h-7 text-[11px] disabled:opacity-50',
              needsFreshInvoice
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
            )}
            onClick={() => actions.onCreateInvoice(entry)}
          >
            <CreditCard className="w-3 h-3 mr-1.5" />
            {needsFreshInvoice ? 'Terbitkan Tagihan' : 'Tagih Susulan'}
          </Button>
        )}

        {/*
          ⚠️ Gerbangnya SENGAJA sempit. Undo hanya boleh muncul kalau
          `unmarkScheduleAsPaid()` punya sesuatu YANG PASTI bisa dibalikkan:
          baris `transactions` yang literal ditulis fungsi itu sendiri
          (`payment_channel === 'MANUAL_VERIFIED'`, sql/59). Pelunasan lewat
          gateway DOKU tidak pernah memakai nilai itu.
        */}
        {actions.onUnmarkPaid && b.paymentChannel === 'MANUAL_VERIFIED' && (
          <button
            type="button"
            className="text-[11px] font-medium text-slate-400 hover:text-red-600 hover:underline transition-colors"
            onClick={() => actions.onUnmarkPaid!(entry)}
          >
            Tandai belum lunas
          </button>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-bold text-slate-700 inline-flex items-center gap-1.5">
        <CreditCard className="w-3.5 h-3.5 text-slate-500" />
        Tagihan &amp; Pembayaran
      </span>
      {count > 1 && (
        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5 tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}

function ScheduleCard({
  entry, billing, submission, isOpen, isOnly, onToggle, actions,
}: {
  entry: AdScheduleEntry;
  billing: ScheduleBilling | undefined;
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
  const state = cardStateOf(entry, billing);
  const isKilat = entry.distributionType === 'kilat';
  const isBookedByUser = entry.slotBookedBy?.toLowerCase() === 'user' || entry.slotBookedBy?.toLowerCase() === 'customer';
  const actor = isBookedByUser ? 'Customer' : 'Admin';
  const ymd = entry.startDate ? toWibYmd(new Date(entry.startDate)) : null;
  const isLate = state !== 'paid' && state !== 'partially_paid' && ymd ? isPaymentTooLateForDate(ymd) : false;

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
        {/* Kode yang sama persis dengan yang dilihat & disalin peneliti (sql/51) —
            samakan dengan `EntryRow` di papan Schedule, jangan menyalin submissionId. */}
        <span className="inline-flex items-center gap-1">
          <span className="font-mono text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
            #{entry.bookingId}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(entry.bookingId, 'Booking ID disalin!');
            }}
            title="Salin Booking ID"
            aria-label="Salin Booking ID"
            className="p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Copy className="w-3 h-3" />
          </button>
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

      <BillingSection entry={entry} billing={billing} state={state} actions={actions} />

      {/* Aksi jadwal: Ganti Jadwal / Buat Jadwal Baru di kiri, Batalkan Jadwal di kanan (hanya jika belum bayar) */}
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

          {actions.onCancelSchedule && !billing?.paid && state !== 'paid' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-[11px] font-medium text-red-600 hover:text-red-700 bg-white hover:bg-red-50/60 border-slate-200 hover:border-red-200 shadow-none transition-colors"
              onClick={() => actions.onCancelSchedule!(entry)}
              title="Batalkan jadwal ini — kuota tanggalnya bebas kembali, tanggalnya tetap tercatat"
            >
              <Trash2 className="w-3 h-3 mr-1" /> Batalkan Jadwal
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
      {/* `<div role="button">`, BUKAN `<button>` — kartu ini butuh tombol salin
          Booking ID BERSARANG di dalam togglenya, dan tombol di dalam tombol
          tidak sah/tidak bisa diklik di HTML. Pola yang sama dengan `EntryRow`
          di papan Schedule. */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={isOpen}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50/70 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
      >
        {summary}
        <ChevronDown className={cn('w-4 h-4 shrink-0 mt-0.5 text-slate-400 transition-transform', isOpen && 'rotate-180')} />
      </div>
      {isOpen && details}
    </div>
  );
}

export function ScheduleCardList({
  entries, billings, submission, onEditSchedule, onCreateSchedule, onCreateInvoice, onMarkPaid, onUnmarkPaid, onCancelInvoice, onCancelSchedule,
}: {
  entries: AdScheduleEntry[];
  billings: Map<string, ScheduleBilling>;
  submission: { questionCount?: number | null; distribution_type?: string | null; submission_status?: string | null; status?: string | null };
  onEditSchedule: (entry: AdScheduleEntry) => void;
  onCreateSchedule?: (isExtraAd: boolean) => void;
  onCreateInvoice: (entry: AdScheduleEntry) => void;
  /**
   * Batalkan SATU tagihan yang belum dibayar — bukan jadwalnya.
   *
   * ⚠️ Jangan disamakan dengan `onCancelSchedule`. Yang ini berlingkup
   * TAGIHAN: jadwalnya tetap berdiri, slotnya tidak dilepas, dan tagihan lain
   * di jadwal yang sama tidak tersentuh. Ia ada karena tagihan yang salah
   * terbit sebelumnya tidak punya jalan keluar sama sekali — 194 invoice
   * `pending` menggantung di produksi saat fitur ini dibuat.
   */
  onCancelInvoice: ((inv: ScheduleInvoice) => void) | null;
  /**
   * null = tombolnya tidak boleh dirender di dalam kartu (order sudah lunas).
   *
   * Sejak sql/51 pelunasan berlingkup SATU jadwal lewat `markScheduleAsPaid()`,
   * jadi tombolnya tinggal di dalam kartu untuk SEMUA order — bukan lagi hanya
   * yang berjadwal satu. Peringatan "melunasi seluruh order" yang dulu berdiri
   * di luar kartu sudah dibongkar bersama sebabnya.
   */
  onMarkPaid: ((entry: AdScheduleEntry) => void) | null;
  /**
   * null = tombol "Tandai belum lunas" tidak boleh dirender.
   *
   * Kartunya sendiri menyempitkan lagi ke `billing.paymentChannel ===
   * 'MANUAL_VERIFIED'` — lihat komentar di `unmarkScheduleAsPaid()` kenapa
   * gerbang itu harus seketat itu.
   */
  onUnmarkPaid: ((entry: AdScheduleEntry) => void) | null;
  /**
   * "Hapus dari list" — melepas slot SATU jadwal yang batas bayarnya lewat.
   *
   * Berlaku semua ordinal, dan pembayarannya disaring per jadwal lewat
   * `releaseScheduleSlot` (utils/supabase.ts). Ini fondasi Task 13 Langkah 3;
   * yang tersisa di sana tinggal menukar penautan `entity_type`/`extend_id`
   * ke `schedule_id` dan mempertahankan tanggal alih-alih mengosongkannya.
   */
  onCancelSchedule: ((entry: AdScheduleEntry) => void) | null;
}) {
  const [openId, setOpenId] = useState<string | null>(() => pickDefaultOpen(entries, billings));
  const isOnly = entries.length === 1;

  const summary = useMemo(() => {
    const billed = entries.reduce((sum, e) => sum + e.totalCost, 0);
    const unpaid = entries.filter((e) => {
      const s = cardStateOf(e, billings.get(e.id));
      return s !== 'paid' && s !== 'cancelled';
    }).length;
    return { billed, unpaid };
  }, [entries, billings]);

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
          billing={billings.get(e.id)}
          submission={submission}
          isOnly={isOnly}
          isOpen={openId === e.id}
          onToggle={() => setOpenId((prev) => (prev === e.id ? null : e.id))}
          actions={{ onEditSchedule, onCreateInvoice, onMarkPaid, onUnmarkPaid, onCancelInvoice, onCancelSchedule }}
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
