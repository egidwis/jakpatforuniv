import type { SurveyFormData } from '../types';

/**
 * Nilai awal form order iklan. Dipakai wizard (`MultiStepForm`) DAN modal
 * pintu masuk (`AdsEntryModal`, yang kini mengimpor Google Form sebelum wizard
 * dibuka) — satu sumber, supaya draf yang ditulis modal berbentuk sama.
 */
export const DEFAULT_SURVEY_FORM_DATA: SurveyFormData = {
  // Step 1
  surveyUrl: '',
  title: '',
  description: '',
  questionCount: 0,
  criteriaResponden: '',
  duration: 2, // Default 2 hari (seragam dengan perpanjangan jadwal)
  startDate: '',
  endDate: '',

  // Kontak invoice (diedit di checkout) + biodata researcher (prefill dari profil)
  fullName: '',
  email: '',
  phoneNumber: '',
  university: '',
  department: '',
  status: '',
  referralSource: '',
  referralSourceOther: '',
  winnerCount: 2,
  prizePerWinner: 25000,

  // Checkout
  voucherCode: '',

  // JFU Kilat
  isKilatUpgrade: false,
  kilatStartDate: '',
  kilatStartTime: '',
  regularStartDateBackup: '',
  regularStartTimeBackup: '',
};

/**
 * Isian milik PENELITI, bukan milik survei — boleh terbawa ke survei
 * berikutnya. Semua field lain milik satu order.
 */
const RESEARCHER_FIELDS = [
  'fullName',
  'email',
  'phoneNumber',
  'university',
  'department',
  'status',
  'referralSource',
  'referralSourceOther',
] as const satisfies ReadonlyArray<keyof SurveyFormData>;

/**
 * Draf sesudah Google Form diimpor dari modal pintu masuk.
 *
 * ⚠️ Survei BERBEDA dari draf = order baru: mulai dari nilai awal, hanya isian
 * peneliti yang dibawa. Dulu hasil impor ditumpuk di atas draf lama, jadi
 * voucher, Kilat, tanggal tayang, hadiah, dan persetujuan S&K milik order
 * sebelumnya ikut menempel ke survei yang baru — dan ikut menentukan harganya.
 *
 * Survei yang SAMA (impor ulang form yang sama) = lanjut draf, isian utuh.
 * Asal "form JFU" selalu dilepas: survei ini sekarang datang dari Google Form.
 */
export function formDataForImportedSurvey(
  draft: Partial<SurveyFormData>,
  imported: Partial<SurveyFormData>,
): SurveyFormData {
  const sameSurvey = !!draft.surveyUrl && draft.surveyUrl === imported.surveyUrl;

  const base: SurveyFormData = sameSurvey
    ? { ...DEFAULT_SURVEY_FORM_DATA, ...draft }
    : { ...DEFAULT_SURVEY_FORM_DATA };
  if (!sameSurvey) {
    for (const key of RESEARCHER_FIELDS) {
      if (draft[key] !== undefined) (base as unknown as Record<string, unknown>)[key] = draft[key];
    }
  }

  const next: SurveyFormData = { ...base, ...imported };
  delete next.customFormId;
  delete next.flaggedPersonalDataQuestions;
  return next;
}

/**
 * Impor yang terjadi DI DALAM wizard, setelah peneliti sempat mengisi kartu
 * konfigurasi (durasi, kriteria, hadiah) lewat jalur manual lalu beralih.
 *
 * `formDataForImportedSurvey` tetap yang membuang voucher, Kilat, tanggal, dan
 * S&K milik order lain. Yang ditambahkan di sini hanya field yang memang
 * terlihat di layar Detail — supaya isian yang baru diketik tidak hilang.
 * Impor ulang survei yang sama tetap melanjutkan draf utuh.
 */
export function formDataForWizardImport(
  draft: Partial<SurveyFormData>,
  imported: Partial<SurveyFormData>,
): SurveyFormData {
  const next = formDataForImportedSurvey(draft, imported);
  const sameSurvey = !!draft.surveyUrl && draft.surveyUrl === imported.surveyUrl;
  if (sameSurvey) return next;

  if (draft.criteriaResponden) next.criteriaResponden = draft.criteriaResponden;
  if (typeof draft.duration === 'number' && draft.duration > 0) next.duration = draft.duration;
  if (typeof draft.winnerCount === 'number' && draft.winnerCount > 0) next.winnerCount = draft.winnerCount;
  if (typeof draft.prizePerWinner === 'number' && draft.prizePerWinner > 0) {
    next.prizePerWinner = draft.prizePerWinner;
  }
  return next;
}
