import type { AdScheduleEntry, ScheduleBilling } from '@/utils/supabase';
import { isPaymentTooLateForDate, toWibYmd } from '@/utils/airing-window';
import { isSlotHoldReleased } from '@/utils/slotHold';
import { holdStateOf, isUnscheduled } from '@/pages/dashboard/schedule/scheduleModel';

/**
 * Apakah tahanan slot jadwal ini sudah gugur / kedaluwarsa.
 *
 * Mencakup:
 * 1. Hold 1 jam DOKU untuk pemesanan mandiri peneliti (`slot_booked_by === 'user'`).
 * 2. Batas bayar 14.00 WIB pada hari tayang.
 * 3. Status pembayaran eksplisit 'expired'.
 */
export function isEntryHoldLapsed(entry: AdScheduleEntry, now: number = Date.now()): boolean {
  if (entry.paymentStatus === 'paid' || entry.paymentStatus === 'completed') return false;
  return (
    holdStateOf(entry, now) === 'lapsed' ||
    isSlotHoldReleased({ slotBookedBy: entry.slotBookedBy, slotReservedAt: entry.slotReservedAt }, now) ||
    entry.paymentStatus === 'expired' ||
    Boolean(entry.startDate && isPaymentTooLateForDate(toWibYmd(new Date(entry.startDate)), new Date(now)))
  );
}

/**
 * Keadaan sebuah kartu jadwal di drawer admin.
 *
 * ⚠️ `awaiting_review` BARU, dan ia menutup pelanggaran aturan yang paling
 * mahal di tab ini. Sebelumnya order yang MASIH ANTRE REVIEW jatuh ke
 * `awaiting_invoice`, jadi kartunya berbunyi *"Slot sudah dipesan. Terbitkan
 * tagihan"* lengkap dengan tombolnya — sementara di layar penelitinya Fase ②
 * berkata *"Jadwal iklan bisa dipilih setelah review disetujui."* Dua layar,
 * dua cerita, satu order. Sebuah tab tidak boleh menawarkan aksi milik fase
 * yang belum selesai.
 *
 * ⚠️ `hold_lapsed` juga baru. Slot yang masa tahannya sudah lewat dulu tampil
 * sebagai `awaiting_invoice` — menawarkan "Buat Tagihan" untuk slot yang sudah
 * lepas.
 */
export type CardState =
  | 'awaiting_review'
  | 'cancelled'
  | 'choose_schedule'
  | 'awaiting_invoice'
  | 'hold_lapsed'
  | 'waiting_payment'
  | 'partially_paid'
  | 'paid';

export type ActionId =
  | 'schedule'        // Tentukan Jadwal / Ganti Tanggal
  | 'invoice'         // Buat Tagihan
  | 'top_up'          // Tagih Susulan
  | 'mark_paid'
  | 'unmark_paid'
  | 'cancel_schedule'
  | 'notify_slot'     // WhatsApp "slotmu sudah dipesan, tagihan menyusul"
  | 'open_review';    // lompat ke tab Review

export interface CardAction {
  id: ActionId;
  label: string;
  /** Aksi merusak — dipisahkan garis di dasar menu, dan diberi warna merah. */
  destructive?: boolean;
  /** Membuka dialog konsekuensi + mengabari peneliti. Ditandai ⚠ di menu. */
  warns?: boolean;
}

export interface CardActionPlan {
  /** Paling banyak SATU. `null` berarti kartu ini tidak menunggu apa pun. */
  primary: CardAction | null;
  /** Sisanya, dalam urutan tampil. Aksi merusak selalu di dasar. */
  menu: CardAction[];
}

