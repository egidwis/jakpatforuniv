import { serviceEnv } from './caller.js';
import { validateFormSubmit } from './submitGate.js';

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
  return data;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });
  if (!serviceEnv(env).url || !serviceEnv(env).key) {
    return json(500, { error: 'Supabase service role tidak dikonfigurasi' });
  }

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Body bukan JSON' }); }
  const invalid = validateFormSubmit(body);
  if (invalid) return json(400, { error: invalid });

  try {
    const forms = await rest(
      env,
      `custom_forms?id=eq.${body.formId}&select=id,status`,
    );
    const form = Array.isArray(forms) ? forms[0] : null;
    if (!form || form.status !== 'published') return json(400, { error: 'Form belum diterbitkan' });

    const rows = await rest(env, 'custom_form_responses', {
      method: 'POST',
      body: JSON.stringify({ form_id: body.formId, answers: body.answers }),
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return json(400, { error: 'Jawaban tidak tersimpan' });
    return json(200, { data: { id: row.id } });
  } catch (err) {
    console.error('[forms/submit]', err?.message || err);
    return json(400, { error: err?.message || 'Gagal menyimpan jawaban' });
  }
}
