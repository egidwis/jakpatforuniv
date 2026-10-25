-- ============================================================================
-- sql/124 — SATU PINTU JADWAL, BAGIAN 2: MENUTUP (contract)
-- ============================================================================
--
-- Pasangan sql/123. ⚠️ JALANKAN HANYA SESUDAH PUSH A LIVE DI PRODUKSI.
-- Kode `main` sebelum Push A masih menulis jadwal langsung dari browser
-- (INSERT bertanggal di wizard, PATCH Kilat, rpc create_ad_schedule,
-- releaseExpiredSlot, cancelSchedule). Menjalankan ini lebih dulu = wizard
-- jalur otomatis, "Jadwalkan lagi", lepas & batal MATI untuk peneliti.
--
-- ── PERILAKU SESUDAH BERKAS INI ─────────────────────────────────────────────
--
--   T1  guard_schedule_door() — trigger BARU, BEFORE, nama `trg_00_…` supaya
--       menyala PERTAMA (BEFORE trigger berurutan menurut nama) dan menilai
--       NEW persis seperti yang dikirim pemanggil:
--         form_submissions INSERT: start_date, end_date, kilat_slot_hour,
--           airing_hour_wib, airing_minute_wib, slot_booked_by,
--           slot_reserved_at WAJIB NULL;
--         form_submissions UPDATE: kolom-kolom itu + distribution_type TIDAK
--           boleh berubah;
--         ad_schedules UPDATE: start_date, end_date, kilat_slot_hour,
--           slot_booked_by, slot_reserved_at, duration TIDAK boleh berubah.
--       Lolos tanpa syarat:
--         • tanpa JWT (pg_cron — keempat job jalan sebagai postgres —,
--           SQL Editor, migrasi);
--         • service_role (seluruh Pages Function, webhook DOKU);
--         • admin product@jakpat.net (sama dengan penjaga egidwis);
--         • penanda `jfu.schedule_door = 'on'` — HANYA dipasang
--           _schedule_door_act_as (sql/123), yang tak bisa dipanggil peran
--           mana pun selain postgres;
--         • pg_trigger_depth() > 1 — tulisan turunan trigger. Satu-satunya
--           trigger yang menulis tabel jadwal adalah
--           sync_ad_schedule_from_submission (dicek 21 Okt), dan pemicunya
--           (UPDATE form_submissions) sudah dinilai di kedalaman 1. Ini juga
--           menghindari jebakan upsert BEFORE INSERT sinkron.
--       Galat: HINT `schedule_door_only`.
--
--   T2  Policy:
--         ad_schedules — DROP "Peneliti melepas reservasinya sendiri" (diganti
--           door_cancel_schedule) dan "Peneliti memesan ulang jadwal yang
--           sudah dilepas" (nol pemakai di kode).
--         survey_pages — "Owners manage own survey pages" (ALL) diganti
--           "Owners read own survey pages" (SELECT, USING sama). Tutup celah
--           21 Okt: pemilik order BELUM BAYAR bisa menerbitkan halamannya ke
--           feed aplikasi (terbukti PGlite). Tidak ada jalur browser peneliti
--           yang sah menulis survey_pages. ⚠️ egidwis sengaja mempertahankan
--           policy ini di sql/116 — sudah dikabari sebelum berkas ini.
--
--   T3  REVOKE EXECUTE:
--         create_ad_schedule dari PUBLIC, authenticated (service_role tetap:
--           /api/admin/schedule; door_create_extension memanggilnya sebagai
--           pemilik);
--         set_survey_pages_order, cron_activate_extends,
--           resync_ad_schedule_ordinals dari PUBLIC, anon, authenticated
--           (ketiganya bisa dipanggil ANON sampai hari ini).
--
--   T4  REVOKE INSERT, UPDATE, DELETE, TRUNCATE dari anon di form_submissions,
--       ad_schedules, survey_pages (lapis tambahan — nol policy tulis anon;
--       TRUNCATE tak terjangkau PostgREST tapi juga tak tunduk RLS).
--
-- ── URUTAN ──────────────────────────────────────────────────────────────────
--
--   Push A live → smoke test → Langkah 1 → 2 → 3 → 4 → uji bypass konsol.
--   Jalankan di SQL Editor Supabase. JANGAN lewat MCP.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — PRA-CEK (baca saja)
-- ============================================================================
--
-- 1a. sql/123 sudah hidup dan tidak berubah. Harapan: enam baris sama = true.
--
-- SELECT p.proname,
--        md5(pg_get_functiondef(p.oid)) = CASE p.proname
--          WHEN 'create_ad_schedule'    THEN 'c728873e09789a886ce2c32e54a1d2ac'
--          WHEN 'door_lock_kilat_wave'  THEN '0d6a7dac2d575d925ed09d72d18e668b'
--          WHEN 'door_create_extension' THEN '73aa31ba8c50341e0053e567b205ee72'
--          WHEN 'door_release_slot'     THEN '2c2d12610cebb31eb0a4cfae4f101bad'
--          WHEN 'door_cancel_schedule'  THEN '5e1bdd56edc0d3e5b564dd3ace10254e'
--          WHEN '_schedule_door_act_as' THEN 'f99aa498654c2f62080ca67246484f29'
--        END AS sama
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('create_ad_schedule', 'door_lock_kilat_wave', 'door_create_extension',
--                     'door_release_slot', 'door_cancel_schedule', '_schedule_door_act_as')
-- ORDER BY 1;
--
-- 1b. Yang akan dicabut masih ada, yang baru belum. Harapan: policy_lama = 3,
--     baru = 0.
--
-- SELECT
--   (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND (
--      (tablename = 'ad_schedules' AND policyname IN
--         ('Peneliti melepas reservasinya sendiri', 'Peneliti memesan ulang jadwal yang sudah dilepas'))
--      OR (tablename = 'survey_pages' AND policyname = 'Owners manage own survey pages'))) AS policy_lama,
--   (SELECT count(*) FROM pg_proc WHERE proname = 'guard_schedule_door')
--   + (SELECT count(*) FROM pg_policies WHERE policyname = 'Owners read own survey pages') AS baru;
--
-- 1c. Push A benar-benar live: order jalur otomatis TERAKHIR lahir tanpa
--     tanggal lalu dikunci (slot_reserved_at > created_at). Harapan: baris
--     teratas dibuat SESUDAH jam deploy Push A dan `dua_langkah = true`.
--     Kalau belum ada order baru sejak deploy, lewati — smoke test Langkah 9
--     rencana sudah mengujinya.
--
-- SELECT id, created_at, slot_reserved_at, slot_reserved_at > created_at AS dua_langkah
-- FROM form_submissions
-- WHERE slot_booked_by = 'user' AND slot_reserved_at IS NOT NULL
-- ORDER BY created_at DESC LIMIT 3;


