import { describe, expect, it } from 'vitest';
import { resolveComponentType } from './resolveComponentType';

describe('resolveComponentType', () => {
  it('memetakan nama yang dikarang model ke komponen katalog', () => {
    expect(resolveComponentType('ComparisonCard')).toBe('ComparisonCard');
    expect(resolveComponentType('Stepper')).toBe('Stepper');
    expect(resolveComponentType('ListItem')).toBe('ListItem');
    expect(resolveComponentType('Steps')).toBe('Stepper');
    expect(resolveComponentType('Item')).toBe('ListItem');
  });

  it('jatuh ke Box untuk tipe yang sama sekali tidak dikenal', () => {
    expect(resolveComponentType('RainbowChart')).toBe('Box');
    expect(resolveComponentType('')).toBe('Box');
  });

  it('tidak mengubah nama yang sudah sah', () => {
    expect(resolveComponentType('FaqList')).toBe('FaqList');
    expect(resolveComponentType('Card')).toBe('Card');
  });
});
