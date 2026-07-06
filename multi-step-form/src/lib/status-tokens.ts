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

export interface StatusToken {
  label: string
  variant: ChipVariant
  dot?: boolean
  pulse?: boolean
}

export const STATUS_TOKENS: Record<LifecycleStage, StatusToken> = {
  in_review: { label: "Need Review", variant: "blue", dot: true },
  approved: { label: "Approved", variant: "indigo" },
  rejected: { label: "Rejected", variant: "red" },
  spam: { label: "Spam", variant: "orange" },
  reserved: { label: "Reserved", variant: "blue" },
  reserved_expiring: {
    label: "Reserved · <1h",
    variant: "amber",
    dot: true,
    pulse: true,
  },
  reserved_expired: { label: "Expired", variant: "red" },
  awaiting_payment: { label: "Waiting Payment", variant: "amber", dot: true },
  paid: { label: "Paid", variant: "purple" },
  completed: { label: "Completed", variant: "slate" },
  page_scheduled: { label: "Page Scheduled", variant: "indigo" },
  live: { label: "Live", variant: "green", dot: true, pulse: true },
}

export const KILAT_TOKEN: StatusToken = { label: "⚡ KILAT", variant: "amber" }
