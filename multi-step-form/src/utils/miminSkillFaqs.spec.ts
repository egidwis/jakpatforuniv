import { describe, expect, it } from 'vitest';
import { faqsForSkill, formatLinkedFaqsForPrompt } from './miminSkillFaqs';

describe('miminSkillFaqs', () => {
  const faqs = [
    { id: 'a', q: 'Bagaimana cara kerja?', a: 'Kami distribusikan linkmu.' },
    { id: 'b', q: 'Boleh data pribadi?', a: 'Tidak.' },
    { q: 'Tanpa id', a: '—' },
  ];

  it('mengambil FAQ yang ditautkan, mengabaikan id yang hilang', () => {
    expect(faqsForSkill(['a', 'missing'], faqs).map((f) => f.id)).toEqual(['a']);
    expect(faqsForSkill([], faqs)).toEqual([]);
  });

  it('menyusun blok prompt', () => {
    const block = formatLinkedFaqsForPrompt([{ q: 'Q1', a: 'A1' }]);
    expect(block).toContain('FAQ TERKAIT');
    expect(block).toContain('Q: Q1');
    expect(block).toContain('A: A1');
    expect(block).toContain('"type": "faq_list"');
  });
});
