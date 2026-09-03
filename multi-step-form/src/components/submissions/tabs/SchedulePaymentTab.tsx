import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/dialog';
import { ConfirmDialog, type ConfirmRequest } from '../../ui/confirm-dialog';
import { DetailSheetSection } from '../../data-list/DetailSheet';
import {
  fetchAdSchedules, fetchScheduleBilling, fetchInvoiceGroups, markScheduleAsPaid, settleGroupAsPaid,
  unmarkScheduleAsPaid, unsettleGroupAsPaid, cancelInvoice, cancelSchedule,
  type AdScheduleEntry, type InvoiceGroup, type ScheduleBilling, type ScheduleInvoice,
} from '@/utils/supabase';
import { formatIDR } from '@/utils/currency';
import { formatWibShort } from '@/utils/airing-window';
import type { SurveySubmission, PaymentState, ExistingPage } from '../types';
import { deriveLifecycle } from '../lifecycle';
import { ScheduleCardList, ScheduleCardSkeleton } from './ScheduleCardList';
import { cardStateOf, pickTargetSchedule } from './scheduleCardActions';
import { notifyScheduleChange } from '@/utils/notifyScheduleChange';
import { openWhatsApp, slotBookedMessage } from '@/utils/waMessage';

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
  /**
   * Anggota tiap tagihan gabungan yang menyentuh order ini, dikunci `payment_id`.
   *
   * ⚠️ PENGAMBILAN TERPISAH, DAN MEMANG HARUS. `schedule_billing_bulk()`
   * dijangkar ke SATU `submission_id`; anggota sebuah tagihan gabungan justru
   * tersebar di ORDER-ORDER LAIN. Menurunkan jumlah anggota dari `billings`
   * selalu menjawab 1 — tepat pada kasus yang pertanyaannya diajukan.
   */
  const [groups, setGroups] = useState<Map<string, InvoiceGroup>>(new Map());
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

        // Nol query tambahan untuk order tanpa tagihan sama sekali.
        const paymentIds = Array.from(bill.values())
          .flatMap((b) => b.invoices.map((i) => i.paymentId));
        const groupMap = await fetchInvoiceGroups(paymentIds);
        if (!cancelled) setGroups(groupMap);
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
   * "Kabari via WA" — slot sudah dipesan, tagihannya belum terbit.
   *
   * ⚠️ SINKRON, tanpa satu pun `await` sebelum WhatsApp terbuka. Ini yang
   * membuatnya kebal pemblokir popup, tidak seperti "Buat & Kirim WA" di
   * `InvoiceForm` yang harus menerbitkan tagihan lebih dulu. Jangan
   * menjadikannya `async` "supaya seragam" — keseragaman itu mematikannya.
   *
   * Gerbangnya (slot benar-benar dipesan + jadwalnya bertanggal) ditegakkan
   * `planCardActions`, jadi di sini tidak diulang.
   */
  const handleNotifySlot = useCallback((entry: AdScheduleEntry) => {
    openWhatsApp(submission.phone_number, slotBookedMessage({
      researcherName: submission.researcherName,
      title: entry.title || submission.formTitle,
      startDate: entry.startDate!,
      bookingId: entry.bookingId,
    }));
  }, [submission.phone_number, submission.researcherName, submission.formTitle]);

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
        // ⚠️ Klausa "dan tagihan yang masih menggantung ikut dimatikan" DIBUANG:
        // itu tidak pernah benar. `cancelSchedule()` tidak memanggil API
        // pembatalan DOKU, jadi link bayarnya tetap hidup di sisi bank — persis
        // yang terjadi pada order af004b84. Sesudah gerbang 6a, dialog ini juga
        // hanya muncul ketika sudah TIDAK ada tagihan hidup, jadi kalimatnya
        // bukan cuma salah, ia juga tidak relevan lagi.
        'Kuota hari itu langsung bebas dijual lagi.',
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
   * Bentuk & alasannya kini hidup di `ui/confirm-dialog.tsx`, karena aksi yang
   * sama ("Batalkan tagihan") juga ditawarkan dari halaman Transaksi. Tab ini
   * tetap yang MEMEGANG state-nya — hanya rendernya yang dibagi.
   */
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmRequest | null>(null);

  /**
   * Tagihan gabungan yang menaungi tagihan TERBUKA jadwal ini — atau null.
   *
   * Sengaja hanya `openInvoice`: itu satu-satunya baris yang akan disentuh
   * pelunasan, dan satu-satunya yang link DOKU-nya masih menagih.
   */
  const openGroupOf = useCallback((entry: AdScheduleEntry): InvoiceGroup | null => {
    const pid = billings.get(entry.id)?.openInvoice?.paymentId;
    const g = pid ? groups.get(pid) : undefined;
    return g && g.memberCount > 1 ? g : null;
  }, [billings, groups]);

  /**
   * Grup dari tagihan yang sudah LUNAS di jadwal ini — cakupan pembalikan.
   *
   * Grup yang lunas tidak punya `openInvoice` lagi, jadi `openGroupOf` di atas
   * akan menjawab null tepat di kartu yang menawarkan "Tandai Belum Lunas".
   */
  const paidGroupOf = useCallback((entry: AdScheduleEntry): InvoiceGroup | null => {
    const pid = billings.get(entry.id)?.invoices.find((i) => i.isPaid)?.paymentId;
    const g = pid ? groups.get(pid) : undefined;
    return g && g.memberCount > 1 ? g : null;
  }, [billings, groups]);

  /**
   * Pelunasan manual satu tagihan GABUNGAN.
   *
   * ⚠️ LAPORANNYA PER ANGGOTA, BUKAN BORONGAN. `settleGroupAsPaid` melunasi
   * dalam loop yang tidak transaksional: `assertScheduleRowTouched` melempar
   * pada nol baris (mis. admin selain `product@jakpat.net`, ditolak
   * `guard_extend_payment_columns` sql/33), jadi 3 dari 4 bisa berhasil. Toast
   * hijau tunggal di situ adalah kebohongan yang sama kelasnya dengan
   * "Tandai Lunas" yang gagal senyap sebelum sql/59.
   */
  const handleSettleGroup = useCallback(async (group: InvoiceGroup) => {
    try {
      const res = await settleGroupAsPaid(group.paymentId);

      if (res.failed.length > 0) {
        toast.warning(
          `${res.settled.length} dari ${group.memberCount} pesanan ditandai lunas. `
          + `GAGAL: ${res.failed.map((f) => `${f.title} (${f.reason})`).join('; ')}`,
          { duration: 12000 },
        );
      } else if (!res.dokuCancelled) {
        // Uangnya sudah diterima di luar sistem, tapi link-nya mungkin masih
        // hidup menagih total penuh — persis jendela bayar-ganda B2, cuma
        // pindah pemicu. Admin satu-satunya yang bisa menindaklanjuti.
        toast.warning(
          `${group.memberCount} pesanan ditandai lunas, tapi link DOKU-nya MUNGKIN MASIH BISA DIBAYAR `
          + `(${res.dokuReason}). Beri tahu penelitinya jangan membayar link yang lama.`,
          { duration: 12000 },
        );
      } else {
        toast.success(`${group.memberCount} pesanan ditandai lunas. Link bayarnya sudah dinonaktifkan di DOKU.`);
      }

      setPendingPaid(null);
      reload();
      onExtendCreated();
    } catch (err: any) {
      toast.error(err?.message || 'Gagal menandai lunas');
    }
  }, [reload, onExtendCreated]);

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
    const group = paidGroupOf(entry);

    /*
      ⚠️ TAGIHAN GABUNGAN DIBALIK UTUH, TIDAK PERNAH SEPARUH.
      Membalik satu anggota membuat `/invoices/<payment_id>` berhenti jadi
      RECEIPT dan kembali jadi INVOICE bernominal PENUH — untuk pesanan yang
      uangnya sudah diterima. Dokumen itu dipakai pertanggungjawaban dana
      kampus; separuh-lunas di sana bukan cuma membingungkan, ia salah.
    */
    if (group) {
      setPendingConfirm({
        title: `Batalkan status lunas ${group.memberCount} pesanan ini?`,
        highlight: formatIDR(group.total),
        lines: [
          `Tagihan ${group.paymentId} menaungi ${group.memberCount} pesanan, dan SEMUANYA ikut `
            + `kembali jadi "menunggu bayar": ${group.members.map((m) => m.title).join(', ')}.`,
          'Ini hanya membalik pelunasan yang ditandai MANUAL — bukan pembayaran lewat DOKU, dan bukan rekonsiliasi warisan (kanal MANUAL_RECONCILED, sql/71).',
          // Yang paling mudah disalahpahami: pembalikan TIDAK menghidupkan
          // kembali link bayarnya. Ia sudah dimatikan saat grup dilunasi, dan
          // DOKU tidak punya "batalkan pembatalan".
          `⚠️ Link bayar lamanya TIDAK hidup kembali — ia sudah dimatikan di DOKU saat grup ini dilunasi. `
            + `Kalau memang harus ditagih ulang, terbitkan tagihan BARU.`,
        ],
        confirmLabel: `Ya, Batalkan Status Lunas ${group.memberCount} Pesanan`,
        tone: 'danger',
        onConfirm: async () => {
          try {
            const res = await unsettleGroupAsPaid(group.paymentId);
            if (res.failed.length > 0) {
              toast.warning(
                `${res.reverted.length} dari ${group.memberCount} pesanan kembali "menunggu bayar". `
                + `GAGAL: ${res.failed.map((f) => `${f.title} (${f.reason})`).join('; ')}`,
                { duration: 12000 },
              );
            } else {
              toast.success(`${group.memberCount} pesanan kembali "menunggu bayar". Terbitkan tagihan baru kalau masih ditagih.`);
            }
            reload();
            onExtendCreated();
          } catch (err: any) {
            toast.error(err?.message || 'Gagal membatalkan status lunas');
          }
        },
      });
      return;
    }

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
  }, [reload, onExtendCreated, paidGroupOf]);

  /**
   * Batalkan SATU TAGIHAN yang belum dibayar — satu `payment_id`, dan untuk
   * tagihan gabungan itu berarti SELURUH pesanan yang ditanggungnya.
   *
   * ⚠️ KALIMAT "TAGIHAN LAIN TIDAK TERSENTUH" DULU BERDIRI DI SINI, DAN IA
   * BERBOHONG SEJAK TAGIHAN GABUNGAN ADA. `cancelInvoice()` meng-UPDATE semua
   * baris ber-`payment_id` itu — dan memang harus, link DOKU tidak bisa
   * dibatalkan separuh. Admin yang membatalkan dari kartu pesanan #2 diam-diam
   * mematikan tagihan #1, #3, #4. Yang salah bukan fungsinya, melainkan teks
   * yang ditulis sebelum grup ada.
   *
   * ⚠️ BUKAN pembatalan jadwal, dan bukan refund. Jadwalnya tetap berdiri dan
   * slotnya tidak dilepas. Tagihan lunas tidak pernah sampai ke sini —
   * tombolnya digerbang di kartu, dan `cancelInvoice()` mengulang syarat itu
   * di DB.
   *
   * Nilai kembaliannya DIPERIKSA. `.update()` tanpa `.select()` tidak melempar
   * error saat RLS menyaring hasilnya jadi nol baris; itu persis cara "Tandai
   * Lunas" gagal diam-diam berbulan-bulan sebelum sql/59. Nol baris di sini
   * berarti tagihannya sudah berubah status di tab lain — bukan sukses.
   */
  const handleCancelInvoice = useCallback(async (inv: ScheduleInvoice) => {
    if (!inv.paymentId) return;
    const paymentId = inv.paymentId;
    /*
      Sampai kapan link itu hidup. `expiresAt` baru terisi untuk tagihan yang
      terbit sesudah Bagian 3; untuk baris lama kita hanya tahu aturannya
      (7 hari sejak terbit) dan mengatakannya begitu — menyebut tanggal pasti
      yang tidak kita punya justru lebih buruk daripada menyebut aturannya.
    */
    const expiryNote = inv.expiresAt
      ? ` sampai ${formatWibShort(inv.expiresAt)}`
      : ' sampai 7 hari sejak tagihan terbit';
    const group = groups.get(paymentId);
    const isGroup = !!group && group.memberCount > 1;

    setPendingConfirm({
      title: isGroup ? `Batalkan tagihan gabungan ${group!.memberCount} pesanan ini?` : 'Batalkan tagihan ini?',
      highlight: formatIDR(isGroup ? group!.total : inv.amount),
      lines: [
        // Cakupan sebenarnya, DISEBUT LEBIH DULU — sebelum kalimat apa pun
        // tentang akibat, karena akibat itu berlaku untuk semuanya.
        isGroup && `Tagihan ini menaungi ${group!.memberCount} pesanan, dan SEMUANYA ikut dibatalkan `
          + `(link DOKU tidak bisa dibatalkan separuh): ${group!.members.map((m) => m.title).join(', ')}.`,
        isGroup
          ? 'Nominal itu berhenti dihitung sebagai piutang, dan ketiga jadwalnya bisa ditagih ulang — terpisah atau digabung lagi.'
          : 'Nominal itu berhenti dihitung sebagai piutang, dan jadwalnya bisa ditagih ulang.',
        isGroup
          ? 'Jadwal serta slot pesanan-pesanan itu TIDAK dibatalkan — ini berlingkup tagihan saja.'
          : 'Jadwal serta slotnya TIDAK dibatalkan — ini berlingkup tagihan saja.',
        /*
          ⚠️ DI SINILAH peringatan link-DOKU tinggal — bukan di dialog
          pembatalan jadwal. Di sini admin BENAR-BENAR bisa bertindak.

          Sesudah Bagian 2 (`paid_on_dead_bill`) kalimat keduanya berubah:
          uang yang masuk ke tagihan mati TIDAK lagi menghidupkannya kembali
          jadi lunas — ia dicatat, jadwalnya tidak disentuh, dan barisnya
          masuk antrean admin. Membiarkan kalimat lama berarti menjanjikan
          pemulihan otomatis yang sudah sengaja dicabut.
        */
        `Link bayar ${paymentId} yang sudah terlanjur dikirim MASIH BISA DIBAYAR dari sisi bank${expiryNote}.`,
        'Kalau uangnya sungguh masuk, uang itu dicatat tapi jadwalnya TIDAK ikut bergerak — kartunya muncul di antrean webhook untuk diputuskan admin. Beri tahu penelitinya jangan membayar link yang lama.',
      ],
      confirmLabel: 'Ya, Batalkan Tagihan',
      tone: 'danger',
      onConfirm: async () => {
        try {
          const res = await cancelInvoice(paymentId);
          if (res.changed === 0) {
            toast.warning('Tidak ada yang berubah — tagihan ini mungkin sudah dibayar atau dibatalkan.');
          } else if (res.dokuCancelled) {
            toast.success(`Tagihan ${paymentId} dibatalkan. Link bayarnya sudah dinonaktifkan di DOKU.`);
          } else {
            /*
              ⚠️ NADANYA MENGIKUTI KENYATAAN, BUKAN HARAPAN.

              Pembatalan di database kita BERHASIL — itu sebabnya ini bukan
              error. Yang gagal cuma mematikan link-nya di DOKU, dan itu
              informasi yang harus sampai ke admin karena hanya dia yang bisa
              menindaklanjuti (memberi tahu penelitinya). `toast.warning`,
              bukan `success` yang menenangkan: menenangkan tanpa dasar persis
              yang membuat insiden af004b84 terjadi.
            */
            toast.warning(
              `Tagihan ${paymentId} dibatalkan, tapi link DOKU-nya MUNGKIN MASIH BISA DIBAYAR (${res.dokuReason}). Beri tahu penelitinya jangan membayar link yang lama.`,
              { duration: 10000 },
            );
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

  /**
   * Grup yang akan dilunasi kalau dialog "Tandai Lunas" dikonfirmasi. Dihitung
   * di sini, sekali — bukan di dalam JSX, supaya tombol dan teksnya mustahil
   * memakai cakupan yang berbeda.
   */
  const pendingGroup = pendingPaid ? openGroupOf(pendingPaid) : null;

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
            groups={groups}
            submission={submission}
            onEditSchedule={onEditSchedule}
            onCreateSchedule={onCreateSchedule}
            onCreateInvoice={onCreateInvoice}
            onMarkPaid={lifecycle.isPaid ? null : (entry) => setPendingPaid(entry)}
            onUnmarkPaid={(entry) => void handleUnmarkPaid(entry)}
            onCancelInvoice={(inv) => void handleCancelInvoice(inv)}
            onCancelSchedule={(entry) => void handleCancelSchedule(entry)}
            onNotifySlot={handleNotifySlot}
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
              {pendingGroup
                ? `Tandai ${pendingGroup.memberCount} Pesanan Lunas?`
                : `Tandai Jadwal Iklan ${pendingPaid?.ordinal} Lunas?`}
            </DialogTitle>
            <DialogDescription className="text-xs text-amber-600 font-semibold leading-relaxed">
              Pastikan dana transfer manual benar-benar sudah diterima.
            </DialogDescription>
          </DialogHeader>

          {/* Booking ID dipajang eksplisit: dialog yang cuma bilang "jadwal ini"
              tidak bisa diadu dengan bukti transfer yang ada di tangan admin. */}
          {pendingGroup ? (
            /*
              ⚠️ DAFTARNYA DISEBUT SATU PER SATU, TERMASUK JUDUL PESANAN LAIN.
              Anggota tagihan gabungan tersebar di ORDER yang berbeda, jadi
              admin yang mengklik dari drawer pesanan #2 tidak punya cara lain
              melihat pesanan mana saja yang ikut berubah status. Dialog yang
              cuma berkata "3 pesanan" mengulang kebohongan cakupan yang justru
              sedang diperbaiki.
            */
            <div className="text-[11px] text-gray-500 bg-slate-50/80 border border-slate-100 rounded-lg p-3.5 leading-relaxed space-y-2 text-left">
              <p>
                Tagihan{' '}
                <span className="font-mono font-semibold text-gray-700">{pendingGroup.paymentId}</span>{' '}
                menaungi <span className="font-semibold text-gray-700">{pendingGroup.memberCount} pesanan</span> —
                semuanya ikut ditandai lunas:
              </p>
              <ul className="space-y-1">
                {pendingGroup.members.map((m, i) => (
                  <li key={m.scheduleId ?? i} className="flex items-center justify-between gap-2">
                    <span className="truncate text-gray-700">{i + 1}. {m.title}</span>
                    <span className="tabular-nums shrink-0">{formatIDR(m.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="font-semibold text-gray-700 border-t border-slate-200 pt-1.5 flex items-center justify-between">
                <span>Total</span>
                <span className="tabular-nums">{formatIDR(pendingGroup.total)}</span>
              </p>
              <p className="text-amber-700">
                Link bayarnya dimatikan di DOKU lebih dulu. Kalau DOKU menolak, kamu akan diberi tahu —
                link lama masih bisa dibayar dari sisi bank.
              </p>
            </div>
          ) : (
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
          )}

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
              onClick={() => {
                if (pendingGroup) void handleSettleGroup(pendingGroup);
                else if (pendingPaid) void handleMarkPaid(pendingPaid);
              }}
            >
              {pendingGroup ? `Ya, Tandai ${pendingGroup.memberCount} Pesanan Lunas` : 'Ya, Tandai Lunas'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog request={pendingConfirm} onDismiss={() => setPendingConfirm(null)} />
    </>
  );
}
