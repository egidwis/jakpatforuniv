import { faqsForSkill } from './miminSkillFaqs';
import type { GenerativeUiData } from './supabase';

export interface FaqPromptItem {
  id?: string;
  q: string;
  a: string;
}

export interface SkillWithFaqs {
  name: string;
  trigger_context: string;
  linked_faq_ids?: string[] | null;
}

const STOP = new Set([
  'yang', 'dengan', 'untuk', 'dari', 'pada', 'atau', 'dan', 'ini', 'itu',
  'user', 'kami', 'kamu', 'anda', 'the', 'jakpat', 'universities',
]);

export function tokenizeForSkillMatch(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

export function scoreSkillTrigger(prompt: string, skill: SkillWithFaqs): number {
  const promptTokens = new Set(tokenizeForSkillMatch(prompt));
  if (promptTokens.size === 0) return 0;
  const triggerTokens = tokenizeForSkillMatch(`${skill.trigger_context} ${skill.name}`);
  return triggerTokens.filter((t) => promptTokens.has(t)).length;
}

export function pickSkillWithFaqs(
  prompt: string,
  skills: SkillWithFaqs[],
  minScore = 1
): SkillWithFaqs | null {
  let best: SkillWithFaqs | null = null;
  let bestScore = 0;
  for (const skill of skills) {
    if (!skill.linked_faq_ids?.length) continue;
    const score = scoreSkillTrigger(prompt, skill);
    if (score > bestScore) {
      bestScore = score;
      best = skill;
    }
  }
  return bestScore >= minScore ? best : null;
}

export function bestFaqIndex(prompt: string, items: FaqPromptItem[]): number {
  if (items.length === 0) return 0;
  const tokens = new Set(tokenizeForSkillMatch(prompt));
  let best = 0;
  let bestScore = -1;
  items.forEach((item, i) => {
    const score = tokenizeForSkillMatch(item.q).filter((t) => tokens.has(t)).length;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

function preservesSpecialUi(ui?: GenerativeUiData): boolean {
  const type = ui?.type;
  return type === 'survey_picker' || type === 'price_calculator';
}

/** Kartu generik yang model buat saat bingung UI FAQ — diganti accordion. */
export function isWeakFaqCard(ui?: GenerativeUiData): boolean {
  if (!ui) return true;
  if (ui.type === 'faq_list') return true;
  if (preservesSpecialUi(ui)) return false;
  return true;
}

export function faqListUi(
  items: FaqPromptItem[],
  prompt: string,
  skillName?: string
): GenerativeUiData {
  return {
    type: 'faq_list',
    props: {
      title: skillName || 'FAQ terkait',
      items: items.map((item) => ({ q: item.q, a: item.a })),
      defaultOpenIndex: bestFaqIndex(prompt, items),
    },
  };
}

export function ensureFaqListUi(args: {
  userPrompt: string;
  skills: SkillWithFaqs[];
  faqs: FaqPromptItem[];
  generativeUi?: GenerativeUiData;
}): GenerativeUiData | undefined {
  const skill = pickSkillWithFaqs(args.userPrompt, args.skills);
  if (!skill) {
    if (args.generativeUi?.type === 'faq_list') {
      const items = (args.generativeUi.props?.items as FaqPromptItem[] | undefined) || [];
      if (items.length > 0) return args.generativeUi;
    }
    return args.generativeUi;
  }

  const items = faqsForSkill(skill.linked_faq_ids, args.faqs);
  if (items.length === 0) return args.generativeUi;
  if (!isWeakFaqCard(args.generativeUi)) return args.generativeUi;
  return faqListUi(items, args.userPrompt, skill.name);
}
