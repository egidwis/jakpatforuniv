-- ============================================================================
-- sql/130 — SIARAN KILAT v2: pintu Kilat, live sampai dimatikan, nyala lagi
--           tanpa bayar, penjaga isian di database
-- ============================================================================
--
-- Rencana: ~/.claude/plans/bantu-aku-pelajari-dokumentasi-replicated-lantern.md
-- Keputusan pemilik produk 27 Okt 2026: tanpa batas waktu live, tenggang
-- 60 menit, 17 halaman Kilat lama ditutup, Push B sesudah model ini live.
-- Prasyarat: sql/118 + sql/119 (fungsi siaran & cron perpanjangan) hidup.
--
-- ── PERILAKU SESUDAH BERKAS INI ─────────────────────────────────────────────
--
--   V1  Jendela Kilat per gelombang (ad_schedules), SATU rumus untuk halaman,
--       undian, cron, dan email:
--         mulai   = kilat_window_start(start, broadcast_at)
--                 = COALESCE(broadcast_at, start − kilat_lead())   (60 menit)
--         selesai = broadcast_ended_at        — NULL = masih live, TANPA batas
--         tutup   = kilat_window_close(selesai) = selesai + submit_grace()
--       Halaman: publish_start = mulai, publish_end = selesai.
--       Undian:  period = [mulai, tutup]; can_select_winners baru true pada
--                `tutup` (NULL selama live → false).
--       Iklan TIDAK berubah (airing_window_* tidak disentuh; cabangnya
--       memilih rumus lewat distribution_type).
--   V2  Live otomatis 60 menit sebelum gelombang, tanpa cron dan tanpa tombol:
--       akibat rumus. kilat_broadcast_start/_undo menolak, HINT 'broadcast_auto'.
--   V3  kilat_broadcast_end: boleh sejak `mulai`, hanya gelombang lunas/tempo.
--       Halaman ditutup di detik itu kecuali ada gelombang lain order yang
--       sama yang sedang live.
--   V4  kilat_broadcast_reopen (baru): dalam tenggang saja, gratis, gelombang
--       & batch undian yang sama. Mencatat broadcast_reopened_at/_by (kolom
--       baru). HINT: broadcast_not_ended / broadcast_finished /
--       broadcast_superseded.
--   V5  cron_activate_extends: gelombang Kilat yang lebih baru sudah mulai →
--       gelombang lama (termasuk ordinal 1) selesai di detik `mulai` yang baru.
--       Perpanjangan Kilat live pada `mulai`, completed pada `tutup`. Cabang
--       Iklan identik dengan sql/119 (hanya ditambah saringan bukan Kilat).
--   V6  notify_primary_ads_completed: Kilat memakai `tutup`, bukan end_date.
--   V7  Penjaga isian BARU — BEFORE INSERT page_respondents, untuk SEMUA
--       halaman (Iklan juga): ditolak bila halaman tidak terbit, sebelum
--       publish_start, atau sesudah publish_end + submit_grace(). NULL =
--       terbuka. service_role / koneksi langsung dilewatkan. HINT 'page_closed'.
--       Sampai hari ini isian bisa masuk ke halaman mana pun, kapan pun
--       (INSERT WITH CHECK (true), nol trigger) — penyebab insiden 18 Sep.
--   V8  Migrasi data (dalam transaksi yang sama):
--         a. BEKUKAN RIWAYAT — gelombang Kilat yang jendela lamanya (sql/118)
--            sudah habis dan broadcast_ended_at masih NULL diisi akhir jendela
--            lama. Tanpa ini setiap gelombang lampau hidup lagi tanpa batas.
--         b. TUTUP 17 halaman Kilat lama (publish_end_date NULL) pada now() —
--            bukan pada tanggal Agustusnya, supaya storage-cleanup.js (retensi
--            60 hari dari publish_end_date) tidak langsung menghapus bukti
--            respondennya.
--       Snapshot sebelum perubahan di skema `backup` (tanpa hibah anon).
--
-- ── URUTAN ──────────────────────────────────────────────────────────────────
--
--   Langkah 1 (pra-cek, baca saja) → Langkah 2 (migrasi, satu transaksi) →
--   Langkah 3 (verifikasi) → push kode Siaran Kilat v2 SEGERA sesudahnya.
--   Selama jeda: UI lama menampilkan fase lama & tombol "Nyalakan" ditolak
--   dengan HINT broadcast_auto — tidak ada tulisan yang salah.
--   Jalankan di SQL Editor Supabase. JANGAN lewat MCP.
--
--   Diuji di PGlite (badan fungsi prod 27 Okt): lihat ringkasan di commit.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — PRA-CEK (baca saja)
-- ============================================================================
--
-- 1a. Badan fungsi yang hidup harus SAMA dengan salinan di blok ROLLBACK
--     (diambil 27 Okt 2026). Harapan: delapan baris `sama = true`.
--
-- SELECT p.proname,
--        md5(pg_get_functiondef(p.oid)) = CASE p.proname
--          WHEN 'kilat_page_window'            THEN '5d6fb391ae8589f7ae987bd2dc47f73e'
--          WHEN 'kilat_broadcast_start'        THEN '7c566bd6443083dd342ed6b3fa5afb4d'
--          WHEN 'kilat_broadcast_end'          THEN 'c7d87af364da1d3fd4bea5fa1ad83d8e'
--          WHEN 'kilat_broadcast_undo'         THEN '9cdad19289c70638af99d31f9e9689b1'
--          WHEN 'guard_broadcast_columns'      THEN 'b727bba46962fa67b659e9b9748ac376'
--          WHEN 'get_batch_rewards_bulk'       THEN 'c9a1ccd3975dc20a14621554f388a4f5'
--          WHEN 'cron_activate_extends'        THEN '935f56a3560eba50fdc4961297e7fe6f'
--          WHEN 'notify_primary_ads_completed' THEN '7393d15c82a3f8a6ea1f13a478d6767e'
--        END AS sama
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('kilat_page_window', 'kilat_broadcast_start', 'kilat_broadcast_end',
--                     'kilat_broadcast_undo', 'guard_broadcast_columns',
--                     'get_batch_rewards_bulk', 'cron_activate_extends',
--                     'notify_primary_ads_completed')
-- ORDER BY 1;
--
-- 1b. Nama baru belum dipakai. Harapan: 0 baris.
--
-- SELECT proname::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND proname IN ('kilat_lead', 'submit_grace', 'kilat_window_start', 'kilat_window_close',
--                   'kilat_broadcast_reopen', 'guard_page_respondent_window')
-- UNION ALL
-- SELECT column_name::text FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'ad_schedules'
--   AND column_name LIKE 'broadcast_reopened%'
-- UNION ALL
-- SELECT tgname::text FROM pg_trigger WHERE tgrelid = 'public.page_respondents'::regclass
--   AND NOT tgisinternal
-- UNION ALL
-- SELECT table_name::text FROM information_schema.tables
-- WHERE table_schema = 'backup' AND table_name LIKE 'r130_%';
--
-- 1c. DRY-RUN V8a — gelombang Kilat yang akan dibekukan. Per 27 Okt: semua
--     baris lunas sudah selesai (18 backfill sql/118/127) kecuali #3a432277
--     (order uji; jendela lamanya habis 27 Okt 15.00 WIB) + baris belum lunas
--     yang tanggalnya lewat. Harapan: TIDAK ada baris lunas dengan
--     akhir_lama > now() (itu gelombang yang masih live — dibiarkan).
--
-- SELECT left(a.submission_id::text, 8) AS id, a.source_table, a.status, a.payment_status,
--        a.start_date, a.broadcast_at,
--        airing_window_end(a.start_date, a.end_date, a.broadcast_at, NULL) AS akhir_lama
-- FROM ad_schedules a
-- WHERE a.distribution_type = 'kilat' AND a.broadcast_ended_at IS NULL
-- ORDER BY a.start_date NULLS LAST;
--
-- 1d. DRY-RUN V8b — halaman Kilat yang akan ditutup. Harapan per 27 Okt: 17.
--
-- SELECT sp.id, sp.slug, sp.publish_start_date
-- FROM survey_pages sp JOIN form_submissions fs ON fs.id = sp.submission_id
-- WHERE fs.distribution_type = 'kilat' AND sp.publish_end_date IS NULL;
--
-- 1e. DRY-RUN V7 — isian 60 hari terakhir yang AKAN ditolak penjaga bila
--     jendela halamannya saat itu sama dengan sekarang. Per 27 Okt: Iklan
--     8 dari 59.727 (sesudah akhir + 60 menit); Kilat 0. Kolom sebelum_mulai
--     TIDAK berarti (cron perpanjangan menggeser publish_start ke depan
--     sesudah isiannya masuk — 5.898 baris, semuanya order berperpanjangan).
--
-- SELECT fs.distribution_type, count(*) AS total,
--        count(*) FILTER (WHERE NOT sp.is_published) AS tak_terbit,
--        count(*) FILTER (WHERE sp.publish_end_date IS NOT NULL
--                           AND pr.created_at >= sp.publish_end_date + interval '60 minutes') AS sesudah_tenggang
-- FROM page_respondents pr
-- JOIN survey_pages sp ON sp.id = pr.page_id
-- LEFT JOIN form_submissions fs ON fs.id = sp.submission_id
-- WHERE pr.created_at > now() - interval '60 days'
-- GROUP BY 1;