/**
 * Sudah terlambat untuk tanggal ini?
 *
 * ⚠️ SATU DEFINISI, TIGA PEMAKAI. Kartu ini dulu punya DUA perhitungan `isLate`
 * yang berbeda dalam satu komponen — yang satu mengecualikan `partially_paid`,
 * yang satu tidak — jadi bagian tagihan dan baris aksi di kartu yang SAMA bisa
 * berbeda pendapat soal apakah tanggalnya masih bisa dikejar.
 *
 * Yang menang: hanya jadwal yang BENAR-BENAR lunas yang kebal. Jadwal yang baru
 * dibayar sebagian tetap terlambat kalau tanggalnya lewat — sisa uangnya tidak
 * bisa menyelamatkan tanggal itu, dan menyembunyikannya membuat admin mengira
 * masih ada yang bisa ditunggu.
 *
 * Predikatnya `isPaymentTooLateForDate` — fungsi yang sama yang dipakai sisi
 * peneliti (`too_late_today`) dan penanda B5 di tabel Submissions.
 */
export function isLateForSchedule(entry: AdScheduleEntry, state: CardState, now?: Date): boolean {
  if (state === 'paid') return false;
  if (!entry.startDate) return false;
  return isPaymentTooLateForDate(toWibYmd(new Date(entry.startDate)), now);
}

/**
 * ⚠️ `isSettled`, BUKAN "ada yang pernah lunas".
 *
 * Pendahulunya memakai `payment.hasEverPaid` — satu invoice lunas sudah cukup
 * untuk mengumumkan "Lunas". Begitu satu jadwal boleh punya beberapa tagihan
 * itu jadi kebohongan uang: `76XKVW5P` dibayar Rp 1.470.750 lalu ditagih
 * Rp 61.050 lagi, dan kartunya tetap berkata lunas. `partially_paid` adalah
 * keadaan yang dulu tidak punya nama.
 */
export function cardStateOf(
  entry: AdScheduleEntry,
  billing: ScheduleBilling | undefined,
  opts: { holdLapsed?: boolean } = {},
): CardState {
  if (entry.reviewStatus === 'rejected' || entry.reviewStatus === 'spam' || entry.status === 'cancelled') {
    return 'cancelled';
  }

  // Uang yang sudah masuk mengalahkan sumbu review — order yang lunas tidak
  // pernah mundur jadi "menunggu review", betapapun kolom statusnya tertinggal.
  const isPaidSomehow =
    billing?.isSettled ||
    (!billing?.invoices.length &&
      (['paid', 'completed'].includes(entry.paymentStatus || '') ||
       ['paid', 'completed'].includes(entry.status || '')));

  // ── Gerbang aturan 2 ──
  // Fase ② tidak punya hak bertindak selama Fase ① belum lolos.
  if (!isPaidSomehow && entry.reviewStatus === 'in_review') return 'awaiting_review';

  if (isUnscheduled(entry)) return 'choose_schedule';
  if (isPaidSomehow) return 'paid';
  if (billing && billing.paid > 0) return 'partially_paid';

  const holdLapsed = opts.holdLapsed ?? isEntryHoldLapsed(entry);

  // Slot yang masa tahannya lewat: tagihan lama ikut kedaluwarsa bersama slotnya.
  // Jangan biarkan openInvoice mengembalikan waiting_payment untuk tagihan yang slotnya sudah lepas.
  if (holdLapsed) return 'hold_lapsed';

  /**
   * ⚠️ "ADA BARIS TAGIHAN" BUKAN "ADA TAGIHAN HIDUP".
   *
   * Versi sebelumnya memakai `invoices.length`, dan barisnya tidak pernah
   * dihapus — sesudah peneliti menjadwalkan ulang, satu-satunya tagihan yang
   * tersisa sudah kedaluwarsa tapi kartunya tetap berkata "menunggu
   * pembayaran". `openInvoice` menjawab pertanyaan yang sebenarnya.
   */
  if (billing?.openInvoice) return 'waiting_payment';

  return 'awaiting_invoice';
}

