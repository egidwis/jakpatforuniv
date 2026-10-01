import { describe, expect, it } from 'vitest';
import { looksLikeEmailAddress, toMailtoHref } from './chatLinks';

describe('chatLinks', () => {
  it('mengenali alamat email polos dan membungkus mailto', () => {
    expect(looksLikeEmailAddress('product@jakpat.net')).toBe(true);
    expect(toMailtoHref('product@jakpat.net')).toBe('mailto:product@jakpat.net');
    expect(toMailtoHref('mailto:product@jakpat.net?subject=Hi')).toBe(
      'mailto:product@jakpat.net?subject=Hi'
    );
  });
});
