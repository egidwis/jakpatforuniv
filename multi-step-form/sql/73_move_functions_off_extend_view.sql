-- ============================================================
-- Migrasi 73: empat fungsi berhenti membaca view `form_submissions_extend`
--
-- Langkah *contract* Task 11. `sql/52` sudah menjadikan
-- `form_submissions_extend` VIEW di atas `ad_schedules`; berkas ini mencabut
-- ketergantungan TERAKHIR di sisi database, supaya view-nya bisa di-DROP
-- (`sql/74`) sesudah sisi kode ikut pindah.
--
-- ── Kenapa hanya EMPAT fungsi ──────────────────────────────────────────────
--
-- `pg_get_functiondef` menyebut `form_submissions_extend` di TIGA BELAS fungsi,
-- dan angka itu menyesatkan. SEMBILAN di antaranya hanya memakai STRING LITERAL
-- 'form_submissions_extend' sebagai nilai kolom `ad_schedules.source_table` —
-- mereka tidak pernah menyentuh view-nya dan tidak perlu diubah:
--
--   assert_schedule_window_free · derive_schedule_id · resync_ad_schedule_ordinals
--   sync_ad_schedule_from_submission · get_extend_slot_occupancy
--   extend_view_insert/update/delete · guard_extend_payment_columns (teks error)
--
-- Yang benar-benar MENGAKSES view — dan hanya ini yang diubah di sini:
--
--   cron_activate_extends      (2× UPDATE + 1× FROM)  ← cron.job jobid 1, */15
--   get_batch_rewards_bulk     (FROM)
--   get_page_active_period     (FROM)
--   get_schedule_batch_context (FROM)
--
-- ── ⚠️ JEBAKAN 1: view itu FILTER, dan filternya mudah hilang ──────────────
--
-- `form_submissions_extend` = `ad_schedules WHERE source_table =
-- 'form_submissions_extend'`. Menulis ulang `cron_activate_extends` jadi
-- `UPDATE ad_schedules` TANPA membawa filter itu akan membuat cron mulai
-- membolak-balik status jadwal ORDINAL 1 tiap 15 menit — 1006 baris, bukan 10.
-- Setiap query di bawah membawa filternya EKSPLISIT.
--
-- ── ⚠️ JEBAKAN 2: `e.id` BUKAN `a.id` ─────────────────────────────────────
--
-- Kolom `id` pada view adalah `a.source_id`, bukan `a.id`. `get_page_active_period`
-- MENGEMBALIKAN nilai itu sebagai `active_period_id`; memetakannya ke `a.id`
-- akan menukar identitas periode tanpa satu pun error. Pemetaan lengkap view:
--
--   id                → source_id          submission_status → status
--   is_new_month      → is_new_period      total_cost        → total_cost::integer
--   (sisanya senama)
--
-- ── ⚠️ Dibaca dari pg_get_functiondef() produksi, bukan dari berkas sql/ ───
--
-- `sync_ad_schedule_from_submission` sudah ditulis ulang utuh oleh ENAM berkas,
-- dan menyalin dari berkas yang salah pernah menghidupkan kembali cabang
-- penghapus jadwal (insiden sql/49 vs sql/51). Keempat badan di bawah disalin
-- dari definisi yang BENAR-BENAR berjalan di produksi pada 2026-08-30.
--
-- Idempoten: `CREATE OR REPLACE` semua. Aman dijalankan ulang.
-- Nol perubahan skema, nol perubahan data.
-- ============================================================


-- ============================================
-- 1. cron_activate_extends  ← PALING KRITIS
-- ============================================
--
-- Dipanggil `cron.job` jobid 1 (`*/15 * * * *`, aktif). Ia satu-satunya dari
-- keempatnya yang MENULIS.
--
-- Yang HILANG kalau ditulis polos, dan karena itu dipertahankan di sini:
-- menulis lewat view memicu `extend_view_update()`, yang sejak `sql/70` ikut
-- menurunkan ulang `review_status` dari order induk. Menulis langsung ke
-- `ad_schedules` melewati trigger itu, jadi penurunan ulangnya ditulis ulang
-- eksplisit di bagian 0 di bawah.
--
-- Yang TIDAK perlu ditiru: `assert_schedule_window_free` (hanya dipanggil saat
-- tanggal bergeser atau jadwal batal dihidupkan — cron tidak pernah melakukan
-- keduanya) dan `resync_ad_schedule_ordinals` (hanya saat `start_date` berubah).
--
-- Trigger di `ad_schedules` sendiri TIDAK berubah perilakunya: `extend_view_update`
-- juga menulis ke `ad_schedules`, jadi `trg_ad_schedules_guard_payment` dkk.
-- sudah menyala di jalur lama. `guard_extend_payment_columns()` meloloskan cron
-- karena `request.jwt.claims` NULL di pg_cron (dan cron tak menyentuh kolom uang).

