-- 60_ad_completed_notifications.sql
--
-- Notifikasi otomatis saat penayangan iklan survei selesai:
-- Mengirim email edukasi + ajakan mengolah data CSV respon di JFU AI Analyzer.
--
-- Pola identik dengan 48_ad_live_notifications.sql:
-- 1. Kolom penanda `completed_notified_at` pada form_submissions
-- 2. Fungsi `notify_primary_ads_completed()` dipanggil oleh pg_cron
-- 3. pg_net memanggil endpoint Cloudflare `functions/api/notify-ad-completed.js`
-- 4. Kunci dan URL endpoint dibaca dari Vault (`notify_ad_completed_url` + `cron_notify_secret`)

-- ============================================================================
-- 1. Kolom penanda
-- ============================================================================

alter table public.form_submissions
  add column if not exists completed_notified_at timestamptz;

-- ============================================================================
-- 2. Fungsi notifikasi
-- ============================================================================

create or replace function public.notify_primary_ads_completed()
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
    from vault.decrypted_secrets where name = 'notify_ad_completed_url' limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_notify_secret' limit 1;

  if v_url is null or v_secret is null then
    -- Fallback URL jika belum terdaftar di vault
    v_url := 'https://jakpatforuniv.com/api/notify-ad-completed';
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'cron_notify_secret' limit 1;
  end if;

  if v_secret is null then
    raise warning 'notify_primary_ads_completed: vault secret cron_notify_secret belum diset, dilewati';
    return;
  end if;

  for rec in
    select
      fs.id,
      fs.email,
      fs.full_name,
      fs.title,
      fs.end_date
    from public.form_submissions fs
    where fs.submission_status in ('APPROVED', 'PUBLISHED', 'COMPLETED')
      and fs.payment_status = 'PAID'
      and fs.end_date is not null
      and public.airing_instant_of_date(fs.end_date) <= now()
      and fs.completed_notified_at is null
      and fs.created_at >= now() - interval '90 days'
  loop
    perform net.http_post(
      url := v_url || '?k=' || v_secret,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'submission_id', rec.id,
        'email', rec.email,
        'full_name', rec.full_name,
        'title', rec.title
      ),
      timeout_milliseconds := 5000
    );

    update public.form_submissions
      set completed_notified_at = now()
      where id = rec.id;
  end loop;
end;
$$;

-- ============================================================================
-- 3. Jadwalkan di pg_cron (tiap hari jam 15:10 WIB / 08:10 UTC)
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('notify-primary-ads-completed')
      where exists (
        select 1 from cron.job where jobname = 'notify-primary-ads-completed'
      );

    -- 08.10 UTC = 15.10 WIB (10 menit setelah jendela tayang berakhir)
    perform cron.schedule(
      'notify-primary-ads-completed',
      '10 8 * * *',
      'select public.notify_primary_ads_completed();'
    );
  end if;
end;
$$;
