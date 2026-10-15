import { describe, expect, it } from 'vitest';
import { validateMiminWrite } from './miminGate.js';

const id = 'b7eb61ca-079a-4787-9787-be253b0a1111';

const skill = {
  name: 'Tarif',
  description: '',
  trigger_context: 'tanya harga',
  sop_instructions: 'jawab dari katalog',
  suggested_actions: [{ label: 'Lihat', action: 'navigate', url: '/dashboard' }],
  tag: 'faq',
  tag_label: 'FAQ',
  is_active: true,
  sort_order: 1,
  linked_faq_ids: [id],
};

describe('validateMiminWrite', () => {
  it('meloloskan prompt dan skill baru', () => {
    expect(validateMiminWrite({ action: 'save-prompt', value: 'kamu Mimin' })).toBeNull();
    expect(validateMiminWrite({ action: 'insert-skill', skill })).toBeNull();
  });

  it('menolak status misi di luar daftar', () => {
    expect(validateMiminWrite({ action: 'mission-status', id, status: 'paid' })).toMatch(/misi/);
  });

  it('menolak aksi skill yang tidak dikenal', () => {
    expect(validateMiminWrite({
      action: 'insert-skill',
      skill: { ...skill, suggested_actions: [{ label: 'x', action: 'eval' }] },
    })).toMatch(/Aksi/);
  });
});