/**
 * Aksi apa yang berlaku pada satu kartu — SATU sumber untuk seluruh tab.
 *
 * ⚠️ INI YANG MENEGAKKAN "MAKSIMAL SATU TOMBOL DI LUAR MENU ⋯". Sebelumnya
 * aturannya cuma disiplin: tombol tersebar di callout, di bagian tagihan, dan
 * di baris aksi bawah, masing-masing dengan gerbangnya sendiri — dan kondisi
 * `waiting_payment` berakhir menampilkan ENAM kontrol, salah satunya disabled.
 * Karena bentuknya sekarang `{ primary, menu }`, kartu secara struktural tidak
 * bisa menumbuhkan tombol kedua.
 *
 * Aksi yang TIDAK berlaku DIHILANGKAN, bukan ditampilkan `disabled`. "Tagih
 * Susulan" yang disabled berikut tooltipnya adalah pola yang diganti: ia
 * memakan ruang untuk memberi tahu apa yang tidak bisa dilakukan.
 */
export function planCardActions(input: {
  state: CardState;
  entry: AdScheduleEntry;
  billing: ScheduleBilling | undefined;
  isLate: boolean;
  can: {
    markPaid: boolean;
    unmarkPaid: boolean;
    cancelSchedule: boolean;
    createInvoice: boolean;
    notifySlot?: boolean;
  };
  /**
   * Berapa pesanan yang ditanggung `billing.openInvoice`. 1 (atau tak diisi)
   * berarti tagihan biasa.
   *
   * ⚠️ TIDAK BISA DITURUNKAN DARI `billing`. `schedule_billing_bulk()` dijangkar
   * ke SATU order, sementara anggota tagihan gabungan tersebar di order-order
   * yang berbeda — jadi apa pun yang dihitung dari `billing` selalu menjawab 1,
   * tepat pada kasus yang pertanyaannya diajukan. Pemanggil yang mengoper
   * jawabannya (`fetchInvoiceGroups`).
   */
  openInvoiceMemberCount?: number;
  /**
   * Berapa pesanan yang ditanggung tagihan yang sudah LUNAS di jadwal ini —
   * cakupan "Tandai Belum Lunas".
   *
   * ⚠️ SUMBERNYA BEDA DARI `openInvoiceMemberCount`, dan itu bukan kemubaziran.
   * Begitu grup lunas, `billing.openInvoice` jadi null (tidak ada lagi tagihan
   * terbuka), jadi menurunkan cakupan pembalikan dari sana selalu menjawab 1 —
   * tepat pada kartu yang menawarkan pembalikan itu.
   */
  paidInvoiceMemberCount?: number;
}): CardActionPlan {
  const { state, entry, billing, isLate, can } = input;
  const memberCount = input.openInvoiceMemberCount ?? 1;
  const paidMemberCount = input.paidInvoiceMemberCount ?? 1;

  const scheduleLabel = isUnscheduled(entry) ? 'Tentukan Jadwal' : 'Ganti Tanggal';
  const schedule = (warns = false): CardAction => ({ id: 'schedule', label: scheduleLabel, warns });
  const cancelSchedule: CardAction = { id: 'cancel_schedule', label: 'Batalkan Jadwal', destructive: true };
  /**
   * ⚠️ LABELNYA MENYEBUT CAKUPANNYA — dan itu penutup B2 sekaligus pencegah
   * pengulangan B3.
   *
   * `markScheduleAsPaid()` berlingkup `schedule_id`, jadi pada anggota tagihan
   * gabungan ia membalik SATU baris jadi lunas sementara link DOKU-nya tetap
   * menagih total penuh — porsi yang sama bisa terbayar dua kali tanpa satu pun
   * tanda di layar. Aksinya TIDAK dicabut (menolaknya justru mematikan alur yang
   * melahirkan fitur ini: peneliti transfer di luar DOKU, admin melunasi seluruh
   * batch); yang berubah cakupan dan namanya. Pelaksananya `settleGroupAsPaid`.
   */
  const markPaid: CardAction = {
    id: 'mark_paid',
    label: memberCount > 1 ? `Tandai Lunas (${memberCount} pesanan)` : 'Tandai Lunas',
    warns: memberCount > 1,
  };
  /**
   * ⚠️ CAKUPANNYA IKUT GRUP — cermin `markPaid` di atas.
   *
   * `unmarkScheduleAsPaid()` menyaring `schedule_id`, jadi membalik SATU anggota
   * grup memecahnya jadi separuh-lunas: dokumen `/invoices/<payment_id>` berhenti
   * jadi RECEIPT dan kembali jadi INVOICE bernominal PENUH untuk pesanan yang
   * uangnya sudah diterima. Pelaksananya `unsettleGroupAsPaid`.
   */
  const unmarkPaid: CardAction = {
    id: 'unmark_paid',
    label: paidMemberCount > 1 ? `Tandai Belum Lunas (${paidMemberCount} pesanan)` : 'Tandai Belum Lunas',
    warns: paidMemberCount > 1,
  };

  // Aturan satu-tagihan-terbuka-per-jadwal: peneliti hanya melihat tagihan
  // TERAKHIR, jadi menerbitkan yang kedua selagi ada yang menggantung akan
  // menyembunyikan yang pertama dari orang yang harus membayarnya.
  const canTopUp = can.createInvoice && billing?.openInvoice == null;
  const topUp: CardAction = { id: 'top_up', label: 'Tagih Susulan' };

  /**
   * Membatalkan JADWAL selagi tagihannya masih hidup adalah janji yang tidak
   * bisa ditepati.
   *
   * Dialog "Batalkan Jadwal" berkata tagihan yang menggantung "ikut dimatikan";
   * ia tidak. Link DOKU-nya tetap bisa dibayar dari sisi bank — itulah yang
   * terjadi pada order af004b84, dan uangnya mendarat di jadwal yang sudah
   * tidak ada. Urutan yang benar: matikan tagihannya dulu (di situ admin
   * BENAR-BENAR bisa bertindak), baru batalkan jadwalnya.
   *
   * ⚠️ AKSINYA DIHILANGKAN, BUKAN `disabled`. Kontrak berkas ini. Alasannya
   * dititipkan ke callout kartu pada state `waiting_payment` — tanpa kalimat
   * itu tombolnya sekadar lenyap tanpa sebab, dan itu kebisuan yang sama
   * dengan yang ditutup 65369c1.
   *
   * Bentuknya sengaja SAMA PERSIS dengan `canTopUp` di atas: satu definisi
   * "ada tagihan hidup", bukan dua. `openInvoice` sudah sadar-kedaluwarsa
   * sejak sql/83 — tanpa itu gerbang ini akan mencabut "Batalkan Jadwal" dari
   * 75 jadwal yang tagihannya sudah mati berminggu-minggu.
   */
  const canCancelSchedule = can.cancelSchedule && billing?.openInvoice == null;

  const withCancel = (menu: CardAction[]) =>
    canCancelSchedule ? [...menu, cancelSchedule] : menu;

  /**
   * "Kabari via WA" — slot sudah dipesan, tagihannya belum terbit.
   *
   * ⚠️ GERBANG KEDUA (`slotBookedBy`) BUKAN HIASAN. 603 baris produksi punya
   * `slot_booked_by` NULL dan tidak seorang pun pernah memesannya; mengabari
   * "slot Anda sudah dipesan" untuk reservasi yang tak pernah terjadi persis
   * jenis kebohongan yang komentar di ScheduleCardList itu tulis. Tanggalnya
   * ikut jadi syarat karena isi pesannya justru tanggal itu.
   */
  const canNotifySlot = Boolean(can.notifySlot) && Boolean(entry.slotBookedBy) && Boolean(entry.startDate);
  const notifySlot: CardAction = { id: 'notify_slot', label: 'Kabari via WA' };

  switch (state) {
    // Nol aksi penagihan — bolanya di Fase ①. Satu-satunya afordansi adalah
    // penunjuk ke tempat kerjanya yang benar.
    case 'awaiting_review':
      return { primary: { id: 'open_review', label: 'Buka tab Review' }, menu: [] };

    case 'cancelled':
      return { primary: null, menu: [] };

    case 'choose_schedule':
      return { primary: schedule(), menu: withCancel([]) };

    case 'awaiting_invoice':
      return {
        primary: can.createInvoice ? { id: 'invoice', label: 'Buat Tagihan' } : schedule(),
        menu: withCancel([
          ...(can.createInvoice ? [schedule()] : []),
          ...(canNotifySlot ? [notifySlot] : []),
          ...(can.markPaid ? [markPaid] : []),
        ]),
      };

    // Slotnya sudah lepas / tanggalnya tak bisa dikejar: yang utama tanggal
    // baru. Buat Tagihan tetap ada di menu bila admin ingin menerbitkan langsung.
    case 'hold_lapsed':
      return {
        primary: schedule(),
        menu: withCancel([
          ...(can.createInvoice ? [{ id: 'invoice', label: 'Buat Tagihan' } as CardAction] : []),
          ...(can.markPaid ? [markPaid] : []),
        ]),
      };

    case 'waiting_payment':
      return isLate
        ? { primary: schedule(), menu: withCancel(can.markPaid ? [markPaid] : []) }
        : {
            primary: can.markPaid ? markPaid : schedule(),
            menu: withCancel([
              ...(can.markPaid ? [schedule()] : []),
              ...(canTopUp ? [topUp] : []),
            ]),
          };

    case 'partially_paid':
      return {
        primary: canTopUp ? topUp : schedule(),
        menu: withCancel([
          ...(canTopUp ? [schedule(true)] : []),
          ...(can.unmarkPaid ? [unmarkPaid] : []),
        ]),
      };

    // Lunas tidak menunggu apa pun dari admin — nol aksi utama, sengaja.
    // "Ganti Tanggal" tetap ADA (keputusan produk: jalan buntu mendorong admin
    // menyalahgunakan tombol lain), tapi ia berdialog dan berkabar.
    case 'paid':
      return {
        primary: null,
        menu: [
          schedule(true),
          ...(canTopUp ? [topUp] : []),
          ...(can.unmarkPaid ? [unmarkPaid] : []),
        ],
      };
  }
}