-- ============================================================================
-- LANGKAH 2 — MIGRASI (satu transaksi)
-- ============================================================================

BEGIN;

-- ── 2.0 Snapshot (skema backup, tanpa hibah anon) ───────────────────────────

CREATE TABLE backup.r130_kilat_schedules_before AS
SELECT id, submission_id, broadcast_at, broadcast_by, broadcast_ended_at, broadcast_ended_by
FROM public.ad_schedules
WHERE distribution_type = 'kilat';

CREATE TABLE backup.r130_kilat_pages_before AS
SELECT sp.id, sp.publish_start_date, sp.publish_end_date, sp.updated_at
FROM public.survey_pages sp
JOIN public.form_submissions fs ON fs.id = sp.submission_id
WHERE fs.distribution_type = 'kilat';

CREATE TABLE backup.r130_rewards_before AS
SELECT r.*
FROM public.get_batch_rewards_bulk(ARRAY(SELECT id FROM public.form_submissions)) r;

REVOKE ALL ON backup.r130_kilat_schedules_before FROM PUBLIC, anon, authenticated;
REVOKE ALL ON backup.r130_kilat_pages_before     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON backup.r130_rewards_before         FROM PUBLIC, anon, authenticated;

-- ── 2.1 Kolom nyala-lagi ────────────────────────────────────────────────────

ALTER TABLE public.ad_schedules
  ADD COLUMN broadcast_reopened_at timestamptz,
  ADD COLUMN broadcast_reopened_by text;

COMMENT ON COLUMN public.ad_schedules.broadcast_reopened_at IS
  'sql/130: terakhir kali admin menyalakan lagi siaran Kilat dalam tenggang (kilat_broadcast_reopen).';

-- ── 2.2 Konstanta & rumus jendela Kilat ─────────────────────────────────────
-- ⚠️ DUPLIKAT di src/utils/kilatBroadcast.ts (KILAT_LEAD_MS, SUBMIT_GRACE_MS);
-- tes paritas kilatBroadcast.spec.ts membaca berkas ini.

CREATE OR REPLACE FUNCTION public.kilat_lead()
RETURNS interval LANGUAGE sql IMMUTABLE
AS $$ SELECT interval '60 minutes' $$;

CREATE OR REPLACE FUNCTION public.submit_grace()
RETURNS interval LANGUAGE sql IMMUTABLE
AS $$ SELECT interval '60 minutes' $$;

