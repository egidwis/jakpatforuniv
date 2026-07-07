import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/auth/check-email   body: { email }
 *
 * Backs the /forgot-password page. Returns whether an email has an account so
 * the UI can tell the user explicitly when it is NOT registered — something
 * Supabase's resetPasswordForEmail() will not reveal on its own.
 *
 * The existence check runs via the SECURITY DEFINER RPC public.auth_email_exists,
 * which is granted to service_role ONLY (see sql/30_auth_email_exists.sql). That
 * keeps the enumeration surface off the public/anon API — it lives solely here,
 * behind the service role key.
 *
 * PRODUCTION: put this route behind rate limiting / Turnstile (Cloudflare WAF
 * rate-limit rule on /api/auth/check-email) to blunt bulk enumeration.
 *
 * Fail-open to the SECURE default: if the server is misconfigured (no service
 * role key) or the RPC errors, we return exists:null so the client falls back to
 * the neutral "if the email exists, a link was sent" behaviour instead of leaking.
 */
export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  let email;
  try {
    const body = await request.json();
    email = typeof body?.email === 'string' ? body.email.trim() : '';
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // Basic format guard — avoids pointless RPC calls on obvious garbage.
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const serviceRoleKey =
    env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  // Without the service role key we cannot check safely — fail open to neutral.
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ exists: null }), {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabase.rpc('auth_email_exists', {
      p_email: email,
    });
    if (error) throw error;
    return new Response(JSON.stringify({ exists: Boolean(data) }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error('check-email error:', err?.message || err);
    // Fail open to the secure/neutral default.
    return new Response(JSON.stringify({ exists: null }), {
      status: 200,
      headers: corsHeaders,
    });
  }
}
