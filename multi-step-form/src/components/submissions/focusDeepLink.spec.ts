import { describe, expect, it } from 'vitest';
import { resolveFocusOpen } from './focusDeepLink';

/**
 * Simulasi induk + anak: induk memegang focus, anak memanggil resolveFocusOpen
 * setiap kali `submissions` berubah, lalu mengosongkan focus bila diminta.
 */
function simulate(focusId: string | null, loads: string[][]): Array<string | null> {
  let focus: { id: string } | null = focusId ? { id: focusId } : null;
  const opened: Array<string | null> = [];
  for (const ids of loads) {
    const d = resolveFocusOpen(focus, ids);
    opened.push(d.openId);
    if (d.consume) focus = null;
  }
  return opened;
}

describe('resolveFocusOpen', () => {
  it('tanpa focus: tidak membuka apa pun', () => {
    expect(resolveFocusOpen(null, ['a'])).toEqual({ openId: null, consume: false });
  });

  it('baris belum termuat: menunggu, focus TIDAK dikonsumsi', () => {
    expect(resolveFocusOpen({ id: 'x' }, ['a', 'b'])).toEqual({ openId: null, consume: false });
  });

  it('baris termuat: buka dan konsumsi', () => {
    expect(resolveFocusOpen({ id: 'x' }, ['a', 'x'])).toEqual({ openId: 'x', consume: true });
  });

  it('regresi: perubahan submissions sesudahnya (Reset/Approve/audit) TIDAK membuka ulang order deep-link lama', () => {
    // muat pertama tanpa X → muat berisi X → Reset Y → audit AI selesai
    expect(simulate('x', [['y'], ['x', 'y'], ['x', 'y'], ['x', 'y']])).toEqual([null, 'x', null, null]);
  });
});
