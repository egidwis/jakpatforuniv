import { describe, expect, it } from 'vitest';
import { formWrite, validateFormSave } from './saveGate.js';

const id = 'b7eb61ca-079a-4787-9787-be253b0a1111';

describe('validateFormSave', () => {
  it('meloloskan draf, terbit, dan hapus', () => {
    expect(validateFormSave({
      action: 'save',
      title: 'Survei',
      description: 'halo',
      status: 'draft',
      schema: [{ id: 'q1', type: 'short_text', label: 'Nama', required: false }],
    })).toBeNull();
    expect(validateFormSave({
      action: 'save',
      id,
      title: 'Survei',
      status: 'published',
      headerImageUrl: 'https://cdn.example/header.jpg',
      slug: 'survei-kampus',
    })).toBeNull();
    expect(validateFormSave({ action: 'delete', id })).toBeNull();
  });

  it('menolak pemilik dari body dan judul kosong saat terbit', () => {
    expect(validateFormSave({ action: 'save', userId: id, title: 'A' })).toMatch(/Pemilik/);
    expect(validateFormSave({ action: 'save', status: 'published', title: '   ' })).toMatch(/Judul wajib/);
  });

  it('tidak menyalin pemilik ke baris', () => {
    expect(formWrite({
      action: 'save',
      title: '  Survei  ',
      status: 'draft',
      schema: [],
    })).toMatchObject({
      title: 'Survei',
      status: 'draft',
      schema: [],
    });
    expect(formWrite({ action: 'save', title: 'A' }).user_id).toBeUndefined();
  });
});
