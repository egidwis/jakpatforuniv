import type { AdScheduleEntry } from '@/utils/supabase';
import {
  STATUS_TOKENS,
  UNSCHEDULED_TOKEN,
  type StatusToken,
  type LifecycleStage,
} from '@/lib/status-tokens';
import { isPaymentTooLateForDate, toWibYmd } from '@/utils/airing-window';

// ─────────────────────────────────────────────────────────────
// Logika papan Schedule, tanpa JSX — supaya bisa dibaca dan diuji tanpa
// merender apa pun. Semua yang di sini murni: entri masuk, keputusan keluar.
// ─────────────────────────────────────────────────────────────

/**
 * ⚠️ SEMUA WAKTU DIBACA DALAM WIB, BUKAN ZONA PERANGKAT.
 * `ad_schedules.start_date` adalah instant. Admin yang membuka papan ini dari
 * luar WIB harus tetap melihat hari dan jam yang sama dengan yang dilihat
 * peneliti — sebuah iklan yang tayang 15.00 WIB tidak boleh muncul di baris
 * hari sebelumnya hanya karena laptopnya disetel UTC.
 */
const WIB = 'Asia/Jakarta';

const timeFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: WIB, hour: '2-digit', minute: '2-digit', hour12: false,
});
const dayFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: WIB, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const shortDayFmt = new Intl.DateTimeFormat('id-ID', {
  timeZone: WIB, weekday: 'short', day: 'numeric', month: 'short',
});

export const formatWibTime = (iso: string) => timeFmt.format(new Date(iso)).replace(':', '.');
export const formatWibDay = (iso: string) => dayFmt.format(new Date(iso));
export const formatWibShort = (iso: string) => shortDayFmt.format(new Date(iso));

/**
 * "Belum dijadwalkan" punya DUA bentuk, dan keduanya harus mendarat di blok
 * yang sama:
 *
 *   1. `start_date` NULL — order belum memilih jendela sama sekali (sql/46
 *      melahirkan barisnya; sebelum itu order ini tidak punya baris cermin).
 *   2. order Kilat yang gelombangnya belum ditugaskan admin. Barisnya PUNYA
 *      tanggal, tapi jamnya 00.00 WIB — dan 00.00 bukan gelombang Kilat
 *      (08/11/14/17). sql/45 menulis panjang bahwa `kilat_slot_hour IS NULL`
 *      adalah penanda sahnya, dan siapa pun yang membaca jam dari tabel itu
 *      tanpa mengeceknya salah baca. Merender "00.00" di papan ini persis
 *      kesalahan yang diperingatkan di sana.
 */
export function isUnscheduled(e: AdScheduleEntry): boolean {
  if (!e.startDate) return true;
  return e.distributionType === 'kilat' && e.kilatSlotHour === null;
}

/** Reservasi user yang tidak dibayar dalam 1 jam sudah dilepas — cerminnya belum tahu. */
function isExpiredHold(e: AdScheduleEntry, now: number): boolean {
  if (e.slotBookedBy !== 'user' || !e.slotReservedAt) return false;
  if (e.paymentStatus === 'paid' || e.paymentStatus === 'completed') return false;
  return now > new Date(e.slotReservedAt).getTime() + 3_600_000;
}

export type ChipKind = LifecycleStage;

/**
 * Satu chip per entri, dua sumbu — presedens berhenti di yang pertama cocok.
 * Polanya disalin dari `deriveLifecycle` (submissions/lifecycle.ts:101) supaya
 * papan dan daftar Submissions tidak pernah menamai keadaan yang sama dengan
 * dua nama berbeda.
 */
export function chipKindOf(e: AdScheduleEntry, now: number = Date.now()): ChipKind {
  if (e.reviewStatus === 'rejected') return 'rejected';
  if (e.reviewStatus === 'spam') return 'spam';
  if (e.status === 'live') return 'live';
  if (e.status === 'scheduled') return 'page_scheduled';
  if (e.status === 'completed') return 'completed';
  if (e.status === 'paid') return 'paid';
  if (e.status === 'waiting_payment') return 'awaiting_payment';
  if (e.status === 'slot_reserved') {
    // Slot yang holdnya sudah kedaluwarsa sudah TIDAK ditahan lagi. Menampilkan
    // "Reserved" di papan pantau untuk slot yang sudah dilepas adalah kebohongan
    // yang tepat berbahaya di sini: admin memakai papan ini untuk menilai
    // kapasitas.
    return isExpiredHold(e, now) ? 'reserved_expired' : 'reserved';
  }
  if (e.reviewStatus === 'in_review') return 'in_review';
  return 'approved';
}

