-- ============================================================================
-- sql/117 — FONDASI GELOMBANG KILAT SWALAYAN (Phase 5, rilis R2)
-- ============================================================================
--
-- Rencana: docs/superpowers/plans/2026-10-14-phase-5-kilat-swalayan.md §5.2
-- dan §5.4b (tabel libur saja). Berkas ini TIDAK membuka pintu Kilat untuk
-- peneliti — pintunya dibuka di R7. Yang dipasang di sini adalah aturan yang
-- harus sudah menggigit SEBELUM pintu itu terbuka, ditegakkan database untuk
-- setiap penulis.
--
-- ── PERILAKU SESUDAH BERKAS INI ─────────────────────────────────────────────
--
--   K1  CHECK form_submissions.kilat_slot_hour diperluas ke (8,11,14,15,17).
--       Jam lama tetap sah demi riwayat (19 order lunas di 8/11/14/17);
--       pilihan BARU dibatasi trigger K4 ke kilat_wave_hours() = {11, 15}.
--   K2  Tabel operational_holidays (KOSONG). Baca: anon + authenticated, hanya
--       kolom tanggal/label/aktif. Tulis: TIDAK ADA dari browser — jalurnya
--       Pages Function admin /api/admin/holidays (rilis R3).
--   K3  Kuota gelombang: trigger AFTER INSERT OR UPDATE di ad_schedules, maks
--       max_kilat_per_wave() = 2 jadwal per (tanggal WIB, jam). Berlaku untuk
--       SEMUA penulis, termasuk admin. Pola sql/111:
--         • AFTER, karena upsert cermin ordinal 1 menyalakan BEFORE INSERT;
--         • hanya klaim baru yang dicek (gelombang/hold berubah); bayar,
--           catatan, review, dan bayar telat untuk hold kedaluwarsa lewat (D3);
--         • gelombang lampau tidak dicek;
--         • satu advisory lock; hold peneliti belum lunas > 1 jam tidak lagi
--           menahan kursi (aturan holdsSlot).
--       HINT 'kilat_wave_full'.
--   K4  Validasi klaim Kilat di form_submissions (BEFORE INSERT OR UPDATE),
--       HANYA untuk pemanggil peneliti. Dipercaya (dilewati): tanpa JWT (SQL
--       Editor, cron, migrasi), service_role, dan admin (product@jakpat.net —
--       predikat yang sama dengan policy "Admin Update Submissions").
--       Klaim = INSERT bertanggal, atau tanggal/jam berubah, atau hold
--       (slot_reserved_at / slot_booked_by) diisi ulang. Pelepasan (tanggal
--       dikosongkan), bayar, dan catatan BUKAN klaim. Syarat klaim:
--         • slot_booked_by bukan 'admin';
--         • jam ∈ {11, 15};
--         • end_date = start_date + 1;
--         • Senin–Jumat dan bukan tanggal libur aktif;
--         • now() ≤ gelombang − 2 jam (gelombang 11.00 tutup 09.00, 15.00 tutup 13.00);
--         • duration DIPAKSA 1.
--       Ditambah: peneliti tidak boleh mengubah distribution_type order APA
--       PUN sesudah INSERT (konversi Iklan ⇄ Kilat milik admin).
--       HINT 'kilat_wave_invalid' / 'kilat_wave_closed'.
--   K5  Penjaga irisan sadar gelombang: assert_no_schedule_overlap dan cabang
--       induk assert_schedule_window_free membaca jendela Kilat sebagai
--       [kilat_instant_of(start, jam), kilat_instant_of(end, jam)), bukan
--       15.00 terpatok. Trigger trg_submission_no_overlap kini juga menyala
--       saat jam gelombang berubah. Jendela Kilat 24 jam ⇒ "jarak minimal 24
--       jam antargelombang satu order" tanpa kode tambahan (siap untuk R8).
--   K6  get_kilat_wave_occupancy(p_from, p_to, p_exclude_submission_id):
--       hitungan per (tanggal, jam) untuk {11, 15}, tanpa identitas, jendela
--       ≤ 31 hari, akhir pekan & libur aktif ditandai tertutup. Untuk
--       authenticated (pemilih gelombang peneliti, rilis R5).
--   K7  release_expired_order_slots (cron sql/94) ikut meng-NULL-kan
--       kilat_slot_hour saat melepas hold. Badannya DISALIN dari produksi
--       15 Okt 2026 (pg_get_functiondef), satu baris ditambah.
--
-- Tidak memindahkan, membatalkan, atau menagih order apa pun. Nol order Kilat
-- bertanggal ke depan per 15 Okt 2026; 3 order Kilat lama macet (e56f4853,
-- 4a112eae, be488b57) bertanggal lampau dan tetap bisa disentuh (Langkah 4).
--
-- ── URUTAN ──────────────────────────────────────────────────────────────────
--
--   Langkah 1 (pra-cek) → Langkah 2 (migrasi) → Langkah 3 (verifikasi) →
--   Langkah 4 (uji perilaku, selalu dibatalkan) → baru push frontend R2.
--   Jalankan di SQL Editor Supabase. JANGAN lewat MCP.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — PRA-CEK (baca saja)
-- ============================================================================
--
-- 1a. Badan fungsi yang hidup harus SAMA dengan yang disalin ke blok ROLLBACK
--     di bawah (diambil 15 Okt 2026). Harapan: tiga baris `sama = true`.
--     Ada `false` = berhenti, laporkan dulu.
--
-- SELECT p.proname,
--        md5(pg_get_functiondef(p.oid)) = CASE p.proname
--          WHEN 'assert_no_schedule_overlap'  THEN '2bb681db7a0b6e467a488392977f00d2'
--          WHEN 'assert_schedule_window_free' THEN '08527d372412f97c25b0cf8abf834770'
--          WHEN 'release_expired_order_slots' THEN '3f6745b139012e8e74b8c120dbba4787'
--        END AS sama
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('assert_no_schedule_overlap', 'assert_schedule_window_free',
--                     'release_expired_order_slots')
-- ORDER BY 1;
--
-- 1b. Order Kilat bertanggal hari ini atau sesudahnya. Harapan: 0 baris.
--     (Ada baris = gelombangnya mungkin melanggar aturan baru; laporkan dulu.)
--
-- SELECT left(id::text, 8) AS id, start_date, kilat_slot_hour, submission_status,
--        payment_status, slot_booked_by
-- FROM form_submissions
-- WHERE distribution_type = 'kilat'
--   AND start_date >= (now() AT TIME ZONE 'Asia/Jakarta')::date;
--
-- 1c. Gelombang yang sudah berisi > 2 jadwal (riwayat). Informasi saja —
--     trigger K3 tidak memeriksa gelombang lampau.
--
-- SELECT (a.start_date AT TIME ZONE 'Asia/Jakarta')::date AS hari,
--        a.kilat_slot_hour AS jam, count(*) AS isi
-- FROM ad_schedules a
-- WHERE a.distribution_type = 'kilat' AND a.start_date IS NOT NULL
--   AND a.kilat_slot_hour IS NOT NULL
-- GROUP BY 1, 2 HAVING count(*) > 2 ORDER BY 1;
--
-- 1d. Nama baru belum dipakai. Harapan: 0 baris.
--
-- SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND proname IN ('kilat_wave_hours', 'max_kilat_per_wave', 'kilat_booking_closes_at',
--                   'ad_schedule_occupies_kilat_wave',
--                   'count_kilat_wave_holds', 'enforce_kilat_wave_quota',
--                   'validate_kilat_wave_claim', 'get_kilat_wave_occupancy')
-- UNION ALL
-- SELECT relname FROM pg_class WHERE relname = 'operational_holidays';


