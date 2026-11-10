// Gerbang menu Webinar di /internal-dash (POST /api/admin/webinar). Fungsi murni:
// bentuk permintaan, normalisasi isian, dan aturan acara. Tidak ada I/O di sini,
// jadi semuanya bisa diuji unit; handler-nya di webinar.js.
//
// Batas isian mengikuti CHECK di sql/131 (webinar_events). Aturan di sini lebih
// ketat dari CHECK supaya admin mendapat pesan yang menyebut isiannya, bukan galat
// constraint mentah.
//
// Sebagian fungsi DICERMINKAN di src/utils/webinarAdmin.ts (slugifyTitle,
// isEmptyDoc, normalizeDoc, normalizeSpeakers) supaya simpan otomatis tidak
// berputar karena klien dan server menormalisasi berbeda. webinarGate.spec.js
// mengunci kesamaannya.

export const WEBINAR_ADMIN_ACTIONS = [
  'list', 'get', 'create', 'save', 'publish', 'close-sales', 'cancel', 'delete',
  // Fase 3: peserta, refund (email otomatis dikirim cron per peserta, sql/136b)
  'participants', 'participant', 'resend-ticket', 'check-order', 'refund',
  // Fase 4: pembeli webinar untuk halaman Customers (baca saja)
  'buyers',
  // Fase 5A: rekaman (R2) & materi untuk pemegang tiket
  'recording-upload-start', 'recording-part-urls', 'recording-upload-complete', 'recording-upload-abort',
  'recording-preview', 'materials-save', 'recording-publish',
];
export const RECORDING_ACTIONS = WEBINAR_ADMIN_ACTIONS.filter((a) => a.startsWith('recording-') || a === 'materials-save');
const NEEDS_ID = new Set(['get', 'save', 'publish', 'close-sales', 'cancel', 'delete', 'participants', ...RECORDING_ACTIONS]);

// ── Rekaman (Fase 5A) ──────────────────────────────────────────────────────

export const MAX_RECORDING_BYTES = 4 * 1024 ** 3;
/** Ukuran bagian multipart: sama besar kecuali terakhir, ≥ 5 MiB (aturan R2/S3). */
export const RECORDING_PART_SIZE = 50 * 1024 ** 2;
const MAX_PARTS_PER_CALL = 20;
const MAX_PARTS = 10_000;
const RECORDING_KEY_RE = /^rekaman\/[0-9a-f-]{36}\/[a-z0-9-]{1,80}\.mp4$/;
const ETAG_RE = /^"?[A-Za-z0-9-]{1,128}"?$/;
const MATERIAL_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,150}\.(pdf|ppt|pptx|doc|docx|zip)$/;

const isPartNumber = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_PARTS;
const keyOf = (body) => typeof body.key === 'string' && RECORDING_KEY_RE.test(body.key)
  && body.key.startsWith(`rekaman/${String(body.id).toLowerCase()}/`);
const uploadIdOk = (v) => typeof v === 'string' && v.length > 0 && v.length <= 1024 && /^[\x21-\x7e]+$/.test(v);

/** Path materi di bucket webinar-materials: `<eventId>/<nama-aman>.<ekstensi dokumen>`. */
export function materialPathOk(path, eventId) {
  if (typeof path !== 'string') return false;
  const prefix = `${String(eventId).toLowerCase()}/`;
  return path.startsWith(prefix) && MATERIAL_NAME_RE.test(path.slice(prefix.length)) && !path.includes('..');
}