export function tokenForChip(kind: ChipKind): StatusToken {
  return STATUS_TOKENS[kind];
}

/**
 * Chip untuk permukaan yang DIURUT MENURUT TANGGAL (Agenda, papan Iklan, drawer).
 *
 * ⚠️ KENAPA TIDAK CUKUP `chipKindOf`.
 * `chipKindOf` membaca `ad_schedules.status`, cermin dari
 * `form_submissions.submission_status` — dan kolom itu TIDAK PERNAH MAJU SENDIRI.
 * Ia beku di aksi manusia terakhir. Terukur 2026-08-09 atas 542 jadwal yang
 * uangnya sudah aman:
 *
 *   jendelanya SUDAH LEWAT → 238 'Approved', 172 'Live', 59 'Scheduled',
 *                            30 'Paid', 28 'Reserved', dan hanya 15 'Completed'
 *   SEDANG TAYANG          → hanya 2 dari 5 yang berbunyi 'Live'
 *
 * Di daftar yang diurutkan per hari, itu bukan sekadar tidak akurat — ia
 * MENYANGKAL POSISI BARISNYA SENDIRI. Sebuah baris yang duduk di bawah pita
 * "HARI INI" dengan bilah kemajuan berjalan tapi berlabel "Paid" membuat admin
 * bertanya mana yang benar, dan jawabannya selalu: pitanya. Dua order yang
 * sama-sama tayang hari ini bisa berlabel 'Paid' dan 'Live' hanya karena yang
 * satu pernah disentuh admin dan yang lain tidak.
 *
 * Maka di sini sumbu waktu yang menang — sumbu yang sama yang menempatkan baris
 * itu pada harinya.
 *
 * TAPI HANYA SESUDAH UANGNYA AMAN. Selama slot ditahan tanpa pembayaran, yang
 * paling perlu dibaca admin justru keadaan uangnya, bukan "sebentar lagi
 * tayang" — jadi 'Reserved' / 'Waiting Payment' dipertahankan apa adanya.
 *
 * ⚠️ `occupiesSlot()` SENGAJA TETAP MEMAKAI `chipKindOf`. Ia menghitung kuota,
 * dan ia mengecualikan 'completed'. Kalau ia ikut memakai fungsi ini, SETIAP
 * iklan yang jendelanya sudah lewat berhenti menempati harinya dan papan
 * kapasitas minggu lampau berubah jadi 0/4 — riwayat yang terhapus.
 */
export function agendaChipOf(e: AdScheduleEntry, now: number): ChipKind {
  const kind = chipKindOf(e, now);

  // Dibatalkan & belum berjadwal tidak punya jendela untuk dibaca.
  if (CANCELLED_CHIPS.includes(kind)) return kind;
  if (isUnscheduled(e) || !e.startDate) return kind;

  // "Aman" = lunas, ATAU sudah dikomit di sumbu tayang (32 order dibayar di luar
  // sistem dan kolom uangnya tidak pernah menyusul — lihat holdStateOf).
  const secured =
    e.paymentStatus === 'paid' || e.paymentStatus === 'completed' ||
    e.status === 'scheduled' || e.status === 'live' || e.status === 'completed';

  if (!secured) return kind;

  const start = new Date(e.startDate).getTime();
  const end = e.endDate ? new Date(e.endDate).getTime() : start;

  if (now < start) return 'page_scheduled';
  if (now >= end) return 'completed';
  return 'live';
}

