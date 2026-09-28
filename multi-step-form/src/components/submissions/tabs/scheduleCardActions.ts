import type { AdScheduleEntry, ScheduleBilling } from '@/utils/supabase';
import { isPaymentTooLateForDate, toWibYmd } from '@/utils/airing-window';
import { isSlotHoldReleased } from '@/utils/slotHold';
import { isLiveInvoice } from '@/utils/billingCompare';
import { holdStateOf, isUnscheduled, chipKindOf, CANCELLED_CHIPS } from '@/pages/dashboard/schedule/scheduleModel';

/**
 * Apakah tahanan slot jadwal ini sudah gugur / kedaluwarsa.
 *
 * Mencakup:
 * 1. Hold 1 jam DOKU untuk pemesanan mandiri peneliti (`slot_booked_by === 'user'`).
 * 2. Batas bayar 14.00 WIB pada hari tayang.
 * 3. Status pembayaran eksplisit 'expired'.
 *
 * ⚠️ JADWAL YANG DIBATALKAN TIDAK PERNAH KEDALUWARSA — ia tidak menahan apa
 * pun yang bisa gugur. Tanpa penjaga ini dua klausa di bawah menyala untuk
 * SETIAP jadwal batal: klausa 2 membaca tanggal yang sql/62 simpan sebagai
 * RIWAYAT seolah tenggat, dan klausa 3 membaca `payment_status='expired'` yang
 * ditulis `cancelSchedule()` sendiri untuk ordinal 1. Terukur 10 Sep 2026: 86
 * dari 148 jadwal batal berbadge "kedaluwarsa" tepat di atas panel "Jadwal
 * dibatalkan". Pagarnya `CANCELLED_CHIPS` — yang sama dengan `holdStateOf`.
 */