CREATE OR REPLACE FUNCTION public.kilat_window_start(p_start timestamptz, p_broadcast_at timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE
AS $$ SELECT COALESCE(p_broadcast_at, p_start - public.kilat_lead()) $$;

CREATE OR REPLACE FUNCTION public.kilat_window_close(p_broadcast_ended_at timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE
AS $$ SELECT p_broadcast_ended_at + public.submit_grace() $$;

-- ── 2.3 Jendela halaman Kilat (dipakai ensure_survey_page) ──────────────────
-- Tanpa cermin (seharusnya mustahil) → jendela gelombang lama, bukan NULL
-- yang berarti terbuka selamanya.

CREATE OR REPLACE FUNCTION public.kilat_page_window(p_submission_id uuid)
 RETURNS TABLE(w_start timestamp with time zone, w_end timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(kilat_window_start(m.start_date, m.broadcast_at),
                  kilat_instant_of(fs.start_date, fs.kilat_slot_hour) - kilat_lead()),
         CASE WHEN m.id IS NULL
              THEN kilat_instant_of(fs.end_date, fs.kilat_slot_hour)
              ELSE m.broadcast_ended_at
         END
  FROM form_submissions fs
  LEFT JOIN ad_schedules m
         ON m.source_table = 'form_submissions' AND m.source_id = fs.id
  WHERE fs.id = p_submission_id;
$function$;

-- ── 2.4 Penjaga kolom siaran: ikut menjaga & mereset kolom nyala-lagi ───────

CREATE OR REPLACE FUNCTION public.guard_broadcast_columns()
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
    NEW.broadcast_at          := NULL;
    NEW.broadcast_by          := NULL;
    NEW.broadcast_ended_at    := NULL;
    NEW.broadcast_ended_by    := NULL;
    NEW.broadcast_reopened_at := NULL;
    NEW.broadcast_reopened_by := NULL;
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
       OR NEW.broadcast_ended_at IS NOT NULL OR NEW.broadcast_ended_by IS NOT NULL
       OR NEW.broadcast_reopened_at IS NOT NULL OR NEW.broadcast_reopened_by IS NOT NULL THEN
      RAISE EXCEPTION 'Status siaran hanya bisa diisi lewat panel admin.'
        USING HINT = 'broadcast_admin_only';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.broadcast_at          IS DISTINCT FROM OLD.broadcast_at
     OR NEW.broadcast_by          IS DISTINCT FROM OLD.broadcast_by
     OR NEW.broadcast_ended_at    IS DISTINCT FROM OLD.broadcast_ended_at
     OR NEW.broadcast_ended_by    IS DISTINCT FROM OLD.broadcast_ended_by
     OR NEW.broadcast_reopened_at IS DISTINCT FROM OLD.broadcast_reopened_at
     OR NEW.broadcast_reopened_by IS DISTINCT FROM OLD.broadcast_reopened_by THEN
    RAISE EXCEPTION 'Status siaran hanya bisa diubah lewat panel admin.'
      USING HINT = 'broadcast_admin_only';
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 2.5 RPC siaran ──────────────────────────────────────────────────────────

-- Nyala sekarang otomatis (V2). Tanda tangan dipertahankan supaya UI lama
-- selama jeda deploy mendapat pesan yang jelas, bukan 404.
CREATE OR REPLACE FUNCTION public.kilat_broadcast_start(p_schedule_id uuid, p_by text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Siaran Kilat sekarang live otomatis 60 menit sebelum gelombang.'
    USING HINT = 'broadcast_auto';
END;
$function$;

CREATE OR REPLACE FUNCTION public.kilat_broadcast_undo(p_schedule_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Siaran Kilat sekarang live otomatis; tidak ada nyala manual untuk dibatalkan.'
    USING HINT = 'broadcast_auto';
END;
$function$;

CREATE OR REPLACE FUNCTION public.kilat_broadcast_end(p_schedule_id uuid, p_by text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a        ad_schedules%ROWTYPE;
  v_now    timestamptz := now();
  v_start  timestamptz;
  v_resp   int;
  v_pages  int := 0;
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
  IF a.start_date IS NULL THEN
    RAISE EXCEPTION 'Jadwal ini belum punya gelombang.' USING HINT = 'broadcast_no_wave';
  END IF;
  IF NOT (COALESCE(a.payment_status IN ('paid', 'completed'), false)
          OR a.air_on_credit_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Gelombang ini belum lunas.' USING HINT = 'broadcast_unpaid';
  END IF;
  IF a.broadcast_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'Siaran gelombang ini sudah dimatikan.' USING HINT = 'broadcast_finished';
  END IF;

  v_start := kilat_window_start(a.start_date, a.broadcast_at);
  IF v_now < v_start THEN
    RAISE EXCEPTION 'Siaran gelombang ini belum mulai (live otomatis %).',
      to_char(v_start AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI "WIB"')
      USING HINT = 'broadcast_not_started';
  END IF;

  UPDATE ad_schedules
     SET broadcast_ended_at = v_now, broadcast_ended_by = btrim(p_by)
   WHERE id = a.id;

  -- Halaman satu per order. Ditutup hanya bila tidak ada gelombang lain
  -- yang sedang live (mis. mematikan gelombang lama di sela tick cron).
  IF NOT EXISTS (
    SELECT 1 FROM ad_schedules o
    WHERE o.submission_id = a.submission_id
      AND o.id <> a.id
      AND o.distribution_type = 'kilat'
      AND o.start_date IS NOT NULL
      AND o.broadcast_ended_at IS NULL
      AND (COALESCE(o.payment_status IN ('paid', 'completed'), false) OR o.air_on_credit_at IS NOT NULL)
      AND COALESCE(o.status, '') NOT IN ('cancelled', 'slot_cancelled', 'rejected', 'spam')
      AND kilat_window_start(o.start_date, o.broadcast_at) <= v_now
  ) THEN
    UPDATE survey_pages
       SET publish_end_date = v_now,
           updated_at       = v_now
     WHERE submission_id = a.submission_id
       AND auto_closed_at IS NULL
       AND (publish_end_date IS NULL OR publish_end_date > v_now);
    GET DIAGNOSTICS v_pages = ROW_COUNT;
  END IF;

  SELECT count(*) INTO v_resp
  FROM page_respondents pr JOIN survey_pages sp ON sp.id = pr.page_id
  WHERE sp.submission_id = a.submission_id AND pr.created_at >= v_start;

  RETURN jsonb_build_object('broadcast_ended_at', v_now,
                            'closes_at', kilat_window_close(v_now),
                            'respondents', v_resp,
                            'pages', v_pages);
END;
$function$;

CREATE OR REPLACE FUNCTION public.kilat_broadcast_reopen(p_schedule_id uuid, p_by text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a        ad_schedules%ROWTYPE;
  v_now    timestamptz := now();
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
  IF a.broadcast_ended_at IS NULL THEN
    RAISE EXCEPTION 'Siaran gelombang ini masih live.' USING HINT = 'broadcast_not_ended';
  END IF;
  -- Sesudah tenggang pemenang sudah bisa dipilih: membuka lagi = pendaftar
  -- sesudah undian (alasan kunci satu arah 14 Okt tetap berlaku di sini).
  IF v_now >= kilat_window_close(a.broadcast_ended_at) THEN
    RAISE EXCEPTION 'Masa tenggang 60 menit sudah lewat; siaran gelombang ini terkunci.'
      USING HINT = 'broadcast_finished';
  END IF;
  IF EXISTS (
    SELECT 1 FROM ad_schedules o
    WHERE o.submission_id = a.submission_id
      AND o.id <> a.id
      AND o.distribution_type = 'kilat'
      AND o.start_date > a.start_date
      AND (COALESCE(o.payment_status IN ('paid', 'completed'), false) OR o.air_on_credit_at IS NOT NULL)
      AND COALESCE(o.status, '') NOT IN ('cancelled', 'slot_cancelled', 'rejected', 'spam')
      AND kilat_window_start(o.start_date, o.broadcast_at) <= v_now
  ) THEN
    RAISE EXCEPTION 'Gelombang berikutnya order ini sudah live; gelombang ini tidak bisa dinyalakan lagi.'
      USING HINT = 'broadcast_superseded';
  END IF;

  UPDATE ad_schedules
     SET broadcast_ended_at    = NULL,
         broadcast_ended_by    = NULL,
         broadcast_reopened_at = v_now,
         broadcast_reopened_by = btrim(p_by)
   WHERE id = a.id;

  UPDATE survey_pages
     SET publish_end_date = NULL,
         updated_at       = v_now
   WHERE submission_id = a.submission_id
     AND auto_closed_at IS NULL;
  GET DIAGNOSTICS v_pages = ROW_COUNT;

  RETURN jsonb_build_object('reopened_at', v_now, 'pages', v_pages);
END;
$function$;

-- ── 2.6 Undian: cabang Kilat ────────────────────────────────────────────────
-- Cabang Iklan (ELSE) = ekspresi sql/118 apa adanya. end_d batch: MAX()
-- mengabaikan NULL, jadi batch dengan gelombang Kilat yang masih live
-- dipaksa NULL — kalau tidak, period.end menunjuk gelombang lama yang sudah
-- selesai padahal batch masih menerima isian.

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
    -- sql/130: Kilat = [kilat_window_start, kilat_window_close], NULL = live.
    SELECT
      fs.id AS sid,
      TO_CHAR(fs.end_date, 'YYYY-MM') AS pb,
      fs.prize_per_winner AS base_p,
      0 AS add_p,
      fs.winner_count AS wc,
      fs.submission_status AS status,
      (m.id IS NOT NULL AND m.distribution_type = 'kilat') AS is_k,
      CASE WHEN m.id IS NOT NULL AND m.distribution_type = 'kilat'
           THEN kilat_window_start(m.start_date, m.broadcast_at)
           ELSE COALESCE(airing_window_start(m.start_date, m.broadcast_at),
                         airing_instant_of_date(fs.start_date))
      END AS sd,
      CASE WHEN m.id IS NOT NULL AND m.distribution_type = 'kilat'
           THEN kilat_window_close(m.broadcast_ended_at)
           ELSE COALESCE(airing_window_end(m.start_date, m.end_date, m.broadcast_at, m.broadcast_ended_at),
                         airing_instant_of_date(fs.end_date))
      END AS ed
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
      (a.distribution_type = 'kilat') AS is_k,
      CASE WHEN a.distribution_type = 'kilat'
           THEN kilat_window_start(a.start_date, a.broadcast_at)
           ELSE airing_window_start(a.start_date, a.broadcast_at)
      END AS sd,
      CASE WHEN a.distribution_type = 'kilat'
           THEN kilat_window_close(a.broadcast_ended_at)
           ELSE airing_window_end(a.start_date, a.end_date, a.broadcast_at, a.broadcast_ended_at)
      END AS ed
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
      CASE WHEN BOOL_OR(ap.is_k AND ap.ed IS NULL) THEN NULL ELSE MAX(ap.ed) END AS end_d
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

-- ── 2.7 Cron perpanjangan ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cron_activate_extends()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- 0. sql/130 — Kilat: gelombang yang lebih baru sudah mulai → gelombang
  --    lama order yang sama (termasuk ordinal 1) selesai di detik `mulai`
  --    gelombang baru, supaya responden dua gelombang tidak tercampur.
  UPDATE ad_schedules o
  SET broadcast_ended_at = GREATEST(kilat_window_start(o.start_date, o.broadcast_at), nx.n_start),
      broadcast_ended_by = 'sistem: gelombang berikutnya'
  FROM (
    SELECT o2.id, MIN(kilat_window_start(a.start_date, a.broadcast_at)) AS n_start
    FROM ad_schedules o2
    JOIN ad_schedules a
      ON a.submission_id = o2.submission_id
     AND a.id <> o2.id
     AND a.distribution_type = 'kilat'
     AND a.start_date > o2.start_date
     AND (a.payment_status IN ('paid', 'completed') OR a.air_on_credit_at IS NOT NULL)
     AND COALESCE(a.status, '') NOT IN ('cancelled', 'slot_cancelled', 'rejected', 'spam')
     AND kilat_window_start(a.start_date, a.broadcast_at) <= NOW()
    WHERE o2.distribution_type = 'kilat'
      AND o2.start_date IS NOT NULL
      AND o2.broadcast_ended_at IS NULL
    GROUP BY o2.id
  ) nx
  WHERE o.id = nx.id;

  -- 1. Aktifkan jadwal yang jendelanya sudah mulai.
  --    review_status ikut disegarkan dari induk — padanan tambahan sql/70 di
  --    extend_view_update(), dan SENGAJA hanya untuk baris yang bertransisi,
  --    persis selingkup perilaku lama.
  --    sql/102: jadwal kredit (tayang sebelum lunas) ikut diangkat.
  UPDATE ad_schedules a
  SET status = 'live',
      review_status = COALESCE(review_status_of(fs.submission_status), a.review_status),
      updated_at = NOW()
  FROM form_submissions fs
  WHERE fs.id = a.submission_id
    AND a.source_table = 'form_submissions_extend'
    AND a.distribution_type IS DISTINCT FROM 'kilat'
    AND a.status = 'scheduled'
    AND (a.payment_status = 'paid' OR a.air_on_credit_at IS NOT NULL)
    AND a.start_date <= NOW()
    AND a.end_date > NOW();

  -- 1k. sql/130 — perpanjangan Kilat live sejak `mulai`, tanpa batas akhir.
  UPDATE ad_schedules a
  SET status = 'live',
      review_status = COALESCE(review_status_of(fs.submission_status), a.review_status),
      updated_at = NOW()
  FROM form_submissions fs
  WHERE fs.id = a.submission_id
    AND a.source_table = 'form_submissions_extend'
    AND a.distribution_type = 'kilat'
    AND a.status = 'scheduled'
    AND (a.payment_status = 'paid' OR a.air_on_credit_at IS NOT NULL)
    AND a.start_date IS NOT NULL
    AND a.broadcast_ended_at IS NULL
    AND kilat_window_start(a.start_date, a.broadcast_at) <= NOW();

  -- 2. Arahkan halaman survei ke jadwal yang sedang tayang.
  UPDATE survey_pages sp
  -- sql/119: jendela dari SATU rumus undian (sql/118). Iklan tidak pernah
  -- punya kolom siaran → nilainya sama persis dengan dulu.
  SET publish_start_date  = airing_window_start(a.start_date, a.broadcast_at),
      publish_end_date    = airing_window_end(a.start_date, a.end_date,
                                              a.broadcast_at, a.broadcast_ended_at),
      current_period_batch = a.period_batch
  FROM ad_schedules a
  WHERE a.source_table = 'form_submissions_extend'
    AND a.distribution_type IS DISTINCT FROM 'kilat'
    AND a.submission_id = sp.submission_id
    AND a.status = 'live'
    AND a.start_date <= NOW()
    AND a.end_date > NOW();

  -- 2k. sql/130 — halaman ke perpanjangan Kilat yang sedang live. Langkah 0
  --     menjamin paling banyak satu per order. Yang sudah dimatikan tidak
  --     disentuh: kilat_broadcast_end sudah menulis publish_end_date-nya.
  UPDATE survey_pages sp
  SET publish_start_date   = kilat_window_start(a.start_date, a.broadcast_at),
      publish_end_date     = NULL,
      current_period_batch = a.period_batch
  FROM ad_schedules a
  WHERE a.source_table = 'form_submissions_extend'
    AND a.distribution_type = 'kilat'
    AND a.submission_id = sp.submission_id
    AND a.status = 'live'
    AND a.broadcast_ended_at IS NULL
    AND kilat_window_start(a.start_date, a.broadcast_at) <= NOW();

  -- 3. Tutup jadwal yang jendelanya sudah lewat.
  UPDATE ad_schedules a
  SET status = 'completed',
      review_status = COALESCE(review_status_of(fs.submission_status), a.review_status),
      updated_at = NOW()
  FROM form_submissions fs
  WHERE fs.id = a.submission_id
    AND a.source_table = 'form_submissions_extend'
    AND a.distribution_type IS DISTINCT FROM 'kilat'
    AND a.status = 'live'
    AND a.end_date <= NOW();

  -- 3k. sql/130 — perpanjangan Kilat selesai sesudah tenggang.
  UPDATE ad_schedules a
  SET status = 'completed',
      review_status = COALESCE(review_status_of(fs.submission_status), a.review_status),
      updated_at = NOW()
  FROM form_submissions fs
  WHERE fs.id = a.submission_id
    AND a.source_table = 'form_submissions_extend'
    AND a.distribution_type = 'kilat'
    AND a.status = 'live'
    AND a.broadcast_ended_at IS NOT NULL
    AND kilat_window_close(a.broadcast_ended_at) <= NOW();
END;
$function$;

-- ── 2.8 Email "iklan selesai": Kilat pada `tutup` ───────────────────────────

CREATE OR REPLACE FUNCTION public.notify_primary_ads_completed()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
DECLARE
  v_url    text;
  v_secret text;
  v_end    timestamptz;
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
           s.distribution_type,
           s.broadcast_ended_at,
           fs.email,
           fs.full_name,
           fs.title
    FROM public.ad_schedules s
    JOIN public.form_submissions fs ON fs.id = s.submission_id
    WHERE (lower(s.payment_status) = 'paid' OR s.air_on_credit_at IS NOT NULL)
      AND s.end_date IS NOT NULL
      AND fs.email IS NOT NULL
      AND s.completed_notified_at IS NULL
      AND lower(coalesce(s.status, '')) NOT IN ('rejected', 'spam', 'cancelled', 'slot_cancelled')
      AND lower(coalesce(fs.submission_status, '')) NOT IN ('rejected', 'spam', 'cancelled', 'slot_cancelled')
  LOOP
    -- sql/130: Kilat berakhir saat siaran dimatikan + tenggang (NULL = live).
    v_end := CASE WHEN rec.distribution_type = 'kilat'
                  THEN kilat_window_close(rec.broadcast_ended_at)
                  ELSE rec.end_date
             END;

    -- Belum berakhir -> lewati
    IF v_end IS NULL OR v_end > now() THEN
      CONTINUE;
    END IF;

    -- Berakhir terlalu lama (> 7 hari) -> tandai tanpa kirim
    IF v_end < now() - INTERVAL '7 days' THEN
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
        'end_date',      v_end
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
$function$;

-- ── 2.9 Penjaga isian (V7) ──────────────────────────────────────────────────
-- ⚠️ DUPLIKAT jendela di src/pages/public/SurveyPage.tsx (cek saat halaman
-- dimuat). Browser memutuskan tampilan; database memutuskan isian.

CREATE OR REPLACE FUNCTION public.guard_page_respondent_window()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  p      record;
BEGIN
  -- Koneksi langsung / service_role (perbaikan admin, impor) dilewatkan.
  IF claims IS NULL OR coalesce(claims ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT sp.is_published, sp.publish_start_date, sp.publish_end_date
    INTO p
    FROM survey_pages sp
   WHERE sp.id = NEW.page_id;
  IF NOT FOUND THEN
    RETURN NEW;   -- FK yang menolak, dengan pesannya sendiri
  END IF;

  IF NOT COALESCE(p.is_published, false)
     OR (p.publish_start_date IS NOT NULL AND now() < p.publish_start_date)
     OR (p.publish_end_date IS NOT NULL AND now() >= p.publish_end_date + submit_grace()) THEN
    RAISE EXCEPTION 'Survei ini sedang tidak menerima isian.'
      USING HINT = 'page_closed';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_page_respondents_window
  BEFORE INSERT ON public.page_respondents
  FOR EACH ROW EXECUTE FUNCTION public.guard_page_respondent_window();

-- ── 2.10 Migrasi data (V8) ──────────────────────────────────────────────────

-- a. Bekukan riwayat: jendela lama (sql/118) yang sudah habis jadi `selesai`.
UPDATE public.ad_schedules a
   SET broadcast_ended_at = airing_window_end(a.start_date, a.end_date, a.broadcast_at, NULL),
       broadcast_ended_by = 'sistem: sql/130 jendela lama'
 WHERE a.distribution_type = 'kilat'
   AND a.broadcast_ended_at IS NULL
   AND a.start_date IS NOT NULL
   AND a.end_date IS NOT NULL
   AND now() >= airing_window_end(a.start_date, a.end_date, a.broadcast_at, NULL);

-- b. Tutup halaman Kilat lama yang terbuka selamanya — kecuali order yang
--    punya gelombang lunas yang memang sedang live sesudah langkah a.
UPDATE public.survey_pages sp
   SET publish_end_date = now(),
       updated_at       = now()
  FROM public.form_submissions fs
 WHERE fs.id = sp.submission_id
   AND fs.distribution_type = 'kilat'
   AND sp.publish_end_date IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.ad_schedules a
     WHERE a.submission_id = sp.submission_id
       AND a.distribution_type = 'kilat'
       AND a.start_date IS NOT NULL
       AND a.broadcast_ended_at IS NULL
       AND (a.payment_status IN ('paid', 'completed') OR a.air_on_credit_at IS NOT NULL)
       AND COALESCE(a.status, '') NOT IN ('cancelled', 'slot_cancelled', 'rejected', 'spam'));

-- c. Gelombang ordinal 1 yang lolos langkah a (jendela lamanya belum habis,
--    mis. order uji #3a432277 bila berkas ini jalan sebelum 27 Okt 15.00 WIB)
--    ikut model baru: halaman [mulai, NULL) — live sampai admin mematikan.
UPDATE public.survey_pages sp
   SET publish_start_date = w.w_start,
       publish_end_date   = w.w_end,
       updated_at         = now()
  FROM public.form_submissions fs
  JOIN public.ad_schedules m
    ON m.source_table = 'form_submissions' AND m.source_id = fs.id
  CROSS JOIN LATERAL public.kilat_page_window(fs.id) w
 WHERE fs.id = sp.submission_id
   AND fs.distribution_type = 'kilat'
   AND sp.auto_closed_at IS NULL
   AND m.start_date IS NOT NULL
   AND m.broadcast_ended_at IS NULL
   AND (m.payment_status IN ('paid', 'completed') OR m.air_on_credit_at IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.ad_schedules x
                   WHERE x.submission_id = fs.id
                     AND x.source_table = 'form_submissions_extend'
                     AND x.distribution_type = 'kilat');

-- ── 2.11 ACL ────────────────────────────────────────────────────────────────
-- pg_default_acl memberi anon DAN authenticated EXECUTE ke setiap fungsi baru
-- di public; REVOKE FROM PUBLIC saja tidak mencabutnya. Periksa 3a.
-- (Fungsi yang di-REPLACE mempertahankan ACL-nya — get_batch_rewards_bulk
-- tetap bisa dipanggil /api/respondents.)

REVOKE ALL ON FUNCTION public.kilat_lead()                                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_grace()                               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kilat_window_start(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kilat_window_close(timestamptz)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kilat_broadcast_reopen(uuid, text)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_page_respondent_window()               FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kilat_broadcast_reopen(uuid, text) TO service_role;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. ACL fungsi baru: tidak ada `anon=` / `authenticated=`. Harapan 6 baris,
--     semuanya {postgres=X/postgres,service_role=X/postgres} (atau tanpa
--     service_role untuk konstanta).
--
-- SELECT proname, proacl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND proname IN ('kilat_lead', 'submit_grace', 'kilat_window_start', 'kilat_window_close',
--                   'kilat_broadcast_reopen', 'guard_page_respondent_window');
--
-- 3b. Trigger isian aktif. Harapan: 1 baris, tgenabled = 'O'.
--
-- SELECT tgname, tgenabled FROM pg_trigger
-- WHERE tgrelid = 'public.page_respondents'::regclass AND NOT tgisinternal;
--
-- 3c. Nol halaman Kilat terbuka selamanya. Harapan: 0.
--
-- SELECT count(*) FROM survey_pages sp JOIN form_submissions fs ON fs.id = sp.submission_id
-- WHERE fs.distribution_type = 'kilat' AND sp.publish_end_date IS NULL;
--
-- 3d. Nol gelombang Kilat lampau yang hidup lagi. Harapan: 0 baris (kecuali
--     gelombang lunas yang memang sedang dalam jendelanya).
--
-- SELECT id, submission_id, start_date, end_date FROM ad_schedules
-- WHERE distribution_type = 'kilat' AND broadcast_ended_at IS NULL
--   AND start_date IS NOT NULL AND end_date < now();
--
-- 3e. Iklan tidak berubah: batch Iklan sesudah = sebelum. Harapan: 0 baris.
--     (Batch yang jendelanya kebetulan melewati now() di antara snapshot dan
--     kueri ini boleh muncul dengan can_select_winners berbeda — periksa.)
--
-- WITH after AS (
--   SELECT r.* FROM get_batch_rewards_bulk(ARRAY(SELECT id FROM form_submissions)) r
-- )
-- SELECT 'beda' AS k, b.submission_id, b.period_batch
-- FROM backup.r130_rewards_before b
-- JOIN form_submissions fs ON fs.id = b.submission_id AND fs.distribution_type IS DISTINCT FROM 'kilat'
-- LEFT JOIN after x ON x.submission_id = b.submission_id AND x.period_batch = b.period_batch
-- WHERE x.submission_id IS NULL
--    OR (x.prize_per_winner, x.winner_count, x.batch_status, x.can_select_winners, x.start_date, x.end_date)
--       IS DISTINCT FROM
--       (b.prize_per_winner, b.winner_count, b.batch_status, b.can_select_winners, b.start_date, b.end_date);
--
-- 3f. Batch Kilat: sebelum vs sesudah (untuk laporan ke tim undian). Per
--     27 Okt diukur: nol responden di [akhir, akhir + 60 menit) maupun di
--     [mulai − 60 menit, mulai) pada 18 gelombang lama → pergeseran period
--     tidak mengubah siapa yang ikut undian.
--
-- SELECT b.submission_id, b.period_batch, b.start_date AS mulai_lama, x.start_date AS mulai_baru,
--        b.end_date AS akhir_lama, x.end_date AS akhir_baru,
--        b.can_select_winners AS pilih_lama, x.can_select_winners AS pilih_baru
-- FROM backup.r130_rewards_before b
-- JOIN form_submissions fs ON fs.id = b.submission_id AND fs.distribution_type = 'kilat'
-- JOIN get_batch_rewards_bulk(ARRAY[b.submission_id]) x ON x.period_batch = b.period_batch
-- ORDER BY 1, 2;


-- ============================================================================
-- ROLLBACK — kembalikan ke sql/118 + sql/119 (badan prod 27 Okt 2026)
-- ============================================================================
-- Jalankan HANYA bila perlu, lalu revert kode Siaran Kilat v2. Data siaran &
-- jendela halaman Kilat dipulihkan dari snapshot; isian yang masuk sesudah
-- migrasi tidak disentuh.
--
-- BEGIN;
--
-- DROP TRIGGER IF EXISTS trg_page_respondents_window ON public.page_respondents;
-- DROP FUNCTION IF EXISTS public.guard_page_respondent_window();
-- DROP FUNCTION IF EXISTS public.kilat_broadcast_reopen(uuid, text);
--
-- CREATE OR REPLACE FUNCTION public.kilat_page_window(p_submission_id uuid)
--  RETURNS TABLE(w_start timestamp with time zone, w_end timestamp with time zone)
--  LANGUAGE sql
--  STABLE
--  SET search_path TO 'public'
-- AS $function$
--   SELECT COALESCE(airing_window_start(m.start_date, m.broadcast_at),
--                   kilat_instant_of(fs.start_date, fs.kilat_slot_hour)),
--          COALESCE(airing_window_end(m.start_date, m.end_date, m.broadcast_at, m.broadcast_ended_at),
--                   kilat_instant_of(fs.end_date, fs.kilat_slot_hour))
--   FROM form_submissions fs
--   LEFT JOIN ad_schedules m
--          ON m.source_table = 'form_submissions' AND m.source_id = fs.id
--   WHERE fs.id = p_submission_id;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.guard_broadcast_columns()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   claims jsonb;
-- BEGIN
--   -- Pilih ulang gelombang / pindah tanggal = siaran lama tidak berlaku lagi,
--   -- siapa pun penulisnya. Termasuk upsert cermin (ON CONFLICT DO UPDATE
--   -- menyalakan BEFORE UPDATE dengan OLD asli).
--   IF TG_OP = 'UPDATE'
--      AND (NEW.start_date IS DISTINCT FROM OLD.start_date
--           OR NEW.end_date IS DISTINCT FROM OLD.end_date) THEN
--     NEW.broadcast_at       := NULL;
--     NEW.broadcast_by       := NULL;
--     NEW.broadcast_ended_at := NULL;
--     NEW.broadcast_ended_by := NULL;
--     RETURN NEW;
--   END IF;
--
--   -- Tanpa klaim = koneksi langsung (SQL Editor, migrasi, cron) → boleh.
--   claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
--   IF claims IS NULL OR coalesce(claims ->> 'role', '') = 'service_role' THEN
--     RETURN NEW;
--   END IF;
--
--   -- Admin dari browser SENGAJA tidak dilewatkan: jalan tulisnya Pages
--   -- Function /api/admin/content (seri keamanan sql/110–116).
--   IF TG_OP = 'INSERT' THEN
--     IF NEW.broadcast_at IS NOT NULL OR NEW.broadcast_by IS NOT NULL
--        OR NEW.broadcast_ended_at IS NOT NULL OR NEW.broadcast_ended_by IS NOT NULL THEN
--       RAISE EXCEPTION 'Status siaran hanya bisa diisi lewat panel admin.'
--         USING HINT = 'broadcast_admin_only';
--     END IF;
--     RETURN NEW;
--   END IF;
--
--   IF NEW.broadcast_at       IS DISTINCT FROM OLD.broadcast_at
--      OR NEW.broadcast_by       IS DISTINCT FROM OLD.broadcast_by
--      OR NEW.broadcast_ended_at IS DISTINCT FROM OLD.broadcast_ended_at
--      OR NEW.broadcast_ended_by IS DISTINCT FROM OLD.broadcast_ended_by THEN
--     RAISE EXCEPTION 'Status siaran hanya bisa diubah lewat panel admin.'
--       USING HINT = 'broadcast_admin_only';
--   END IF;
--
--   RETURN NEW;
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.kilat_broadcast_end(p_schedule_id uuid, p_by text)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   a        ad_schedules%ROWTYPE;
--   v_ended  timestamptz;
--   v_resp   int;
--   v_pages  int;
-- BEGIN
--   IF COALESCE(btrim(p_by), '') = '' THEN
--     RAISE EXCEPTION 'Nama admin wajib diisi.' USING HINT = 'broadcast_not_found';
--   END IF;
--
--   SELECT * INTO a FROM ad_schedules WHERE id = p_schedule_id FOR UPDATE;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Jadwal tidak ditemukan.' USING HINT = 'broadcast_not_found';
--   END IF;
--   IF a.broadcast_at IS NULL THEN
--     RAISE EXCEPTION 'Siaran gelombang ini belum dinyalakan.' USING HINT = 'broadcast_not_started';
--   END IF;
--   IF a.broadcast_ended_at IS NOT NULL THEN
--     RAISE EXCEPTION 'Siaran gelombang ini sudah dimatikan.' USING HINT = 'broadcast_finished';
--   END IF;
--
--   -- Dimatikan sesudah 24 jam lewat = mencatat akhir yang sudah terjadi,
--   -- tidak memperpanjang apa pun.
--   v_ended := LEAST(now(), airing_window_end(a.start_date, a.end_date, a.broadcast_at, NULL));
--
--   UPDATE ad_schedules
--      SET broadcast_ended_at = v_ended, broadcast_ended_by = btrim(p_by)
--    WHERE id = a.id;
--
--   UPDATE survey_pages
--      SET publish_end_date = v_ended,
--          updated_at       = now()
--    WHERE submission_id = a.submission_id
--      AND auto_closed_at IS NULL
--      AND (publish_end_date IS NULL OR publish_end_date > v_ended);
--   GET DIAGNOSTICS v_pages = ROW_COUNT;
--
--   SELECT count(*) INTO v_resp
--   FROM page_respondents pr JOIN survey_pages sp ON sp.id = pr.page_id
--   WHERE sp.submission_id = a.submission_id AND pr.created_at >= a.broadcast_at;
--
--   RETURN jsonb_build_object('broadcast_ended_at', v_ended, 'respondents', v_resp,
--                             'pages', v_pages);
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.kilat_broadcast_start(p_schedule_id uuid, p_by text)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   a        ad_schedules%ROWTYPE;
--   v_now    timestamptz := now();
--   v_end    timestamptz;
--   v_late   boolean;
--   v_pages  int;
-- BEGIN
--   IF COALESCE(btrim(p_by), '') = '' THEN
--     RAISE EXCEPTION 'Nama admin wajib diisi.' USING HINT = 'broadcast_not_found';
--   END IF;
--
--   SELECT * INTO a FROM ad_schedules WHERE id = p_schedule_id FOR UPDATE;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Jadwal tidak ditemukan.' USING HINT = 'broadcast_not_found';
--   END IF;
--   IF a.distribution_type IS DISTINCT FROM 'kilat' THEN
--     RAISE EXCEPTION 'Toggle siaran hanya untuk JFU Kilat.' USING HINT = 'broadcast_not_kilat';
--   END IF;
--   IF a.start_date IS NULL OR a.end_date IS NULL THEN
--     RAISE EXCEPTION 'Jadwal ini belum punya gelombang.' USING HINT = 'broadcast_no_wave';
--   END IF;
--   IF NOT (COALESCE(a.payment_status IN ('paid', 'completed'), false)
--           OR a.air_on_credit_at IS NOT NULL) THEN
--     RAISE EXCEPTION 'Gelombang ini belum lunas.' USING HINT = 'broadcast_unpaid';
--   END IF;
--
--   -- Satu arah: sesudah selesai (dimatikan, atau jendela 24 jam habis)
--   -- terkunci. Membuka ulang = pendaftar sesudah pemenang bisa dipilih.
--   IF a.broadcast_ended_at IS NOT NULL
--      OR (a.broadcast_at IS NOT NULL
--          AND v_now >= airing_window_end(a.start_date, a.end_date, a.broadcast_at, NULL)) THEN
--     RAISE EXCEPTION 'Siaran gelombang ini sudah selesai dan tidak bisa dinyalakan lagi.'
--       USING HINT = 'broadcast_finished';
--   END IF;
--
--   -- Sudah menyala: idempoten (klik ganda, dua tab admin).
--   IF a.broadcast_at IS NOT NULL THEN
--     RETURN jsonb_build_object(
--       'broadcast_at', a.broadcast_at,
--       'closes_at', airing_window_end(a.start_date, a.end_date, a.broadcast_at, NULL),
--       'already', true, 'was_late', false, 'pages', 0);
--   END IF;
--
--   IF v_now < a.start_date - interval '60 minutes' THEN
--     RAISE EXCEPTION 'Toggle siaran baru aktif 60 menit sebelum gelombang.'
--       USING HINT = 'broadcast_too_early';
--   END IF;
--
--   -- Boleh terlambat (keputusan 15 Okt): jendela pindah ke [nyala, +24 jam)
--   -- dan can_select_winners kembali false.
--   v_late := v_now >= a.end_date;
--   v_end  := airing_window_end(a.start_date, a.end_date, v_now, NULL);
--
--   UPDATE ad_schedules
--      SET broadcast_at = v_now, broadcast_by = btrim(p_by)
--    WHERE id = a.id;
--
--   UPDATE survey_pages
--      SET publish_start_date = v_now,
--          publish_end_date   = v_end,
--          updated_at         = v_now
--    WHERE submission_id = a.submission_id
--      AND auto_closed_at IS NULL;
--   GET DIAGNOSTICS v_pages = ROW_COUNT;
--
--   RETURN jsonb_build_object('broadcast_at', v_now, 'closes_at', v_end,
--                             'already', false, 'was_late', v_late, 'pages', v_pages);
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.kilat_broadcast_undo(p_schedule_id uuid)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   a        ad_schedules%ROWTYPE;
--   v_resp   int;
--   v_pages  int;
-- BEGIN
--   SELECT * INTO a FROM ad_schedules WHERE id = p_schedule_id FOR UPDATE;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Jadwal tidak ditemukan.' USING HINT = 'broadcast_not_found';
--   END IF;
--   IF a.broadcast_at IS NULL THEN
--     RAISE EXCEPTION 'Siaran gelombang ini belum dinyalakan.' USING HINT = 'broadcast_not_started';
--   END IF;
--   IF a.broadcast_ended_at IS NOT NULL
--      OR now() >= airing_window_end(a.start_date, a.end_date, a.broadcast_at, NULL) THEN
--     RAISE EXCEPTION 'Siaran gelombang ini sudah selesai dan tidak bisa dibatalkan.'
--       USING HINT = 'broadcast_finished';
--   END IF;
--
--   SELECT count(*) INTO v_resp
--   FROM page_respondents pr JOIN survey_pages sp ON sp.id = pr.page_id
--   WHERE sp.submission_id = a.submission_id AND pr.created_at >= a.broadcast_at;
--   IF v_resp > 0 THEN
--     RAISE EXCEPTION 'Sudah ada % responden sejak siaran dinyalakan; nyala tidak bisa dibatalkan.', v_resp
--       USING HINT = 'broadcast_has_respondents';
--   END IF;
--
--   UPDATE ad_schedules
--      SET broadcast_at = NULL, broadcast_by = NULL
--    WHERE id = a.id;
--
--   -- Kembali ke jendela sementara gelombang.
--   UPDATE survey_pages
--      SET publish_start_date = a.start_date,
--          publish_end_date   = a.end_date,
--          updated_at         = now()
--    WHERE submission_id = a.submission_id
--      AND auto_closed_at IS NULL;
--   GET DIAGNOSTICS v_pages = ROW_COUNT;
--
--   RETURN jsonb_build_object('pages', v_pages);
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.get_batch_rewards_bulk(p_submission_ids uuid[])
--  RETURNS TABLE(submission_id uuid, period_batch text, prize_per_winner integer, winner_count integer, batch_status text, can_select_winners boolean, start_date timestamp with time zone, end_date timestamp with time zone)
--  LANGUAGE plpgsql
--  SECURITY DEFINER
-- AS $function$
-- BEGIN
--   RETURN QUERY
--   WITH all_periods AS (
--     -- sql/118: jendela ordinal 1 dari CERMIN ad_schedules — instan nyata
--     -- (gelombang Kilat, jam kustom Iklan, 15.00) + toggle siaran. Jatuh ke
--     -- 15.00 terpatok hanya bila cermin tak bertanggal. period_batch tetap
--     -- bulan end_date form_submissions (DATE WIB).
--     SELECT
--       fs.id AS sid,
--       TO_CHAR(fs.end_date, 'YYYY-MM') AS pb,
--       fs.prize_per_winner AS base_p,
--       0 AS add_p,
--       fs.winner_count AS wc,
--       fs.submission_status AS status,
--       COALESCE(airing_window_start(m.start_date, m.broadcast_at),
--                airing_instant_of_date(fs.start_date)) AS sd,
--       COALESCE(airing_window_end(m.start_date, m.end_date, m.broadcast_at, m.broadcast_ended_at),
--                airing_instant_of_date(fs.end_date))   AS ed
--     FROM form_submissions fs
--     LEFT JOIN ad_schedules m
--            ON m.source_table = 'form_submissions' AND m.source_id = fs.id
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
--       airing_window_start(a.start_date, a.broadcast_at) AS sd,
--       airing_window_end(a.start_date, a.end_date, a.broadcast_at, a.broadcast_ended_at) AS ed
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
-- CREATE OR REPLACE FUNCTION public.cron_activate_extends()
--  RETURNS void
--  LANGUAGE plpgsql
--  SECURITY DEFINER
-- AS $function$
-- BEGIN
--   -- 1. Aktifkan jadwal yang jendelanya sudah mulai.
--   --    review_status ikut disegarkan dari induk — padanan tambahan sql/70 di
--   --    extend_view_update(), dan SENGAJA hanya untuk baris yang bertransisi,
--   --    persis selingkup perilaku lama.
--   --    sql/102: jadwal kredit (tayang sebelum lunas) ikut diangkat.
--   UPDATE ad_schedules a
--   SET status = 'live',
--       review_status = COALESCE(review_status_of(fs.submission_status), a.review_status),
--       updated_at = NOW()
--   FROM form_submissions fs
--   WHERE fs.id = a.submission_id
--     AND a.source_table = 'form_submissions_extend'
--     AND a.status = 'scheduled'
--     AND (a.payment_status = 'paid' OR a.air_on_credit_at IS NOT NULL)
--     AND a.start_date <= NOW()
--     AND a.end_date > NOW();
--
--   -- 2. Arahkan halaman survei ke jadwal yang sedang tayang.
--   UPDATE survey_pages sp
--   -- sql/119: jendela dari SATU rumus undian (sql/118). Iklan tidak pernah
--   -- punya kolom siaran → nilainya sama persis dengan dulu. Gelombang
--   -- perpanjangan Kilat: tick 15 menit ini dulu menimpa jangkar toggle
--   -- siaran dan MEMBUKA LAGI halaman yang sudah dimatikan admin.
--   SET publish_start_date  = airing_window_start(a.start_date, a.broadcast_at),
--       publish_end_date    = airing_window_end(a.start_date, a.end_date,
--                                               a.broadcast_at, a.broadcast_ended_at),
--       current_period_batch = a.period_batch
--   FROM ad_schedules a
--   WHERE a.source_table = 'form_submissions_extend'
--     AND a.submission_id = sp.submission_id
--     AND a.status = 'live'
--     AND a.start_date <= NOW()
--     AND a.end_date > NOW();
--
--   -- 3. Tutup jadwal yang jendelanya sudah lewat.
--   UPDATE ad_schedules a
--   SET status = 'completed',
--       review_status = COALESCE(review_status_of(fs.submission_status), a.review_status),
--       updated_at = NOW()
--   FROM form_submissions fs
--   WHERE fs.id = a.submission_id
--     AND a.source_table = 'form_submissions_extend'
--     AND a.status = 'live'
--     AND a.end_date <= NOW();
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.notify_primary_ads_completed()
--  RETURNS void
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'extensions', 'vault'
-- AS $function$
-- DECLARE
--   v_url    text;
--   v_secret text;
--   rec      record;
-- BEGIN
--   SELECT decrypted_secret INTO v_url
--     FROM vault.decrypted_secrets WHERE name = 'notify_ad_completed_url' LIMIT 1;
--   SELECT decrypted_secret INTO v_secret
--     FROM vault.decrypted_secrets WHERE name = 'cron_notify_secret' LIMIT 1;
--
--   IF v_url IS NULL THEN
--     v_url := 'https://submit.jakpatforuniv.com/api/notify-ad-completed';
--   END IF;
--
--   IF v_secret IS NULL THEN
--     RAISE WARNING 'notify_primary_ads_completed: vault secret cron_notify_secret belum diset, dilewati';
--     RETURN;
--   END IF;
--
--   FOR rec IN
--     SELECT s.id AS schedule_id,
--            s.submission_id,
--            s.ordinal,
--            s.booking_id,
--            s.start_date,
--            s.end_date,
--            fs.email,
--            fs.full_name,
--            fs.title
--     FROM public.ad_schedules s
--     JOIN public.form_submissions fs ON fs.id = s.submission_id
--     WHERE (lower(s.payment_status) = 'paid' OR s.air_on_credit_at IS NOT NULL)
--       AND s.end_date IS NOT NULL
--       AND fs.email IS NOT NULL
--       AND s.completed_notified_at IS NULL
--       AND lower(coalesce(s.status, '')) NOT IN ('rejected', 'spam', 'cancelled', 'slot_cancelled')
--       AND lower(coalesce(fs.submission_status, '')) NOT IN ('rejected', 'spam', 'cancelled', 'slot_cancelled')
--   LOOP
--     -- Belum berakhir -> lewati
--     IF rec.end_date > now() THEN
--       CONTINUE;
--     END IF;
--
--     -- Berakhir terlalu lama (> 7 hari) -> tandai tanpa kirim
--     IF rec.end_date < now() - INTERVAL '7 days' THEN
--       UPDATE public.ad_schedules
--         SET completed_notified_at = now()
--         WHERE id = rec.schedule_id;
--       IF rec.ordinal = 1 THEN
--         UPDATE public.form_submissions
--           SET completed_notified_at = now()
--           WHERE id = rec.submission_id AND completed_notified_at IS NULL;
--       END IF;
--       CONTINUE;
--     END IF;
--
--     PERFORM net.http_post(
--       url     := v_url || '?k=' || v_secret,
--       headers := jsonb_build_object('Content-Type', 'application/json'),
--       body    := jsonb_build_object(
--         'submission_id', rec.submission_id,
--         'schedule_id',   rec.schedule_id,
--         'booking_id',    rec.booking_id,
--         'ordinal',       rec.ordinal,
--         'email',         rec.email,
--         'full_name',     rec.full_name,
--         'title',         rec.title,
--         'start_date',    rec.start_date,
--         'end_date',      rec.end_date
--       ),
--       timeout_milliseconds := 5000
--     );
--
--     UPDATE public.ad_schedules
--       SET completed_notified_at = now()
--       WHERE id = rec.schedule_id;
--
--     IF rec.ordinal = 1 THEN
--       UPDATE public.form_submissions
--         SET completed_notified_at = now()
--         WHERE id = rec.submission_id AND completed_notified_at IS NULL;
--     END IF;
--   END LOOP;
-- END;
-- $function$;
--
-- -- Data: kolom siaran & jendela halaman Kilat kembali ke snapshot.
-- UPDATE public.ad_schedules a
--    SET broadcast_at = b.broadcast_at, broadcast_by = b.broadcast_by,
--        broadcast_ended_at = b.broadcast_ended_at, broadcast_ended_by = b.broadcast_ended_by
--   FROM backup.r130_kilat_schedules_before b
--  WHERE b.id = a.id;
-- UPDATE public.survey_pages sp
--    SET publish_start_date = b.publish_start_date, publish_end_date = b.publish_end_date,
--        updated_at = b.updated_at
--   FROM backup.r130_kilat_pages_before b
--  WHERE b.id = sp.id;
--
-- DROP FUNCTION IF EXISTS public.kilat_window_close(timestamptz);
-- DROP FUNCTION IF EXISTS public.kilat_window_start(timestamptz, timestamptz);
-- DROP FUNCTION IF EXISTS public.submit_grace();
-- DROP FUNCTION IF EXISTS public.kilat_lead();
-- ALTER TABLE public.ad_schedules
--   DROP COLUMN IF EXISTS broadcast_reopened_at,
--   DROP COLUMN IF EXISTS broadcast_reopened_by;
--
-- COMMIT;
--
-- Snapshot backup.r130_* dibiarkan (dihapus manual sesudah 30 hari).
