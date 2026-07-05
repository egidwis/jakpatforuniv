-- 28_tighten_profiles_read.sql
-- Closes a pre-existing PII leak: profiles was SELECT-able by everyone (incl anon).
-- APPLY ONLY after confirming no external consumer relies on public profiles read.
-- get_profile_names (SECURITY DEFINER) is unaffected by this change.

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;

create policy "Profiles readable by owner or admin"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or (auth.jwt() ->> 'email') = 'product@jakpat.net'
  );
