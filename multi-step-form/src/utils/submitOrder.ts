import type { SurveyFormData, CostCalculation } from '../types';
import {
  saveFormSubmission,
  updateFormSubmissionById,
  getFormSubmissionById,
  fetchSlotAvailability,
  fetchKilatWaveOccupancy,
  rebookSlotForSubmission,
  type FormSubmission,
} from './supabase';
import { resolveSubmissionMode, type SubmissionMode } from './submissionMode';
import type { TranslationKey } from '../i18n/translations';
import { MAX_REGULAR_ADS_PER_DAY, KILAT_SLOT_HOURS } from './constants';
import {
  isBookingClosedForDate,
  isKilatWaveBookable,
  kilatLastBookableYmd,
  toLocalYmd,
} from './airing-window';
import { checkoutBlocker, type CheckoutBlockerCode } from './orderReadiness';
import { auditSubmissionForm } from './auditService';
import { isDailyQuotaFullError, kilatWaveErrorKind } from './dailyQuotaError';
import { KILAT_VOUCHER_CODES } from './cost-calculator';
import { kilatPickStatus, parseKilatOccupancy } from './kilatWaves';

/**
 * Sebab-sebab gagal yang punya kalimat sendiri untuk user. Kodenya, bukan
 * kalimatnya, yang dilempar — util ini tidak boleh tahu bahasa yang sedang
 * aktif. Pemanggil menerjemahkannya lewat `orderSubmitErrorKey()`.
 */
export type OrderSubmitErrorCode =
  | CheckoutBlockerCode
  | 'no_schedule'
  | 'past_cutoff'
  | 'kilat_wave_closed'
  | 'kilat_admin_away'
  | 'kilat_wave_too_far'
  | 'slot_full_kilat'
  | 'slot_full'
  | 'availability_check_failed'
  | 'save_failed'
  | 'lock_failed';

export class OrderSubmitError extends Error {
  code: OrderSubmitErrorCode;
  /**
   * Terisi = ordernya SUDAH tersimpan, hanya tanggalnya yang gagal dikunci.
   * Pemanggil wajib mengantar peneliti ke halaman Jadwal & Bayar order ini
   * (layar `pick`), bukan membiarkannya di wizard — kirim ulang dari wizard
   * melahirkan order kembar.
   */
  savedSubmissionId?: string;
  constructor(code: OrderSubmitErrorCode, savedSubmissionId?: string) {
    super(code);
    this.name = 'OrderSubmitError';
    this.code = code;
    if (savedSubmissionId) this.savedSubmissionId = savedSubmissionId;
  }
}

// Diketik sebagai TranslationKey supaya kunci yang salah tulis (atau lupa
// ditambahkan ke translations.ts) tertangkap compiler, bukan tampil mentah
// ke user sebagai nama kunci.
const ERROR_KEYS: Record<OrderSubmitErrorCode, TranslationKey> = {
  terms: 'errorTermsRequired',
  survey_incomplete: 'errorCompleteAllSurveyData',
  name: 'errorFullNameEmpty',
  email: 'errorEmailInvalid',
  phone: 'errorPhoneMinLength',
  no_schedule: 'errorNoScheduleSelected',
  past_cutoff: 'slotErrorPastCutoff',
  kilat_wave_closed: 'kilatErrorWaveClosed',
  kilat_admin_away: 'kilatErrorWaveHoliday',
  kilat_wave_too_far: 'kilatErrorWaveTooFar',
  slot_full_kilat: 'errorSlotFullKilat',
  slot_full: 'errorSlotFullRange',
  availability_check_failed: 'errorAvailabilityCheck',
  save_failed: 'errorSavingData',
  lock_failed: 'orderSavedLockFailed',
};

export function orderSubmitErrorKey(error: unknown): TranslationKey {
  return error instanceof OrderSubmitError ? ERROR_KEYS[error.code] : 'errorSavingDataGeneric';
}

