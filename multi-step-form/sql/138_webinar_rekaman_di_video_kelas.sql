-- ============================================================================
-- sql/138 — WEBINAR: REKAMAN HANYA DI VIDEO KELAS; WEBINAR CUKUP DIKAITKAN
-- ============================================================================
--
-- Rencana: docs/superpowers/plans/2026-11-02-webinar-jfu.md, "Iterasi 10 Nov (8)".
--
-- Video dan materi kini hanya diunggah di baris Video kelas (V). Baris webinar
-- (E) tidak pernah punya rekaman sendiri. Pemegang tiket E menonton rekaman V
-- bila V dikaitkan ke E (V.source_event_id = E.id, sql/137), E terbit dan sudah
-- mulai, dan rekaman V sudah terbit. Status halaman V tidak berpengaruh: V yang
-- dibiarkan draft = rekaman khusus peserta.
--
-- ── YANG BERUBAH ────────────────────────────────────────────────────────────
--
--   webinar_events.source_linked_at  timestamptz NULL — kapan kaitan terakhir
--                                    dibuat/diganti. Dasar "tersedia sejak" bagi
--                                    pemegang tiket, dan batas 7 hari emailnya.
--   CHECK webinar_events_source_linked_at
--                                    kaitan dan waktunya selalu berpasangan.
--   CHECK webinar_events_recording_only_video
--                                    rekaman & materi hanya di Video kelas.
--   webinar_notify_tick()            cabang 'recording_ready' membaca rekaman V.
--                                    Cabang lain TIDAK berubah (disalin dari
--                                    produksi, md5 d04ae59b7c8efcdcfea5b519a72a77b8).
--
-- ── KEPUTUSAN YANG MUDAH SALAH DIBACA ───────────────────────────────────────
--
--   * "Tersedia sejak" = greatest(V.recording_published_at, V.source_linked_at,
--     E.starts_at). E.starts_at ikut supaya Video kelas yang rekamannya terbit
--     lebih dari 7 hari SEBELUM webinar mulai tetap mengirim email saat mulai.
--   * Data uji direset: rekaman & materi `uji-webinar` (acara uji) dikosongkan,
--     dan `recording_email_sent_at` order-nya dikosongkan, supaya gerbang A
--     menguji jalur email baru. Objek R2 lama (video 5 detik) dan PDF lamanya
--     dibiarkan yatim; boleh dihapus manual.
--   * Terapkan SEBELUM kode di-push. Antara SQL dan push, JANGAN pakai menu
--     Webinar admin: kode lama menulis sumber tanpa source_linked_at dan
--     mengunggah rekaman ke baris webinar; keduanya ditolak CHECK baru.


-- ============================================================================
-- LANGKAH 1 — DRY-RUN (baca saja)
-- ============================================================================
--
-- 1a. Kolom belum ada. Harapan: 0.
--
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'webinar_events' AND column_name = 'source_linked_at';
--
-- 1b. Baris webinar yang punya rekaman/materi. Harapan: hanya `uji-webinar`
--     dengan is_test = true. Bila ada baris is_test = false: BERHENTI, kabari
--     developer (langkah 2 hanya membersihkan acara uji, jadi CHECK akan gagal).
--
-- SELECT slug, is_test, recording_object_key IS NOT NULL AS ada_video,
--        recording_published_at, materials_path
--   FROM public.webinar_events
--  WHERE offer_kind = 'live'
--    AND (recording_object_key IS NOT NULL OR recording_published_at IS NOT NULL
--         OR recording_minutes IS NOT NULL OR materials_path IS NOT NULL);
--
-- 1c. Video kelas yang sudah dikaitkan. Harapan 10 Nov: 0.
--
-- SELECT count(*) FROM public.webinar_events WHERE source_event_id IS NOT NULL;
--
-- 1d. Badan tick masih yang dicatat 10 Nov. Harapan: d04ae59b7c8efcdcfea5b519a72a77b8.
--     Bila berbeda: BERHENTI, kabari developer (langkah 2 menimpa badannya).
--
-- SELECT md5(pg_get_functiondef('public.webinar_notify_tick()'::regprocedure));


-- ============================================================================
-- LANGKAH 2 — TERAPKAN
-- ============================================================================

BEGIN;

-- 2.1 Waktu kaitan. Kaitan yang sudah ada (bila ada) dianggap dibuat sekarang.
ALTER TABLE public.webinar_events ADD COLUMN source_linked_at timestamptz;

