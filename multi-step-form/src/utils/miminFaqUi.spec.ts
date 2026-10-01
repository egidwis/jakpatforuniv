import { describe, expect, it } from 'vitest';
import { bestFaqIndex, ensureFaqListUi, pickSkillWithFaqs, scoreSkillTrigger } from './miminFaqUi';

const skills = [
  {
    name: 'Penjelasan Cara Kerja JFU',
    trigger_context: 'User bingung cara pakai dan cara kerja JFU atau Jakpat for Universities',
    linked_faq_ids: ['a', 'b'],
  },
  {
    name: 'Extend',
    trigger_context: 'responden sepi dan ingin perpanjang durasi',
    linked_faq_ids: ['c'],
  },
];

const faqs = [
  { id: 'a', q: 'Bagaimana cara kerja Jakpat for Universities?', a: 'Kami distribusikan linkmu.' },
  { id: 'b', q: 'Apakah Mimin bisa membuatkan survei otomatis?', a: 'Tidak.' },
  { id: 'c', q: 'Bisa perpanjang?', a: 'Bisa.' },
];

describe('miminFaqUi', () => {
  it('memilih skill cara kerja dari prompt bingung', () => {
    const skill = pickSkillWithFaqs('gimana sih cara kerjanya aku bingung', skills);
    expect(skill?.name).toBe('Penjelasan Cara Kerja JFU');
    expect(scoreSkillTrigger('gimana sih cara kerjanya aku bingung', skills[0])).toBeGreaterThan(0);
  });

  it('membuka FAQ yang paling dekat dengan pertanyaan user', () => {
    expect(bestFaqIndex('cara kerja jfu', faqs)).toBe(0);
  });

  it('mengganti kartu generik dengan accordion FAQ tertaut', () => {
    const ui = ensureFaqListUi({
      userPrompt: 'gimana sih cara kerjanya aku bingung',
      skills,
      faqs,
      generativeUi: {
        component: 'Card',
        props: { title: 'Bagaimana Cara Kerja Jakpat for Universities?', description: 'Ringkas.' },
      },
    });
    expect(ui?.type).toBe('faq_list');
    expect(ui?.props?.items).toHaveLength(2);
    expect(ui?.props?.items[0].q).toContain('cara kerja');
  });

  it('tidak menimpa kalkulator harga', () => {
    const ui = ensureFaqListUi({
      userPrompt: 'gimana cara kerja',
      skills,
      faqs,
      generativeUi: { type: 'price_calculator' },
    });
    expect(ui?.type).toBe('price_calculator');
  });
});
