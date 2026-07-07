-- 30_auth_email_exists.sql
-- Backs the "Lupa password?" page (/forgot-password). The page needs to tell the
-- user explicitly when an email is NOT registered, which Supabase's
-- resetPasswordForEmail() intentionally will not reveal (anti-enumeration).
--
-- SECURITY NOTE: exposing "does this email have an account" is a user-enumeration
-- surface. We contain it two ways:
--   1. EXECUTE is granted ONLY to service_role — anon/authenticated cannot call
--      this RPC directly. The check runs exclusively inside the server function
--      functions/api/auth/check-email.js (service role key).
--   2. That endpoint should sit behind rate limiting / Turnstile in production
--      (see Cloudflare WAF rate-limiting rule on /api/auth/check-email).
-- Idempotent / re-runnable.

create or replace function public.auth_email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from   auth.users u
    where  lower(u.email) = lower(trim(p_email))
  );
$$;

-- Lock it down: server-side (service_role) only.
revoke all on function public.auth_email_exists(text) from public;
revoke all on function public.auth_email_exists(text) from anon;
revoke all on function public.auth_email_exists(text) from authenticated;
grant execute on function public.auth_email_exists(text) to service_role;
