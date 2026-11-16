-- ============================================================================
-- sql/136 — WEBINAR: REKAMAN DI R2 + PENANDA EMAIL PER ORDER — BAGIAN A
-- ============================================================================
--
-- Rencana: docs/superpowers/plans/2026-11-02-webinar-jfu.md, "Iterasi 6 Nov (3)"
-- (rekaman, Fase 5A) dan "Iterasi 6 Nov (4)" (email tanpa tabel antrean).
--
-- ── YANG BERUBAH ────────────────────────────────────────────────────────────
--
--   webinar_events.recording_object_key   kunci objek MP4 di bucket R2 privat
--                                         (rekaman/<event_id>/<nama>-<acak>.mp4).
--   CHECK rekaman terbit wajib punya kunci objek.
--   CHECK webinar_events_ready_to_sell    cabang Video kelas (replay) memakai
--                                         recording_object_key.
--   webinar_events.youtube_video_id       DI-DROP (beserta CHECK formatnya). YouTube
--                                         melarang menarik bayaran untuk menonton di
--                                         pemutar tersemat (III.F.3(1)); kode tidak
--                                         pernah memakainya.
--   webinar_events.schedule_changed_at    diisi server saat jadwal acara yang sudah
--                                         terjual berubah. Pemicu email "Jadwal baru".
--   webinar_orders.reminder_sent_for      jadwal (starts_at) yang sudah diingatkan H-1.
--   webinar_orders.schedule_email_sent_at email "Jadwal baru" terakhir diserahkan.
--   webinar_orders.cancel_email_sent_at   email pembatalan diserahkan.
--   webinar_orders.email_error            galat email otomatis terakhir (jenis, waktu,
--                                         pesan). Dikosongkan saat email berikutnya sukses.
--   (webinar_orders.recording_email_sent_at sudah ada sejak sql/131, mulai dipakai.)
--
-- ── KEPUTUSAN YANG MUDAH SALAH DIBACA ───────────────────────────────────────
--
--   * BAGIAN A HANYA MENAMBAH. Tabel antrean webinar_broadcasts* dan fungsinya
--     TIDAK disentuh di sini: kode Fase 3 yang sedang live masih memakainya
--     sampai kode baru terdeploy. Penggantinya ada di sql/136b (BAGIAN B),
--     dijalankan SESUDAH deploy.
--   * Kolom penanda kosong tidak mengirim apa pun sendiri. Yang mengirim adalah
--     webinar_notify_tick versi baru (sql/136b).
--   * Kunci objek berakhiran acak: mengunggah ulang berkas bernama sama tidak
--     menimpa objek lama, jadi "hapus objek lama sesudah ganti" aman.
--
-- Terapkan SEBELUM kode di-push: push ke main = deploy otomatis.


-- ============================================================================
-- LANGKAH 1 — DRY-RUN (baca saja)
-- ============================================================================
--
-- 1a. Kolom baru belum ada. Harapan: 0.
--
-- SELECT count(*) FROM information_schema.columns
--  WHERE (table_name = 'webinar_events' AND column_name IN ('recording_object_key', 'schedule_changed_at'))
--     OR (table_name = 'webinar_orders' AND column_name IN
--          ('reminder_sent_for', 'schedule_email_sent_at', 'cancel_email_sent_at', 'email_error'));
--
-- 1b. Tidak ada baris yang akan melanggar CHECK baru, dan youtube_video_id kosong
--     semua. Harapan: 0, 0, 0.
--
-- SELECT (SELECT count(*) FROM public.webinar_events WHERE recording_published_at IS NOT NULL) AS rekaman_terbit,
--        (SELECT count(*) FROM public.webinar_events
--          WHERE status = 'published' AND sales_mode = 'open' AND offer_kind = 'replay') AS video_kelas_dijual,
--        (SELECT count(*) FROM public.webinar_events WHERE youtube_video_id IS NOT NULL) AS youtube_terisi;


-- ============================================================================
-- LANGKAH 2 — TERAPKAN
-- ============================================================================

BEGIN;

-- ── Rekaman (Fase 5A) ───────────────────────────────────────────────────────

ALTER TABLE public.webinar_events
  ADD COLUMN recording_object_key text,
  ADD CONSTRAINT webinar_events_recording_key_format CHECK (
    recording_object_key IS NULL
    OR recording_object_key ~ '^rekaman/[0-9a-f-]{36}/[a-z0-9-]{1,80}\.mp4$'
  ),
  ADD CONSTRAINT webinar_events_recording_needs_key CHECK (
    recording_published_at IS NULL OR recording_object_key IS NOT NULL
  );

COMMENT ON COLUMN public.webinar_events.recording_object_key IS
  'Kunci objek MP4 rekaman di bucket R2 privat (sql/136). URL tonton hanya diterbitkan /api/webinar/watch.';

ALTER TABLE public.webinar_events DROP CONSTRAINT webinar_events_ready_to_sell;
ALTER TABLE public.webinar_events ADD CONSTRAINT webinar_events_ready_to_sell CHECK (
  NOT (status = 'published' AND sales_mode = 'open')
  OR (
    price IS NOT NULL
    AND (
      (offer_kind = 'live' AND starts_at IS NOT NULL AND duration_minutes IS NOT NULL AND quota IS NOT NULL)
      OR
      (offer_kind = 'replay' AND recording_object_key IS NOT NULL AND recording_published_at IS NOT NULL)
    )
  )
);

