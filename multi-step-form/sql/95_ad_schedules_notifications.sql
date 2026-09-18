-- ============================================================
-- Migrasi 95: Notifikasi Tayang & Selesai untuk Jadwal Extension (Per-Jadwal)
-- Date: 2026-09-18
--
-- APA INI & KENAPA BERKAS INI ADA
-- ------------------------------
-- Sebelumnya notifikasi iklan mulai tayang (`notify_primary_ads_live`) dan
-- selesai ditayangkan (`notify_primary_ads_completed`) hanya memindai tabel
-- `public.form_submissions`. Kolom penandanya (`live_notified_at` dan
-- `completed_notified_at`) hanya ada di tabel order tersebut.
--
-- Akibatnya:
--   1. Jadwal perpanjangan (extension / ordinal 2..n) di `ad_schedules` TIDAK
--      PERNAH mengirimkan email notifikasi sama sekali ke peneliti saat jadwal
--      extension-nya mulai tayang maupun selesai ditayangkan.
--   2. Karena selalu ada jeda beberapa hari antara jadwal pertama dan jadwal
--      extension, peneliti berada dalam kegelapan status tanpa notifikasi
--      transaksional saat batch berikutnya mulai/selesai tayang.
--
-- Solusi:
--   1. Menambahkan kolom `live_notified_at` dan `completed_notified_at` ke tabel
--      `public.ad_schedules`.
--   2. Backfill penanda dari `form_submissions` untuk ordinal 1 agar order lama
--      yang sudah selesai tidak terkirim ulang.
--   3. Menandai jadwal yang sudah lewat > 7 hari agar tidak memicu badai email.
--   4. Memperbarui `notify_primary_ads_live()` dan `notify_primary_ads_completed()`
--      agar memindai `ad_schedules` (ordinal 1 s.d. n), mengirimkan parameter
--      `ordinal`, `schedule_id`, dan `booking_id` ke endpoint Cloudflare Functions,
--      serta menandai kolom notifikasi per jadwal.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Skema Kolom Baru & Indeks di ad_schedules
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ad_schedules
  ADD COLUMN IF NOT EXISTS live_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.ad_schedules.live_notified_at IS
  'Waktu saat notifikasi email iklan mulai tayang dikirimkan ke peneliti.';
COMMENT ON COLUMN public.ad_schedules.completed_notified_at IS
  'Waktu saat notifikasi email iklan selesai tayang dikirimkan ke peneliti.';

CREATE INDEX IF NOT EXISTS idx_ad_schedules_live_notify
  ON public.ad_schedules (payment_status, start_date)
  WHERE live_notified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ad_schedules_completed_notify
  ON public.ad_schedules (payment_status, end_date)
  WHERE completed_notified_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Backfill Data Lama (Pencegahan Duplikasi Email)
-- ─────────────────────────────────────────────────────────────────────────
-- Salin status notifikasi yang sudah pernah dikirimkan pada jadwal ordinal 1
UPDATE public.ad_schedules s
SET live_notified_at = fs.live_notified_at
FROM public.form_submissions fs
WHERE s.submission_id = fs.id
  AND s.ordinal = 1
  AND fs.live_notified_at IS NOT NULL
  AND s.live_notified_at IS NULL;

UPDATE public.ad_schedules s
SET completed_notified_at = fs.completed_notified_at
FROM public.form_submissions fs
WHERE s.submission_id = fs.id
  AND s.ordinal = 1
  AND fs.completed_notified_at IS NOT NULL
  AND s.completed_notified_at IS NULL;

-- Tandai jadwal lampau (> 7 hari lalu) agar tidak terkirim blast massal
UPDATE public.ad_schedules
SET live_notified_at = now()
WHERE start_date < now() - INTERVAL '7 days'
  AND live_notified_at IS NULL;