/** @returns {string|null} */
function validateRecordingRequest(body) {
  switch (body.action) {
    case 'recording-upload-start':
      if (typeof body.fileName !== 'string' || !/\.mp4$/i.test(body.fileName.trim()) || body.fileName.length > 255) return 'Hanya berkas MP4';
      if (!Number.isInteger(body.size) || body.size < 1 || body.size > MAX_RECORDING_BYTES) return 'Ukuran video maks. 4 GB';
      return null;
    case 'recording-part-urls': {
      if (!keyOf(body)) return 'Rekaman tidak dikenali';
      if (!uploadIdOk(body.uploadId)) return 'Unggahan tidak dikenali';
      const nums = body.partNumbers;
      if (!Array.isArray(nums) || nums.length < 1 || nums.length > MAX_PARTS_PER_CALL
        || !nums.every(isPartNumber) || new Set(nums).size !== nums.length) return 'Bagian unggahan tidak dikenali';
      return null;
    }
    case 'recording-upload-complete': {
      if (!keyOf(body)) return 'Rekaman tidak dikenali';
      if (!uploadIdOk(body.uploadId)) return 'Unggahan tidak dikenali';
      const parts = body.parts;
      if (!Array.isArray(parts) || parts.length < 1 || parts.length > MAX_PARTS
        || !parts.every((p, i) => isPlainObject(p) && p.partNumber === i + 1 && typeof p.etag === 'string' && ETAG_RE.test(p.etag))) {
        return 'Bagian unggahan tidak lengkap';
      }
      if (!Number.isInteger(body.minutes) || body.minutes < 1 || body.minutes > 1440) return 'Durasi video tidak terbaca (1–1440 menit)';
      return null;
    }
    case 'recording-upload-abort':
      if (!keyOf(body)) return 'Rekaman tidak dikenali';
      if (!uploadIdOk(body.uploadId)) return 'Unggahan tidak dikenali';
      return null;
    case 'materials-save':
      return materialPathOk(body.path, body.id) ? null : 'Materi tidak dikenali';
    case 'recording-publish': {
      const c = body.confirmations;
      if (!isPlainObject(c) || c.speakerPermission !== true || c.facesTrimmed !== true) return 'Kedua centang wajib diisi sebelum terbit';
      return null;
    }
    default:
      return null;
  }
}
const NEEDS_ORDER = new Set(['participant', 'resend-ticket', 'check-order', 'refund']);
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** Email tujuan e-tiket yang dikoreksi admin: dipangkas & huruf kecil; null bila tidak sah. */
export function normalizeTicketEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/** Catatan refund (hanya admin): 3–500 karakter sesudah dipangkas; null bila tidak sah. */
export function normalizeRefundNote(value) {
  if (typeof value !== 'string') return null;
  const note = value.trim();
  return note.length >= 3 && note.length <= 500 ? note : null;
}
const TAKES_PATCH = new Set(['create', 'save', 'publish']);

export const EDITABLE_COLUMNS = [
  'title', 'summary', 'poster_url', 'description_blocks', 'speakers', 'starts_at', 'duration_minutes',
  'sales_mode', 'sales_open_at', 'sales_close_at', 'price', 'quota', 'meeting_url', 'is_listed',
  // Jenis halaman: hanya diisi saat dibuat, tidak bisa diubah (kindChangeError, Iterasi 7).
  'offer_kind',
  // Video kelas: webinar asal rekamannya (sql/137). Aturannya di sourceError.
  'source_event_id',
];

/** Urutan isian di form; juga urutan lompatan ke isian pertama yang kurang. */
export const FIELD_ORDER = [
  'title', 'summary', 'poster_url', 'description_blocks', 'speakers', 'source_event_id',
  'sales_open_at', 'sales_close_at', 'starts_at', 'duration_minutes', 'price', 'quota', 'meeting_url',
];

/**
 * Urutan isian kurang saat terbit: isian form, lalu panel Rekaman & materi.
 * `recording` dan `materials_path` bukan kolom patch; keduanya diisi lewat aksi rekaman.
 */
export const PUBLISH_FIELD_ORDER = [...FIELD_ORDER, 'recording', 'materials_path'];

