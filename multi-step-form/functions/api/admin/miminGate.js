const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['navigate', 'open_url', 'chat_prompt']);
const MISSION = new Set(['pending', 'contacted', 'in_progress', 'completed', 'cancelled']);

function uuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

function text(value, max, { required = false } = {}) {
  if (value == null || value === '') return !required;
  return typeof value === 'string' && value.length <= max;
}

function flag(value) {
  return typeof value === 'boolean';
}

function order(value) {
  return Number.isInteger(value) && value >= 0 && value <= 100000;
}

function skillBody(skill, { insert }) {
  if (!skill || typeof skill !== 'object' || Array.isArray(skill)) return 'Skill tidak diizinkan';
  if (!insert && !uuid(skill.id)) return 'Skill tidak diizinkan';
  if (!text(skill.name, 150, { required: true })) return 'Nama skill tidak diizinkan';
  if (!text(skill.description, 4000)) return 'Deskripsi skill tidak diizinkan';
  if (!text(skill.trigger_context, 8000, { required: true })) return 'Pemicu skill tidak diizinkan';
  if (!text(skill.sop_instructions, 20000, { required: true })) return 'SOP skill tidak diizinkan';
  if (!text(skill.tag, 50)) return 'Tag skill tidak diizinkan';
  if (!text(skill.tag_label, 100)) return 'Label skill tidak diizinkan';
  if (!flag(skill.is_active) || !order(skill.sort_order)) return 'Skill tidak diizinkan';
  if (!Array.isArray(skill.suggested_actions) || skill.suggested_actions.length > 20) return 'Aksi skill tidak diizinkan';
  for (const item of skill.suggested_actions) {
    if (!item || typeof item !== 'object') return 'Aksi skill tidak diizinkan';
    if (!text(item.label, 120, { required: true })) return 'Aksi skill tidak diizinkan';
    if (!ACTIONS.has(item.action)) return 'Aksi skill tidak diizinkan';
    if (!text(item.url, 500) || !text(item.prompt, 2000)) return 'Aksi skill tidak diizinkan';
  }
  if (skill.linked_faq_ids != null) {
    if (!Array.isArray(skill.linked_faq_ids) || skill.linked_faq_ids.length > 30) return 'FAQ skill tidak diizinkan';
    if (skill.linked_faq_ids.some((id) => !uuid(id))) return 'FAQ skill tidak diizinkan';
  }
  return null;
}

export function skillRow(skill) {
  return {
    name: skill.name,
    description: skill.description || null,
    trigger_context: skill.trigger_context,
    sop_instructions: skill.sop_instructions,
    suggested_actions: skill.suggested_actions.map((item) => ({
      label: item.label,
      action: item.action,
      ...(item.url ? { url: item.url } : {}),
      ...(item.prompt ? { prompt: item.prompt } : {}),
    })),
    tag: skill.tag || null,
    tag_label: skill.tag_label || null,
    is_active: skill.is_active,
    sort_order: skill.sort_order,
    linked_faq_ids: skill.linked_faq_ids || [],
    updated_at: new Date().toISOString(),
  };
}

export function validateMiminWrite(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';

  if (body.action === 'save-prompt') {
    if (!text(body.value, 100000, { required: true })) return 'Prompt tidak diizinkan';
    return null;
  }

  if (body.action === 'insert-faq' || body.action === 'update-faq') {
    if (body.action === 'update-faq' && !uuid(body.id)) return 'FAQ tidak diizinkan';
    if (!text(body.question, 1000, { required: true }) || !text(body.answer, 50000, { required: true })) {
      return 'FAQ tidak diizinkan';
    }
    if (!flag(body.isActive)) return 'FAQ tidak diizinkan';
    if (body.action === 'insert-faq' && !order(body.sortOrder)) return 'FAQ tidak diizinkan';
    return null;
  }

  if (body.action === 'delete-faq' || body.action === 'delete-skill') {
    if (!uuid(body.id)) return 'Id tidak diizinkan';
    return null;
  }

  if (body.action === 'toggle-faq' || body.action === 'toggle-skill') {
    if (!uuid(body.id) || !flag(body.isActive)) return 'Status tidak diizinkan';
    return null;
  }

  if (body.action === 'insert-skill') return skillBody(body.skill, { insert: true });
  if (body.action === 'update-skill') return skillBody(body.skill, { insert: false });

  if (body.action === 'reorder-skills') {
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) return 'Urutan skill tidak diizinkan';
    if (body.items.some((item) => !item || !uuid(item.id) || !order(item.sortOrder))) return 'Urutan skill tidak diizinkan';
    return null;
  }

  if (body.action === 'mission-status') {
    if (!uuid(body.id) || !MISSION.has(body.status)) return 'Status misi tidak diizinkan';
    return null;
  }

  return 'Tindakan tidak diizinkan';
}
