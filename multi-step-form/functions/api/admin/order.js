import { computeTotalCostFromSubmission, rateInstantOf } from '../doku/create-payment.js';
import { repriceInputPatch, validateOrderWrite } from './orderGate.js';

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

function isPaid(sub) {
  return PAID.has(sub.payment_status || '') || COMMITTED.has(sub.submission_status || '');
}

async function rateInstant(env, submissionId, createdAt) {
  const rows = await rest(
    env,
    `ad_schedules?source_table=eq.form_submissions&source_id=eq.${submissionId}&select=rate_locked_at`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return rateInstantOf(row ? row.rate_locked_at : createdAt);
}

async function loadSubmission(env, id) {
  const rows = await rest(env, `form_submissions?id=eq.${id}&select=*`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error('Order tidak ditemukan');
  return row;
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
  const invalid = validateOrderWrite(body);
  if (invalid) return json(400, { error: invalid });

  try {
    if (body.action === 'criteria') {
      const rows = await rest(env, `form_submissions?id=eq.${body.submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ criteria_responden: body.criteria }),
      });
      if (!Array.isArray(rows) || rows.length === 0) return json(400, { error: 'Order tidak ditemukan' });
      return json(200, { data: rows });
    }

    const sub = await loadSubmission(env, body.submissionId);
    const inputs = body.action === 'reprice' ? repriceInputPatch(body) : {};
    const priced = { ...sub, ...inputs };
    if (body.action === 'convert') priced.distribution_type = body.target;
    priced.rate_instant = await rateInstant(env, body.submissionId, sub.created_at);
    const money = computeTotalCostFromSubmission(priced);
    const paid = isPaid(sub);

    if (body.action === 'convert') {
      const schedules = await rest(env, `ad_schedules?submission_id=eq.${body.submissionId}&select=id`);
      if (Array.isArray(schedules) && schedules.length > 1) {
        return json(400, {
          error: `Order ini punya ${schedules.length} jadwal iklan, jadi jalur distribusinya tidak bisa dipindahkan.`,
        });
      }
      const pages = await rest(env, `survey_pages?submission_id=eq.${body.submissionId}&select=is_published`);
      if (Array.isArray(pages) && pages.some((page) => page.is_published)) {
        return json(400, {
          error: 'Halaman iklan order ini sudah published — tarik atau sembunyikan halamannya dulu sebelum memindahkan jalur distribusi.',
        });
      }
      const patch = {
        distribution_type: body.target,
        start_date: null,
        end_date: null,
        kilat_slot_hour: null,
        slot_booked_by: null,
        slot_reserved_at: null,
        updated_at: new Date().toISOString(),
      };
      if (!paid) {
        patch.total_cost = money.total;
        patch.subtotal = money.subtotal;
        patch.ppn_amount = money.ppn;
        if (['slot_reserved', 'waiting_payment'].includes(sub.submission_status || '')) {
          patch.submission_status = 'approved';
        }
      }
      await rest(env, `form_submissions?id=eq.${body.submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return json(200, { data: { totalCost: money.total, subtotal: money.subtotal, ppn: money.ppn } });
    }

    const patch = { ...inputs };
    if (!paid) {
      patch.total_cost = money.total;
      patch.subtotal = money.subtotal;
      patch.ppn_amount = money.ppn;
    }
    let row = sub;
    if (Object.keys(patch).length > 0) {
      const rows = await rest(env, `form_submissions?id=eq.${body.submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      row = Array.isArray(rows) && rows[0] ? rows[0] : sub;
    }
    return json(200, {
      data: {
        row,
        totalCost: paid ? Number(sub.total_cost) || 0 : money.total,
        subtotal: paid ? Number(sub.subtotal) || 0 : money.subtotal,
        ppn: paid ? Number(sub.ppn_amount) || 0 : money.ppn,
        ...(paid ? { skipped: 'paid' } : {}),
      },
    });
  } catch (err) {
    console.error('[order]', err);
    return json(400, { error: err?.message || 'Gagal menyimpan order' });
  }
}
