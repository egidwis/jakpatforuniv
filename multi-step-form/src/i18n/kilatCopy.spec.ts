import { describe, it, expect } from 'vitest';
import { translations } from './translations';

/*
  Teks jalur Kilat (wizard, kartu status, Jadwal & Bayar, perpanjangan, sukses
  bayar) tidak boleh memakai kosakata Iklan — Kilat bukan iklan yang tayang
  15.00 × N hari, melainkan satu gelombang push. Nama produk di rincian
  pembayaran, invoice, dan kuitansi = "Kilat Survei" (keputusan 25 Okt 2026).
*/
const KILAT_KEYS = [
  'surveyConfigurationKilat',
  'respondentCriteriaHelpKilat',
  'tipGeneralAudienceDescKilat',
  'kilatRateTooltipTitle',
  'kilatRateTooltipNote',
  'airingPeriodLabelKilat',
  'bannerTitleChooseWave',
  'bannerSubChooseWave',
  'bannerSubWaitingPaymentCutoffKilat',
  'bannerSubWaitingPaymentSlotsLimitedKilat',
  'cancelExtensionConfirmBodyKilat',
  'successPaidBodyKilat',
] as const;

/** Kalimat bersama yang dilihat order Kilat juga — dinetralkan, bukan dicabangkan. */
const SHARED_KEYS = [
  'scheduleEmptyRejected',
  'publicationLivePrefix',
  'rescheduleHandledByTeam',
  'rescheduleHandledByTeamShort',
  'topupEducationNote',
  'scheduleAgainAddRewardToggle',
] as const;

describe('teks jalur Kilat', () => {
  it('kunci Kilat ada di kedua bahasa dan tidak menyebut iklan', () => {
    for (const key of KILAT_KEYS) {
      expect(translations.id[key], key).toBeTruthy();
      expect(translations.en[key], key).toBeTruthy();
      expect(translations.id[key].toLowerCase(), key).not.toContain('iklan');
      expect(translations.en[key].toLowerCase(), key).not.toMatch(/\bads?\b/);
    }
  });

  it('kalimat bersama tidak lagi menyebut iklan', () => {
    for (const key of SHARED_KEYS) {
      expect(translations.id[key].toLowerCase(), key).not.toContain('iklan');
    }
  });

  it('sukses bayar Kilat menyebut gelombang, bukan 15.00 × hari', () => {
    expect(translations.id.successPaidBodyKilat).toContain('{hour}');
    expect(translations.id.successPaidBodyKilat).not.toContain('15.00');
    expect(translations.id.successPaidBodyKilat).not.toContain('{days}');
  });
});

describe('nama produk di rincian pembayaran', () => {
  it('baris rincian = "Kilat Survei"', () => {
    expect(translations.id.costLineKilat).toBe('Kilat Survei');
    expect(translations.id.kilatRateTitle).toContain('Kilat Survei');
  });
});

describe('modal "Pesanan Diterima" saat tim libur', () => {
  it('langkah yang menjanjikan waktu kerja tim punya versi libur, tanpa catatan terpisah', () => {
    for (const lang of ['id', 'en'] as const) {
      expect(translations[lang].reviewModalStep1Away, lang).toBeTruthy();
      expect(translations[lang].adminScheduleModalStep2Away, lang).toBeTruthy();
    }
    expect(translations.id.reviewModalStep1Away).toMatch(/kembali dari libur/);
    expect(translations.id.adminScheduleModalStep2Away).toMatch(/kembali dari libur/);
    // Versi libur tidak lagi menjanjikan "maks N hari kerja" yang bertabrakan dengan libur.
    expect(translations.id.reviewModalStep1Away).not.toMatch(/maks/);
    expect(translations.id.adminScheduleModalStep2Away).not.toMatch(/maks/);
  });
});
