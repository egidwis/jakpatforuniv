import { describe, it, expect } from 'vitest';
import {
  isOtherOption,
  getOtherDetail,
  isRedundantMultiSelectHint,
  getNextUnansweredMatrixRowIndex
} from './PublicFormPage';

describe('PublicFormPage Logic Helpers', () => {
  it('correctly identifies other / sebutkan option labels', () => {
    expect(isOtherOption('Indomie Rasa Lainnya (Sebutkan)')).toBe(true);
    expect(isOtherOption('Lainnya')).toBe(true);
    expect(isOtherOption('Other')).toBe(true);
    expect(isOtherOption('Indomie Goreng')).toBe(false);
  });

  it('extracts custom other details accurately', () => {
    const val = 'Indomie Rasa Lainnya (Sebutkan): Indomie Cabe Ijo';
    const opt = 'Indomie Rasa Lainnya (Sebutkan)';
    expect(getOtherDetail(val, opt)).toBe('Indomie Cabe Ijo');

    const emptyDetailVal = 'Indomie Rasa Lainnya (Sebutkan)';
    expect(getOtherDetail(emptyDetailVal, opt)).toBe('');
  });

  it('detects redundant multi-select hint descriptions so they do not duplicate the automatic badge', () => {
    expect(isRedundantMultiSelectHint('Boleh memilih lebih dari satu')).toBe(true);
    expect(isRedundantMultiSelectHint('Boleh pilih lebih dari satu.')).toBe(true);
    expect(isRedundantMultiSelectHint('Pilih lebih dari satu jawaban')).toBe(true);
    expect(isRedundantMultiSelectHint('Dapat memilih beberapa opsi')).toBe(true);
    expect(isRedundantMultiSelectHint('Select all that apply')).toBe(true);
    expect(isRedundantMultiSelectHint('Pilih maksimal 3 jawaban yang paling sesuai')).toBe(false);
    expect(isRedundantMultiSelectHint('Berdasarkan pengalaman Anda dalam 1 bulan terakhir')).toBe(false);
    expect(isRedundantMultiSelectHint(undefined)).toBe(false);
  });

  it('finds the next unanswered matrix row index for Focus Card Stepper auto-advance', () => {
    const rows = [
      { id: 'r1', label: 'Rasa Senang' },
      { id: 'r2', label: 'Rasa Puas' },
      { id: 'r3', label: 'Bersemangat' },
      { id: 'r4', label: 'Bangga' }
    ];

    // Answering r1 (index 0) should advance to r2 (index 1)
    expect(getNextUnansweredMatrixRowIndex(rows, { r1: 'Cukup' }, 0)).toBe(1);

    // If r2 is already answered and user answers r1 (index 0), should jump to r3 (index 2)
    expect(getNextUnansweredMatrixRowIndex(rows, { r1: 'Cukup', r2: 'Kuat' }, 0)).toBe(2);

    // If user skipped r2 and answers r4 (index 3), should wrap around to r2 (index 1)
    expect(getNextUnansweredMatrixRowIndex(rows, { r1: 'Cukup', r3: 'Kuat', r4: 'Sangat Kuat' }, 3)).toBe(1);

    // When all rows are answered, should return -1 (stay on current card)
    expect(
      getNextUnansweredMatrixRowIndex(
        rows,
        { r1: 'Cukup', r2: 'Kuat', r3: 'Kuat', r4: 'Sangat Kuat' },
        3
      )
    ).toBe(-1);
  });

  it('evaluates conditional rule with other options with details', () => {
    const rule = {
      sourceBlockId: 'q2',
      operator: 'equals',
      value: 'Lainnya'
    };
    const currentAnswers: Record<string, string> = {
      q2: 'Lainnya: Rasa Rendang'
    };
    const val = currentAnswers[rule.sourceBlockId];
    const isMatched = String(val || '').startsWith(`${rule.value}: `) || String(val || '') === String(rule.value || '');
    expect(isMatched).toBe(true);
  });
});
