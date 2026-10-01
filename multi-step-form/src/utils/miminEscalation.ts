import type { ChatCta, GenerativeUiData } from './supabase';

export const PRODUCT_EMAIL = 'product@jakpat.net';

const OUT_OF_KNOWLEDGE_REPLY =
  /belum memiliki informasi mengenai hal tersebut/i;

export function mentionsProductEmail(text: string): boolean {
  return /product@jakpat\.net/i.test(text || '');
}

export function productMailto(userQuestion?: string): string {
  const subject = 'Pertanyaan dari Mimin AI — Jakpat for Universities';
  const lines = [
    'Halo tim Product Jakpat for Univ,',
    '',
    userQuestion?.trim() ? `Saya ingin menanyakan:\n${userQuestion.trim()}` : 'Saya ingin menanyakan:',
    '',
    'Nama:',
    'Universitas:',
    'ID Survei (jika ada):',
  ];
  return `mailto:${PRODUCT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

export function needsProductEscalation(reply: string): boolean {
  return mentionsProductEmail(reply) || OUT_OF_KNOWLEDGE_REPLY.test(reply || '');
}

function hasProductMailtoCta(ctas: ChatCta[]): boolean {
  return ctas.some((cta) => {
    const target = cta.target || '';
    const label = cta.label || '';
    return /mailto:/i.test(target) || mentionsProductEmail(target) || mentionsProductEmail(label);
  });
}

export function productEscalationUi(userQuestion?: string): GenerativeUiData {
  return {
    component: 'Card',
    props: {
      title: 'Hubungi tim Product',
      description: 'Kirim email berisi nama, universitas, ID survei (jika ada), dan rincian pertanyaanmu.',
      badge: 'Eskalasi',
    },
    children: [
      {
        component: 'ActionButton',
        props: {
          label: `Email ${PRODUCT_EMAIL}`,
          url: productMailto(userQuestion),
          variant: 'primary',
        },
      },
    ],
  };
}

/**
 * SOP skill eskalasi Product mewajibkan tombol mailto, tapi model sering
 * cuma menuliskan alamat di teks (anti-hallucination "EXACTLY this pattern")
 * dan field suggested_actions di admin masih CTA dashboard. Client yang
 * menambal supaya tombolnya tetap muncul.
 */
export function ensureProductEscalation(args: {
  reply: string;
  userPrompt: string;
  ctas: ChatCta[];
  generativeUi?: GenerativeUiData;
}): { ctas: ChatCta[]; generative_ui?: GenerativeUiData } {
  if (!needsProductEscalation(args.reply)) {
    return { ctas: args.ctas, generative_ui: args.generativeUi };
  }

  const mailto = productMailto(args.userPrompt);
  let ctas = [...args.ctas];

  if (!hasProductMailtoCta(ctas)) {
    ctas = [
      {
        id: 'email_product',
        label: `📧 Email ${PRODUCT_EMAIL}`,
        action: 'open_url',
        target: mailto,
        variant: 'primary',
      },
      ...ctas.filter((cta) => !(cta.target === '/dashboard' && /extend|status/i.test(cta.label || ''))),
    ];
  }

  const generative_ui = args.generativeUi ?? productEscalationUi(args.userPrompt);
  return { ctas, generative_ui };
}
