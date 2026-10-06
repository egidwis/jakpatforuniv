import { describe, it, expect } from 'vitest';
import { DEFAULT_SURVEY_FORM_DATA, formDataForImportedSurvey, formDataForWizardImport } from './defaultFormData';
import type { SurveyFormData } from '../types';

const OLD_URL = 'https://docs.google.com/forms/d/lama/viewform';
const NEW_URL = 'https://docs.google.com/forms/d/baru/viewform';

/** Draf order sebelumnya yang belum selesai — voucher, Kilat, jadwal, S&K terisi. */
const staleDraft: Partial<SurveyFormData> = {
  surveyUrl: OLD_URL,
  title: 'Survei Lama',
  questionCount: 60,
  criteriaResponden: 'Mahasiswa',
  duration: 7,
  startDate: '2026-10-05',
  endDate: '2026-10-12',
  winnerCount: 5,
  prizePerWinner: 50000,
  voucherCode: 'JFUFEB',
  isKilatUpgrade: true,
  kilatStartDate: '2026-10-05',
  termsAccepted: true,
  customFormId: 'jfu-123',
  flaggedPersonalDataQuestions: ['NIK'],
  fullName: 'Peneliti',
  email: 'peneliti@kampus.ac.id',
  phoneNumber: '081234567890',
  university: 'Univ X',
  department: 'Psikologi',
  status: 'S2',
};

const imported: Partial<SurveyFormData> = {
  surveyUrl: NEW_URL,
  title: 'Survei Baru',
  description: 'desc',
  questionCount: 20,
  isManualEntry: false,
  hasPersonalDataQuestions: false,
  detectedKeywords: [],
};

describe('formDataForImportedSurvey — survei baru = order baru', () => {
  const next = formDataForImportedSurvey(staleDraft, imported);

  it('tidak membawa voucher, Kilat, jadwal, hadiah, atau S&K order lama', () => {
    expect(next.voucherCode).toBe(DEFAULT_SURVEY_FORM_DATA.voucherCode);
    expect(next.isKilatUpgrade).toBe(false);
    expect(next.kilatStartDate).toBe('');
    expect(next.startDate).toBe('');
    expect(next.endDate).toBe('');
    expect(next.duration).toBe(DEFAULT_SURVEY_FORM_DATA.duration);
    expect(next.winnerCount).toBe(DEFAULT_SURVEY_FORM_DATA.winnerCount);
    expect(next.prizePerWinner).toBe(DEFAULT_SURVEY_FORM_DATA.prizePerWinner);
    expect(next.criteriaResponden).toBe('');
    expect(next.termsAccepted).toBeUndefined();
  });

  it('memakai isian survei hasil impor', () => {
    expect(next.surveyUrl).toBe(NEW_URL);
    expect(next.title).toBe('Survei Baru');
    expect(next.questionCount).toBe(20);
  });

  it('membawa isian peneliti (kontak & biodata)', () => {
    expect(next.fullName).toBe('Peneliti');
    expect(next.email).toBe('peneliti@kampus.ac.id');
    expect(next.phoneNumber).toBe('081234567890');
    expect(next.university).toBe('Univ X');
    expect(next.department).toBe('Psikologi');
    expect(next.status).toBe('S2');
  });

  it('melepas asal form JFU', () => {
    expect('customFormId' in next).toBe(false);
    expect('flaggedPersonalDataQuestions' in next).toBe(false);
  });
});

describe('formDataForImportedSurvey — impor ulang survei yang sama', () => {
  const next = formDataForImportedSurvey(staleDraft, { ...imported, surveyUrl: OLD_URL, title: 'Survei Lama (v2)' });

  it('melanjutkan draf: isian order tetap utuh', () => {
    expect(next.voucherCode).toBe('JFUFEB');
    expect(next.duration).toBe(7);
    expect(next.startDate).toBe('2026-10-05');
    expect(next.termsAccepted).toBe(true);
  });

  it('isian survei diperbarui dari hasil impor, asal JFU tetap dilepas', () => {
    expect(next.title).toBe('Survei Lama (v2)');
    expect(next.questionCount).toBe(20);
    expect('customFormId' in next).toBe(false);
  });
});

describe('formDataForWizardImport — ganti dari isian manual yang sudah terisi', () => {
  const typed: Partial<SurveyFormData> = {
    ...staleDraft,
    surveyUrl: '',
    title: '',
    questionCount: 0,
    criteriaResponden: 'Usia 18-24',
    duration: 4,
    winnerCount: 3,
    prizePerWinner: 50000,
  };

  const next = formDataForWizardImport(typed, imported);

  it('menyimpan durasi, kriteria, dan hadiah yang baru diketik', () => {
    expect(next.criteriaResponden).toBe('Usia 18-24');
    expect(next.duration).toBe(4);
    expect(next.winnerCount).toBe(3);
    expect(next.prizePerWinner).toBe(50000);
  });

  it('tetap membuang voucher, Kilat, tanggal, dan S&K order lama', () => {
    expect(next.voucherCode).toBe(DEFAULT_SURVEY_FORM_DATA.voucherCode);
    expect(next.isKilatUpgrade).toBe(false);
    expect(next.startDate).toBe('');
    expect(next.termsAccepted).toBeUndefined();
  });

  it('memakai identitas survei hasil impor', () => {
    expect(next.surveyUrl).toBe(NEW_URL);
    expect(next.title).toBe('Survei Baru');
    expect(next.questionCount).toBe(20);
  });
});

describe('formDataForImportedSurvey — tanpa draf', () => {
  it('draf kosong tidak dianggap "survei yang sama"', () => {
    const next = formDataForImportedSurvey({}, imported);
    expect(next).toEqual({ ...DEFAULT_SURVEY_FORM_DATA, ...imported });
  });
});
