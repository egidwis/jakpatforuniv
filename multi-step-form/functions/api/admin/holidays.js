import { validateHoliday, holidayRow } from './holidaysGate.js';
import { translateAwayLabel } from './holidaysTranslate.js';

// Huruf besar mengikuti pola JM_*; PostgREST menerima nama apa adanya.
const HOLIDAYS_TABLE = 'JFU_operational_holidays';

// Mode libur tim admin (toggle di halaman Submissions, sql/122). Tabel
// "JFU_operational_holidays" hanya memberi SELECT ke anon/authenticated dan
// TANPA policy tulis — satu-satunya penulis adalah fungsi ini lewat
// service_role, setelah email pemanggil dicocokkan ke ADMIN_EMAILS (pola seri
// keamanan sql/110–116).

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
  const invalid = validateHoliday(body);
  if (invalid) return json(400, { error: invalid });

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'Supabase service role tidak dikonfigurasi' });

  // Menyalakan/menyunting selalu MENULIS label_en — hasil terjemahan, atau ''
  // bila label kosong / terjemahan gagal — supaya terjemahan pesan lama tidak
  // tertinggal. Mematikan tidak menyentuhnya (dan tidak memanggil OpenRouter).
  const labelEn = body.isActive
    ? ((await translateAwayLabel(env, (body.label || '').trim())) ?? '')
    : undefined;

  // Upsert: mematikan = is_active false, bukan DELETE — riwayat masa libur
  // tetap tersimpan.
  const res = await fetch(`${supabaseUrl}/rest/v1/${HOLIDAYS_TABLE}?on_conflict=holiday_date`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(holidayRow(body, email, new Date().toISOString(), labelEn)),
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!res.ok) {
    const message = data?.message || data?.error || `PostgREST HTTP ${res.status}`;
    console.error('[holidays]', message);
    return json(400, { error: message });
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return json(500, { error: 'Tulisan tidak mengembalikan baris' });
  return json(200, { data: row });
}