-- ============================================================================
-- LANGKAH 2 — MIGRASI (satu transaksi)
-- ============================================================================

BEGIN;

-- ── 2.1 (K1) CHECK jam gelombang ───────────────────────────────────────────
ALTER TABLE public.form_submissions
  DROP CONSTRAINT IF EXISTS form_submissions_kilat_slot_hour_check;
ALTER TABLE public.form_submissions
  ADD CONSTRAINT form_submissions_kilat_slot_hour_check
  CHECK (kilat_slot_hour IS NULL OR kilat_slot_hour = ANY (ARRAY[8, 11, 14, 15, 17]));

-- ── 2.2 Konstanta gelombang ────────────────────────────────────────────────
-- Cermin KILAT_SLOT_HOURS & KILAT_QUOTA_PER_SLOT di src/utils/constants.ts —
-- WAJIB diubah bersamaan.
CREATE OR REPLACE FUNCTION public.kilat_wave_hours()
RETURNS smallint[]
LANGUAGE sql
IMMUTABLE
AS $function$ SELECT ARRAY[11, 15]::smallint[] $function$;

CREATE OR REPLACE FUNCTION public.max_kilat_per_wave()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$ SELECT 2 $function$;

-- Batas pesan = gelombang − 2 jam (keputusan 5 Okt; KILAT_BOOKING_LEAD_MIN di
-- constants.ts). SATU sumber untuk trigger K4 dan okupansi K6.
CREATE OR REPLACE FUNCTION public.kilat_booking_closes_at(d date, h smallint)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$ SELECT kilat_instant_of(d, h) - interval '120 minutes' $function$;

-- ── 2.3 (K2) Kalender libur operasional ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.operational_holidays (
  holiday_date date        PRIMARY KEY,
  label        text        NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  is_active    boolean     NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   text
);

COMMENT ON TABLE public.operational_holidays IS
  'Hari libur tim admin (Phase 5 §5.4b). Aktif = Kilat tutup di tanggal itu; '
  'Iklan otomatis tetap tayang. Ditulis HANYA lewat /api/admin/holidays (service_role).';

ALTER TABLE public.operational_holidays ENABLE ROW LEVEL SECURITY;

-- pg_default_acl memberi anon & authenticated SEMUA hak atas tabel baru.
REVOKE ALL ON public.operational_holidays FROM PUBLIC, anon, authenticated;
GRANT SELECT (holiday_date, label, is_active) ON public.operational_holidays TO anon, authenticated;
GRANT ALL ON public.operational_holidays TO service_role;

DROP POLICY IF EXISTS "Siapa pun boleh membaca hari libur" ON public.operational_holidays;
CREATE POLICY "Siapa pun boleh membaca hari libur"
  ON public.operational_holidays FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── 2.4 (K3) Predikat & penghitung kursi gelombang ─────────────────────────
-- Saringan status IDENTIK dengan ad_schedule_occupies_daily_quota (sql/111),
-- hanya kolamnya yang dibalik: Kilat saja, dan wajib punya jam.
CREATE OR REPLACE FUNCTION public.ad_schedule_occupies_kilat_wave(p_row ad_schedules)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
           p_row.start_date IS NOT NULL
       AND p_row.kilat_slot_hour IS NOT NULL
       AND p_row.distribution_type = 'kilat'
       AND CASE
             WHEN p_row.source_table = 'form_submissions_extend' THEN
               p_row.status IN ('waiting_payment','paid','scheduled','live')
             ELSE
               p_row.status IN ('waiting_payment','paid','scheduled','live','slot_reserved')
               OR (p_row.status = 'requested'
                   AND p_row.review_status IS DISTINCT FROM 'in_review')
           END,
         false);
$function$;