CREATE OR REPLACE FUNCTION public.cron_activate_extends()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- 1. Aktifkan jadwal yang jendelanya sudah mulai.
  --    Tanpa gerbang banner, tanpa join survey_pages — lihat header aslinya.
  --
  --    `review_status` ikut disegarkan dari induk: itu padanan tambahan sql/70
  --    di `extend_view_update()`, yang terlewati begitu penulisannya langsung
  --    ke `ad_schedules`. COALESCE-nya disalin apa adanya — induk hilang
  --    seharusnya mustahil (ada FK), tapi kalau toh terjadi, nilai lama
  --    DIPERTAHANKAN; menulis NULL akan menghapus sumbu review.
  --
  --    ⚠️ SENGAJA hanya untuk baris yang BERTRANSISI, bukan semua baris yang
  --    menyimpang dari induknya. Versi pertama berkas ini memakai satu UPDATE
  --    rekonsiliasi terpisah di depan, dan itu LEBIH LUAS dari perilaku yang
  --    digantikan: `extend_view_update` hanya menyentuh baris yang memang
  --    sedang di-UPDATE cron. Terukur nol baris menyimpang saat migrasi ini
  --    ditulis, jadi keduanya berperilaku sama hari ini — tapi yang sempit
  --    tidak akan diam-diam menulis ulang baris di masa depan.
  UPDATE ad_schedules a
  SET status = 'live',
      review_status = COALESCE(review_status_of(fs.submission_status), a.review_status),
      updated_at = NOW()
  FROM form_submissions fs
  WHERE fs.id = a.submission_id
    AND a.source_table = 'form_submissions_extend'   -- ⚠️ JEBAKAN 1
    AND a.status = 'scheduled'
    AND a.payment_status = 'paid'
    AND a.start_date <= NOW()
    AND a.end_date > NOW();

  -- 2. Arahkan halaman survei ke jadwal yang sedang tayang.
  --    Join wajib: survey_pages target-nya di sini.
  UPDATE survey_pages sp
  SET publish_start_date  = a.start_date,
      publish_end_date    = a.end_date,
      current_period_batch = a.period_batch
  FROM ad_schedules a
  WHERE a.source_table = 'form_submissions_extend'   -- ⚠️ JEBAKAN 1
    AND a.submission_id = sp.submission_id
    AND a.status = 'live'
    AND a.start_date <= NOW()
    AND a.end_date > NOW();

  -- 3. Tutup jadwal yang jendelanya sudah lewat.
  --    Alasan `review_status` ikut di sini sama dengan bagian 1 di atas.
  UPDATE ad_schedules a
  SET status = 'completed',
      review_status = COALESCE(review_status_of(fs.submission_status), a.review_status),
      updated_at = NOW()
  FROM form_submissions fs
  WHERE fs.id = a.submission_id
    AND a.source_table = 'form_submissions_extend'   -- ⚠️ JEBAKAN 1
    AND a.status = 'live'
    AND a.end_date <= NOW();
END;
$function$;


-- ============================================
-- 2. get_batch_rewards_bulk
-- ============================================
--
-- RPC hadiah (Task 8B-1). Hanya cabang UNION kedua yang berubah:
-- `form_submissions_extend e` → `ad_schedules a` + filter source_table.
-- `e.submission_status` → `a.status`. Sisanya senama dan tetap.

