import { describe, expect, it } from 'vitest';
import { validateMarkOnCredit } from './markOnCreditGate.js';

const id = 'b7eb61ca-079a-4787-9787-be253b0a1111';

describe('validateMarkOnCredit', () => {
  it('meloloskan satu jadwal', () => {
    expect(validateMarkOnCredit({ scheduleIds: [id], note: 'telat bayar' })).toBeNull();
  });

  it('menolak daftar kosong', () => {
    expect(validateMarkOnCredit({ scheduleIds: [] })).toMatch(/jadwal/);
  });

  it('menolak id yang bukan uuid', () => {
    expect(validateMarkOnCredit({ scheduleIds: ['semua'] })).toMatch(/jadwal/);
  });
});