export function isEntryHoldLapsed(entry: AdScheduleEntry, now: number = Date.now()): boolean {
  if (entry.paymentStatus === 'paid' || entry.paymentStatus === 'completed') return false;
  // Tayang sebelum lunas (sql/102): tidak ada hold yang bisa gugur dan tidak
  // ada batas bayar 14.00 — iklannya tayang sesuai jadwal, utangnya ditagih
  // tempo. Tanpa ini kartunya berbadge «lewat batas bayar» tepat di hari tayang.
  if (entry.airOnCreditAt) return false;
  if (CANCELLED_CHIPS.includes(chipKindOf(entry, now))) return false;
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
  /**
   * Tayang sebelum lunas (sql/102) dan uangnya belum masuk. Tanpa tanggal
   * jatuh tempo — yang ditampilkan umur utangnya, bukan tenggat.
   */
  | 'airing_on_credit'
  | 'paid';

export type ActionId =
  | 'schedule'        // Tentukan Jadwal / Ganti Tanggal
  | 'invoice'         // Buat Tagihan
  | 'tempo_invoice'   // Tayangkan Dulu / Buat Tagihan (tempo) — dialog tagihan dengan tempo menyala
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
  // Lunas maupun dibatalkan: tanggal ini sudah tidak dikejar siapa pun. Tanggal
  // jadwal batal adalah riwayat (sql/62), bukan tenggat.
  if (state === 'paid' || state === 'cancelled') return false;
  // Kredit: batas bayar 14.00 tidak berlaku — iklannya tayang apa pun (sql/102).
  if (state === 'airing_on_credit' || entry.airOnCreditAt) return false;
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
  // Uang yang sudah masuk mengalahkan sumbu review — order yang lunas tidak
  // pernah mundur jadi "menunggu review", betapapun kolom statusnya tertinggal.
  const isPaidSomehow =
    billing?.isSettled ||
    (!billing?.invoices.length &&
      (['paid', 'completed'].includes(entry.paymentStatus || '') ||
       ['paid', 'completed'].includes(entry.status || '')));

  /*
    ⚠️ SEBELUM CABANG `cancelled`, DAN ITU DISENGAJA (K6).
    Iklan kredit yang dihentikan di tengah tayang TETAP berutang penuh — jadwalnya
    berstatus batal tapi tagihan temponya masih hidup. Kalau cabang `cancelled`
    menang, kartunya diam soal uang dan utangnya hilang dari header tab.
    Dibatalkan SEBELUM tayang, tagihannya ikut ditutup (`cancelSchedule`), jadi
    `openInvoice` kosong dan kartunya jatuh ke `cancelled` seperti biasa.
  */
  if (entry.airOnCreditAt && !isPaidSomehow
      && !['paid', 'completed'].includes(entry.paymentStatus || '')
      && (entry.status !== 'cancelled' || billing?.openInvoice)) {
    return 'airing_on_credit';
  }

  if (entry.reviewStatus === 'rejected' || entry.reviewStatus === 'spam' || entry.status === 'cancelled') {
    return 'cancelled';
  }

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
    /**
     * Pemanggil menyediakan jalur tagihan tempo (sql/102). Opsional supaya
     * permukaan lain yang memakai model ini tidak ikut menawarkannya.
     */
    tempoInvoice?: boolean;
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

  /**
   * "Tayangkan Dulu" — satu-satunya pintu masuk kredit (sql/102).
   *
   * ⚠️ IA MEMBUKA DIALOG TAGIHAN, BUKAN MENANDAI LANGSUNG. Kredit tanpa tagihan
   * adalah iklan yang tayang tanpa satu pun catatan utang; jadi izin tayang dan
   * tagihan temponya lahir dari satu tindakan, dengan tagihan lebih dulu.
   *
   * Syaratnya: bertanggal dan sudah lolos review. Review TIDAK boleh dilompati
   * — RPC-nya menolak juga, tapi aksi yang pasti gagal tidak boleh ditawarkan.
   */
  const canTempo = Boolean(can.tempoInvoice) && Boolean(entry.startDate) && entry.reviewStatus === 'approved';
  const airOnCredit: CardAction = { id: 'tempo_invoice', label: 'Tayangkan Dulu' };
  const withTempo = (menu: CardAction[]) => (canTempo ? [airOnCredit, ...menu] : menu);

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
        menu: withCancel(withTempo([
          ...(can.createInvoice ? [schedule()] : []),
          ...(canNotifySlot ? [notifySlot] : []),
          ...(can.markPaid ? [markPaid] : []),
        ])),
      };

    // Slotnya sudah lepas / tanggalnya tak bisa dikejar: yang utama tanggal
    // baru. Buat Tagihan tetap ada di menu bila admin ingin menerbitkan langsung.
    // "Tayangkan Dulu" justru paling berguna DI SINI: batas bayar lewat, tapi
    // admin yakin penelitinya akan membayar (kasus JFU-INV-15f4ac, 28 Sep).
    case 'hold_lapsed':
      return {
        primary: schedule(),
        menu: withCancel(withTempo([
          ...(can.createInvoice ? [{ id: 'invoice', label: 'Buat Tagihan' } as CardAction] : []),
          ...(can.markPaid ? [markPaid] : []),
        ])),
      };

    case 'waiting_payment':
      return isLate
        ? { primary: schedule(), menu: withCancel(withTempo(can.markPaid ? [markPaid] : [])) }
        : {
            primary: can.markPaid ? markPaid : schedule(),
            menu: withCancel(withTempo([
              ...(can.markPaid ? [schedule()] : []),
              ...(canTopUp ? [topUp] : []),
            ])),
          };

    /*
      Tayang sebelum lunas. Tanpa tanggal jatuh tempo, jadi tidak ada yang
      "terlambat" — yang tersisa cuma dua pertanyaan: sudah ada tagihan
      temponya? dan sudah masuk uangnya?

      ⚠️ TIDAK ADA "Ganti Tanggal". Memindah tanggal membuat tagihan temponya
      basi (`is_stale`) dan utangnya lenyap dari hitungan; untuk iklan yang
      sudah tayang itu bahkan tidak bermakna. Jalannya: hentikan, lalu pesan
      jadwal baru.

      ⚠️ "Batalkan tagihan" TIDAK di sini — ia hidup di baris tagihan, dan
      disembunyikan di sana begitu ada anggota yang mulai tayang (K8).
    */
    case 'airing_on_credit': {
      const hasBill = billing?.openInvoice != null;
      const tempoBill: CardAction = { id: 'tempo_invoice', label: 'Buat Tagihan (tempo)' };
      const stop: CardAction = {
        id: 'cancel_schedule',
        label: 'Hentikan Tayang',
        destructive: true,
        warns: true,
      };
      const canStop = can.cancelSchedule && entry.status !== 'cancelled';
      const primary = !hasBill && can.createInvoice ? tempoBill : (can.markPaid ? markPaid : null);
      return {
        primary,
        menu: [
          ...(primary?.id === 'tempo_invoice' && can.markPaid ? [markPaid] : []),
          ...(canStop ? [stop] : []),
        ],
      };
    }

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
    'airing_on_credit',
  ];
  return entries.find((e) => pending.includes(stateOf(e))) ?? entries[0];
}