/**
 * Apakah jadwal ini MEMAKAN kuota harian.
 *
 * Aturannya disamakan dengan `fetchSlotAvailability` (supabase.ts) — kalau papan
 * kapasitas dan wizard penjadwalan memakai aturan berbeda, admin akan melihat
 * "2/4" sementara peneliti ditolak karena harinya penuh.
 *
 * Bedanya satu, dan sengaja: hold user yang sudah kedaluwarsa TIDAK dihitung.
 * Slotnya memang sudah dilepas; menghitungnya membuat hari terlihat lebih penuh
 * daripada yang sebenarnya bisa dijual.
 */
export function occupiesSlot(e: AdScheduleEntry, now: number): boolean {
  if (!e.startDate || !e.endDate) return false;
  const kind = chipKindOf(e, now);
  return !(
    kind === 'rejected' || kind === 'spam' || kind === 'in_review' ||
    kind === 'completed' || kind === 'reserved_expired'
  );
}

/**
 * Setiap hari (YYYY-MM-DD WIB) yang ditahan sebuah jadwal.
 *
 * ⚠️ AKHIR-EKSKLUSIF, dan ini bukan selera. Tanggal akhir adalah hari
 * SERAH-TERIMA pukul 15.00 — saat iklan ini turun dan gelombang berikutnya naik
 * — bukan hari tayang. Iklan 2 hari yang mulai 30 Jul menahan 30 dan 31 Jul,
 * lalu berakhir 1 Agu 15.00. Memakai `>` alih-alih `>=` membuat setiap iklan
 * terlihat menahan satu hari lebih banyak daripada yang sebenarnya, dan hari
 * serah-terima terhitung dua kali.
 *
 * Aturan yang sama dipakai `fetchSlotAvailability`. Diangkat ke sini dari
 * `AdsWeekBoard.byCell` saat Agenda ikut memerlukannya: dua salinan aturan
 * pemekaran adalah dua papan yang bisa berbeda pendapat soal hari mana yang
 * penuh.
 *
 * Jadwal tanpa tanggal mengembalikan daftar kosong, bukan melempar — papan
 * memutuskan sendiri apa yang dilakukan terhadapnya (lihat `isUnscheduled`).
 */
export function airingDaysOf(e: AdScheduleEntry): string[] {
  if (!e.startDate || !e.endDate) return [];

  const endYmd = toWibYmd(new Date(e.endDate));
  const days: string[] = [];
  const cursor = new Date(e.startDate);

  // Penjaga 400 iterasi: data rusak (end_date bertahun-tahun setelah start)
  // tidak boleh menggantung tab. Iklan terpanjang yang sah 30 hari.
  for (let guard = 0; guard < 400; guard += 1) {
    const ymd = toWibYmd(cursor);
    if (ymd >= endYmd) break;
    days.push(ymd);
    cursor.setDate(cursor.getDate() + 1);
  }

  // Jendela yang lebih pendek dari sehari (start === end) tetap satu hari tayang:
  // ia benar-benar menahan slot hari itu, dan mengembalikan kosong akan
  // menghilangkannya dari papan sama sekali.
  if (days.length === 0) days.push(toWibYmd(new Date(e.startDate)));
  return days;
}

/**
 * Apakah slot jadwal ini BENAR-BENAR sedang ditahan.
 *
 * Ini gerbang daftar hari di Agenda, dan ia sengaja BUKAN `status ===
 * 'waiting_payment'`. Terukur 2026-08-09: hanya **3 baris** di seluruh tabel
 * yang pernah memakai nilai itu, sementara 237 baris duduk di `requested` +
 * `in_review` — 156 di antaranya sudah LUNAS. Order memilih tanggal saat
 * checkout, jauh sebelum admin mereviewnya, jadi `status` tidak pernah jadi
 * sumbu pembayaran. Menggerbangi Agenda dengan nilai itu akan mengosongkannya.
 *
 * Presedens berhenti di cabang pertama yang cocok, pola yang sama dengan
 * `chipKindOf`.
 */
export type HoldState = 'held' | 'lapsed' | 'not_yet';