UPDATE public.webinar_events SET source_linked_at = now() WHERE source_event_id IS NOT NULL;

ALTER TABLE public.webinar_events
  ADD CONSTRAINT webinar_events_source_linked_at CHECK (
    (source_event_id IS NULL) = (source_linked_at IS NULL)
  );

COMMENT ON COLUMN public.webinar_events.source_linked_at IS
  'Video kelas: kapan kaitan ke source_event_id dibuat/diganti (sql/138). Pemegang tiket webinar itu bisa menonton sejak greatest(recording_published_at, source_linked_at, starts_at webinar).';

-- 2.2 Bersihkan rekaman & materi lama di acara UJI (hanya is_test).
UPDATE public.webinar_orders o
   SET recording_email_sent_at = NULL
  FROM public.webinar_events e
 WHERE e.id = o.event_id
   AND e.offer_kind = 'live' AND e.is_test
   AND (e.recording_object_key IS NOT NULL OR e.recording_published_at IS NOT NULL
        OR e.recording_minutes IS NOT NULL OR e.materials_path IS NOT NULL);

UPDATE public.webinar_events
   SET recording_object_key = NULL, recording_published_at = NULL,
       recording_minutes = NULL, materials_path = NULL
 WHERE offer_kind = 'live' AND is_test
   AND (recording_object_key IS NOT NULL OR recording_published_at IS NOT NULL
        OR recording_minutes IS NOT NULL OR materials_path IS NOT NULL);

-- 2.3 Rekaman & materi hanya di Video kelas.
ALTER TABLE public.webinar_events
  ADD CONSTRAINT webinar_events_recording_only_video CHECK (
    offer_kind = 'replay'
    OR (recording_object_key IS NULL AND recording_published_at IS NULL
        AND recording_minutes IS NULL AND materials_path IS NULL)
  );

-- 2.4 Tick: cabang 'recording_ready' membaca Video kelas yang dikaitkan.
--     Selain LEFT JOIN v dan cabang itu, badan sama persis dengan produksi.
CREATE OR REPLACE FUNCTION public.webinar_notify_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  v_url    text;
  v_secret text;
  r        record;
  n        integer := 0;
BEGIN
  -- Tick yang tumpang tindih (cron lambat) tidak mengirim dobel.
  IF NOT pg_try_advisory_xact_lock(hashtext('public.webinar_notify_tick')) THEN
    RETURN 0;
  END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'webinar_notify_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_notify_secret' LIMIT 1;
  IF v_url IS NULL OR v_secret IS NULL THEN
    -- Penanda TIDAK diisi: email menunggu sampai vault benar.
    RAISE WARNING 'webinar_notify_tick: vault webinar_notify_url/cron_notify_secret belum diset, dilewati';
    RETURN 0;
  END IF;

  -- Pengingat H-1 dilewati bila email "Jadwal baru" diserahkan < 12 jam lalu.
  UPDATE webinar_orders o
     SET reminder_sent_for = e.starts_at
    FROM webinar_events e
   WHERE e.id = o.event_id
     AND o.status = 'paid' AND o.kind = 'live'
     AND e.status = 'published' AND e.offer_kind = 'live'
     AND e.starts_at - interval '24 hours' <= now() AND e.starts_at - interval '3 hours' > now()
     AND o.reminder_sent_for IS DISTINCT FROM e.starts_at
     AND o.paid_at < now() - interval '6 hours'
     AND o.schedule_email_sent_at > now() - interval '12 hours';

  FOR r IN
    SELECT o.id, d.kind, e.starts_at, e.schedule_changed_at
      FROM webinar_orders o
      JOIN webinar_events e ON e.id = o.event_id
      -- Paling banyak satu Video kelas per webinar (unique index sql/137).
      LEFT JOIN webinar_events v ON v.source_event_id = e.id AND v.status <> 'cancelled'
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN e.status = 'cancelled' AND e.starts_at > now() - interval '7 days'
               AND o.cancel_email_sent_at IS NULL
            THEN 'cancellation'
          WHEN e.status = 'published' AND e.offer_kind = 'live' AND e.starts_at > now()
               AND e.schedule_changed_at > now() - interval '7 days'
               AND o.paid_at < e.schedule_changed_at
               AND (o.schedule_email_sent_at IS NULL OR o.schedule_email_sent_at < e.schedule_changed_at)
            THEN 'schedule_change'
          WHEN e.status = 'published' AND e.offer_kind = 'live'
               AND e.starts_at - interval '24 hours' <= now() AND e.starts_at - interval '3 hours' > now()
               AND o.reminder_sent_for IS DISTINCT FROM e.starts_at
               AND o.paid_at < now() - interval '6 hours'
            THEN 'reminder_day'
          WHEN e.status = 'published' AND e.offer_kind = 'live' AND e.starts_at <= now()
               AND v.recording_published_at IS NOT NULL
               AND greatest(v.recording_published_at, v.source_linked_at, e.starts_at) > now() - interval '7 days'
               AND o.recording_email_sent_at IS NULL
            THEN 'recording_ready'
        END AS kind
      ) d
     WHERE o.status = 'paid' AND o.kind = 'live' AND d.kind IS NOT NULL
     ORDER BY CASE d.kind WHEN 'cancellation' THEN 1 WHEN 'schedule_change' THEN 2
                          WHEN 'reminder_day' THEN 3 ELSE 4 END,
              o.paid_at, o.id
     LIMIT 25
  LOOP
    PERFORM net.http_post(
      url := v_url || '?k=' || v_secret,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('order_id', r.id, 'kind', r.kind),
      timeout_milliseconds := 10000
    );

    UPDATE webinar_orders
       SET cancel_email_sent_at = CASE WHEN r.kind = 'cancellation' THEN now() ELSE cancel_email_sent_at END,
           schedule_email_sent_at = CASE WHEN r.kind = 'schedule_change'
                                         THEN greatest(now(), r.schedule_changed_at) ELSE schedule_email_sent_at END,
           reminder_sent_for = CASE WHEN r.kind = 'reminder_day' THEN r.starts_at ELSE reminder_sent_for END,
           recording_email_sent_at = CASE WHEN r.kind = 'recording_ready' THEN now() ELSE recording_email_sent_at END
     WHERE id = r.id;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$function$;

