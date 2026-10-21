const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUSES = new Set(['draft', 'published', 'archived']);

function uuid(value, label) {
  if (typeof value !== 'string' || !UUID.test(value)) return `${label} tidak diizinkan`;
  return null;
}

export function validateFormSave(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Body kosong';
  if ('userId' in body || 'user_id' in body) return 'Pemilik tidak boleh dikirim';

  if (body.action === 'delete') return uuid(body.id, 'Form');
  if (body.action !== 'save') return 'Tindakan tidak diizinkan';

  if (body.id !== undefined && body.id !== null) {
    const bad = uuid(body.id, 'Form');
    if (bad) return bad;
  }
  if (body.title !== undefined && (typeof body.title !== 'string' || body.title.length > 200)) {
    return 'Judul tidak diizinkan';
  }
  if (body.status === 'published' && (typeof body.title !== 'string' || body.title.trim() === '')) {
    return 'Judul wajib diisi untuk diterbitkan';
  }
  if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 8000)) {
    return 'Deskripsi tidak diizinkan';
  }
  if (body.status !== undefined && !STATUSES.has(body.status)) return 'Status tidak diizinkan';
  if (body.slug !== undefined && body.slug !== null) {
    if (typeof body.slug !== 'string' || body.slug.length > 80 || !SLUG.test(body.slug)) {
      return 'Slug tidak diizinkan';
    }
  }
  if (body.headerImageUrl !== undefined && body.headerImageUrl !== null && body.headerImageUrl !== '') {
    if (typeof body.headerImageUrl !== 'string' || body.headerImageUrl.length > 2000) {
      return 'Gambar tidak diizinkan';
    }
    try {
      if (new URL(body.headerImageUrl).protocol !== 'https:') return 'Gambar tidak diizinkan';
    } catch {
      return 'Gambar tidak diizinkan';
    }
  }
  if (body.schema !== undefined) {
    if (!Array.isArray(body.schema) || body.schema.length > 200) return 'Skema tidak diizinkan';
    let size = 0;
    try { size = JSON.stringify(body.schema).length; } catch { return 'Skema tidak diizinkan'; }
    if (size > 200_000) return 'Skema tidak diizinkan';
  }
  return null;
}

export function formWrite(body) {
  const row = {
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Untitled Form',
    description: typeof body.description === 'string' ? body.description : '',
    header_image_url: body.headerImageUrl || null,
    schema: Array.isArray(body.schema) ? body.schema : [],
    status: body.status || 'draft',
    updated_at: new Date().toISOString(),
  };
  if ('slug' in body) row.slug = body.slug || null;
  return row;
}
