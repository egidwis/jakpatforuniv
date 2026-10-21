import { callerUser, serviceEnv } from './caller.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_BYTES = 2 * 1024 * 1024;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const user = await callerUser(env, token);
  if (!user) return json(401, { error: 'Unauthorized' });

  const { url, key } = serviceEnv(env);
  if (!url || !key) return json(500, { error: 'Supabase service role tidak dikonfigurasi' });

  let form;
  try { form = await request.formData(); } catch { return json(400, { error: 'Body bukan unggahan' }); }

  const folder = form.get('folder');
  if (folder !== 'header' && folder !== 'block') return json(400, { error: 'Folder tidak diizinkan' });
  const file = form.get('file');
  if (!file || typeof file === 'string') return json(400, { error: 'Berkas tidak ada' });
  if (file.size <= 0 || file.size > MAX_BYTES) return json(400, { error: 'Ukuran gambar tidak diizinkan' });
  const ext = TYPES[file.type];
  if (!ext) return json(400, { error: 'Jenis gambar tidak diizinkan' });

  const path = `users/${user.id}/${folder}-images/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const bytes = await file.arrayBuffer();
  const res = await fetch(`${url}/storage/v1/object/page-uploads/${path}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': file.type,
      'x-upsert': 'false',
    },
    body: bytes,
  });
  if (!res.ok) {
    const raw = await res.text();
    console.error('[forms/upload]', res.status, raw.slice(0, 300));
    return json(400, { error: 'Gagal mengunggah gambar' });
  }

  return json(200, {
    data: { publicUrl: `${url}/storage/v1/object/public/page-uploads/${path}` },
  });
}
