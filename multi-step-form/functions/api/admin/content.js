import { BROADCAST_RPC, broadcastRpcArgs, pageFilterQuery, validateAdminContent } from './contentGate.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function callerEmail(env, token) {
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey || !token) return null;
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return (user?.email || '').toLowerCase();
}

function sb(env) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, key };
}

async function rest(env, path, init) {
  const { url, key } = sb(env);
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!res.ok) {
    const message = data?.message || data?.error || `PostgREST HTTP ${res.status}`;
    throw new Error(message);
  }
  return Array.isArray(data) ? data : [];
}

function storagePath(url) {
  if (typeof url !== 'string' || !url) return null;
  const match = url.match(/\/page-uploads\/([^?#]+)$/);
  if (!match) return null;
  let path;
  try { path = decodeURIComponent(match[1]); } catch { return null; }
  if (!path || path.includes('..') || path.startsWith('/')) return null;
  return path;
}

async function removeProofFiles(env, urls) {
  const paths = [...new Set(urls.map(storagePath).filter(Boolean))];
  if (paths.length === 0) return;
  const { url, key } = sb(env);
  const res = await fetch(`${url}/storage/v1/object/page-uploads`, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(paths),
  });
  if (!res.ok) {
    const raw = await res.text();
    console.error('[admin-content] storage', res.status, raw.slice(0, 300));
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const email = await callerEmail(env, token);
  const admins = (env.ADMIN_EMAILS || 'product@jakpat.net')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!email || !admins.includes(email)) return json(401, { error: 'Unauthorized' });

  const { url, key } = sb(env);
  if (!url || !key) return json(500, { error: 'Supabase service role tidak dikonfigurasi' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Body bukan JSON' }); }
  const invalid = validateAdminContent(body);
  if (invalid) return json(400, { error: invalid });

  if (BROADCAST_RPC[body.action]) {
    // Galat RPC dibawa utuh beserta HINT-nya (broadcast_too_early, _finished,
    // _has_respondents, …) supaya tab Page bisa menyebut alasannya.
    const res = await fetch(`${url}/rest/v1/rpc/${BROADCAST_RPC[body.action]}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(broadcastRpcArgs(body.action, body.scheduleId, email)),
    });
    const raw = await res.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
    if (!res.ok) {
      const message = data?.message || data?.error || `PostgREST HTTP ${res.status}`;
      console.error('[admin-content]', body.action, message);
      return json(400, { error: message, hint: data?.hint ?? null });
    }
    return json(200, { data });
  }

  try {
    if (body.action === 'clear-proof') {
      const query = body.respondentId
        ? `id=eq.${body.respondentId}&select=id,proof_url`
        : `page_id=eq.${body.pageId}&proof_url=not.is.null&select=id,proof_url`;
      const rows = await rest(env, `page_respondents?${query}`, { method: 'GET' });
      if (body.respondentId && rows.length === 0) return json(400, { error: 'Responden tidak ditemukan' });
      await removeProofFiles(env, rows.map((row) => row.proof_url));
      const patchQuery = body.respondentId
        ? `id=eq.${body.respondentId}`
        : `page_id=eq.${body.pageId}&proof_url=not.is.null`;
      const cleared = await rest(env, `page_respondents?${patchQuery}`, {
        method: 'PATCH',
        body: JSON.stringify({ proof_url: null }),
      });
      return json(200, { data: cleared });
    }

    if (body.action === 'create-link') {
      const created = await rest(env, 'campaign_links', {
        method: 'POST',
        body: JSON.stringify({
          source_name: body.sourceName,
          description: body.description ?? null,
        }),
      });
      return json(200, { data: created });
    }

    if (body.action === 'delete-link') {
      const removed = await rest(env, `campaign_links?id=eq.${body.id}`, { method: 'DELETE' });
      return json(200, { data: removed });
    }

    if (body.action === 'insert-page') {
      const created = await rest(env, 'survey_pages', {
        method: 'POST',
        body: JSON.stringify(body.patch),
      });
      return json(200, { data: created });
    }

    if (body.action === 'delete-page') {
      const removed = await rest(env, `survey_pages?id=eq.${body.id}`, { method: 'DELETE' });
      return json(200, { data: removed });
    }

    const updated = await rest(env, `survey_pages?${pageFilterQuery(body.filters)}`, {
      method: 'PATCH',
      body: JSON.stringify(body.patch),
    });
    return json(200, { data: updated });
  } catch (err) {
    console.error('[admin-content]', err?.message || err);
    return json(400, { error: err?.message || 'Gagal menulis' });
  }
}
