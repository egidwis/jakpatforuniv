-- ============================================================================
-- sql/120 — MODE LIBUR ADMIN + JENDELA PESAN KILAT 3 HARI KERJA
-- ============================================================================
--
-- Rencana: ~/.claude/plans/bantu-aku-pelajari-dokumentasi-replicated-lantern.md
-- (keputusan 21 Okt 2026). Menggantikan model "kalender hari libur" sql/117 K2
-- yang belum pernah dirilis ke peneliti (tabelnya masih kosong).
--
-- ── PERILAKU SESUDAH BERKAS INI ─────────────────────────────────────────────
--
--   L1  operational_holidays → "JFU_operational_holidays" (pola JM_* di DB
--       yang sama; WAJIB dikutip di SQL). Arti baris berubah: SATU BARIS =
--       SATU MASA LIBUR. holiday_date = tanggal WIB saat toggle "Mode libur"
--       dinyalakan; is_active = toggle. Hibah kolom, RLS, policy, CHECK, dan
--       PK ikut terbawa rename.
--   L2  Kolom label_en (≤160, default '') = terjemahan otomatis pesan admin,
--       ditulis /api/admin/holidays. Kolom baru TIDAK ikut hibah kolom lama →
--       GRANT SELECT (label_en) eksplisit.
--   L3  Kilat tutup total selama libur: kedua trigger klaim dan RPC okupansi
--       membaca `holiday_date <= tanggal gelombang` (dulu `=`). HINT baru
--       'kilat_admin_away' di kedua trigger; closed_reason RPC tetap 'holiday'.
--       Admin tidak terpengaruh: bypass tanpa JWT / service_role /
--       product@jakpat.net berjalan lebih dulu, tidak berubah.
--   L4  form_submissions.forced_manual_reason (NULL | 'admin_away'): order
--       Kilat jalur otomatis yang dikirim selama libur ditandai permanen
--       sebagai jalur manual (isAutoReviewed di frontend membacanya). Admin
--       mereview, menugaskan gelombang, dan menagih seperti Kilat manual.
--       authenticated memegang SELECT/INSERT/UPDATE TINGKAT TABEL (diperiksa
--       21 Okt) → tanpa GRANT. Hibah SELECT anon hanya 8 kolom dan sengaja
--       tidak ditambah.
--       TANPA trigger penjaga, dengan sengaja: (a) trigger klaim Kilat tidak
--       pernah memeriksa jalur order — order manual pun sudah bisa mengklaim
--       gelombang lewat konsol, jadi penjaga kolom ini tidak menutup apa pun;
--       (b) jadwal ulang lewat wizard (updateFormSubmissionById) menulis ulang
--       seluruh baris dan akan terblokir penjaga.
--   K3  Jendela pesan Kilat PENELITI = 3 hari kerja (Senin–Jumat) mulai hari
--       ini WIB; hari ini dihitung walau gelombangnya sudah tutup.
--       kilat_last_bookable_date(hari) memberi hari terakhirnya. Kedua trigger
--       klaim menolak tanggal sesudahnya, HINT 'kilat_wave_too_far'. Admin
--       (bypass yang sama) tetap bebas — papan admin 2 minggu tidak berubah.
--       RPC okupansi TIDAK memangkas jendela; pemangkasan peneliti di klien
--       (kilatWaves.ts, kembaran TS yang dikunci tes paritas).
--
-- Badan ketiga fungsi DISALIN dari produksi 21 Okt 2026 (pg_get_functiondef,
-- md5 di Langkah 1a); salinan verbatimnya ada di blok ROLLBACK. Yang berubah
-- ditandai "sql/120".
--
-- ── URUTAN ──────────────────────────────────────────────────────────────────
--
--   Langkah 1 (pra-cek) → Langkah 2 (migrasi) → Langkah 3 (verifikasi) →
--   Langkah 4 (uji perilaku, selalu dibatalkan).
--   Aman diterapkan SEBELUM kode frontend: main tidak membaca tabel libur dan
--   belum menulis forced_manual_reason. Branch feat/kilat-swalayan versi lama
--   (sebelum commit mode libur) akan gagal membaca tabel lama — wajar.
--   Jalankan di SQL Editor Supabase. JANGAN lewat MCP.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — PRA-CEK (baca saja)
-- ============================================================================
--
-- 1a. Badan fungsi yang hidup harus SAMA dengan salinan di blok ROLLBACK
--     (diambil 21 Okt 2026). Harapan: tiga baris `sama = true`.
--     Ada `false` = berhenti, laporkan dulu. (Langkah 2 juga memeriksanya
--     sendiri dan membatalkan diri kalau beda.)
--
-- SELECT p.proname,
--        md5(pg_get_functiondef(p.oid)) = CASE p.proname
--          WHEN 'validate_kilat_wave_claim'   THEN 'd7510eac92434acf6758a553cd705472'
--          WHEN 'validate_kilat_extend_claim' THEN '665328493e37cf2289e9d05a86fdf2c5'
--          WHEN 'get_kilat_wave_occupancy'    THEN '0a945026b4333c90ac94075e3e0ba287'
--        END AS sama
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('validate_kilat_wave_claim', 'validate_kilat_extend_claim',
--                     'get_kilat_wave_occupancy')
-- ORDER BY 1;
--
-- 1b. Tabel lama ada, nama baru belum, dan tabel lama KOSONG. Harapan:
--     lama_ada = true, baru_ada = false, baris = 0.
--     (baris > 0 = sisa uji model kalender lama. Di model baru, baris aktif
--     bertanggal X menutup SEMUA gelombang ≥ X — hapus dulu, laporkan.)
--
-- SELECT to_regclass('public.operational_holidays') IS NOT NULL      AS lama_ada,
--        to_regclass('public."JFU_operational_holidays"') IS NOT NULL AS baru_ada,
--        (SELECT count(*) FROM public.operational_holidays)           AS baris;
--
-- 1c. Nama baru belum dipakai. Harapan: 0 baris.
--
-- SELECT 'fungsi' AS jenis, proname::text AS nama
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND proname = 'kilat_last_bookable_date'
-- UNION ALL
-- SELECT 'kolom', column_name::text FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'form_submissions'
--   AND column_name = 'forced_manual_reason';