-- CREATE OR REPLACE mempertahankan hak lama; diulang supaya pasti tertutup.
REVOKE ALL ON FUNCTION public.webinar_notify_tick() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. Kolom + kedua CHECK. Harapan: 1 baris timestamptz; 2 constraint.
--
-- SELECT data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'webinar_events' AND column_name = 'source_linked_at';
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.webinar_events'::regclass
--    AND conname IN ('webinar_events_source_linked_at', 'webinar_events_recording_only_video');
--
-- 3b. Acara uji bersih. Harapan: uji-webinar tanpa video/materi; order-nya
--     recording_email_sent_at kosong.
--
-- SELECT e.slug, e.recording_object_key, e.recording_published_at, e.materials_path, o.recording_email_sent_at
--   FROM public.webinar_events e JOIN public.webinar_orders o ON o.event_id = e.id
--  WHERE e.slug = 'uji-webinar';
--
-- 3c. Tick baru dan haknya. Harapan: md5 BUKAN d04ae59b…, proacl {postgres=X/postgres}.
--
-- SELECT md5(pg_get_functiondef('public.webinar_notify_tick()'::regprocedure)),
--        (SELECT proacl::text FROM pg_proc WHERE oid = 'public.webinar_notify_tick()'::regprocedure);
--
-- 3d. Tetap tertutup untuk browser. Harapan: false, false.
--
-- SELECT has_column_privilege('anon', 'public.webinar_events', 'source_linked_at', 'SELECT') AS anon,
--        has_column_privilege('authenticated', 'public.webinar_events', 'source_linked_at', 'SELECT') AS authenticated;
--
-- 3e. Cron tetap sehat beberapa menit kemudian. Harapan: status succeeded.
--
-- SELECT status, return_message, start_time FROM cron.job_run_details
--  WHERE jobid = 7 ORDER BY start_time DESC LIMIT 3;


