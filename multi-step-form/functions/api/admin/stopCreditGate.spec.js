import { describe, expect, it } from 'vitest';
import { validateStopCredit } from './stopCreditGate.js';

const id = 'b7eb61ca-079a-4787-9787-be253b0a1111';

describe('validateStopCredit', () => {
  it('meloloskan kedua mode', () => {
    expect(validateStopCredit({ scheduleId: id, mode: 'stop_aired' })).toBeNull();
    expect(validateStopCredit({ scheduleId: id, mode: 'cancel_before_air' })).toBeNull();
  });

  it('menolak id yang bukan uuid', () => {
    expect(validateStopCredit({ scheduleId: 'semua', mode: 'stop_aired' })).toMatch(/Jadwal/);
  });

  it('menolak daftar jadwal — satu jadwal per panggilan', () => {
    expect(validateStopCredit({ scheduleId: [id], mode: 'stop_aired' })).toMatch(/Jadwal/);
  });

  it('menolak mode di luar daftar', () => {
    expect(validateStopCredit({ scheduleId: id, mode: 'hapus' })).toMatch(/Mode/);
    expect(validateStopCredit({ scheduleId: id })).toMatch(/Mode/);
  });

  it('menolak body kosong', () => {
    expect(validateStopCredit(null)).toMatch(/kosong/);
  });
});