-- ============================================================================
-- LANGKAH 2 — MIGRASI (satu transaksi)
-- ============================================================================

BEGIN;

-- ── 2.0 Penjaga salinan: batal kalau badan produksi sudah berubah ──────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname, md5(pg_get_functiondef(p.oid)) AS m
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('validate_kilat_wave_claim', 'validate_kilat_extend_claim',
                        'get_kilat_wave_occupancy')
  LOOP
    -- CASE wajib dikurung: tanpa kurung, plpgsql memotong syarat IF di THEN
    -- pertama (milik CASE).
    IF r.m IS DISTINCT FROM (CASE r.proname
         WHEN 'validate_kilat_wave_claim'   THEN 'd7510eac92434acf6758a553cd705472'
         WHEN 'validate_kilat_extend_claim' THEN '665328493e37cf2289e9d05a86fdf2c5'
         WHEN 'get_kilat_wave_occupancy'    THEN '0a945026b4333c90ac94075e3e0ba287'
       END) THEN
      RAISE EXCEPTION 'sql/120 dibatalkan: badan % di produksi sudah berubah sejak 21 Okt (md5 %).', r.proname, r.m;
    END IF;
  END LOOP;
END;
$$;

-- ── 2.1 (L1) Rename tabel ──────────────────────────────────────────────────
ALTER TABLE public.operational_holidays RENAME TO "JFU_operational_holidays";
ALTER INDEX public.operational_holidays_pkey RENAME TO "JFU_operational_holidays_pkey";
ALTER TABLE public."JFU_operational_holidays"
  RENAME CONSTRAINT operational_holidays_label_check TO "JFU_operational_holidays_label_check";

COMMENT ON TABLE public."JFU_operational_holidays" IS
  'Mode libur tim admin (sql/120). Satu baris = satu masa libur: holiday_date = tanggal WIB '
  'saat toggle dinyalakan, is_active = toggle. Baris aktif ⇒ Kilat tutup untuk peneliti di '
  'semua gelombang ≥ holiday_date; Iklan otomatis tetap tayang. Ditulis HANYA lewat '
  '/api/admin/holidays (service_role).';
COMMENT ON COLUMN public."JFU_operational_holidays".holiday_date IS
  'Tanggal WIB saat mode libur dinyalakan (bukan satu-satunya tanggal libur).';

-- ── 2.2 (L2) Terjemahan pesan admin ────────────────────────────────────────
ALTER TABLE public."JFU_operational_holidays"
  ADD COLUMN label_en text NOT NULL DEFAULT ''
  CONSTRAINT "JFU_operational_holidays_label_en_check" CHECK (char_length(label_en) <= 160);
