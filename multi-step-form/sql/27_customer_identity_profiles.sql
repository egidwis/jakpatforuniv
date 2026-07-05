-- 27_customer_identity_profiles.sql
-- Recovered from live DB 2026-07-06 (profiles + handle_new_user already exist).
-- Idempotent / re-runnable. Tracks the existing objects in-repo, backfills
-- pre-trigger accounts, and adds an admin-only name-lookup RPC.

-- 1. Trigger fn (already live; captured here for repo history). Reuse as-is.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Backfill accounts created before the trigger existed (gaps only).
insert into public.profiles (id, email, full_name)
select u.id, u.email, u.raw_user_meta_data->>'full_name'
from   auth.users u
where  u.email is not null
on conflict (id) do nothing;

-- 3. Admin-only name lookup. SECURITY DEFINER so it works regardless of the
--    (about-to-be-tightened) profiles SELECT policy. Non-admin callers get
--    zero rows because the WHERE gate fails for them.
create or replace function public.get_profile_names(p_ids uuid[] default null)
returns table(id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from   public.profiles p
  where  (auth.jwt() ->> 'email') = 'product@jakpat.net'
    and  (p_ids is null or p.id = any(p_ids));
$$;

grant execute on function public.get_profile_names(uuid[]) to authenticated;