/** Untuk pemanggil yang punya kodenya langsung, bukan lewat exception. */
export function orderSubmitErrorKeyForCode(code: OrderSubmitErrorCode): TranslationKey {
  return ERROR_KEYS[code];
}

/**
 * Penolakan jadwal dari database → kode yang punya kalimat sendiri.
 * Gelombang Kilat DULU — pesannya juga memuat "sudah penuh" (lihat
 * `kilatWaveErrorKind`).
 */
function scheduleErrorCode(error: unknown): OrderSubmitErrorCode | null {
  const waveError = kilatWaveErrorKind(error);
  if (waveError === 'full') return 'slot_full_kilat';
  if (waveError === 'closed') return 'kilat_wave_closed';
  if (waveError === 'away') return 'kilat_admin_away';
  if (waveError === 'too_far') return 'kilat_wave_too_far';
  // Penolakan kuota datang dari trigger database (sql/110 → sql/111), bukan
  // dari cek browser. Tanpa pemetaan ini peneliti hanya melihat "gagal
  // menyimpan", padahal tanggalnya yang penuh.
  if (isDailyQuotaFullError(error)) return 'slot_full';
  // lockGate (cutoff Iklan) tidak ber-HINT.
  if (error instanceof Error && error.message.includes('13.00')) return 'past_cutoff';
  return null;
}

/** Kode voucher yang boleh tersimpan di baris order. */
export function storedVoucherCode(formData: Pick<SurveyFormData, 'voucherCode' | 'isKilatUpgrade'>): string {
  const code = formData.voucherCode || '';
  if (!formData.isKilatUpgrade) return code;
  return KILAT_VOUCHER_CODES.includes(code.trim().toUpperCase()) ? code : '';
}

export interface SubmitOrderArgs {
  formData: SurveyFormData;
  cost: CostCalculation;
  /** Hasil `isAutoApprovalPath()` — menentukan status awal & apakah slot dikunci. */
  isAutoApproval: boolean;
  /** Voucher ILKOMUNY yang sudah terpakai: disimpan tanpa kode supaya admin tidak menerapkan ulang diskon. */
  ilkomunyBlocked: boolean;
  authUserId?: string;
  /**
   * Kilat jalur otomatis yang dialihkan ke manual karena mode libur (sql/122).
   * Pemanggil juga mengirim `isAutoApproval: false`; penanda ini yang membuat
   * order TETAP terbaca manual sesudah admin menyetujuinya.
   */
  forcedManualReason?: 'admin_away';
  /**
   * "Kirim Pesanan" saat reservasi mandiri ditutup (sql/125): jalur otomatis
   * yang TIDAK memesan slot. Pemanggil mengirim `isAutoApproval: false`; order
   * lahir `approved` tanpa kolom jadwal, dan trigger server yang menulis cap
   * "jadwal oleh tim" — klien tidak pernah menulis kolom cap.
   */
  selfBookingClosed?: boolean;
}

/**
 * Satu-satunya tempat baris `form_submissions` lahir dari sisi user.
 *
 * Dulu logika ini hidup di dalam `StepCheckout.handleSubmit`, jadi ia terikat
 * pada layar Review. Setelah urutan flow dibalik (Ringkasan sebelum Jadwal),
 * order jalur otomatis justru ditulis di langkah Jadwal — saat slot dikunci —
 * sementara jalur manual tetap ditulis di Ringkasan. Dua pemanggil, satu
 * aturan; kalau tidak dipisahkan begini, keduanya pasti akan menyimpang.
 *
 * Order lahir TEPAT SEKALI. Jalur otomatis lalu mengunci tanggalnya lewat
 * pintu jadwal (sql/123); kalau itu gagal, ordernya tetap ada tanpa tanggal
 * dan `OrderSubmitError.savedSubmissionId` memberi tahu pemanggil ke mana
 * peneliti harus diantar.
 */
