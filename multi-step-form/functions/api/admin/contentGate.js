const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const PAGE_COLUMNS = {
  slug: 'string',
  title: 'string',
  banner_url: 'string',
  redirect_url: 'string',
  requires_banner_update: 'boolean',
  is_published: 'boolean',
  is_extra_ad: 'boolean',
  is_hidden: 'boolean',
  publish_start_date: 'timestamp',
  publish_end_date: 'timestamp',
  auto_closed_at: 'timestamp',
  updated_at: 'timestamp',
  submission_id: 'uuid',
  blocks: 'json',
  custom_fields: 'json',
};

function short(value, max) {
  return typeof value === 'string' && value.length <= max;
}

function checkPatch(patch, { insert }) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return 'Isi halaman tidak diizinkan';
  const keys = Object.keys(patch);
  if (keys.length === 0) return 'Isi halaman tidak diizinkan';
  if (insert && (!short(patch.slug, 200) || !short(patch.title, 500))) return 'Slug dan judul wajib';
  for (const key of keys) {
    const kind = PAGE_COLUMNS[key];
    if (!kind) return 'Kolom halaman tidak diizinkan';
    const value = patch[key];
    if (kind === 'boolean' && typeof value !== 'boolean') return 'Kolom halaman tidak diizinkan';
    if (kind === 'string' && value !== null && !short(value, key === 'slug' ? 200 : key === 'title' ? 500 : 2000)) {
      return 'Kolom halaman tidak diizinkan';
    }
    if (kind === 'timestamp' && value !== null && !short(value, 40)) return 'Kolom halaman tidak diizinkan';
    if (kind === 'uuid' && value !== null && (typeof value !== 'string' || !UUID.test(value))) {
      return 'Kolom halaman tidak diizinkan';
    }
    if (kind === 'json') {
      if (value === null || typeof value !== 'object') return 'Kolom halaman tidak diizinkan';
      if (JSON.stringify(value).length > 500000) return 'Isi halaman terlalu besar';
    }
  }
  return null;
}

function checkFilters(filters) {
  if (!Array.isArray(filters) || filters.length === 0 || filters.length > 4) return 'Filter halaman tidak diizinkan';
  let anchored = false;
  for (const f of filters) {
    if (!f || typeof f !== 'object') return 'Filter halaman tidak diizinkan';
    if ((f.col === 'id' || f.col === 'submission_id') && f.op === 'eq' && typeof f.val === 'string' && UUID.test(f.val)) {
      anchored = true;
      continue;
    }
    if (f.col === 'publish_start_date' && f.op === 'eq' && short(f.val, 40)) continue;
    if (f.col === 'publish_end_date' && f.op === 'gt' && short(f.val, 40)) continue;
    if (f.col === 'auto_closed_at' && f.op === 'is' && f.val === null) continue;
    return 'Filter halaman tidak diizinkan';
  }
  if (!anchored) return 'Filter halaman tidak diizinkan';
  return null;
}

export function validateAdminContent(body) {
  if (!body || typeof body !== 'object') return 'Body kosong';

  if (body.action === 'clear-proof') {
    const one = UUID.test(body.respondentId || '');
    const page = UUID.test(body.pageId || '');
    if (one === page) return 'Target bukti tidak diizinkan';
    return null;
  }

  if (body.action === 'create-link') {
    if (typeof body.sourceName !== 'string' || !SOURCE.test(body.sourceName)) return 'Nama sumber tidak diizinkan';
    if (body.description != null && !short(body.description, 500)) return 'Keterangan tidak diizinkan';
    return null;
  }

  if (body.action === 'delete-link' || body.action === 'delete-page') {
    if (typeof body.id !== 'string' || !UUID.test(body.id)) return 'Id tidak diizinkan';
    return null;
  }

  if (body.action === 'insert-page') return checkPatch(body.patch, { insert: true });

  if (body.action === 'patch-pages') {
    const patchError = checkPatch(body.patch, { insert: false });
    if (patchError) return patchError;
    return checkFilters(body.filters);
  }

  return 'Tindakan tidak diizinkan';
}

export function pageFilterQuery(filters) {
  return filters.map((f) => {
    if (f.op === 'is') return `${f.col}=is.null`;
    return `${f.col}=${f.op}.${encodeURIComponent(f.val)}`;
  }).join('&');
}
