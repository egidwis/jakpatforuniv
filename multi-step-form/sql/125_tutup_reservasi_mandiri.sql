-- ============================================================================
-- sql/125 — TUTUP RESERVASI MANDIRI (saklar admin + cap "jadwal oleh tim")
-- ============================================================================
--
-- Rencana: ~/.claude/plans/cool-aku-aware-dengan-noble-storm.md (22 Okt 2026).
--
-- ── PERILAKU SESUDAH BERKAS INI ─────────────────────────────────────────────
--
--   R1  Tabel "JFU_self_booking_closures": SATU BARIS = SATU MASA TUTUP.
--       closed_on = tanggal WIB saat saklar di Submissions dinyalakan;
--       is_active = saklar. Ditutup ⇔ ada baris aktif. Cermin
--       "JFU_operational_holidays" (sql/122): anon + authenticated membaca
--       EMPAT kolom (closed_on, label, label_en, is_active); tulis hanya
--       service_role lewat /api/admin/self-booking.
--   R2  form_submissions.self_booking_closed_at = CAP "jadwal oleh tim".
--       Diisi SERVER (trigger) saat order jalur otomatis lahir selama
--       reservasi mandiri ditutup, atau saat peneliti mengirim order lewat
--       "Kirim Pesanan" (INSERT `approved`). PERMANEN: walau saklar dibuka
--       lagi, peneliti tidak pernah mengunci tanggal order bercap — tim yang
--       menetapkan tanggal & menerbitkan tagihan. authenticated memegang
--       SELECT tingkat tabel (diperiksa 22 Okt: 43/43 kolom) → tanpa GRANT.
--       Hibah SELECT anon hanya 8 kolom dan sengaja tidak ditambah.
--   R3  trg_01_self_booking ON form_submissions (BEFORE INSERT OR UPDATE),
--       hanya untuk JWT peneliti:
--         INSERT `approved`                      → cap + kolom jadwal kosong
--         INSERT `waiting_payment` saat ditutup  → `approved` + kosong + cap
--                                                  (tab basi / bundle lama)
--         INSERT lain                            → cap dipaksa NULL
--         UPDATE yang mengubah cap               → ditolak
--         UPDATE yang MENGISI start_date baru saat ditutup atau OLD bercap
--                                                → ditolak
--       Mengosongkan tanggal (lepas slot, batal) tetap boleh.
--   R4  trg_01_self_booking ON ad_schedules (BEFORE INSERT): perpanjangan
--       (`source_table = 'form_submissions_extend'`, persis yang ditulis
--       create_ad_schedule) oleh peneliti saat ditutup → ditolak. Sinkron
--       ordinal 1 (`source_table = 'form_submissions'`) tidak tersentuh.
--   Semua penolakan ber-HINT 'self_booking_closed' (dipetakan frontend).
--   Admin tidak terpengaruh: bypass tanpa JWT / service_role /
--   product@jakpat.net (pola sql/122 & sql/124) berjalan lebih dulu.
--
-- ── KENAPA 'trg_01_' ────────────────────────────────────────────────────────
--
--   Trigger BEFORE berjalan urut nama. 'trg_01_' jalan sebelum penilai klaim
--   Kilat, kuota, dan penjaga lain — jadi tanggal sudah dikosongkan sebelum
--   mereka menilainya — tapi SESUDAH 'trg_00_schedule_door' sql/124.
--
-- ── HUBUNGAN DENGAN sql/123 / sql/124 ───────────────────────────────────────
--
--   Independen; boleh diterapkan lebih dulu. Berkas ini TIDAK menyentuh
--   create_ad_schedule (sql/123 menjaga md5-nya f996e8e8… lalu menimpanya),
--   guard_payment_columns, validate_kilat_wave_claim, maupun sync_ad_schedule_*.
--   Sesudah sql/124, fungsi door_* bertindak sebagai peneliti (klaim JWT
--   dipasang), jadi kedua trigger ini tetap menilai — penjaga kedua di
--   belakang /api/schedules/lock.
--
--   Jalur Iklan "Kunci tanggal" (/api/schedules/lock) menulis dengan
--   service_role, jadi trigger ini TIDAK menjaganya — lock.js sendiri yang
--   menolak (cek saklar + cap) sejak Push 2.
--
-- ── URUTAN ──────────────────────────────────────────────────────────────────
--
--   Langkah 1 (pra-cek) → Langkah 2 (migrasi) → Langkah 3 (verifikasi) →
--   Langkah 4 (uji sebagai peneliti, selalu dibatalkan).
--   WAJIB SEBELUM push kode Push 2 (push main = deploy otomatis): kodenya
--   membaca tabel & kolom baru. Aman sebelum kode: tabel kosong = tidak ada
--   yang berubah, dan INSERT `approved` dari peneliti belum pernah ada.
--   Diuji di harness PGlite (16 kasus, termasuk rollback) dengan badan
--   produksi create_ad_schedule & guard_payment_columns, 22 Okt 2026.
--   Jalankan di SQL Editor Supabase. JANGAN lewat MCP.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — PRA-CEK (baca saja). Harapan: satu baris, semua kolom true.
-- ============================================================================
--
-- SELECT
--   to_regclass('public."JFU_self_booking_closures"') IS NULL                AS tabel_belum_ada,
--   NOT EXISTS (SELECT 1 FROM information_schema.columns
--               WHERE table_schema = 'public' AND table_name = 'form_submissions'
--                 AND column_name = 'self_booking_closed_at')                 AS kolom_belum_ada,
--   NOT EXISTS (SELECT 1 FROM pg_proc
--               WHERE proname IN ('self_booking_closed_now', 'guard_self_booking',
--                                 'guard_self_booking_extension'))           AS fungsi_bebas,
--   NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_01_self_booking') AS trigger_bebas,
--   EXISTS (SELECT 1 FROM information_schema.table_privileges
--           WHERE table_schema = 'public' AND table_name = 'form_submissions'
--             AND grantee = 'authenticated' AND privilege_type = 'SELECT')   AS auth_select_tabel;


