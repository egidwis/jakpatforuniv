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
