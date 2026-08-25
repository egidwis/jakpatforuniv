import type { ChipVariant } from "../components/ui/chip"

/**
 * Canonical status color map for the admin dashboard.
 *
 * Color semantics:
 * - blue   = review / reserved / scheduled
 * - amber  = waiting / expiring
 * - green  = paid / approved / live
 * - red    = rejected / expired
 * - orange = spam
 * - indigo = page
 * - purple = voucher / education
 * - slate  = neutral / done
 */
export type LifecycleStage =
  | "in_review"
  | "approved"
  | "rejected"
  | "spam"
  | "reserved"
  | "reserved_expiring"
  | "reserved_expired"
  | "awaiting_payment"
  | "paid"
  | "completed"
  | "page_scheduled"
  | "live"
  /**
   * Dibatalkan.
   *
   * Terukur di produksi 2026-08-19 — 136 baris `ad_schedules.status =
   * 'cancelled'`, dan rinciannya penting:
   *
   *   135 dari `form_submissions` (119 spam + 16 rejected). Mereka lahir dari
   *       `airing_status_of()` yang memetakan rejected/spam -> 'cancelled',
   *       jadi `review_status`-nya rejected/spam dan dua cabang PERTAMA
   *       `chipKindOf` sudah menangkapnya. Tidak pernah salah label.
   *     1 dari `form_submissions_extend`. Mirror extend menulis status APA
   *       ADANYA (tanpa airing_status_of) sementara `review_status` diwarisi
   *       induk yang 'approved' — jadi baris ini jatuh ke cabang terakhir,
   *       terbaca "Approved", dan lewat `occupiesSlot()` ikut MEMAKAN KUOTA.
   *
   * Jadi nilai union ini bukan "memperbaiki 136 baris" melainkan: memberi
   * pembatalan sebuah nama, supaya `slot_cancelled` (sql/62) punya tempat
   * mendarat dan setiap permukaan DIPAKSA menamainya oleh type-checker.
   */
  | "cancelled"

export interface StatusToken {
  label: string
  variant: ChipVariant
  dot?: boolean
  pulse?: boolean
}

export const STATUS_TOKENS: Record<LifecycleStage, StatusToken> = {
  in_review: { label: "Need Review", variant: "blue", dot: true },
  cancelled: { label: "Dibatalkan", variant: "slate" },
  approved: { label: "Approved", variant: "indigo" },
  // Amber, BUKAN merah. Merah berarti final/gagal, dan "Menunggu Perbaikan"
  // bukan keduanya: bolanya di peneliti, dan admin masih bisa meloloskannya
  // begitu ia memperbaiki. Chip drawer & banner peneliti sudah amber — ini
  // menyelaraskan permukaan terakhir yang masih berteriak merah.
  rejected: { label: "Menunggu Perbaikan", variant: "amber" },
  spam: { label: "Tidak Valid", variant: "orange" },
  reserved: { label: "Reserved", variant: "blue" },
  reserved_expiring: {
    label: "Reserved · <1h",
    variant: "amber",
    dot: true,
    pulse: true,
  },
  reserved_expired: { label: "Slot Expired", variant: "red" },
  awaiting_payment: { label: "Waiting Payment", variant: "amber", dot: true },
  paid: { label: "Paid", variant: "purple" },
  completed: { label: "Completed", variant: "slate" },
  page_scheduled: { label: "Page Scheduled", variant: "indigo" },
  live: { label: "Live", variant: "green", dot: true, pulse: true },
}

export const KILAT_TOKEN: StatusToken = { label: "⚡ KILAT", variant: "amber" }

/**
 * Papan Schedule (Phase 3) membaca `ad_schedules.status`, yang punya satu
 * keadaan yang tidak dimiliki `LifecycleStage`: order tanpa jendela tayang
 * sama sekali (`unscheduled`, sql/46). 87 order per 2026-08-08, termasuk order
 * yang sudah lunas.
 *
 * Sengaja DI LUAR `STATUS_TOKENS`, mengikuti pola KILAT_TOKEN di atas.
 * `STATUS_TOKENS` bertipe `Record<LifecycleStage, StatusToken>`, jadi menambah
 * anggota ke union itu memaksa cabang baru di `deriveLifecycle` — dan menulis
 * ulang `deriveLifecycle` adalah Task 9B, bukan pekerjaan papan ini.
 */
export const UNSCHEDULED_TOKEN: StatusToken = { label: "Belum Dijadwalkan", variant: "slate" }

/**
 * `ad_schedules.status` (sumbu tayang, sql/46) -> token chip.
 *
 * Presedensnya ada di pemanggil, bukan di sini: sumbu review menang untuk
 * rejected/spam. Lihat `chipForSchedule()` di ScheduleBoardPage.
 */
export const AIRING_STATUS_TOKENS: Record<string, StatusToken> = {
  unscheduled: UNSCHEDULED_TOKEN,
  requested: { label: "Diminta", variant: "blue" },
  slot_reserved: STATUS_TOKENS.reserved,
  waiting_payment: STATUS_TOKENS.awaiting_payment,
  paid: STATUS_TOKENS.paid,
  scheduled: STATUS_TOKENS.page_scheduled,
  live: STATUS_TOKENS.live,
  completed: STATUS_TOKENS.completed,
  cancelled: STATUS_TOKENS.cancelled,
}