-- ============================================================================
-- LANGKAH 2 — MIGRASI (satu transaksi)
-- ============================================================================

-- >>> MIGRASI
BEGIN;

-- ── 2.1 (R1) Saklar ─────────────────────────────────────────────────────────
CREATE TABLE public."JFU_self_booking_closures" (
  closed_on  date        PRIMARY KEY,
  label      text        NOT NULL DEFAULT ''
             CONSTRAINT "JFU_self_booking_closures_label_check" CHECK (char_length(label) <= 80),
  label_en   text        NOT NULL DEFAULT ''
             CONSTRAINT "JFU_self_booking_closures_label_en_check" CHECK (char_length(label_en) <= 160),
  is_active  boolean     NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

COMMENT ON TABLE public."JFU_self_booking_closures" IS
  'sql/125. Saklar "Tutup reservasi mandiri" di Submissions. Satu baris = satu masa tutup; '
  'ditutup <=> ada baris is_active. Tulis hanya service_role lewat /api/admin/self-booking.';
COMMENT ON COLUMN public."JFU_self_booking_closures".closed_on IS
  'Tanggal WIB saat saklar dinyalakan.';
COMMENT ON COLUMN public."JFU_self_booking_closures".label_en IS
  'Terjemahan otomatis label (≤160), ditulis /api/admin/self-booking. '''' = belum/gagal.';

ALTER TABLE public."JFU_self_booking_closures" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."JFU_self_booking_closures" FROM PUBLIC, anon, authenticated;
GRANT SELECT (closed_on, label, label_en, is_active)
  ON public."JFU_self_booking_closures" TO anon, authenticated;
GRANT ALL ON TABLE public."JFU_self_booking_closures" TO service_role;
CREATE POLICY "Siapa pun boleh membaca status reservasi mandiri"
  ON public."JFU_self_booking_closures" FOR SELECT TO anon, authenticated USING (true);

-- ── 2.2 (R2) Cap per order ──────────────────────────────────────────────────
ALTER TABLE public.form_submissions ADD COLUMN self_booking_closed_at timestamptz;

COMMENT ON COLUMN public.form_submissions.self_booking_closed_at IS
  'sql/125. Cap "jadwal oleh tim": order jalur otomatis yang lahir selama reservasi mandiri '
  'ditutup. Tim yang menetapkan tanggal & menerbitkan tagihan, permanen. Ditulis trigger '
  'trg_01_self_booking; peneliti tidak bisa mengubahnya. NULL = aturan biasa.';

CREATE FUNCTION public.self_booking_closed_now()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM "JFU_self_booking_closures" WHERE is_active)
$function$;

-- ⚠️ pg_default_acl memberi anon DAN authenticated EXECUTE pada setiap fungsi
-- baru di public; REVOKE FROM PUBLIC saja tidak mencabutnya.
REVOKE ALL ON FUNCTION public.self_booking_closed_now() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_booking_closed_now() TO service_role;

-- ── 2.3 (R3) Penjaga order ──────────────────────────────────────────────────
CREATE FUNCTION public.guard_self_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
BEGIN
  -- Dipercaya, persis sql/122 & sql/124: tanpa JWT (SQL Editor, cron,
  -- migrasi), service_role (lock.js, create-payment, webhook), admin, dan
  -- tulisan bersarang dari trigger lain.
  IF claims IS NULL
     OR coalesce(claims ->> 'role', '')  = 'service_role'
     OR coalesce(claims ->> 'email', '') = 'product@jakpat.net'
     OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- `approved` dari peneliti HANYA lahir dari "Kirim Pesanan" saat ditutup
    -- (jalur otomatis biasa menulis `waiting_payment`, jalur manual
    -- `in_review`) — jadi selalu dicap, termasuk bila saklar baru saja dibuka
    -- di antara layar dan INSERT: janji di modal peneliti tetap benar.
    IF NEW.submission_status = 'approved'
       OR (NEW.submission_status = 'waiting_payment' AND self_booking_closed_now()) THEN
      NEW.submission_status      := 'approved';
      NEW.start_date             := NULL;
      NEW.end_date               := NULL;
      NEW.slot_booked_by         := NULL;
      NEW.slot_reserved_at       := NULL;
      NEW.kilat_slot_hour        := NULL;
      NEW.airing_hour_wib        := NULL;
      NEW.airing_minute_wib      := NULL;
      NEW.self_booking_closed_at := now();
    ELSE
      NEW.self_booking_closed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.self_booking_closed_at IS DISTINCT FROM OLD.self_booking_closed_at THEN
    RAISE EXCEPTION 'Penanda "jadwal oleh tim" hanya bisa diubah tim Jakpat.'
      USING HINT = 'self_booking_closed';
  END IF;

  IF NEW.start_date IS NOT NULL
     AND NEW.start_date IS DISTINCT FROM OLD.start_date
     AND (OLD.self_booking_closed_at IS NOT NULL OR self_booking_closed_now()) THEN
    RAISE EXCEPTION 'Reservasi mandiri sedang ditutup — tim Jakpat yang menetapkan jadwal order ini.'
      USING HINT = 'self_booking_closed';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_self_booking() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_01_self_booking
  BEFORE INSERT OR UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_self_booking();

-- ── 2.4 (R4) Penjaga perpanjangan ───────────────────────────────────────────
CREATE FUNCTION public.guard_self_booking_extension()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
BEGIN
  IF claims IS NULL
     OR coalesce(claims ->> 'role', '')  = 'service_role'
     OR coalesce(claims ->> 'email', '') = 'product@jakpat.net'
     OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.source_table = 'form_submissions_extend' AND self_booking_closed_now() THEN
    RAISE EXCEPTION 'Reservasi mandiri sedang ditutup — perpanjangan jadwal dibantu tim Jakpat.'
      USING HINT = 'self_booking_closed';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_self_booking_extension() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_01_self_booking
  BEFORE INSERT ON public.ad_schedules
  FOR EACH ROW EXECUTE FUNCTION public.guard_self_booking_extension();

NOTIFY pgrst, 'reload schema';

COMMIT;
-- <<< MIGRASI


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. Hak. Harapan: semua kolom false.
--
-- SELECT
--   has_function_privilege('anon', 'public.self_booking_closed_now()', 'EXECUTE')                AS now_anon,
--   has_function_privilege('authenticated', 'public.self_booking_closed_now()', 'EXECUTE')       AS now_auth,
--   has_function_privilege('authenticated', 'public.guard_self_booking()', 'EXECUTE')            AS guard_auth,
--   has_function_privilege('authenticated', 'public.guard_self_booking_extension()', 'EXECUTE')  AS ext_auth,
--   has_table_privilege('authenticated', 'public."JFU_self_booking_closures"', 'INSERT')         AS tulis_auth,
--   has_column_privilege('anon', 'public."JFU_self_booking_closures"', 'updated_by', 'SELECT')   AS updated_by_anon;
--
-- 3b. Dibaca klien. Harapan: semua true.
--
-- SELECT
--   has_column_privilege('anon', 'public."JFU_self_booking_closures"', 'is_active', 'SELECT')        AS saklar_anon,
--   has_column_privilege('authenticated', 'public.form_submissions', 'self_booking_closed_at', 'SELECT') AS cap_auth;
--
-- 3c. Trigger & isi. Harapan: 2 baris trigger; 0 baris saklar; 0 order bercap.
--
-- SELECT tgrelid::regclass, tgname FROM pg_trigger WHERE tgname = 'trg_01_self_booking';
-- SELECT count(*) AS saklar FROM "JFU_self_booking_closures";
-- SELECT count(*) AS bercap FROM form_submissions WHERE self_booking_closed_at IS NOT NULL;


-- ============================================================================
-- LANGKAH 4 — UJI SEBAGAI PENELITI. Selalu dibatalkan.
-- ============================================================================
--
-- Peneliti = pemilik order belum lunas yang PALING BARU (dibaca, tidak
-- diubah). Saklar dinyalakan DI DALAM transaksi ini saja (sesi lain tidak
-- melihatnya). Semua tulisan dibatalkan oleh EXCEPTION di akhir.
--
-- Harapan: "UJI_LULUS — 5 kasus" (atau 4 + catatan bila sql/124 sudah
-- mencabut create_ad_schedule dari authenticated).
--
-- BEGIN;
-- DO $uji$
-- DECLARE
--   r      record;
--   v_new  record;
--   v_err  text;
--   v_hint text;
--   v_n    int := 0;
-- BEGIN
--   SELECT fs.id, fs.auth_user_id, fs.email INTO r
--   FROM form_submissions fs
--   WHERE fs.auth_user_id IS NOT NULL
--     AND COALESCE(fs.payment_status, '') NOT IN ('paid', 'completed')
--     AND fs.submission_status NOT IN ('scheduled', 'live', 'completed', 'paid')
--   ORDER BY fs.created_at DESC LIMIT 1;
--   IF r.id IS NULL THEN RAISE EXCEPTION 'UJI_GAGAL setup: tidak ada order belum lunas'; END IF;
--
--   INSERT INTO "JFU_self_booking_closures" (closed_on, label, is_active, updated_by)
--   VALUES ((now() AT TIME ZONE 'Asia/Jakarta')::date, 'UJI sql/125', true, 'uji');
--
--   PERFORM set_config('request.jwt.claims', json_build_object(
--     'sub', r.auth_user_id, 'email', r.email, 'role', 'authenticated')::text, true);
--   SET LOCAL ROLE authenticated;
--
--   -- 1. INSERT otomatis bertanggal saat ditutup → approved, tanpa tanggal, bercap.
--   INSERT INTO form_submissions (auth_user_id, email, title, start_date, end_date,
--                                 slot_booked_by, slot_reserved_at, submission_status, payment_status)
--   VALUES (r.auth_user_id, r.email, 'UJI sql/125', current_date + 30, current_date + 31,
--           'user', now(), 'waiting_payment', 'pending')
--   RETURNING id, submission_status, start_date, slot_booked_by, self_booking_closed_at INTO v_new;
--   IF v_new.submission_status <> 'approved' OR v_new.start_date IS NOT NULL
--      OR v_new.slot_booked_by IS NOT NULL OR v_new.self_booking_closed_at IS NULL THEN
--     RAISE EXCEPTION 'UJI_GAGAL 1: %', row_to_json(v_new);
--   END IF;
--   v_n := v_n + 1;
--
--   -- 2. Peneliti melepas cap → ditolak.
--   BEGIN
--     UPDATE form_submissions SET self_booking_closed_at = NULL WHERE id = v_new.id;
--     RAISE EXCEPTION 'UJI_GAGAL 2: cap bisa dilepas peneliti';
--   EXCEPTION WHEN OTHERS THEN
--     GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
--     IF v_hint IS DISTINCT FROM 'self_booking_closed' THEN RAISE EXCEPTION 'UJI_GAGAL 2: %', v_err; END IF;
--     v_n := v_n + 1;
--   END;
--
--   -- 3. Peneliti mengisi tanggal pada order bercap → ditolak.
--   BEGIN
--     UPDATE form_submissions SET start_date = current_date + 30 WHERE id = v_new.id;
--     RAISE EXCEPTION 'UJI_GAGAL 3: tanggal order bercap bisa diisi peneliti';
--   EXCEPTION WHEN OTHERS THEN
--     GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
--     IF v_hint IS DISTINCT FROM 'self_booking_closed' THEN RAISE EXCEPTION 'UJI_GAGAL 3: %', v_err; END IF;
--     v_n := v_n + 1;
--   END;
--
--   -- 4. Tulisan non-jadwal tetap lolos.
--   UPDATE form_submissions SET title = title WHERE id = v_new.id;
--   IF NOT FOUND THEN RAISE EXCEPTION 'UJI_GAGAL 4: tulisan non-jadwal pemilik ditolak'; END IF;
--   v_n := v_n + 1;
--
--   -- 5. Perpanjangan saat ditutup → ditolak (sesudah sql/124: tak punya hak, juga aman).
--   BEGIN
--     PERFORM public.create_ad_schedule(v_new.id, now() + interval '60 days', now() + interval '61 days', 1);
--     RAISE EXCEPTION 'UJI_GAGAL 5: perpanjangan lolos saat ditutup';
--   EXCEPTION
--     WHEN insufficient_privilege THEN
--       RAISE NOTICE 'Kasus 5: create_ad_schedule sudah dicabut sql/124 — penjaga pintu yang menolak.';
--     WHEN OTHERS THEN
--       GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
--       IF v_hint IS DISTINCT FROM 'self_booking_closed' THEN RAISE EXCEPTION 'UJI_GAGAL 5: %', v_err; END IF;
--       v_n := v_n + 1;
--   END;
--
--   RAISE EXCEPTION 'UJI_LULUS — % kasus', v_n;
-- END
-- $uji$;
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK MIGRASI — hanya bila perlu.
-- ============================================================================
--
-- Aman kapan pun SESUDAH kode Push 2 dicabut (kode itu membaca tabel & kolom
-- ini; tanpa keduanya kueri dashboard peneliti gagal). Cap yang sudah
-- tertulis ikut hilang bersama kolomnya — catat dulu order bercap yang belum
-- dijadwalkan:
--   SELECT id, title, created_at FROM form_submissions
--   WHERE self_booking_closed_at IS NOT NULL AND start_date IS NULL;
--
-- >>> ROLLBACK
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_01_self_booking ON public.ad_schedules;
-- DROP TRIGGER IF EXISTS trg_01_self_booking ON public.form_submissions;
-- DROP FUNCTION IF EXISTS public.guard_self_booking_extension();
-- DROP FUNCTION IF EXISTS public.guard_self_booking();
-- DROP FUNCTION IF EXISTS public.self_booking_closed_now();
-- ALTER TABLE public.form_submissions DROP COLUMN IF EXISTS self_booking_closed_at;
-- DROP TABLE IF EXISTS public."JFU_self_booking_closures";
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
-- <<< ROLLBACK
