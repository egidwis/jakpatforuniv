import type { SurveyFormData, CostCalculation } from '../types';
import {
  saveFormSubmission,
  updateFormSubmissionById,
  getFormSubmissionById,
  fetchSlotAvailability,
  type FormSubmission,
} from './supabase';
import { resolveSubmissionMode, type SubmissionMode } from './submissionMode';
import type { TranslationKey } from '../i18n/translations';
import { MAX_REGULAR_ADS_PER_DAY, MAX_KILAT_ADS_PER_DAY } from './constants';
import { isBookingClosedForDate, toAiringStartIso, toAiringEndIso, toLocalYmd } from './airing-window';
import { checkoutBlocker, type CheckoutBlockerCode } from './orderReadiness';

/**
 * Sebab-sebab gagal yang punya kalimat sendiri untuk user. Kodenya, bukan
 * kalimatnya, yang dilempar — util ini tidak boleh tahu bahasa yang sedang
 * aktif. Pemanggil menerjemahkannya lewat `orderSubmitErrorKey()`.
 */
export type OrderSubmitErrorCode =
  | CheckoutBlockerCode
  | 'no_schedule'
  | 'past_cutoff'
  | 'slot_full_kilat'
  | 'slot_full'
  | 'availability_check_failed'
  | 'save_failed';

