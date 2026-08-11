import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, PenLine, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import {
  fetchAdSchedules, fetchSchedulePayments, releaseScheduleSlot, supabase,
  type AdScheduleEntry, type SchedulePayment,
} from '@/utils/supabase';
import type { SurveySubmission, PaymentState, ExistingPage } from '../types';
import { deriveLifecycle } from '../lifecycle';
import { ScheduleCardList } from './ScheduleCardList';
import { DistributionSection } from './DistributionSection';

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

export function SchedulePaymentTab({
  submission,
  paymentData,
  existingPage,
  lifecycle,
  onEditSchedule,
  onCreateInvoice,
  onCreateSchedule,
  onPaymentStatusChange,
  onEditFormDetails,
  onConvertDistribution,
  onExtendCreated,
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
  onPaymentStatusChange: (submissionId: string, newStatus: string) => void;
  onEditFormDetails: (submission: SurveySubmission) => void;
  onConvertDistribution: (submission: SurveySubmission, target: 'regular' | 'kilat') => Promise<void>;
  onExtendCreated: () => void;
  /** Dinaikkan drawer setiap sub-tampilan selesai menulis. */
  reloadKey?: number;
  /** Niat dari pemanggil luar; diresolusi di sini karena jadwalnya ada di sini. */
  initialSubView?: 'schedule' | 'payment' | null;
  onInitialSubViewConsumed?: () => void;
}) {
  const [isConfirmPaymentOpen, setIsConfirmPaymentOpen] = useState(false);
  const [schedules, setSchedules] = useState<AdScheduleEntry[]>([]);
  const [payments, setPayments] = useState<Map<string, SchedulePayment>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [localReloadKey, setLocalReloadKey] = useState(0);

  const submissionId = submission.id;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const rows = await fetchAdSchedules(submissionId);
        const pay = await fetchSchedulePayments(submissionId, rows);
        if (!cancelled) { setSchedules(rows); setPayments(pay); }
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
    const target = schedules[0];
    if (!target) {
      if (initialSubView === 'schedule') onCreateSchedule(false);
    } else if (initialSubView === 'payment') {
      onCreateInvoice(target);
    } else {
      onEditSchedule(target);
    }
    onInitialSubViewConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubView, isLoading, schedules]);

  /**
   * Batalkan jadwal perpanjangan.
   *
   * ⚠️ SENGAJA SAMA PERSIS dengan tombol lama di ExtendSection — status jadi
   * `cancelled`, `payment_status` jadi `failed`, tidak lebih. Ia TIDAK
   * melewatkan transaksi pending jadi `expired` dan TIDAK melepas
   * `slot_booked_by`; keduanya memang belum pernah dilakukan. Memperbaikinya di
   * rilis ini berarti menyelundupkan kemampuan baru ke dalam pemindahan
   * permukaan — versi benarnya adalah Task 13 Langkah 3.
   */
  const handleCancelSchedule = useCallback(async (entry: AdScheduleEntry) => {
    if (!confirm('Yakin ingin membatalkan jadwal iklan ini?')) return;
    try {
      const { error } = await supabase
        .from('form_submissions_extend')
        .update({ submission_status: 'cancelled', payment_status: 'failed' })
        .eq('id', entry.sourceId);
      if (error) throw error;
      toast.success('Jadwal iklan dibatalkan');
      reload();
      onExtendCreated();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal membatalkan jadwal');
    }
  }, [reload, onExtendCreated]);

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
  const handleReleaseSlot = useCallback(async (entry: AdScheduleEntry) => {
    const when = entry.startDate
      ? new Date(entry.startDate).toLocaleDateString('id-ID', {
          day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
        })
      : 'tanggal ini';
    const ok = confirm(
      `Lepaskan slot ${when}?\n\n` +
      'Jadwalnya dikosongkan dan kuota hari itu kembali bisa dijual. ' +
      'Ordernya TIDAK dihapus — ia pindah ke daftar "belum dijadwalkan" dan ' +
      'bisa dijadwalkan lagi kapan saja.'
    );
    if (!ok) return;
    try {
      await releaseScheduleSlot(entry);
      toast.success('Slot dilepas. Order pindah ke "belum dijadwalkan".');
      reload();
      onExtendCreated();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal melepas slot');
    }
  }, [reload, onExtendCreated]);

  // ⚠️ `updatePaymentStatus` masih melunasi SELURUH invoice order (menyaring
  // `form_submission_id` saja). Untuk order berjadwal SATU itu tidak berbeda —
  // "semua tagihan order" persis sama dengan "tagihan jadwal ini" — jadi
  // tombolnya boleh masuk kartu. Untuk order berjadwal banyak ia akan berbohong,
  // jadi tombolnya pindah ke luar beserta peringatan cakupannya. Penyempitan ke
  // `schedule_id` ada di Task 11.
  const isSingleSchedule = schedules.length === 1;
  const canMarkPaidInCard = isSingleSchedule && !lifecycle.isPaid;

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
  const canAddSchedule = submission.distribution_type !== 'kilat' && lifecycle.canBuildPage;

  return (
    <>
      <DetailSheetSection
        title="Jadwal"
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-gray-500 hover:text-blue-600"
            onClick={() => onEditFormDetails(submission)}
          >
            <PenLine className="w-3 h-3 mr-1" /> Edit form
          </Button>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          </div>
        ) : (
          <ScheduleCardList
            entries={schedules}
            payments={payments}
            submission={submission}
            onEditSchedule={onEditSchedule}
            onCreateInvoice={onCreateInvoice}
            onMarkPaid={canMarkPaidInCard ? () => setIsConfirmPaymentOpen(true) : null}
            onCancel={(entry) => void handleCancelSchedule(entry)}
            onReleaseSlot={(entry) => void handleReleaseSlot(entry)}
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

        {!isSingleSchedule && !lifecycle.isPaid && schedules.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 space-y-2">
            <p className="text-[11px] text-amber-900 leading-snug">
              Order ini punya <strong>{schedules.length} jadwal</strong>. Tombol di bawah melunasi
              <strong> seluruh</strong> tagihan order sekaligus — belum bisa per jadwal, jadi ia
              sengaja tidak ditaruh di dalam kartu.
            </p>
            <Button
              size="sm"
              className="w-full h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setIsConfirmPaymentOpen(true)}
            >
              <Check className="w-3.5 h-3.5 mr-1.5" /> Tandai seluruh order lunas
            </Button>
          </div>
        )}

        {/* Order tanpa satu pun jadwal tetap butuh jalan masuk ke Mark as Paid —
            tapi itu persis "pembayaran yatim" yang Task 10 ada untuk menutup,
            jadi tidak diberi jalan pintas baru di sini. */}
      </DetailSheetSection>

      <DistributionSection
        submission={submission}
        paymentData={paymentData}
        existingPage={existingPage}
        lifecycle={lifecycle}
        onConvertDistribution={onConvertDistribution}
      />

      <Dialog open={isConfirmPaymentOpen} onOpenChange={setIsConfirmPaymentOpen}>
        <DialogContent
          className="sm:max-w-[360px] p-6 text-center"
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <DialogHeader className="space-y-1 text-center sm:text-center">
            <DialogTitle className="text-base font-bold text-gray-900 leading-snug">
              Tandai Submission Sebagai Lunas?
            </DialogTitle>
            <DialogDescription className="text-xs text-amber-600 font-semibold leading-relaxed">
              Pastikan dana transfer manual benar-benar sudah diterima.
            </DialogDescription>
          </DialogHeader>

          <div className="text-[11px] text-gray-500 bg-slate-50/80 border border-slate-100 rounded-lg p-3.5 leading-relaxed">
            Tindakan ini akan mengupdate status submission dan <span className="font-semibold text-gray-700">semua invoice/transaksi terkait menjadi lunas (paid)</span>.
          </div>

          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => setIsConfirmPaymentOpen(false)}
              className="text-xs font-semibold h-9 px-5 text-gray-600 border-gray-200 hover:bg-gray-50"
            >
              Batal
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-9 px-5"
              onClick={() => {
                onPaymentStatusChange(submission.id, 'paid');
                setIsConfirmPaymentOpen(false);
                reload();
              }}
            >
              Ya, Tandai Lunas
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
