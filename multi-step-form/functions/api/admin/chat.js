import { validateAdminChat } from './chatGate.js';

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
  const invalid = validateAdminChat(body);
  if (invalid) return json(400, { error: invalid });

  const sessionId = encodeURIComponent(body.sessionId);

  try {
    if (body.action === 'reply') {
      const content = body.content.trim();
      const inserted = await rest(env, 'chat_messages', {
        method: 'POST',
        body: JSON.stringify({
          session_id: body.sessionId,
          role: 'admin',
          content,
          sender_email: email,
        }),
      });
      const message = inserted[0];
      if (!message) return json(400, { error: 'Pesan tidak tersimpan' });

      await rest(env, `chat_sessions?id=eq.${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          last_message_at: new Date().toISOString(),
          last_message_snippet: content.slice(0, 150),
          is_resolved: false,
        }),
      });
      return json(200, { data: message });
    }

    if (body.action === 'mode') {
      const patch = body.mode === 'human'
        ? {
            reply_mode: 'human',
            taken_over_by: email,
            taken_over_at: new Date().toISOString(),
            is_resolved: false,
          }
        : {
            reply_mode: 'ai',
            taken_over_by: null,
            taken_over_at: null,
          };
      const rows = await rest(env, `chat_sessions?id=eq.${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      if (!rows[0]) return json(400, { error: 'Sesi tidak ditemukan' });
      return json(200, { data: rows[0] });
    }

    const resolved = body.isResolved === true;
    const rows = await rest(env, `chat_sessions?id=eq.${sessionId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        is_resolved: resolved,
        resolved_at: resolved ? new Date().toISOString() : null,
        needs_attention: !resolved,
      }),
    });
    if (!rows[0]) return json(400, { error: 'Sesi tidak ditemukan' });
    return json(200, { data: rows[0] });
  } catch (err) {
    console.error('[admin-chat]', err?.message || err);
    return json(400, { error: err?.message || 'Gagal menulis chat' });
  }
}