-- ============================================================================
-- LANGKAH 2 — MIGRASI (satu transaksi)
-- ============================================================================

BEGIN;

-- ── 2.1 (T1) Penjaga pintu jadwal ──────────────────────────────────────────
CREATE FUNCTION public.guard_schedule_door()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  claims  jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_moved boolean;
BEGIN
  IF claims IS NULL
     OR coalesce(claims ->> 'role', '')  = 'service_role'
     OR coalesce(claims ->> 'email', '') = 'product@jakpat.net'
     OR coalesce(current_setting('jfu.schedule_door', true), '') = 'on'
     OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- ⚠️ Nama kolom plpgsql baru diperiksa saat BARIS INI BERJALAN, bukan saat
  -- CREATE. Setiap cabang hanya menyebut kolom tabelnya sendiri.
  IF TG_TABLE_NAME = 'form_submissions' AND TG_OP = 'INSERT' THEN
    v_moved := NEW.start_date IS NOT NULL
            OR NEW.end_date IS NOT NULL
            OR NEW.kilat_slot_hour IS NOT NULL
            OR NEW.airing_hour_wib IS NOT NULL
            OR NEW.airing_minute_wib IS NOT NULL
            OR NEW.slot_booked_by IS NOT NULL
            OR NEW.slot_reserved_at IS NOT NULL;
  ELSIF TG_TABLE_NAME = 'form_submissions' THEN
    v_moved := NEW.start_date        IS DISTINCT FROM OLD.start_date
            OR NEW.end_date          IS DISTINCT FROM OLD.end_date
            OR NEW.kilat_slot_hour   IS DISTINCT FROM OLD.kilat_slot_hour
            OR NEW.airing_hour_wib   IS DISTINCT FROM OLD.airing_hour_wib
            OR NEW.airing_minute_wib IS DISTINCT FROM OLD.airing_minute_wib
            OR NEW.slot_booked_by    IS DISTINCT FROM OLD.slot_booked_by
            OR NEW.slot_reserved_at  IS DISTINCT FROM OLD.slot_reserved_at
            OR NEW.distribution_type IS DISTINCT FROM OLD.distribution_type;
  ELSE
    v_moved := NEW.start_date       IS DISTINCT FROM OLD.start_date
            OR NEW.end_date         IS DISTINCT FROM OLD.end_date
            OR NEW.kilat_slot_hour  IS DISTINCT FROM OLD.kilat_slot_hour
            OR NEW.slot_booked_by   IS DISTINCT FROM OLD.slot_booked_by
            OR NEW.slot_reserved_at IS DISTINCT FROM OLD.slot_reserved_at
            OR NEW.duration         IS DISTINCT FROM OLD.duration;
  END IF;

  IF v_moved THEN
    RAISE EXCEPTION 'Jadwal hanya bisa diubah lewat halaman Jadwal & Bayar. Muat ulang halaman lalu ulangi.'
      USING HINT = 'schedule_door_only';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_schedule_door() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_00_schedule_door
  BEFORE INSERT OR UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_schedule_door();

