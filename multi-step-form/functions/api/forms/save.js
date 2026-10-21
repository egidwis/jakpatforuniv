import { callerUser, serviceEnv } from './caller.js';
import { formWrite, validateFormSave } from './saveGate.js';

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

async function rest(env, path, init = {}) {
  const { url, key } = serviceEnv(env);
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
  const user = await callerUser(env, token);
  if (!user) return json(401, { error: 'Unauthorized' });
  if (!serviceEnv(env).url || !serviceEnv(env).key) {
    return json(500, { error: 'Supabase service role tidak dikonfigurasi' });
  }

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Body bukan JSON' }); }
  const invalid = validateFormSave(body);
  if (invalid) return json(400, { error: invalid });

  try {
    if (body.action === 'delete') {
      const rows = await rest(
        env,
        `custom_forms?id=eq.${body.id}&user_id=eq.${user.id}`,
        { method: 'DELETE' },
      );
      if (rows.length === 0) return json(400, { error: 'Form tidak ditemukan' });
      return json(200, { data: { id: body.id } });
    }

    const row = formWrite(body);
    if (body.id) {
      const rows = await rest(
        env,
        `custom_forms?id=eq.${body.id}&user_id=eq.${user.id}`,
        { method: 'PATCH', body: JSON.stringify(row) },
      );
      if (rows.length === 0) return json(400, { error: 'Form tidak ditemukan' });
      return json(200, { data: rows[0] });
    }

    const rows = await rest(env, 'custom_forms', {
      method: 'POST',
      body: JSON.stringify({ ...row, user_id: user.id }),
    });
    if (rows.length === 0) return json(400, { error: 'Form tidak tersimpan' });
    return json(200, { data: rows[0] });
  } catch (err) {
    console.error('[forms/save]', err?.message || err);
    return json(400, { error: err?.message || 'Gagal menyimpan form' });
  }
}
