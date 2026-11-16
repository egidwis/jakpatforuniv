// Helper bersama /api/admin/webinar (menu Webinar di /internal-dash).
// Diawali `_` supaya Cloudflare Pages tidak merutekannya sebagai endpoint.

import { buildEventView } from '../webinar/_view.js';

export const EVENT_SELECT = '*,webinar_offer_state';

export class DbError extends Error {
  constructor(label, status, body) {
    super(`${label} gagal — HTTP ${status}: ${JSON.stringify(body).slice(0, 400)}`);
    this.status = status;
    this.code = body && typeof body === 'object' ? body.code : undefined;
  }
}

export class Refusal extends Error {
  constructor(status, error, extra = {}) {
    super(error);
    this.status = status;
    this.extra = extra;
  }
}

export const refuse = (status, error, extra) => new Refusal(status, error, extra);

export async function db(sb, path, init = {}, label = path) {
  const res = await fetch(`${sb.url}/rest/v1/${path}`, {
    ...init,
    headers: { ...sb.headers, Prefer: 'return=representation', ...(init.headers || {}) },
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!res.ok) throw new DbError(label, res.status, data);
  return data;
}

/** Semua baris, per halaman 1000 (batas baris PostgREST produksi). */
export async function dbAll(sb, path, label) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = (await db(sb, `${path}&limit=1000&offset=${offset}`, {}, label)) || [];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export function decorate(row, { full = true } = {}) {
  const { meeting_url: meetingUrl, ...rest } = row;
  return { ...(full ? row : rest), view: buildEventView(row), has_meeting_url: Boolean(meetingUrl) };
}

export async function loadEvent(sb, id) {
  const rows = await db(sb, `webinar_events?id=eq.${id}&select=${EVENT_SELECT}`, {}, 'SELECT webinar_events');
  return rows?.[0] ?? null;
}

export async function loadOrRefuse(sb, id) {
  const row = await loadEvent(sb, id);
  if (!row) throw refuse(404, 'Acara tidak ditemukan');
  return row;
}

/** PATCH berfilter id saja, minta barisnya kembali, lalu baca ulang bersama keadaan penjualan. */
export async function writeEvent(sb, id, write, label) {
  const rows = await db(sb, `webinar_events?id=eq.${id}&select=id`, { method: 'PATCH', body: JSON.stringify(write) }, label);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${label}: nol baris berubah`);
  const fresh = await loadEvent(sb, id);
  if (!fresh) throw new Error(`${label}: baris hilang sesudah ditulis`);
  return fresh;
}
