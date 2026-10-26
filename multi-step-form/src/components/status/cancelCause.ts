import type { ScheduleCancelCause } from '@/utils/supabase';
import type { TranslationKey } from '@/i18n/translations';

/**
 * Kalimat kartu untuk jadwal yang batal, menurut PENYEBABNYA (sql/129).
 *
 * Dulu kedua keadaan di bawah selalu menyebut tim — "Tim Jakpat membatalkan
 * tanggal tayang…" / "Jadwal ini dibatalkan tim kami." — padahal pembatalan
 * yang sama juga lahir dari peneliti sendiri dan dari hold 60 menit yang
 * habis. Menyebut tim untuk pembatalan yang dilakukan peneliti membuatnya
 * mengira ada keputusan yang harus ia tanyakan.
 *
 * `null` = batal sebelum sql/129 (pelakunya tidak tercatat): kalimat netral,
 * tidak menuduh siapa pun.
 *
 *   slot_cancelled  jadwal PERTAMA dilepas, pesanan & review tetap hidup
 *   cancelled       jadwal lanjutan (perpanjangan / gelombang tambahan)
 */
const SLOT_CANCELLED: Record<ScheduleCancelCause | 'unknown', TranslationKey> = {
  admin: 'bannerSubSlotCancelled',
  researcher: 'bannerSubSlotCancelledResearcher',
  expired: 'bannerSubSlotCancelledExpired',
  unknown: 'bannerSubSlotCancelledUnknown',
};

const SCHEDULE_CANCELLED: Record<ScheduleCancelCause | 'unknown', TranslationKey> = {
  admin: 'calloutCancelledSchedule',
  researcher: 'calloutCancelledScheduleResearcher',
  expired: 'calloutCancelledScheduleExpired',
  unknown: 'calloutCancelledScheduleUnknown',
};

export function cancelNoteKey(
  state: 'slot_cancelled' | 'cancelled',
  cause: ScheduleCancelCause | null | undefined,
): TranslationKey {
  const table = state === 'slot_cancelled' ? SLOT_CANCELLED : SCHEDULE_CANCELLED;
  return table[cause ?? 'unknown'] ?? table.unknown;
}

/** Baris "Peneliti melihat" di papan admin — keadaan yang sama, kata admin. */
export function adminCancelLine(cause: ScheduleCancelCause | null | undefined): string {
  switch (cause) {
    case 'admin': return 'Jadwal tayang dibatalkan tim Jakpat — tidak ada langkah untuk peneliti.';
    case 'researcher': return 'Peneliti membatalkan jadwal ini sendiri — tidak ada langkah lanjutan.';
    case 'expired': return 'Dilepas otomatis: batas bayar 60 menit habis — tidak ada langkah untuk peneliti.';
    default: return 'Jadwal tayang dibatalkan (pelakunya tidak tercatat, sebelum sql/129) — tidak ada langkah untuk peneliti.';
  }
}
