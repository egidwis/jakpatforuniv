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

  if (!email || !adminEmails.includes(email)) {
    console.warn(`[doku middleware] Non-admin access attempt to ${url.pathname} by ${email || '(no email)'}`);
    return deny(401, 'Unauthorized');
  }

  return next();
}
