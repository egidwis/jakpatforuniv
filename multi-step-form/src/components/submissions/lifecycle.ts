import type { LifecycleStage } from '../../lib/status-tokens';
import type { SurveySubmission, PaymentState, ExistingPage } from './types';
import { toWibYmd, isPaymentTooLateForDate } from '../../utils/airing-window';
import { isSlotHoldReleased } from '../../utils/slotHold';
import type { QueueReason } from '../../utils/adminQueue';

// ─────────────────────────────────────────────────────────────
// Single source of truth for submission lifecycle derivation.
// Extracted verbatim from SubmissionsTableRow.tsx (desktop + mobile
// previously duplicated this logic, including the 1-hour slot expiry
// rule for user-booked unpaid reservations).
// ─────────────────────────────────────────────────────────────

/**
 * `hidden` & `auto_closed`: halamannya ADA tapi TIDAK sedang tayang, dan
 * keduanya SENGAJA tidak menentukan stage order.
 *
 * ⛔ Tanpa keduanya order "asda" (08ef25ac) terkunci permanen: halaman terbit +
 * disembunyikan + tanpa tanggal terbaca `live`, Review terkunci, dan tab Jadwal
 * menyuruh kembali ke Review. Halaman yang jendelanya ditutup sql/99 akan
 * terbaca `completed` dan mengunci order batal dengan cara yang sama.
 */
export type PageStatus = 'none' | 'drafted' | 'hidden' | 'auto_closed' | 'scheduled' | 'live' | 'completed' | 'kilat';

/**
 * Ringkasan `ad_schedules` per order — satu-satunya jalan bagi daftar
 * Submissions untuk melihat sumbu jadwal.
 *
 * ⚠️ Kenapa parameter, bukan query di dalam fungsi ini: `deriveLifecycle`
 * murni dan dipanggil per baris saat render. Perakitnya (`InternalDashboard`)
 * sudah memuat jadwal sekali untuk seluruh halaman.
 */
export interface ScheduleSignals {
  /**
   * Ada jadwal yang MASIH menahan kuota, tanggalnya belum lewat, dipesan
   * seseorang, dan belum lunas — sementara tagihan hidupnya tidak ada.
   *
   * ⚠️ KLAUSA "BELUM LUNAS" BUKAN HIASAN. Diukur 2026-09-12: 24 jadwal
   * bertanggal depan ber-`slot_booked_by`, SEMUANYA lunas. Tanpa klausa itu
   * daftar ini menyalakan 24 titik merah tanpa pekerjaan — kesalahan yang
   * sama persis dengan yang membuat cabang sumbu halaman dicabut (lihat
   * catatan panjang di `getSubmissionActionDot`).
   */
  hasQuotaHoldingUnpaidFuture: boolean;
}

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
  /** Reservasi menahan kuota tapi tagihannya sudah mati — admin perlu bertindak. */
  needsScheduleFollowUp: boolean;
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
  scheduleSignals?: ScheduleSignals,
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
    // Feed aplikasi membuang halaman tersembunyi (surveys.js), jadi halaman
    // ini tidak sedang tayang — apa pun jendelanya.
    else if (existingPage.is_hidden) pageStatus = 'hidden';
    // Ditutup sistem (sql/99): jendelanya "berakhir" karena uangnya dibalik,
    // bukan karena kampanyenya selesai. Membacanya `completed` = mengunci order.
    else if (existingPage.auto_closed_at) pageStatus = 'auto_closed';
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
    needsScheduleFollowUp: scheduleSignals?.hasQuotaHoldingUnpaidFuture ?? false,
  };
}

const REVIEW_LOCKING_STAGES: readonly LifecycleStage[] = [
  'reserved',
  'reserved_expiring',
  'awaiting_payment',
  'paid',
  'page_scheduled',
  'live',
  'completed',
];

