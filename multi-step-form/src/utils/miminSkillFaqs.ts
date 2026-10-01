export function faqsForSkill<T extends { id?: string; q: string; a: string }>(
  linkedIds: string[] | null | undefined,
  faqs: T[]
): T[] {
  if (!linkedIds?.length) return [];
  const wanted = new Set(linkedIds);
  return faqs.filter((faq) => faq.id && wanted.has(faq.id));
}

export function formatLinkedFaqsForPrompt(
  faqs: Array<{ q: string; a: string }>
): string {
  if (faqs.length === 0) return '';
  return (
    `- FAQ TERKAIT (sumber jawaban wajib untuk SOP ini; jangan mengarang di luar Q&A ini):\n` +
    faqs.map((faq) => `  Q: ${faq.q}\n  A: ${faq.a}`).join('\n') +
    `\n- UI WAJIB untuk SOP ini: generative_ui = { "type": "faq_list" } saja. JANGAN Card, SurveyItem, atau QuickInfoCard. Daftar pertanyaan diisi client dari FAQ terkait.\n`
  );
}