/**
 * Jadwal mana yang jadi sasaran ketika pemanggil hanya menyebut ORDER-nya.
 *
 * ⚠️ DULU SELALU `schedules[0]`, DAN ITU BISA SALAH SASARAN. "Reserve Slot" /
 * "Buat tagihan" dari luar drawer cuma membawa id order; jadwalnya baru
 * diketahui sesudah daftarnya termuat. Pada order berjadwal banyak, jadwal ke-1
 * sering justru yang sudah beres — jadi formulirnya membuka jadwal yang tidak
 * dimaksud, sementara kartu yang otomatis terbuka di belakangnya adalah jadwal
 * LAIN (kartu memakai aturan "yang butuh tindakan"). Dua permukaan, satu klik,
 * dua jadwal berbeda.
 *
 * Aturannya sekarang sama dengan aturan kartu: jadwal pertama yang MENUNGGU
 * TINDAKAN. Kalau semuanya beres, barulah jadwal pertama — di situ tebakan
 * apa pun sama benarnya.
 */
export function pickTargetSchedule<T extends AdScheduleEntry>(
  entries: T[],
  stateOf: (e: T) => CardState,
): T | undefined {
  const pending: CardState[] = [
    'choose_schedule', 'awaiting_invoice', 'hold_lapsed', 'waiting_payment', 'partially_paid',
  ];
  return entries.find((e) => pending.includes(stateOf(e))) ?? entries[0];
}
