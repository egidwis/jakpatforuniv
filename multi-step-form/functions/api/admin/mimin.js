import { skillRow, validateMiminWrite } from './miminGate.js';

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
  return {
    url: env.VITE_SUPABASE_URL || env.SUPABASE_URL,
    key: env.SUPABASE_SERVICE_ROLE_KEY,
  };
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
  const invalid = validateMiminWrite(body);
  if (invalid) return json(400, { error: invalid });

  try {
    if (body.action === 'save-prompt') {
      const now = new Date().toISOString();
      const updated = await rest(env, 'ai_settings?key=eq.system_prompt', {
        method: 'PATCH',
        body: JSON.stringify({ value: body.value, updated_at: now }),
      });
      if (updated.length > 0) return json(200, { data: updated });
      const created = await rest(env, 'ai_settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'system_prompt', value: body.value, updated_at: now }),
      });
      return json(200, { data: created });
    }

    if (body.action === 'insert-faq') {
      const created = await rest(env, 'ai_knowledge_base', {
        method: 'POST',
        body: JSON.stringify({
          question: body.question,
          answer: body.answer,
          is_active: body.isActive,
          sort_order: body.sortOrder,
        }),
      });
      return json(200, { data: created });
    }

    if (body.action === 'update-faq') {
      const updated = await rest(env, `ai_knowledge_base?id=eq.${body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          question: body.question,
          answer: body.answer,
          is_active: body.isActive,
        }),
      });
      return json(200, { data: updated });
    }

    if (body.action === 'delete-faq') {
      const removed = await rest(env, `ai_knowledge_base?id=eq.${body.id}`, { method: 'DELETE' });
      return json(200, { data: removed });
    }

    if (body.action === 'toggle-faq') {
      const updated = await rest(env, `ai_knowledge_base?id=eq.${body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: body.isActive }),
      });
      return json(200, { data: updated });
    }

    if (body.action === 'insert-skill') {
      const created = await rest(env, 'ai_skills', {
        method: 'POST',
        body: JSON.stringify(skillRow(body.skill)),
      });
      return json(200, { data: created });
    }

    if (body.action === 'update-skill') {
      const updated = await rest(env, `ai_skills?id=eq.${body.skill.id}`, {
        method: 'PATCH',
        body: JSON.stringify(skillRow(body.skill)),
      });
      return json(200, { data: updated });
    }

    if (body.action === 'delete-skill') {
      const removed = await rest(env, `ai_skills?id=eq.${body.id}`, { method: 'DELETE' });
      return json(200, { data: removed });
    }

    if (body.action === 'toggle-skill') {
      const updated = await rest(env, `ai_skills?id=eq.${body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: body.isActive, updated_at: new Date().toISOString() }),
      });
      return json(200, { data: updated });
    }

    if (body.action === 'reorder-skills') {
      for (let i = 0; i < body.items.length; i++) {
        await rest(env, `ai_skills?id=eq.${body.items[i].id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sort_order: 1000 + i + 1 }),
        });
      }
      const last = [];
      for (const item of body.items) {
        const rows = await rest(env, `ai_skills?id=eq.${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ sort_order: item.sortOrder, updated_at: new Date().toISOString() }),
        });
        last.push(...rows);
      }
      return json(200, { data: last });
    }

    const updated = await rest(env, `custom_mission_requests?id=eq.${body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: body.status, updated_at: new Date().toISOString() }),
    });
    if (!updated[0]) return json(400, { error: 'Permintaan tidak ditemukan' });
    return json(200, { data: updated });
  } catch (err) {
    console.error('[mimin]', err?.message || err);
    return json(400, { error: err?.message || 'Gagal menulis' });
  }
}
