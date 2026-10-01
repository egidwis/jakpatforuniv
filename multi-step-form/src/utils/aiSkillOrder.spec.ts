import { describe, expect, it } from 'vitest';
import { compactedSkillSortOrders, skillSortHasGaps } from './aiSkillOrder';

describe('aiSkillOrder', () => {
  it('merapatkan 1,2,3,4,7,8 menjadi 1..6 tanpa mengubah urutan', () => {
    const skills = [
      { id: 'a', name: 'A', sort_order: 1 },
      { id: 'b', name: 'B', sort_order: 2 },
      { id: 'c', name: 'C', sort_order: 3 },
      { id: 'd', name: 'D', sort_order: 4 },
      { id: 'e', name: 'E', sort_order: 7 },
      { id: 'f', name: 'F', sort_order: 8 },
    ];
    expect(skillSortHasGaps(skills)).toBe(true);
    expect(compactedSkillSortOrders(skills).map((s) => [s.id, s.sort_order])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
      ['e', 5],
      ['f', 6],
    ]);
  });

  it('diam jika sudah rapat', () => {
    const skills = [
      { id: 'a', name: 'A', sort_order: 1 },
      { id: 'b', name: 'B', sort_order: 2 },
    ];
    expect(skillSortHasGaps(skills)).toBe(false);
  });
});