CREATE OR REPLACE FUNCTION public.get_batch_rewards_bulk(p_submission_ids uuid[])
 RETURNS TABLE(submission_id uuid, period_batch text, prize_per_winner integer, winner_count integer, batch_status text, can_select_winners boolean, start_date timestamp with time zone, end_date timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH all_periods AS (
    -- Jadwal pertama (baris parent)
    SELECT
      fs.id AS sid,
      TO_CHAR(fs.end_date, 'YYYY-MM') AS pb,
      fs.prize_per_winner AS base_p,
      0 AS add_p,
      fs.winner_count AS wc,
      fs.submission_status AS status,
      -- form_submissions menyimpan DATE, ad_schedules menyimpan TIMESTAMPTZ.
      -- Dibiarkan apa adanya, UNION di bawah melebarkan DATE ke tengah malam UTC
      -- (07:00 WIB), delapan jam sebelum iklannya benar-benar tayang.
      -- airing_instant_of_date() didefinisikan di sql/39.
      airing_instant_of_date(fs.start_date) AS sd,
      airing_instant_of_date(fs.end_date)   AS ed
    FROM form_submissions fs
    WHERE fs.id = ANY(p_submission_ids)
      -- rejected/spam tidak pernah tayang dan tidak menjanjikan apa pun. Ini
      -- SENGAJA bukan cek pembayaran -- lihat header sql/37.
      AND fs.submission_status NOT IN ('rejected', 'spam')

    UNION ALL

    -- Jadwal berikutnya (hanya yang sudah dibayar)
    SELECT
      a.submission_id AS sid,
      a.period_batch AS pb,
      COALESCE(a.prize_per_winner, 0) AS base_p,
      COALESCE(a.additional_prize_per_winner, 0) AS add_p,
      COALESCE(a.winner_count, 0) AS wc,
      a.status AS status,
      a.start_date AS sd,
      a.end_date AS ed
    FROM ad_schedules a
    WHERE a.source_table = 'form_submissions_extend'   -- ⚠️ JEBAKAN 1
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


-- ============================================
-- 3. get_page_active_period
-- ============================================
--
-- ⚠️ JEBAKAN 2 hidup di sini. Ia mengembalikan `e.id` sebagai `active_period_id`,
-- dan `e.id` pada view adalah `a.source_id` — BUKAN `a.id`. Memakai `a.id` akan
-- menukar identitas periode tanpa satu pun error muncul.

CREATE OR REPLACE FUNCTION public.get_page_active_period(p_slug text)
 RETURNS TABLE(is_active boolean, active_source text, active_period_id uuid, active_start_date timestamp with time zone, active_end_date timestamp with time zone, period_batch text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_page RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Get page + parent submission
  SELECT sp.id AS page_id, sp.submission_id,
         fs.start_date AS parent_start, fs.end_date AS parent_end
  INTO v_page
  FROM survey_pages sp
  JOIN form_submissions fs ON fs.id = sp.submission_id
  WHERE sp.slug = p_slug AND sp.is_published = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TEXT;
    RETURN;
  END IF;

  -- Check parent period first
  IF v_page.parent_start <= v_now AND v_page.parent_end > v_now THEN
    RETURN QUERY SELECT true, 'parent'::TEXT, v_page.submission_id,
      v_page.parent_start, v_page.parent_end,
      TO_CHAR(v_page.parent_end, 'YYYY-MM');
    RETURN;
  END IF;

  -- Check extends (find current active one)
  RETURN QUERY
    SELECT true, 'extend'::TEXT, a.source_id,          -- ⚠️ JEBAKAN 2: source_id, bukan id
      a.start_date, a.end_date, a.period_batch
    FROM ad_schedules a
    WHERE a.source_table = 'form_submissions_extend'   -- ⚠️ JEBAKAN 1
      AND a.submission_id = v_page.submission_id
      AND a.status = 'live'
      AND a.payment_status = 'paid'
      AND a.start_date <= v_now
      AND a.end_date > v_now
    ORDER BY a.start_date ASC
    LIMIT 1;

  -- If no rows returned above, page is not active
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TEXT;
  END IF;
END;
$function$;


-- ============================================
-- 4. get_schedule_batch_context
-- ============================================
--
-- ⚠️ JEBAKAN 2 lagi: `p_exclude_schedule_id` dibandingkan dengan `e.id` pada
-- versi lama, jadi pemanggilnya mengirim id EXTEND. Perbandingannya tetap ke
-- `a.source_id` supaya kontrak pemanggil tidak berubah.

CREATE OR REPLACE FUNCTION public.get_schedule_batch_context(p_submission_id uuid, p_end_date timestamp with time zone, p_exclude_schedule_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(period_batch text, is_new_batch boolean, pool_prize_per_winner integer, pool_winner_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  -- identical expression to compute_extend_period_batch() in sql/19
  v_batch TEXT := TO_CHAR(p_end_date, 'YYYY-MM');
BEGIN
  RETURN QUERY
  WITH occupants AS (
    -- the first schedule
    SELECT
      COALESCE(fs.prize_per_winner, 0) AS prize,
      COALESCE(fs.winner_count, 0)     AS wc,
      0                                AS additional
    FROM form_submissions fs
    WHERE fs.id = p_submission_id
      AND fs.end_date IS NOT NULL
      AND TO_CHAR(fs.end_date, 'YYYY-MM') = v_batch
      AND fs.submission_status NOT IN ('rejected', 'spam')
      AND (p_exclude_schedule_id IS NULL OR fs.id <> p_exclude_schedule_id)

    UNION ALL

    -- every schedule after it
    SELECT
      COALESCE(a.prize_per_winner, 0)             AS prize,
      COALESCE(a.winner_count, 0)                 AS wc,
      COALESCE(a.additional_prize_per_winner, 0)  AS additional
    FROM ad_schedules a
    WHERE a.source_table = 'form_submissions_extend'   -- ⚠️ JEBAKAN 1
      AND a.submission_id = p_submission_id
      AND a.period_batch = v_batch
      AND a.status <> 'cancelled'
      AND (p_exclude_schedule_id IS NULL OR a.source_id <> p_exclude_schedule_id)  -- ⚠️ JEBAKAN 2
  )
  SELECT
    v_batch,
    NOT EXISTS (SELECT 1 FROM occupants),
    -- Same arithmetic as get_batch_rewards: base prize plus every top-up.
    -- These two must agree, otherwise the admin funding a schedule sees one
    -- prize while respondents are shown another for the same batch.
    -- NULLIF so a 0-prize row never masks the row that actually funded the pool.
    (COALESCE(MAX(NULLIF(o.prize, 0)), 0) + COALESCE(SUM(o.additional), 0))::INTEGER,
    COALESCE(MAX(NULLIF(o.wc, 0)), 0)::INTEGER
  FROM occupants o;
END;
$function$;


-- ============================================
-- 5. Verifikasi — jalankan SESUDAH, bandingkan dengan sidik jari SEBELUM
-- ============================================
--
-- Sidik jari produksi 2026-08-30 SEBELUM migrasi ini:
--   paritas ordinal 1        : 1006 vs 1006  ✅
--   status ordinal ≥2        : cancelled=1, completed=7, waiting_payment=2
--   md5 baris ordinal ≥2     : 46ea46dbda51d32617651ce7ed6cfe35
--   md5 survey_pages publish : 6bbab18559f13d26c3db7c4b74657c6f
--   keluaran get_batch_rewards_bulk     : b483ab4026c661ac25f4897c90f1fe12
--   keluaran get_schedule_batch_context : 54ac8f6b2a7f577440e1649c62039112
--   keluaran get_page_active_period     : 0ebe155b615f1bd734c77a032343addf
--   (323 halaman terbit, 0 sedang aktif pada saat pengukuran)
--
-- Substitusi kolomnya sudah diuji DIFERENSIAL lebih dulu, bukan diasumsikan:
-- 15 kolom view diadu dengan proyeksi ad_schedules lewat EXCEPT dua arah —
-- nol baris di kedua arah, 10 = 10.
--
-- (1) Nol fungsi tersisa yang MENGAKSES view — sisa 9 hanya literal string:
--
--   SELECT p.proname
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname='public' AND p.prokind='f'
--     AND pg_get_functiondef(p.oid) ~* '(FROM|JOIN|UPDATE|INTO)\s+form_submissions_extend';
--   -- harapan: hanya extend_view_insert/update/delete (mereka MEMANG milik view)
--
-- (2) Cron tidak menyentuh jadwal ordinal 1 — jalankan sesudah ≥1 siklus (15 mnt):
--
--   SELECT md5(string_agg(source_id::text||'|'||coalesce(status,'')||'|'||
--              coalesce(payment_status,'')||'|'||coalesce(review_status,''), ',' ORDER BY source_id::text))
--   FROM ad_schedules WHERE source_table='form_submissions_extend';
--   -- harapan: 46ea46dbda51d32617651ce7ed6cfe35 (tak ada jendela aktif hari ini)
--
--   SELECT status, count(*) FROM ad_schedules
--   WHERE source_table='form_submissions' GROUP BY status ORDER BY status;
--   -- harapan IDENTIK: cancelled=140, completed=8, live=177, paid=67,
--   --                  requested=482, scheduled=60, slot_reserved=45,
--   --                  unscheduled=26, waiting_payment=1
--
-- (3) Cron benar-benar sukses — baca job_run_details, BUKAN cron.job.
--     Pelajaran insiden sql/48: cron.job cuma bilang "terjadwal", bukan "berhasil".
--
--   SELECT status, return_message, start_time
--   FROM cron.job_run_details WHERE jobid = 1
--   ORDER BY start_time DESC LIMIT 5;
--   -- harapan: nol 'failed'
--
-- (4) Paritas ordinal 1 tetap hijau:
--
--   SELECT (SELECT count(*) FROM ad_schedules WHERE ordinal=1) AS ordinal1,
--          (SELECT count(*) FROM form_submissions) AS orders;   -- wajib sama