export async function submitOrder({
  formData,
  cost,
  isAutoApproval,
  ilkomunyBlocked,
  authUserId,
  forcedManualReason,
  selfBookingClosed = false,
}: SubmitOrderArgs): Promise<FormSubmission & { id: string }> {
  // Syarat Ringkasan, dinilai ulang di sini karena jalur otomatis menulis
  // order dari layar Jadwal — satu langkah setelah layar yang menegakkannya.
  const blocker = checkoutBlocker(formData);
  if (blocker) throw new OrderSubmitError(blocker);

  const isKilat = !!formData.isKilatUpgrade;
  const kilatHour = formData.kilatSlotHour ?? null;

  // Jalur otomatis mengunci slot di titik ini, jadi tanggal wajib sudah ada —
  // dan untuk Kilat, gelombangnya (11|15) juga.
  if (isAutoApproval && (!formData.startDate || !formData.startTime)) {
    throw new OrderSubmitError('no_schedule');
  }
  if (
    isKilat && isAutoApproval &&
    (kilatHour == null || !(KILAT_SLOT_HOURS as readonly number[]).includes(kilatHour))
  ) {
    throw new OrderSubmitError('no_schedule');
  }

  // `startDate` disimpan sebagai YYYY-MM-DD, tapi draft lama / hasil reschedule
  // bisa membawa ISO penuh — potong supaya perbandingan tanggal apple-to-apple.
  // Saat reservasi mandiri ditutup, tanggal draft bukan milik peneliti lagi —
  // diabaikan, termasuk untuk cek batas 13.00 di bawah.
  const startYmd = formData.startDate && !selfBookingClosed ? String(formData.startDate).slice(0, 10) : '';

  // Batas pesan bisa terlewat sementara user memilih. Cek terakhir sebelum
  // INSERT. Iklan: 13.00 WIB hari-H. Kilat: H-2 jam per gelombang (sql/117
  // menegakkan hal yang sama — ini supaya pesannya jelas, bukan galat mentah).
  if (startYmd) {
    if (isKilat) {
      // sql/122 K3: lebih jauh dari 3 hari kerja = teguran sendiri, bukan "tutup".
      if (isAutoApproval && startYmd > kilatLastBookableYmd()) {
        throw new OrderSubmitError('kilat_wave_too_far');
      }
      if (isAutoApproval && kilatHour != null && !isKilatWaveBookable(startYmd, kilatHour)) {
        throw new OrderSubmitError('kilat_wave_closed');
      }
    } else if (isBookingClosedForDate(startYmd)) {
      throw new OrderSubmitError('past_cutoff');
    }
  }

  // Pra-cek kuota di browser HANYA demi kalimat yang ramah. Penentunya
  // pintu jadwal di bawah (trigger kuota & gelombang).
  if (isAutoApproval && isKilat && startYmd && kilatHour != null) {
    // Satu gelombang: [tanggal, tanggal + 1) dengan jam di `kilat_slot_hour` —
    // bentuk yang sama dengan `updateKilatSchedule` (admin) dan yang dituntut
    // trigger `validate_kilat_wave_claim` (end = start + 1). Kuota per
    // GELOMBANG dibaca dari RPC okupansi, bukan hitungan per hari.
    let status: ReturnType<typeof kilatPickStatus>;
    try {
      const rows = parseKilatOccupancy(await fetchKilatWaveOccupancy(startYmd, startYmd));
      status = kilatPickStatus(rows, { ymd: startYmd, hour: kilatHour });
    } catch {
      throw new OrderSubmitError('availability_check_failed');
    }
    if (status === null) throw new OrderSubmitError('availability_check_failed');
    if (status === 'full') throw new OrderSubmitError('slot_full_kilat');
    if (status !== 'open') throw new OrderSubmitError('kilat_wave_closed');
  } else if (isAutoApproval && startYmd && formData.startTime) {
    let counts: Record<string, number>;
    try {
      const result = await fetchSlotAvailability(undefined, 'regular');
      counts = result.regularCounts;
    } catch {
      throw new OrderSubmitError('availability_check_failed');
    }

    const cursor = new Date(`${startYmd}T00:00:00`);
    for (let i = 0; i < formData.duration; i++) {
      if ((counts[toLocalYmd(cursor)] || 0) >= MAX_REGULAR_ADS_PER_DAY) {
        throw new OrderSubmitError('slot_full');
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  // ⚠️ DULU ADA CABANG KETIGA DI SINI, dan pembuangannya disengaja (Track B1).
  //
  //     } else if (formData.isKilatUpgrade && startYmd && formData.startTime) {
  //         calculatedStartDate = toAiringStartIso(startYmd); …
  //
  // Ia menuliskan tanggal tayang untuk order Kilat yang BELUM lolos review.
  // Aturan kepemilikan jadwal berbunyi: pada jalur manual, nol tanggal dan nol
  // slot ditentukan peneliti — hanya admin yang menentukannya, dan itu berlaku
  // untuk Kilat persis seperti untuk iklan regular.
  //
  // Risikonya rendah: wizard jalur manual melewati step Jadwal sama sekali
  // (`review-path.ts`), jadi `formData.startTime` praktis hanya terisi dari
  // draft basi. Yang ia cegah justru itu — draft basi yang diam-diam mengunci
  // tanggal untuk order yang belum berhak punya tanggal.

  const isManualForm =
    formData.isManualEntry || (!!formData.surveyUrl && !formData.surveyUrl.includes('docs.google.com/forms'));

  const submissionData: FormSubmission = {
    survey_url: formData.surveyUrl,
    title: formData.title,
    description: formData.description || '',
    question_count: formData.questionCount,
    criteria_responden: formData.criteriaResponden,
    // Kilat: satu pemesanan = satu gelombang (trigger juga memaksanya 1).
    duration: isKilat ? 1 : formData.duration,
    // ⚠️ TANPA kolom jadwal (start/end_date, kilat_slot_hour, slot_booked_by,
    // slot_reserved_at) — sejak sql/124 INSERT bertanggal dari browser
    // DITOLAK. Tanggalnya dikunci sesudah INSERT, lewat pintu jadwal.
    full_name: formData.fullName,
    email: formData.email,
    phone_number: formData.phoneNumber,
    university: formData.university,
    department: formData.department,
    status: formData.status || 'pending',
    submission_status: selfBookingClosed ? 'approved' : isAutoApproval ? 'waiting_payment' : 'in_review',
    referral_source:
      formData.referralSource === 'Lainnya' && formData.referralSourceOther
        ? `Lainnya: ${formData.referralSourceOther}`
        : formData.referralSource,
    winner_count: formData.winnerCount,
    prize_per_winner: formData.prizePerWinner,
    // ⚠️ Kilat: kode yang tidak berlaku untuk Kilat TIDAK DISIMPAN (Phase 5
    // §5.1) — kalau tersimpan, `isAutoReviewed` membaca JFUFEB/ILKOMUNY di
    // baris dan menaruh order ini di antrean review manual.
    voucher_code: ilkomunyBlocked ? '' : storedVoucherCode(formData),
    total_cost: cost.totalCost,
    subtotal: cost.subtotal,
    ppn_amount: cost.ppn,
    payment_status: 'pending',
    submission_method: isManualForm ? 'manual' : 'google_import',
    detected_keywords: formData.detectedKeywords || [],
    // Jejak ke form JFU asalnya, kalau order ini lahir dari CTA "Sebar via
    // Jakpat". NULL untuk order Google Form dan seluruh order lama.
    //
    // ⚠️ Kolom `form_submissions.custom_form_id` WAJIB ada sebelum baris ini
    // ikut tayang. Mengirim nama kolom yang belum ada membuat PostgREST menolak
    // SELURUH insert (`42703`), bukan cuma field ini — dan itu sudah pernah
    // terjadi: order produksi mati total 13–17 Agustus 2026 karena kodenya
    // dideploy tanpa migrasinya. Lihat `sql/57_add_custom_form_id_to_submissions.sql`.
    custom_form_id: formData.customFormId || null,
    auth_user_id: authUserId,
    distribution_type: isKilat ? 'kilat' : 'regular',
    // Hanya dikirim bila diisi: order biasa tidak bergantung pada kolom sql/122
    // (kolom yang belum ada membuat PostgREST menolak SELURUH insert — lihat
    // custom_form_id di atas).
    ...(forcedManualReason ? { forced_manual_reason: forcedManualReason } : {}),
  } as FormSubmission;

  // Niat reschedule ikut menumpang di draft dan bisa basi — draft yang
  // ditinggalkan pernah membuat order LAIN tertimpa di tempat.
  const rescheduleIntent = {
    isReschedule: formData.isReschedule === true,
    submissionIdToReplace: formData.submissionIdToReplace,
  };

  let savedRecord: FormSubmission & { id: string };
  try {
    let mode: SubmissionMode = { mode: 'create' };
    if (rescheduleIntent.isReschedule && rescheduleIntent.submissionIdToReplace) {
      let existingSurveyUrl: string | null = null;
      try {
        const existing = await getFormSubmissionById(rescheduleIntent.submissionIdToReplace);
        existingSurveyUrl = existing?.survey_url ?? null;
      } catch (e) {
        console.warn('Could not load reschedule target; treating as new submission:', e);
      }
      mode = resolveSubmissionMode(rescheduleIntent, submissionData.survey_url, existingSurveyUrl);
      if (mode.mode === 'create') {
        console.warn(
          'Reschedule intent did not match the target survey — creating a new submission instead of overwriting.'
        );
      }
    }

    savedRecord = mode.mode === 'reschedule'
      ? await updateFormSubmissionById(mode.submissionId, submissionData)
      : await saveFormSubmission(submissionData);

    // Trigger AI pre-screening in background (fire-and-forget, non-blocking)
    if (savedRecord?.id && submissionData.survey_url) {
      auditSubmissionForm(
        savedRecord.id,
        submissionData.survey_url,
        submissionData.question_count || 0
      ).catch(err => {
        console.warn('[submitOrder] Background AI audit skipped/failed (non-fatal):', err);
      });
    }
  } catch (saveError) {
    const code = scheduleErrorCode(saveError);
    if (code) throw new OrderSubmitError(code);
    console.error('Error saat menyimpan data:', saveError);
    throw new OrderSubmitError('save_failed');
  }

  /*
    Jalur otomatis: kunci tanggalnya lewat pintu jadwal (`/api/schedules/lock`)
    — dua langkah, bukan satu INSERT bertanggal. Gagal di sini TIDAK
    menghapus ordernya: ia sudah sah (jalur otomatis, status
    `waiting_payment`, tanpa tanggal) dan halaman Jadwal & Bayar-nya
    menampilkan layar `pick` untuk order tanpa tanggal.

    Order bercap (sql/125 — tab yang dibuka sebelum saklar ditutup: trigger
    mengubah INSERT-nya jadi `approved` tanpa tanggal) TIDAK dikunci: pintu
    akan menolaknya 409, dan pemanggil mengantarnya ke modal "tim yang
    menjadwalkan" lewat `self_booking_closed_at`.
  */
  if (isAutoApproval && startYmd && !savedRecord.self_booking_closed_at) {
    try {
      await rebookSlotForSubmission(
        savedRecord.id,
        startYmd,
        formData.duration,
        isKilat && kilatHour != null ? { kilatHour } : {},
      );
    } catch (lockError) {
      console.error('Order tersimpan, tanggal gagal dikunci:', lockError);
      throw new OrderSubmitError(scheduleErrorCode(lockError) ?? 'lock_failed', savedRecord.id);
    }
  }

  return savedRecord;
}