ALTER TABLE public.webinar_events DROP CONSTRAINT IF EXISTS webinar_events_youtube_format;
ALTER TABLE public.webinar_events DROP COLUMN youtube_video_id;

-- ── Penanda email otomatis per order (Iterasi 4) ────────────────────────────

ALTER TABLE public.webinar_events
  ADD COLUMN schedule_changed_at timestamptz;

COMMENT ON COLUMN public.webinar_events.schedule_changed_at IS
  'Terakhir jadwal acara yang sudah terjual berubah (diisi /api/admin/webinar). Peserta yang lunas sebelumnya menerima email "Jadwal baru" (sql/136b).';

ALTER TABLE public.webinar_orders
  ADD COLUMN reminder_sent_for timestamptz,
  ADD COLUMN schedule_email_sent_at timestamptz,
  ADD COLUMN cancel_email_sent_at timestamptz,
  ADD COLUMN email_error text;

COMMENT ON COLUMN public.webinar_orders.reminder_sent_for IS
  'starts_at acara yang sudah diingatkan H-1 (dikirim atau sengaja dilewati). Jadwal pindah = diingatkan lagi.';
COMMENT ON COLUMN public.webinar_orders.schedule_email_sent_at IS
  'Email "Jadwal baru" terakhir diserahkan ke pengirim (pola ad_schedules.live_notified_at: diisi saat dipanggil, bukan saat terkirim).';
COMMENT ON COLUMN public.webinar_orders.cancel_email_sent_at IS
  'Email pembatalan acara diserahkan ke pengirim.';
COMMENT ON COLUMN public.webinar_orders.email_error IS
  'Galat email otomatis terakhir: "<jenis> · <waktu WIB> · <pesan>". Dikosongkan saat email otomatis berikutnya sukses.';

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. Kolom. Harapan: 2 baris webinar_events, 4 baris webinar_orders, dan
--     youtube_video_id tidak ada lagi.
--
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND (
--        (table_name = 'webinar_events' AND column_name IN ('recording_object_key', 'schedule_changed_at', 'youtube_video_id'))
--     OR (table_name = 'webinar_orders' AND column_name IN
--          ('reminder_sent_for', 'schedule_email_sent_at', 'cancel_email_sent_at', 'email_error')))
--  ORDER BY 1, 2;
--
-- 3b. CHECK rekaman. Harapan: recording_key_format, recording_needs_key, dan
--     ready_to_sell yang menyebut recording_object_key.
--
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.webinar_events'::regclass
--    AND conname IN ('webinar_events_recording_key_format','webinar_events_recording_needs_key','webinar_events_ready_to_sell');


-- ============================================================================
-- ROLLBACK (hanya bila perlu; SEBELUM sql/136b dan sebelum ada rekaman/Video
-- kelas. Bila sql/136b sudah dijalankan, rollback sql/136b dulu.)
-- ============================================================================
--
-- Syarat: tidak ada rekaman terbit dan tidak ada Video kelas yang dijual. Harapan: 0.
--   SELECT count(*) FROM public.webinar_events
--    WHERE recording_published_at IS NOT NULL
--       OR (status = 'published' AND sales_mode = 'open' AND offer_kind = 'replay');
--
-- BEGIN;
-- ALTER TABLE public.webinar_orders DROP COLUMN IF EXISTS email_error;
-- ALTER TABLE public.webinar_orders DROP COLUMN IF EXISTS cancel_email_sent_at;
-- ALTER TABLE public.webinar_orders DROP COLUMN IF EXISTS schedule_email_sent_at;
-- ALTER TABLE public.webinar_orders DROP COLUMN IF EXISTS reminder_sent_for;
-- ALTER TABLE public.webinar_events DROP COLUMN IF EXISTS schedule_changed_at;
-- ALTER TABLE public.webinar_events ADD COLUMN youtube_video_id text,
--   ADD CONSTRAINT webinar_events_youtube_format CHECK (
--     youtube_video_id IS NULL OR youtube_video_id ~ '^[A-Za-z0-9_-]{11}$');
-- ALTER TABLE public.webinar_events DROP CONSTRAINT webinar_events_ready_to_sell;
-- ALTER TABLE public.webinar_events ADD CONSTRAINT webinar_events_ready_to_sell CHECK (
--   NOT (status = 'published' AND sales_mode = 'open')
--   OR (price IS NOT NULL AND (
--     (offer_kind = 'live' AND starts_at IS NOT NULL AND duration_minutes IS NOT NULL AND quota IS NOT NULL)
--     OR (offer_kind = 'replay' AND youtube_video_id IS NOT NULL AND recording_published_at IS NOT NULL))));
-- ALTER TABLE public.webinar_events DROP CONSTRAINT IF EXISTS webinar_events_recording_needs_key;
-- ALTER TABLE public.webinar_events DROP CONSTRAINT IF EXISTS webinar_events_recording_key_format;
-- ALTER TABLE public.webinar_events DROP COLUMN IF EXISTS recording_object_key;
-- COMMIT;
--
-- Objek MP4 di R2 TIDAK ikut terhapus; hapus lewat dashboard R2 bila perlu.
