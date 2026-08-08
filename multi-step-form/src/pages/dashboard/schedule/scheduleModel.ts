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

export interface DayGroup {
  /** YYYY-MM-DD dalam WIB. */
  ymd: string;
  label: string;
  isToday: boolean;
  entries: AdScheduleEntry[];
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
  query: string;
}

export function matchesFilter(e: AdScheduleEntry, f: FilterState, now: number): boolean {
  const kind = chipKindOf(e, now);

  if (isUnscheduled(e) && !f.showUnscheduled) return false;

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

export function groupByDay(entries: AdScheduleEntry[], todayYmd: string): DayGroup[] {
  const map = new Map<string, AdScheduleEntry[]>();
  for (const e of entries) {
    if (!e.startDate) continue;
    const ymd = toWibYmd(new Date(e.startDate));
    const list = map.get(ymd);
    if (list) list.push(e);
    else map.set(ymd, [e]);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ymd, list]) => ({
      ymd,
      label: formatWibDay(list[0].startDate!),
      isToday: ymd === todayYmd,
      entries: list.sort((a, b) => {
        const t = new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime();
        return t !== 0 ? t : a.title.localeCompare(b.title);
      }),
    }));
}

export interface BoardAlerts {
  lateForPayment: number;
  paidWithoutPage: number;
  unscheduled: number;
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

  for (const e of entries) {
    const kind = chipKindOf(e, now);
    if (CANCELLED_CHIPS.includes(kind)) continue;

    if (isUnscheduled(e)) {
      unscheduled += 1;
      continue;
    }
    // Batas bayar 14.00 WIB pada hari tayang (airing-window.ts). Hanya berlaku
    // untuk yang belum lunas — order lunas tidak punya batas apa pun lagi.
    if (
      e.startDate &&
      (kind === 'awaiting_payment' || kind === 'reserved' || kind === 'reserved_expired') &&
      isPaymentTooLateForDate(toWibYmd(new Date(e.startDate)), new Date(now))
    ) {
      lateForPayment += 1;
    }
    if (kind === 'paid' && e.pageStatus === 'none') {
      paidWithoutPage += 1;
    }
  }
  return { lateForPayment, paidWithoutPage, unscheduled };
}
