import type { AdScheduleEntry, FormSubmission } from './supabase';
import { occupiesSlot } from '@/pages/dashboard/schedule/scheduleModel';
import { kilatWaveInstant } from './airing-window';

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

export interface ScheduleAgainOpts {
  /**
   * Pintu Kilat swalayan terbuka untuk akun ini (`canUseKilatSelfServe`).
   *
   * ⚠️ "Pesan gelombang lagi" (Phase 5 §5.10) ikut pintu yang SAMA dengan
   * kartu Kilat, bukan dibuka sendiri: selama `KILAT_TARIFF_FROM` masih
   * `null`, gelombang tambahan dihargai rumus lama. Default tertutup.
   */
  kilatOpen?: boolean;
}

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
  opts: ScheduleAgainOpts = {},
): ScheduleAgainBlock {
  // Kilat menang atas sebab lain selama pintunya tertutup untuk akun ini.
  // Sesudah terbuka, Kilat ikut aturan Iklan persis (keputusan 14 Okt): boleh
  // begitu tidak ada gelombang belum-lunas yang menahan kuota.
  if (submission.distribution_type === 'kilat' && !opts.kilatOpen) return 'kilat';

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
  opts: ScheduleAgainOpts = {},
): boolean {
  return scheduleAgainBlock(submission, entries, now, opts) === null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Gelombang pilihan beririsan dengan jendela 24 jam gelombang lain order ini?
 *
 * Teguran DINI saja — penegaknya `assert_schedule_window_free` di
 * `create_ad_schedule` (sql/119), yang membaca induk Kilat di jam
 * gelombangnya. Bersentuhan (tepat 24 jam) bukan irisan, sama dengan server.
 * Jadwal yang tidak menahan slot (batal, hold basi, selesai) tidak dihitung.
 */
export function kilatWaveClashesOwn(
  pick: { ymd: string; hour: number },
  entries: AdScheduleEntry[],
  now: number = Date.now(),
): boolean {
  const start = kilatWaveInstant(pick.ymd, pick.hour).getTime();
  const end = start + DAY_MS;
  return entries.some((e) => {
    if (!occupiesSlot(e, now) || !e.startDate || !e.endDate) return false;
    return start < Date.parse(e.endDate) && Date.parse(e.startDate) < end;
  });
}
