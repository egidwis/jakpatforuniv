-- 31_profiles_biodata.sql
-- Konsep "1 akun = 1 researcher": profiles menjadi sumber biodata researcher
-- (HP, universitas, jurusan, status, referral) yang dikumpulkan saat register
-- (LoginPage) atau lewat halaman /dashboard/profile. Multi-step form tidak lagi
-- menanyakan biodata (StepTwo dihapus); nilainya di-prefill dari sini dan tetap
-- disimpan sebagai snapshot per submission di form_submissions.
-- Idempotent / re-runnable.

-- 1. Kolom biodata baru.
alter table public.profiles add column if not exists phone_number    text;
alter table public.profiles add column if not exists university      text;
alter table public.profiles add column if not exists department      text;
alter table public.profiles add column if not exists status          text;
alter table public.profiles add column if not exists referral_source text;

-- 2. Trigger signup: ikut menyalin biodata dari user_metadata (dikirim oleh
--    signUp() lewat options.data). Pertahankan on conflict do nothing dari
--    sql/27 — baris lama tidak boleh tertimpa.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone_number, university, department, status, referral_source)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone_number',
    new.raw_user_meta_data->>'university',
    new.raw_user_meta_data->>'department',
    new.raw_user_meta_data->>'status',
    new.raw_user_meta_data->>'referral_source'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3. Policy UPDATE own row: dibutuhkan halaman profil/onboarding
--    (updateOwnProfile) agar user bisa melengkapi/mengubah biodatanya sendiri.
drop policy if exists "Profiles updatable by owner" on public.profiles;
create policy "Profiles updatable by owner"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 4. Backfill user lama: isi kolom yang masih null dari form_submissions
--    terbaru per auth_user_id (data biodata historis eks StepTwo).
--    Idempotent: coalesce hanya mengisi yang kosong, tidak menimpa nilai yang
--    sudah diisi user lewat halaman profil.
with latest_submission as (
  select distinct on (fs.auth_user_id)
         fs.auth_user_id,
         fs.phone_number,
         fs.university,
         fs.department,
         fs.status,
         fs.referral_source
  from   public.form_submissions fs
  where  fs.auth_user_id is not null
  order  by fs.auth_user_id, fs.created_at desc
)
update public.profiles p
set    phone_number    = coalesce(p.phone_number,    ls.phone_number),
       university      = coalesce(p.university,      ls.university),
       department      = coalesce(p.department,      ls.department),
       status          = coalesce(p.status,          ls.status),
       referral_source = coalesce(p.referral_source, ls.referral_source)
from   latest_submission ls
where  ls.auth_user_id = p.id
  and (p.phone_number is null
    or p.university   is null
    or p.department   is null
    or p.status       is null
    or p.referral_source is null);