CREATE TRIGGER trg_00_schedule_door
  BEFORE UPDATE ON public.ad_schedules
  FOR EACH ROW EXECUTE FUNCTION public.guard_schedule_door();

-- ── 2.2 (T2) Policy ────────────────────────────────────────────────────────
DROP POLICY "Peneliti melepas reservasinya sendiri" ON public.ad_schedules;
DROP POLICY "Peneliti memesan ulang jadwal yang sudah dilepas" ON public.ad_schedules;

DROP POLICY "Owners manage own survey pages" ON public.survey_pages;
CREATE POLICY "Owners read own survey pages" ON public.survey_pages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM form_submissions fs
    WHERE fs.id = survey_pages.submission_id
      AND (fs.auth_user_id = auth.uid()
           OR (fs.auth_user_id IS NULL AND fs.email = (auth.jwt() ->> 'email')))));

-- ── 2.3 (T3) Hak eksekusi ──────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_ad_schedule(uuid, timestamptz, timestamptz, integer, integer, integer, integer, boolean, text, text, integer, text, boolean, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_survey_pages_order(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_activate_extends() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resync_ad_schedule_ordinals(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2.4 (T4) Anon tidak menulis tabel jadwal ───────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.form_submissions, public.ad_schedules, public.survey_pages FROM anon;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. Hak. Harapan: semua kolom false.
--
-- SELECT
--   has_function_privilege('authenticated', 'public.create_ad_schedule(uuid, timestamptz, timestamptz, integer, integer, integer, integer, boolean, text, text, integer, text, boolean, text, text, timestamptz)', 'EXECUTE') AS cas_auth,
--   has_function_privilege('anon', 'public.cron_activate_extends()', 'EXECUTE')               AS cron_anon,
--   has_function_privilege('authenticated', 'public.cron_activate_extends()', 'EXECUTE')      AS cron_auth,
--   has_function_privilege('anon', 'public.resync_ad_schedule_ordinals(uuid)', 'EXECUTE')     AS resync_anon,
--   has_function_privilege('authenticated', 'public.set_survey_pages_order(uuid[])', 'EXECUTE') AS order_auth,
--   has_table_privilege('anon', 'public.form_submissions', 'UPDATE')                          AS fs_anon,
--   has_table_privilege('anon', 'public.survey_pages', 'INSERT')                              AS sp_anon;
--
-- 3b. service_role tetap bisa. Harapan: semua true.
--
-- SELECT
--   has_function_privilege('service_role', 'public.create_ad_schedule(uuid, timestamptz, timestamptz, integer, integer, integer, integer, boolean, text, text, integer, text, boolean, text, text, timestamptz)', 'EXECUTE') AS cas,
--   has_function_privilege('service_role', 'public.set_survey_pages_order(uuid[])', 'EXECUTE') AS urutan,
--   has_function_privilege('service_role', 'public.door_lock_kilat_wave(uuid, text, uuid, date, smallint)', 'EXECUTE') AS pintu;
--
-- 3c. Trigger & policy. Harapan: 2 trigger; survey_pages tanpa policy ALL
--     pemilik; ad_schedules tanpa dua policy peneliti.
--
-- SELECT tgrelid::regclass, tgname FROM pg_trigger WHERE tgname = 'trg_00_schedule_door';
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('ad_schedules', 'survey_pages') ORDER BY 1, 2;


-- ============================================================================
-- LANGKAH 4 — UJI SEBAGAI PENELITI. Selalu dibatalkan.
-- ============================================================================
--
-- Peneliti = pemilik order belum lunas yang PALING BARU (dibaca, tidak
-- diubah). Semua tulisan dibatalkan oleh EXCEPTION di akhir.
--
-- Harapan: "UJI_LULUS — 7 kasus".
--
-- BEGIN;
-- DO $uji$
-- DECLARE
--   r      record;
--   v_err  text;
--   v_hint text;
--   v_n    int := 0;
--   v_rows int;
-- BEGIN
--   SELECT fs.id, fs.auth_user_id, fs.email INTO r
--   FROM form_submissions fs
--   WHERE fs.auth_user_id IS NOT NULL
--     AND COALESCE(fs.payment_status, '') NOT IN ('paid', 'completed')
--     AND fs.submission_status NOT IN ('scheduled', 'live', 'completed', 'paid')
--   ORDER BY fs.created_at DESC LIMIT 1;
--   IF r.id IS NULL THEN RAISE EXCEPTION 'UJI_GAGAL setup: tidak ada order belum lunas'; END IF;
--
--   PERFORM set_config('request.jwt.claims', json_build_object(
--     'sub', r.auth_user_id, 'email', r.email, 'role', 'authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--
--   -- 1. PATCH tanggal → ditolak pintu.
--   BEGIN
--     UPDATE form_submissions SET start_date = current_date + 30, end_date = current_date + 31 WHERE id = r.id;
--     RAISE EXCEPTION 'UJI_GAGAL 1: PATCH tanggal lolos';
--   EXCEPTION WHEN OTHERS THEN
--     GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
--     IF v_hint IS DISTINCT FROM 'schedule_door_only' THEN RAISE EXCEPTION 'UJI_GAGAL 1: %', v_err; END IF;
--     v_n := v_n + 1;
--   END;
--
--   -- 2. Lepas slot langsung → ditolak pintu.
--   BEGIN
--     UPDATE form_submissions SET slot_booked_by = NULL, slot_reserved_at = NULL WHERE id = r.id AND slot_booked_by IS NOT NULL;
--     GET DIAGNOSTICS v_rows = ROW_COUNT;
--     IF v_rows > 0 THEN RAISE EXCEPTION 'UJI_GAGAL 2: lepas slot langsung lolos'; END IF;
--     v_n := v_n + 1;  -- order tanpa slot: nol baris, sama-sama aman
--   EXCEPTION WHEN OTHERS THEN
--     GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
--     IF v_hint IS DISTINCT FROM 'schedule_door_only' THEN RAISE EXCEPTION 'UJI_GAGAL 2: %', v_err; END IF;
--     v_n := v_n + 1;
--   END;
--
--   -- 3. Tulisan non-jadwal tetap lolos (judul tidak diubah nilainya).
--   UPDATE form_submissions SET title = title WHERE id = r.id;
--   GET DIAGNOSTICS v_rows = ROW_COUNT;
--   IF v_rows <> 1 THEN RAISE EXCEPTION 'UJI_GAGAL 3: tulisan non-jadwal pemilik % baris', v_rows; END IF;
--   v_n := v_n + 1;
--
--   -- 4. ad_schedules: nol baris (dua policy peneliti dicabut).
--   UPDATE ad_schedules SET admin_notes = admin_notes WHERE submission_id = r.id;
--   GET DIAGNOSTICS v_rows = ROW_COUNT;
--   IF v_rows <> 0 THEN RAISE EXCEPTION 'UJI_GAGAL 4: peneliti masih menulis ad_schedules (% baris)', v_rows; END IF;
--   v_n := v_n + 1;
--
--   -- 5. survey_pages: nol baris.
--   UPDATE survey_pages SET is_published = is_published WHERE submission_id = r.id;
--   GET DIAGNOSTICS v_rows = ROW_COUNT;
--   IF v_rows <> 0 THEN RAISE EXCEPTION 'UJI_GAGAL 5: peneliti masih menulis survey_pages (% baris)', v_rows; END IF;
--   v_n := v_n + 1;
--
--   -- 6. rpc create_ad_schedule → permission denied.
--   BEGIN
--     PERFORM public.create_ad_schedule(r.id, now() + interval '30 days', now() + interval '31 days', 1);
--     RAISE EXCEPTION 'UJI_GAGAL 6: create_ad_schedule masih bisa dipanggil';
--   EXCEPTION WHEN insufficient_privilege THEN
--     v_n := v_n + 1;
--   END;
--
--   -- 7. INSERT bertanggal → ditolak pintu.
--   BEGIN
--     INSERT INTO form_submissions (auth_user_id, email, title, start_date, end_date, submission_status, payment_status)
--     VALUES (r.auth_user_id, r.email, 'UJI sql/124', current_date + 30, current_date + 31, 'waiting_payment', 'pending');
--     RAISE EXCEPTION 'UJI_GAGAL 7: INSERT bertanggal lolos';
--   EXCEPTION WHEN OTHERS THEN
--     GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
--     IF v_hint IS DISTINCT FROM 'schedule_door_only' THEN RAISE EXCEPTION 'UJI_GAGAL 7: %', v_err; END IF;
--     v_n := v_n + 1;
--   END;
--
--   RAISE EXCEPTION 'UJI_LULUS — % kasus', v_n;
-- END
-- $uji$;
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK MIGRASI — hanya bila perlu. Mengembalikan keadaan 21 Okt 2026.
-- ============================================================================
--
-- Aman dijalankan kapan pun: kode Push A tetap bekerja tanpa berkas ini
-- (pintu sql/123 tidak bergantung padanya), hanya jalan memutarnya terbuka
-- lagi. ACL dikembalikan PERSIS seperti dibaca 21 Okt (termasuk anon=X pada
-- tiga fungsi — warisan, bukan pilihan).
--
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_00_schedule_door ON public.form_submissions;
-- DROP TRIGGER IF EXISTS trg_00_schedule_door ON public.ad_schedules;
-- DROP FUNCTION IF EXISTS public.guard_schedule_door();
--
-- CREATE POLICY "Peneliti melepas reservasinya sendiri" ON public.ad_schedules
--   FOR UPDATE TO authenticated
--   USING ((slot_booked_by = 'user') AND (COALESCE(payment_status, '') <> ALL (ARRAY['paid', 'completed']))
--     AND (submission_id IN (SELECT form_submissions.id FROM form_submissions
--       WHERE ((form_submissions.auth_user_id = auth.uid())
--          OR ((form_submissions.auth_user_id IS NULL) AND (form_submissions.email = (auth.jwt() ->> 'email')))))))
--   WITH CHECK ((COALESCE(payment_status, '') <> ALL (ARRAY['paid', 'completed']))
--     AND (submission_id IN (SELECT form_submissions.id FROM form_submissions
--       WHERE ((form_submissions.auth_user_id = auth.uid())
--          OR ((form_submissions.auth_user_id IS NULL) AND (form_submissions.email = (auth.jwt() ->> 'email')))))));
--
-- CREATE POLICY "Peneliti memesan ulang jadwal yang sudah dilepas" ON public.ad_schedules
--   FOR UPDATE TO public
--   USING ((source_table = 'form_submissions_extend') AND (slot_booked_by IS NULL)
--     AND (COALESCE(payment_status, '') <> ALL (ARRAY['paid', 'completed']))
--     AND (submission_id IN (SELECT fs.id FROM form_submissions fs
--       WHERE ((fs.auth_user_id = auth.uid()) OR ((fs.auth_user_id IS NULL) AND (fs.email = (auth.jwt() ->> 'email')))))))
--   WITH CHECK ((source_table = 'form_submissions_extend') AND (slot_booked_by = 'user') AND (slot_reserved_at IS NOT NULL)
--     AND (COALESCE(payment_status, '') <> ALL (ARRAY['paid', 'completed']))
--     AND (submission_id IN (SELECT fs.id FROM form_submissions fs
--       WHERE ((fs.auth_user_id = auth.uid()) OR ((fs.auth_user_id IS NULL) AND (fs.email = (auth.jwt() ->> 'email')))))));
--
-- DROP POLICY IF EXISTS "Owners read own survey pages" ON public.survey_pages;
-- CREATE POLICY "Owners manage own survey pages" ON public.survey_pages
--   FOR ALL TO authenticated
--   USING (EXISTS (SELECT 1 FROM form_submissions fs
--     WHERE ((fs.id = survey_pages.submission_id) AND ((fs.auth_user_id = auth.uid())
--       OR ((fs.auth_user_id IS NULL) AND (fs.email = (auth.jwt() ->> 'email')))))))
--   WITH CHECK (EXISTS (SELECT 1 FROM form_submissions fs
--     WHERE ((fs.id = survey_pages.submission_id) AND ((fs.auth_user_id = auth.uid())
--       OR ((fs.auth_user_id IS NULL) AND (fs.email = (auth.jwt() ->> 'email')))))));
--
-- GRANT EXECUTE ON FUNCTION public.create_ad_schedule(uuid, timestamptz, timestamptz, integer, integer, integer, integer, boolean, text, text, integer, text, boolean, text, text, timestamptz) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.set_survey_pages_order(uuid[]) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.cron_activate_extends() TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.resync_ad_schedule_ordinals(uuid) TO anon, authenticated;
-- GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.form_submissions, public.ad_schedules, public.survey_pages TO anon;
--
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
