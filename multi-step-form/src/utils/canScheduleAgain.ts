import type { AdScheduleEntry, FormSubmission } from './supabase';
import { occupiesSlot } from '@/pages/dashboard/schedule/scheduleModel';

/**
 * Boleh menawarkan tombol "Jadwalkan Iklan Lagi"?
 *
 * ⚠️ DIUKUR DARI KUOTA, BUKAN DARI TAGIHAN — dan bedanya bukan akademis.
 * Kuota harian dihitung menurut STATUS (`assert_daily_ad_quota_free` kaki 2:
 * `status IN ('waiting_payment','paid','scheduled','live')`), bukan menurut
 * pembayaran. Jadi jadwal `waiting_payment` yang belum dibayar dan bahkan
 * belum pernah ditagih TETAP memakan kuota hari itu.
 *
 * Kalau gerbang ini memakai "ada tagihan hidup", peneliti bisa menumpuk
 * beberapa jadwal `waiting_payment` tanpa tagihan di tanggal-tanggal BERBEDA
 * — `assert_schedule_window_free` hanya menolak irisan tanggal yang sama —
 * dan menghabiskan kapasitas peneliti lain tanpa pernah membayar sepeser pun.
 *
 * ⚠️ SATU-SATUNYA PELEPAS OTOMATIS adalah hold peneliti yang basi:
 * `slot_booked_by='user'` DAN belum lunas DAN lewat 1 jam. Jadwal admin tidak
 * pernah lepas sendiri (`slotHold.ts`) — itu sebabnya jadwal `waiting_payment`
 * buatan admin memblokir tombol ini selamanya sampai admin bertindak.
 * Aturan itu tidak disalin ke sini; `occupiesSlot()` sudah memuatnya.
 *
 * Efek samping yang diinginkan: begitu reservasi dibatalkan
 * (`status='cancelled'`), `occupiesSlot()` jadi false, kuotanya kembali, dan
 * tombolnya muncul lagi dengan sendirinya. Satu predikat melayani keduanya.
 */

/** Sebab tombol disembunyikan — `null` berarti tidak disembunyikan. */
export type ScheduleAgainBlock = 'kilat' | 'order_inactive' | 'quota_held' | null;

type OrderShape = Pick<FormSubmission, 'distribution_type' | 'submission_status'>;

/**
 * Status order yang TIDAK boleh menambah jadwal.
 *
 * Cerminan `sql/88`. ⚠️ `in_review` ikut di sini tapi TIDAK ada di sql/88:
 * di server ia ditolak penjaga `review_status_of()` yang terpisah. Dua daftar
 * yang berbeda karena dua penjaga yang berbeda — jangan disamakan.
 */
const INACTIVE_STATUSES = ['in_review', 'slot_cancelled', 'cancelled', 'rejected', 'spam'];

export function scheduleAgainBlock(
  submission: OrderShape,
  entries: AdScheduleEntry[],
  now: number = Date.now(),
): ScheduleAgainBlock {
  // Kilat menang atas sebab lain: gelombangnya (8/11/14/17 WIB) ditugaskan
  // admin, dan nol perpanjangan Kilat pernah terjadi.
  if (submission.distribution_type === 'kilat') return 'kilat';

  if (INACTIVE_STATUSES.includes(submission.submission_status || '')) return 'order_inactive';

  const menahan = entries.some(
    (e) => occupiesSlot(e, now) && e.paymentStatus !== 'paid' && e.paymentStatus !== 'completed',
  );
  if (menahan) return 'quota_held';

  return null;
}

export function canScheduleAgain(
  submission: OrderShape,
  entries: AdScheduleEntry[],
  now: number = Date.now(),
): boolean {
  return scheduleAgainBlock(submission, entries, now) === null;
}
