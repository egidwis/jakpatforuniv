import { Fragment, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarPlus, Check, ChevronDown, Copy, CreditCard, ExternalLink,
  FileText, MoreHorizontal, Sparkles, Zap,
} from 'lucide-react';
import { Button } from '../../ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Skeleton } from '../../ui/skeleton';
import { cn } from '@/lib/utils';
import type { AdScheduleEntry, ScheduleBilling, ScheduleInvoice } from '@/utils/supabase';
import { formatIDR } from '@/utils/currency';
import { copyToClipboard } from '../types';
import { isPaymentTooLateForDate, paymentCutoffInstant, toWibYmd } from '@/utils/airing-window';
// Derivasi chip diimpor, TIDAK disalin. Papan Schedule dan drawer ini harus
// menamai keadaan yang sama dengan nama yang sama.
import { holdStateOf, isUnscheduled, formatWibShort, formatWibTime } from '@/pages/dashboard/schedule/scheduleModel';
import { orderTotalOf } from '@/utils/orderTotals';
import { deriveScheduleMoney } from '@/utils/scheduleMoney';
// Keadaan kartu, aksinya, dan definisi "terlambat" hidup di SATU modul —
// lihat `scheduleCardActions.ts` untuk kenapa ketiganya tidak boleh terpisah.
import {
  cardStateOf, planCardActions, isLateForSchedule,
  type CardState, type CardAction, type CardActionPlan,
} from './scheduleCardActions';

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
  /**
   * Lompat ke tab Review. Satu-satunya afordansi pada kartu yang ordernya
   * masih antre review — tab ini tidak boleh menawarkan aksi Fase ②, tapi
   * membiarkan admin buntu justru mendorongnya memakai tombol yang salah.
   */
  onOpenReview?: () => void;
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

        {/*
          ⚠️ "TANDAI LUNAS" DIBUANG DARI BARIS TAGIHAN, dan bukan karena
          kerapian. Tombolnya duduk di baris SATU TAGIHAN tapi memanggil
          `onMarkPaid(entry)` — berlingkup SELURUH JADWAL. Admin yang mengklik
          baris tagihan Rp 61.050 pada jadwal berisi dua tagihan sedang
          melunasi keduanya, dan tidak ada apa pun di layar yang mengatakannya.
          Aksi berlingkup jadwal hidup di `CardActionBar`, sekali per kartu,
          dengan dialog yang menyebut jadwal mana yang dilunasi.

          "Batalkan tagihan" TETAP di sini: ia satu-satunya aksi yang benar-benar
          berlingkup satu baris (`onCancelInvoice(inv)`).
        */}
        {canCancel && (
          <div className="flex flex-col items-end gap-1">
            {actions.onCancelInvoice && (
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
    /**
     * ⚠️ KARTU INI BERBICARA TENTANG JADWAL, BUKAN TENTANG ORDER.
     *
     * Kalimat "Order berstatus … — ubah status review di tab Review" dulu
     * dirender TIGA KALI untuk satu order: di banner tingkat tab, di sini, dan
     * di empty-state. Tiga salinan berarti tiga tempat untuk menyimpang, dan
     * pada order berjadwal banyak ia bahkan diulang sekali per kartu.
     *
     * Yang tersisa di sini hanya fakta yang benar-benar milik jadwal ini.
     * Sebabnya di tingkat order tetap diumumkan sekali, oleh banner tab.
     */
    const byOrder = ['spam', 'rejected', 'cancelled'].includes(entry.reviewStatus);
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-100/90 px-3 py-2.5 text-xs text-slate-600 space-y-1">
        <p className="font-semibold text-slate-700">Jadwal dibatalkan</p>
        <p className="text-[11px] text-slate-500 leading-snug">
          {byOrder
            ? 'Dinonaktifkan mengikuti status order.'
            : 'Kuota tanggal itu sudah dibebaskan. Review kuesioner tidak terpengaruh.'}
        </p>
      </div>
    );
  }

  // ⚠️ CALLOUT INI DULU MEMBAWA TOMBOLNYA SENDIRI ("Pilih jadwal tayang"),
  // sementara baris aksi di bawah kartu menampilkan "Pilih Jadwal" — dua tombol,
  // dua label, SATU handler, selalu tampil bersamaan. Kalimatnya tetap di sini
  // karena ia menjelaskan; tombolnya milik `CardActionBar`.
  if (state === 'awaiting_review') {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <p className="text-[11px] text-slate-700 leading-snug font-medium">
          Menunggu review kuesioner.
        </p>
        <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
          Jadwal &amp; tagihan belum bisa ditentukan sebelum Fase ① selesai.
        </p>
      </div>
    );
  }

  if (state === 'choose_schedule') {
    return (
      <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2.5">
        <p className="text-[11px] text-sky-900 leading-snug font-medium">
          Tanggal tayang belum ditentukan. Tentukan dulu sebelum tagihan bisa diterbitkan.
        </p>
      </div>
    );
  }

  if (state === 'hold_lapsed') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5">
        <p className="text-[11px] text-red-900 leading-snug font-medium">
          Batas bayar terlewat — tanggalnya harus diganti.
        </p>
        <p className="text-[11px] text-red-800/80 leading-snug mt-0.5">
          Tagihan yang sudah terbit tetap tercatat sebagai piutang, bukan dihapus.
        </p>
      </div>
    );
  }

  const invoices = billing?.invoices ?? [];
  // ⚠️ `isLate` DITERIMA, tidak dihitung ulang di sini. Dulu bagian ini punya
  // perhitungannya sendiri yang berbeda dari baris aksi di kartu yang SAMA
  // (yang satu mengecualikan `partially_paid`, yang satu tidak), jadi satu kartu
  // bisa mencoret tagihannya sambil tombolnya berkata tanggalnya masih hidup.
  const isLate = isLateForSchedule(entry, state);

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
          {/* Tombolnya SENGAJA tidak di sini. Dulu blok ini menumbuhkan "Buat
              Tagihan" + "Tandai Lunas" sendiri, di atas baris aksi yang juga
              punya tombolnya — itulah cara kondisi `waiting_payment` sampai
              menampilkan enam kontrol. Sekarang satu-satunya sumber aksi adalah
              `planCardActions`. */}
        </div>
      </div>
    );
  }

  const b = billing!;
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

      {/* ⚠️ NOL TOMBOL DI SINI, dan itu perubahan yang disengaja.
          Dulu baris ini memuat "Terbitkan Tagihan"/"Tagih Susulan" — kadang
          `disabled` dengan tooltip yang menjelaskan apa yang TIDAK bisa
          dilakukan — plus tautan "Tandai belum lunas". Ketiganya sekarang hidup
          di `CardActionBar`, yang secara struktural cuma bisa menampilkan satu
          tombol di luar menu ⋯. Aksi yang tidak berlaku DIHILANGKAN, bukan
          ditampilkan mati. */}
    </div>
  );
}

