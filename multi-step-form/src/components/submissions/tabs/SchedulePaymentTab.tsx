import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import {
  fetchAdSchedules, fetchScheduleBilling, markScheduleAsPaid, unmarkScheduleAsPaid, cancelInvoice, cancelSchedule,
  type AdScheduleEntry, type ScheduleBilling, type ScheduleInvoice,
} from '@/utils/supabase';
import { formatIDR } from '@/utils/currency';
import { cn } from '@/lib/utils';
import type { SurveySubmission, PaymentState, ExistingPage } from '../types';
import { deriveLifecycle } from '../lifecycle';
import { ScheduleCardList, ScheduleCardSkeleton } from './ScheduleCardList';
import { cardStateOf, pickTargetSchedule } from './scheduleCardActions';
import { notifyScheduleChange } from '@/utils/notifyScheduleChange';

// ─────────────────────────────────────────────────────────────
// Tab: Jadwal & Bayar.
//
// SUBJEKNYA JADWAL, dan PEMBAYARAN ADA DI DALAM KARTU JADWAL — keduanya satu
// kesatuan, karena yang dibayar adalah jendela tayang tertentu, bukan "order".
//
// Yang tersisa di luar kartu tinggal dua, dan keduanya memang milik ORDER:
// jalur distribusi, dan tombol menambah jadwal.
//
// Aksi per jadwal (atur jadwal, buat tagihan) TIDAK dirender di sini — ia
// dilempar ke atas supaya drawer bisa menggantikan seluruh isinya dengan
// sub-tampilan. Sebelumnya keduanya melempar admin ke halaman penuh
// SchedulePaymentView, dan jadwal ke-2 dst. sama sekali tidak kebagian.
// ─────────────────────────────────────────────────────────────

