import { describe, expect, it } from 'vitest';
import { repriceInputPatch, validateOrderWrite } from './orderGate.js';

const id = 'b7eb61ca-079a-4787-9787-be253b0a1111';

describe('validateOrderWrite', () => {
  it('meloloskan kriteria dan masukan harga', () => {
    expect(validateOrderWrite({ action: 'criteria', submissionId: id, criteria: 'mahasiswa' })).toBeNull();
    const body = {
      action: 'reprice',
      submissionId: id,
      questionCount: 20,
      duration: 7,
      prizePerWinner: 10000,
      winnerCount: 5,
      criteria: 'mahasiswa',
    };
    expect(validateOrderWrite(body)).toBeNull();
    expect(repriceInputPatch(body)).toEqual({
      question_count: 20,
      duration: 7,
      prize_per_winner: 10000,
      winner_count: 5,
      criteria_responden: 'mahasiswa',
    });
  });

  it('menolak nominal jadi dari browser', () => {
    expect(validateOrderWrite({
      action: 'reprice',
      submissionId: id,
      totalCost: 1000,
    })).toMatch(/Nominal/);
  });

  it('menolak jalur selain regular dan kilat', () => {
    expect(validateOrderWrite({ action: 'convert', submissionId: id, target: 'paid' })).toMatch(/Jalur/);
  });
});
