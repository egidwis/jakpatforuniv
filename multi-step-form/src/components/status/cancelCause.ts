import type { ScheduleCancelCause } from '@/utils/supabase';
import type { TranslationKey } from '@/i18n/translations';
import type { ScheduleAgainBlock } from '@/utils/canScheduleAgain';

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
 *   slot_cancelled  jadwal PERTAMA dilepas → pesanan berakhir bagi peneliti
 *                   (kalimatnya tampil di Fase ①; jalannya order baru)
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

/**
 * Langkah milik peneliti SESUDAH jadwalnya batal — kartu tidak boleh berhenti
 * di "apa yang terjadi" lalu menyuruh bertanya.
 *
 * Mengikuti apa yang server benar-benar izinkan, bukan apa yang enak dibaca:
 * order yang sudah mati (`slot_cancelled` / `cancelled` / `rejected` / `spam`)
 * menolak jadwal baru (sql/88, `door_lock_*` sql/123, `lockPatch`), jadi
 * jalannya order baru. Order yang masih hidup (jadwal perpanjangan yang batal)
 * tinggal memakai tombol "Perpanjang / Pesan gelombang lagi" yang sudah ada.
 * Jadwal lain yang masih menahan kuota → tidak ada langkah baru: selesaikan
 * yang itu dulu.
 *
 *   new_order   → tombol "Buat Order Baru"
 *   pick_again  → kalimat penunjuk ke tombol jadwal-lagi di bawah kartu
 */
export type DeadNext = 'new_order' | 'pick_again' | null;

export function deadNextStep(block: ScheduleAgainBlock): DeadNext {
  if (block === null) return 'pick_again';
  if (block === 'quota_held') return null;
  return 'new_order';
}

/** Baris "Peneliti melihat" di papan admin — keadaan yang sama, kata admin. */
export function adminCancelLine(cause: ScheduleCancelCause | null | undefined): string {
  switch (cause) {
    case 'admin': return 'Jadwal tayang dibatalkan tim Jakpat — peneliti diarahkan membuat order baru atau menjadwalkan lagi.';
    case 'researcher': return 'Peneliti membatalkan jadwal ini sendiri — untuk tayang lagi ia diarahkan membuat order baru atau menjadwalkan lagi.';
    case 'expired': return 'Dilepas otomatis: batas bayar 60 menit habis — peneliti diarahkan membuat order baru atau menjadwalkan lagi.';
    default: return 'Jadwal tayang dibatalkan (pelakunya tidak tercatat, sebelum sql/129) — peneliti diarahkan membuat order baru atau menjadwalkan lagi.';
  }
}