/**
 * Baris "Peneliti melihat" — kembaran fase dibuat terlihat.
 *
 * Tab drawer admin adalah kembaran satu-lawan-satu fase dashboard peneliti
 * (Review↔①, Reservasi Jadwal↔②, Page↔③). Baris ini menutup selisih yang paling
 * sering menggigit: admin bertindak tanpa tahu kalimat apa yang sedang dibaca
 * penelitinya, lalu keduanya menelepon satu sama lain dengan dua cerita.
 *
 * ⚠️ DITURUNKAN DARI KEADAAN YANG SAMA, BUKAN DISALIN KATA PER KATA dari
 * `translations.ts`. Kalau nanti sisi peneliti berubah kalimat, yang penting
 * baris ini tetap menyebut KEADAAN yang benar; menyalin string akan menyimpang
 * diam-diam dan justru memberi admin keyakinan palsu.
 */
function ResearcherSeesLine({
  state, isLate, billing,
}: {
  state: CardState;
  isLate: boolean;
  billing: ScheduleBilling | undefined;
}) {
  let text: string | null = null;

  if (state === 'awaiting_review') {
    text = 'Menunggu hasil review — tanggal tayang ditentukan setelah kuesionernya lolos review.';
  } else if (state === 'choose_schedule') {
    text = 'Menunggu jadwal ditentukan.';
  } else if (state === 'awaiting_invoice') {
    text = 'Tanggal tayang sudah dipesan, menunggu tagihan terbit.';
  } else if (state === 'hold_lapsed' || isLate) {
    text = 'Batas bayar terlewat — perlu tanggal tayang baru.';
  } else if (state === 'partially_paid' && billing) {
    // Sampai D4 mendarat, kartu penelitinya masih menyebut HARGA PENUH di sini.
    // Itu justru alasan baris ini paling berguna pada keadaan ini: admin dan
    // peneliti sedang memegang dua angka berbeda tanpa ada yang tahu.
    text = `Sudah bayar ${formatIDR(billing.paid)} · sisa ${formatIDR(billing.outstanding)}.`;
  } else if (state === 'waiting_payment') {
    text = 'Menunggu pembayaran.';
  }

  if (!text) return null;

  return (
    <p className="text-[11px] leading-snug text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5">
      <span className="font-semibold text-slate-600">Peneliti melihat:</span> «{text}»
    </p>
  );
}

