import { describe, it, expect } from 'vitest';
import { adminCancelLine, cancelNoteKey } from './cancelCause';
import { translations } from '@/i18n/translations';

/*
  Kartu dulu menyebut tim untuk SETIAP jadwal batal. Yang dijaga: kalimat
  "tim" hanya untuk `admin`; peneliti & hold habis punya kalimatnya sendiri;
  baris lama (NULL) netral.
*/
const CAUSES = ['admin', 'researcher', 'expired', null] as const;
const TEAM = /tim|team/i;

describe('cancelNoteKey', () => {
  it.each(['slot_cancelled', 'cancelled'] as const)('%s: setiap penyebab punya kunci ID & EN', (state) => {
    for (const cause of CAUSES) {
      const key = cancelNoteKey(state, cause);
      expect(translations.id[key]).toBeTruthy();
      expect(translations.en[key]).toBeTruthy();
    }
  });

  it.each(['slot_cancelled', 'cancelled'] as const)('%s: hanya `admin` yang menyebut tim', (state) => {
    expect(translations.id[cancelNoteKey(state, 'admin')]).toMatch(TEAM);
    for (const cause of ['researcher', 'expired', null, undefined] as const) {
      expect(translations.id[cancelNoteKey(state, cause)]).not.toMatch(TEAM);
      expect(translations.en[cancelNoteKey(state, cause)]).not.toMatch(TEAM);
    }
  });

  it('peneliti disapa sebagai pelaku; hold habis menyebut batas waktu bayar', () => {
    expect(translations.id[cancelNoteKey('slot_cancelled', 'researcher')]).toMatch(/^Kamu membatalkan/);
    expect(translations.id[cancelNoteKey('cancelled', 'researcher')]).toMatch(/^Kamu membatalkan/);
    expect(translations.id[cancelNoteKey('slot_cancelled', 'expired')]).toMatch(/otomatis.*batas waktu pembayaran/);
    expect(translations.id[cancelNoteKey('cancelled', 'expired')]).toMatch(/otomatis.*batas waktu pembayaran/);
  });

  it('jadwal pertama tetap menjamin review lolos, apa pun penyebabnya', () => {
    for (const cause of CAUSES) {
      expect(translations.id[cancelNoteKey('slot_cancelled', cause)]).toMatch(/tetap lolos review/);
    }
  });
});

describe('adminCancelLine (baris "Peneliti melihat")', () => {
  it('menyebut pelaku yang sama dengan kartu peneliti', () => {
    expect(adminCancelLine('admin')).toMatch(/tim Jakpat/);
    expect(adminCancelLine('researcher')).toMatch(/Peneliti membatalkan/);
    expect(adminCancelLine('expired')).toMatch(/otomatis/);
    expect(adminCancelLine(null)).toMatch(/tidak tercatat/);
    for (const cause of ['researcher', 'expired', null] as const) {
      expect(adminCancelLine(cause)).not.toMatch(/tim Jakpat/);
    }
  });
});
