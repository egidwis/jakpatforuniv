import { describe, expect, it } from 'vitest';
import { mergeIncomingMessage, normalizeReplyMode, toModelHistory } from './miminHandoff';

describe('miminHandoff', () => {
  it('menandai pesan admin supaya model tidak menimpanya', () => {
    const history = toModelHistory([
      { role: 'user', content: 'kapan jokowi menjabat?' },
      { role: 'admin', content: 'Itu di luar layanan kami.' },
      { role: 'assistant', content: 'Bisa saya bantu soal tarif.' },
    ]);
    expect(history[1].role).toBe('user');
    expect(history[1].content).toContain('Tim Jakpat');
    expect(history[1].content).toContain('Itu di luar layanan kami.');
    expect(history[2].role).toBe('assistant');
  });

  it('normalizeReplyMode hanya mengenal human', () => {
    expect(normalizeReplyMode('human')).toBe('human');
    expect(normalizeReplyMode(undefined)).toBe('ai');
    expect(normalizeReplyMode('bot')).toBe('ai');
  });

  it('mergeIncomingMessage menempel id ke pesan lokal yang sama', () => {
    const merged = mergeIncomingMessage(
      [{ role: 'user', content: 'halo' }],
      { id: 'abc', role: 'user', content: 'halo' }
    );
    expect(merged).toEqual([{ role: 'user', content: 'halo', id: 'abc' }]);
  });

  it('mergeIncomingMessage mengabaikan id yang sudah ada', () => {
    const prev = [{ id: 'abc', role: 'admin', content: 'siap' }];
    expect(mergeIncomingMessage(prev, { id: 'abc', role: 'admin', content: 'siap' })).toBe(prev);
  });
});
