-- 48_ad_live_notifications.sql
--
-- Problem: user tidak pernah dikabari saat iklannya benar-benar mulai tayang.
-- Satu-satunya event terjadwal yang ada di sistem, cron_activate_extends()
-- (migrasi 20 & 36), hanya menyentuh form_submissions_extend — order utama
-- (ordinal 1) tidak punya hook apa pun, karena submission_status di tabel itu
-- MEMANG SENGAJA tidak pernah maju sendiri (lihat scheduleModel.ts:99). Migrasi
-- ini TIDAK mengubah keputusan itu — ia hanya menambah cara mendeteksi "jendela
-- tayang baru saja mulai" satu kali per order, tanpa menyentuh status yang
-- dibaca UI.
--
-- Desain: pg_cron (sudah aktif, job "activate-extends") + pg_net (sudah
-- terpasang, extensions.pg_net 0.14.0) memanggil endpoint Cloudflare baru
-- (functions/api/notify-ad-live.js) yang mengirim email lewat Resend. Kunci
-- Resend TETAP hanya hidup di Cloudflare — Postgres cuma menyimpan URL
-- endpoint + secret bersama di Vault (sudah terpasang: supabase_vault 0.3.1),
-- pola yang sama dengan ?k=<secret> pada webhook DOKU
-- (functions/api/doku/webhook.js).
--
-- Kolom form_submissions.start_date/end_date bertipe DATE, bukan TIMESTAMPTZ
-- (beda dengan form_submissions_extend) — jam tayang 15.00 WIB harus diangkat
-- lewat airing_instant_of_date() sebelum dibandingkan dengan now(), atau
-- perbandingannya bisa meleset beberapa jam. Lihat catatan
-- schedule-date-type-asymmetry di memory sesi sebelumnya.
--
-- pg_net bersifat ASYNC (queue-and-forget, hasil baru muncul belakangan di
-- net._http_response) — live_notified_at ditandai segera setelah request
-- di-queue, bukan setelah response diterima. Ini best-effort, sama seperti
-- email submit yang sudah ada (fire-and-forget, gagalnya cuma console.error).
--
-- Jalankan di Supabase SQL Editor.

-- ============================================================================
-- 1. Kolom penanda + fungsi + jadwal
-- ============================================================================

alter table public.form_submissions
  add column if not exists live_notified_at timestamptz;

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_primary_ads_live()
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url text;
  v_secret text;
  rec record;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_ad_live_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_notify_secret' limit 1;

  if v_url is null or v_secret is null then
    raise warning 'notify_primary_ads_live: vault secrets notify_ad_live_url/cron_notify_secret belum diset, dilewati';
    return;
  end if;

  for rec in
    select id, email, full_name, title, start_date, end_date
    from public.form_submissions
    where payment_status = 'paid'
      and start_date is not null
      and end_date is not null
      and airing_instant_of_date(start_date) <= now()
      and airing_instant_of_date(end_date) > now()
      and live_notified_at is null
      and email is not null
  loop
    perform net.http_post(
      url := v_url || '?k=' || v_secret,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'id', rec.id,
        'email', rec.email,
        'full_name', rec.full_name,
        'title', rec.title,
        'start_date', rec.start_date,
        'end_date', rec.end_date
      )
    );

    update public.form_submissions
      set live_notified_at = now()
      where id = rec.id;
  end loop;
end;
$$;

-- cron.schedule dengan jobname yang sudah ada akan MENGGANTI jadwalnya
-- (upsert), jadi migrasi ini aman dijalankan ulang.
select cron.schedule(
  'notify-primary-ads-live',
  '*/15 * * * *',
  $$select public.notify_primary_ads_live()$$
);

-- ============================================================================
-- 2. Setup manual SEKALI JALAN — JANGAN commit nilai secret ke git
-- ============================================================================
--
-- Jalankan di Supabase SQL Editor (bukan lewat migrasi ini), lalu simpan
-- CRON_NOTIFY_SECRET yang SAMA sebagai Cloudflare Pages secret env var:
--
--   select vault.create_secret(
--     'https://submit.jakpatforuniv.com/api/notify-ad-live',
--     'notify_ad_live_url'
--   );
--   select vault.create_secret(
--     '<generate string acak panjang, mis. openssl rand -hex 32>',
--     'cron_notify_secret'
--   );
--
-- Lalu di Cloudflare Pages → Settings → Environment variables (production),
-- tambahkan CRON_NOTIFY_SECRET dengan nilai string acak yang SAMA persis.
-- Sampai kedua secret ini diset, notify_primary_ads_live() no-op dengan
-- WARNING di log — tidak ada email terkirim, tidak error.

-- ============================================================================
-- 3. Verifikasi
-- ============================================================================
--
-- 3a. Cron terdaftar dan aktif:
--   select jobname, schedule, active from cron.job where jobname = 'notify-primary-ads-live';
--
-- 3b. Jalankan manual untuk uji (aman — hanya menyentuh order paid yang
--     jendelanya sedang berjalan dan belum pernah dinotifikasi):
--   select public.notify_primary_ads_live();
--
-- 3c. Lihat hasil panggilan HTTP-nya (muncul async, cek beberapa detik setelah 3b):
--   select id, status_code, created, response_body
--   from net._http_response order by created desc limit 5;
--
-- 3d. Order yang sudah dinotifikasi:
--   select id, title, start_date, end_date, live_notified_at
--   from public.form_submissions where live_notified_at is not null
--   order by live_notified_at desc limit 10;

-- ============================================================================
-- 4. Rollback
-- ============================================================================
--
--   select cron.unschedule('notify-primary-ads-live');
--   drop function if exists public.notify_primary_ads_live();
--   alter table public.form_submissions drop column if exists live_notified_at;
--   -- Secret di Vault boleh dibiarkan (tidak berbahaya, tidak dipakai fungsi lain).
