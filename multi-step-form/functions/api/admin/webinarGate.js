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
  // Fase 3: peserta, refund, email otomatis
  'participants', 'participant', 'resend-ticket', 'check-order', 'refund', 'email-retry',
];
const NEEDS_ID = new Set(['get', 'save', 'publish', 'close-sales', 'cancel', 'delete', 'participants']);
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
];

/** Urutan isian di form; juga urutan lompatan ke isian pertama yang kurang. */
export const FIELD_ORDER = [
  'title', 'summary', 'poster_url', 'description_blocks', 'speakers',
  'sales_open_at', 'sales_close_at', 'starts_at', 'duration_minutes', 'price', 'quota', 'meeting_url',
];

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
  if (body.action === 'email-retry' && (typeof body.broadcastId !== 'string' || !UUID_RE.test(body.broadcastId))) return 'Email tidak dikenali';
  if (body.action === 'refund' && !normalizeRefundNote(body.note)) return 'Catatan refund wajib diisi (3–500 karakter)';
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
      default:
        return { error: `Kolom tidak diizinkan: ${key}`, field: key };
    }
    if (r.error) return { error: r.error, field: key };
    out[key] = r.value;
  }
  return { patch: out };
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
    }
  }
  return FIELD_ORDER.filter((key) => missing.has(key));
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
