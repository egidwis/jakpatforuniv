-- ============================================================================
-- sql/118 — UNDIAN & HALAMAN BUTA JENIS + KOLOM SIARAN KILAT (Phase 5, rilis R4)
-- ============================================================================
--
-- Rencana: docs/superpowers/plans/2026-10-14-phase-5-kilat-swalayan.md §5.3
-- dan §5.4b (kolom siaran, trigger reset, backfill). Prasyarat: sql/117 sudah
-- diterapkan (diverifikasi 15 Okt 2026).
--
-- ── PERILAKU SESUDAH BERKAS INI ─────────────────────────────────────────────
--
--   U1  Kolom siaran per jadwal di ad_schedules: broadcast_at/_by (toggle
--       nyala) dan broadcast_ended_at/_ended_by (toggle mati). Per JADWAL,
--       bukan per order, supaya gelombang perpanjangan (R8) ikut otomatis.
--   U2  SATU rumus jendela tayang untuk semua jadwal, tanpa cabang
--       distribution_type:
--         mulai   = airing_window_start(start, broadcast_at)
--                 = COALESCE(broadcast_at, start)
--         selesai = airing_window_end(start, end, broadcast_at, broadcast_ended_at)
--                 = end                                  bila belum disiarkan
--                 = LEAST(broadcast_at + (end − start),  bila sudah
--                         broadcast_ended_at)
--       Iklan tidak pernah punya kolom siaran → jendelanya tidak berubah.
--       Kilat: toggle tak pernah disentuh → jendela gelombang; nyala → 24 jam
--       sejak nyala; mati → selesai di detik itu. Tanpa cron: "otomatis
--       selesai 24 jam" adalah akibat rumus, bukan tulisan.
--   U3  get_batch_rewards_bulk (/api/respondents): kaki ordinal 1 mengambil
--       jendela dari CERMIN ad_schedules (bukan 15.00 terpatok dari
--       form_submissions), kedua kaki memakai rumus U2. Siapa yang ikut,
--       status, hadiah, winner_count, period_batch, bentuk keluaran dan arti
--       can_select_winners TIDAK berubah — hanya nilai start_date/end_date
--       batch Kilat lama (→ jam gelombangnya) dan Iklan berjam kustom
--       (→ jam kustomnya). Daftar persisnya: Langkah 1d dan 3c.
--   U4  compute_extend_period_batch: bulan WIB (end_date AT TIME ZONE
--       'Asia/Jakarta'), identik secara definisi dengan kaki ordinal 1
--       (TO_CHAR atas DATE WIB). Dry-run 15 Okt: 0 dari 39 baris berubah.
--   U5  ensure_survey_page: halaman Kilat BARU lahir dengan jendela U2
--       (sementara [gelombang, +24 jam)), bukan publish_end_date NULL.
--       17 halaman Kilat lama tidak disentuh.
--   U6  Penjaga kolom siaran (BEFORE INSERT OR UPDATE ad_schedules):
--         • tanggal jadwal berubah (pilih ulang gelombang) → keempat kolom
--           siaran DI-NULL-kan, oleh siapa pun;
--         • selain itu hanya service_role / koneksi tanpa JWT yang boleh
--           mengisinya — admin dari browser pun TIDAK (jalannya Pages
--           Function /api/admin/content). HINT 'broadcast_admin_only'.
--       Upsert cermin sync_ad_schedule_from_submission tidak mendaftarkan
--       kolom siaran, jadi sinkron biasa tidak menghapusnya (diuji kasus 8).
--   U7  Tiga RPC service_role, dipanggil Pages Function admin:
--         kilat_broadcast_start(id, oleh) — nyala. Hanya jadwal Kilat lunas/
--           tempo, mulai gelombang − 60 menit, boleh TERLAMBAT selama belum
--           pernah nyala (keputusan 15 Okt). Menjangkarkan jendela halaman.
--         kilat_broadcast_end(id, oleh)   — mati. Halaman tutup & pemenang
--           bisa dipilih di detik yang sama.
--         kilat_broadcast_undo(id)        — batalkan nyala yang salah, HANYA
--           bila belum ada responden sejak nyala.
--       Setelah selesai (dimatikan, atau 24 jam lewat) toggle TERKUNCI.
--       HINT: broadcast_not_found / _not_kilat / _no_wave / _unpaid /
--       _too_early / _finished / _not_started / _has_respondents.
--   U8  Backfill: 17 jadwal Kilat lunas yang sudah lewat diisi
--       broadcast_at = start, broadcast_ended_at = end, *_by = 'backfill',
--       supaya badge admin tidak dibuka dengan tunggakan palsu. Jendela
--       undiannya identik dengan sebelum backfill (min(start+24j, end) = end).
--
-- /api/respondents (functions/api/respondents.js) TIDAK diubah: ia sudah buta
-- jenis; asimetrinya ada di sumber jendela, dan itu yang dibetulkan di sini.
--
-- ── URUTAN ──────────────────────────────────────────────────────────────────
--
--   Langkah 1 (pra-cek + snapshot) → Langkah 2 (migrasi) → Langkah 3
--   (verifikasi) → Langkah 4 (uji perilaku, selalu dibatalkan) → baru push
--   frontend R4. Jalankan di SQL Editor Supabase. JANGAN lewat MCP.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — PRA-CEK (baca saja, kecuali 1e)
-- ============================================================================
--
-- 1a. Badan fungsi yang hidup harus SAMA dengan salinan di blok ROLLBACK
--     (diambil 15 Okt 2026). Harapan: tiga baris `sama = true`.
--
-- SELECT p.proname,
--        md5(pg_get_functiondef(p.oid)) = CASE p.proname
--          WHEN 'get_batch_rewards_bulk'      THEN '16eb5fcf435ee71d6a0c1c74da510b1c'
--          WHEN 'compute_extend_period_batch' THEN '31ae44213c9b8c583c304ac4364e5631'
--          WHEN 'ensure_survey_page'          THEN '9fc64c974ffa774627082e8dbcd9189d'
--        END AS sama
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('get_batch_rewards_bulk', 'compute_extend_period_batch',
--                     'ensure_survey_page')
-- ORDER BY 1;
--
-- 1b. Nama baru belum dipakai. Harapan: 0 baris.
--
-- SELECT proname::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND proname IN ('airing_window_start', 'airing_window_end', 'kilat_page_window',
--                   'guard_broadcast_columns', 'kilat_broadcast_start',
--                   'kilat_broadcast_end', 'kilat_broadcast_undo')
-- UNION ALL
-- SELECT column_name::text FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'ad_schedules'
--   AND column_name LIKE 'broadcast%';
--
-- 1c. Setiap order punya cermin ordinal 1. Harapan: 0.
--
-- SELECT count(*) FROM form_submissions fs
-- WHERE NOT EXISTS (SELECT 1 FROM ad_schedules a
--                   WHERE a.source_table = 'form_submissions' AND a.source_id = fs.id);
--
-- 1d. DRY-RUN pergeseran jendela undian kaki ordinal 1 (rumus U3 tanpa
--     siaran = jendela cermin). Per 15 Okt: 20 baris (Kilat lama + Iklan
--     berjam kustom). bulan_sama harus true di SEMUA baris (period_batch
--     tidak bergeser).
--
-- SELECT left(fs.id::text, 8) AS id, fs.distribution_type AS jenis,
--        fs.kilat_slot_hour AS gel, fs.airing_hour_wib AS jam_kustom,
--        airing_instant_of_date(fs.start_date) AS mulai_lama, a.start_date AS mulai_baru,
--        airing_instant_of_date(fs.end_date)   AS akhir_lama, a.end_date   AS akhir_baru,
--        to_char(fs.end_date, 'YYYY-MM') = to_char(a.end_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS bulan_sama
-- FROM form_submissions fs
-- JOIN ad_schedules a ON a.source_table = 'form_submissions' AND a.source_id = fs.id
-- WHERE fs.submission_status NOT IN ('rejected', 'spam')
--   AND (a.start_date IS DISTINCT FROM airing_instant_of_date(fs.start_date)
--        OR a.end_date IS DISTINCT FROM airing_instant_of_date(fs.end_date))
-- ORDER BY fs.start_date;
--
-- 1e. SNAPSHOT keluaran undian SEBELUM migrasi (dibandingkan di Langkah 3c,
--     dan jadi bahan laporan ke tim undian sesudah R7 — JANGAN dibuang
--     sebelum laporan itu terkirim). Skema backup: tanpa hibah anon.
--
-- CREATE TABLE backup.r118_rewards_before AS
-- SELECT now() AS diambil_pada, b.*
-- FROM get_batch_rewards_bulk(ARRAY(SELECT id FROM form_submissions)) b;
-- REVOKE ALL ON backup.r118_rewards_before FROM PUBLIC, anon, authenticated;
-- SELECT count(*) FROM backup.r118_rewards_before;
--
-- 1f. Calon backfill U8. Per 15 Okt: 17.
--
-- SELECT count(*) FROM ad_schedules
-- WHERE distribution_type = 'kilat' AND start_date IS NOT NULL AND end_date <= now()
--   AND (payment_status IN ('paid', 'completed') OR air_on_credit_at IS NOT NULL);
--
-- 1g. period_batch perpanjangan yang akan berubah oleh U4. Harapan: 0.
--
-- SELECT count(*) FROM ad_schedules
-- WHERE source_table = 'form_submissions_extend' AND end_date IS NOT NULL
--   AND period_batch IS DISTINCT FROM to_char(end_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM');


-- ============================================================================
-- LANGKAH 2 — MIGRASI (satu transaksi)
-- ============================================================================

BEGIN;

-- ── 2.1 (U1) Kolom siaran ──────────────────────────────────────────────────
ALTER TABLE public.ad_schedules
  ADD COLUMN broadcast_at       timestamptz,
  ADD COLUMN broadcast_by       text,
  ADD COLUMN broadcast_ended_at timestamptz,
  ADD COLUMN broadcast_ended_by text,
  ADD CONSTRAINT ad_schedules_broadcast_order CHECK (
    broadcast_ended_at IS NULL
    OR (broadcast_at IS NOT NULL AND broadcast_ended_at >= broadcast_at));

COMMENT ON COLUMN public.ad_schedules.broadcast_at IS
  'sql/118: toggle siaran Kilat dinyalakan (push terkirim). Jendela halaman & undian = [broadcast_at, +panjang jadwal). NULL = belum disiarkan.';
COMMENT ON COLUMN public.ad_schedules.broadcast_ended_at IS
  'sql/118: toggle siaran dimatikan. Jendela berakhir di sini (bila lebih awal dari broadcast_at + panjang jadwal).';

-- ── 2.2 (U2) Satu rumus jendela tayang ─────────────────────────────────────
CREATE FUNCTION public.airing_window_start(p_start timestamptz, p_broadcast_at timestamptz)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $function$
  SELECT COALESCE(p_broadcast_at, p_start);
$function$;

CREATE FUNCTION public.airing_window_end(p_start timestamptz, p_end timestamptz,
                                         p_broadcast_at timestamptz,
                                         p_broadcast_ended_at timestamptz)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $function$
  -- Panjang jendela = panjang jadwal (Kilat 24 jam), dihitung dari saat
  -- siaran benar-benar mulai; toggle mati memotongnya lebih awal.
  SELECT CASE
           WHEN p_broadcast_at IS NULL OR p_start IS NULL OR p_end IS NULL THEN p_end
           ELSE LEAST(p_broadcast_at + (p_end - p_start),
                      COALESCE(p_broadcast_ended_at, 'infinity'::timestamptz))
         END;
$function$;

-- Jendela halaman Kilat ordinal 1, dibaca dari cermin. Jatuh ke jam
-- gelombang di form_submissions bila cermin (belum) bertanggal.
CREATE FUNCTION public.kilat_page_window(p_submission_id uuid)
RETURNS TABLE(w_start timestamptz, w_end timestamptz)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(airing_window_start(m.start_date, m.broadcast_at),
                  kilat_instant_of(fs.start_date, fs.kilat_slot_hour)),
         COALESCE(airing_window_end(m.start_date, m.end_date, m.broadcast_at, m.broadcast_ended_at),
                  kilat_instant_of(fs.end_date, fs.kilat_slot_hour))
  FROM form_submissions fs
  LEFT JOIN ad_schedules m
         ON m.source_table = 'form_submissions' AND m.source_id = fs.id
  WHERE fs.id = p_submission_id;
$function$;

-- ── 2.3 (U6) Penjaga + reset kolom siaran ──────────────────────────────────
CREATE FUNCTION public.guard_broadcast_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  claims jsonb;
BEGIN
  -- Pilih ulang gelombang / pindah tanggal = siaran lama tidak berlaku lagi,
  -- siapa pun penulisnya. Termasuk upsert cermin (ON CONFLICT DO UPDATE
  -- menyalakan BEFORE UPDATE dengan OLD asli).
  IF TG_OP = 'UPDATE'
     AND (NEW.start_date IS DISTINCT FROM OLD.start_date
          OR NEW.end_date IS DISTINCT FROM OLD.end_date) THEN
    NEW.broadcast_at       := NULL;
    NEW.broadcast_by       := NULL;
    NEW.broadcast_ended_at := NULL;
    NEW.broadcast_ended_by := NULL;
    RETURN NEW;
  END IF;

  -- Tanpa klaim = koneksi langsung (SQL Editor, migrasi, cron) → boleh.
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  IF claims IS NULL OR coalesce(claims ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Admin dari browser SENGAJA tidak dilewatkan: jalan tulisnya Pages
  -- Function /api/admin/content (seri keamanan sql/110–116).
  IF TG_OP = 'INSERT' THEN
    IF NEW.broadcast_at IS NOT NULL OR NEW.broadcast_by IS NOT NULL
       OR NEW.broadcast_ended_at IS NOT NULL OR NEW.broadcast_ended_by IS NOT NULL THEN
      RAISE EXCEPTION 'Status siaran hanya bisa diisi lewat panel admin.'
        USING HINT = 'broadcast_admin_only';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.broadcast_at       IS DISTINCT FROM OLD.broadcast_at
     OR NEW.broadcast_by       IS DISTINCT FROM OLD.broadcast_by
     OR NEW.broadcast_ended_at IS DISTINCT FROM OLD.broadcast_ended_at
     OR NEW.broadcast_ended_by IS DISTINCT FROM OLD.broadcast_ended_by THEN
    RAISE EXCEPTION 'Status siaran hanya bisa diubah lewat panel admin.'
      USING HINT = 'broadcast_admin_only';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_ad_schedules_broadcast_guard
  BEFORE INSERT OR UPDATE ON public.ad_schedules
  FOR EACH ROW EXECUTE FUNCTION public.guard_broadcast_columns();

-- ── 2.4 (U7) Toggle siaran ─────────────────────────────────────────────────
CREATE FUNCTION public.kilat_broadcast_start(p_schedule_id uuid, p_by text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  a        ad_schedules%ROWTYPE;
  v_now    timestamptz := now();
  v_end    timestamptz;
  v_late   boolean;
  v_pages  int;
BEGIN
  IF COALESCE(btrim(p_by), '') = '' THEN
    RAISE EXCEPTION 'Nama admin wajib diisi.' USING HINT = 'broadcast_not_found';
  END IF;

  SELECT * INTO a FROM ad_schedules WHERE id = p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jadwal tidak ditemukan.' USING HINT = 'broadcast_not_found';
  END IF;
  IF a.distribution_type IS DISTINCT FROM 'kilat' THEN
    RAISE EXCEPTION 'Toggle siaran hanya untuk JFU Kilat.' USING HINT = 'broadcast_not_kilat';
  END IF;
  IF a.start_date IS NULL OR a.end_date IS NULL THEN
    RAISE EXCEPTION 'Jadwal ini belum punya gelombang.' USING HINT = 'broadcast_no_wave';
  END IF;
  IF NOT (COALESCE(a.payment_status IN ('paid', 'completed'), false)
          OR a.air_on_credit_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Gelombang ini belum lunas.' USING HINT = 'broadcast_unpaid';
  END IF;

  -- Satu arah: sesudah selesai (dimatikan, atau jendela 24 jam habis)
  -- terkunci. Membuka ulang = pendaftar sesudah pemenang bisa dipilih.
  IF a.broadcast_ended_at IS NOT NULL
     OR (a.broadcast_at IS NOT NULL
         AND v_now >= airing_window_end(a.start_date, a.end_date, a.broadcast_at, NULL)) THEN
    RAISE EXCEPTION 'Siaran gelombang ini sudah selesai dan tidak bisa dinyalakan lagi.'
      USING HINT = 'broadcast_finished';
  END IF;

  -- Sudah menyala: idempoten (klik ganda, dua tab admin).
  IF a.broadcast_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'broadcast_at', a.broadcast_at,
      'closes_at', airing_window_end(a.start_date, a.end_date, a.broadcast_at, NULL),
      'already', true, 'was_late', false, 'pages', 0);
  END IF;

  IF v_now < a.start_date - interval '60 minutes' THEN
    RAISE EXCEPTION 'Toggle siaran baru aktif 60 menit sebelum gelombang.'
      USING HINT = 'broadcast_too_early';
  END IF;

  -- Boleh terlambat (keputusan 15 Okt): jendela pindah ke [nyala, +24 jam)
  -- dan can_select_winners kembali false.
  v_late := v_now >= a.end_date;
  v_end  := airing_window_end(a.start_date, a.end_date, v_now, NULL);

  UPDATE ad_schedules
     SET broadcast_at = v_now, broadcast_by = btrim(p_by)
   WHERE id = a.id;

  UPDATE survey_pages
     SET publish_start_date = v_now,
         publish_end_date   = v_end,
         updated_at         = v_now
   WHERE submission_id = a.submission_id
     AND auto_closed_at IS NULL;
  GET DIAGNOSTICS v_pages = ROW_COUNT;

  RETURN jsonb_build_object('broadcast_at', v_now, 'closes_at', v_end,
                            'already', false, 'was_late', v_late, 'pages', v_pages);
END;
$function$;

CREATE FUNCTION public.kilat_broadcast_end(p_schedule_id uuid, p_by text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  a        ad_schedules%ROWTYPE;
  v_ended  timestamptz;
  v_resp   int;
  v_pages  int;
BEGIN
  IF COALESCE(btrim(p_by), '') = '' THEN
    RAISE EXCEPTION 'Nama admin wajib diisi.' USING HINT = 'broadcast_not_found';
  END IF;

  SELECT * INTO a FROM ad_schedules WHERE id = p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jadwal tidak ditemukan.' USING HINT = 'broadcast_not_found';
  END IF;
  IF a.broadcast_at IS NULL THEN
    RAISE EXCEPTION 'Siaran gelombang ini belum dinyalakan.' USING HINT = 'broadcast_not_started';
  END IF;
  IF a.broadcast_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Siaran gelombang ini sudah dimatikan.' USING HINT = 'broadcast_finished';
  END IF;

  -- Dimatikan sesudah 24 jam lewat = mencatat akhir yang sudah terjadi,
  -- tidak memperpanjang apa pun.
  v_ended := LEAST(now(), airing_window_end(a.start_date, a.end_date, a.broadcast_at, NULL));

  UPDATE ad_schedules
     SET broadcast_ended_at = v_ended, broadcast_ended_by = btrim(p_by)
   WHERE id = a.id;

  UPDATE survey_pages
     SET publish_end_date = v_ended,
         updated_at       = now()
   WHERE submission_id = a.submission_id
     AND auto_closed_at IS NULL
     AND (publish_end_date IS NULL OR publish_end_date > v_ended);
  GET DIAGNOSTICS v_pages = ROW_COUNT;

  SELECT count(*) INTO v_resp
  FROM page_respondents pr JOIN survey_pages sp ON sp.id = pr.page_id
  WHERE sp.submission_id = a.submission_id AND pr.created_at >= a.broadcast_at;

  RETURN jsonb_build_object('broadcast_ended_at', v_ended, 'respondents', v_resp,
                            'pages', v_pages);
END;
$function$;

CREATE FUNCTION public.kilat_broadcast_undo(p_schedule_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  a        ad_schedules%ROWTYPE;
  v_resp   int;
  v_pages  int;
BEGIN
  SELECT * INTO a FROM ad_schedules WHERE id = p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jadwal tidak ditemukan.' USING HINT = 'broadcast_not_found';
  END IF;
  IF a.broadcast_at IS NULL THEN
    RAISE EXCEPTION 'Siaran gelombang ini belum dinyalakan.' USING HINT = 'broadcast_not_started';
  END IF;
  IF a.broadcast_ended_at IS NOT NULL
     OR now() >= airing_window_end(a.start_date, a.end_date, a.broadcast_at, NULL) THEN
    RAISE EXCEPTION 'Siaran gelombang ini sudah selesai dan tidak bisa dibatalkan.'
      USING HINT = 'broadcast_finished';
  END IF;

  SELECT count(*) INTO v_resp
  FROM page_respondents pr JOIN survey_pages sp ON sp.id = pr.page_id
  WHERE sp.submission_id = a.submission_id AND pr.created_at >= a.broadcast_at;
  IF v_resp > 0 THEN
    RAISE EXCEPTION 'Sudah ada % responden sejak siaran dinyalakan; nyala tidak bisa dibatalkan.', v_resp
      USING HINT = 'broadcast_has_respondents';
  END IF;

  UPDATE ad_schedules
     SET broadcast_at = NULL, broadcast_by = NULL
   WHERE id = a.id;

  -- Kembali ke jendela sementara gelombang.
  UPDATE survey_pages
     SET publish_start_date = a.start_date,
         publish_end_date   = a.end_date,
         updated_at         = now()
   WHERE submission_id = a.submission_id
     AND auto_closed_at IS NULL;
  GET DIAGNOSTICS v_pages = ROW_COUNT;

  RETURN jsonb_build_object('pages', v_pages);
END;
$function$;

-- ── 2.5 (U3) Undian buta jenis ─────────────────────────────────────────────
-- Badan produksi 15 Okt (md5 16eb5fcf…) dengan DUA perubahan: kaki ordinal 1
-- membaca jendela dari cermin, dan kedua kaki memakai rumus U2.
CREATE OR REPLACE FUNCTION public.get_batch_rewards_bulk(p_submission_ids uuid[])
 RETURNS TABLE(submission_id uuid, period_batch text, prize_per_winner integer, winner_count integer, batch_status text, can_select_winners boolean, start_date timestamp with time zone, end_date timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH all_periods AS (
    -- sql/118: jendela ordinal 1 dari CERMIN ad_schedules — instan nyata
    -- (gelombang Kilat, jam kustom Iklan, 15.00) + toggle siaran. Jatuh ke
    -- 15.00 terpatok hanya bila cermin tak bertanggal. period_batch tetap
    -- bulan end_date form_submissions (DATE WIB).
    SELECT
      fs.id AS sid,
      TO_CHAR(fs.end_date, 'YYYY-MM') AS pb,
      fs.prize_per_winner AS base_p,
      0 AS add_p,
      fs.winner_count AS wc,
      fs.submission_status AS status,
      COALESCE(airing_window_start(m.start_date, m.broadcast_at),
               airing_instant_of_date(fs.start_date)) AS sd,
      COALESCE(airing_window_end(m.start_date, m.end_date, m.broadcast_at, m.broadcast_ended_at),
               airing_instant_of_date(fs.end_date))   AS ed
    FROM form_submissions fs
    LEFT JOIN ad_schedules m
           ON m.source_table = 'form_submissions' AND m.source_id = fs.id
    WHERE fs.id = ANY(p_submission_ids)
      AND fs.submission_status NOT IN ('rejected', 'spam')

    UNION ALL

    SELECT
      a.submission_id AS sid,
      a.period_batch AS pb,
      COALESCE(a.prize_per_winner, 0) AS base_p,
      COALESCE(a.additional_prize_per_winner, 0) AS add_p,
      COALESCE(a.winner_count, 0) AS wc,
      a.status AS status,
      airing_window_start(a.start_date, a.broadcast_at) AS sd,
      airing_window_end(a.start_date, a.end_date, a.broadcast_at, a.broadcast_ended_at) AS ed
    FROM ad_schedules a
    WHERE a.source_table = 'form_submissions_extend'
      AND a.submission_id = ANY(p_submission_ids)
      AND a.payment_status = 'paid'
  ),
  batch_agg AS (
    SELECT
      ap.sid,
      ap.pb,
      MAX(CASE WHEN ap.base_p > 0 THEN ap.base_p ELSE 0 END) AS base_prize,
      SUM(ap.add_p) AS total_additional,
      MAX(CASE WHEN ap.wc > 0 THEN ap.wc ELSE 0 END) AS wc,
      BOOL_OR(
        ap.status IN ('live', 'scheduled', 'paid', 'waiting_payment')
        AND (ap.ed IS NULL OR ap.ed > NOW())
      ) AS has_active,
      MIN(ap.sd) AS start_d,
      MAX(ap.ed) AS end_d
    FROM all_periods ap
    GROUP BY ap.sid, ap.pb
  )
  SELECT
    ba.sid,
    ba.pb,
    (ba.base_prize + ba.total_additional)::INTEGER,
    ba.wc::INTEGER,
    CASE WHEN ba.has_active THEN 'active'::TEXT ELSE 'closed'::TEXT END,
    NOT ba.has_active,
    ba.start_d,
    ba.end_d
  FROM batch_agg ba
  ORDER BY ba.sid, ba.pb;
END;
$function$;

-- ── 2.6 (U4) Bulan undian perpanjangan = bulan WIB ─────────────────────────
CREATE OR REPLACE FUNCTION public.compute_extend_period_batch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.end_date IS NOT NULL THEN
    -- sql/118: bulan WIB, identik dengan kaki ordinal 1 (TO_CHAR atas DATE
    -- WIB). Dulu TO_CHAR(timestamptz) mengikuti zona sesi (UTC): akhir
    -- 00.00–06.59 WIB tanggal 1 jatuh ke bulan sebelumnya.
    NEW.period_batch := TO_CHAR(NEW.end_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM');
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

-- ── 2.7 (U5) Halaman Kilat berjendela ──────────────────────────────────────
-- Badan produksi 15 Okt (md5 9fc64c97…) — DIBACA dari pg_get_functiondef,
-- bukan disalin dari sql/42/55/95. Perubahan: v_k_start/v_k_end dari
-- kilat_page_window di kedua cabang; akhir Kilat tidak lagi NULL.
CREATE OR REPLACE FUNCTION public.ensure_survey_page(p_submission_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub        RECORD;
  v_base_slug  TEXT;
  v_slug       TEXT;
  v_suffix     INT := 2;
  v_page_id    UUID;
  v_is_kilat   BOOLEAN;
  v_closed_at  TIMESTAMPTZ;
  v_k_start    TIMESTAMPTZ;   -- sql/118: jendela Kilat dari kilat_page_window
  v_k_end      TIMESTAMPTZ;
  -- Mirror of defaultSurveiAdBlocks in
  -- src/components/PageBuilder/PageBuilderModal.tsx. Two copies of a static
  -- template is the lesser evil versus an edge function for three paragraphs —
  -- but if you change one, change the other.
  v_blocks JSONB := '{
    "type": "doc",
    "content": [
      {"type":"paragraph","content":[{"type":"text","text":"Hi Jakpaters! Yuk, isi survei berikut sesuai dengan kondisi kamu saat ini. Hanya responden yang sesuai kriteria, mengisi dengan serius, dan tidak menjawab asal-asalan yang akan masuk ke dalam undian 😉"}]},
      {"type":"paragraph","content":[{"type":"text","text":"Jangan lupa untuk mengisi Jakpat ID kamu dengan benar (tanpa teks \"https://jakpat.net/s/\" di awal dan tanpa spasi di dalam Jakpat ID mu)."}]},
      {"type":"paragraph","content":[{"type":"text","text":"Semua pemenang undian survei akan diumumkan setiap akhir bulan, jadi tunggu pengumuman dari kami ya. Semoga beruntung! ✨"}]}
    ]
  }'::JSONB;
BEGIN
  -- Already has a page: return it. This is the retry path.
  --
  -- sql/99: KECUALI jendelanya ditutup SISTEM (auto_closed_at) — order ini
  -- pernah keluar dari status tayang lalu kini dibayar lagi. Tulis ulang
  -- jendelanya dengan rumus yang SAMA dengan INSERT di bawah (reguler 15:00
  -- WIB; Kilat kilat_page_window — sql/118), lalu kosongkan penandanya.
  -- Halaman yang ditutup/diedit admin sendiri (auto_closed_at NULL) tidak
  -- pernah disentuh di sini.
  --
  -- Penjaga order_is_airable: fungsi ini bisa dipanggil langsung oleh
  -- service_role; jangan sampai membuka jendela order yang belum lunas.
  -- Tanggal order NULL (slot sudah dilepas dan belum dipesan ulang) → jendela
  -- tetap tertutup; tab Page admin menampilkannya sebagai anomali.
  --
  -- ⚠️ Kalau ada perpanjangan yang SEDANG tayang, jendela ini sementara
  -- menunjuk ordinal 1 sampai cron_activate_extends menunjuknya kembali.
  SELECT id, auto_closed_at INTO v_page_id, v_closed_at
    FROM survey_pages WHERE submission_id = p_submission_id;
  IF FOUND THEN
    IF v_closed_at IS NOT NULL THEN
      SELECT * INTO v_sub FROM form_submissions WHERE id = p_submission_id;
      IF FOUND
         AND order_is_airable(v_sub.payment_status, v_sub.submission_status)
         AND v_sub.start_date IS NOT NULL
         AND v_sub.end_date IS NOT NULL
      THEN
        v_is_kilat := (v_sub.distribution_type = 'kilat');
        SELECT w.w_start, w.w_end INTO v_k_start, v_k_end
          FROM kilat_page_window(p_submission_id) w;
        UPDATE survey_pages
           SET publish_start_date = CASE WHEN v_is_kilat
                                         THEN v_k_start
                                         ELSE airing_instant_of_date(v_sub.start_date)
                                    END,
               publish_end_date   = CASE WHEN v_is_kilat
                                         THEN v_k_end
                                         ELSE airing_instant_of_date(v_sub.end_date)
                                    END,
               auto_closed_at     = NULL,
               updated_at         = now()
         WHERE id = v_page_id;
      END IF;
    END IF;
    RETURN v_page_id;
  END IF;

  SELECT * INTO v_sub FROM form_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- ── PENOLAKAN KILAT sql/42 DICABUT DI SINI (sql/95) ───────────────────────
  -- Dulu di titik ini berdiri:
  --     IF v_sub.distribution_type = 'kilat' THEN RETURN NULL; END IF;
  -- Alasan pencabutannya ada di kepala berkas ini. Ringkasnya: halaman Kilat
  -- tidak pernah muncul di /pages maupun /api/surveys, jadi ia tidak mengambil
  -- kapasitas tayang siapa pun. Ia satu-satunya tautan yang bisa dipasang admin
  -- ke dalam survei Jakpat. Tanpa halaman, iklan Kilat tidak bisa disiarkan
  -- sama sekali.
  v_is_kilat := (v_sub.distribution_type = 'kilat');
  SELECT w.w_start, w.w_end INTO v_k_start, v_k_end
    FROM kilat_page_window(p_submission_id) w;

  -- Prerequisites. A page without a working survey link is worse than no page,
  -- and a page with no window would be published indefinitely.
  --
  -- ⚠️ `end_date IS NULL` menolak SENYAP (RETURN NULL, tanpa error) — dan untuk
  -- Kilat itu sekarang berarti "iklan tidak bisa disiarkan". Diukur 2026-09-18:
  -- 2 dari 19 order Kilat lunas punya start_date DAN end_date NULL (juga NULL
  -- di ad_schedules — tanggalnya memang tidak pernah tersimpan di mana pun).
  -- Keduanya SENGAJA dibiarkan gugur di sini; mengisi tanggalnya = menjadwalkan
  -- ulang order berbayar tanpa diminta, itu keputusan bisnis. Panel admin tab
  -- Page menampilkannya sebagai anomali yang berteriak, bukan kegagalan senyap.
  IF v_sub.submission_status IN ('rejected', 'spam')
     OR COALESCE(BTRIM(v_sub.survey_url), '') = ''
     OR v_sub.start_date IS NULL
     OR v_sub.end_date IS NULL
     OR COALESCE(BTRIM(v_sub.title), '') = ''
  THEN
    RETURN NULL;
  END IF;

  -- Slug: same rules as generateSlug() in PageBuilderModal.tsx — lowercase,
  -- strip anything but a-z 0-9 space hyphen, spaces to hyphens, collapse
  -- hyphens, cap at 60.
  v_base_slug := LEFT(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(LOWER(BTRIM(v_sub.title)), '[^a-z0-9[:space:]-]', '', 'g'),
        '[[:space:]]+', '-', 'g'),
      '-+', '-', 'g'),
    60);
  v_base_slug := BTRIM(v_base_slug, '-');

  IF v_base_slug = '' THEN
    v_base_slug := 'survei';
  END IF;

  -- Uniqueness matters far more here than when an admin was watching: the
  -- public page loads with .eq('slug', slug).single(), so two pages sharing a
  -- slug break BOTH of them.
  v_slug := v_base_slug;
  IF EXISTS (SELECT 1 FROM survey_pages WHERE slug = v_slug) THEN
    v_slug := LEFT(v_base_slug, 53) || '-' || LEFT(p_submission_id::TEXT, 6);
    WHILE EXISTS (SELECT 1 FROM survey_pages WHERE slug = v_slug) LOOP
      v_slug := LEFT(v_base_slug, 51) || '-' || LEFT(p_submission_id::TEXT, 6) || '-' || v_suffix;
      v_suffix := v_suffix + 1;
    END LOOP;
  END IF;

  -- Note there is no criteria column to fill: respondent criteria live on
  -- form_submissions.criteria_responden and the public page reads them through
  -- the join, exactly as PageBuilderModal does. survey_pages.criteria (jsonb)
  -- is a different, unused column — do not repurpose it here.
  INSERT INTO survey_pages (
    submission_id, slug, title, banner_url, is_published,
    blocks, custom_fields,
    publish_start_date, publish_end_date,
    redirect_url, is_extra_ad, is_hidden,
    display_order, requires_banner_update
  ) VALUES (
    p_submission_id,
    v_slug,
    v_sub.title,
    -- Generic ad banner, served from public/. Not a technical fallback: without
    -- one the Jakpat app falls back to its own card styling, which looks
    -- nothing like an ad, and respondents cannot tell a paid survey from an
    -- announcement. Deliberately carries no prize figure, so it never goes
    -- stale when a reward batch changes.
    -- DUPLICATED as DEFAULT_AD_BANNER_URL in src/utils/constants.ts.
    '/default-ad-banner.jpg',
    -- ⚠️ WAJIB TRUE, juga untuk Kilat. /api/respondents menyaring HANYA kolom
    -- ini; undian pemenang berantai survey_pages.id → page_respondents.page_id
    -- → jakpat_id. is_published=FALSE berarti pemenang Kilat tidak akan pernah
    -- bisa diundi. Penyembunyian Kilat dikerjakan di tempat lain (lihat bawah).
    TRUE,
    v_blocks,
    '[]'::JSONB,

    -- ── JENDELA TERBIT — BERCABANG (sql/95) ───────────────────────────────
    --
    -- MULAI. Reguler tayang 15:00 WIB pada tanggalnya; Kilat pada awal
    -- jendela siarannya (kilat_page_window, sql/118): saat toggle siaran
    -- dinyalakan, atau jam gelombang bila belum. kilat_instant_of menangani
    -- kilat_slot_hour NULL → 00:00 WIB, sentinel yang sah.
    --
    -- ⚠️ sql/99: rumus ini DIULANG di cabang buka-ulang di atas. Ubah satu,
    -- ubah keduanya.
    CASE WHEN v_is_kilat
         THEN v_k_start
         ELSE airing_instant_of_date(v_sub.start_date)
    END,

    -- SELESAI. Reguler mengikuti end_date. Kilat: akhir jendela siaran
    -- (kilat_page_window, sql/118).
    --
    -- ⚠️ sql/118 MENGGANTI konvensi lama "Kilat = NULL, tautan tak pernah
    -- mati" (sql/95). Keputusan pemilik produk 14 Okt 2026: halaman Kilat
    -- swalayan TUTUP BERSAMAAN dengan jendela undian, persis Iklan, supaya
    -- tidak ada pendaftar sesudah pemenang bisa dipilih. Jendelanya:
    --   • belum disiarkan → sementara [gelombang, gelombang + 24 jam);
    --   • toggle siaran nyala → [broadcast_at, broadcast_at + 24 jam);
    --   • toggle dimatikan → berakhir di broadcast_ended_at.
    -- get_batch_rewards_bulk memakai rumus YANG SAMA (airing_window_start/
    -- airing_window_end), jadi halaman dan undian tutup di detik yang sama.
    --
    -- Hanya halaman BARU (dan halaman yang dibuka ulang di cabang atas) yang
    -- kena; 17 halaman Kilat lama tetap NULL dan tidak disentuh.
    -- Konsekuensi: storage-cleanup.js kini juga membersihkan banner Kilat
    -- 7 hari sesudah jendelanya, sama dengan Iklan.
    CASE WHEN v_is_kilat
         THEN v_k_end
         ELSE airing_instant_of_date(v_sub.end_date)
    END,

    NULL,
    FALSE,
    -- ⚠️ is_hidden tetap FALSE, JUGA untuk Kilat — jangan tergoda memakainya.
    -- Penyembunyian Kilat bersifat STRUKTURAL lewat distribution_type, disaring
    -- di SurveyListingPage.tsx dan functions/api/surveys.js. Memakai is_hidden
    -- di sini akan salah sasaran dua kali: (a) ia tidak dihormati
    -- /api/respondents, jadi tidak menyembunyikan apa pun yang penting; dan
    -- (b) ia mencampuradukkan "disembunyikan admin" dengan "memang bukan iklan
    -- feed", sehingga admin yang menyembunyikan halaman reguler dan halaman
    -- Kilat tidak lagi bisa dibedakan.
    FALSE,                    -- visible in the app feed, per the 2026-08-03 decision
    -- NULL, not MAX+1 (sql/40/42's original rule) — reverted 2026-08-13.
    -- orderBand() in src/utils/adOrdering.ts treats a NULL, non-extra-ad page
    -- as band 0 (TOP), exactly like a manually-built page always got. Ordering
    -- no longer depends on whether a real banner has been uploaded yet, so a
    -- paying customer's ad isn't punished for an admin follow-up step nobody
    -- has done yet. set_survey_pages_order() still lets an admin place any
    -- page manually whenever they want.
    NULL,
    -- FALSE, deliberately. The flag means "the banner is showing stale reward
    -- info" — that is what the DOKU webhook sets it for, when a new batch or a
    -- top-up changes the prize. A page that has no banner has nothing stale to
    -- show. Setting it TRUE here would raise a badge on every newly paid order,
    -- and since 235 of 262 published pages already run with no banner at all,
    -- that badge would be permanent and universal. A warning that is always on
    -- is a warning that stops being read.
    FALSE
  )
  RETURNING id INTO v_page_id;

  RETURN v_page_id;
END;
$function$;

-- ── 2.8 (U8) Backfill siaran gelombang lampau ──────────────────────────────
-- Dijalankan tanpa JWT (SQL Editor) → penjaga U6 melewatkannya.
UPDATE public.ad_schedules
   SET broadcast_at       = start_date,
       broadcast_by       = 'backfill',
       broadcast_ended_at = end_date,
       broadcast_ended_by = 'backfill'
 WHERE distribution_type = 'kilat'
   AND start_date IS NOT NULL
   AND end_date <= now()
   AND (payment_status IN ('paid', 'completed') OR air_on_credit_at IS NOT NULL)
   AND broadcast_at IS NULL;

-- ── 2.9 Hibah ──────────────────────────────────────────────────────────────
-- pg_default_acl memberi anon DAN authenticated EXECUTE atas setiap fungsi
-- baru; REVOKE FROM PUBLIC tidak mencabutnya. Cabut eksplisit, periksa 3a.
-- (Tiga fungsi yang DIGANTI mempertahankan ACL-nya — CREATE OR REPLACE.)
REVOKE ALL ON FUNCTION public.airing_window_start(timestamptz, timestamptz)                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.airing_window_end(timestamptz, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kilat_page_window(uuid)                                             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_broadcast_columns()                                           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kilat_broadcast_start(uuid, text)                                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kilat_broadcast_end(uuid, text)                                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kilat_broadcast_undo(uuid)                                          FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.airing_window_start(timestamptz, timestamptz)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.airing_window_end(timestamptz, timestamptz, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.kilat_page_window(uuid)                                             TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_broadcast_columns()                                           TO service_role;
GRANT EXECUTE ON FUNCTION public.kilat_broadcast_start(uuid, text)                                   TO service_role;
GRANT EXECUTE ON FUNCTION public.kilat_broadcast_end(uuid, text)                                     TO service_role;
GRANT EXECUTE ON FUNCTION public.kilat_broadcast_undo(uuid)                                          TO service_role;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. ACL. Harapan: ketujuh fungsi baru = postgres + service_role. TIDAK ADA
--     anon/authenticated. Tiga fungsi yang diganti: ACL sama dengan sebelum
--     (get_batch_rewards_bulk & compute_extend_period_batch tetap punya
--     anon/authenticated seperti di produksi; ensure_survey_page tidak).
--
-- SELECT p.proname, array_to_string(p.proacl, ' | ') AS acl, p.prosecdef
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('airing_window_start', 'airing_window_end', 'kilat_page_window',
--                     'guard_broadcast_columns', 'kilat_broadcast_start',
--                     'kilat_broadcast_end', 'kilat_broadcast_undo',
--                     'get_batch_rewards_bulk', 'compute_extend_period_batch',
--                     'ensure_survey_page')
-- ORDER BY 1;
--
-- 3b. Trigger, kolom, backfill. Harapan: satu trigger; 4 kolom; backfill = 17.
--
-- SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
-- WHERE tgname = 'trg_ad_schedules_broadcast_guard';
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'ad_schedules'
--   AND column_name LIKE 'broadcast%' ORDER BY 1;
-- SELECT broadcast_by, count(*) FROM ad_schedules
-- WHERE broadcast_at IS NOT NULL GROUP BY 1;
--
-- 3c. Bandingkan dengan snapshot 1e.
--     (i) Harapan: 0 baris — selain jendela, TIDAK ADA yang berubah.
--
-- SELECT b.submission_id, b.period_batch
-- FROM backup.r118_rewards_before b
-- FULL JOIN get_batch_rewards_bulk(ARRAY(SELECT id FROM form_submissions)) n
--   ON n.submission_id = b.submission_id AND n.period_batch IS NOT DISTINCT FROM b.period_batch
-- WHERE b.submission_id IS NULL OR n.submission_id IS NULL
--    OR n.prize_per_winner   IS DISTINCT FROM b.prize_per_winner
--    OR n.winner_count       IS DISTINCT FROM b.winner_count
--    OR n.batch_status       IS DISTINCT FROM b.batch_status
--    OR n.can_select_winners IS DISTINCT FROM b.can_select_winners;
--
--     (ii) Daftar batch yang jendelanya bergeser — bahan laporan tim undian
--     (R7). Harapan: sama dengan order di 1d, tidak lebih.
--
-- SELECT left(b.submission_id::text, 8) AS id, b.period_batch,
--        b.start_date AS mulai_lama, n.start_date AS mulai_baru,
--        b.end_date   AS akhir_lama, n.end_date   AS akhir_baru
-- FROM backup.r118_rewards_before b
-- JOIN get_batch_rewards_bulk(ARRAY(SELECT id FROM form_submissions)) n
--   ON n.submission_id = b.submission_id AND n.period_batch IS NOT DISTINCT FROM b.period_batch
-- WHERE n.start_date IS DISTINCT FROM b.start_date
--    OR n.end_date   IS DISTINCT FROM b.end_date
-- ORDER BY b.start_date;
--
-- 3d. period_batch perpanjangan masih konsisten dengan rumus baru. Harapan: 0.
--
-- SELECT count(*) FROM ad_schedules
-- WHERE source_table = 'form_submissions_extend' AND end_date IS NOT NULL
--   AND period_batch IS DISTINCT FROM to_char(end_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM');


-- ============================================================================
-- LANGKAH 4 — UJI PERILAKU. Menulis, tapi SELALU dibatalkan.
-- ============================================================================
--
-- Blok di bawah SELALU berakhir dengan EXCEPTION, dan itu disengaja:
-- exception membatalkan SEMUA tulisannya, bahkan kalau ROLLBACK terlewat.
--
--   UJI_LULUS ...      → semua kasus lolos, nol perubahan tersimpan
--   UJI_GAGAL kasus N  → berhenti, kirimkan pesannya
--
-- Order uji = order reguler lama lunas (halaman terbuka, tanpa perpanjangan)
-- yang untuk sementara (di dalam transaksi ini saja) dijadikan Kilat; jadwal
-- cerminnya digeser relatif terhadap now() supaya toggle bisa diuji di setiap
-- keadaan. now() konstan sepanjang transaksi, jadi perbandingan instan eksak.
-- Peran pemanggil disimulasikan lewat request.jwt.claims seperti PostgREST.
--
-- BEGIN;
-- -- WAJIB: protect_form_submissions() melewatkan postgres/service_role saja.
-- SET LOCAL ROLE postgres;
--
-- CREATE FUNCTION pg_temp.sebagai(p_siapa text) RETURNS void
-- LANGUAGE sql AS $f$
--   SELECT set_config('request.jwt.claims', CASE p_siapa
--     WHEN 'peneliti' THEN '{"role":"authenticated","email":"uji-peneliti@example.com"}'
--     WHEN 'admin'    THEN '{"role":"authenticated","email":"product@jakpat.net"}'
--     WHEN 'service'  THEN '{"role":"service_role"}'
--     ELSE '' END, true);
-- $f$;
--
-- CREATE FUNCTION pg_temp.harus_lolos(p_kasus text, p_sql text) RETURNS void
-- LANGUAGE plpgsql AS $f$
-- DECLARE v_rows bigint;
-- BEGIN
--   BEGIN
--     EXECUTE p_sql;
--     GET DIAGNOSTICS v_rows = ROW_COUNT;
--   EXCEPTION WHEN OTHERS THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus %: ditolak padahal harus lolos: %', p_kasus, SQLERRM;
--   END;
--   IF v_rows = 0 THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus %: perintah tidak mengenai baris apa pun', p_kasus;
--   END IF;
-- END $f$;
--
-- CREATE FUNCTION pg_temp.harus_ditolak(p_kasus text, p_sql text, p_hint text)
-- RETURNS void LANGUAGE plpgsql AS $f$
-- DECLARE v_err text; v_hint text;
-- BEGIN
--   BEGIN
--     EXECUTE p_sql;
--   EXCEPTION WHEN OTHERS THEN
--     GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
--     IF COALESCE(v_hint, '') <> p_hint THEN
--       RAISE EXCEPTION 'UJI_GAGAL kasus %: ditolak karena hal lain: % (hint=%)', p_kasus, v_err, v_hint;
--     END IF;
--     RETURN;
--   END;
--   RAISE EXCEPTION 'UJI_GAGAL kasus %: lolos padahal harus ditolak', p_kasus;
-- END $f$;
--
-- -- Satu batch undian satu order (order uji hanya punya satu batch).
-- CREATE FUNCTION pg_temp.undian(p_id uuid)
-- RETURNS TABLE(mulai timestamptz, akhir timestamptz, status text, bisa_pilih boolean)
-- LANGUAGE sql AS $f$
--   SELECT b.start_date, b.end_date, b.batch_status, b.can_select_winners
--   FROM get_batch_rewards_bulk(ARRAY[p_id]) b ORDER BY b.period_batch DESC LIMIT 1;
-- $f$;
--
-- CREATE FUNCTION pg_temp.cermin(p_id uuid) RETURNS uuid
-- LANGUAGE sql AS $f$
--   SELECT id FROM ad_schedules WHERE source_table = 'form_submissions' AND source_id = p_id;
-- $f$;
--
-- DO $uji$
-- DECLARE
--   v_now   timestamptz := now();
--   v_today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
--   d       date;
--   p       uuid[];
--   q       uuid;
--   m       uuid[] := '{}';
--   v_page  uuid;
--   r       record;
--   j       jsonb;
-- BEGIN
--   -- ── Setup ──
--   -- Senin kosong ≥ 30 hari ke depan (untuk halaman Kilat baru, kasus 18).
--   SELECT x::date INTO d
--   FROM generate_series(v_today + 30, v_today + 400, '1 day') AS x
--   WHERE extract(isodow FROM x) = 1
--     AND NOT EXISTS (
--       SELECT 1 FROM ad_schedules a
--       WHERE a.distribution_type = 'kilat'
--         AND (a.start_date AT TIME ZONE 'Asia/Jakarta')::date IN (x::date, x::date + 1))
--   ORDER BY x LIMIT 1;
--
--   -- p[1..5]: order reguler lama LUNAS yang punya halaman terbuka, tanpa
--   -- perpanjangan. p[1..3] jadi Kilat (di transaksi ini saja), p[4] tetap
--   -- Iklan, p[5] Kilat untuk uji reset.
--   SELECT array_agg(id ORDER BY created_at) INTO p FROM (
--     SELECT fs.id, fs.created_at FROM form_submissions fs
--     WHERE fs.distribution_type = 'regular' AND fs.payment_status = 'paid'
--       AND fs.start_date IS NOT NULL AND fs.end_date < v_today - 60
--       AND fs.airing_hour_wib IS NULL
--       AND EXISTS (SELECT 1 FROM survey_pages sp
--                   WHERE sp.submission_id = fs.id AND sp.auto_closed_at IS NULL)
--       AND NOT EXISTS (SELECT 1 FROM ad_schedules a
--                       WHERE a.submission_id = fs.id
--                         AND a.source_table = 'form_submissions_extend')
--     ORDER BY fs.created_at LIMIT 5) s;
--   IF cardinality(p) < 5 THEN RAISE EXCEPTION 'UJI_GAGAL setup: order uji kurang'; END IF;
--
--   -- q: order reguler lunas TANPA halaman (kasus 18).
--   SELECT fs.id INTO q FROM form_submissions fs
--   WHERE fs.distribution_type = 'regular' AND fs.payment_status = 'paid'
--     AND fs.submission_status NOT IN ('rejected', 'spam')
--     AND COALESCE(btrim(fs.survey_url), '') <> '' AND COALESCE(btrim(fs.title), '') <> ''
--     AND NOT EXISTS (SELECT 1 FROM survey_pages sp WHERE sp.submission_id = fs.id)
--     AND NOT EXISTS (SELECT 1 FROM ad_schedules a WHERE a.submission_id = fs.id
--                       AND a.source_table = 'form_submissions_extend')
--   ORDER BY fs.created_at LIMIT 1;
--   IF q IS NULL OR d IS NULL THEN RAISE EXCEPTION 'UJI_GAGAL setup: q/d kosong'; END IF;
--
--   PERFORM pg_temp.sebagai('');
--   UPDATE form_submissions
--      SET distribution_type = 'kilat', kilat_slot_hour = 11, submission_status = 'live'
--    WHERE id IN (p[1], p[2], p[3], p[5]);
--   UPDATE form_submissions SET submission_status = 'live' WHERE id = p[4];
--   FOR i IN 1..5 LOOP m := m || pg_temp.cermin(p[i]); END LOOP;
--
--   -- 20  Iklan 15.00 tanpa siaran: jendela = 15.00 terpatok, seperti dulu.
--   SELECT * INTO r FROM pg_temp.undian(p[4]);
--   IF r.mulai <> airing_instant_of_date((SELECT start_date FROM form_submissions WHERE id = p[4]))
--      OR r.akhir <> airing_instant_of_date((SELECT end_date FROM form_submissions WHERE id = p[4])) THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 20: jendela Iklan 15.00 berubah (% → %)', r.mulai, r.akhir;
--   END IF;
--
--   -- Gelombang uji relatif terhadap now() (cermin ditulis langsung, dipercaya):
--   --   m1 baru mulai 7 menit lalu; m2 dua jam lagi; m3 sudah lewat 30 jam.
--   UPDATE ad_schedules SET start_date = v_now - interval '7 minutes',
--                           end_date   = v_now - interval '7 minutes' + interval '24 hours'
--    WHERE id = m[1];
--   UPDATE ad_schedules SET start_date = v_now + interval '2 hours',
--                           end_date   = v_now + interval '26 hours'
--    WHERE id = m[2];
--   UPDATE ad_schedules SET start_date = v_now - interval '30 hours',
--                           end_date   = v_now - interval '6 hours'
--    WHERE id = m[3];
--
--   -- 1  Kilat tanpa toggle: jendela undian = jendela gelombang, aktif.
--   SELECT * INTO r FROM pg_temp.undian(p[1]);
--   IF r.mulai <> v_now - interval '7 minutes' OR r.akhir <> v_now + interval '23 hours 53 minutes'
--      OR r.status <> 'active' OR r.bisa_pilih THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 1: % % % %', r.mulai, r.akhir, r.status, r.bisa_pilih;
--   END IF;
--
--   -- 2  Terlalu awal (> 60 menit sebelum gelombang).
--   PERFORM pg_temp.sebagai('service');
--   PERFORM pg_temp.harus_ditolak('2 terlalu awal',
--     format('SELECT kilat_broadcast_start(%L, ''uji'')', m[2]), 'broadcast_too_early');
--
--   -- 3  Bukan Kilat.
--   PERFORM pg_temp.harus_ditolak('3 bukan kilat',
--     format('SELECT kilat_broadcast_start(%L, ''uji'')', m[4]), 'broadcast_not_kilat');
--
--   -- 4  Belum lunas.
--   PERFORM pg_temp.sebagai('');
--   UPDATE ad_schedules SET payment_status = 'pending' WHERE id = m[1];
--   PERFORM pg_temp.sebagai('service');
--   PERFORM pg_temp.harus_ditolak('4 belum lunas',
--     format('SELECT kilat_broadcast_start(%L, ''uji'')', m[1]), 'broadcast_unpaid');
--   PERFORM pg_temp.sebagai('');
--   UPDATE ad_schedules SET payment_status = 'paid' WHERE id = m[1];
--
--   -- 5  Peneliti & admin dari browser tidak bisa menulis kolom siaran.
--   PERFORM pg_temp.sebagai('peneliti');
--   PERFORM pg_temp.harus_ditolak('5a peneliti',
--     format('UPDATE ad_schedules SET broadcast_at = now() WHERE id = %L', m[1]), 'broadcast_admin_only');
--   PERFORM pg_temp.sebagai('admin');
--   PERFORM pg_temp.harus_ditolak('5b admin browser',
--     format('UPDATE ad_schedules SET broadcast_ended_at = now() WHERE id = %L', m[1]), 'broadcast_admin_only');
--
--   -- 6  Nyala: kolom terisi, halaman & undian berjangkar [nyala, +24 jam).
--   PERFORM pg_temp.sebagai('service');
--   j := kilat_broadcast_start(m[1], 'uji');
--   IF (j ->> 'was_late')::boolean OR (j ->> 'pages')::int < 1 THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 6a: %', j;
--   END IF;
--   IF (SELECT broadcast_at FROM ad_schedules WHERE id = m[1]) <> v_now THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 6b: broadcast_at tidak terisi';
--   END IF;
--   IF EXISTS (SELECT 1 FROM survey_pages WHERE submission_id = p[1] AND auto_closed_at IS NULL
--                AND (publish_start_date <> v_now OR publish_end_date <> v_now + interval '24 hours')) THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 6c: jendela halaman tidak berjangkar ke nyala';
--   END IF;
--   SELECT * INTO r FROM pg_temp.undian(p[1]);
--   IF r.mulai <> v_now OR r.akhir <> v_now + interval '24 hours' OR r.bisa_pilih THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 6d: undian % → % (pilih %)', r.mulai, r.akhir, r.bisa_pilih;
--   END IF;
--
--   -- 7  Nyala kedua = idempoten.
--   j := kilat_broadcast_start(m[1], 'uji lain');
--   IF NOT (j ->> 'already')::boolean
--      OR (SELECT broadcast_by FROM ad_schedules WHERE id = m[1]) <> 'uji' THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 7: %', j;
--   END IF;
--
--   -- 9  Batalkan nyala tanpa responden → kembali ke jendela gelombang.
--   j := kilat_broadcast_undo(m[1]);
--   IF (SELECT broadcast_at FROM ad_schedules WHERE id = m[1]) IS NOT NULL
--      OR EXISTS (SELECT 1 FROM survey_pages WHERE submission_id = p[1] AND auto_closed_at IS NULL
--                   AND publish_start_date <> v_now - interval '7 minutes') THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 9: %', j;
--   END IF;
--
--   -- 10 Nyala lagi, lalu ada responden → batal ditolak.
--   PERFORM kilat_broadcast_start(m[1], 'uji');
--   SELECT id INTO v_page FROM survey_pages
--    WHERE submission_id = p[1] AND auto_closed_at IS NULL LIMIT 1;
--   INSERT INTO page_respondents (page_id, jakpat_id) VALUES (v_page, 'UJI118-' || left(p[1]::text, 8));
--   PERFORM pg_temp.harus_ditolak('10 batal sesudah responden',
--     format('SELECT kilat_broadcast_undo(%L)', m[1]), 'broadcast_has_respondents');
--
--   -- 11 Mati: halaman tutup & pemenang bisa dipilih di detik yang sama.
--   j := kilat_broadcast_end(m[1], 'uji');
--   IF (j ->> 'respondents')::int < 1 THEN RAISE EXCEPTION 'UJI_GAGAL kasus 11a: %', j; END IF;
--   IF EXISTS (SELECT 1 FROM survey_pages WHERE submission_id = p[1] AND auto_closed_at IS NULL
--                AND publish_end_date <> v_now) THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 11b: halaman tidak tutup';
--   END IF;
--   SELECT * INTO r FROM pg_temp.undian(p[1]);
--   IF r.akhir <> v_now OR r.status <> 'closed' OR NOT r.bisa_pilih THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 11c: % % %', r.akhir, r.status, r.bisa_pilih;
--   END IF;
--
--   -- 12 Sesudah mati: terkunci (nyala, batal, mati lagi ditolak).
--   PERFORM pg_temp.harus_ditolak('12a nyala lagi',
--     format('SELECT kilat_broadcast_start(%L, ''uji'')', m[1]), 'broadcast_finished');
--   PERFORM pg_temp.harus_ditolak('12b batal',
--     format('SELECT kilat_broadcast_undo(%L)', m[1]), 'broadcast_finished');
--   PERFORM pg_temp.harus_ditolak('12c mati lagi',
--     format('SELECT kilat_broadcast_end(%L, ''uji'')', m[1]), 'broadcast_finished');
--
--   -- 13 Siaran terlambat: jendela gelombang m3 sudah habis (bisa dipilih),
--   --    nyala memindahkannya ke [nyala, +24 jam) dan menutup pemilihan lagi.
--   SELECT * INTO r FROM pg_temp.undian(p[3]);
--   IF NOT r.bisa_pilih THEN RAISE EXCEPTION 'UJI_GAGAL kasus 13a: belum bisa dipilih'; END IF;
--   j := kilat_broadcast_start(m[3], 'uji');
--   IF NOT (j ->> 'was_late')::boolean THEN RAISE EXCEPTION 'UJI_GAGAL kasus 13b: %', j; END IF;
--   SELECT * INTO r FROM pg_temp.undian(p[3]);
--   IF r.mulai <> v_now OR r.akhir <> v_now + interval '24 hours' OR r.bisa_pilih THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 13c: % → % (pilih %)', r.mulai, r.akhir, r.bisa_pilih;
--   END IF;
--
--   -- 19 Halaman yang ditutup sistem dibuka ulang ensure_survey_page dengan
--   --    jendela siaran yang sedang berjalan, bukan NULL.
--   PERFORM pg_temp.sebagai('');
--   UPDATE survey_pages SET auto_closed_at = now() WHERE submission_id = p[3];
--   PERFORM ensure_survey_page(p[3]);
--   IF EXISTS (SELECT 1 FROM survey_pages WHERE submission_id = p[3]
--                AND (auto_closed_at IS NOT NULL OR publish_start_date <> v_now
--                     OR publish_end_date IS DISTINCT FROM v_now + interval '24 hours')) THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 19: halaman dibuka ulang dengan jendela salah';
--   END IF;
--
--   -- 14 Selesai otomatis: nyala 25 jam lalu tanpa dimatikan → tertutup,
--   --    bisa dipilih, terkunci; "mati" mencatat akhir = nyala + 24 jam.
--   UPDATE ad_schedules SET start_date = v_now - interval '26 hours',
--                           end_date   = v_now - interval '2 hours'
--    WHERE id = m[2];
--   UPDATE ad_schedules SET broadcast_at = v_now - interval '25 hours', broadcast_by = 'uji'
--    WHERE id = m[2];
--   SELECT * INTO r FROM pg_temp.undian(p[2]);
--   IF r.akhir <> v_now - interval '1 hour' OR r.status <> 'closed' OR NOT r.bisa_pilih THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 14a: % % %', r.akhir, r.status, r.bisa_pilih;
--   END IF;
--   PERFORM pg_temp.sebagai('service');
--   PERFORM pg_temp.harus_ditolak('14b nyala sesudah otomatis selesai',
--     format('SELECT kilat_broadcast_start(%L, ''uji'')', m[2]), 'broadcast_finished');
--   j := kilat_broadcast_end(m[2], 'uji');
--   IF (j ->> 'broadcast_ended_at')::timestamptz <> v_now - interval '1 hour' THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 14c: %', j;
--   END IF;
--
--   -- 8  Sinkron cermin tanpa ganti tanggal TIDAK menghapus status siaran.
--   PERFORM pg_temp.sebagai('');
--   UPDATE ad_schedules SET broadcast_at = start_date, broadcast_by = 'uji' WHERE id = m[5];
--   PERFORM pg_temp.sebagai('admin');
--   PERFORM pg_temp.harus_lolos('8a sentuh catatan',
--     format('UPDATE form_submissions SET admin_notes = admin_notes WHERE id = %L', p[5]));
--   IF (SELECT broadcast_at FROM ad_schedules WHERE id = m[5]) IS NULL THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 8b: sinkron cermin menghapus status siaran';
--   END IF;
--
--   -- 15 Pindah gelombang (tanggal berubah) → status siaran di-NULL-kan.
--   PERFORM pg_temp.harus_lolos('15a pindah tanggal',
--     format('UPDATE form_submissions SET start_date = start_date - 7, end_date = end_date - 7 WHERE id = %L', p[5]));
--   IF (SELECT broadcast_at FROM ad_schedules WHERE id = m[5]) IS NOT NULL THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 15b: status siaran tidak di-reset';
--   END IF;
--
--   -- 16 Iklan berjam kustom: jendela undian = jam kustom (dulu 15.00).
--   PERFORM pg_temp.sebagai('');
--   UPDATE form_submissions SET airing_hour_wib = 10, airing_minute_wib = 0 WHERE id = p[4];
--   SELECT * INTO r FROM pg_temp.undian(p[4]);
--   IF r.mulai <> (SELECT start_date FROM ad_schedules WHERE id = m[4])
--      OR extract(hour FROM r.mulai AT TIME ZONE 'Asia/Jakarta') <> 10 THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 16: jendela jam kustom %', r.mulai;
--   END IF;
--
--   -- 17 Bulan undian perpanjangan = bulan WIB (akhir 1 Des 00.30 WIB → 2025-12).
--   INSERT INTO ad_schedules (submission_id, ordinal, source_table, source_id,
--                             start_date, end_date, duration, status, review_status,
--                             payment_status, distribution_type, slot_booked_by)
--   VALUES (p[4], 902, 'form_submissions_extend', gen_random_uuid(),
--           timestamptz '2025-11-24 00:30+07', timestamptz '2025-12-01 00:30+07', 7,
--           'completed', 'approved', 'paid', 'regular', 'admin');
--   IF NOT EXISTS (SELECT 1 FROM ad_schedules WHERE submission_id = p[4] AND ordinal = 902
--                    AND period_batch = '2025-12') THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 17: period_batch bukan bulan WIB';
--   END IF;
--
--   -- 18 Halaman Kilat BARU lahir berjendela [gelombang, +24 jam), bukan NULL.
--   UPDATE form_submissions
--      SET distribution_type = 'kilat', kilat_slot_hour = 11, airing_hour_wib = NULL,
--          start_date = d, end_date = d + 1
--    WHERE id = q;
--   PERFORM ensure_survey_page(q);
--   IF NOT EXISTS (SELECT 1 FROM survey_pages WHERE submission_id = q
--                    AND publish_start_date = kilat_instant_of(d, 11::smallint)
--                    AND publish_end_date   = kilat_instant_of(d + 1, 11::smallint)) THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 18: halaman Kilat baru tidak berjendela gelombang';
--   END IF;
--
--   RAISE EXCEPTION 'UJI_LULUS — 20 kasus lolos (hari uji %). Exception ini disengaja: semua tulisan uji dibatalkan.', d;
-- END
-- $uji$;
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK MIGRASI — mengembalikan keadaan produksi 15 Okt 2026 PERSIS
-- (md5 di Langkah 1a). Status siaran yang sudah ditulis toggle IKUT HILANG
-- (kolomnya dibuang); halaman Kilat yang lahir sesudah berkas ini tetap
-- memegang jendelanya. backup.r118_rewards_before tidak disentuh.
-- ============================================================================
--
-- BEGIN;
--
-- DROP TRIGGER trg_ad_schedules_broadcast_guard ON public.ad_schedules;
--
-- CREATE OR REPLACE FUNCTION public.get_batch_rewards_bulk(p_submission_ids uuid[])
--  RETURNS TABLE(submission_id uuid, period_batch text, prize_per_winner integer, winner_count integer, batch_status text, can_select_winners boolean, start_date timestamp with time zone, end_date timestamp with time zone)
--  LANGUAGE plpgsql
--  SECURITY DEFINER
-- AS $function$
-- BEGIN
--   RETURN QUERY
--   WITH all_periods AS (
--     SELECT
--       fs.id AS sid,
--       TO_CHAR(fs.end_date, 'YYYY-MM') AS pb,
--       fs.prize_per_winner AS base_p,
--       0 AS add_p,
--       fs.winner_count AS wc,
--       fs.submission_status AS status,
--       airing_instant_of_date(fs.start_date) AS sd,
--       airing_instant_of_date(fs.end_date)   AS ed
--     FROM form_submissions fs
--     WHERE fs.id = ANY(p_submission_ids)
--       AND fs.submission_status NOT IN ('rejected', 'spam')
--
--     UNION ALL
--
--     SELECT
--       a.submission_id AS sid,
--       a.period_batch AS pb,
--       COALESCE(a.prize_per_winner, 0) AS base_p,
--       COALESCE(a.additional_prize_per_winner, 0) AS add_p,
--       COALESCE(a.winner_count, 0) AS wc,
--       a.status AS status,
--       a.start_date AS sd,
--       a.end_date AS ed
--     FROM ad_schedules a
--     WHERE a.source_table = 'form_submissions_extend'
--       AND a.submission_id = ANY(p_submission_ids)
--       AND a.payment_status = 'paid'
--   ),
--   batch_agg AS (
--     SELECT
--       ap.sid,
--       ap.pb,
--       MAX(CASE WHEN ap.base_p > 0 THEN ap.base_p ELSE 0 END) AS base_prize,
--       SUM(ap.add_p) AS total_additional,
--       MAX(CASE WHEN ap.wc > 0 THEN ap.wc ELSE 0 END) AS wc,
--       BOOL_OR(
--         ap.status IN ('live', 'scheduled', 'paid', 'waiting_payment')
--         AND (ap.ed IS NULL OR ap.ed > NOW())
--       ) AS has_active,
--       MIN(ap.sd) AS start_d,
--       MAX(ap.ed) AS end_d
--     FROM all_periods ap
--     GROUP BY ap.sid, ap.pb
--   )
--   SELECT
--     ba.sid,
--     ba.pb,
--     (ba.base_prize + ba.total_additional)::INTEGER,
--     ba.wc::INTEGER,
--     CASE WHEN ba.has_active THEN 'active'::TEXT ELSE 'closed'::TEXT END,
--     NOT ba.has_active,
--     ba.start_d,
--     ba.end_d
--   FROM batch_agg ba
--   ORDER BY ba.sid, ba.pb;
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.compute_extend_period_batch()
--  RETURNS trigger
--  LANGUAGE plpgsql
-- AS $function$
-- BEGIN
--   IF NEW.end_date IS NOT NULL THEN
--     NEW.period_batch := TO_CHAR(NEW.end_date, 'YYYY-MM');
--   END IF;
--   NEW.updated_at := NOW();
--   RETURN NEW;
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.ensure_survey_page(p_submission_id uuid)
--  RETURNS uuid
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_sub        RECORD;
--   v_base_slug  TEXT;
--   v_slug       TEXT;
--   v_suffix     INT := 2;
--   v_page_id    UUID;
--   v_is_kilat   BOOLEAN;
--   v_closed_at  TIMESTAMPTZ;
--   -- Mirror of defaultSurveiAdBlocks in
--   -- src/components/PageBuilder/PageBuilderModal.tsx. Two copies of a static
--   -- template is the lesser evil versus an edge function for three paragraphs —
--   -- but if you change one, change the other.
--   v_blocks JSONB := '{
--     "type": "doc",
--     "content": [
--       {"type":"paragraph","content":[{"type":"text","text":"Hi Jakpaters! Yuk, isi survei berikut sesuai dengan kondisi kamu saat ini. Hanya responden yang sesuai kriteria, mengisi dengan serius, dan tidak menjawab asal-asalan yang akan masuk ke dalam undian 😉"}]},
--       {"type":"paragraph","content":[{"type":"text","text":"Jangan lupa untuk mengisi Jakpat ID kamu dengan benar (tanpa teks \"https://jakpat.net/s/\" di awal dan tanpa spasi di dalam Jakpat ID mu)."}]},
--       {"type":"paragraph","content":[{"type":"text","text":"Semua pemenang undian survei akan diumumkan setiap akhir bulan, jadi tunggu pengumuman dari kami ya. Semoga beruntung! ✨"}]}
--     ]
--   }'::JSONB;
-- BEGIN
--   -- Already has a page: return it. This is the retry path.
--   --
--   -- sql/99: KECUALI jendelanya ditutup SISTEM (auto_closed_at) — order ini
--   -- pernah keluar dari status tayang lalu kini dibayar lagi. Tulis ulang
--   -- jendelanya dengan rumus yang SAMA dengan INSERT di bawah (reguler 15:00
--   -- WIB; Kilat jam gelombang, akhir NULL), lalu kosongkan penandanya.
--   -- Halaman yang ditutup/diedit admin sendiri (auto_closed_at NULL) tidak
--   -- pernah disentuh di sini.
--   --
--   -- Penjaga order_is_airable: fungsi ini bisa dipanggil langsung oleh
--   -- service_role; jangan sampai membuka jendela order yang belum lunas.
--   -- Tanggal order NULL (slot sudah dilepas dan belum dipesan ulang) → jendela
--   -- tetap tertutup; tab Page admin menampilkannya sebagai anomali.
--   --
--   -- ⚠️ Kalau ada perpanjangan yang SEDANG tayang, jendela ini sementara
--   -- menunjuk ordinal 1 sampai cron_activate_extends menunjuknya kembali.
--   SELECT id, auto_closed_at INTO v_page_id, v_closed_at
--     FROM survey_pages WHERE submission_id = p_submission_id;
--   IF FOUND THEN
--     IF v_closed_at IS NOT NULL THEN
--       SELECT * INTO v_sub FROM form_submissions WHERE id = p_submission_id;
--       IF FOUND
--          AND order_is_airable(v_sub.payment_status, v_sub.submission_status)
--          AND v_sub.start_date IS NOT NULL
--          AND v_sub.end_date IS NOT NULL
--       THEN
--         v_is_kilat := (v_sub.distribution_type = 'kilat');
--         UPDATE survey_pages
--            SET publish_start_date = CASE WHEN v_is_kilat
--                                          THEN kilat_instant_of(v_sub.start_date, v_sub.kilat_slot_hour)
--                                          ELSE airing_instant_of_date(v_sub.start_date)
--                                     END,
--                publish_end_date   = CASE WHEN v_is_kilat
--                                          THEN NULL
--                                          ELSE airing_instant_of_date(v_sub.end_date)
--                                     END,
--                auto_closed_at     = NULL,
--                updated_at         = now()
--          WHERE id = v_page_id;
--       END IF;
--     END IF;
--     RETURN v_page_id;
--   END IF;
--
--   SELECT * INTO v_sub FROM form_submissions WHERE id = p_submission_id;
--   IF NOT FOUND THEN
--     RETURN NULL;
--   END IF;
--
--   -- ── PENOLAKAN KILAT sql/42 DICABUT DI SINI (sql/95) ───────────────────────
--   -- Dulu di titik ini berdiri:
--   --     IF v_sub.distribution_type = 'kilat' THEN RETURN NULL; END IF;
--   -- Alasan pencabutannya ada di kepala berkas ini. Ringkasnya: halaman Kilat
--   -- tidak pernah muncul di /pages maupun /api/surveys, jadi ia tidak mengambil
--   -- kapasitas tayang siapa pun. Ia satu-satunya tautan yang bisa dipasang admin
--   -- ke dalam survei Jakpat. Tanpa halaman, iklan Kilat tidak bisa disiarkan
--   -- sama sekali.
--   v_is_kilat := (v_sub.distribution_type = 'kilat');
--
--   -- Prerequisites. A page without a working survey link is worse than no page,
--   -- and a page with no window would be published indefinitely.
--   --
--   -- ⚠️ `end_date IS NULL` menolak SENYAP (RETURN NULL, tanpa error) — dan untuk
--   -- Kilat itu sekarang berarti "iklan tidak bisa disiarkan". Diukur 2026-09-18:
--   -- 2 dari 19 order Kilat lunas punya start_date DAN end_date NULL (juga NULL
--   -- di ad_schedules — tanggalnya memang tidak pernah tersimpan di mana pun).
--   -- Keduanya SENGAJA dibiarkan gugur di sini; mengisi tanggalnya = menjadwalkan
--   -- ulang order berbayar tanpa diminta, itu keputusan bisnis. Panel admin tab
--   -- Page menampilkannya sebagai anomali yang berteriak, bukan kegagalan senyap.
--   IF v_sub.submission_status IN ('rejected', 'spam')
--      OR COALESCE(BTRIM(v_sub.survey_url), '') = ''
--      OR v_sub.start_date IS NULL
--      OR v_sub.end_date IS NULL
--      OR COALESCE(BTRIM(v_sub.title), '') = ''
--   THEN
--     RETURN NULL;
--   END IF;
--
--   -- Slug: same rules as generateSlug() in PageBuilderModal.tsx — lowercase,
--   -- strip anything but a-z 0-9 space hyphen, spaces to hyphens, collapse
--   -- hyphens, cap at 60.
--   v_base_slug := LEFT(
--     REGEXP_REPLACE(
--       REGEXP_REPLACE(
--         REGEXP_REPLACE(LOWER(BTRIM(v_sub.title)), '[^a-z0-9[:space:]-]', '', 'g'),
--         '[[:space:]]+', '-', 'g'),
--       '-+', '-', 'g'),
--     60);
--   v_base_slug := BTRIM(v_base_slug, '-');
--
--   IF v_base_slug = '' THEN
--     v_base_slug := 'survei';
--   END IF;
--
--   -- Uniqueness matters far more here than when an admin was watching: the
--   -- public page loads with .eq('slug', slug).single(), so two pages sharing a
--   -- slug break BOTH of them.
--   v_slug := v_base_slug;
--   IF EXISTS (SELECT 1 FROM survey_pages WHERE slug = v_slug) THEN
--     v_slug := LEFT(v_base_slug, 53) || '-' || LEFT(p_submission_id::TEXT, 6);
--     WHILE EXISTS (SELECT 1 FROM survey_pages WHERE slug = v_slug) LOOP
--       v_slug := LEFT(v_base_slug, 51) || '-' || LEFT(p_submission_id::TEXT, 6) || '-' || v_suffix;
--       v_suffix := v_suffix + 1;
--     END LOOP;
--   END IF;
--
--   -- Note there is no criteria column to fill: respondent criteria live on
--   -- form_submissions.criteria_responden and the public page reads them through
--   -- the join, exactly as PageBuilderModal does. survey_pages.criteria (jsonb)
--   -- is a different, unused column — do not repurpose it here.
--   INSERT INTO survey_pages (
--     submission_id, slug, title, banner_url, is_published,
--     blocks, custom_fields,
--     publish_start_date, publish_end_date,
--     redirect_url, is_extra_ad, is_hidden,
--     display_order, requires_banner_update
--   ) VALUES (
--     p_submission_id,
--     v_slug,
--     v_sub.title,
--     -- Generic ad banner, served from public/. Not a technical fallback: without
--     -- one the Jakpat app falls back to its own card styling, which looks
--     -- nothing like an ad, and respondents cannot tell a paid survey from an
--     -- announcement. Deliberately carries no prize figure, so it never goes
--     -- stale when a reward batch changes.
--     -- DUPLICATED as DEFAULT_AD_BANNER_URL in src/utils/constants.ts.
--     '/default-ad-banner.jpg',
--     -- ⚠️ WAJIB TRUE, juga untuk Kilat. /api/respondents menyaring HANYA kolom
--     -- ini; undian pemenang berantai survey_pages.id → page_respondents.page_id
--     -- → jakpat_id. is_published=FALSE berarti pemenang Kilat tidak akan pernah
--     -- bisa diundi. Penyembunyian Kilat dikerjakan di tempat lain (lihat bawah).
--     TRUE,
--     v_blocks,
--     '[]'::JSONB,
--
--     -- ── JENDELA TERBIT — BERCABANG (sql/95) ───────────────────────────────
--     --
--     -- MULAI. Reguler tayang 15:00 WIB pada tanggalnya; Kilat pada jam
--     -- gelombangnya (08/11/14/17 WIB). kilat_instant_of (sql/45:99) sudah
--     -- menangani kilat_slot_hour NULL → 00:00 WIB, sentinel yang sah: halaman
--     -- tetap terbit dan tetap bisa dibuka sepanjang hari itu.
--     --
--     -- ⚠️ sql/99: rumus ini DIULANG di cabang buka-ulang di atas. Ubah satu,
--     -- ubah keduanya.
--     CASE WHEN v_is_kilat
--          THEN kilat_instant_of(v_sub.start_date, v_sub.kilat_slot_hour)
--          ELSE airing_instant_of_date(v_sub.start_date)
--     END,
--
--     -- SELESAI. Reguler mengikuti end_date. Kilat: NULL.
--     --
--     -- ⚠️⚠️ NULL DI SINI BUKAN KELALAIAN. JANGAN "PERBAIKI". ⚠️⚠️
--     --
--     -- publish_end_date tidak menutup undian — ia menutup HALAMANNYA.
--     -- SurveyPage.tsx:214-219 menolak SEMUA pengunjung sesudah tanggal itu
--     -- lewat ("Survey sudah berakhir."), termasuk responden yang baru saja
--     -- menekan push notification.
--     --
--     -- Untuk reguler itu benar: halaman hidup 7 hari, sama dengan masa tayang.
--     -- Untuk Kilat jendelanya cuma 24 jam, sementara tautannya SUDAH tertanam
--     -- di dalam survei Jakpat dan tidak bisa ditarik dari sisi kita. Tautan mati
--     -- sementara push-nya masih beredar = responden mendarat di halaman tolak.
--     --
--     -- Jalur perpanjangan normal juga tertutup untuk Kilat: cron_activate_extends
--     -- (sql/73:113-125) memindahkan jendela ke jadwal berikutnya, tapi Kilat
--     -- diblokir dari penjadwalan ulang (canScheduleAgain.ts:50, sql/86:157-160).
--     --
--     -- NULL bukan konsep baru — ia konvensi yang sudah diuji:
--     --   pageReachability.spec.ts:70 ...... jendela NULL → 'live'
--     --   adOrdering.ts:69-70 .............. memperlakukan NULL sama
--     --   PublishPageManagement.tsx:116-117  filter Live meloloskan NULL
--     --
--     -- UNDIAN TETAP TERTUTUP, lewat jalur yang TERPISAH SAMA SEKALI:
--     -- get_batch_rewards_bulk membaca form_submissions.end_date dan
--     -- ad_schedules.end_date — BUKAN publish_end_date. end_date Kilat sudah
--     -- diisi start_date + 1 hari oleh updateKilatSchedule (supabase.ts:3166),
--     -- jadi can_select_winners menyala sendiri 24 jam sesudah gelombang.
--     -- ⚠️ Karena itu form_submissions.end_date Kilat TIDAK BOLEH dikosongkan
--     -- oleh perubahan apa pun: ed NULL = undian beku SELAMANYA, senyap.
--     --
--     -- KONSEKUENSI YANG DITERIMA SADAR: storage-cleanup.js:53-55 membersihkan
--     -- aset 7 hari sesudah publish_end_date, jadi banner Kilat TIDAK PERNAH
--     -- terjangkau pembersih itu. Konsisten dengan "tautan tak boleh mati".
--     CASE WHEN v_is_kilat
--          THEN NULL
--          ELSE airing_instant_of_date(v_sub.end_date)
--     END,
--
--     NULL,
--     FALSE,
--     -- ⚠️ is_hidden tetap FALSE, JUGA untuk Kilat — jangan tergoda memakainya.
--     -- Penyembunyian Kilat bersifat STRUKTURAL lewat distribution_type, disaring
--     -- di SurveyListingPage.tsx dan functions/api/surveys.js. Memakai is_hidden
--     -- di sini akan salah sasaran dua kali: (a) ia tidak dihormati
--     -- /api/respondents, jadi tidak menyembunyikan apa pun yang penting; dan
--     -- (b) ia mencampuradukkan "disembunyikan admin" dengan "memang bukan iklan
--     -- feed", sehingga admin yang menyembunyikan halaman reguler dan halaman
--     -- Kilat tidak lagi bisa dibedakan.
--     FALSE,                    -- visible in the app feed, per the 2026-08-03 decision
--     -- NULL, not MAX+1 (sql/40/42's original rule) — reverted 2026-08-13.
--     -- orderBand() in src/utils/adOrdering.ts treats a NULL, non-extra-ad page
--     -- as band 0 (TOP), exactly like a manually-built page always got. Ordering
--     -- no longer depends on whether a real banner has been uploaded yet, so a
--     -- paying customer's ad isn't punished for an admin follow-up step nobody
--     -- has done yet. set_survey_pages_order() still lets an admin place any
--     -- page manually whenever they want.
--     NULL,
--     -- FALSE, deliberately. The flag means "the banner is showing stale reward
--     -- info" — that is what the DOKU webhook sets it for, when a new batch or a
--     -- top-up changes the prize. A page that has no banner has nothing stale to
--     -- show. Setting it TRUE here would raise a badge on every newly paid order,
--     -- and since 235 of 262 published pages already run with no banner at all,
--     -- that badge would be permanent and universal. A warning that is always on
--     -- is a warning that stops being read.
--     FALSE
--   )
--   RETURNING id INTO v_page_id;
--
--   RETURN v_page_id;
-- END;
-- $function$;
--
-- DROP FUNCTION public.kilat_broadcast_start(uuid, text);
-- DROP FUNCTION public.kilat_broadcast_end(uuid, text);
-- DROP FUNCTION public.kilat_broadcast_undo(uuid);
-- DROP FUNCTION public.guard_broadcast_columns();
-- DROP FUNCTION public.kilat_page_window(uuid);
-- DROP FUNCTION public.airing_window_end(timestamptz, timestamptz, timestamptz, timestamptz);
-- DROP FUNCTION public.airing_window_start(timestamptz, timestamptz);
--
-- ALTER TABLE public.ad_schedules
--   DROP CONSTRAINT ad_schedules_broadcast_order,
--   DROP COLUMN broadcast_at,
--   DROP COLUMN broadcast_by,
--   DROP COLUMN broadcast_ended_at,
--   DROP COLUMN broadcast_ended_by;
--
-- COMMIT;
