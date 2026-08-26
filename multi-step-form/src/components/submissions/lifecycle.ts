import type { LifecycleStage } from '../../lib/status-tokens';
import type { SurveySubmission, PaymentState, ExistingPage } from './types';
import { toWibYmd, isPaymentTooLateForDate } from '../../utils/airing-window';
import { isSlotHoldReleased } from '../../utils/slotHold';

// ─────────────────────────────────────────────────────────────
// Single source of truth for submission lifecycle derivation.
// Extracted verbatim from SubmissionsTableRow.tsx (desktop + mobile
// previously duplicated this logic, including the 1-hour slot expiry
// rule for user-booked unpaid reservations).
// ─────────────────────────────────────────────────────────────

export type PageStatus = 'none' | 'drafted' | 'scheduled' | 'live' | 'completed' | 'kilat';

export interface LifecycleInfo {
  /** Single combined stage for the list chip (highest-precedence axis wins). */
  stage: LifecycleStage;
  /** Review-axis display status ('in_review' | 'approved' | 'rejected' | 'spam' | ...). */
  displayStatus: string;
  isPaid: boolean;
  isRejectedEvent: boolean;
  isLegacyActive: boolean;
  isActuallyExpired: boolean;
  hasValidSchedule: boolean;
  isPending: boolean;
  canReserveSlot: boolean;
  canPay: boolean;
  canBuildPage: boolean;
  pageStatus: PageStatus;
  /** Epoch ms when a user-booked unpaid reservation expires, else null. */
  slotExpiresAt: number | null;
}

const RESERVABLE_STATUSES = ['approved', 'slot_reserved', 'waiting_payment', 'paid', 'scheduled', 'live', 'completed'];

// Map post-approved & legacy schedule statuses to "approved" for review-axis display
export function getDisplayStatus(status: string | undefined): string {
  const s = status || 'pending';
  if (RESERVABLE_STATUSES.includes(s)) return 'approved';
  return s;
}

