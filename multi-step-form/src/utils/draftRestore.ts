import type { SurveyFormData } from '../types';
import { SURVEY_DRAFT_KEY, LEGACY_SURVEY_DRAFT_KEY } from './constants';
import { checkoutBlocker, type CheckoutBlockerCode } from './orderReadiness';

/**
 * Pemulihan draft order dari localStorage.
 *
 * Dipisahkan dari `MultiStepForm` bukan demi kerapian, melainkan supaya
 * aturannya bisa diuji langsung: satu-satunya bug yang pernah lahir di sini
 * bentuknya "nomor step yang dipulihkan sudah berubah arti", dan itu mustahil
 * ditangkap dengan membaca komponennya.
 *
 * Penomoran step yang BERLAKU SEKARANG:
 *   1 Detail Survei · 2 Ringkasan · 3 Jadwal Tayang · 4 Jadwal Kilat
 *
 * Sejarahnya, karena draft lama tidak ikut mati saat urutannya diubah:
 *   v1  (`survey_form_draft`)  1 Survei, 2 Biodata, 3 Jadwal, 4 Review, 5 Kilat
 *   v2 lama (s/d 2026-08-10)   1 Survei, 2 Jadwal,  3 Review, 4 Kilat
 */
const FIRST_STEP = 1;
const LAST_STEP = 4;
const SUMMARY_STEP = 2;
const SCHEDULE_STEP = 3;

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RestoredDraft {
  /** Apa adanya dari draft — penggabungan dengan nilai default milik pemanggil. */
  formData?: Partial<SurveyFormData>;
  /** Sudah dijepit ke 1..4 DAN sudah dijamin tidak melewati gerbang Ringkasan. */
  currentStep: number;
}

/**
 * v1 → penomoran sekarang. Peta lama (`{3:2, 4:3}`) menerjemahkan v1 ke v2
 * LAMA dan tidak pernah ikut dibalik saat urutan flow dibalik, sehingga
 * Review dan Jadwal justru saling tertukar: draft yang berhenti di Review
 * dilempar ke layar Jadwal.
 *
 * Biodata (2) tidak punya layar lagi — StepTwo sudah dihapus, isinya kini
 * di-prefill diam-diam dari profil, jadi draft di situ mundur ke step 1.
 */
const LEGACY_STEP_MAP: Record<number, number> = {
  1: 1, // Survei    → Detail Survei
  2: 1, // Biodata   → layarnya sudah tidak ada
  3: 3, // Jadwal    → Jadwal Tayang
  4: 2, // Review    → Ringkasan
  5: 4, // Kilat     → Jadwal Kilat
};

const clampStep = (step: unknown): number =>
  typeof step === 'number' && Number.isFinite(step)
    ? Math.min(Math.max(Math.trunc(step), FIRST_STEP), LAST_STEP)
    : FIRST_STEP;

/**
 * Layar tempat pemblokir itu benar-benar bisa dibereskan.
 *
 * Judul & jumlah pertanyaan hanya ada di Detail Survei; S&K dan kontak invoice
 * ada di Ringkasan. Mengembalikan orang ke layar yang tidak memuat kolomnya
 * sama saja dengan bug yang sedang ditutup ini.
 */
const stepThatFixes = (code: CheckoutBlockerCode): number =>
  code === 'survey_incomplete' ? FIRST_STEP : SUMMARY_STEP;

/**
 * Draft TIDAK BOLEH mendaratkan user melewati gerbang yang belum ia penuhi.
 *
 * Sejak step 3 (Jadwal), tombolnya langsung melahirkan order lewat
 * `submitOrder()` — yang memvalidasi ulang seluruh syarat Ringkasan. Setiap
 * syarat yang belum beres karena itu muncul sebagai toast di layar yang tidak
 * punya kolom untuk membereskannya ("Mohon setujui Syarat & Ketentuan…" di
 * layar jadwal). Invarian ini berlaku untuk draft dari versi mana pun, jadi
 * ia tetap menutup lubangnya kalau urutan step diubah lagi nanti.
 */
const gateStep = (step: number, formData: Partial<SurveyFormData> | undefined): number => {
  if (step < SCHEDULE_STEP) return step;
  const blocker = checkoutBlocker(formData ?? {});
  return blocker ? stepThatFixes(blocker) : step;
};

const parse = (raw: string | null): { formData?: Partial<SurveyFormData>; currentStep?: unknown } | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null; // Draft korup — mulai dari awal.
  }
};

export function restoreDraft(storage: DraftStorage): RestoredDraft {
  const current = parse(storage.getItem(SURVEY_DRAFT_KEY));
  if (current) {
    return {
      formData: current.formData,
      currentStep: gateStep(clampStep(current.currentStep), current.formData),
    };
  }

  const legacy = parse(storage.getItem(LEGACY_SURVEY_DRAFT_KEY));
  if (legacy) {
    const migrated = LEGACY_STEP_MAP[legacy.currentStep as number] ?? FIRST_STEP;
    storage.setItem(SURVEY_DRAFT_KEY, JSON.stringify({ ...legacy, currentStep: migrated }));
    storage.removeItem(LEGACY_SURVEY_DRAFT_KEY);
    return {
      formData: legacy.formData,
      currentStep: gateStep(migrated, legacy.formData),
    };
  }

  return { currentStep: FIRST_STEP };
}
