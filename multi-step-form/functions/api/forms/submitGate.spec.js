import { describe, expect, it } from 'vitest';
import { validateFormSubmit } from './submitGate.js';

const id = 'b7eb61ca-079a-4787-9787-be253b0a1111';

describe('validateFormSubmit', () => {
  it('meloloskan jawaban objek', () => {
    expect(validateFormSubmit({ formId: id, answers: { q1: 'ya' } })).toBeNull();
  });

  it('menolak jawaban yang bukan objek', () => {
    expect(validateFormSubmit({ formId: id, answers: ['ya'] })).toMatch(/Jawaban/);
    expect(validateFormSubmit({ formId: 'bukan-uuid', answers: {} })).toMatch(/Form/);
  });
});