export function deriveLifecycle(
  submission: SurveySubmission,
  paymentData: PaymentState,
  existingPage: ExistingPage | undefined,
  isScheduled: boolean,
  now: number = Date.now(),
): LifecycleInfo {
  const isPaid = ['paid', 'completed'].includes(paymentData.latestStatus || submission.payment_status || '');
  const isRejectedEvent = ['rejected', 'spam'].includes(submission.submission_status || '');
  const isLegacyActive = ['live', 'completed', 'scheduled'].includes(submission.status || '');
  const reservedAtTime = submission.slot_reserved_at ? new Date(submission.slot_reserved_at).getTime() : 0;
  // Legacy campaign end: submission_status 'live'/'scheduled' is never
  // transitioned to 'completed' in the DB, so derive it from end_date.
  // End-of-day local — a campaign ending today still counts as running.
  // Date-only strings are parsed as local components (new Date('YYYY-MM-DD')
  // would anchor to UTC midnight and roll back a day west of UTC).
  let legacyEndMs: number | null = null;
  if (submission.end_date) {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(submission.end_date);
    const parsedEnd = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(submission.end_date);
    if (!Number.isNaN(parsedEnd.getTime())) {
      legacyEndMs = new Date(parsedEnd.getFullYear(), parsedEnd.getMonth(), parsedEnd.getDate(), 23, 59, 59, 999).getTime();
    }
  }
  const legacyEnded = legacyEndMs !== null && legacyEndMs < now;
  const isUserBookedUnpaid = submission.slot_booked_by === 'user' && reservedAtTime > 0 && !isPaid && !paymentData.hasEverPaid;
  const startYmd = submission.start_date ? toWibYmd(new Date(submission.start_date)) : null;
  const isScheduleLate = !isPaid && !paymentData.hasEverPaid && Boolean(startYmd && isPaymentTooLateForDate(startYmd, new Date(now)));
  // ⚠️ TRANSAKSI YANG MATI BUKAN BUKTI SLOTNYA MATI.
  //
  // `paymentData.latestStatus` adalah status transaksi TERBARU, apa pun
  // keadaannya — dan ia tidak pernah bergerak lagi setelah percobaan bayar
  // gagal. Kalau peneliti kemudian menjadwalkan ulang, ia mendapat reservasi
  // baru yang sah TANPA membuat transaksi baru, jadi sinyal ini macet di
  // 'expired' selamanya dan admin melihat "Slot Kedaluwarsa" untuk slot yang
  // sebenarnya masih ditahan.
  //
  // Terlihat di W2XPPGF5 (2026-08-19): peneliti menjadwalkan ulang 08.42,
  // hold berlaku sampai 09.42, dashboard peneliti benar menampilkan tombol
  // bayar — sementara tab Info admin sudah berteriak kedaluwarsa.
  //
  // Umur reservasi punya SATU sumber, `utils/slotHold.ts`. Sinyal pembayaran
  // hanya boleh ikut bicara kalau tidak ada reservasi hidup.
  const holdReleased = isSlotHoldReleased(
    { slotBookedBy: submission.slot_booked_by, slotReservedAt: submission.slot_reserved_at },
    now,
  );
  const hasLiveHold = submission.slot_booked_by === 'user' && reservedAtTime > 0 && !holdReleased;

  const isActuallyExpired = !isPaid && !paymentData.hasEverPaid && (
    // Tanggalnya tidak terkejar lagi — berlaku walau reservasinya masih hidup.
    isScheduleLate ||
    holdReleased ||
    (!hasLiveHold && (
      paymentData.latestStatus === 'expired' ||
      submission.payment_status === 'expired'
    ))
  );
  const hasValidSchedule = (isScheduled || (isLegacyActive && !legacyEnded)) && !isActuallyExpired;
  /**
   * ⚠️ `hasOpenInvoice`, BUKAN `hasInvoices`.
   *
   * `awaiting_payment` menggerakkan banner Info yang berbunyi "Invoice tagihan
   * sudah diterbitkan, menunggu pelunasan". Diukur dari `hasInvoices` kalimat
   * itu jadi bohong begitu tagihannya mati: baris tagihan tidak pernah
   * dihapus, jadi order yang dijadwalkan ulang menyimpan baris kedaluwarsa
   * selamanya dan terus mengaku menunggu pembayaran — sementara tab Jadwal &
   * Bayar, yang membaca tagihan hidup lewat `schedule_billing`, menunjukkan
   * tidak ada apa pun untuk dibayar. Dua layar, satu order, dua jawaban.
   *
   * Dengan tagihan hidup sebagai ukuran, order itu jatuh ke `reserved` /
   * `reserved_expiring` — "Siap Terbitkan Tagihan" — yang memang tindakan
   * yang admin perlu lakukan.
   */
  const isPending = !isPaid && paymentData.hasOpenInvoice && !isRejectedEvent && hasValidSchedule;
  const canBuildPage = isPaid || isLegacyActive;
  const canReserveSlot = RESERVABLE_STATUSES.includes(submission.submission_status || '') || isLegacyActive;
  const canPay = (isScheduled || isLegacyActive) && !isRejectedEvent;
  const displayStatus = getDisplayStatus(submission.status);
  const slotExpiresAt = isUserBookedUnpaid ? reservedAtTime + 3600_000 : null;

  const isKilat = submission.distribution_type === 'kilat';

  // Page axis
  let pageStatus: PageStatus = 'none';
  if (isKilat) {
    pageStatus = 'kilat';
  } else if (existingPage) {
    const startDate = existingPage.publish_start_date ? new Date(existingPage.publish_start_date).getTime() : null;
    const endDate = existingPage.publish_end_date ? new Date(existingPage.publish_end_date).getTime() : null;
    if (!existingPage.is_published) pageStatus = 'drafted';
    else if (endDate !== null && endDate < now) pageStatus = 'completed';
    else if (startDate !== null && startDate > now) pageStatus = 'scheduled';
    else pageStatus = 'live';
  }

  // Combined stage — precedence: rejected > spam > live > page_scheduled >
  // completed > paid > awaiting_payment > reserved_expired > reserved(<1h) >
  // approved > in_review. KILAT never passes 'paid' via legacy status.
  // Legacy live/scheduled whose end_date passed derive 'completed'.
  let stage: LifecycleStage;
  if (displayStatus === 'rejected') stage = 'rejected';
  else if (displayStatus === 'spam') stage = 'spam';
  // Sejajar dengan rejected/spam: keputusan manusia yang menghentikan order,
  // jadi ia menang atas sumbu tayang maupun sumbu uang. Papan Schedule sudah
  // menamainya lewat `chipKindOf`; daftar Submissions tidak boleh memberi nama
  // lain untuk baris yang sama.
  // `slot_cancelled` ikut di sini: sql/62 §2 sengaja MENJAGA sumbu review tetap
  // 'approved', jadi tanpa cabang ini order yang slotnya dilepas admin jatuh ke
  // `else` paling bawah dan chip daftarnya berbunyi "Need Review" — mengundang
  // admin me-review ulang sesuatu yang sudah pernah diputuskan.
  else if (displayStatus === 'cancelled' || displayStatus === 'slot_cancelled') stage = 'cancelled';
  else if (pageStatus === 'live' || (!isKilat && submission.status === 'live' && !legacyEnded)) stage = 'live';
  else if (pageStatus === 'scheduled') stage = 'page_scheduled';
  else if (
    pageStatus === 'completed' ||
    (!isKilat && submission.status === 'completed') ||
    (!isKilat && isLegacyActive && legacyEnded)
  ) stage = 'completed';
  else if (isPaid) stage = 'paid';
  else if (isPending) stage = 'awaiting_payment';
  else if (isActuallyExpired) stage = 'reserved_expired';
  else if (hasValidSchedule) stage = isUserBookedUnpaid ? 'reserved_expiring' : 'reserved';
  else if (displayStatus === 'approved') stage = 'approved';
  else stage = 'in_review';

  return {
    stage,
    displayStatus,
    isPaid,
    isRejectedEvent,
    isLegacyActive,
    isActuallyExpired,
    hasValidSchedule,
    isPending,
    canReserveSlot,
    canPay,
    canBuildPage,
    pageStatus,
    slotExpiresAt,
  };
}

