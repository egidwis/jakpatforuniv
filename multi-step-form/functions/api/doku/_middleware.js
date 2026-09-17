// Default-deny admin gate for /api/doku/*.
//
// Every endpoint under /api/doku/ requires an admin Supabase session, EXCEPT:
//   - webhook        → called by DOKU's servers (secured via secret URL, see webhook.js)
//   - create-payment → called by end users, including the public /payment-retry page
//                      where no session exists; safe because the amount is computed
//                      server-side from the DB, never taken from the caller.
//
// Everything else (checkout, sac/balance, sac/payout, sac/transfer, sac/create,
// sac/history, and any future endpoint added here) moves money or reads financial
// data, so it is admin-only and fail-closed.

const PUBLIC_ENDPOINTS = new Set(['webhook', 'create-payment']);

/**
 * Endpoint yang boleh dipanggil PEMILIK TAGIHAN, bukan hanya admin.
 *
 * ⚠️ INI BUKAN `PUBLIC_ENDPOINTS`, DAN PERBEDAANNYA ADALAH INTINYA. Sesi tetap
 * WAJIB dan tetap divalidasi di bawah; yang dilonggarkan hanya syarat "email
 * harus admin". Endpoint-nya sendiri WAJIB membuktikan kepemilikan sebelum
 * berbuat apa pun — middleware ini hanya menyatakan SIAPA pemanggilnya, tidak
 * pernah menyatakan dia berhak atas tagihan tertentu.
 *
 * ⚠️ KENAPA `cancel-order` ADA DI SINI (2026-09-17). Phase 4 melahirkan
 * pembatalan jadwal oleh PENELITI. `cancelSchedule()` memanggil Cancel Order
 * lebih dulu supaya link DOKU mati sebelum barisnya ditutup — tapi gerbang ini
 * menolaknya dengan 401, jadi setiap pembatalan peneliti meninggalkan link
 * hidup. Kegagalannya SUNYI berlapis dua: 401 di sini, lalu pencatatan sebabnya
 * juga ditolak RLS (`invoices` hanya punya policy UPDATE admin — lihat sql/91).
 * Sebelum Phase 4 hanya admin yang pernah memanggilnya, jadi tak pernah terlihat.
 *
 * ⚠️ Menambah nama ke set ini berarti berjanji endpoint-nya punya penjaga
 * kepemilikannya sendiri. Jangan menambah apa pun tanpa membuka berkasnya dan
 * memastikan penjaga itu ada.
 */
const OWNER_ENDPOINTS = new Set(['cancel-order']);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function deny(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // First path segment after /api/doku/ (e.g. "sac" for /api/doku/sac/payout)
  const rest = url.pathname.replace(/^\/api\/doku\//, '');
  const firstSegment = rest.split('/')[0];

  if (PUBLIC_ENDPOINTS.has(firstSegment)) {
    return next();
  }

  // Preflight for admin endpoints (browser sends OPTIONS before a request
  // carrying an Authorization header).
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    // Fail closed: without config we cannot verify anyone.
    console.error('[doku middleware] Supabase env vars missing — denying request');
    return deny(401, 'Unauthorized');
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return deny(401, 'Unauthorized');
  }

  let user;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      return deny(401, 'Unauthorized');
    }
    user = await res.json();
  } catch (err) {
    console.error('[doku middleware] Token validation failed:', err);
    return deny(401, 'Unauthorized');
  }

  const email = (user && user.email ? user.email : '').toLowerCase();
  const adminEmails = (env.ADMIN_EMAILS || 'product@jakpat.net')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const isAdmin = !!email && adminEmails.includes(email);

  /*
    Endpoint pemilik: sesi sah sudah cukup untuk MASUK, tapi tidak untuk
    BERBUAT. Identitas diteruskan lewat `context.data` supaya endpoint-nya
    tidak perlu memvalidasi token untuk kedua kalinya — dua tempat memvalidasi
    berarti dua tempat untuk menyimpang, dan yang satu akan lebih longgar
    (peringatan yang sudah tertulis di kepala `cancel-order.js`).
  */
  if (!isAdmin && OWNER_ENDPOINTS.has(firstSegment)) {
    if (!email) return deny(401, 'Unauthorized');
    context.data = { ...(context.data || {}), authEmail: email, authUserId: user?.id || null, isAdmin: false };
    return next();
  }

  if (!isAdmin) {
    console.warn(`[doku middleware] Non-admin access attempt to ${url.pathname} by ${email || '(no email)'}`);
    return deny(401, 'Unauthorized');
  }

  context.data = { ...(context.data || {}), authEmail: email, authUserId: user?.id || null, isAdmin: true };
  return next();
}
