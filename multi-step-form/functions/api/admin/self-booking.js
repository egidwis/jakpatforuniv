import { validateSelfBooking, selfBookingRow } from './selfBookingGate.js';
import { translateAwayLabel } from './holidaysTranslate.js';

// Huruf besar mengikuti pola JM_*; PostgREST menerima nama apa adanya.
const CLOSURES_TABLE = 'JFU_self_booking_closures';

// Saklar "Tutup reservasi mandiri" di halaman Submissions (sql/125). Tabel
// "JFU_self_booking_closures" hanya memberi SELECT ke anon/authenticated dan
// TANPA policy tulis — satu-satunya penulis adalah fungsi ini lewat
// service_role, setelah email pemanggil dicocokkan ke ADMIN_EMAILS. Kembaran
// /api/admin/holidays (mode libur).

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
  const invalid = validateSelfBooking(body);
  if (invalid) return json(400, { error: invalid });

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Supabase service role tidak dikonfigurasi' });

  // Menutup/menyunting selalu MENULIS label_en (terjemahan, atau '' bila label
  // kosong / terjemahan gagal). Membuka tidak menyentuhnya.
  const labelEn = body.isActive
    ? ((await translateAwayLabel(env, (body.label || '').trim())) ?? '')
    : undefined;

  // Upsert: membuka = is_active false, bukan DELETE — riwayat masa tutup tetap.
  const res = await fetch(`${supabaseUrl}/rest/v1/${CLOSURES_TABLE}?on_conflict=closed_on`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(selfBookingRow(body, email, new Date().toISOString(), labelEn)),
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!res.ok) {
    const message = data?.message || data?.error || `PostgREST HTTP ${res.status}`;
    console.error('[self-booking]', message);
    return json(400, { error: message });
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return json(500, { error: 'Tulisan tidak mengembalikan baris' });
  return json(200, { data: row });
}