UPDATE public.ad_schedules
SET completed_notified_at = now()
WHERE end_date < now() - INTERVAL '7 days'
  AND completed_notified_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Fungsi Cron Notifikasi Iklan Mulai Tayang (notify_primary_ads_live)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_primary_ads_live()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_url text;
  v_secret text;
  rec record;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'notify_ad_live_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'cron_notify_secret' LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'notify_primary_ads_live: vault secrets notify_ad_live_url/cron_notify_secret belum diset, dilewati';
    RETURN;
  END IF;

  FOR rec IN
    SELECT s.id AS schedule_id,
           s.submission_id,
           s.ordinal,
           s.booking_id,
           s.start_date,
           s.end_date,
           fs.email,
           fs.full_name,
           fs.title
    FROM public.ad_schedules s
    JOIN public.form_submissions fs ON fs.id = s.submission_id
    WHERE lower(s.payment_status) = 'paid'
      AND s.start_date IS NOT NULL
      AND s.end_date IS NOT NULL
      AND s.live_notified_at IS NULL
      AND fs.email IS NOT NULL
      AND lower(coalesce(s.status, '')) NOT IN ('rejected', 'spam', 'cancelled', 'slot_cancelled')
      AND lower(coalesce(fs.submission_status, '')) NOT IN ('rejected', 'spam', 'cancelled', 'slot_cancelled')
  LOOP
    -- Hanya kirim jika waktu sekarang sudah berada dalam rentang tayang
    IF rec.start_date > now() OR rec.end_date <= now() THEN
      CONTINUE;
    END IF;

    -- Batas 7 hari lampau untuk mencegah spamming order lama
    IF rec.start_date < now() - INTERVAL '7 days' THEN
      UPDATE public.ad_schedules
        SET live_notified_at = now()
        WHERE id = rec.schedule_id;
      IF rec.ordinal = 1 THEN
        UPDATE public.form_submissions
          SET live_notified_at = now()
          WHERE id = rec.submission_id AND live_notified_at IS NULL;
      END IF;
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url := v_url || '?k=' || v_secret,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'id', rec.submission_id,
        'schedule_id', rec.schedule_id,
        'booking_id', rec.booking_id,
        'ordinal', rec.ordinal,
        'email', rec.email,
        'full_name', rec.full_name,
        'title', rec.title,
        'start_date', rec.start_date,
        'end_date', rec.end_date
      ),
      timeout_milliseconds := 5000
    );

    UPDATE public.ad_schedules
      SET live_notified_at = now()
      WHERE id = rec.schedule_id;

    IF rec.ordinal = 1 THEN
      UPDATE public.form_submissions
        SET live_notified_at = now()
        WHERE id = rec.submission_id AND live_notified_at IS NULL;
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Fungsi Cron Notifikasi Iklan Selesai Ditayangkan (notify_primary_ads_completed)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_primary_ads_completed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_url    text;
  v_secret text;
  rec      record;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'notify_ad_completed_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'cron_notify_secret' LIMIT 1;

  IF v_url IS NULL THEN
    v_url := 'https://submit.jakpatforuniv.com/api/notify-ad-completed';
  END IF;

  IF v_secret IS NULL THEN
    RAISE WARNING 'notify_primary_ads_completed: vault secret cron_notify_secret belum diset, dilewati';
    RETURN;
  END IF;

  FOR rec IN
    SELECT s.id AS schedule_id,
           s.submission_id,
           s.ordinal,
           s.booking_id,
           s.start_date,
           s.end_date,
           fs.email,
           fs.full_name,
           fs.title
    FROM public.ad_schedules s
    JOIN public.form_submissions fs ON fs.id = s.submission_id
    WHERE lower(s.payment_status) = 'paid'
      AND s.end_date IS NOT NULL
      AND fs.email IS NOT NULL
      AND s.completed_notified_at IS NULL
      AND lower(coalesce(s.status, '')) NOT IN ('rejected', 'spam', 'cancelled', 'slot_cancelled')
      AND lower(coalesce(fs.submission_status, '')) NOT IN ('rejected', 'spam', 'cancelled', 'slot_cancelled')
  LOOP
    -- Belum berakhir -> lewati
    IF rec.end_date > now() THEN
      CONTINUE;
    END IF;

    -- Berakhir terlalu lama (> 7 hari) -> tandai tanpa kirim
    IF rec.end_date < now() - INTERVAL '7 days' THEN
      UPDATE public.ad_schedules
        SET completed_notified_at = now()
        WHERE id = rec.schedule_id;
      IF rec.ordinal = 1 THEN
        UPDATE public.form_submissions
          SET completed_notified_at = now()
          WHERE id = rec.submission_id AND completed_notified_at IS NULL;
      END IF;
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url     := v_url || '?k=' || v_secret,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object(
        'submission_id', rec.submission_id,
        'schedule_id',   rec.schedule_id,
        'booking_id',    rec.booking_id,
        'ordinal',       rec.ordinal,
        'email',         rec.email,
        'full_name',     rec.full_name,
        'title',         rec.title,
        'start_date',    rec.start_date,
        'end_date',      rec.end_date
      ),
      timeout_milliseconds := 5000
    );

    UPDATE public.ad_schedules
      SET completed_notified_at = now()
      WHERE id = rec.schedule_id;

    IF rec.ordinal = 1 THEN
      UPDATE public.form_submissions
        SET completed_notified_at = now()
        WHERE id = rec.submission_id AND completed_notified_at IS NULL;
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Hardening Izin Eksekusi Fungsi Cron (REVOKE)
-- ─────────────────────────────────────────────────────────────────────────
-- Fungsi ini hanya boleh dipanggil oleh pg_cron / service_role / postgres.
-- Cabut akses dari anon dan authenticated agar tidak disalahgunakan dari frontend.
REVOKE ALL ON FUNCTION public.notify_primary_ads_live() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_primary_ads_completed() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 6. VERIFIKASI & DRY RUN (Jalankan di SQL Editor untuk Pengujian)
-- ============================================================================
-- -- Periksa apakah ada jadwal yang saat ini memenuhi syarat notifikasi live:
-- SELECT s.id, s.booking_id, s.ordinal, s.start_date, s.end_date, fs.title, fs.email
-- FROM public.ad_schedules s
-- JOIN public.form_submissions fs ON fs.id = s.submission_id
-- WHERE lower(s.payment_status) = 'paid'
--   AND s.start_date <= now() AND s.end_date > now()
--   AND s.live_notified_at IS NULL;
--
-- -- Periksa apakah ada jadwal yang saat ini memenuhi syarat notifikasi completed:
-- SELECT s.id, s.booking_id, s.ordinal, s.start_date, s.end_date, fs.title, fs.email
-- FROM public.ad_schedules s
-- JOIN public.form_submissions fs ON fs.id = s.submission_id
-- WHERE lower(s.payment_status) = 'paid'
--   AND s.end_date <= now()
--   AND s.completed_notified_at IS NULL;
--
-- -- Verifikasi izin fungsi (harus hanya postgres / service_role):
-- SELECT p.proname, array_to_string(p.proacl,' | ') AS acl
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public'
--   AND p.proname IN ('notify_primary_ads_live', 'notify_primary_ads_completed');
--
-- ============================================================================
-- 7. ROLLBACK (Jika migrasi perlu dibatalkan)
-- ============================================================================
-- DROP INDEX IF EXISTS public.idx_ad_schedules_live_notify;
-- DROP INDEX IF EXISTS public.idx_ad_schedules_completed_notify;
-- ALTER TABLE public.ad_schedules
--   DROP COLUMN IF EXISTS live_notified_at,
--   DROP COLUMN IF EXISTS completed_notified_at;
-- -- Kembalikan notify_primary_ads_live() ke versi sql/49 dan notify_primary_ads_completed() ke sql/65.
