import { actionOf, doorCall, lockPatch, lockRoute, selfBookingBlock, validateAction } from './lockGate.js';

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

function service(env) {
  return {
    url: env.VITE_SUPABASE_URL || env.SUPABASE_URL,
    key: env.SUPABASE_SERVICE_ROLE_KEY,
    anon: env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY,
  };
}

async function caller(env, token) {
  const { url, anon } = service(env);
  if (!url || !anon || !token) return null;
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  if (typeof user?.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id)) return null;
  return { id: user.id, email: (user.email || '').toLowerCase() };
}

async function rest(env, path, init = {}) {
  const { url, key } = service(env);
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
    const message = data?.message || data?.error || data?.hint || `PostgREST HTTP ${res.status}`;
    // HINT trigger (kilat_wave_closed, daily_quota_full, …) dipetakan klien
    // ke kalimat ramah — jangan sampai hilang di sini.
    const error = new Error(message);
    if (data?.hint) error.hint = data.hint;
    if (data?.code) error.code = data.code;
    throw error;
  }
  return data;
}

/**
 * Saklar tutup reservasi mandiri (sql/125). Gagal dibaca = TERBUKA (perilaku
 * lama) — galat sementara tidak boleh mematikan pembayaran semua peneliti;
 * tabelnya wajib sudah ada sebelum kode ini dideploy.
 */
async function selfBookingClosed(env) {
  try {
    const rows = await rest(env, 'JFU_self_booking_closures?select=closed_on&is_active=eq.true&limit=1');
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.error('[schedules/lock] status reservasi mandiri tak terbaca:', err?.message || err);
    return false;
  }
}

function owns(row, user) {
  if (row.auth_user_id && row.auth_user_id === user.id) return true;
  if (!row.auth_user_id && user.email && (row.email || '').toLowerCase() === user.email) return true;
  return false;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const user = await caller(env, token);
  if (!user) return json(401, { error: 'Unauthorized' });
  if (!service(env).url || !service(env).key) {
    return json(500, { error: 'Supabase service role tidak dikonfigurasi' });
  }

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Body bukan JSON' }); }
  const invalid = validateAction(body);
  if (invalid) return json(400, { error: invalid });
  const action = actionOf(body);

  try {
    const rows = await rest(
      env,
      `form_submissions?id=eq.${body.submissionId}&select=id,auth_user_id,email,payment_status,submission_status,duration,distribution_type,self_booking_closed_at`,
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !owns(row, user)) return json(400, { error: 'Order tidak ditemukan' });

    // Tutup reservasi mandiri (sql/125): kunci (Iklan & Kilat) ditahan saat
    // ditutup ATAU bercap; perpanjangan hanya saat ditutup — persis trigger
    // trg_01_self_booking. Lepas & batal tetap boleh.
    if (action === 'lock' || action === 'extend') {
      const blocked = selfBookingBlock(action === 'lock' ? row : null, await selfBookingClosed(env));
      if (blocked) return json(409, blocked);
    }

    // Kilat & aksi lain: fungsi door_* (sql/123) menilai sebagai peneliti.
    const route = action === 'lock' ? lockRoute(row, body) : { kind: 'door' };
    if (route.error) return json(400, { error: route.error });
    if (route.kind !== 'iklan') {
      const call = doorCall(action, user, body);
      const result = await rest(env, `rpc/${call.fn}`, { method: 'POST', body: JSON.stringify(call.args) });
      return json(200, { data: { id: result ?? null } });
    }

    const decided = lockPatch(row, body);
    if (decided.error) return json(400, { error: decided.error });

    const saved = await rest(
      env,
      `form_submissions?id=eq.${body.submissionId}&payment_status=not.in.(paid,completed)&submission_status=neq.slot_cancelled`,
      { method: 'PATCH', body: JSON.stringify(decided.patch) },
    );
    if (!Array.isArray(saved) || saved.length === 0) {
      return json(400, { error: 'Slot tidak bisa dikunci — kemungkinan sudah lunas, atau jadwalnya dibatalkan tim Jakpat.' });
    }
    return json(200, { data: { id: body.submissionId } });
  } catch (err) {
    console.error('[schedules/lock]', action, err?.message || err);
    return json(400, {
      error: err?.message || 'Gagal mengunci tanggal',
      ...(err?.hint ? { hint: err.hint } : {}),
      ...(err?.code ? { code: err.code } : {}),
    });
  }
}