export function holdStateOf(e: AdScheduleEntry, now: number): HoldState {
  const kind = chipKindOf(e, now);

  // Dibatalkan & belum berjadwal punya sakelarnya sendiri di toolbar; keduanya
  // bukan urusan gerbang ini.
  if (CANCELLED_CHIPS.includes(kind)) return 'not_yet';
  if (isUnscheduled(e)) return 'not_yet';

  // ⚠️ CABANG TAYANG WAJIB DI ATAS CABANG UANG, JANGAN DIBALIK.
  // 32 baris di produksi berstatus scheduled/live/completed dengan
  // `payment_status` yang TIDAK lunas — dibayar di luar sistem, dan kolomnya
  // memang tidak pernah menyusul (lihat memo payment-status-not-proof-of-payment).
  // Iklan yang sudah di udara tidak boleh lenyap dari kalender karena kolom uang
  // berbohong tentangnya.
  if (e.status === 'scheduled' || e.status === 'live' || e.status === 'completed') {
    return 'held';
  }

  if (e.paymentStatus === 'paid' || e.paymentStatus === 'completed') return 'held';

  // ⚠️ HANYA YANG BENAR-BENAR MENAHAN SLOT YANG BISA GUGUR.
  //
  // Pemeriksaan tenggat WAJIB dipagari di dalam cabang ini, bukan dijalankan
  // sebelum tahu apakah barisnya memegang slot. Order 'requested'/'in_review'
  // memilih tanggal saat checkout dan tidak pernah memesan apa pun — 237 baris
  // di produksi, hampir semuanya bertanggal lampau. Tanpa pagar ini semuanya
  // jatuh ke 'lapsed' dan membanjiri blok "batas bayar terlewat" dengan order
  // yang tidak punya slot untuk diselamatkan. Persis derau yang gerbang ini ada
  // untuk membuangnya.
  if (kind === 'reserved' || kind === 'reserved_expired' || kind === 'awaiting_payment') {
    if (e.paymentStatus === 'expired') return 'lapsed';
    // Hold DOKU 1 jam sudah lewat — slotnya sudah dilepas.
    if (kind === 'reserved_expired') return 'lapsed';
    // Batas bayar 14.00 WIB pada hari tayang (airing-window.ts).
    if (e.startDate && isPaymentTooLateForDate(toWibYmd(new Date(e.startDate)), new Date(now))) {
      return 'lapsed';
    }
    return 'held';
  }

  // Sisanya: punya tanggal, tapi tidak pernah memesan apa pun.
  // Punya tanggal ≠ menahan slot.
  return 'not_yet';
}

export { UNSCHEDULED_TOKEN };

/** Urutan chip di baris filter — dari paling awal ke paling akhir siklus. */
export const CHIP_ORDER: ChipKind[] = [
  'in_review',
  'approved',
  'reserved',
  'reserved_expired',
  'awaiting_payment',
  'paid',
  'page_scheduled',
  'live',
  'completed',
];

/** rejected + spam dilipat jadi satu sakelar "Batal" — keduanya tidak menempati jendela. */
export const CANCELLED_CHIPS: ChipKind[] = ['rejected', 'spam'];

export const PAGE_LABEL: Record<AdScheduleEntry['pageStatus'], string> = {
  published: 'terbit',
  draft: 'draft',
  none: '⚠ blm',
  // Kilat memang TIDAK PERNAH punya halaman (guard ensure_survey_page, sql/42).
  // "—" dan "⚠ blm" harus berbeda: yang satu benar, yang lain pekerjaan tertunda.
  kilat: '—',
};

/**
 * Satu jadwal PADA SATU HARI tayangnya.
 *
 * ⚠️ `dayIndex` BUKAN peringkat. Tidak ada sumbu keadaan apa pun yang membedakan
 * hari pertama dari hari lanjutan: datanya `AdScheduleEntry` yang sama persis,
 * dengan status, harga, dan pembayaran yang sama. Ia semata POSISI dalam
 * rentang, dan Agenda merender setiap hari sebagai baris penuh yang identik —
 * keputusan pemilik produk 2026-08-09, ditulis di sini supaya tidak "diperbaiki"
 * kembali jadi baris sekunder nanti.
 */
export interface DayEntry {
  entry: AdScheduleEntry;
  /** 1-based; `1` untuk hari pertama. */
  dayIndex: number;
  /** Total hari tayang jadwal ini. `1` berarti tidak perlu ditampilkan. */
  dayCount: number;
}