-- ============================================================================
-- ROLLBACK (hanya bila perlu, dan SEBELUM kode baru di-push: kode baru membaca
-- source_linked_at. Bila kode baru sudah tayang, revert kodenya dulu.)
-- Reset data uji di 2.2 TIDAK dikembalikan.
-- ============================================================================
--
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.webinar_notify_tick()
--  RETURNS integer
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'extensions', 'vault'
-- AS $function$
-- DECLARE
--   v_url    text;
--   v_secret text;
--   r        record;
--   n        integer := 0;
-- BEGIN
--   IF NOT pg_try_advisory_xact_lock(hashtext('public.webinar_notify_tick')) THEN
--     RETURN 0;
--   END IF;
--   SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'webinar_notify_url' LIMIT 1;
--   SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_notify_secret' LIMIT 1;
--   IF v_url IS NULL OR v_secret IS NULL THEN
--     RAISE WARNING 'webinar_notify_tick: vault webinar_notify_url/cron_notify_secret belum diset, dilewati';
--     RETURN 0;
--   END IF;
--   UPDATE webinar_orders o
--      SET reminder_sent_for = e.starts_at
--     FROM webinar_events e
--    WHERE e.id = o.event_id
--      AND o.status = 'paid' AND o.kind = 'live'
--      AND e.status = 'published' AND e.offer_kind = 'live'
--      AND e.starts_at - interval '24 hours' <= now() AND e.starts_at - interval '3 hours' > now()
--      AND o.reminder_sent_for IS DISTINCT FROM e.starts_at
--      AND o.paid_at < now() - interval '6 hours'
--      AND o.schedule_email_sent_at > now() - interval '12 hours';
--   FOR r IN
--     SELECT o.id, d.kind, e.starts_at, e.schedule_changed_at
--       FROM webinar_orders o
--       JOIN webinar_events e ON e.id = o.event_id
--       CROSS JOIN LATERAL (
--         SELECT CASE
--           WHEN e.status = 'cancelled' AND e.starts_at > now() - interval '7 days'
--                AND o.cancel_email_sent_at IS NULL
--             THEN 'cancellation'
--           WHEN e.status = 'published' AND e.offer_kind = 'live' AND e.starts_at > now()
--                AND e.schedule_changed_at > now() - interval '7 days'
--                AND o.paid_at < e.schedule_changed_at
--                AND (o.schedule_email_sent_at IS NULL OR o.schedule_email_sent_at < e.schedule_changed_at)
--             THEN 'schedule_change'
--           WHEN e.status = 'published' AND e.offer_kind = 'live'
--                AND e.starts_at - interval '24 hours' <= now() AND e.starts_at - interval '3 hours' > now()
--                AND o.reminder_sent_for IS DISTINCT FROM e.starts_at
--                AND o.paid_at < now() - interval '6 hours'
--             THEN 'reminder_day'
--           WHEN e.status = 'published' AND e.recording_published_at > now() - interval '7 days'
--                AND o.recording_email_sent_at IS NULL
--             THEN 'recording_ready'
--         END AS kind
--       ) d
--      WHERE o.status = 'paid' AND o.kind = 'live' AND d.kind IS NOT NULL
--      ORDER BY CASE d.kind WHEN 'cancellation' THEN 1 WHEN 'schedule_change' THEN 2
--                           WHEN 'reminder_day' THEN 3 ELSE 4 END,
--               o.paid_at, o.id
--      LIMIT 25
--   LOOP
--     PERFORM net.http_post(
--       url := v_url || '?k=' || v_secret,
--       headers := jsonb_build_object('Content-Type', 'application/json'),
--       body := jsonb_build_object('order_id', r.id, 'kind', r.kind),
--       timeout_milliseconds := 10000
--     );
--     UPDATE webinar_orders
--        SET cancel_email_sent_at = CASE WHEN r.kind = 'cancellation' THEN now() ELSE cancel_email_sent_at END,
--            schedule_email_sent_at = CASE WHEN r.kind = 'schedule_change'
--                                          THEN greatest(now(), r.schedule_changed_at) ELSE schedule_email_sent_at END,
--            reminder_sent_for = CASE WHEN r.kind = 'reminder_day' THEN r.starts_at ELSE reminder_sent_for END,
--            recording_email_sent_at = CASE WHEN r.kind = 'recording_ready' THEN now() ELSE recording_email_sent_at END
--      WHERE id = r.id;
--     n := n + 1;
--   END LOOP;
--   RETURN n;
-- END;
-- $function$;
-- REVOKE ALL ON FUNCTION public.webinar_notify_tick() FROM PUBLIC, anon, authenticated, service_role;
-- ALTER TABLE public.webinar_events DROP CONSTRAINT IF EXISTS webinar_events_recording_only_video;
-- ALTER TABLE public.webinar_events DROP CONSTRAINT IF EXISTS webinar_events_source_linked_at;
-- ALTER TABLE public.webinar_events DROP COLUMN IF EXISTS source_linked_at;
-- COMMIT;
