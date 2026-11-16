// Helper bersama endpoint /api/webinar/*. Semua tulisan memakai service_role,
// karena tabel webinar tanpa policy dan tanpa hak untuk browser (sql/131).

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...extraHeaders },
  });
}

/** Melempar bila konfigurasi kurang: lebih baik gagal daripada turun ke anon key. */
export function resolveService(env) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service role tidak dikonfigurasi');
  return {
    url,
    key,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  };
}

export async function sbFetch(url, init, label) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${label} gagal — HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  return res;
}

export async function rest(sb, path, init = {}, label = path) {
  const res = await sbFetch(
    `${sb.url}/rest/v1/${path}`,
    { ...init, headers: { ...sb.headers, Prefer: 'return=representation', ...(init.headers || {}) } },
    label
  );
  const raw = await res.text();
  return raw ? JSON.parse(raw) : null;
}

/** Identitas selalu dari sesi, tidak pernah dari body. */
export async function caller(env, request) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!url || !anon || !token) return null;
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  if (typeof user?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id) || !user.email) return null;
  return { id: user.id, email: String(user.email).toLowerCase() };
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const JOIN_TOKEN_RE = /^[0-9a-f]{64}$/;