export interface DayGroup {
  /** YYYY-MM-DD dalam WIB. */
  ymd: string;
  label: string;
  isToday: boolean;
  entries: DayEntry[];
}

export interface FilterState {
  service: 'all' | string;
  chips: Set<ChipKind>;
  showCancelled: boolean;
  /**
   * Order tanpa jendela tayang. MATI secara default: papan ini untuk melihat
   * jadwal, dan yang belum punya jadwal bukan jadwal.
   *
   * ⚠️ Tapi ia tidak boleh hilang sama sekali. Sebagian dari order tanpa tanggal
   * ini SUDAH LUNAS — 6 dari 37 saat ditulis, dan angkanya bergerak tiap hari,
   * jadi jangan perlakukan sebagai konstanta. Uangnya sudah masuk dan tidak ada
   * satu pun layar admin lain yang menampilkannya. Karena itu ia jadi filter yang
   * bisa dinyalakan lewat pil "belum dijadwalkan", bukan fitur yang dibuang.
   */
  showUnscheduled: boolean;
  /**
   * Jadwal yang tahanan slotnya GUGUR — bayar kedaluwarsa, hold user lewat, atau
   * batas 14.00 WIB pada hari tayang terlewat tanpa pelunasan.
   *
   * MATI secara default: slotnya sudah tidak ditahan, jadi ia bukan jadwal lagi
   * dan tidak boleh ikut menghitung hari. Tapi ia juga tidak boleh lenyap —
   * justru inilah yang bisa diselamatkan admin lewat reschedule. Karena itu ia
   * jadi sakelar di pil "lewat batas bayar", persis pola `showUnscheduled`.
   */
  showLapsed: boolean;
  /** Sorot halaman terbit yang bannernya masih bawaan. Pola sama dengan Pages. */
  showPlaceholderBanner: boolean;
  query: string;
}

/** Halaman sudah terbit tapi masih memakai gambar bawaan — pekerjaan yang mendesak. */
export function needsBannerSwap(e: AdScheduleEntry): boolean {
  return e.pageStatus === 'published' && e.pageBannerIsPlaceholder;
}

export function matchesFilter(e: AdScheduleEntry, f: FilterState, now: number): boolean {
  const kind = chipKindOf(e, now);

  if (isUnscheduled(e) && !f.showUnscheduled) return false;

  // Gerbang tahanan slot. Dijalankan SESUDAH `isUnscheduled` supaya pil "belum
  // dijadwalkan" tetap memegang kendalinya sendiri, dan sebelum filter chip
  // supaya menyalakan satu chip tidak diam-diam menarik kembali yang sudah gugur.
  const hold = holdStateOf(e, now);
  if (hold === 'not_yet' && !isUnscheduled(e)) return false;
  if (hold === 'lapsed' && !f.showLapsed) return false;

  if (f.showPlaceholderBanner && !needsBannerSwap(e)) return false;

  if (CANCELLED_CHIPS.includes(kind)) {
    if (!f.showCancelled) return false;
  } else if (f.chips.size > 0 && !f.chips.has(kind)) {
    return false;
  }

  if (f.service !== 'all' && (e.distributionType || 'regular') !== f.service) return false;

  if (f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    if (!e.title.toLowerCase().includes(q) && !e.researcherName.toLowerCase().includes(q)) {
      return false;
    }
  }
  return true;
}

/**
 * Entri yang jendelanya BERIRISAN dengan [from, to] — bukan yang mulai di
 * dalamnya. Iklan 7 hari yang mulai minggu lalu masih tayang minggu ini dan
 * harus terlihat; kalau tidak, papan berbohong tentang kapasitas.
 */
export function overlapsWindow(e: AdScheduleEntry, from: Date, to: Date): boolean {
  if (!e.startDate) return false;
  const start = new Date(e.startDate).getTime();
  const end = e.endDate ? new Date(e.endDate).getTime() : start;
  return start <= to.getTime() && end >= from.getTime();
}

