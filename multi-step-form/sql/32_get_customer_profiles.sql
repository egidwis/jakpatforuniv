-- 32_get_customer_profiles.sql
-- RPC admin untuk halaman Customers: kembalikan SEMUA profil customer (akun
-- auth) berikut biodatanya, sehingga customer yang baru daftar dan belum pernah
-- submit survei tetap terlihat di admin (pra-submission).
-- Gating sama dengan get_profile_names (sql/27): hanya email admin yang dapat
-- baris; caller lain mendapat 0 baris.
-- JOIN ke auth.users penting: profiles adalah tabel warisan (dulu berisi data
-- influencer), jadi hanya baris yang punya akun login yang dihitung customer.
-- Idempotent / re-runnable.

drop function if exists public.get_customer_profiles();
create function public.get_customer_profiles()
returns table(
  id uuid,
  full_name text,
  email text,
  phone_number text,
  university text,
  department text,
  status text,
  referral_source text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.email, p.phone_number, p.university,
         p.department, p.status, p.referral_source
  from   public.profiles p
  join   auth.users u on u.id = p.id
  where  (auth.jwt() ->> 'email') = 'product@jakpat.net';
$$;

grant execute on function public.get_customer_profiles() to authenticated;