/**
 * KENAPA jadwal ini gugur — dua sebab yang di layar peneliti memang dua layar.
 *
 * - `'released'`    → «Reservasi kedaluwarsa»: tanggalnya dilepas. Hold 1 jam
 *                     pesanan mandiri peneliti lewat (`isSlotHoldReleased`), atau
 *                     `payment_status='expired'`.
 * - `'past_cutoff'` → «Batas bayar terlewat»: tanggalnya tak terkejar (14.00 WIB
 *                     hari tayang), tapi slotnya TIDAK lepas sendiri — slotHold.ts:
 *                     hanya pesanan mandiri yang lepas karena waktu.
 *
 * ⚠️ URUTANNYA MENIRU `deriveOrderUiState`: `isExpired` dihitung sebelum
 * `isTooLateToday`, jadi saat keduanya berlaku yang menang `'released'`. Kalau
 * dibalik, baris "Peneliti melihat" menyebut layar yang TIDAK sedang dibaca
 * penelitinya.
 *
 * ⚠️ Badge «perlu ditagih» yang dulu mewakili `'past_cutoff'` mati sejak b4af05f
 * (1 Sep): `isEntryHoldLapsed` sudah mencakup kondisinya, dan cabang
 * «kedaluwarsa» di atasnya selalu menang. Keadaan itu kini bernama «lewat batas
 * bayar» — di kartu DAN di pil papan Schedule.
 */
export type LapseKind = 'released' | 'past_cutoff';

export function lapseKindOf(entry: AdScheduleEntry, now: number = Date.now()): LapseKind | null {
  if (!isEntryHoldLapsed(entry, now)) return null;
  const released =
    entry.paymentStatus === 'expired' ||
    isSlotHoldReleased({ slotBookedBy: entry.slotBookedBy, slotReservedAt: entry.slotReservedAt }, now);
  return released ? 'released' : 'past_cutoff';
}

/**
 * Chip lapse yang BOLEH tampil di kartu. Order yang masih menunggu review
 * belum sampai ke urusan bayar, jadi tenggat bayar belum pernah berlaku
 * baginya — «kedaluwarsa» di situ menyalahkan hal yang salah (order 08ef25ac
 * sesudah Reset ke Need Review).
 */
export function visibleLapseOf(entry: AdScheduleEntry, state: CardState, now: number = Date.now()): LapseKind | null {
  return state === 'awaiting_review' ? null : lapseKindOf(entry, now);
}

/**
 * Jumlah kartu «belum dibayar» di header tab. `awaiting_review` tidak
 * dihitung: belum ada yang bisa ditagih selama keputusan review belum ada.
 */
export function unpaidCardCount(
  entries: readonly AdScheduleEntry[],
  billings: ReadonlyMap<string, ScheduleBilling | undefined>,
): number {
  return entries.filter((e) => {
    const s = cardStateOf(e, billings.get(e.id));
    return s !== 'paid' && s !== 'cancelled' && s !== 'hold_lapsed' && s !== 'awaiting_review';
  }).length;
}