/**
 * Kelompokkan per hari — MEMEKAR, satu baris untuk TIAP hari yang ditahan.
 *
 * Sebelumnya sebuah jadwal hanya mendarat di hari mulainya, jadi iklan 4 hari
 * tak terlihat di tiga hari sisanya padahal ia menahan kuota di sana — dan
 * Agenda tidak bisa menjawab "besok sudah penuh belum".
 *
 * `window` memotong hari hasil pemekaran ke periode yang sedang dilihat.
 * Tampilan "Agustus" karena itu hanya memuat pita hari Agustus; iklan yang mulai
 * 29 Juli tetap terlihat sebagai baris di 1 Agu, hari yang memang masih
 * ditahannya. Tanpa pemotongan, memilih Agustus akan memunculkan pita Juli yang
 * kuotanya TIDAK LENGKAP — iklan yang mulai lebih awal lagi tidak ikut tertarik
 * masuk, dan hari setengah terisi lebih menyesatkan daripada hari yang absen.
 * `null` = "Semua Bulan": tidak ada yang dipotong.
 */
export function groupByDay(
  entries: AdScheduleEntry[],
  todayYmd: string,
  window: { fromYmd: string; toYmd: string } | null = null
): DayGroup[] {
  const map = new Map<string, DayEntry[]>();

  for (const e of entries) {
    const days = airingDaysOf(e);
    if (days.length === 0) continue;

    days.forEach((ymd, i) => {
      if (window && (ymd < window.fromYmd || ymd > window.toYmd)) return;
      const item: DayEntry = { entry: e, dayIndex: i + 1, dayCount: days.length };
      const list = map.get(ymd);
      if (list) list.push(item);
      else map.set(ymd, [item]);
    });
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ymd, list]) => ({
      ymd,
      // Label diturunkan dari HARI ITU, bukan dari `startDate` entri pertama —
      // sesudah pemekaran keduanya sering berbeda, dan memakai startDate akan
      // memberi pita "29 Juli" pada kelompok hari 1 Agustus.
      label: formatWibDay(`${ymd}T08:00:00.000Z`),
      isToday: ymd === todayYmd,
      entries: list.sort((a, b) => {
        const t = new Date(a.entry.startDate!).getTime() - new Date(b.entry.startDate!).getTime();
        return t !== 0 ? t : a.entry.title.localeCompare(b.entry.title);
      }),
    }));
}

export interface BoardAlerts {
  /** Tahanan slotnya gugur — PERSIS baris yang `holdStateOf` sebut `lapsed`. */
  lateForPayment: number;
  paidWithoutPage: number;
  unscheduled: number;
  /** Halaman terbit, banner masih bawaan. */
  placeholderBanner: number;
}

/**
 * Tiga angka di kepala papan. Ketiganya "pekerjaan yang menunggu", bukan
 * statistik — karena itu semuanya dihitung atas SELURUH data, bukan atas
 * periode yang sedang dilihat. Pekerjaan yang tertinggal di minggu lalu tidak
 * boleh hilang hanya karena admin menggeser periode.
 */
export function computeAlerts(entries: AdScheduleEntry[], now: number = Date.now()): BoardAlerts {
  let lateForPayment = 0;
  let paidWithoutPage = 0;
  let unscheduled = 0;
  let placeholderBanner = 0;

  for (const e of entries) {
    const kind = chipKindOf(e, now);
    if (CANCELLED_CHIPS.includes(kind)) continue;

    if (isUnscheduled(e)) {
      unscheduled += 1;
      continue;
    }

    // ⚠️ DITURUNKAN DARI `holdStateOf`, bukan dihitung ulang di sini. Angka di
    // pil dan isi blok yang dibukanya WAJIB baris yang sama persis — versi lama
    // memakai daftar chip sendiri, dan begitu gerbangnya berubah keduanya
    // langsung bercerai tanpa ada yang menyadarinya.
    if (holdStateOf(e, now) === 'lapsed') lateForPayment += 1;

    if (kind === 'paid' && e.pageStatus === 'none') paidWithoutPage += 1;
    if (needsBannerSwap(e)) placeholderBanner += 1;
  }
  return { lateForPayment, paidWithoutPage, unscheduled, placeholderBanner };
}