/**
 * Satu aksi utama + menu `⋯`. Bentuknya mengikuti pola yang sudah disetujui di
 * tab Review, dan yang menentukan isinya `planCardActions` — bukan gerbang yang
 * ditulis ulang di JSX.
 */
function CardActionBar({
  plan, entry, actions,
}: {
  plan: CardActionPlan;
  entry: AdScheduleEntry;
  actions: CardActions;
}) {
  const run = (a: CardAction) => {
    switch (a.id) {
      case 'schedule':        return actions.onEditSchedule(entry);
      case 'invoice':
      case 'top_up':          return actions.onCreateInvoice(entry);
      case 'mark_paid':       return actions.onMarkPaid?.(entry);
      case 'unmark_paid':     return actions.onUnmarkPaid?.(entry);
      case 'cancel_schedule': return actions.onCancelSchedule?.(entry);
      case 'open_review':     return actions.onOpenReview?.();
    }
  };

  if (!plan.primary && plan.menu.length === 0) return null;

  return (
    <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
      {plan.primary ? (
        <Button
          size="sm"
          className="flex-1 h-7 text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-none"
          onClick={() => run(plan.primary!)}
        >
          {plan.primary.label}
        </Button>
      ) : (
        <span className="flex-1" />
      )}

      {plan.menu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              aria-label="Aksi lain"
              className="h-7 w-8 px-0 shrink-0 text-slate-500 hover:text-slate-900 bg-white border-slate-200 shadow-none"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[13rem]">
            {plan.menu.map((a, i) => {
              // Aksi merusak dipisahkan garis di dasar menu — bukan kosmetik:
              // jaraknya yang mencegah klik refleks pada baris terakhir.
              const startsDestructive = a.destructive && !plan.menu[i - 1]?.destructive;
              return (
                <Fragment key={a.id}>
                  {startsDestructive && i > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onClick={() => run(a)}
                    className={cn('text-xs', a.destructive && 'text-red-600 focus:text-red-700 focus:bg-red-50')}
                  >
                    {a.warns && <AlertTriangle className="w-3 h-3 mr-1.5 text-amber-500" />}
                    {a.label}
                  </DropdownMenuItem>
                </Fragment>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
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
  const state = cardStateOf(entry, billing, { holdLapsed: needsBilling(entry) });
  const isKilat = entry.distributionType === 'kilat';
  const isLate = isLateForSchedule(entry, state);

  /**
   * Siapa yang memesan slotnya — dan "tidak ada" adalah jawaban yang sah.
   *
   * ⚠️ DULU SETIAP NILAI SELAIN 'user' DIBACA SEBAGAI "Reserved by Admin",
   * termasuk NULL. 603 baris produksi ber-`slot_booked_by` NULL dan tak seorang
   * pun memesannya — kartunya mengarang pelaku untuk reservasi yang tidak
   * pernah terjadi, dan admin yang membacanya mengira rekan kerjanya sudah
   * menangani order itu.
   */
  /**
   * Aksi kartu ini — dihitung SEKALI, di satu tempat.
   *
   * Gerbang `can.*` sengaja tetap di sini, bukan pindah ke model: mereka soal
   * apakah pemanggil MENYEDIAKAN handler-nya (dan `unmark` soal apakah ada
   * sesuatu yang pasti bisa dibalikkan), sementara model menjawab pertanyaan
   * lain — aksi mana yang MASUK AKAL di keadaan ini.
   */
  const plan = planCardActions({
    state, entry, billing, isLate,
    can: {
      markPaid: !!actions.onMarkPaid,
      createInvoice: !!actions.onCreateInvoice,
      // Batalkan jadwal tidak pernah untuk jadwal yang uangnya sudah masuk —
      // itu bukan pembatalan melainkan refund, dan refund diurus di luar sistem.
      cancelSchedule: !!actions.onCancelSchedule && !billing?.paid && state !== 'paid',
      /**
       * ⚠️ Gerbangnya SENGAJA sempit. Undo hanya boleh muncul kalau
       * `unmarkScheduleAsPaid()` punya sesuatu YANG PASTI bisa dibalikkan:
       * baris `transactions` yang literal ditulis fungsi itu sendiri
       * (`payment_channel === 'MANUAL_VERIFIED'`, sql/59). Pelunasan lewat
       * gateway DOKU tidak pernah memakai nilai itu — dan `MANUAL_RECONCILED`
       * (sql/71) juga tidak, supaya rekonsiliasi warisan tak bisa dibalik dari
       * layar oleh admin yang tidak tahu asal-usulnya.
       */
      unmarkPaid: !!actions.onUnmarkPaid && billing?.paymentChannel === 'MANUAL_VERIFIED',
    },
  });

  const booker = entry.slotBookedBy?.toLowerCase();
  const slotLine = !booker
    ? { label: 'Slot belum dipesan', actor: null }
    : booker === 'user' || booker === 'customer'
      ? { label: 'Slot dipesan', actor: 'peneliti' }
      : { label: 'Slot dipesan', actor: 'admin' };

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
          {slotLine.label}
          {slotLine.actor && <> <strong className="font-bold text-slate-700">{slotLine.actor}</strong></>}
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

      {/* Baris "Peneliti melihat" — lihat `ResearcherSeesLine`. */}
      <ResearcherSeesLine state={state} isLate={isLate} billing={billing} />

      <CardActionBar plan={plan} entry={entry} actions={actions} />
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
  entries, billings, submission, onEditSchedule, onCreateSchedule, onCreateInvoice, onMarkPaid, onUnmarkPaid, onCancelInvoice, onCancelSchedule, onOpenReview,
}: {
  entries: AdScheduleEntry[];
  billings: Map<string, ScheduleBilling>;
  submission: { questionCount?: number | null; distribution_type?: string | null; submission_status?: string | null; status?: string | null };
  onEditSchedule: (entry: AdScheduleEntry) => void;
  onCreateSchedule?: (isExtraAd: boolean) => void;
  /** Lompat ke tab Review — lihat `CardActions.onOpenReview`. */
  onOpenReview?: () => void;
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
    const billed = orderTotalOf(entries);
    const unpaid = entries.filter((e) => {
      const s = cardStateOf(e, billings.get(e.id));
      return s !== 'paid' && s !== 'cancelled';
    }).length;
    return { billed, unpaid };
  }, [entries, billings]);

  if (entries.length === 0) {
    const isSpamOrRejected =
      ['rejected', 'spam', 'cancelled'].includes(submission.submission_status || '') ||
      ['rejected', 'spam', 'cancelled'].includes(submission.status || '');

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
          actions={{ onEditSchedule, onCreateInvoice, onMarkPaid, onUnmarkPaid, onCancelInvoice, onCancelSchedule, onOpenReview }}
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