/**
 * Uang SATU kartu — "ditagih" dan "lunas" yang dicetak bagian tagihannya.
 *
 * ⚠️ SATU DEFINISI, DUA PEMAKAI: bagian tagihan kartu dan header tab. Header dulu
 * menjumlahkan `total_cost` (harga TERCATAT) berlabel «ditagih» — pada 5b73a872
 * ia mencetak «Rp 277.500 ditagih» untuk dua jadwal yang sama-sama batal dan nol
 * tagihan hidup. Sekarang header = jumlah angka kartunya, jadi keduanya tidak
 * bisa berbeda pendapat.
 *
 * - Uang yang SUDAH MASUK selalu dihitung. Ia tidak hilang karena slotnya gugur
 *   atau jadwalnya dibatalkan — terukur 10 Sep 2026: 4 jadwal batal memegang
 *   Rp 429.000. Versi inline sebelumnya ikut membuang baris lunas pada kartu
 *   yang slotnya gugur, jadi bayaran sebagian lenyap dari kartunya sendiri.
 * - Tagihan yang MASIH MENUNGGU dihitung hanya kalau masih bisa dibayar untuk
 *   tanggal ini: `isLiveInvoice` (definisi yang sama dengan `openInvoice`,
 *   sql/53 + sql/83), dan kartunya belum batal, belum gugur, belum terlambat.
 */
export function cardMoneyOf(
  entry: AdScheduleEntry,
  state: CardState,
  billing: ScheduleBilling | undefined,
  now: number = Date.now(),
): { billed: number; paid: number } {
  // Kredit: utangnya berlaku apa pun tanggalnya, juga sesudah jadwalnya
  // dihentikan (K6). `isLiveInvoice` sudah memuat tagihan tempo yang link-nya
  // sedang habis — DB tidak pernah menandainya kedaluwarsa (sql/102).
  const canStillBeBilled = state === 'airing_on_credit' || (
    state !== 'cancelled' &&
    state !== 'hold_lapsed' &&
    !isEntryHoldLapsed(entry, now) &&
    !isLateForSchedule(entry, state, new Date(now)));
  const counted = (billing?.invoices ?? []).filter((i) => i.isPaid || (canStillBeBilled && isLiveInvoice(i)));
  return {
    billed: counted.reduce((sum, i) => sum + i.amount, 0),
    paid: counted.filter((i) => i.isPaid).reduce((sum, i) => sum + i.amount, 0),
  };
}

/**
 * Uang SATU ORDER untuk header tab — jumlah `cardMoneyOf` tiap kartunya.
 *
 * `hasInvoices` membedakan dua nol yang berbeda arti: «belum ada tagihan di
 * sistem» (tak pernah terbit — b672d1ae) dan «tidak ada tagihan yang berlaku»
 * (pernah terbit, semuanya mati — 5b73a872). Checkout yang ditinggal
 * (`source='transaction'`) bukan tagihan, jadi tidak ikut menentukannya.
 *
 * ⚠️ BUKAN `orderTotalOf`. Itu harga tercatat — pertanyaan pembukuan.
 */
export function orderMoneyOf(
  entries: readonly AdScheduleEntry[],
  billings: ReadonlyMap<string, ScheduleBilling>,
  now: number = Date.now(),
): { billed: number; paid: number; hasInvoices: boolean } {
  let billed = 0;
  let paid = 0;
  let hasInvoices = false;
  for (const e of entries) {
    const b = billings.get(e.id);
    const state = cardStateOf(e, b, { holdLapsed: isEntryHoldLapsed(e, now) });
    const money = cardMoneyOf(e, state, b, now);
    billed += money.billed;
    paid += money.paid;
    hasInvoices ||= (b?.invoices ?? []).some((i) => i.source === 'invoice');
  }
  return { billed, paid, hasInvoices };
}