COMMENT ON COLUMN public."JFU_operational_holidays".label_en IS
  'Terjemahan Inggris otomatis dari label (OpenRouter, /api/admin/holidays). '''' = belum/gagal → '
  'peneliti EN melihat label Indonesia.';
GRANT SELECT (label_en) ON public."JFU_operational_holidays" TO anon, authenticated;

-- ── 2.3 (L4) Penanda jalur manual karena libur ─────────────────────────────
ALTER TABLE public.form_submissions
  ADD COLUMN forced_manual_reason text
  CONSTRAINT form_submissions_forced_manual_reason_check
  CHECK (forced_manual_reason IS NULL OR forced_manual_reason = 'admin_away');
COMMENT ON COLUMN public.form_submissions.forced_manual_reason IS
  'sql/120. ''admin_away'' = order Kilat jalur otomatis yang dikirim selama mode libur; '
  'diproses sebagai jalur manual (isAutoReviewed = false). NULL = jalur mengikuti aturan biasa.';

-- ── 2.4 (K3) Hari terakhir yang boleh dipesan peneliti ─────────────────────
CREATE OR REPLACE FUNCTION public.kilat_last_bookable_date(p_today date)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Hari Senin–Jumat ke-3 yang ≥ p_today (p_today ikut dihitung bila hari
  -- kerja). Kembaran TS: kilatLastBookableYmd di src/utils/kilatWaves.ts.
  SELECT max(x.d)
  FROM (
    SELECT g::date AS d
    FROM generate_series(p_today::timestamp, (p_today + 6)::timestamp, interval '1 day') AS g
    WHERE extract(isodow FROM g) <= 5
    ORDER BY g
    LIMIT 3
  ) x;
$function$;
COMMENT ON FUNCTION public.kilat_last_bookable_date(date) IS
  'sql/120 K3. Hari terakhir jendela pesan Kilat peneliti: hari kerja ke-3 mulai p_today.';
-- Dipanggil hanya dari trigger SECURITY DEFINER — hibah bawaan
-- (anon=X, authenticated=X dari pg_default_acl) dicabut.
REVOKE ALL ON FUNCTION public.kilat_last_bookable_date(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kilat_last_bookable_date(date) TO service_role;

-- ── 2.5 (L3 + K3) Klaim gelombang order ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_kilat_wave_claim()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_claim  boolean;
  v_label  text;
  v_last   date;
BEGIN
  -- Dipercaya: SQL Editor / cron / migrasi (tanpa JWT), service_role, admin.
  IF v_claims IS NULL
     OR COALESCE(v_claims ->> 'role', '') = 'service_role'
     OR COALESCE(v_claims ->> 'email', '') = 'product@jakpat.net' THEN
    RETURN NEW;
  END IF;

  -- Konversi Iklan ⇄ Kilat milik admin (convertDistributionType). Peneliti
  -- yang mengubahnya bisa memindahkan order ke kolam yang tidak ia bayar.
  IF TG_OP = 'UPDATE'
     AND OLD.distribution_type IS DISTINCT FROM NEW.distribution_type THEN
    RAISE EXCEPTION 'Jenis distribusi order tidak bisa diubah dari dashboard peneliti.'
      USING HINT = 'kilat_wave_invalid';
  END IF;

  IF NEW.distribution_type IS DISTINCT FROM 'kilat' THEN
    RETURN NEW;
  END IF;

  -- Klaim = mengambil kursi gelombang. Mengosongkan tanggal/hold BUKAN klaim:
  -- pelepasan yang terlambat tidak boleh gagal karena gelombangnya sudah tutup.
  IF TG_OP = 'INSERT' THEN
    v_claim := NEW.start_date IS NOT NULL;
  ELSE
    v_claim := NEW.start_date IS NOT NULL AND (
         OLD.start_date      IS DISTINCT FROM NEW.start_date
      OR OLD.end_date        IS DISTINCT FROM NEW.end_date
      OR OLD.kilat_slot_hour IS DISTINCT FROM NEW.kilat_slot_hour
      OR (NEW.slot_reserved_at IS NOT NULL
          AND OLD.slot_reserved_at IS DISTINCT FROM NEW.slot_reserved_at)
      OR (NEW.slot_booked_by IS NOT NULL
          AND OLD.slot_booked_by IS DISTINCT FROM NEW.slot_booked_by));
  END IF;
  IF NOT v_claim THEN
    RETURN NEW;
  END IF;

  IF NEW.slot_booked_by = 'admin' THEN
    RAISE EXCEPTION 'Gelombang atas nama admin hanya bisa ditugaskan admin.'
      USING HINT = 'kilat_wave_invalid';
  END IF;

  IF NEW.kilat_slot_hour IS NULL
     OR NOT (NEW.kilat_slot_hour = ANY (public.kilat_wave_hours())) THEN
    RAISE EXCEPTION 'Gelombang JFU Kilat hanya pukul 11.00 dan 15.00 WIB.'
      USING HINT = 'kilat_wave_invalid';
  END IF;

  -- Tanggal NULL/ganjil membuat halaman & undian beku tanpa tanda (rencana §5.2).
  IF NEW.end_date IS DISTINCT FROM NEW.start_date + 1 THEN
    RAISE EXCEPTION 'Jadwal JFU Kilat selalu satu gelombang: tanggal selesai harus tepat sehari sesudah tanggal mulai.'
      USING HINT = 'kilat_wave_invalid';
  END IF;

  IF extract(isodow FROM NEW.start_date) > 5 THEN
    RAISE EXCEPTION 'Gelombang JFU Kilat hanya Senin–Jumat.'
      USING HINT = 'kilat_wave_closed';
  END IF;

  -- sql/120 L3: mode libur menutup SEMUA gelombang sejak tanggal nyalanya.
  SELECT h.label INTO v_label
  FROM "JFU_operational_holidays" h
  WHERE h.holiday_date <= NEW.start_date AND h.is_active
  ORDER BY h.holiday_date DESC
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'JFU Kilat tutup sementara selama tim admin libur%. Gelombang bisa dipesan lagi setelah tim kembali.',
      CASE WHEN COALESCE(v_label, '') <> '' THEN ' (' || v_label || ')' ELSE '' END
      USING HINT = 'kilat_admin_away';
  END IF;

  -- sql/120 K3: peneliti hanya memesan 3 hari kerja mulai hari ini WIB.
  v_last := public.kilat_last_bookable_date((now() AT TIME ZONE 'Asia/Jakarta')::date);
  IF NEW.start_date > v_last THEN
    RAISE EXCEPTION 'Gelombang JFU Kilat hanya bisa dipesan untuk 3 hari kerja ke depan (paling jauh %).',
      to_char(v_last, 'DD-MM-YYYY')
      USING HINT = 'kilat_wave_too_far';
  END IF;

  IF now() > public.kilat_booking_closes_at(NEW.start_date, NEW.kilat_slot_hour) THEN
    RAISE EXCEPTION 'Pemesanan gelombang pukul %.00 WIB tanggal % sudah tutup (paling lambat 2 jam sebelumnya).',
      lpad(NEW.kilat_slot_hour::text, 2, '0'), to_char(NEW.start_date, 'DD-MM-YYYY')
      USING HINT = 'kilat_wave_closed';
  END IF;

  -- Satu pemesanan = satu gelombang (keputusan 7 Okt). Tidak pernah tampil.
  NEW.duration := 1;
  RETURN NEW;
END;
$function$;

-- ── 2.6 (L3 + K3) Klaim gelombang perpanjangan (ad_schedules) ───────────────
CREATE OR REPLACE FUNCTION public.validate_kilat_extend_claim()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  claims   jsonb;
  v_claim  boolean;
  v_ymd    date;
  v_label  text;
  v_last   date;
BEGIN
  -- Dipercaya, persis validate_kilat_wave_claim (sql/117 K4): tanpa JWT (SQL
  -- Editor, cron, migrasi), service_role (create-payment.js, webhook), dan
  -- admin (predikat policy "Admin Update ad_schedules").
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  IF claims IS NULL
     OR coalesce(claims ->> 'role', '')  = 'service_role'
     OR coalesce(claims ->> 'email', '') = 'product@jakpat.net' THEN
    RETURN NEW;
  END IF;

  -- Jenis distribusi jadwal milik admin (konversi Iklan ⇄ Kilat). Dari
  -- peneliti ia akan memindahkan jadwal antarkolam kuota (sql/111 vs sql/117).
  IF TG_OP = 'UPDATE' AND NEW.distribution_type IS DISTINCT FROM OLD.distribution_type THEN
    RAISE EXCEPTION 'Jenis distribusi jadwal tidak bisa diubah.'
      USING HINT = 'kilat_wave_invalid';
  END IF;

  IF NEW.distribution_type IS DISTINCT FROM 'kilat'
     OR coalesce(NEW.status, '') = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Klaim baru saja (pola D4 sql/111): INSERT, gelombang berpindah, atau hold
  -- diisi ulang ("memesan ulang jadwal yang sudah dilepas"). Melepas, membayar,
  -- dan catatan bukan klaim — order yang gelombangnya sudah lewat tetap bisa
  -- disentuh.
  v_claim := TG_OP = 'INSERT'
          OR NEW.start_date      IS DISTINCT FROM OLD.start_date
          OR NEW.end_date        IS DISTINCT FROM OLD.end_date
          OR NEW.kilat_slot_hour IS DISTINCT FROM OLD.kilat_slot_hour
          OR (NEW.slot_reserved_at IS NOT NULL AND NEW.slot_reserved_at IS DISTINCT FROM OLD.slot_reserved_at)
          OR (NEW.slot_booked_by   IS NOT NULL AND NEW.slot_booked_by   IS DISTINCT FROM OLD.slot_booked_by);
  IF NOT v_claim THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.slot_booked_by, '') = 'admin' THEN
    RAISE EXCEPTION 'Gelombang atas nama admin hanya bisa ditugaskan admin.'
      USING HINT = 'kilat_wave_invalid';
  END IF;

  IF NEW.start_date IS NULL OR NEW.kilat_slot_hour IS NULL
     OR NOT (NEW.kilat_slot_hour = ANY (kilat_wave_hours())) THEN
    RAISE EXCEPTION 'Gelombang JFU Kilat hanya pukul 11.00 dan 15.00 WIB.'
      USING HINT = 'kilat_wave_invalid';
  END IF;

  v_ymd := (NEW.start_date AT TIME ZONE 'Asia/Jakarta')::date;
  IF NEW.start_date <> kilat_instant_of(v_ymd, NEW.kilat_slot_hour)
     OR NEW.end_date IS DISTINCT FROM NEW.start_date + interval '24 hours' THEN
    RAISE EXCEPTION 'Jadwal JFU Kilat selalu satu gelombang: 24 jam sejak jam gelombangnya.'
      USING HINT = 'kilat_wave_invalid';
  END IF;

  IF extract(isodow FROM v_ymd) > 5 THEN
    RAISE EXCEPTION 'Gelombang JFU Kilat hanya Senin–Jumat.'
      USING HINT = 'kilat_wave_closed';
  END IF;

  -- sql/120 L3: mode libur menutup SEMUA gelombang sejak tanggal nyalanya.
  SELECT h.label INTO v_label
  FROM "JFU_operational_holidays" h
  WHERE h.holiday_date <= v_ymd AND h.is_active
  ORDER BY h.holiday_date DESC
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'JFU Kilat tutup sementara selama tim admin libur%. Gelombang bisa dipesan lagi setelah tim kembali.',
      CASE WHEN COALESCE(v_label, '') <> '' THEN ' (' || v_label || ')' ELSE '' END
      USING HINT = 'kilat_admin_away';
  END IF;

  -- sql/120 K3: peneliti hanya memesan 3 hari kerja mulai hari ini WIB.
  v_last := kilat_last_bookable_date((now() AT TIME ZONE 'Asia/Jakarta')::date);
  IF v_ymd > v_last THEN
    RAISE EXCEPTION 'Gelombang JFU Kilat hanya bisa dipesan untuk 3 hari kerja ke depan (paling jauh %).',
      to_char(v_last, 'DD-MM-YYYY')
      USING HINT = 'kilat_wave_too_far';
  END IF;

  IF now() > kilat_booking_closes_at(v_ymd, NEW.kilat_slot_hour) THEN
    RAISE EXCEPTION 'Pemesanan gelombang pukul %.00 WIB tanggal % sudah tutup (paling lambat 2 jam sebelumnya).',
      lpad(NEW.kilat_slot_hour::text, 2, '0'), to_char(v_ymd, 'DD-MM-YYYY')
      USING HINT = 'kilat_wave_closed';
  END IF;

  NEW.duration := 1;
  RETURN NEW;
END;
$function$;

-- ── 2.7 (L3) Okupansi gelombang untuk pemilih peneliti ─────────────────────
CREATE OR REPLACE FUNCTION public.get_kilat_wave_occupancy(p_from date, p_to date, p_exclude_submission_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(wave_date date, wave_hour smallint, used integer, capacity integer, booking_closes_at timestamp with time zone, is_closed boolean, closed_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RETURN;
  END IF;
  IF p_to - p_from > 31 THEN
    RAISE EXCEPTION 'Jendela okupansi gelombang paling panjang 31 hari.'
      USING HINT = 'kilat_occupancy_window_too_long';
  END IF;

  -- sql/120 L3: LATERAL … LIMIT 1, bukan LEFT JOIN — dengan `<=` beberapa
  -- baris aktif akan menggandakan baris hasil.
  RETURN QUERY
  SELECT d.d::date,
         h.h,
         public.count_kilat_wave_holds(d.d::date, h.h, NULL, p_exclude_submission_id),
         public.max_kilat_per_wave(),
         public.kilat_booking_closes_at(d.d::date, h.h),
         (extract(isodow FROM d.d) > 5 OR hol.x IS NOT NULL),
         CASE WHEN extract(isodow FROM d.d) > 5 THEN 'weekend'
              WHEN hol.x IS NOT NULL THEN 'holiday'
         END
  FROM generate_series(p_from, p_to, interval '1 day') AS d(d)
  CROSS JOIN unnest(public.kilat_wave_hours()) AS h(h)
  LEFT JOIN LATERAL (
    SELECT 1 AS x
    FROM "JFU_operational_holidays" oh
    WHERE oh.holiday_date <= d.d::date AND oh.is_active
    LIMIT 1
  ) hol ON true
  ORDER BY 1, 2;
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. Katalog. Harapan: semua kolom = true.
--
-- SELECT to_regclass('public."JFU_operational_holidays"') IS NOT NULL AS baru_ada,
--        to_regclass('public.operational_holidays') IS NULL            AS lama_hilang,
--        (SELECT count(*) FROM pg_policies
--          WHERE schemaname = 'public' AND tablename = 'JFU_operational_holidays') = 1 AS policy_ada,
--        (SELECT string_agg(column_name, ',' ORDER BY column_name)
--           FROM information_schema.column_privileges
--          WHERE table_schema = 'public' AND table_name = 'JFU_operational_holidays'
--            AND grantee = 'anon' AND privilege_type = 'SELECT')
--          = 'holiday_date,is_active,label,label_en'                  AS hibah_anon_4_kolom,
--        (SELECT string_agg(column_name, ',' ORDER BY column_name)
--           FROM information_schema.column_privileges
--          WHERE table_schema = 'public' AND table_name = 'JFU_operational_holidays'
--            AND grantee = 'authenticated' AND privilege_type = 'SELECT')
--          = 'holiday_date,is_active,label,label_en'                  AS hibah_auth_4_kolom,
--        EXISTS (SELECT 1 FROM information_schema.columns
--                 WHERE table_schema = 'public' AND table_name = 'form_submissions'
--                   AND column_name = 'forced_manual_reason')         AS kolom_penanda_ada,
--        (SELECT bool_and(prosrc LIKE '%"JFU_operational_holidays"%'
--                         AND prosrc NOT LIKE '%FROM operational_holidays%'
--                         AND prosrc NOT LIKE '%JOIN operational_holidays%')
--           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--          WHERE n.nspname = 'public'
--            AND proname IN ('validate_kilat_wave_claim', 'validate_kilat_extend_claim',
--                            'get_kilat_wave_occupancy'))              AS fungsi_pakai_nama_baru,
--        NOT has_function_privilege('authenticated', 'public.kilat_last_bookable_date(date)', 'EXECUTE')
--                                                                     AS helper_tertutup;
--
-- 3b. Jendela 3 hari kerja. Harapan: semua `cocok = true`.
--
-- SELECT t.hari, to_char(t.hari, 'Dy') AS dow,
--        public.kilat_last_bookable_date(t.hari) AS terakhir,
--        public.kilat_last_bookable_date(t.hari) = t.harap AS cocok
-- FROM (VALUES ('2026-10-26'::date, '2026-10-28'::date),   -- Sen → Rab
--              ('2026-10-29', '2026-11-02'),                -- Kam → Sen
--              ('2026-10-30', '2026-11-03'),                -- Jum → Sel
--              ('2026-10-31', '2026-11-04'),                -- Sab → Rab
--              ('2026-11-01', '2026-11-04')) AS t(hari, harap);  -- Min → Rab


-- ============================================================================
-- LANGKAH 4 — UJI PERILAKU (SELALU DIBATALKAN)
-- ============================================================================
--
-- Menyalakan libur sementara di dalam transaksi, lalu membaca RPC okupansi.
-- Harapan: bukan_tutup = 0 (setiap hari kerja 'holiday', akhir pekan
-- 'weekend'). ROLLBACK di akhir — tidak ada yang tersisa.
--
-- BEGIN;
-- INSERT INTO public."JFU_operational_holidays" (holiday_date, label, is_active)
-- VALUES ((now() AT TIME ZONE 'Asia/Jakarta')::date, 'Uji sql/120', true)
-- ON CONFLICT (holiday_date) DO UPDATE SET is_active = true;
-- SELECT count(*) FILTER (WHERE closed_reason IS NULL) AS bukan_tutup,
--        count(*) AS baris
-- FROM public.get_kilat_wave_occupancy((now() AT TIME ZONE 'Asia/Jakarta')::date,
--                                      (now() AT TIME ZONE 'Asia/Jakarta')::date + 7);
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK MIGRASI — hanya bila perlu kembali ke sql/117 + sql/119
-- ============================================================================
--
-- ⚠️ Menghapus forced_manual_reason menghapus penandanya: order Kilat yang
-- dialihkan selama libur akan terbaca jalur otomatis lagi (peneliti memilih
-- gelombang sendiri). Catat id-nya dulu:
--   SELECT id FROM form_submissions WHERE forced_manual_reason IS NOT NULL;
-- Baris libur aktif dimatikan dulu supaya model lama (satu tanggal) tidak
-- membaca tanggal nyala sebagai satu-satunya hari libur.
--
-- BEGIN;
-- UPDATE public."JFU_operational_holidays" SET is_active = false WHERE is_active;
--
-- CREATE OR REPLACE FUNCTION public.validate_kilat_wave_claim()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
--   v_claim  boolean;
--   v_label  text;
-- BEGIN
--   -- Dipercaya: SQL Editor / cron / migrasi (tanpa JWT), service_role, admin.
--   IF v_claims IS NULL
--      OR COALESCE(v_claims ->> 'role', '') = 'service_role'
--      OR COALESCE(v_claims ->> 'email', '') = 'product@jakpat.net' THEN
--     RETURN NEW;
--   END IF;
--
--   -- Konversi Iklan ⇄ Kilat milik admin (convertDistributionType). Peneliti
--   -- yang mengubahnya bisa memindahkan order ke kolam yang tidak ia bayar.
--   IF TG_OP = 'UPDATE'
--      AND OLD.distribution_type IS DISTINCT FROM NEW.distribution_type THEN
--     RAISE EXCEPTION 'Jenis distribusi order tidak bisa diubah dari dashboard peneliti.'
--       USING HINT = 'kilat_wave_invalid';
--   END IF;
--
--   IF NEW.distribution_type IS DISTINCT FROM 'kilat' THEN
--     RETURN NEW;
--   END IF;
--
--   -- Klaim = mengambil kursi gelombang. Mengosongkan tanggal/hold BUKAN klaim:
--   -- pelepasan yang terlambat tidak boleh gagal karena gelombangnya sudah tutup.
--   IF TG_OP = 'INSERT' THEN
--     v_claim := NEW.start_date IS NOT NULL;
--   ELSE
--     v_claim := NEW.start_date IS NOT NULL AND (
--          OLD.start_date      IS DISTINCT FROM NEW.start_date
--       OR OLD.end_date        IS DISTINCT FROM NEW.end_date
--       OR OLD.kilat_slot_hour IS DISTINCT FROM NEW.kilat_slot_hour
--       OR (NEW.slot_reserved_at IS NOT NULL
--           AND OLD.slot_reserved_at IS DISTINCT FROM NEW.slot_reserved_at)
--       OR (NEW.slot_booked_by IS NOT NULL
--           AND OLD.slot_booked_by IS DISTINCT FROM NEW.slot_booked_by));
--   END IF;
--   IF NOT v_claim THEN
--     RETURN NEW;
--   END IF;
--
--   IF NEW.slot_booked_by = 'admin' THEN
--     RAISE EXCEPTION 'Gelombang atas nama admin hanya bisa ditugaskan admin.'
--       USING HINT = 'kilat_wave_invalid';
--   END IF;
--
--   IF NEW.kilat_slot_hour IS NULL
--      OR NOT (NEW.kilat_slot_hour = ANY (public.kilat_wave_hours())) THEN
--     RAISE EXCEPTION 'Gelombang JFU Kilat hanya pukul 11.00 dan 15.00 WIB.'
--       USING HINT = 'kilat_wave_invalid';
--   END IF;
--
--   -- Tanggal NULL/ganjil membuat halaman & undian beku tanpa tanda (rencana §5.2).
--   IF NEW.end_date IS DISTINCT FROM NEW.start_date + 1 THEN
--     RAISE EXCEPTION 'Jadwal JFU Kilat selalu satu gelombang: tanggal selesai harus tepat sehari sesudah tanggal mulai.'
--       USING HINT = 'kilat_wave_invalid';
--   END IF;
--
--   IF extract(isodow FROM NEW.start_date) > 5 THEN
--     RAISE EXCEPTION 'Gelombang JFU Kilat hanya Senin–Jumat.'
--       USING HINT = 'kilat_wave_closed';
--   END IF;
--
--   SELECT h.label INTO v_label
--   FROM operational_holidays h
--   WHERE h.holiday_date = NEW.start_date AND h.is_active;
--   IF FOUND THEN
--     RAISE EXCEPTION 'Tanggal % libur operasional%. Pilih tanggal lain.',
--       to_char(NEW.start_date, 'DD-MM-YYYY'),
--       CASE WHEN COALESCE(v_label, '') <> '' THEN ' (' || v_label || ')' ELSE '' END
--       USING HINT = 'kilat_wave_closed';
--   END IF;
--
--   IF now() > public.kilat_booking_closes_at(NEW.start_date, NEW.kilat_slot_hour) THEN
--     RAISE EXCEPTION 'Pemesanan gelombang pukul %.00 WIB tanggal % sudah tutup (paling lambat 2 jam sebelumnya).',
--       lpad(NEW.kilat_slot_hour::text, 2, '0'), to_char(NEW.start_date, 'DD-MM-YYYY')
--       USING HINT = 'kilat_wave_closed';
--   END IF;
--
--   -- Satu pemesanan = satu gelombang (keputusan 7 Okt). Tidak pernah tampil.
--   NEW.duration := 1;
--   RETURN NEW;
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.validate_kilat_extend_claim()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   claims   jsonb;
--   v_claim  boolean;
--   v_ymd    date;
--   v_label  text;
-- BEGIN
--   -- Dipercaya, persis validate_kilat_wave_claim (sql/117 K4): tanpa JWT (SQL
--   -- Editor, cron, migrasi), service_role (create-payment.js, webhook), dan
--   -- admin (predikat policy "Admin Update ad_schedules").
--   claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
--   IF claims IS NULL
--      OR coalesce(claims ->> 'role', '')  = 'service_role'
--      OR coalesce(claims ->> 'email', '') = 'product@jakpat.net' THEN
--     RETURN NEW;
--   END IF;
--
--   -- Jenis distribusi jadwal milik admin (konversi Iklan ⇄ Kilat). Dari
--   -- peneliti ia akan memindahkan jadwal antarkolam kuota (sql/111 vs sql/117).
--   IF TG_OP = 'UPDATE' AND NEW.distribution_type IS DISTINCT FROM OLD.distribution_type THEN
--     RAISE EXCEPTION 'Jenis distribusi jadwal tidak bisa diubah.'
--       USING HINT = 'kilat_wave_invalid';
--   END IF;
--
--   IF NEW.distribution_type IS DISTINCT FROM 'kilat'
--      OR coalesce(NEW.status, '') = 'cancelled' THEN
--     RETURN NEW;
--   END IF;
--
--   -- Klaim baru saja (pola D4 sql/111): INSERT, gelombang berpindah, atau hold
--   -- diisi ulang ("memesan ulang jadwal yang sudah dilepas"). Melepas, membayar,
--   -- dan catatan bukan klaim — order yang gelombangnya sudah lewat tetap bisa
--   -- disentuh.
--   v_claim := TG_OP = 'INSERT'
--           OR NEW.start_date      IS DISTINCT FROM OLD.start_date
--           OR NEW.end_date        IS DISTINCT FROM OLD.end_date
--           OR NEW.kilat_slot_hour IS DISTINCT FROM OLD.kilat_slot_hour
--           OR (NEW.slot_reserved_at IS NOT NULL AND NEW.slot_reserved_at IS DISTINCT FROM OLD.slot_reserved_at)
--           OR (NEW.slot_booked_by   IS NOT NULL AND NEW.slot_booked_by   IS DISTINCT FROM OLD.slot_booked_by);
--   IF NOT v_claim THEN
--     RETURN NEW;
--   END IF;
--
--   IF coalesce(NEW.slot_booked_by, '') = 'admin' THEN
--     RAISE EXCEPTION 'Gelombang atas nama admin hanya bisa ditugaskan admin.'
--       USING HINT = 'kilat_wave_invalid';
--   END IF;
--
--   IF NEW.start_date IS NULL OR NEW.kilat_slot_hour IS NULL
--      OR NOT (NEW.kilat_slot_hour = ANY (kilat_wave_hours())) THEN
--     RAISE EXCEPTION 'Gelombang JFU Kilat hanya pukul 11.00 dan 15.00 WIB.'
--       USING HINT = 'kilat_wave_invalid';
--   END IF;
--
--   v_ymd := (NEW.start_date AT TIME ZONE 'Asia/Jakarta')::date;
--   IF NEW.start_date <> kilat_instant_of(v_ymd, NEW.kilat_slot_hour)
--      OR NEW.end_date IS DISTINCT FROM NEW.start_date + interval '24 hours' THEN
--     RAISE EXCEPTION 'Jadwal JFU Kilat selalu satu gelombang: 24 jam sejak jam gelombangnya.'
--       USING HINT = 'kilat_wave_invalid';
--   END IF;
--
--   IF extract(isodow FROM v_ymd) > 5 THEN
--     RAISE EXCEPTION 'Gelombang JFU Kilat hanya Senin–Jumat.'
--       USING HINT = 'kilat_wave_closed';
--   END IF;
--
--   SELECT h.label INTO v_label
--   FROM operational_holidays h
--   WHERE h.holiday_date = v_ymd AND h.is_active;
--   IF FOUND THEN
--     RAISE EXCEPTION 'Tanggal % libur operasional%. Pilih tanggal lain.',
--       to_char(v_ymd, 'DD-MM-YYYY'),
--       CASE WHEN COALESCE(v_label, '') <> '' THEN ' (' || v_label || ')' ELSE '' END
--       USING HINT = 'kilat_wave_closed';
--   END IF;
--
--   IF now() > kilat_booking_closes_at(v_ymd, NEW.kilat_slot_hour) THEN
--     RAISE EXCEPTION 'Pemesanan gelombang pukul %.00 WIB tanggal % sudah tutup (paling lambat 2 jam sebelumnya).',
--       lpad(NEW.kilat_slot_hour::text, 2, '0'), to_char(v_ymd, 'DD-MM-YYYY')
--       USING HINT = 'kilat_wave_closed';
--   END IF;
--
--   NEW.duration := 1;
--   RETURN NEW;
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.get_kilat_wave_occupancy(p_from date, p_to date, p_exclude_submission_id uuid DEFAULT NULL::uuid)
--  RETURNS TABLE(wave_date date, wave_hour smallint, used integer, capacity integer, booking_closes_at timestamp with time zone, is_closed boolean, closed_reason text)
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- BEGIN
--   IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
--     RETURN;
--   END IF;
--   IF p_to - p_from > 31 THEN
--     RAISE EXCEPTION 'Jendela okupansi gelombang paling panjang 31 hari.'
--       USING HINT = 'kilat_occupancy_window_too_long';
--   END IF;
--
--   RETURN QUERY
--   SELECT d.d::date,
--          h.h,
--          public.count_kilat_wave_holds(d.d::date, h.h, NULL, p_exclude_submission_id),
--          public.max_kilat_per_wave(),
--          public.kilat_booking_closes_at(d.d::date, h.h),
--          (extract(isodow FROM d.d) > 5 OR hol.holiday_date IS NOT NULL),
--          CASE WHEN extract(isodow FROM d.d) > 5 THEN 'weekend'
--               WHEN hol.holiday_date IS NOT NULL THEN 'holiday'
--          END
--   FROM generate_series(p_from, p_to, interval '1 day') AS d(d)
--   CROSS JOIN unnest(public.kilat_wave_hours()) AS h(h)
--   LEFT JOIN operational_holidays hol
--          ON hol.holiday_date = d.d::date AND hol.is_active
--   ORDER BY 1, 2;
-- END;
-- $function$;
--
-- DROP FUNCTION IF EXISTS public.kilat_last_bookable_date(date);
-- ALTER TABLE public.form_submissions DROP COLUMN IF EXISTS forced_manual_reason;
-- ALTER TABLE public."JFU_operational_holidays" DROP COLUMN IF EXISTS label_en;
-- ALTER TABLE public."JFU_operational_holidays"
--   RENAME CONSTRAINT "JFU_operational_holidays_label_check" TO operational_holidays_label_check;
-- ALTER INDEX public."JFU_operational_holidays_pkey" RENAME TO operational_holidays_pkey;
-- ALTER TABLE public."JFU_operational_holidays" RENAME TO operational_holidays;
-- COMMENT ON TABLE public.operational_holidays IS
--   'Hari libur tim admin (Phase 5 §5.4b). Aktif = Kilat tutup di tanggal itu; Iklan otomatis tetap tayang. Ditulis HANYA lewat /api/admin/holidays (service_role).';
-- COMMENT ON COLUMN public.operational_holidays.holiday_date IS NULL;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
--
-- Sesudah rollback: md5 ketiga fungsi harus kembali ke nilai Langkah 1a.