const OFFER_KINDS = ['live', 'replay'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SALES_MODES = ['open', 'coming_soon', 'closed'];
const MAX_DOC_CHARS = 500_000;
const MAX_SPEAKERS = 10;
const SLUG_MAX = 80;
const SLUG_BASE_MAX = 76;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function adminEmails(env) {
  return (env.ADMIN_EMAILS || 'product@jakpat.net').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/** @returns {string|null} pesan galat, atau null bila bentuknya sah */
export function validateWebinarRequest(body) {
  if (!isPlainObject(body)) return 'Permintaan tidak dikenali';
  if (!WEBINAR_ADMIN_ACTIONS.includes(body.action)) return 'Tindakan tidak diizinkan';
  if (NEEDS_ID.has(body.action) && (typeof body.id !== 'string' || !UUID_RE.test(body.id))) return 'Acara tidak dikenali';
  if (NEEDS_ORDER.has(body.action) && (typeof body.orderId !== 'string' || !UUID_RE.test(body.orderId))) return 'Order tidak dikenali';
  if (body.action === 'refund' && !normalizeRefundNote(body.note)) return 'Catatan refund wajib diisi (3–500 karakter)';
  const recording = validateRecordingRequest(body);
  if (recording) return recording;
  if (body.action === 'resend-ticket' && body.email !== undefined && body.email !== null && body.email !== ''
    && !normalizeTicketEmail(body.email)) return 'Alamat email tidak valid';
  if (TAKES_PATCH.has(body.action)) {
    const patch = body.patch ?? {};
    if (!isPlainObject(patch)) return 'Isian tidak dikenali';
    const unknown = Object.keys(patch).find((k) => !EDITABLE_COLUMNS.includes(k));
    if (unknown) return `Kolom tidak diizinkan: ${unknown}`;
  }
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== null && typeof body.expectedUpdatedAt !== 'string') {
    return 'Versi acara tidak dikenali';
  }
  return null;
}

// ── Deskripsi (JSON Tiptap) ────────────────────────────────────────────────

function walk(node, visit) {
  if (!isPlainObject(node)) return;
  visit(node);
  if (Array.isArray(node.content)) node.content.forEach((child) => walk(child, visit));
}

/** Kosong = tanpa teks berisi dan tanpa gambar. Paragraf kosong bawaan editor termasuk kosong. */
export function isEmptyDoc(doc) {
  let filled = false;
  walk(doc, (node) => {
    if (node.type === 'text' && typeof node.text === 'string' && node.text.trim()) filled = true;
    if (node.type === 'image' && node.attrs?.src) filled = true;
  });
  return !filled;
}

export function hasDataImage(doc) {
  let found = false;
  walk(doc, (node) => {
    if (node.type === 'image' && /^\s*data:/i.test(String(node.attrs?.src ?? ''))) found = true;
  });
  return found;
}

/** @returns {{ value: object|null } | { error: string }} */
export function normalizeDoc(doc) {
  if (doc === null || doc === undefined) return { value: null };
  if (!isPlainObject(doc) || doc.type !== 'doc') return { error: 'Format deskripsi tidak dikenali' };
  if (JSON.stringify(doc).length > MAX_DOC_CHARS) return { error: 'Deskripsi terlalu panjang (maks. 500 KB)' };
  if (hasDataImage(doc)) return { error: 'Gambar di deskripsi harus diunggah, bukan ditempel' };
  return { value: isEmptyDoc(doc) ? null : doc };
}

// ── Pembicara ─────────────────────────────────────────────────────────────

const trimText = (v) => (typeof v === 'string' ? v.trim() : '');

/** @returns {{ value: {name: string, title: string, photo_url?: string}[] } | { error: string }} */
export function normalizeSpeakers(list) {
  if (list === null || list === undefined) return { value: [] };
  if (!Array.isArray(list)) return { error: 'Format pembicara tidak dikenali' };
  const out = [];
  for (const raw of list) {
    if (!isPlainObject(raw)) return { error: 'Format pembicara tidak dikenali' };
    const name = trimText(raw.name);
    const title = trimText(raw.title);
    const photo = trimText(raw.photo_url);
    if (!name && !title && !photo) continue;
    if (name.length > 120) return { error: 'Nama pembicara maks. 120 karakter' };
    if (title.length > 160) return { error: 'Jabatan pembicara maks. 160 karakter' };
    if (photo && !isHttpsUrl(photo)) return { error: 'Foto pembicara harus link https' };
    out.push(photo ? { name, title, photo_url: photo } : { name, title });
  }
  if (out.length > MAX_SPEAKERS) return { error: `Maksimal ${MAX_SPEAKERS} pembicara` };
  return { value: out };
}

// ── Isian satuan ──────────────────────────────────────────────────────────

function isHttpsUrl(v) {
  if (typeof v !== 'string' || v.length > 1000 || !/^https:\/\//i.test(v)) return false;
  try { new URL(v); return true; } catch { return false; }
}

const codePoints = (s) => [...s].length;

function normalizeTimestamp(v) {
  if (v === null || v === undefined || v === '') return { value: null };
  if (typeof v !== 'string') return { error: 'Tanggal tidak dikenali' };
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return { error: 'Tanggal tidak dikenali' };
  const year = new Date(ms).getUTCFullYear();
  if (year < 2026 || year > 2035) return { error: 'Tanggal di luar rentang' };
  return { value: new Date(ms).toISOString() };
}

function normalizeInt(v, min, max, label) {
  if (v === null || v === undefined || v === '') return { value: null };
  if (typeof v !== 'number' || !Number.isInteger(v)) return { error: `${label} harus bilangan bulat` };
  if (v < min || v > max) return { error: `${label} harus antara ${min.toLocaleString('id-ID')} dan ${max.toLocaleString('id-ID')}` };
  return { value: v };
}

/**
 * Menormalisasi patch dari form. Isian kosong menjadi null.
 * @returns {{ patch: object } | { error: string, field: string }}
 */
export function normalizePatch(patch = {}) {
  const out = {};
  for (const [key, raw] of Object.entries(patch)) {
    let r;
    switch (key) {
      case 'title': {
        const v = trimText(raw);
        if (!v) return { error: 'Judul wajib diisi', field: key };
        if (codePoints(v) > 200) return { error: 'Judul maks. 200 karakter', field: key };
        r = { value: v };
        break;
      }
      case 'summary': {
        const v = trimText(raw);
        if (codePoints(v) > 160) return { error: 'Ringkasan maks. 160 karakter', field: key };
        r = { value: v || null };
        break;
      }
      case 'poster_url':
      case 'meeting_url': {
        const v = trimText(raw);
        if (v && !isHttpsUrl(v)) return { error: 'Harus link https', field: key };
        r = { value: v || null };
        break;
      }
      case 'description_blocks': r = normalizeDoc(raw); break;
      case 'speakers': r = normalizeSpeakers(raw); break;
      case 'starts_at':
      case 'sales_open_at':
      case 'sales_close_at': r = normalizeTimestamp(raw); break;
      case 'duration_minutes': r = normalizeInt(raw, 1, 1440, 'Durasi'); break;
      case 'price': r = normalizeInt(raw, 1000, 100_000_000, 'Harga'); break;
      case 'quota': r = normalizeInt(raw, 1, 100_000, 'Kuota'); break;
      case 'sales_mode':
        if (!SALES_MODES.includes(raw)) return { error: 'Pilihan penjualan tidak dikenali', field: 'sales_open_at' };
        r = { value: raw };
        break;
      case 'is_listed':
        if (typeof raw !== 'boolean') return { error: 'Tampil di daftar harus ya/tidak', field: key };
        r = { value: raw };
        break;
      case 'offer_kind':
        if (!OFFER_KINDS.includes(raw)) return { error: 'Jenis halaman tidak dikenali', field: key };
        r = { value: raw };
        break;
      case 'source_event_id':
        if (raw === null || raw === '') { r = { value: null }; break; }
        if (typeof raw !== 'string' || !UUID_RE.test(raw)) return { error: 'Webinar asal tidak dikenali', field: key };
        r = { value: raw.toLowerCase() };
        break;
      default:
        return { error: `Kolom tidak diizinkan: ${key}`, field: key };
    }
    if (r.error) return { error: r.error, field: key };
    out[key] = r.value;
  }
  return { patch: out };
}

const LIVE_ONLY_COLUMNS = ['starts_at', 'duration_minutes', 'quota', 'meeting_url'];

/**
 * Webinar dan Video kelas adalah dua produk terpisah (Iterasi 7): Video kelas tidak
 * pernah menyimpan isian sesi live, dan webinar tidak pernah punya webinar asal.
 */
export function applyKindInvariant(row) {
  if (row.offer_kind === 'replay') {
    return { ...row, ...Object.fromEntries(LIVE_ONLY_COLUMNS.map((k) => [k, null])) };
  }
  return 'source_event_id' in row ? { ...row, source_event_id: null } : row;
}

/** Jenis ditentukan saat dibuat. Draft yang salah jenis dihapus lalu dibuat ulang. */
export function kindChangeError(current, patch) {
  if (!('offer_kind' in patch) || patch.offer_kind === (current.offer_kind ?? 'live')) return null;
  return {
    code: 'offer_fixed',
    field: 'offer_kind',
    error: 'Jenis halaman tidak bisa diubah. Hapus draft ini lalu buat ulang dengan tombol yang sesuai.',
  };
}

/**
 * Webinar asal Video kelas. Status sumber diperiksa saat penghubung dipilih/diganti
 * (`changed`); sumber yang batal sesudah dihubungkan tidak menggagalkan simpan isian
 * lain. Video kelas bersumber baru boleh dijual sesudah rekaman di webinar asalnya
 * terbit, supaya pemegang tiket tidak tertinggal oleh pembeli Video kelas.
 *
 * @param {object} row baris Video kelas sesudah patch
 * @param {object|null} source baris webinar asal (id, offer_kind, status, recording_published_at)
 * @returns {{ field: string, code: string, error: string } | null}
 */
export function sourceError(row, source, { changed = false, publishing = false } = {}) {
  if (!row.source_event_id) return null;
  const invalid = (error) => ({ field: 'source_event_id', code: 'source_invalid', error });
  if (changed) {
    if (!source) return invalid('Webinar asal tidak ditemukan');
    if (source.id === row.id) return invalid('Webinar asal tidak bisa halaman ini sendiri');
    if ((source.offer_kind ?? 'live') !== 'live') return invalid('Webinar asal harus webinar, bukan Video kelas');
    if (source.status !== 'published') return invalid('Webinar asal harus sudah terbit dan tidak dibatalkan');
  }
  const selling = row.sales_mode === 'open' && (publishing || row.status === 'published');
  if (selling && !source?.recording_published_at) {
    return {
      field: 'source_event_id',
      code: 'source_recording_unpublished',
      error: 'Terbitkan dulu rekaman di webinar asalnya, supaya pemegang tiketnya tidak tertinggal',
    };
  }
  return null;
}

/** Tanggal buka hanya bermakna untuk sales_mode 'open'; selain itu dikosongkan. */
export function applySalesInvariant(row) {
  return row.sales_mode === 'open' ? row : { ...row, sales_open_at: null };
}

// ── Slug ──────────────────────────────────────────────────────────────────

export function slugifyTitle(title) {
  const slug = String(title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_BASE_MAX)
    .replace(/-+$/g, '');
  return slug || 'acara';
}

/** `gabung` dipakai rute link gabung, jadi selalu dianggap terpakai. */
export function pickFreeSlug(base, taken) {
  const used = new Set([...(taken ?? []), 'gabung']);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('Tidak ada slug kosong');
}

/** URL terkunci sejak pertama terbit, supaya link di poster tidak mati. */
export function isSlugLocked(row) {
  return Boolean(row?.published_at) || (row?.status ?? 'draft') !== 'draft';
}

// ── Aturan acara ──────────────────────────────────────────────────────────

const hasNamedSpeaker = (speakers) => Array.isArray(speakers)
  && speakers.length > 0
  && speakers.every((s) => trimText(s?.name));

/** Isian yang masih kurang untuk acara terbit, berurutan menurut form. */
export function missingForPublish(row) {
  const missing = new Set();
  if (!trimText(row.title)) missing.add('title');
  if (!trimText(row.summary)) missing.add('summary');
  if (!row.poster_url) missing.add('poster_url');
  if (row.sales_mode === 'open') {
    if (!row.description_blocks || isEmptyDoc(row.description_blocks)) missing.add('description_blocks');
    if (!hasNamedSpeaker(row.speakers)) missing.add('speakers');
    if (row.price === null || row.price === undefined) missing.add('price');
    if ((row.offer_kind ?? 'live') === 'live') {
      if (!row.starts_at) missing.add('starts_at');
      if (!row.duration_minutes) missing.add('duration_minutes');
      if (!row.quota) missing.add('quota');
    } else {
      // Video kelas menjanjikan rekaman + materi ("Yang kamu dapat"), jadi keduanya
      // wajib sebelum dijual. CHECK ready_to_sell (sql/136) hanya menjaga rekaman.
      if (!row.recording_object_key || !row.recording_published_at) missing.add('recording');
      if (!row.materials_path) missing.add('materials_path');
    }
  }
  return PUBLISH_FIELD_ORDER.filter((key) => missing.has(key));
}

const ms = (iso) => (iso ? Date.parse(iso) : null);

/** @returns {{ field: string, error: string } | null} */
export function crossFieldError(row) {
  const open = ms(row.sales_open_at);
  const close = ms(row.sales_close_at);
  const start = ms(row.starts_at);
  if (open !== null && close !== null && open >= close) {
    return { field: 'sales_close_at', error: 'Tanggal tutup harus sesudah tanggal buka' };
  }
  if ((row.offer_kind ?? 'live') === 'live' && start !== null) {
    if (open !== null && open >= start) return { field: 'sales_open_at', error: 'Penjualan harus dibuka sebelum acara mulai' };
    if (close !== null && close > start) return { field: 'sales_close_at', error: 'Penjualan paling lambat ditutup saat acara mulai' };
  }
  return null;
}

const seatsTaken = (offer) => (Number(offer?.sold) || 0) + (Number(offer?.held) || 0);

/** Kuota yang diubah tidak boleh di bawah terjual + ditahan. Kuota yang tidak diubah tidak diperiksa. */
export function quotaError(current, next, offer) {
  if ((next.quota ?? null) === (current.quota ?? null)) return null;
  const taken = seatsTaken(offer);
  if (taken === 0) return null;
  if (next.quota === null || next.quota === undefined) {
    return { field: 'quota', error: 'Kuota tidak bisa dikosongkan karena sudah ada tiket' };
  }
  if (next.quota < taken) {
    return { field: 'quota', error: `Kuota minimal ${taken} (${Number(offer?.sold) || 0} terjual + ${Number(offer?.held) || 0} ditahan)` };
  }
  return null;
}

/** Jadwal tidak boleh dikosongkan bila sudah ada tiket (lunas atau sedang ditahan). */
export function clearedScheduleError(current, next, offer) {
  if (seatsTaken(offer) === 0) return null;
  if (current.starts_at && !next.starts_at) return { field: 'starts_at', error: 'Jadwal tidak bisa dikosongkan karena sudah ada tiket' };
  if (current.duration_minutes && !next.duration_minutes) {
    return { field: 'duration_minutes', error: 'Durasi tidak bisa dikosongkan karena sudah ada tiket' };
  }
  return null;
}

/** Dibandingkan sebagai waktu, bukan teks: `+00:00` dan `.000Z` dianggap sama. */
export function scheduleChanged(current, next) {
  return ms(current.starts_at) !== ms(next.starts_at)
    || (current.duration_minutes ?? null) !== (next.duration_minutes ?? null);
}
