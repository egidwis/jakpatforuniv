import { describe, it, expect } from 'vitest';
import { restoreDraft, type DraftStorage } from './draftRestore';
import { SURVEY_DRAFT_KEY, LEGACY_SURVEY_DRAFT_KEY } from './constants';

/**
 * Penjaga untuk jebakan yang bentuknya berulang di repo ini: NOMOR step
 * dipulihkan dari localStorage, tapi ARTI nomor itu sudah berubah.
 *
 *   v1  (`survey_form_draft`)     1 Survei, 2 Biodata, 3 Jadwal, 4 Review, 5 Kilat
 *   v2 lama (s/d 2026-08-10)      1 Survei, 2 Jadwal,  3 Review, 4 Kilat
 *   v2 sekarang (e7584b4)         1 Survei, 2 Ringkasan, 3 Jadwal, 4 Kilat
 *
 * Kotak centang S&K hanya ada di layar Ringkasan, sementara layar Jadwal yang
 * MENEGAKKAN gerbangnya (`submitOrder` melempar 'terms' saat slot dikunci).
 * Begitu step 3 bertukar arti dari Ringkasan → Jadwal, draft lama mendaratkan
 * user tepat di depan gerbang yang belum pernah ia lewati.
 */

const makeStorage = (seed: Record<string, string> = {}): DraftStorage & { dump: () => Record<string, string> } => {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
};

/** Isian yang sudah lolos semua syarat Ringkasan. */
const readyFormData = {
  title: 'Persepsi Mahasiswa terhadap Transportasi Publik',
  questionCount: 20,
  duration: 3,
  fullName: 'Rani Pratiwi',
  email: 'rani@kampus.ac.id',
  phoneNumber: '081234567890',
  termsAccepted: true,
};

const v2 = (draft: unknown) => ({ [SURVEY_DRAFT_KEY]: JSON.stringify(draft) });
const v1 = (draft: unknown) => ({ [LEGACY_SURVEY_DRAFT_KEY]: JSON.stringify(draft) });

describe('restoreDraft — gerbang S&K tidak boleh terlewati oleh pemulihan draft', () => {
  it('BUG: draft v2 lama di step 3 (dulu Ringkasan) tidak boleh mendarat di Jadwal', () => {
    // Draft v2 lama memang tidak PUNYA kunci ini, bukan menyimpannya `false`.
    const belumSetuju: Record<string, unknown> = { ...readyFormData };
    delete belumSetuju.termsAccepted;
    const storage = makeStorage(v2({ formData: belumSetuju, currentStep: 3 }));

    // Step 3 sekarang = Jadwal. Tanpa S&K, "Kunci Jadwal" pasti ditolak di
    // layar yang bahkan tidak punya kotak centangnya.
    expect(restoreDraft(storage).currentStep).toBe(2);
  });

  it('draft yang sudah setuju S&K tetap mendarat di Jadwal', () => {
    const storage = makeStorage(v2({ formData: readyFormData, currentStep: 3 }));
    expect(restoreDraft(storage).currentStep).toBe(3);
  });

  it('data survei belum lengkap → dikembalikan ke step 1, bukan ke Ringkasan', () => {
    // Judul/jumlah pertanyaan hanya bisa dibereskan di Detail Survei.
    const storage = makeStorage(v2({ formData: { ...readyFormData, title: '' }, currentStep: 3 }));
    expect(restoreDraft(storage).currentStep).toBe(1);
  });

  it('kontak invoice belum sah → dikembalikan ke Ringkasan, tempat kolomnya ada', () => {
    const storage = makeStorage(v2({ formData: { ...readyFormData, phoneNumber: '0812' }, currentStep: 3 }));
    expect(restoreDraft(storage).currentStep).toBe(2);
  });

  it('step 1 dan 2 tidak pernah diganggu gerbang — di sanalah isiannya dibereskan', () => {
    const storage = makeStorage(v2({ formData: {}, currentStep: 2 }));
    expect(restoreDraft(storage).currentStep).toBe(2);
  });
});

describe('restoreDraft — migrasi draft v1 ke penomoran sekarang', () => {
  it('v1 step 4 (Review) → 2 (Ringkasan), bukan 3 (Jadwal)', () => {
    const storage = makeStorage(v1({ formData: readyFormData, currentStep: 4 }));
    expect(restoreDraft(storage).currentStep).toBe(2);
  });

  it('v1 step 3 (Jadwal) → 3 (Jadwal)', () => {
    const storage = makeStorage(v1({ formData: readyFormData, currentStep: 3 }));
    expect(restoreDraft(storage).currentStep).toBe(3);
  });

  it('v1 step 2 (Biodata, layarnya sudah tidak ada) → 1', () => {
    const storage = makeStorage(v1({ formData: readyFormData, currentStep: 2 }));
    expect(restoreDraft(storage).currentStep).toBe(1);
  });

  it('v1 step 5 (Kilat) → 4', () => {
    const storage = makeStorage(v1({ formData: readyFormData, currentStep: 5 }));
    expect(restoreDraft(storage).currentStep).toBe(4);
  });

  it('draft v1 dipindahkan ke kunci v2 dan kunci lamanya dibuang', () => {
    const storage = makeStorage(v1({ formData: readyFormData, currentStep: 4 }));
    restoreDraft(storage);

    const after = storage.dump();
    expect(after[LEGACY_SURVEY_DRAFT_KEY]).toBeUndefined();
    expect(JSON.parse(after[SURVEY_DRAFT_KEY]).currentStep).toBe(2);
  });

  it('kunci v2 menang kalau keduanya ada — draft v1 tidak boleh menimpanya', () => {
    const storage = makeStorage({
      ...v2({ formData: readyFormData, currentStep: 3 }),
      ...v1({ formData: { title: 'draft basi' }, currentStep: 5 }),
    });
    expect(restoreDraft(storage).currentStep).toBe(3);
    expect(restoreDraft(storage).formData?.title).toBe(readyFormData.title);
  });
});

describe('restoreDraft — masukan yang tidak wajar', () => {
  it('tanpa draft sama sekali → step 1, tanpa formData', () => {
    const restored = restoreDraft(makeStorage());
    expect(restored.currentStep).toBe(1);
    expect(restored.formData).toBeUndefined();
  });

  it('JSON korup → step 1, bukan lempar error', () => {
    const storage = makeStorage({ [SURVEY_DRAFT_KEY]: '{bukan json' });
    expect(restoreDraft(storage).currentStep).toBe(1);
  });

  it('step di luar jangkauan dijepit ke 1..4', () => {
    expect(restoreDraft(makeStorage(v2({ formData: readyFormData, currentStep: 99 }))).currentStep).toBe(4);
    expect(restoreDraft(makeStorage(v2({ formData: readyFormData, currentStep: 0 }))).currentStep).toBe(1);
    expect(restoreDraft(makeStorage(v2({ formData: readyFormData, currentStep: '3' }))).currentStep).toBe(1);
  });

  it('formData dikembalikan apa adanya untuk digabung pemanggil', () => {
    const storage = makeStorage(v2({ formData: readyFormData, currentStep: 2 }));
    expect(restoreDraft(storage).formData).toEqual(readyFormData);
  });
});