export interface ActionDot {
  type: 'red' | 'gray';
  label: string;
}

/**
 * Titik notifikasi di baris daftar Submissions.
 *
 * DUA sumbu, bukan tiga: Review dan Jadwal/Pembayaran. Sumbu HALAMAN sengaja
 * tidak ikut — pekerjaannya milik admin lain dan rumahnya papan Jadwal. Lihat
 * catatan panjang di badan fungsi ini.
 *
 * Sesudah sumbu halaman dicabut, `lifecycle` sendirian sudah memuat segalanya —
 * parameter `submission` dan `existingPage` yang dulu ada tidak lagi dibaca.
 */
export function getSubmissionActionDot(lifecycle: LifecycleInfo): ActionDot | null {
  const { displayStatus } = lifecycle;
  const isNeedReview = !displayStatus || displayStatus === 'in_review' || displayStatus === 'pending';
  const isRejected = displayStatus === 'rejected';
  const isReviewActive = isNeedReview || isRejected;

  if (isReviewActive) {
    return {
      type: 'red',
      label: isRejected ? 'Menunggu perbaikan peneliti' : 'Perlu tindakan di tab Review',
    };
  }

  // Keadaan akhir — tidak ada yang perlu ditindak. Diukur lewat `stage`, bukan
  // `displayStatus`, supaya `slot_cancelled` (yang sumbu review-nya tetap
  // 'approved') ikut tertangkap; kalau tidak, ia lolos ke cabang jadwal di
  // bawah dan berteriak "Menunggu Pembayaran" untuk slot yang sudah dilepas.
  if (displayStatus === 'spam' || lifecycle.stage === 'cancelled') {
    return null;
  }

  // Dot status untuk tab Jadwal & Bayar:
  const isScheduleActive =
    !isReviewActive &&
    displayStatus !== 'spam' &&
    !lifecycle.isPaid &&
    lifecycle.stage !== 'live' &&
    lifecycle.stage !== 'completed' &&
    lifecycle.stage !== 'page_scheduled';

  // ⚠️ SUMBU HALAMAN SENGAJA TIDAK DIHITUNG DI SINI — lihat P5.
  //
  // Dulu ada cabang ketiga: banner masih bawaan atau halaman masih draft →
  // titik MERAH. Ia dicabut karena menagih admin yang salah: yang melayani
  // reservasi bukan orang yang membuat halaman, dan daftar ini rumahnya.
  // Pekerjaan halaman punya rumah yang lebih baik di papan Jadwal — pil
  // berhitung yang bisa disaring, plus editor banner & tombol terbit di
  // drawernya (`paidPageNotReachable`, `needsBannerSwap`).
  //
  // Diukur sebelum dicabut: cabang itu menyala untuk 2 order, keduanya
  // pekerjaan banner yang SUDAH dihitung papan. Yang cabang publikasi tangkap:
  // NOL — sql/40 menerbitkan halaman otomatis saat lunas, jadi halaman milik
  // order survei tidak pernah lahir sebagai draft.
  //
  // Efek samping yang ikut sembuh: cabang itu dulu duduk DI ANTARA dua cabang
  // `isScheduleActive`, jadi order yang slotnya kedaluwarsa tapi bannernya
  // bawaan mendapat titik MERAH halaman — menutupi titik ABU "slot kedaluwarsa"
  // yang seharusnya muncul. Cabang abu di bawah kini benar-benar terjangkau.
  if (isScheduleActive) {
    return lifecycle.isActuallyExpired
      ? { type: 'gray', label: 'Slot kedaluwarsa (Unpaid)' }
      : { type: 'red', label: 'Perlu tindakan: Menunggu Pembayaran / Jadwal' };
  }

  return null;
}
