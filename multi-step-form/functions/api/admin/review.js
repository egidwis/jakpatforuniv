import { ENDING_REVIEW, paidBlockReason, paidCheckPaths, reviewPatch, validateReviewWrite } from './reviewGate.js';

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

async function readRows(supabaseUrl, serviceKey, path) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`PostgREST HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
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

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Supabase service role tidak dikonfigurasi' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Body bukan JSON' }); }
  const invalid = validateReviewWrite(body);
  if (invalid) return json(400, { error: invalid });

  if (ENDING_REVIEW.has(body.status)) {
    const paths = paidCheckPaths(body.submissionId);
    let money;
    try {
      const [order, tx, inv, sched] = await Promise.all([
        readRows(supabaseUrl, serviceKey, paths.order),
        readRows(supabaseUrl, serviceKey, paths.tx),
        readRows(supabaseUrl, serviceKey, paths.inv),
        readRows(supabaseUrl, serviceKey, paths.sched),
      ]);
      money = { order: order[0], tx, inv, sched };
    } catch (err) {
      // Gagal tertutup: tanpa bukti "belum lunas", order tidak diakhiri.
      console.error('[review] cek pembayaran', err);
      return json(400, { error: 'Gagal memeriksa pembayaran order — coba lagi.' });
    }
    if (!money.order) return json(400, { error: 'Order tidak ditemukan' });
    const blocked = paidBlockReason(money);
    if (blocked) return json(409, { error: blocked });
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/form_submissions?id=eq.${body.submissionId}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(reviewPatch(body)),
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : []; } catch { data = null; }
  if (!res.ok) {
    const message = data?.message || data?.error || `PostgREST HTTP ${res.status}`;
    console.error('[review]', message);
    return json(400, { error: message });
  }
  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) return json(400, { error: 'Order tidak ditemukan' });
  return json(200, { data: rows });
}