export class OrderSubmitError extends Error {
  code: OrderSubmitErrorCode;
  constructor(code: OrderSubmitErrorCode) {
    super(code);
    this.name = 'OrderSubmitError';
    this.code = code;
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
  slot_full_kilat: 'errorSlotFullKilat',
  slot_full: 'errorSlotFullRange',
  availability_check_failed: 'errorAvailabilityCheck',
  save_failed: 'errorSavingData',
};

export function orderSubmitErrorKey(error: unknown): TranslationKey {
  return error instanceof OrderSubmitError ? ERROR_KEYS[error.code] : 'errorSavingDataGeneric';
}

/** Untuk pemanggil yang punya kodenya langsung, bukan lewat exception. */
export function orderSubmitErrorKeyForCode(code: OrderSubmitErrorCode): TranslationKey {
  return ERROR_KEYS[code];
}

export interface SubmitOrderArgs {
  formData: SurveyFormData;
  cost: CostCalculation;
  /** Hasil `isAutoApprovalPath()` — menentukan status awal & apakah slot dikunci. */
  isAutoApproval: boolean;
  /** Voucher ILKOMUNY yang sudah terpakai: disimpan tanpa kode supaya admin tidak menerapkan ulang diskon. */
  ilkomunyBlocked: boolean;
  authUserId?: string;
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
 * Menulis TEPAT SEKALI. Tidak ada baris setengah jadi yang tertinggal kalau
 * user meninggalkan flow di tengah jalan.
 */
export async function submitOrder({
  formData,
  cost,
  isAutoApproval,
  ilkomunyBlocked,
  authUserId,
}: SubmitOrderArgs): Promise<FormSubmission & { id: string }> {
  // Syarat Ringkasan, dinilai ulang di sini karena jalur otomatis menulis
  // order dari layar Jadwal — satu langkah setelah layar yang menegakkannya.
  const blocker = checkoutBlocker(formData);
  if (blocker) throw new OrderSubmitError(blocker);

  // Jalur otomatis mengunci slot di titik ini, jadi tanggal wajib sudah ada.
  if (isAutoApproval && (!formData.startDate || !formData.startTime)) {
    throw new OrderSubmitError('no_schedule');
  }

  // `startDate` disimpan sebagai YYYY-MM-DD, tapi draft lama / hasil reschedule
  // bisa membawa ISO penuh — potong supaya perbandingan tanggal apple-to-apple.
  const startYmd = formData.startDate ? String(formData.startDate).slice(0, 10) : '';

  // Batas pemesanan hari-H (13.00 WIB) bisa terlewat sementara user memilih.
  // Cek terakhir sebelum INSERT, sebelum tanggal apa pun dimaterialisasi.
  if (startYmd && isBookingClosedForDate(startYmd)) {
    throw new OrderSubmitError('past_cutoff');
  }

  let calculatedStartDate: string | null = null;
  let calculatedEndDate: string | null = null;

  if (isAutoApproval && startYmd && formData.startTime) {
    let counts: Record<string, number>;
    try {
      const result = await fetchSlotAvailability(
        undefined,
        formData.isKilatUpgrade ? 'kilat' : 'regular'
      );
      counts = result.regularCounts;
    } catch {
      throw new OrderSubmitError('availability_check_failed');
    }

    if (formData.isKilatUpgrade) {
      if ((counts[startYmd] || 0) >= MAX_KILAT_ADS_PER_DAY) {
        throw new OrderSubmitError('slot_full_kilat');
      }
    } else {
      const cursor = new Date(`${startYmd}T00:00:00`);
      for (let i = 0; i < formData.duration; i++) {
        if ((counts[toLocalYmd(cursor)] || 0) >= MAX_REGULAR_ADS_PER_DAY) {
          throw new OrderSubmitError('slot_full');
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    // Jam tayang dikunci 15.00 WIB lewat helper, bukan setHours device — dulu
    // user di luar WIB menyimpan instant yang meleset sejam.
    calculatedStartDate = toAiringStartIso(startYmd);
    calculatedEndDate = toAiringEndIso(startYmd, formData.isKilatUpgrade ? 1 : formData.duration);
  } else if (formData.isKilatUpgrade && startYmd && formData.startTime) {
    // Kilat pada jalur non-otomatis: jadwal tetap disimpan sebagai reservasi kilat.
    calculatedStartDate = toAiringStartIso(startYmd);
    calculatedEndDate = toAiringEndIso(startYmd, 1);
  }

  const isManualForm =
    formData.isManualEntry || (!!formData.surveyUrl && !formData.surveyUrl.includes('docs.google.com/forms'));

  const submissionData: FormSubmission = {
    survey_url: formData.surveyUrl,
    title: formData.title,
    description: formData.description || '',
    question_count: formData.questionCount,
    criteria_responden: formData.criteriaResponden,
    duration: formData.duration,
    start_date: calculatedStartDate,
    end_date: calculatedEndDate,
    full_name: formData.fullName,
    email: formData.email,
    phone_number: formData.phoneNumber,
    university: formData.university,
    department: formData.department,
    status: formData.status || 'pending',
    submission_status: isAutoApproval ? 'waiting_payment' : 'in_review',
    referral_source:
      formData.referralSource === 'Lainnya' && formData.referralSourceOther
        ? `Lainnya: ${formData.referralSourceOther}`
        : formData.referralSource,
    winner_count: formData.winnerCount,
    prize_per_winner: formData.prizePerWinner,
    voucher_code: ilkomunyBlocked ? '' : formData.voucherCode,
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
    distribution_type: formData.isKilatUpgrade ? 'kilat' : 'regular',
    ...(isAutoApproval || formData.isKilatUpgrade
      ? { slot_booked_by: 'user', slot_reserved_at: new Date().toISOString() }
      : {}),
  } as FormSubmission;

  // Niat reschedule ikut menumpang di draft dan bisa basi — draft yang
  // ditinggalkan pernah membuat order LAIN tertimpa di tempat.
  const rescheduleIntent = {
    isReschedule: formData.isReschedule === true,
    submissionIdToReplace: formData.submissionIdToReplace,
  };

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

    return mode.mode === 'reschedule'
      ? await updateFormSubmissionById(mode.submissionId, submissionData)
      : await saveFormSubmission(submissionData);
  } catch (saveError) {
    console.error('Error saat menyimpan data:', saveError);
    throw new OrderSubmitError('save_failed');
  }
}
