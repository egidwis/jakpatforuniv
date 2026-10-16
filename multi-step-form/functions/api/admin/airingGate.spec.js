import { describe, expect, it } from 'vitest';
import { validateAiringWrite } from './airingGate.js';

const id = 'b7eb61ca-079a-4787-9787-be253b0a1111';

describe('validateAiringWrite', () => {
  it('meloloskan status tayang', () => {
    expect(validateAiringWrite({ action: 'submission-status', submissionId: id, status: 'live' })).toBeNull();
  });

  it('menolak status lunas', () => {
    expect(validateAiringWrite({ action: 'submission-status', submissionId: id, status: 'paid' })).toMatch(/Status/);
  });

  it('meloloskan nominal perpanjangan yang belum tempo', () => {
    expect(validateAiringWrite({
      action: 'extension-bill',
      sourceId: id,
      totalCost: 111000,
      subtotal: 100000,
      ppnAmount: 11000,
      waitingPayment: true,
    })).toBeNull();
  });

  it('menolak nominal negatif', () => {
    expect(validateAiringWrite({
      action: 'extension-bill',
      sourceId: id,
      totalCost: -1,
      subtotal: 0,
      ppnAmount: 0,
      waitingPayment: false,
    })).toMatch(/Nominal/);
  });
});