-- Kursi terpakai di satu gelombang, dari KEDUA kaki (cermin ordinal 1 dan
-- baris perpanjangan sama-sama hidup di ad_schedules). Gelombang = (tanggal
-- WIB, jam), bukan instan persis, supaya selisih menit tidak memecah kolam.
--
-- ⚠️ VOLATILE, sama alasannya dengan assert_daily_ad_quota_days: dipanggil
--    sesudah advisory lock dan harus melihat snapshot baru.
CREATE OR REPLACE FUNCTION public.count_kilat_wave_holds(
  p_day                   date,
  p_hour                  smallint,
  p_exclude_schedule_id   uuid DEFAULT NULL,
  p_exclude_submission_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT count(*)::int
  FROM ad_schedules a
  WHERE public.ad_schedule_occupies_kilat_wave(a)
    AND (a.start_date AT TIME ZONE 'Asia/Jakarta')::date = p_day
    AND a.kilat_slot_hour = p_hour
    AND (p_exclude_schedule_id   IS NULL OR a.id            <> p_exclude_schedule_id)
    AND (p_exclude_submission_id IS NULL OR a.submission_id <> p_exclude_submission_id)
    -- Aturan pelepasan holdsSlot(): hold peneliti belum lunas yang sudah lewat
    -- 1 jam TIDAK LAGI menahan kursi. Ambang eksklusif.
    AND NOT (
      COALESCE(a.slot_booked_by,'') = 'user'
      AND COALESCE(a.payment_status,'pending') NOT IN ('paid','completed')
      AND a.slot_reserved_at IS NOT NULL
      AND a.slot_reserved_at < now() - interval '1 hour'
    );
$function$;

-- ── 2.5 (K3) Trigger kuota gelombang ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_kilat_wave_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_day   date;
  v_same  boolean := false;
  v_used  integer;
  v_quota integer := public.max_kilat_per_wave();
  v_bulan CONSTANT text[] :=
    ARRAY['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
BEGIN
  IF NOT public.ad_schedule_occupies_kilat_wave(NEW) THEN
    RETURN NULL;
  END IF;

  v_day := (NEW.start_date AT TIME ZONE 'Asia/Jakarta')::date;

  -- Klaim yang SAMA: baris lama sudah menahan kursi di gelombang yang sama dan
  -- hold-nya tidak diperbarui (D4 sql/111). Bayar, live, catatan, review —
  -- termasuk bayar telat untuk hold kedaluwarsa (D3) — jatuh di sini.
  -- Dipisah dengan IF: OLD tidak terisi pada INSERT.
  IF TG_OP = 'UPDATE' THEN
    v_same :=
          public.ad_schedule_occupies_kilat_wave(OLD)
      AND (OLD.start_date AT TIME ZONE 'Asia/Jakarta')::date = v_day
      AND OLD.kilat_slot_hour   IS NOT DISTINCT FROM NEW.kilat_slot_hour
      AND OLD.slot_reserved_at  IS NOT DISTINCT FROM NEW.slot_reserved_at
      AND OLD.slot_booked_by    IS NOT DISTINCT FROM NEW.slot_booked_by;
  END IF;
  IF v_same THEN
    RETURN NULL;
  END IF;

  -- Gelombang lampau tidak mengambil kursi siapa pun.
  IF v_day < (now() AT TIME ZONE 'Asia/Jakarta')::date THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('kilat-wave-quota', 0::bigint));

  v_used := public.count_kilat_wave_holds(v_day, NEW.kilat_slot_hour, NEW.id, NULL);
  IF v_used >= v_quota THEN
    RAISE EXCEPTION
      'Gelombang JFU Kilat % pukul %.00 WIB sudah penuh (% dari %). Pilih gelombang lain.',
      to_char(v_day, 'DD') || ' ' || v_bulan[extract(month FROM v_day)::int]
        || ' ' || to_char(v_day, 'YYYY'),
      lpad(NEW.kilat_slot_hour::text, 2, '0'),
      v_used, v_quota
      USING HINT = 'kilat_wave_full';
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ad_schedules_kilat_wave_quota ON public.ad_schedules;
CREATE TRIGGER trg_ad_schedules_kilat_wave_quota
  AFTER INSERT OR UPDATE OF start_date, end_date, status, review_status,
                            distribution_type, kilat_slot_hour,
                            slot_reserved_at, slot_booked_by
  ON public.ad_schedules
  FOR EACH ROW EXECUTE FUNCTION public.enforce_kilat_wave_quota();

-- ── 2.6 (K4) Validasi klaim Kilat oleh peneliti ────────────────────────────
-- SECURITY DEFINER supaya peneliti tidak butuh EXECUTE atas helper-nya;
-- request.jwt.claims tetap terbaca karena itu pengaturan sesi, bukan peran.
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

  SELECT h.label INTO v_label
  FROM operational_holidays h
  WHERE h.holiday_date = NEW.start_date AND h.is_active;
  IF FOUND THEN
    RAISE EXCEPTION 'Tanggal % libur operasional%. Pilih tanggal lain.',
      to_char(NEW.start_date, 'DD-MM-YYYY'),
      CASE WHEN COALESCE(v_label, '') <> '' THEN ' (' || v_label || ')' ELSE '' END
      USING HINT = 'kilat_wave_closed';
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

DROP TRIGGER IF EXISTS trg_form_submissions_kilat_wave_claim ON public.form_submissions;
CREATE TRIGGER trg_form_submissions_kilat_wave_claim
  BEFORE INSERT OR UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.validate_kilat_wave_claim();

-- ── 2.7 (K5) Penjaga irisan sadar gelombang ────────────────────────────────
-- Disalin dari produksi 15 Okt 2026 (md5 di Langkah 1a). Yang berubah hanya
-- cara jendela Kilat dihitung, ditandai "sql/117".
CREATE OR REPLACE FUNCTION public.assert_no_schedule_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_start TIMESTAMPTZ;
  v_end   TIMESTAMPTZ;
BEGIN
  -- sql/117: jendela Kilat = [gelombang, gelombang + 24 jam), bukan 15.00.
  IF NEW.distribution_type = 'kilat' AND NEW.kilat_slot_hour IS NOT NULL THEN
    v_start := kilat_instant_of(NEW.start_date, NEW.kilat_slot_hour);
    v_end   := kilat_instant_of(NEW.end_date,   NEW.kilat_slot_hour);
  ELSE
    v_start := airing_instant_of_date(NEW.start_date);
    v_end   := airing_instant_of_date(NEW.end_date);
  END IF;

  IF v_start IS NULL OR v_end IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.start_date IS NOT DISTINCT FROM OLD.start_date
       AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date
       AND NEW.kilat_slot_hour IS NOT DISTINCT FROM OLD.kilat_slot_hour  -- sql/117
       AND NOT (
         OLD.submission_status IN ('cancelled', 'rejected', 'spam')
         AND NEW.submission_status NOT IN ('cancelled', 'rejected', 'spam')
       )
    THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.submission_status IN ('rejected', 'spam') THEN
    RETURN NEW;
  END IF;

  PERFORM assert_schedule_window_free(NEW.id, v_start, v_end, NULL, false);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_submission_no_overlap ON public.form_submissions;
CREATE TRIGGER trg_submission_no_overlap
  BEFORE UPDATE OF start_date, end_date, kilat_slot_hour ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.assert_no_schedule_overlap();

CREATE OR REPLACE FUNCTION public.assert_schedule_window_free(p_submission_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_exclude_source_id uuid, p_check_parent boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conflict RECORD;
BEGIN
  IF p_start IS NULL OR p_end IS NULL THEN RETURN; END IF;

  IF p_check_parent THEN
    -- sql/117: jendela induk Kilat dibaca di jam gelombangnya.
    SELECT w.sd AS start_date, w.ed AS end_date
      INTO v_conflict
    FROM form_submissions fs
    CROSS JOIN LATERAL (
      SELECT CASE WHEN fs.distribution_type = 'kilat' AND fs.kilat_slot_hour IS NOT NULL
                  THEN kilat_instant_of(fs.start_date, fs.kilat_slot_hour)
                  ELSE airing_instant_of_date(fs.start_date) END AS sd,
             CASE WHEN fs.distribution_type = 'kilat' AND fs.kilat_slot_hour IS NOT NULL
                  THEN kilat_instant_of(fs.end_date, fs.kilat_slot_hour)
                  ELSE airing_instant_of_date(fs.end_date) END AS ed
    ) w
    WHERE fs.id = p_submission_id
      AND fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
      AND fs.submission_status NOT IN
          ('rejected','spam','in_review','completed','cancelled','slot_cancelled')
      AND NOT (
        COALESCE(fs.slot_booked_by,'') = 'user'
        AND COALESCE(fs.payment_status,'pending') NOT IN ('paid','completed')
        AND fs.slot_reserved_at IS NOT NULL
        AND fs.slot_reserved_at < NOW() - INTERVAL '1 hour'
      )
      AND p_start < w.ed
      AND w.sd < p_end
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Jadwal beririsan dengan jadwal pertama survei ini (% s/d %). Satu survei hanya bisa tayang di satu periode pada satu waktu.',
        TO_CHAR(v_conflict.start_date,'DD Mon YYYY'), TO_CHAR(v_conflict.end_date,'DD Mon YYYY');
    END IF;
  END IF;

  SELECT a.start_date, a.end_date INTO v_conflict
  FROM ad_schedules a
  WHERE a.submission_id = p_submission_id
    AND a.source_table = 'form_submissions_extend'
    AND (p_exclude_source_id IS NULL OR a.source_id <> p_exclude_source_id)
    AND a.status IN ('waiting_payment','paid','scheduled','live')
    AND a.start_date IS NOT NULL AND a.end_date IS NOT NULL
    AND NOT (
      COALESCE(a.slot_booked_by,'') = 'user'
      AND COALESCE(a.payment_status,'pending') NOT IN ('paid','completed')
      AND a.slot_reserved_at IS NOT NULL
      AND a.slot_reserved_at < NOW() - INTERVAL '1 hour'
    )
    AND p_start < a.end_date AND a.start_date < p_end
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Jadwal beririsan dengan jadwal lain survei ini (% s/d %). Satu survei hanya bisa tayang di satu periode pada satu waktu.',
      TO_CHAR(v_conflict.start_date,'DD Mon YYYY'), TO_CHAR(v_conflict.end_date,'DD Mon YYYY');
  END IF;
END;
$function$;

-- ── 2.8 (K6) Okupansi gelombang untuk pemilih peneliti ─────────────────────
CREATE OR REPLACE FUNCTION public.get_kilat_wave_occupancy(
  p_from                  date,
  p_to                    date,
  p_exclude_submission_id uuid DEFAULT NULL
)
RETURNS TABLE (
  wave_date         date,
  wave_hour         smallint,
  used              integer,
  capacity          integer,
  booking_closes_at timestamptz,
  is_closed         boolean,
  closed_reason     text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

  RETURN QUERY
  SELECT d.d::date,
         h.h,
         public.count_kilat_wave_holds(d.d::date, h.h, NULL, p_exclude_submission_id),
         public.max_kilat_per_wave(),
         public.kilat_booking_closes_at(d.d::date, h.h),
         (extract(isodow FROM d.d) > 5 OR hol.holiday_date IS NOT NULL),
         CASE WHEN extract(isodow FROM d.d) > 5 THEN 'weekend'
              WHEN hol.holiday_date IS NOT NULL THEN 'holiday'
         END
  FROM generate_series(p_from, p_to, interval '1 day') AS d(d)
  CROSS JOIN unnest(public.kilat_wave_hours()) AS h(h)
  LEFT JOIN operational_holidays hol
         ON hol.holiday_date = d.d::date AND hol.is_active
  ORDER BY 1, 2;
END;
$function$;

-- ── 2.9 (K7) Cron pelepas ikut meng-NULL-kan jam gelombang ─────────────────
-- Disalin dari produksi 15 Okt 2026 (md5 di Langkah 1a); satu baris ditambah.
CREATE OR REPLACE FUNCTION public.release_expired_order_slots()
 RETURNS TABLE(lepas_submission_id uuid, tindakan text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  WITH lepas AS (
    UPDATE form_submissions fs
       SET start_date        = NULL,
           end_date          = NULL,
           kilat_slot_hour   = NULL,   -- sql/117
           slot_booked_by    = NULL,
           slot_reserved_at  = NULL,
           submission_status = 'slot_reserved',
           payment_status    = 'expired',
           updated_at        = NOW()
     WHERE fs.slot_booked_by = 'user'
       AND fs.slot_reserved_at IS NOT NULL
       AND fs.slot_reserved_at < NOW() - interval '60 minutes'
       AND fs.start_date IS NOT NULL
       -- Penjaga lunas BERLAPIS, semuanya di dalam WHERE yang sama.
       AND COALESCE(fs.payment_status,'') NOT IN ('paid','completed','expired')
       AND NOT EXISTS (SELECT 1 FROM transactions t
                        WHERE t.form_submission_id = fs.id
                          AND t.status IN ('paid','completed','settled'))
       AND NOT EXISTS (SELECT 1 FROM invoices i
                        WHERE i.form_submission_id = fs.id
                          AND i.status IN ('paid','completed','settled'))
    RETURNING fs.id
  )
  SELECT array_agg(id) INTO v_ids FROM lepas;

  IF v_ids IS NULL THEN RETURN; END IF;

  -- Tagihan yang masih pending ikut mati. Hanya `pending` — status lain
  -- (paid/expired/cancelled) sudah punya artinya sendiri.
  UPDATE transactions SET status = 'expired', updated_at = NOW()
   WHERE form_submission_id = ANY(v_ids) AND status = 'pending';

  -- ⚠️ `invoices` TIDAK punya `updated_at` (diverifikasi information_schema
  -- 18 Sep) — menyebutnya di sini akan lolos CREATE lalu meledak saat cron
  -- BERJALAN. Persis jebakan sql/93 kemarin.
  UPDATE invoices SET status = 'expired'
   WHERE form_submission_id = ANY(v_ids) AND status = 'pending';

  /*
    sql/99: halaman iklan TIDAK LAGI dikosongkan di sini.

    Dulu: `UPDATE survey_pages SET publish_start_date = NULL,
    publish_end_date = NULL`. Tanggal NULL = "tayang selamanya" di feed, dan
    tulisan itu jalan SESUDAH UPDATE form_submissions di atas — jadi ia
    menimpa penutupan jendela dari trg_form_submissions_close_page. Order
    08ef25ac bocor 11 responden lewat jalur kembarannya (cancelSchedule).
    Penutupan sekarang milik trigger itu seorang.
  */

  RETURN QUERY SELECT unnest(v_ids), 'slot_dilepas'::text;
END;
$function$;

-- ── 2.10 Hibah ─────────────────────────────────────────────────────────────
-- pg_default_acl memberi anon DAN authenticated EXECUTE atas setiap fungsi
-- baru; REVOKE FROM PUBLIC tidak mencabutnya. Cabut eksplisit, lalu periksa
-- proacl di Langkah 3a.
REVOKE ALL ON FUNCTION public.kilat_wave_hours()                              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.max_kilat_per_wave()                            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kilat_booking_closes_at(date, smallint)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ad_schedule_occupies_kilat_wave(ad_schedules)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_kilat_wave_holds(date, smallint, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_kilat_wave_quota()                      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_kilat_wave_claim()                     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_kilat_wave_occupancy(date, date, uuid)      FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.kilat_wave_hours()                              TO service_role;
GRANT EXECUTE ON FUNCTION public.max_kilat_per_wave()                            TO service_role;
GRANT EXECUTE ON FUNCTION public.kilat_booking_closes_at(date, smallint)         TO service_role;
GRANT EXECUTE ON FUNCTION public.ad_schedule_occupies_kilat_wave(ad_schedules)   TO service_role;
GRANT EXECUTE ON FUNCTION public.count_kilat_wave_holds(date, smallint, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_kilat_wave_quota()                      TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_kilat_wave_claim()                     TO service_role;
GRANT EXECUTE ON FUNCTION public.get_kilat_wave_occupancy(date, date, uuid)      TO authenticated, service_role;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. ACL. Harapan: get_kilat_wave_occupancy = postgres + authenticated +
--     service_role; tujuh lainnya = postgres + service_role. TIDAK ADA anon.
--
-- SELECT p.proname, array_to_string(p.proacl, ' | ') AS acl, p.provolatile, p.prosecdef
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('kilat_wave_hours', 'max_kilat_per_wave', 'kilat_booking_closes_at',
--                     'ad_schedule_occupies_kilat_wave',
--                     'count_kilat_wave_holds', 'enforce_kilat_wave_quota',
--                     'validate_kilat_wave_claim', 'get_kilat_wave_occupancy')
-- ORDER BY 1;
--
-- 3b. Hak tabel libur. Harapan: anon & authenticated hanya SELECT pada tiga
--     kolom (holiday_date, is_active, label); tanpa INSERT/UPDATE/DELETE.
--
-- SELECT grantee, privilege_type, column_name
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public' AND table_name = 'operational_holidays'
--   AND grantee IN ('anon', 'authenticated')
-- ORDER BY 1, 2, 3;
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND table_name = 'operational_holidays'
--   AND grantee IN ('anon', 'authenticated');      -- harapan: 0 baris
--
-- 3c. Trigger & CHECK. Harapan: tiga baris trigger seperti di Langkah 2, dan
--     CHECK memuat 15.
--
-- SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
-- WHERE tgname IN ('trg_ad_schedules_kilat_wave_quota',
--                  'trg_form_submissions_kilat_wave_claim', 'trg_submission_no_overlap');
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname = 'form_submissions_kilat_slot_hour_check';
--
-- 3d. BLOK SENTUH — setiap order Kilat (24 per 15 Okt) disentuh tanpa
--     mengubah apa pun, sebagai peneliti lalu sebagai admin, persis seperti
--     catatan/webhook menyentuhnya. Harapan: "SENTUH_SELESAI — N order, 0 gagal".
--
-- BEGIN;
-- SET LOCAL ROLE postgres;
-- DO $sentuh$
-- DECLARE r record; v_n int := 0; v_gagal int := 0; v_contoh text := ''; v_siapa text;
-- BEGIN
--   FOR r IN SELECT id FROM form_submissions WHERE distribution_type = 'kilat' LOOP
--     v_n := v_n + 1;
--     FOREACH v_siapa IN ARRAY ARRAY[
--       '{"role":"authenticated","email":"uji-peneliti@example.com"}',
--       '{"role":"authenticated","email":"product@jakpat.net"}'] LOOP
--       BEGIN
--         PERFORM set_config('request.jwt.claims', v_siapa, true);
--         UPDATE form_submissions SET admin_notes = admin_notes WHERE id = r.id;
--         UPDATE form_submissions SET submission_status = submission_status WHERE id = r.id;
--       EXCEPTION WHEN OTHERS THEN
--         v_gagal := v_gagal + 1;
--         v_contoh := v_contoh || E'\n  ' || left(r.id::text, 8) || ': ' || SQLERRM;
--       END;
--     END LOOP;
--   END LOOP;
--   RAISE EXCEPTION 'SENTUH_SELESAI — % order, % gagal.%', v_n, v_gagal, v_contoh;
-- END
-- $sentuh$;
-- ROLLBACK;
--
-- 3e. Okupansi dua minggu ke depan berjalan. Harapan: 2 baris per hari,
--     Sabtu/Minggu `is_closed = true, closed_reason = weekend`.
--
-- SELECT * FROM get_kilat_wave_occupancy((now() AT TIME ZONE 'Asia/Jakarta')::date,
--                                        (now() AT TIME ZONE 'Asia/Jakarta')::date + 13);


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
-- Hari uji D = Senin pertama ≥ hari ini + 30 yang D dan D+1 kosong dari
-- jadwal Kilat. Order uji = order reguler lama tanpa jadwal lanjutan, yang
-- untuk sementara (di dalam transaksi ini saja) dijadikan Kilat.
--
-- Peran pemanggil disimulasikan lewat request.jwt.claims, persis cara
-- PostgREST mengirimnya: '' = dipercaya (SQL Editor/cron), peneliti, admin.
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
-- CREATE FUNCTION pg_temp.harus_ditolak(p_kasus text, p_sql text, p_pola text, p_hint text)
-- RETURNS void LANGUAGE plpgsql AS $f$
-- DECLARE v_err text; v_hint text;
-- BEGIN
--   BEGIN
--     EXECUTE p_sql;
--   EXCEPTION WHEN OTHERS THEN
--     GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
--     -- PG_EXCEPTION_HINT = '' (bukan NULL) bila tak ada HINT.
--     IF v_err NOT LIKE '%' || p_pola || '%' OR COALESCE(v_hint, '') <> COALESCE(p_hint, '') THEN
--       RAISE EXCEPTION 'UJI_GAGAL kasus %: ditolak karena hal lain: % (hint=%)', p_kasus, v_err, v_hint;
--     END IF;
--     RETURN;
--   END;
--   RAISE EXCEPTION 'UJI_GAGAL kasus %: lolos padahal harus ditolak', p_kasus;
-- END $f$;
--
-- -- Klaim gelombang oleh peneliti/admin: tanggal + jam + hold.
-- CREATE FUNCTION pg_temp.klaim(p_id uuid, p_hari date, p_jam int, p_akhir date, p_oleh text)
-- RETURNS text LANGUAGE sql AS $f$
--   SELECT format(
--     'UPDATE form_submissions SET start_date = %L, end_date = %L, kilat_slot_hour = %s,
--        slot_booked_by = %L, slot_reserved_at = now(), duration = 3
--      WHERE id = %L', p_hari, p_akhir, p_jam, p_oleh, p_id);
-- $f$;
--
-- DO $uji$
-- DECLARE
--   v_today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
--   d       date;
--   v_prev  date;
--   p       uuid[];
--   v_lama  uuid;
--   v_n     int;
--   r       record;
-- BEGIN
--   -- ── Setup ──
--   SELECT x::date INTO d
--   FROM generate_series(v_today + 30, v_today + 400, '1 day') AS x
--   WHERE extract(isodow FROM x) = 1
--     AND NOT EXISTS (
--       SELECT 1 FROM ad_schedules a
--       WHERE a.distribution_type = 'kilat'
--         AND (a.start_date AT TIME ZONE 'Asia/Jakarta')::date IN (x::date, x::date + 1))
--     AND NOT EXISTS (SELECT 1 FROM operational_holidays h
--                     WHERE h.holiday_date IN (x::date, x::date + 1))
--   ORDER BY x LIMIT 1;
--   IF d IS NULL THEN RAISE EXCEPTION 'UJI_GAGAL setup: tidak ada Senin kosong'; END IF;
--
--   SELECT x::date INTO v_prev
--   FROM generate_series(v_today - 1, v_today - 10, '-1 day') AS x
--   WHERE extract(isodow FROM x) <= 5
--   ORDER BY x DESC LIMIT 1;
--
--   SELECT array_agg(id ORDER BY created_at) INTO p FROM (
--     SELECT fs.id, fs.created_at FROM form_submissions fs
--     WHERE fs.distribution_type = 'regular'
--       AND fs.submission_status NOT IN ('rejected','spam','cancelled')
--       AND NOT EXISTS (SELECT 1 FROM ad_schedules a
--                       WHERE a.submission_id = fs.id
--                         AND a.source_table = 'form_submissions_extend')
--       AND (fs.end_date IS NULL OR fs.end_date < v_today - 250)
--     ORDER BY fs.created_at LIMIT 5) s;
--   IF cardinality(p) < 5 THEN RAISE EXCEPTION 'UJI_GAGAL setup: order uji kurang'; END IF;
--
--   -- Order Kilat lama macet (jam lama, lampau, dipesan admin, belum lunas).
--   SELECT fs.id INTO v_lama FROM form_submissions fs
--   WHERE fs.distribution_type = 'kilat' AND fs.slot_booked_by = 'admin'
--     AND fs.start_date < v_today AND fs.kilat_slot_hour IS NOT NULL
--   ORDER BY fs.start_date LIMIT 1;
--   IF v_lama IS NULL THEN RAISE EXCEPTION 'UJI_GAGAL setup: tidak ada order Kilat lama'; END IF;
--
--   -- p[1..4] jadi Kilat tanpa tanggal (dipercaya); p[5] tetap reguler.
--   PERFORM pg_temp.sebagai('');
--   UPDATE form_submissions
--      SET distribution_type = 'kilat', start_date = NULL, end_date = NULL,
--          kilat_slot_hour = NULL, slot_booked_by = NULL, slot_reserved_at = NULL,
--          submission_status = 'slot_reserved', payment_status = 'pending',
--          airing_hour_wib = NULL, airing_minute_wib = NULL
--    WHERE id = ANY (p[1:4]);
--
--   -- 1  Peneliti klaim D 15.00 → lolos; duration dipaksa 1.
--   PERFORM pg_temp.sebagai('peneliti');
--   PERFORM pg_temp.harus_lolos('1', pg_temp.klaim(p[1], d, 15, d + 1, 'user'));
--   IF (SELECT duration FROM form_submissions WHERE id = p[1]) <> 1 THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 1: duration tidak dipaksa 1';
--   END IF;
--
--   -- 2  Peneliti kedua di gelombang yang sama → lolos (2/2).
--   PERFORM pg_temp.harus_lolos('2', pg_temp.klaim(p[2], d, 15, d + 1, 'user'));
--
--   -- 3  Peneliti ketiga → penuh.
--   PERFORM pg_temp.harus_ditolak('3', pg_temp.klaim(p[3], d, 15, d + 1, 'user'),
--     'sudah penuh', 'kilat_wave_full');
--
--   -- 4  Admin pun tidak bisa melewati kuota.
--   PERFORM pg_temp.sebagai('admin');
--   PERFORM pg_temp.harus_ditolak('4', pg_temp.klaim(p[3], d, 15, d + 1, 'admin'),
--     'sudah penuh', 'kilat_wave_full');
--
--   -- 5  Admin boleh jam lama (riwayat) & di luar aturan peneliti → lolos.
--   PERFORM pg_temp.harus_lolos('5', pg_temp.klaim(p[3], d, 14, d + 1, 'admin'));
--
--   -- 6..9  Aturan klaim peneliti.
--   PERFORM pg_temp.sebagai('peneliti');
--   PERFORM pg_temp.harus_ditolak('6 jam 14', pg_temp.klaim(p[4], d, 14, d + 1, 'user'),
--     'hanya pukul 11.00 dan 15.00', 'kilat_wave_invalid');
--   PERFORM pg_temp.harus_ditolak('7 Sabtu', pg_temp.klaim(p[4], d + 5, 11, d + 6, 'user'),
--     'Senin–Jumat', 'kilat_wave_closed');
--   PERFORM pg_temp.harus_ditolak('8 dua hari', pg_temp.klaim(p[4], d, 11, d + 2, 'user'),
--     'tepat sehari', 'kilat_wave_invalid');
--   PERFORM pg_temp.harus_ditolak('9 atas nama admin', pg_temp.klaim(p[4], d, 11, d + 1, 'admin'),
--     'hanya bisa ditugaskan admin', 'kilat_wave_invalid');
--
--   -- 10  Libur aktif menutup; saklar dimatikan membuka lagi.
--   INSERT INTO operational_holidays (holiday_date, label, is_active) VALUES (d + 1, 'Uji', true);
--   PERFORM pg_temp.harus_ditolak('10a libur', pg_temp.klaim(p[4], d + 1, 11, d + 2, 'user'),
--     'libur operasional', 'kilat_wave_closed');
--   UPDATE operational_holidays SET is_active = false WHERE holiday_date = d + 1;
--   PERFORM pg_temp.harus_lolos('10b libur dimatikan', pg_temp.klaim(p[4], d + 1, 11, d + 2, 'user'));
--
--   -- 11  Gelombang yang sudah lewat batas H-2 jam → tutup.
--   PERFORM pg_temp.harus_ditolak('11 lewat cutoff', pg_temp.klaim(p[4], v_prev, 15, v_prev + 1, 'user'),
--     'sudah tutup', 'kilat_wave_closed');
--
--   -- 12  Peneliti mengubah jenis distribusi → ditolak (kedua arah).
--   PERFORM pg_temp.harus_ditolak('12a reguler→kilat',
--     format('UPDATE form_submissions SET distribution_type = ''kilat'' WHERE id = %L', p[5]),
--     'tidak bisa diubah', 'kilat_wave_invalid');
--   PERFORM pg_temp.harus_ditolak('12b kilat→reguler',
--     format('UPDATE form_submissions SET distribution_type = ''regular'' WHERE id = %L', p[1]),
--     'tidak bisa diubah', 'kilat_wave_invalid');
--
--   -- 13  Bukan klaim: catatan & status pada order Kilat lama macet → lolos.
--   PERFORM pg_temp.harus_lolos('13a catatan order lama',
--     format('UPDATE form_submissions SET admin_notes = admin_notes WHERE id = %L', v_lama));
--   PERFORM pg_temp.harus_lolos('13b status order lama',
--     format('UPDATE form_submissions SET submission_status = submission_status WHERE id = %L', v_lama));
--
--   -- 14  Bukan klaim: peneliti melepas jadwalnya sendiri → lolos.
--   PERFORM pg_temp.harus_lolos('14 lepas',
--     format('UPDATE form_submissions SET start_date = NULL, end_date = NULL,
--               slot_booked_by = NULL, slot_reserved_at = NULL WHERE id = %L', p[4]));
--
--   -- 15  Hold peneliti kedaluwarsa melepas kursi; sentuhan non-klaim atas
--   --     hold itu tetap lolos walau gelombangnya kini 3/2 (D3).
--   PERFORM pg_temp.sebagai('');
--   UPDATE form_submissions SET slot_reserved_at = now() - interval '2 hours' WHERE id = p[2];
--   PERFORM pg_temp.sebagai('peneliti');
--   PERFORM pg_temp.harus_lolos('15a kursi kedaluwarsa dipakai', pg_temp.klaim(p[4], d, 15, d + 1, 'user'));
--   PERFORM pg_temp.harus_lolos('15b sentuh hold kedaluwarsa',
--     format('UPDATE form_submissions SET admin_notes = admin_notes WHERE id = %L', p[2]));
--
--   -- 16  Cron pelepas meng-NULL-kan jam gelombang.
--   PERFORM pg_temp.sebagai('');
--   PERFORM public.release_expired_order_slots();
--   IF EXISTS (SELECT 1 FROM form_submissions
--              WHERE id = p[2] AND (start_date IS NOT NULL OR kilat_slot_hour IS NOT NULL)) THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 16: cron tidak melepas jam gelombang';
--   END IF;
--
--   -- 17  Okupansi: D 15.00 = p1 + p4 = 2; D+1 11.00 = 0 (p4 sudah pindah).
--   SELECT * INTO r FROM get_kilat_wave_occupancy(d, d + 1) WHERE wave_date = d AND wave_hour = 15;
--   IF r.used <> 2 OR r.capacity <> 2 OR r.is_closed THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 17a: okupansi D 15.00 = % / % (tutup %)', r.used, r.capacity, r.is_closed;
--   END IF;
--   SELECT count(*) INTO v_n FROM get_kilat_wave_occupancy(d, d + 6);
--   IF v_n <> 14 THEN RAISE EXCEPTION 'UJI_GAGAL kasus 17b: % baris, harap 14', v_n; END IF;
--   IF NOT (SELECT bool_and(is_closed AND closed_reason = 'weekend')
--           FROM get_kilat_wave_occupancy(d + 5, d + 6)) THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 17c: akhir pekan tidak tertutup';
--   END IF;
--   SELECT * INTO r FROM get_kilat_wave_occupancy(d, d, p[1]) WHERE wave_hour = 15;
--   IF r.used <> 1 THEN RAISE EXCEPTION 'UJI_GAGAL kasus 17d: pengecualian order sendiri gagal (%)', r.used; END IF;
--   PERFORM pg_temp.harus_ditolak('17e jendela 32 hari',
--     format('SELECT * FROM get_kilat_wave_occupancy(%L, %L)', d, d + 32),
--     'paling panjang 31 hari', 'kilat_occupancy_window_too_long');
--
--   -- 18  Irisan sadar gelombang: induk Kilat 11.00 [D 11, D+1 11) tidak
--   --     beririsan dengan [D+1 11, D+2 11), tapi beririsan dengan [D+1 10, …).
--   PERFORM pg_temp.sebagai('');
--   UPDATE form_submissions SET kilat_slot_hour = 11, slot_booked_by = 'admin' WHERE id = p[1];
--   PERFORM pg_temp.harus_lolos('18 tanpa irisan',
--     format('SELECT public.assert_schedule_window_free(%L, %L::timestamptz, %L::timestamptz, NULL, true)',
--       p[1], kilat_instant_of(d + 1, 11::smallint), kilat_instant_of(d + 2, 11::smallint)));
--   PERFORM pg_temp.harus_ditolak('18 irisan',
--     format('SELECT public.assert_schedule_window_free(%L, %L::timestamptz, %L::timestamptz, NULL, true)',
--       p[1], kilat_instant_of(d + 1, 10::smallint), kilat_instant_of(d + 2, 10::smallint)),
--     'beririsan', NULL);
--
--   -- 20  Trigger irisan membaca jam gelombang: perpanjangan Kilat lunas di
--   --     [D+2 11, D+3 11); order dipindah ke D+1 11.00 = bersentuhan, bukan
--   --     beririsan → lolos. Dengan 15.00 terpatok ia akan ditolak.
--   INSERT INTO ad_schedules (submission_id, ordinal, source_table, source_id,
--                             start_date, end_date, duration, status, review_status,
--                             payment_status, distribution_type, kilat_slot_hour, slot_booked_by)
--   VALUES (p[1], 901, 'form_submissions_extend', gen_random_uuid(),
--           kilat_instant_of(d + 2, 11::smallint), kilat_instant_of(d + 3, 11::smallint), 1,
--           'paid', 'approved', 'paid', 'kilat', 11, 'admin');
--   PERFORM pg_temp.harus_lolos('20 pindah bersentuhan',
--     format('UPDATE form_submissions SET start_date = %L, end_date = %L WHERE id = %L', d + 1, d + 2, p[1]));
--   PERFORM pg_temp.harus_ditolak('20b pindah beririsan',
--     format('UPDATE form_submissions SET start_date = %L, end_date = %L WHERE id = %L', d + 2, d + 3, p[1]),
--     'beririsan', NULL);
--
--   -- 19  Batas pesan = gelombang − 2 jam: 11.00 → 09.00, 15.00 → 13.00 WIB.
--   IF kilat_booking_closes_at(d, 11::smallint) <> (d + time '09:00') AT TIME ZONE 'Asia/Jakarta'
--      OR kilat_booking_closes_at(d, 15::smallint) <> (d + time '13:00') AT TIME ZONE 'Asia/Jakarta' THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 19: batas pesan bukan H-2 jam';
--   END IF;
--   SELECT * INTO r FROM get_kilat_wave_occupancy(d, d) WHERE wave_hour = 11;
--   IF r.booking_closes_at <> (d + time '09:00') AT TIME ZONE 'Asia/Jakarta' THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 19b: okupansi membawa batas pesan %', r.booking_closes_at;
--   END IF;
--
--   RAISE EXCEPTION 'UJI_LULUS — 20 kasus lolos (hari uji %). Exception ini disengaja: semua tulisan uji dibatalkan.', d;
-- END
-- $uji$;
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK MIGRASI — mengembalikan keadaan produksi 15 Okt 2026 PERSIS
-- (md5 di Langkah 1a). ⚠️ CHECK lama (8/11/14/17) hanya bisa dipasang ulang
-- bila belum ada order berjam 15; kalau ada, langkah itu gagal dan seluruh
-- rollback batal — pindahkan dulu order itu.
-- ============================================================================
--
-- BEGIN;
--
-- DROP TRIGGER IF EXISTS trg_ad_schedules_kilat_wave_quota ON public.ad_schedules;
-- DROP TRIGGER IF EXISTS trg_form_submissions_kilat_wave_claim ON public.form_submissions;
-- DROP FUNCTION IF EXISTS public.enforce_kilat_wave_quota();
-- DROP FUNCTION IF EXISTS public.validate_kilat_wave_claim();
-- DROP FUNCTION IF EXISTS public.get_kilat_wave_occupancy(date, date, uuid);
-- DROP FUNCTION IF EXISTS public.count_kilat_wave_holds(date, smallint, uuid, uuid);
-- DROP FUNCTION IF EXISTS public.ad_schedule_occupies_kilat_wave(ad_schedules);
-- DROP FUNCTION IF EXISTS public.max_kilat_per_wave();
-- DROP FUNCTION IF EXISTS public.kilat_booking_closes_at(date, smallint);
-- DROP FUNCTION IF EXISTS public.kilat_wave_hours();
-- DROP TABLE IF EXISTS public.operational_holidays;
--
-- ALTER TABLE public.form_submissions
--   DROP CONSTRAINT IF EXISTS form_submissions_kilat_slot_hour_check;
-- ALTER TABLE public.form_submissions
--   ADD CONSTRAINT form_submissions_kilat_slot_hour_check
--   CHECK (((kilat_slot_hour IS NULL) OR (kilat_slot_hour = ANY (ARRAY[8, 11, 14, 17]))));
--
-- DROP TRIGGER IF EXISTS trg_submission_no_overlap ON public.form_submissions;
-- CREATE TRIGGER trg_submission_no_overlap
--   BEFORE UPDATE OF start_date, end_date ON public.form_submissions
--   FOR EACH ROW EXECUTE FUNCTION assert_no_schedule_overlap();
--
-- CREATE OR REPLACE FUNCTION public.assert_no_schedule_overlap()
--  RETURNS trigger
--  LANGUAGE plpgsql
-- AS $function$
-- DECLARE
--   v_start TIMESTAMPTZ;
--   v_end   TIMESTAMPTZ;
-- BEGIN
--   v_start := airing_instant_of_date(NEW.start_date);
--   v_end   := airing_instant_of_date(NEW.end_date);
--
--   IF v_start IS NULL OR v_end IS NULL THEN
--     RETURN NEW;
--   END IF;
--
--   IF TG_OP = 'UPDATE' THEN
--     IF NEW.start_date IS NOT DISTINCT FROM OLD.start_date
--        AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date
--        AND NOT (
--          OLD.submission_status IN ('cancelled', 'rejected', 'spam')
--          AND NEW.submission_status NOT IN ('cancelled', 'rejected', 'spam')
--        )
--     THEN
--       RETURN NEW;
--     END IF;
--   END IF;
--
--   IF NEW.submission_status IN ('rejected', 'spam') THEN
--     RETURN NEW;
--   END IF;
--
--   PERFORM assert_schedule_window_free(NEW.id, v_start, v_end, NULL, false);
--   RETURN NEW;
-- END;
-- $function$
-- ;
--
-- CREATE OR REPLACE FUNCTION public.assert_schedule_window_free(p_submission_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_exclude_source_id uuid, p_check_parent boolean)
--  RETURNS void
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_conflict RECORD;
-- BEGIN
--   IF p_start IS NULL OR p_end IS NULL THEN RETURN; END IF;
--
--   IF p_check_parent THEN
--     SELECT airing_instant_of_date(fs.start_date) AS start_date,
--            airing_instant_of_date(fs.end_date)   AS end_date
--       INTO v_conflict
--     FROM form_submissions fs
--     WHERE fs.id = p_submission_id
--       AND fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
--       AND fs.submission_status NOT IN
--           ('rejected','spam','in_review','completed','cancelled','slot_cancelled')
--       AND NOT (
--         COALESCE(fs.slot_booked_by,'') = 'user'
--         AND COALESCE(fs.payment_status,'pending') NOT IN ('paid','completed')
--         AND fs.slot_reserved_at IS NOT NULL
--         AND fs.slot_reserved_at < NOW() - INTERVAL '1 hour'
--       )
--       AND p_start < airing_instant_of_date(fs.end_date)
--       AND airing_instant_of_date(fs.start_date) < p_end
--     LIMIT 1;
--     IF FOUND THEN
--       RAISE EXCEPTION 'Jadwal beririsan dengan jadwal pertama survei ini (% s/d %). Satu survei hanya bisa tayang di satu periode pada satu waktu.',
--         TO_CHAR(v_conflict.start_date,'DD Mon YYYY'), TO_CHAR(v_conflict.end_date,'DD Mon YYYY');
--     END IF;
--   END IF;
--
--   SELECT a.start_date, a.end_date INTO v_conflict
--   FROM ad_schedules a
--   WHERE a.submission_id = p_submission_id
--     AND a.source_table = 'form_submissions_extend'
--     AND (p_exclude_source_id IS NULL OR a.source_id <> p_exclude_source_id)
--     AND a.status IN ('waiting_payment','paid','scheduled','live')
--     AND a.start_date IS NOT NULL AND a.end_date IS NOT NULL
--     AND NOT (
--       COALESCE(a.slot_booked_by,'') = 'user'
--       AND COALESCE(a.payment_status,'pending') NOT IN ('paid','completed')
--       AND a.slot_reserved_at IS NOT NULL
--       AND a.slot_reserved_at < NOW() - INTERVAL '1 hour'
--     )
--     AND p_start < a.end_date AND a.start_date < p_end
--   LIMIT 1;
--   IF FOUND THEN
--     RAISE EXCEPTION 'Jadwal beririsan dengan jadwal lain survei ini (% s/d %). Satu survei hanya bisa tayang di satu periode pada satu waktu.',
--       TO_CHAR(v_conflict.start_date,'DD Mon YYYY'), TO_CHAR(v_conflict.end_date,'DD Mon YYYY');
--   END IF;
-- END;
-- $function$
-- ;
--
-- CREATE OR REPLACE FUNCTION public.release_expired_order_slots()
--  RETURNS TABLE(lepas_submission_id uuid, tindakan text)
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_ids uuid[];
-- BEGIN
--   WITH lepas AS (
--     UPDATE form_submissions fs
--        SET start_date        = NULL,
--            end_date          = NULL,
--            slot_booked_by    = NULL,
--            slot_reserved_at  = NULL,
--            submission_status = 'slot_reserved',
--            payment_status    = 'expired',
--            updated_at        = NOW()
--      WHERE fs.slot_booked_by = 'user'
--        AND fs.slot_reserved_at IS NOT NULL
--        AND fs.slot_reserved_at < NOW() - interval '60 minutes'
--        AND fs.start_date IS NOT NULL
--        -- Penjaga lunas BERLAPIS, semuanya di dalam WHERE yang sama.
--        AND COALESCE(fs.payment_status,'') NOT IN ('paid','completed','expired')
--        AND NOT EXISTS (SELECT 1 FROM transactions t
--                         WHERE t.form_submission_id = fs.id
--                           AND t.status IN ('paid','completed','settled'))
--        AND NOT EXISTS (SELECT 1 FROM invoices i
--                         WHERE i.form_submission_id = fs.id
--                           AND i.status IN ('paid','completed','settled'))
--     RETURNING fs.id
--   )
--   SELECT array_agg(id) INTO v_ids FROM lepas;
--
--   IF v_ids IS NULL THEN RETURN; END IF;
--
--   -- Tagihan yang masih pending ikut mati. Hanya `pending` — status lain
--   -- (paid/expired/cancelled) sudah punya artinya sendiri.
--   UPDATE transactions SET status = 'expired', updated_at = NOW()
--    WHERE form_submission_id = ANY(v_ids) AND status = 'pending';
--
--   -- ⚠️ `invoices` TIDAK punya `updated_at` (diverifikasi information_schema
--   -- 18 Sep) — menyebutnya di sini akan lolos CREATE lalu meledak saat cron
--   -- BERJALAN. Persis jebakan sql/93 kemarin.
--   UPDATE invoices SET status = 'expired'
--    WHERE form_submission_id = ANY(v_ids) AND status = 'pending';
--
--   /*
--     sql/99: halaman iklan TIDAK LAGI dikosongkan di sini.
--
--     Dulu: `UPDATE survey_pages SET publish_start_date = NULL,
--     publish_end_date = NULL`. Tanggal NULL = "tayang selamanya" di feed, dan
--     tulisan itu jalan SESUDAH UPDATE form_submissions di atas — jadi ia
--     menimpa penutupan jendela dari trg_form_submissions_close_page. Order
--     08ef25ac bocor 11 responden lewat jalur kembarannya (cancelSchedule).
--     Penutupan sekarang milik trigger itu seorang.
--   */
--
--   RETURN QUERY SELECT unnest(v_ids), 'slot_dilepas'::text;
-- END;
-- $function$
-- ;
--
-- COMMIT;
