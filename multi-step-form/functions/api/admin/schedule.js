import { UNCOMMITTED_ORDER, cancelScheduleWrite, kilatSchedulePatch, releaseSlotPatch, submissionDatePatch, validateScheduleWrite } from './scheduleGate.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const PAID = new Set(['paid', 'completed']);
const COMMITTED = new Set(['paid', 'scheduled', 'live', 'completed']);

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

async function rest(env, path, init = {}) {
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
  return data;
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
  if (!sb(env).url || !sb(env).key) return json(500, { error: 'Supabase service role tidak dikonfigurasi' });

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'Body bukan JSON' }); }
  const invalid = validateScheduleWrite(body);
  if (invalid) return json(400, { error: invalid });

  try {
    if (body.action === 'submission-dates') {
      const rows = await rest(env, `form_submissions?id=eq.${body.submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify(submissionDatePatch(body)),
      });
      if (!Array.isArray(rows) || rows.length === 0) return json(400, { error: 'Order tidak ditemukan' });
      return json(200, { data: rows });
    }

    if (body.action === 'extend-dates') {
      const rows = await rest(
        env,
        `ad_schedules?source_table=eq.form_submissions_extend&source_id=eq.${body.sourceId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            start_date: body.startDate,
            end_date: body.endDate,
            updated_at: new Date().toISOString(),
          }),
        },
      );
      if (!Array.isArray(rows) || rows.length === 0) return json(400, { error: 'Jadwal tidak ditemukan' });
      return json(200, { data: rows });
    }

    if (body.action === 'submission-hold') {
      const rows = await rest(
        env,
        `form_submissions?id=eq.${body.submissionId}&select=payment_status,submission_status`,
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return json(400, { error: 'Order tidak ditemukan' });
      const payment = String(row.payment_status || '').toLowerCase();
      const lifecycle = String(row.submission_status || '').toLowerCase();
      if (PAID.has(payment) || COMMITTED.has(lifecycle)) return json(200, { data: { skipped: true } });
      const patch = {
        submission_status: 'slot_reserved',
        slot_booked_by: 'admin',
        slot_reserved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (payment === 'expired') patch.payment_status = 'pending';
      await rest(env, `form_submissions?id=eq.${body.submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return json(200, { data: { skipped: false } });
    }

    if (body.action === 'extend-hold') {
      const rows = await rest(
        env,
        `ad_schedules?source_table=eq.form_submissions_extend&source_id=eq.${body.sourceId}&select=payment_status,status`,
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return json(400, { error: 'Jadwal tidak ditemukan' });
      const payment = String(row.payment_status || '').toLowerCase();
      const lifecycle = String(row.status || '').toLowerCase();
      if (PAID.has(payment) || COMMITTED.has(lifecycle) || payment !== 'expired') {
        return json(200, { data: { skipped: true } });
      }
      await rest(
        env,
        `ad_schedules?source_table=eq.form_submissions_extend&source_id=eq.${body.sourceId}&payment_status=not.in.(paid,completed)`,
        {
          method: 'PATCH',
          body: JSON.stringify({ payment_status: 'pending', updated_at: new Date().toISOString() }),
        },
      );
      return json(200, { data: { skipped: false } });
    }

    if (body.action === 'kilat') {
      const rows = await rest(
        env,
        `form_submissions?id=eq.${body.submissionId}&select=payment_status,submission_status`,
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return json(400, { error: 'Order tidak ditemukan' });
      await rest(env, `form_submissions?id=eq.${body.submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify(kilatSchedulePatch(row, body)),
      });
      return json(200, { data: { ok: true } });
    }

    // Nol baris = sudah lunas / sudah dilepas; klien yang menjelaskan sebabnya.
    if (body.action === 'release-slot') {
      const rows = await rest(
        env,
        `form_submissions?id=eq.${body.submissionId}&${UNCOMMITTED_ORDER}`,
        { method: 'PATCH', body: JSON.stringify(releaseSlotPatch()) },
      );
      return json(200, { data: { id: Array.isArray(rows) && rows[0] ? rows[0].id : null } });
    }

    if (body.action === 'cancel-schedule') {
      const write = cancelScheduleWrite(body);
      const rows = await rest(env, write.path, { method: 'PATCH', body: JSON.stringify(write.patch) });
      return json(200, { data: { id: Array.isArray(rows) && rows[0] ? rows[0].id : null } });
    }

    if (body.action === 'extra-ad') {
      await rest(env, 'rpc/set_schedule_extra_ad', {
        method: 'POST',
        body: JSON.stringify({ p_schedule_id: body.scheduleId, p_is_extra: body.isExtra }),
      });
      return json(200, { data: { ok: true } });
    }

    const created = await rest(env, 'rpc/create_ad_schedule', {
      method: 'POST',
      body: JSON.stringify({
        p_submission_id: body.submissionId,
        p_start_date: body.startDate,
        p_end_date: body.endDate,
        p_duration: body.duration,
        p_prize_per_winner: body.prizePerWinner,
        p_winner_count: body.winnerCount,
        p_additional_prize_per_winner: body.additionalPrize,
        p_is_new_period: body.isNewBatch,
        p_status: 'waiting_payment',
        p_payment_status: 'pending',
        p_total_cost: 0,
        p_slot_booked_by: 'admin',
        p_is_extra_ad: body.isExtra,
      }),
    });
    return json(200, { data: created });
  } catch (err) {
    console.error('[schedule]', err);
    return json(400, { error: err?.message || 'Gagal menyimpan jadwal' });
  }
}
