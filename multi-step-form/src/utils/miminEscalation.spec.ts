import { describe, expect, it } from 'vitest';
import {
  PRODUCT_EMAIL,
  ensureProductEscalation,
  isOutOfScopeConversation,
  needsProductEscalation,
  productMailto,
} from './miminEscalation';

describe('miminEscalation', () => {
  it('mengenali jawaban di luar pengetahuan meski tanpa alamat email', () => {
    expect(
      needsProductEscalation(
        'Mohon maaf, saya belum memiliki informasi mengenai hal tersebut. Untuk pertanyaan lebih lanjut, kamu bisa menghubungi tim kami.'
      )
    ).toBe(true);
  });

  it('menyisipkan mailto + kartu eskalasi bila model lupa CTA', () => {
    const result = ensureProductEscalation({
      reply: `Mohon maaf, saya belum memiliki informasi mengenai hal tersebut. Untuk pertanyaan lebih lanjut, kamu bisa menghubungi tim kami melalui email ke ${PRODUCT_EMAIL}`,
      userPrompt: 'kapan jokowi menjabat lagi ?',
      ctas: [],
    });

    expect(result.ctas[0]?.action).toBe('open_url');
    expect(result.ctas[0]?.target).toContain(`mailto:${PRODUCT_EMAIL}`);
    expect(result.ctas[0]?.target).toContain(encodeURIComponent('kapan jokowi menjabat lagi ?'));
    expect(result.generative_ui?.component).toBe('Card');
    expect(JSON.stringify(result.generative_ui)).toContain('mailto:');
  });

  it('tidak menimpa CTA mailto yang sudah benar', () => {
    const existing = {
      id: 'email',
      label: 'Email kami',
      action: 'open_url' as const,
      target: `mailto:${PRODUCT_EMAIL}`,
    };
    const result = ensureProductEscalation({
      reply: `Hubungi ${PRODUCT_EMAIL}`,
      userPrompt: 'MoU kampus',
      ctas: [existing],
      generativeUi: { type: 'keep' },
    });
    expect(result.ctas).toEqual([existing]);
    expect(result.generative_ui).toEqual({ type: 'keep' });
  });

  it('productMailto mengisi subject dan body', () => {
    const href = productMailto('integrasi API custom');
    expect(href.startsWith(`mailto:${PRODUCT_EMAIL}?`)).toBe(true);
    expect(href).toContain('subject=');
    expect(href).toContain(encodeURIComponent('integrasi API custom'));
  });

  it('isOutOfScopeConversation: frasa tidak tahu ATAU CTA mailto', () => {
    expect(isOutOfScopeConversation('Maaf, saya belum memiliki informasi mengenai hal tersebut.', [])).toBe(true);
    expect(isOutOfScopeConversation('Tarif iklan mengikuti jumlah soal.', [])).toBe(false);
    expect(
      isOutOfScopeConversation('Silakan tanya tim Product.', [
        { id: 'm', label: 'Email', action: 'open_url', target: `mailto:${PRODUCT_EMAIL}` },
      ])
    ).toBe(true);
  });
});
