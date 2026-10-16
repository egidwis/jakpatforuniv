import { describe, it, expect } from 'vitest';
import { applyOrderProduct, doorProductOf } from './orderProduct';
import { canUseKilatSelfServe } from './kilatAccess';
import { isAutoApprovalPath } from './review-path';
import { DEFAULT_SURVEY_FORM_DATA } from './defaultFormData';
import { KILAT_PILOT_EMAILS, KILAT_SELF_SERVE_OPEN } from './constants';
import type { SurveyFormData } from '../types';

/*
  Pintu Kilat (Phase 5 §5.6): jenis order = pintu yang dipakai; parameter
  Kilat dari akun yang belum boleh diabaikan; berganti produk membuang jadwal.
*/

const base: SurveyFormData = {
  ...DEFAULT_SURVEY_FORM_DATA,
  surveyUrl: 'https://docs.google.com/forms/d/abc/viewform',
  title: 'Survei',
  questionCount: 20,
};

describe('canUseKilatSelfServe — pintu tertutup sampai Push B', () => {
  it('bendera masih tertutup dan daftar pilot kosong di Push A', () => {
    expect(KILAT_SELF_SERVE_OPEN).toBe(false);
    expect(KILAT_PILOT_EMAILS).toEqual([]);
  });

  it('admin boleh (uji wizard), peneliti biasa tidak, email kosong tidak', () => {
    expect(canUseKilatSelfServe('product@jakpat.net')).toBe(true);
    expect(canUseKilatSelfServe(' Product@Jakpat.net ')).toBe(true);
    expect(canUseKilatSelfServe('peneliti@kampus.ac.id')).toBe(false);
    expect(canUseKilatSelfServe(null)).toBe(false);
  });

  it('daftar pilot huruf kecil — pemeriksaan tidak peka huruf', () => {
    for (const e of KILAT_PILOT_EMAILS) expect(e).toBe(e.toLowerCase());
  });
});

describe('doorProductOf', () => {
  it('?product=kilat hanya untuk akun yang boleh', () => {
    expect(doorProductOf('kilat', 'product@jakpat.net')).toBe('kilat');
    expect(doorProductOf('kilat', 'peneliti@kampus.ac.id')).toBe('regular');
    expect(doorProductOf(null, 'product@jakpat.net')).toBe('regular');
    expect(doorProductOf('iklan', 'product@jakpat.net')).toBe('regular');
  });
});

describe('applyOrderProduct', () => {
  it('sudah selaras → objek yang SAMA (efek tidak berputar)', () => {
    expect(applyOrderProduct(base, 'regular')).toBe(base);
    const k = { ...base, isKilatUpgrade: true, duration: 1 };
    expect(applyOrderProduct(k, 'kilat')).toBe(k);
  });

  it('Iklan → Kilat: durasi 1, jadwal Iklan dibuang', () => {
    const next = applyOrderProduct({ ...base, duration: 5, startDate: '2026-10-20', startTime: '15:00' }, 'kilat');
    expect(next).toMatchObject({ isKilatUpgrade: true, duration: 1, startDate: '', startTime: '', kilatSlotHour: null });
  });

  it('Kilat → Iklan (draft Kilat dibuka lewat pintu Iklan): durasi bawaan, gelombang dibuang', () => {
    const next = applyOrderProduct({ ...base, isKilatUpgrade: true, duration: 1, startDate: '2026-10-20', kilatSlotHour: 11 }, 'regular');
    expect(next).toMatchObject({ isKilatUpgrade: false, duration: DEFAULT_SURVEY_FORM_DATA.duration, startDate: '', kilatSlotHour: null });
  });

  it('Kilat dengan durasi lepas (impor dalam wizard) dijepit ke 1', () => {
    expect(applyOrderProduct({ ...base, isKilatUpgrade: true, duration: 3 }, 'kilat').duration).toBe(1);
  });
});

describe('isAutoApprovalPath — voucher verifikasi manual tidak membelokkan Kilat', () => {
  it.each(['JFUFEB', 'ILKOMUNY'])('%s: Iklan → manual, Kilat → tetap otomatis', (code) => {
    expect(isAutoApprovalPath({ ...base, voucherCode: code })).toBe(false);
    expect(isAutoApprovalPath({ ...base, voucherCode: code, isKilatUpgrade: true })).toBe(true);
  });

  it('PII tetap manual untuk Kilat', () => {
    expect(isAutoApprovalPath({ ...base, isKilatUpgrade: true, hasPersonalDataQuestions: true })).toBe(false);
  });
});
