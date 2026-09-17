/**
 * Primitif mana yang memesan ulang jadwal ini — SATU keputusan, satu tempat.
 *
 * ⚠️ INI KEMBARAN `expiryPlanFor` (`scheduleExpiry.ts`), dan sengaja memakai
 * aturan yang SAMA PERSIS. Dua primitif, dua lingkup:
 *
 *   `rebookSlotForSubmission(submissionId, …)`  menulis `form_submissions`  → ORDER
 *   `rebookSchedule(entry, …)`                  menulis `ad_schedules`      → JADWAL
 *
 * ⚠️ YANG MENENTUKAN BUKAN ORDINAL SEMATA, melainkan apakah ada SAUDARA yang
 * bisa ikut terseret — persis pelajaran yang sudah dibayar di `expiryPlanFor`.
 * Ordinal 1 yang SUDAH punya jadwal ke-2 tetap wajib memakai primitif
 * berlingkup-jadwal: menulis `form_submissions` menyalakan
 * `trg_ad_schedule_from_submission`, yang lalu menimpa cermin `ad_schedules`
 * milik jadwal itu. Bercabang pada `ordinal >= 2` saja akan melewatkan kasus
 * ini — dan kegagalannya sunyi, karena tulisannya "berhasil".
 *
 * ⚠️ BUKAN "GANTI JADWAL". Keputusan ini hanya dipakai dari layar `released`
 * dan `pick` — reservasi yang sudah lepas atau belum pernah ada. Menukar
 * jadwal yang masih berjalan tetap wewenang admin.
 *
 * Murni: masuk keadaan, keluar rencana. Tidak memanggil apa pun.
 */

export interface RebookSubject {
  /** `ad_schedules.ordinal`. */
  ordinal: number;
  /** Jumlah jadwal pada ORDER yang sama, termasuk jadwal ini sendiri. */
  siblingCount: number;
  paymentStatus: string | null | undefined;
}

export type RebookPrimitive = 'rebookSlotForSubmission' | 'rebookSchedule' | 'none';

export interface RebookPlan {
  primitive: RebookPrimitive;
  scope: 'order' | 'schedule' | 'none';
  /** Kenapa tidak boleh dipesan ulang, kalau memang tidak. */
  reason?: 'already_paid';
}

const PAID_STATUSES = ['paid', 'completed'];

export function rebookPlanFor(subject: RebookSubject): RebookPlan {
  /*
    Penjaga lunas menang atas segalanya, dan diulang di tiga lapis: di sini, di
    dalam `rebookSchedule`, dan di dalam query-nya. Memori proyek:
    `payment_status` BUKAN bukti pembayaran, jadi ia tidak pernah boleh jadi
    satu-satunya yang memutuskan — tapi ia tetap cukup untuk MENOLAK.
  */
  if (PAID_STATUSES.includes(subject.paymentStatus || '')) {
    return { primitive: 'none', scope: 'none', reason: 'already_paid' };
  }

  const sendirian = subject.ordinal === 1 && subject.siblingCount <= 1;

  return sendirian
    ? { primitive: 'rebookSlotForSubmission', scope: 'order' }
    : { primitive: 'rebookSchedule', scope: 'schedule' };
}