// `paymentData`, `existingPage`, `onEditFormDetails`, dan `onConvertDistribution`
// tetap ada di prop-nya (pemanggil masih mengopernya) tapi tidak lagi dibaca di
// sini: ringkasan pembayaran kini hidup per-kartu di `ScheduleCardList`, dan
// aksi edit/konversi pindah ke tab Info.
export function SchedulePaymentTab({
  submission,
  lifecycle,
  onEditSchedule,
  onCreateInvoice,
  onCreateSchedule,
  onExtendCreated,
  onOpenReview,
  reloadKey = 0,
  initialSubView = null,
  onInitialSubViewConsumed,
}: {
  submission: SurveySubmission;
  paymentData: PaymentState;
  existingPage?: ExistingPage;
  isScheduled: boolean;
  lifecycle: ReturnType<typeof deriveLifecycle>;
  onEditSchedule: (entry: AdScheduleEntry) => void;
  onCreateInvoice: (entry: AdScheduleEntry) => void;
  /**
   * `isExtraAd` = status iklan tambahan ORDER ini, bukan pilihan admin. Jadwal
   * baru mewarisinya (flag-nya hidup di `survey_pages`, satu baris per order),
   * jadi kalender harus membaca kolam yang benar sejak awal.
   */
  onCreateSchedule: (isExtraAd: boolean) => void;
  onEditFormDetails: (submission: SurveySubmission) => void;
  onConvertDistribution: (submission: SurveySubmission, target: 'regular' | 'kilat') => Promise<void>;
  onExtendCreated: () => void;
  /**
   * Pindah ke tab Review. Dipakai kartu yang ordernya masih antre review:
   * tab ini menolak menawarkan aksi Fase ②, tapi jalan buntu justru mendorong
   * admin memakai tombol yang salah — riwayat repo ini menunjukkan begitulah
   * `spam` berubah jadi tong sampah.
   */
  onOpenReview?: () => void;
  /** Dinaikkan drawer setiap sub-tampilan selesai menulis. */
  reloadKey?: number;
  /** Niat dari pemanggil luar; diresolusi di sini karena jadwalnya ada di sini. */
  initialSubView?: 'schedule' | 'payment' | null;
  onInitialSubViewConsumed?: () => void;
}) {
  const [schedules, setSchedules] = useState<AdScheduleEntry[]>([]);
  const [billings, setBillings] = useState<Map<string, ScheduleBilling>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [localReloadKey, setLocalReloadKey] = useState(0);

  const submissionId = submission.id;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const [rows, bill] = await Promise.all([
          fetchAdSchedules(submissionId),
          fetchScheduleBilling(submissionId),
        ]);
        if (!cancelled) { setSchedules(rows); setBillings(bill); }
      } catch (e) {
        console.error('Gagal memuat jadwal order:', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [submissionId, localReloadKey, reloadKey]);

  const reload = useCallback(() => setLocalReloadKey((k) => k + 1), []);

  /**
   * "Reserve Slot" / "Buat tagihan" dari luar drawer hanya menyebut ORDER-nya,
   * bukan jadwal mana — jadwalnya baru diketahui setelah daftar termuat. Jadwal
   * pertama yang dipilih; order tanpa jadwal sama sekali langsung dibawa ke
   * pembuatan jadwal baru.
   */
  useEffect(() => {
    if (!initialSubView || isLoading) return;
    // Sasarannya diturunkan dengan aturan yang SAMA dengan kartu yang otomatis
    // terbuka — lihat `pickTargetSchedule`. Sebelum ini keduanya bisa menunjuk
    // jadwal yang berbeda dalam satu klik.
    const target = pickTargetSchedule(schedules, (e) =>
      cardStateOf(e, billings.get(e.id)));
    if (!target) {
      if (initialSubView === 'schedule') onCreateSchedule(false);
    } else if (initialSubView === 'payment') {
      onCreateInvoice(target);
    } else {
      onEditSchedule(target);
    }
    onInitialSubViewConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubView, isLoading, schedules, billings]);


  /**
   * "Hapus dari list" — lepaskan slot jadwal yang batas bayarnya sudah lewat.
   *
   * Ini pasangan dari "Jadwalkan ulang", dan admin memilih salah satunya
   * SESUDAH menagih peneliti di luar sistem. Tidak ada yang melepas slot ini
   * selain admin: sejak `utils/slotHold.ts`, hanya reservasi mandiri
   * (`slot_booked_by = 'user'`) yang lepas karena waktu.
   *
   * Efeknya di layar: tanggalnya kosong → `isUnscheduled()` true → baris keluar
   * dari antrean "perlu ditagih" dan pindah ke pil "belum dijadwalkan", lalu
   * `occupiesSlot()` false → kuota hari itu bebas. Ordernya sendiri tetap utuh
   * dan bisa dijadwalkan lagi kapan saja.
   */
  const handleCancelSchedule = useCallback(async (entry: AdScheduleEntry) => {
    const when = entry.startDate
      ? new Date(entry.startDate).toLocaleDateString('id-ID', {
          day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
        })
      : 'tanggal ini';
    setPendingConfirm({
      title: `Batalkan jadwal #${entry.bookingId}?`,
      highlight: when,
      lines: [
        'Kuota hari itu langsung bebas dijual lagi, dan tagihan yang masih menggantung untuk jadwal ini ikut dimatikan.',
        'Tanggalnya TETAP tercatat sebagai riwayat — jadi nanti masih bisa dijawab "jadwal mana yang dibatalkan, untuk tanggal apa".',
        'Ordernya tidak dihapus dan bisa dijadwalkan ulang kapan saja.',
        'Penelitinya akan menerima email berisi tanggal yang dibatalkan, dan bahwa kuesionernya tetap lolos review.',
      ],
      confirmLabel: 'Ya, Batalkan Jadwal',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await cancelSchedule(entry);
          toast.success('Jadwal dibatalkan. Kuota tanggalnya sudah bebas.');

          /*
            Kabari penelitinya. Sampai sekarang pembatalan jadwal oleh tim tidak
            mengirim apa pun — orangnya baru tahu kalau kebetulan membuka
            dashboard, dan yang ia temukan di sana (sebelum Track B) malah
            berbunyi slotnya "dilepas otomatis".

            ⚠️ Tidak di-`await` dan di luar jalur gagal: emailnya tidak boleh
            menahan layar, dan kegagalannya tidak boleh membuat pembatalan yang
            SUDAH mendarat terbaca seperti gagal. `notifyScheduleChange` tidak
            pernah melempar. Endpointnya membaca ulang cerminnya sendiri dan
            menolak mengirim kalau yang terjadi ternyata bukan pembatalan jadwal
            (mis. ordernya yang ditolak — itu sudah punya emailnya sendiri).
          */
          void notifyScheduleChange({ scheduleId: entry.id, event: 'cancelled' });

          reload();
          onExtendCreated();
        } catch (err: any) {
          toast.error(err?.message || 'Gagal membatalkan jadwal');
        }
      },
    });
  }, [reload, onExtendCreated]);

  // Pelunasan manual berlingkup SATU jadwal sejak sql/51 (`schedule_id`), jadi
  // tombolnya tinggal di dalam kartu untuk SEMUA order — tidak lagi hanya yang
  // berjadwal satu, dan tidak lagi perlu peringatan cakupan di luar kartu.
  const isSingleSchedule = schedules.length === 1;

  /**
   * Jadwal yang sedang menunggu konfirmasi "Tandai Lunas".
   *
   * ⚠️ Disimpan sebagai ENTRY, bukan boolean. Dialognya menyebut jadwal mana
   * yang akan dilunasi, dan yang dikirim ke `markScheduleAsPaid()` adalah entry
   * inilah — bukan `schedules[0]`. Footgun uang: kalau ini kembali jadi boolean,
   * admin mengklik kartu #2 dan yang lunas adalah #1.
   */
  const [pendingPaid, setPendingPaid] = useState<AdScheduleEntry | null>(null);

  /**
   * Konfirmasi untuk aksi merusak — menggantikan `confirm()` mentah.
   *
   * ⚠️ AKSI PALING MERUSAK DULU PUNYA KONFIRMASI PALING LEMAH. "Batalkan
   * Jadwal" dan "Batalkan Tagihan" memakai `confirm()` bawaan browser — tanpa
   * hierarki, tanpa nominal yang menonjol, dan di sebagian browser bisa
   * dibungkam permanen oleh centang "jangan tampilkan lagi" — sementara
   * "Tandai Lunas", yang tidak merusak apa pun, mendapat dialog terkaya.
   * Ketimpangan itu yang dibalik di sini.
   */
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    /** Baris penjelas; yang pertama paling penting. */
    lines: string[];
    /** Nominal/tanggal yang dipertaruhkan — dialog aksi uang WAJIB menyebutnya. */
    highlight?: string;
    confirmLabel: string;
    tone: 'danger' | 'neutral';
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const handleMarkPaid = useCallback(async (entry: AdScheduleEntry) => {
    try {
      const touched = await markScheduleAsPaid(entry);
      // Nol tagihan tersentuh itu SAH — order yang dibayar di luar sistem tidak
      // punya catatan tagihan sama sekali. Yang tidak boleh adalah menyembunyikannya:
      // admin perlu tahu bahwa yang berubah cuma status jadwalnya, supaya ia tidak
      // mencari kuitansi yang memang tidak akan pernah ada.
      if (touched.invoices === 0 && touched.transactions === 0) {
        toast.success(
          `Jadwal #${entry.bookingId} ditandai lunas — tanpa catatan tagihan yang ikut ditandai.`
        );
      } else {
        toast.success(`Jadwal #${entry.bookingId} ditandai lunas.`);
      }
      setPendingPaid(null);
      reload();
      onExtendCreated();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menandai lunas');
    }
  }, [reload, onExtendCreated]);

  /**
   * Batalkan pelunasan manual. Tombolnya di kartu sudah digerbang ke
   * `payment.paymentChannel === 'MANUAL_VERIFIED'` (lihat `ScheduleCardList`),
   * jadi konfirmasi teks di sini boleh sesederhana ini — tidak ada baris yang
   * benar-benar dibayar lewat DOKU yang bisa lolos ke jalur ini.
   */
  const handleUnmarkPaid = useCallback(async (entry: AdScheduleEntry) => {
    setPendingConfirm({
      title: `Batalkan status lunas jadwal #${entry.bookingId}?`,
      lines: [
        'Tagihan jadwal ini kembali jadi "menunggu bayar".',
        'Ini hanya membalik pelunasan yang ditandai MANUAL — bukan pembayaran lewat DOKU, dan bukan rekonsiliasi warisan (kanal MANUAL_RECONCILED, sql/71).',
      ],
      confirmLabel: 'Ya, Batalkan Status Lunas',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const touched = await unmarkScheduleAsPaid(entry);
          if (touched.invoices === 0 && touched.transactions === 0) {
            toast.success(`Jadwal #${entry.bookingId} kembali "menunggu bayar" — tanpa catatan tagihan yang ikut dibalik.`);
          } else {
            toast.success(`Jadwal #${entry.bookingId} kembali "menunggu bayar".`);
          }
          reload();
          onExtendCreated();
        } catch (err: any) {
          toast.error(err?.message || 'Gagal membatalkan status lunas');
        }
      },
    });
  }, [reload, onExtendCreated]);

  /**
   * Batalkan SATU tagihan yang belum dibayar.
   *
   * ⚠️ BUKAN pembatalan jadwal, dan bukan refund. Jadwalnya tetap berdiri,
   * slotnya tidak dilepas, dan tagihan lain di jadwal yang sama tidak
   * tersentuh. Tagihan lunas tidak pernah sampai ke sini — tombolnya digerbang
   * di kartu, dan `cancelInvoice()` mengulang syarat itu di DB.
   *
   * Nilai kembaliannya DIPERIKSA. `.update()` tanpa `.select()` tidak melempar
   * error saat RLS menyaring hasilnya jadi nol baris; itu persis cara "Tandai
   * Lunas" gagal diam-diam berbulan-bulan sebelum sql/59. Nol baris di sini
   * berarti tagihannya sudah berubah status di tab lain — bukan sukses.
   */
  const handleCancelInvoice = useCallback(async (inv: ScheduleInvoice) => {
    if (!inv.paymentId) return;
    const paymentId = inv.paymentId;
    setPendingConfirm({
      title: 'Batalkan tagihan ini?',
      highlight: formatIDR(inv.amount),
      lines: [
        'Nominal itu berhenti dihitung sebagai piutang, dan jadwalnya bisa ditagih ulang.',
        'Jadwal serta slotnya TIDAK dibatalkan — ini berlingkup tagihan saja.',
        `Link bayar ${paymentId} yang sudah terlanjur dikirim masih bisa dibayar dari sisi bank. Kalau uangnya sungguh masuk, tagihan ini kembali jadi lunas.`,
      ],
      confirmLabel: 'Ya, Batalkan Tagihan',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const changed = await cancelInvoice(paymentId);
          if (changed === 0) {
            toast.warning('Tidak ada yang berubah — tagihan ini mungkin sudah dibayar atau dibatalkan.');
          } else {
            toast.success(`Tagihan ${paymentId} dibatalkan.`);
          }
          reload();
          onExtendCreated();
        } catch (err: any) {
          toast.error(err?.message || 'Gagal membatalkan tagihan');
        }
      },
    });
  }, [reload, onExtendCreated]);

  /**
   * "Jadwal Iklan Baru" — memesan jendela tayang BERIKUTNYA untuk order yang sama.
   *
   * ⚠️ PAGAR `!existingPage` SENGAJA TIDAK ADA DI SINI. Sampai Phase 3 syaratnya
   * berbunyi `canBuildPage && existingPage` — dan itu BUG, bukan kebijakan
   * (dikonfirmasi pemilik produk 2026-08-07). Punya halaman iklan tidak pernah
   * jadi syarat memesan jadwal; syaratnya cuma jadwal itu tidak tumpang tindih,
   * dan itu sudah ditegakkan trg_submission_no_overlap (sql/38) di DB. Selama
   * pagar itu berdiri, sumbu tayang dipagari sumbu halaman — kopling yang justru
   * jadi alasan Phase 2 ada.
   *
   * ⚠️ KILAT DITUTUP, DAN ALASANNYA DITULIS DI SINI SUPAYA TIDAK IKUT DICABUT.
   * Dulu order Kilat terhalang dua kali tanpa sengaja: oleh `!existingPage`
   * (Kilat tidak pernah punya baris survey_pages — guard ensure_survey_page(),
   * sql/42) dan oleh pembungkus `!isKilat` di PageTab. Keduanya hilang saat aksi
   * ini pindah ke tab Jadwal & Bayar, jadi pagarnya harus eksplisit.
   *
   * Ini bukan sekadar aturan produk. Formulir jadwal baru TIDAK MENGENAL Kilat
   * sama sekali — harganya `calculateAdCostPerDay(questionCount) × durasi`, rumus
   * regular. Untuk Kilat itu berarti add-on Rp 250.000 tidak tertagih DAN base
   * rate dikali durasi yang tidak punya arti (Kilat selesai dalam ~2 jam).
   * Membuka ini butuh formulir itu mengenal jalur distribusi lebih dulu: bukan
   * cuma rumus harga, tapi pemilih gelombang alih-alih rentang hari.
   */
  // `cancelled` ikut sejak sql/69. Sebelumnya nilai itu praktis tak terlihat
  // (2 baris, disaring habis dari dashboard peneliti), jadi lubangnya tak
  // pernah terbuka; begitu pembatalan jadi jalur resmi, menambahkan jadwal ke
  // order yang sudah dihentikan berhenti jadi hal mustahil.
  const isSpamOrRejected =
    ['rejected', 'spam', 'cancelled'].includes(submission.submission_status || '') ||
    ['rejected', 'spam', 'cancelled'].includes(submission.status || '');

  /**
   * ⚠️ `in_review` IKUT DIGERBANG (C7) — dan ini lubang yang TERPISAH dari
   * `cardStateOf`.
   *
   * Tombol "Jadwal Iklan Baru" dirender oleh tab, bukan oleh kartu, jadi ia
   * punya gerbangnya sendiri. Sebelum ini gerbang itu menyaring
   * `spam`/`rejected`/`cancelled` tapi TIDAK `in_review`, sehingga order yang
   * masih antre review — asal sudah punya satu jadwal — tetap menawarkan
   * penambahan jadwal kedua. Memperbaiki `cardStateOf` saja tidak menutupnya:
   * sumbernya berbeda.
   *
   * Sama seperti kartunya: sebuah tab tidak boleh menawarkan aksi milik fase
   * yang belum selesai.
   */
  const isAwaitingReview =
    ['in_review', 'pending'].includes(submission.submission_status || '') ||
    ['in_review', 'pending'].includes(submission.status || '');

  const canAddSchedule =
    submission.distribution_type !== 'kilat' &&
    !isSpamOrRejected &&
    !isAwaitingReview &&
    schedules.length > 0;

  return (
    <>
      <DetailSheetSection>
        {isSpamOrRejected && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
            <span className="leading-relaxed">
              <strong>Order berstatus {
                submission.submission_status === 'spam' || submission.status === 'spam' ? 'Tidak Valid'
                  : submission.submission_status === 'cancelled' || submission.status === 'cancelled' ? 'Dibatalkan'
                    : 'Menunggu Perbaikan'
              }.</strong>{' '}
              Jadwal dinonaktifkan. Silakan ubah status review menjadi <strong>Approved</strong> di tab Review jika ingin menjadwalkan kembali order ini.
            </span>
          </div>
        )}

        {isLoading ? (
          <ScheduleCardSkeleton />
        ) : (
          <ScheduleCardList
            entries={schedules}
            billings={billings}
            submission={submission}
            onEditSchedule={onEditSchedule}
            onCreateSchedule={onCreateSchedule}
            onCreateInvoice={onCreateInvoice}
            onMarkPaid={lifecycle.isPaid ? null : (entry) => setPendingPaid(entry)}
            onUnmarkPaid={(entry) => void handleUnmarkPaid(entry)}
            onCancelInvoice={(inv) => void handleCancelInvoice(inv)}
            onCancelSchedule={(entry) => void handleCancelSchedule(entry)}
            onOpenReview={onOpenReview}
          />
        )}

        {canAddSchedule && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center h-8 text-xs font-medium text-violet-600 hover:text-violet-700 border-violet-200 hover:border-violet-300 bg-white hover:bg-violet-50"
            onClick={() => onCreateSchedule(schedules[0]?.isExtraAd ?? false)}
          >
            <CalendarPlus className="w-3.5 h-3.5 mr-1.5" /> Jadwal Iklan Baru
          </Button>
        )}

        {/* Peringatan "tombol ini melunasi seluruh order" DIBONGKAR bersama
            sebabnya (sql/51): pelunasan kini per `schedule_id`, jadi tombol di
            dalam kartu sudah jujur untuk order berjadwal banyak sekalipun.

            Order tanpa satu pun jadwal tetap TIDAK diberi jalan masuk ke sini —
            itu persis "pembayaran yatim" yang Task 10 ada untuk menutup, dan
            sekarang tertutup secara struktural: tidak ada kartu, tidak ada
            tombol. */}
      </DetailSheetSection>

      <Dialog open={!!pendingPaid} onOpenChange={(open) => { if (!open) setPendingPaid(null); }}>
        <DialogContent
          className="sm:max-w-[360px] p-6 text-center"
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <DialogHeader className="space-y-1 text-center sm:text-center">
            <DialogTitle className="text-base font-bold text-gray-900 leading-snug">
              Tandai Jadwal Iklan {pendingPaid?.ordinal} Lunas?
            </DialogTitle>
            <DialogDescription className="text-xs text-amber-600 font-semibold leading-relaxed">
              Pastikan dana transfer manual benar-benar sudah diterima.
            </DialogDescription>
          </DialogHeader>

          {/* Booking ID dipajang eksplisit: dialog yang cuma bilang "jadwal ini"
              tidak bisa diadu dengan bukti transfer yang ada di tangan admin. */}
          <div className="text-[11px] text-gray-500 bg-slate-50/80 border border-slate-100 rounded-lg p-3.5 leading-relaxed space-y-1.5">
            <p>
              Yang dilunasi hanya tagihan{' '}
              <span className="font-mono font-semibold text-gray-700">#{pendingPaid?.bookingId}</span>
              {!isSingleSchedule && <> — jadwal lain pada order ini <span className="font-semibold text-gray-700">tidak ikut berubah</span></>}.
            </p>
            {pendingPaid && pendingPaid.totalCost > 0 && (
              <p className="font-semibold text-gray-700">{formatIDR(pendingPaid.totalCost)}</p>
            )}
          </div>

          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => setPendingPaid(null)}
              className="text-xs font-semibold h-9 px-5 text-gray-600 border-gray-200 hover:bg-gray-50"
            >
              Batal
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-9 px-5"
              onClick={() => { if (pendingPaid) void handleMarkPaid(pendingPaid); }}
            >
              Ya, Tandai Lunas
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/*
        Satu dialog untuk SEMUA aksi merusak di tab ini. Bentuknya sengaja
        sejajar dengan dialog "Tandai Lunas" di atas — hierarki judul yang sama,
        nominal yang sama menonjolnya — supaya beratnya sebuah aksi terbaca dari
        konsekuensinya, bukan dari kebetulan komponen mana yang dipakai.
      */}
      <Dialog open={!!pendingConfirm} onOpenChange={(open) => { if (!open) setPendingConfirm(null); }}>
        <DialogContent className="sm:max-w-[26rem] p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-900">
              {pendingConfirm?.title}
            </DialogTitle>
          </DialogHeader>

          {pendingConfirm?.highlight && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-center">
              <p className="text-sm font-bold text-slate-800">{pendingConfirm.highlight}</p>
            </div>
          )}

          <div className="space-y-1.5">
            {pendingConfirm?.lines.map((line, i) => (
              <p key={i} className={cn('text-xs leading-relaxed', i === 0 ? 'text-slate-700 font-medium' : 'text-slate-500')}>
                {line}
              </p>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => setPendingConfirm(null)}
              className="text-xs font-semibold h-9 px-5 text-gray-600 border-gray-200 hover:bg-gray-50"
            >
              Batal
            </Button>
            <Button
              className={cn(
                'text-xs font-semibold h-9 px-5 text-white',
                pendingConfirm?.tone === 'danger'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700',
              )}
              onClick={() => {
                const pending = pendingConfirm;
                setPendingConfirm(null);
                void pending?.onConfirm();
              }}
            >
              {pendingConfirm?.confirmLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