/**
 * Keputusan review (Approve/Reject/Reset) terkunci karena sumbu uang/tayang
 * sudah bergerak. Lihat catatan panjang di `SubmissionDetailSheet`.
 *
 * ⛔ INVARIAN: order yang MASIH menunggu review dan BELUM lunas tidak pernah
 * terkunci. Tab Jadwal & Bayar menampilkan `awaiting_review` untuk order
 * seperti ini dengan satu-satunya aksi "Buka tab Review" — kalau Review juga
 * terkunci, admin berputar tanpa jalan keluar (order 08ef25ac, 23 Sep 2026).
 * Pagar ini berdiri sendiri, terpisah dari perbaikan `pageStatus` di atas,
 * supaya sebab ketiga yang belum kita kenal pun tidak bisa menjebak lagi.
 *
 * Aman terhadap jadwal: `airing_status_of()` memetakan `in_review` DAN
 * `approved` bertanggal ke `requested` yang sama (diverifikasi ke produksi
 * 23 Sep), jadi Approve dari sini tidak memundurkan apa pun.
 */
export function isReviewDecisionLocked(lifecycle: Pick<LifecycleInfo, 'stage' | 'displayStatus' | 'isPaid'>): boolean {
  if (lifecycle.displayStatus === 'in_review' && !lifecycle.isPaid) return false;
  return REVIEW_LOCKING_STAGES.includes(lifecycle.stage);
}

export interface ActionDot {
  type: 'red' | 'gray';
  label: string;
}

/** Label titik MERAH per alasan antrean (`adminQueue.ts`). */
export const QUEUE_DOT_LABEL: Record<QueueReason, string> = {
  review: 'Perlu tindakan di tab Review',
  schedule: 'Perlu tindakan: Tetapkan jadwal',
  invoice: 'Perlu tindakan: Reservasi tanpa tagihan hidup',
  broadcast: 'Perlu tindakan: Nyalakan siaran Kilat',
};

/**
 * Titik notifikasi di baris daftar Submissions (dan tab laci order).
 *
 * ⚠️ MERAH = ADA DI ANTREAN ADMIN, TIDAK LEBIH. `queueReason` datang dari
 * `fetchAdminQueue` — sumber yang SAMA dengan angka di tab Iklan/Kilat. Dulu
 * titik dan badge punya aturan sendiri-sendiri, jadi keduanya menyimpang ke dua
 * arah (26 Okt 2026): gelombang Kilat menunggu siaran & order menunggu jadwal
 * admin dihitung badge tanpa titik, sedangkan order DITOLAK, slot kedaluwarsa,
 * dan `in_review` bertanggal (artefak pra-review) bertitik merah tanpa dihitung.
 *
 * Di luar antrean, titik paling banter ABU: bolanya di peneliti.
 *
 * Sumbu HALAMAN sengaja tidak ikut — pekerjaannya milik admin lain dan
 * rumahnya papan Jadwal (P5).
 */
export function getSubmissionActionDot(
  lifecycle: LifecycleInfo,
  queueReason: QueueReason | null = null,
): ActionDot | null {
  if (queueReason) return { type: 'red', label: QUEUE_DOT_LABEL[queueReason] };

  const { displayStatus } = lifecycle;
  if (displayStatus === 'rejected') return { type: 'gray', label: 'Menunggu perbaikan peneliti' };

  // Keadaan akhir — diukur lewat `stage` supaya `slot_cancelled` (sumbu
  // review-nya tetap 'approved') ikut tertangkap.
  if (displayStatus === 'spam' || lifecycle.stage === 'cancelled') return null;

  // Masih "review" tapi tidak di antrean: `in_review` bertanggal (artefak era
  // sebelum review, adminQueue.ts) atau disingkirkan peneliti. Bukan pekerjaan.
  if (!displayStatus || displayStatus === 'in_review' || displayStatus === 'pending') return null;

  const isScheduleActive =
    !lifecycle.isPaid &&
    lifecycle.stage !== 'live' &&
    lifecycle.stage !== 'completed' &&
    lifecycle.stage !== 'page_scheduled';
  if (!isScheduleActive) return null;

  if (lifecycle.stage === 'awaiting_payment' || (lifecycle.isPending && !lifecycle.isActuallyExpired)) {
    return { type: 'gray', label: 'Menunggu pembayaran peneliti' };
  }
  if (lifecycle.isActuallyExpired || lifecycle.stage === 'reserved_expired') {
    return { type: 'gray', label: 'Slot kedaluwarsa' };
  }
  return { type: 'gray', label: 'Menunggu peneliti menyelesaikan jadwal' };
}
