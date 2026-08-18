/**
 * Umur sebuah reservasi slot — SATU aturan, satu tempat.
 *
 * ⚠️ ATURANNYA: hanya reservasi yang dipesan SENDIRI oleh peneliti
 * (`slot_booked_by === 'user'`) yang bisa lepas karena waktu. Jadwal yang
 * dibuat admin — dan baris lama yang `slot_booked_by`-nya NULL — **tidak
 * pernah lepas sendiri**. Melepasnya adalah keputusan admin, bukan keputusan
 * jam.
 *
 * Ini bukan aturan baru. Ia sudah dijaga di `holdsSlot` (supabase.ts),
 * `deriveLifecycle` (submissions/lifecycle.ts), `deriveOrderUiState`,
 * `isExpiredHold` (schedule/scheduleModel.ts), `PaymentRetryPage`, dan
 * `functions/api/doku/create-payment.js`. Yang TIDAK menjaganya cuma
 * `PaymentCheckoutPage` — dan justru halaman itu satu-satunya yang memanggil
 * `releaseExpiredSlot()`, jadi pelanggarannya yang merusak data.
 *
 * Terukur 2026-08-10, tepat sebelum modul ini lahir: 35 jadwal admin belum
 * lunas yang hold 1 jam-nya SUDAH lewat (6 di antaranya tayang 10–13 Agu), plus
 * 264 baris tanpa `slot_booked_by` yang cabang lamanya hapus SEKETIKA tanpa
 * timer sama sekali.
 *
 * ⚠️ Batas bayar 14.00 WIB (`airing-window.ts`) BUKAN urusan modul ini dan
 * tidak boleh dimasukkan ke sini. Ia tidak melepas slot — ia hanya membuat
 * tanggalnya tidak terkejar, karena admin butuh 14.00–15.00 untuk menyiapkan
 * halaman iklan. Perbedaan itu sudah dinyatakan di
 * `components/status/airingPeriods.ts`.
 */

/** Jendela pembayaran untuk reservasi mandiri: 1 jam sejak `slot_reserved_at`. */
export const SLOT_HOLD_MS = 3_600_000;

export interface SlotHold {
  slotBookedBy: string | null | undefined;
  slotReservedAt: string | null | undefined;
}

/**
 * Instant (ms) saat slot ini lepas dengan sendirinya.
 *
 * `null` berarti **tidak pernah lepas sendiri** — bukan "sudah lepas". Kedua
 * arti itu mudah tertukar, dan tertukarnya persis bug yang modul ini tutup.
 */
export function slotReleaseDeadline(slot: SlotHold): number | null {
  if (slot.slotBookedBy !== 'user') return null;
  if (!slot.slotReservedAt) return null;

  const reservedAt = new Date(slot.slotReservedAt).getTime();
  if (Number.isNaN(reservedAt)) return null;

  return reservedAt + SLOT_HOLD_MS;
}

/**
 * Apakah slot ini sudah lepas karena waktu.
 *
 * Ambangnya eksklusif (`>`), sama dengan `holdsSlot` di supabase.ts: tepat di
 * detik tenggat, slot masih ditahan.
 */
export function isSlotHoldReleased(slot: SlotHold, now: number = Date.now()): boolean {
  const deadline = slotReleaseDeadline(slot);
  if (deadline === null) return false;
  return now > deadline;
}
