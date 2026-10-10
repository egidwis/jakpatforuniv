import { validateStopCredit } from './stopCreditGate.js';

// "Hentikan Tayang" / "Batalkan" jadwal kredit (sql/116). sql/113 menolak JWT
// browser yang mengubah status scheduled|live; RPC-nya hanya bisa dipanggil
// service_role, dan modenya dicocokkan ulang dengan tanggal tayang di DB.

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

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Body bukan JSON' }); }
  const invalid = validateStopCredit(body);
  if (invalid) return json(400, { error: invalid });

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Supabase service role tidak dikonfigurasi' });

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/stop_credit_schedule`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_schedule_id: body.scheduleId,
      p_mode: body.mode,
    }),
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!res.ok) {
    const message = data?.message || data?.error || `PostgREST HTTP ${res.status}`;
    console.error('[stop-credit]', message);
    return json(400, { error: message });
  }
  // RPC skalar: PostgREST memulangkan teks hasilnya apa adanya ("ok", "mode_mismatch", …).
  return json(200, { outcome: typeof data === 'string' ? data : null });
}
