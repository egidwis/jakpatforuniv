-- ============================================================================
-- sql/119 — EXTEND KILAT: PESAN GELOMBANG LAGI (Phase 5 §5.10, rilis R8)
-- ============================================================================
--
-- Rencana: docs/superpowers/plans/2026-10-14-phase-5-kilat-swalayan.md §5.10.
-- Sejak strategi rilis 16 Okt, R8 ikut Push A (pintu tertutup): berkas ini
-- membuka JALAN SERVER-nya, tapi pintu peneliti ke Kilat baru terbuka di
-- Push B. Selama itu hanya order Kilat yang SUDAH ada (semuanya buatan
-- admin) yang bisa memakai "Pesan gelombang lagi".
--
-- ── PERILAKU SESUDAH BERKAS INI ─────────────────────────────────────────────
--
--   E1  create_ad_schedule (signature TIDAK berubah — CREATE OR REPLACE, ACL
--       ikut, tanpa DROP/overload):
--         • penolakan "order Kilat belum bisa dijadwalkan sendiri" DICABUT;
--         • untuk order Kilat, SEMUA pemanggil: jam gelombang DITURUNKAN dari
--           jam WIB p_start_date dan wajib ∈ kilat_wave_hours() = {11, 15}
--           tepat di jamnya (HINT kilat_wave_invalid); end_date DIPAKSA
--           start + 24 jam, duration DIPAKSA 1, kilat_slot_hour DITULIS
--           (dulu selalu NULL — juga untuk admin);
--         • cutoff 13.00 WIB tidak berlaku untuk Kilat (batasnya gelombang −
--           2 jam, ditegakkan E2);
--         • Iklan: tidak ada satu nilai pun yang berubah.
--   E2  Trigger BARU validate_kilat_extend_claim (BEFORE INSERT OR UPDATE di
--       baris perpanjangan), HANYA untuk pemanggil peneliti — padanan K4
--       sql/117 untuk kaki ad_schedules. Perlu karena peneliti punya DUA
--       policy UPDATE di tabel ini ("melepas reservasinya sendiri", "memesan
--       ulang jadwal yang sudah dilepas") dan hak UPDATE penuh atas kolomnya:
--       aturan yang hanya ada di RPC bisa dilangkahi dengan PATCH langsung.
--       Klaim = INSERT, gelombang berpindah, atau hold diisi ulang. Syarat:
--         • bukan atas nama admin; jam ∈ {11, 15};
--         • start = kilat_instant_of(tanggal WIB, jam), end = start + 24 jam;
--         • Senin–Jumat, bukan libur aktif, now() ≤ gelombang − 2 jam;
--         • duration DIPAKSA 1.
--       Ditambah: peneliti tidak boleh mengubah distribution_type baris
--       perpanjangan APA PUN (Iklan ⇄ Kilat = pindah kolam kuota).
--       Kalimat galat sama dengan K4, jadi peta galat frontend berlaku.
--   E3  cron_activate_extends (jobid 1, */15) langkah 2 memakai rumus jendela
--       undian sql/118 (airing_window_start/end). Dulu tick-nya menulis
--       publish_start/end_date = start/end jadwal: untuk gelombang perpanjangan
--       Kilat itu MENIMPA jangkar toggle siaran dan membuka lagi halaman yang
--       sudah dimatikan admin. Iklan tak pernah punya kolom siaran → nilai
--       yang ditulis identik.
--
-- Sudah benar tanpa perubahan (dicek 16 Okt, definisi live):
--   • kuota gelombang (trg_ad_schedules_kilat_wave_quota, sql/117) menghitung
--     kedua kaki; kuota harian mengecualikan Kilat;
--   • assert_schedule_window_free membaca induk Kilat di jam gelombangnya →
--     jarak minimal 24 jam antargelombang tanpa kode tambahan;
--   • guard_broadcast_columns mereset siaran saat tanggal pindah, kedua kaki;
--   • kilat_broadcast_start/end bekerja per ad_schedules.id → gelombang
--     perpanjangan langsung bisa disiarkan;
--   • period_batch & is_new_period: trigger + create-payment.js, sama Iklan.
--
-- Nol baris perpanjangan Kilat di produksi (16 Okt) — tidak ada data lama
-- yang berubah makna.
--
-- ⚠️ Di luar cakupan, dicatat saja: cron_activate_extends punya anon=X di
--    proacl (warisan, sebelum seri keamanan). CREATE OR REPLACE tidak
--    mengubahnya; pencabutannya milik seri keamanan.
--
-- ── URUTAN ──────────────────────────────────────────────────────────────────
--
--   Langkah 1 (pra-cek) → Langkah 2 (migrasi) → Langkah 3 (verifikasi) →
--   Langkah 4 (uji perilaku, selalu dibatalkan) → baru Push A.
--   Jalankan di SQL Editor Supabase. JANGAN lewat MCP.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — PRA-CEK (baca saja)
-- ============================================================================
--
-- 1a. Badan fungsi yang hidup harus SAMA dengan salinan di blok ROLLBACK
--     (diambil 16 Okt 2026). Harapan: dua baris `sama = true`.
--     Ada `false` = berhenti, laporkan dulu.
--
-- SELECT p.proname,
--        md5(pg_get_functiondef(p.oid)) = CASE p.proname
--          WHEN 'create_ad_schedule'    THEN '4db229534d8952864dd353590f5f1d46'
--          WHEN 'cron_activate_extends' THEN 'b598a99c9a92633ed6485feeb80aa264'
--        END AS sama
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('create_ad_schedule', 'cron_activate_extends')
-- ORDER BY 1;
--
-- 1b. Satu overload saja. Harapan: 1 baris.
--
-- SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'create_ad_schedule';
--
-- 1c. Baris perpanjangan Kilat yang sudah ada. Harapan: 0.
--
-- SELECT count(*) FROM ad_schedules
-- WHERE distribution_type = 'kilat' AND source_table = 'form_submissions_extend';
--
-- 1d. Nama baru belum dipakai, dan sql/117 + sql/118 sudah hidup.
--     Harapan: `baru` = 0, `prasyarat` = 4.
--
-- SELECT
--   (SELECT count(*) FROM pg_proc WHERE proname = 'validate_kilat_extend_claim') AS baru,
--   (SELECT count(*) FROM pg_proc WHERE proname IN ('kilat_wave_hours', 'kilat_booking_closes_at',
--                                                   'airing_window_start', 'airing_window_end')) AS prasyarat;


-- ============================================================================
-- LANGKAH 2 — MIGRASI (satu transaksi)
-- ============================================================================

BEGIN;

-- ── 2.1 (E1) create_ad_schedule ────────────────────────────────────────────
-- Badan = produksi 16 Okt (md5 4db22953…) + tambalan bertanda "sql/119".
CREATE OR REPLACE FUNCTION public.create_ad_schedule(p_submission_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_duration integer, p_prize_per_winner integer DEFAULT 0, p_winner_count integer DEFAULT 0, p_additional_prize_per_winner integer DEFAULT 0, p_is_new_period boolean DEFAULT false, p_status text DEFAULT 'waiting_payment'::text, p_payment_status text DEFAULT 'pending'::text, p_total_cost integer DEFAULT 0, p_slot_booked_by text DEFAULT 'admin'::text, p_is_extra_ad boolean DEFAULT NULL::boolean, p_admin_notes text DEFAULT NULL::text, p_voucher_code text DEFAULT NULL::text, p_slot_reserved_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id                UUID := gen_random_uuid();
  v_distribution_type TEXT;
  v_review_status     TEXT;
  v_submission_status TEXT;
  v_is_extra          BOOLEAN;
  v_is_admin          BOOLEAN;
  v_owns              BOOLEAN;
  v_booked_by         TEXT;
  v_reserved_at       TIMESTAMPTZ;
  v_total_cost        INTEGER;
  v_start_ymd         DATE;
  v_now_wib           TIMESTAMP;
  -- sql/119 (Phase 5 R8): gelombang perpanjangan Kilat.
  v_kilat_hour        SMALLINT;
  v_wave_wib          TIMESTAMP;
  v_end               TIMESTAMPTZ := p_end_date;
  v_duration          INTEGER     := p_duration;
  claims              JSONB;
BEGIN
  -- ── Gerbang wewenang ────────────────────────────────────────────────────
  -- claims NULL = koneksi tanpa JWT (pg_cron, psql pemilik, migrasi). Pintu
  -- resmi yang sama seperti guard_payment_columns() sql/33.
  claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;

  v_is_admin := claims IS NULL
                OR COALESCE(claims ->> 'role', '')  = 'service_role'
                OR COALESCE(claims ->> 'email', '') = 'product@jakpat.net';

  SELECT fs.distribution_type,
         review_status_of(fs.submission_status),
         fs.submission_status,
         -- Kepemilikan menyalin policy SELECT `ad_schedules` PERSIS: sebagian
         -- order lama tidak punya auth_user_id dan hanya bisa dikenali lewat
         -- email. 303 baris, 87 di antaranya lunas (2026-09-11).
         (fs.auth_user_id = auth.uid()
          OR (fs.auth_user_id IS NULL
              AND fs.email = COALESCE(claims ->> 'email', '')))
    INTO v_distribution_type, v_review_status, v_submission_status, v_owns
  FROM form_submissions fs WHERE fs.id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_ad_schedule: order % tidak ditemukan', p_submission_id;
  END IF;

  IF NOT v_is_admin AND NOT COALESCE(v_owns, false) THEN
    RAISE EXCEPTION 'create_ad_schedule: hanya admin atau pemilik order yang boleh membuat jadwal';
  END IF;

  -- ── sql/119: bentuk gelombang Kilat, untuk SEMUA pemanggil ──────────────
  -- Satu pemesanan = satu gelombang (keputusan 7 & 14 Okt). Jam gelombang
  -- DITURUNKAN dari jam WIB p_start_date — signature tidak berubah, jadi
  -- tidak ada DROP/CREATE, hibah ulang, atau overload ganda. Akhir dan durasi
  -- DIPAKSA, apa pun yang dikirim pemanggil: jendela 24 jam inilah yang
  -- membuat assert_schedule_window_free menegakkan "jarak minimal 24 jam".
  -- Aturan waktu peneliti (hari kerja, libur, H-2 jam) ditegakkan trigger
  -- validate_kilat_extend_claim, supaya UPDATE langsung ke baris ini tunduk
  -- pada aturan yang sama dengan INSERT dari sini.
  IF v_distribution_type = 'kilat' AND p_start_date IS NOT NULL THEN
    v_wave_wib   := p_start_date AT TIME ZONE 'Asia/Jakarta';
    v_kilat_hour := EXTRACT(HOUR FROM v_wave_wib)::smallint;
    IF date_trunc('hour', v_wave_wib) <> v_wave_wib
       OR NOT (v_kilat_hour = ANY (kilat_wave_hours())) THEN
      RAISE EXCEPTION 'create_ad_schedule: jam gelombang Kilat harus 11.00 atau 15.00 WIB tepat'
        USING HINT = 'kilat_wave_invalid';
    END IF;
    v_end      := p_start_date + interval '24 hours';
    v_duration := 1;
  END IF;

  -- ── Aturan yang HANYA berlaku untuk peneliti ────────────────────────────
  -- Jalur admin sengaja melewati semuanya: ia sudah punya kelonggaran cutoff
  -- (commit 920b3cb) dan memang berwenang menjadwalkan Kilat & iklan tambahan.
  IF NOT v_is_admin THEN
    -- 1. (sql/119) Kilat KINI swalayan: "Pesan gelombang lagi" (Phase 5
    --    §5.10). Penolakan lamanya dicabut; aturan gelombangnya di atas dan
    --    di trigger validate_kilat_extend_claim.

    -- 2. Order yang belum lolos review tidak boleh menambah jadwal.
    IF v_review_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'create_ad_schedule: order ini belum disetujui, jadwal baru belum bisa dibuat';
    END IF;

    -- 2b. BARU (sql/88) — order yang sudah tidak aktif di sumbu TAYANG.
    --
    --     Dibaca dari `submission_status` MENTAH, bukan lewat
    --     `review_status_of()`: fungsi itu menjawab pertanyaan lain, dan
    --     jawabannya untuk `slot_cancelled` memang 'approved' (sql/62 §2).
    --     Penjaga no. 2 di atas tetap tinggal — ia masih tugas yang benar
    --     untuk menolak `in_review`; yang ini menangani nilai-nilai yang
    --     memang bukan urusan sumbu review.
    --
    --     Kalimatnya dibaca PENELITI apa adanya: ScheduleAgainDialog
    --     meneruskan `e?.message` langsung ke toast, jadi ia tidak boleh
    --     berbunyi seperti jargon kolom.
    IF v_submission_status IN ('slot_cancelled','cancelled','rejected','spam') THEN
      RAISE EXCEPTION 'create_ad_schedule: order ini tidak aktif, jadwal baru tidak bisa dibuat';
    END IF;

    -- 3. Cutoff pemesanan 13.00 WIB — salinan KETIGA, diminta eksplisit oleh
    --    catatan di src/utils/payment.ts. Tanpa ini peneliti bisa memesan
    --    13.30 untuk tayang hari itu, lalu tagihannya ditolak terbit oleh
    --    cabang `null` invoiceLifetimeMinutes() yang dirancang sebagai
    --    gerbang ADMIN. Lihat BOOKING_CUTOFF_HOUR_WIB di airing-window.ts.
    v_now_wib   := NOW() AT TIME ZONE 'Asia/Jakarta';
    v_start_ymd := (p_start_date AT TIME ZONE 'Asia/Jakarta')::date;

    -- sql/119: Kilat TIDAK memakai cutoff 13.00 — batas pesannya gelombang
    -- − 2 jam (kilat_booking_closes_at), ditegakkan trigger.
    IF v_distribution_type IS DISTINCT FROM 'kilat'
       AND (v_start_ymd < v_now_wib::date
            OR (v_start_ymd = v_now_wib::date AND EXTRACT(HOUR FROM v_now_wib) >= 13))
    THEN
      RAISE EXCEPTION
        'create_ad_schedule: pemesanan untuk % sudah ditutup (batas 13.00 WIB)',
        TO_CHAR(v_start_ymd, 'DD Mon YYYY');
    END IF;

    -- 4. Batch baru WAJIB berhadiah. Aturan ini hari ini hidup HANYA di
    --    TypeScript (ScheduleForm.tsx:551) — jalur peneliti tidak lewat sana.
    IF COALESCE(p_is_new_period, false)
       AND (COALESCE(p_prize_per_winner, 0) <= 0 OR COALESCE(p_winner_count, 0) <= 0)
    THEN
      RAISE EXCEPTION 'create_ad_schedule: jadwal ini membuka batch hadiah baru — hadiah dan jumlah pemenang wajib diisi';
    END IF;
  END IF;

  -- ── Nilai yang DIPAKSA untuk peneliti ───────────────────────────────────
  -- Tidak boleh datang dari browser, apa pun yang dikirim pemanggil.
  IF v_is_admin THEN
    v_booked_by   := p_slot_booked_by;
    v_reserved_at := p_slot_reserved_at;
    v_total_cost  := COALESCE(p_total_cost, 0);
    v_is_extra    := p_is_extra_ad;
  ELSE
    v_booked_by   := 'user';        -- satu-satunya nilai yang bisa lepas sendiri
    v_reserved_at := NOW();         -- hold 1 jam mulai berdetak SEKARANG
    v_total_cost  := 0;             -- harga lahir di create-payment.js, bukan di sini
    v_is_extra    := false;         -- kolam iklan tambahan milik admin
  END IF;

  -- Tidak disebut = MEWARISI ordinal 1, bukan false. Lihat catatan no. 2 di
  -- header sql/74. Untuk peneliti nilainya sudah dipaksa false di atas.
  IF v_is_extra IS NULL THEN
    SELECT a.is_extra_ad INTO v_is_extra
    FROM ad_schedules a
    WHERE a.submission_id = p_submission_id
      AND a.source_table = 'form_submissions';
  END IF;

  IF COALESCE(p_status, 'waiting_payment') <> 'cancelled' THEN
    PERFORM assert_schedule_window_free(p_submission_id, p_start_date, v_end, v_id, true);

    -- BARU (sql/86): kapasitas HARI, bukan cuma tumpang tindih survei ini
    -- sendiri. Dipanggil untuk SEMUA pemanggil — TOCTOU tidak peduli siapa
    -- yang mengklik, dan admin pun bisa menjual hari yang sudah penuh.
    PERFORM assert_daily_ad_quota_free(
      p_start_date, v_end, COALESCE(v_is_extra, false), v_distribution_type, NULL);
  END IF;

  INSERT INTO ad_schedules (
    submission_id, ordinal, source_table, source_id,
    start_date, end_date, duration,
    status, review_status, payment_status,
    prize_per_winner, winner_count, additional_prize_per_winner,
    is_new_period, period_batch,
    total_cost, subtotal, ppn_amount, voucher_code,
    slot_booked_by, slot_reserved_at, admin_notes,
    distribution_type, kilat_slot_hour,
    is_extra_ad,
    created_at, updated_at
  ) VALUES (
    p_submission_id, 2, 'form_submissions_extend', v_id,
    p_start_date, v_end, v_duration,
    COALESCE(p_status, 'waiting_payment'), v_review_status, p_payment_status,
    COALESCE(p_prize_per_winner, 0), COALESCE(p_winner_count, 0),
    COALESCE(p_additional_prize_per_winner, 0),
    COALESCE(p_is_new_period, false), NULL,   -- period_batch dihitung trg_ad_schedules_period_batch
    v_total_cost, NULL, NULL, p_voucher_code,
    v_booked_by, v_reserved_at, p_admin_notes,
    v_distribution_type, v_kilat_hour,
    COALESCE(v_is_extra, false),
    NOW(), NOW()
  );

  PERFORM resync_ad_schedule_ordinals(p_submission_id);

  -- Mengembalikan `source_id`, BUKAN `ad_schedules.id` — itulah nilai yang
  -- dulu dibaca pemanggil sebagai `form_submissions_extend.id`, dan yang
  -- dipakai `invoices.extend_id` / `transactions.extend_id`.
  --
  -- ⚠️ PEMANGGIL YANG MENYUSUN LINK `/bayar/<id>` BUTUH `ad_schedules.id`,
  -- BUKAN nilai ini. Resolver dan schedule_billing() dikunci ke yang pertama;
  -- memakai yang salah TIDAK error, ia cuma tidak menemukan tagihan apa pun.
  -- Lihat Langkah 5 rencana Phase 4.
  RETURN v_id;
END;
$function$;

-- ── 2.2 (E2) Penjaga klaim baris perpanjangan Kilat ────────────────────────
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

  SELECT h.label INTO v_label
  FROM operational_holidays h
  WHERE h.holiday_date = v_ymd AND h.is_active;
  IF FOUND THEN
    RAISE EXCEPTION 'Tanggal % libur operasional%. Pilih tanggal lain.',
      to_char(v_ymd, 'DD-MM-YYYY'),
      CASE WHEN COALESCE(v_label, '') <> '' THEN ' (' || v_label || ')' ELSE '' END
      USING HINT = 'kilat_wave_closed';
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

DROP TRIGGER IF EXISTS trg_ad_schedules_kilat_extend_claim ON public.ad_schedules;
CREATE TRIGGER trg_ad_schedules_kilat_extend_claim
  BEFORE INSERT OR UPDATE ON public.ad_schedules
  FOR EACH ROW
  WHEN (NEW.source_table = 'form_submissions_extend')
  EXECUTE FUNCTION public.validate_kilat_extend_claim();

-- pg_default_acl memberi anon DAN authenticated EXECUTE atas fungsi baru.
REVOKE ALL ON FUNCTION public.validate_kilat_extend_claim() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_kilat_extend_claim() TO service_role;

-- ── 2.3 (E3) cron_activate_extends ─────────────────────────────────────────
-- Badan = produksi 16 Okt (md5 b598a99c…) + satu tambalan langkah 2.
CREATE OR REPLACE FUNCTION public.cron_activate_extends()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
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
    AND a.status = 'scheduled'
    AND (a.payment_status = 'paid' OR a.air_on_credit_at IS NOT NULL)
    AND a.start_date <= NOW()
    AND a.end_date > NOW();

  -- 2. Arahkan halaman survei ke jadwal yang sedang tayang.
  UPDATE survey_pages sp
  -- sql/119: jendela dari SATU rumus undian (sql/118). Iklan tidak pernah
  -- punya kolom siaran → nilainya sama persis dengan dulu. Gelombang
  -- perpanjangan Kilat: tick 15 menit ini dulu menimpa jangkar toggle
  -- siaran dan MEMBUKA LAGI halaman yang sudah dimatikan admin.
  SET publish_start_date  = airing_window_start(a.start_date, a.broadcast_at),
      publish_end_date    = airing_window_end(a.start_date, a.end_date,
                                              a.broadcast_at, a.broadcast_ended_at),
      current_period_batch = a.period_batch
  FROM ad_schedules a
  WHERE a.source_table = 'form_submissions_extend'
    AND a.submission_id = sp.submission_id
    AND a.status = 'live'
    AND a.start_date <= NOW()
    AND a.end_date > NOW();

  -- 3. Tutup jadwal yang jendelanya sudah lewat.
  UPDATE ad_schedules a
  SET status = 'completed',
      review_status = COALESCE(review_status_of(fs.submission_status), a.review_status),
      updated_at = NOW()
  FROM form_submissions fs
  WHERE fs.id = a.submission_id
    AND a.source_table = 'form_submissions_extend'
    AND a.status = 'live'
    AND a.end_date <= NOW();
END;
$function$;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. ACL. Harapan: create_ad_schedule TETAP postgres + authenticated +
--     service_role (tanpa anon); validate_kilat_extend_claim = postgres +
--     service_role; cron_activate_extends tidak berubah dari sebelum migrasi.
--
-- SELECT p.oid::regprocedure, array_to_string(p.proacl, ' | ') AS acl
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('create_ad_schedule', 'validate_kilat_extend_claim', 'cron_activate_extends')
-- ORDER BY 1;
--
-- 3b. Trigger terpasang. Harapan: 1 baris, BEFORE INSERT OR UPDATE, WHEN extend.
--
-- SELECT pg_get_triggerdef(oid) FROM pg_trigger
-- WHERE tgname = 'trg_ad_schedules_kilat_extend_claim';
--
-- 3c. BLOK SENTUH — setiap baris perpanjangan disentuh tanpa mengubah apa
--     pun, sebagai peneliti lalu admin. Harapan: "SENTUH_SELESAI — N baris, 0 gagal".
--
-- BEGIN;
-- SET LOCAL ROLE postgres;
-- DO $sentuh$
-- DECLARE r record; v_n int := 0; v_gagal int := 0; v_contoh text := ''; v_siapa text;
-- BEGIN
--   FOR r IN SELECT id FROM ad_schedules WHERE source_table = 'form_submissions_extend' LOOP
--     v_n := v_n + 1;
--     FOREACH v_siapa IN ARRAY ARRAY[
--       '{"role":"authenticated","email":"uji-peneliti@example.com"}',
--       '{"role":"authenticated","email":"product@jakpat.net"}'] LOOP
--       BEGIN
--         PERFORM set_config('request.jwt.claims', v_siapa, true);
--         UPDATE ad_schedules SET admin_notes = admin_notes WHERE id = r.id;
--       EXCEPTION WHEN OTHERS THEN
--         v_gagal := v_gagal + 1;
--         v_contoh := v_contoh || E'\n  ' || left(r.id::text, 8) || ': ' || SQLERRM;
--       END;
--     END LOOP;
--   END LOOP;
--   RAISE EXCEPTION 'SENTUH_SELESAI — % baris, % gagal.%', v_n, v_gagal, v_contoh;
-- END
-- $sentuh$;
-- ROLLBACK;


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
-- Order uji = 5 order reguler lama berhalaman tanpa jadwal lanjutan, yang
-- untuk sementara (di dalam transaksi ini saja) dijadikan milik peneliti uji;
-- 4 di antaranya dijadikan Kilat.
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
--     IF v_err NOT LIKE '%' || p_pola || '%' OR COALESCE(v_hint, '') <> COALESCE(p_hint, '') THEN
--       RAISE EXCEPTION 'UJI_GAGAL kasus %: ditolak karena hal lain: % (hint=%)', p_kasus, v_err, v_hint;
--     END IF;
--     RETURN;
--   END;
--   RAISE EXCEPTION 'UJI_GAGAL kasus %: lolos padahal harus ditolak', p_kasus;
-- END $f$;
--
-- -- Pesan gelombang lagi lewat RPC, persis panggilan JadwalBaruPage.
-- -- p_end & p_duration sengaja ngawur: RPC wajib memaksa +24 jam & 1 untuk Kilat.
-- CREATE FUNCTION pg_temp.pesan(p_id uuid, p_mulai timestamptz) RETURNS text
-- LANGUAGE sql AS $f$
--   SELECT format(
--     'SELECT public.create_ad_schedule(p_submission_id => %L, p_start_date => %L::timestamptz,
--        p_end_date => %L::timestamptz, p_duration => 5, p_is_new_period => false,
--        p_slot_booked_by => ''user'')',
--     p_id, p_mulai, p_mulai + interval '5 days');
-- $f$;
--
-- DO $uji$
-- DECLARE
--   v_today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
--   d       date;
--   v_prev  date;
--   p       uuid[];
--   r       record;
--   v_ext   uuid;
--   v_t0    timestamptz := date_trunc('hour', now()) - interval '2 hours';
-- BEGIN
--   -- ── Setup ──
--   -- D = Senin pertama ≥ hari ini + 30 yang D..D+3 kosong dari jadwal Kilat & libur.
--   SELECT x::date INTO d
--   FROM generate_series(v_today + 30, v_today + 400, '1 day') AS x
--   WHERE extract(isodow FROM x) = 1
--     AND NOT EXISTS (
--       SELECT 1 FROM ad_schedules a
--       WHERE a.distribution_type = 'kilat'
--         AND (a.start_date AT TIME ZONE 'Asia/Jakarta')::date BETWEEN x::date AND x::date + 3)
--     AND NOT EXISTS (SELECT 1 FROM operational_holidays h
--                     WHERE h.holiday_date BETWEEN x::date AND x::date + 3)
--   ORDER BY x LIMIT 1;
--   IF d IS NULL THEN RAISE EXCEPTION 'UJI_GAGAL setup: tidak ada Senin kosong'; END IF;
--
--   SELECT x::date INTO v_prev
--   FROM generate_series(v_today - 1, v_today - 10, '-1 day') AS x
--   WHERE extract(isodow FROM x) <= 5
--   ORDER BY x DESC LIMIT 1;
--
--   -- 5 order reguler lama berhalaman, tanpa jadwal lanjutan, jendela sudah lama lewat.
--   SELECT array_agg(id ORDER BY created_at) INTO p FROM (
--     SELECT fs.id, fs.created_at FROM form_submissions fs
--     WHERE fs.distribution_type = 'regular'
--       AND fs.submission_status NOT IN ('rejected','spam','cancelled','slot_cancelled','in_review')
--       AND fs.start_date IS NOT NULL AND fs.end_date < v_today - 250
--       AND NOT EXISTS (SELECT 1 FROM ad_schedules a
--                       WHERE a.submission_id = fs.id
--                         AND a.source_table = 'form_submissions_extend')
--       AND EXISTS (SELECT 1 FROM survey_pages sp WHERE sp.submission_id = fs.id)
--     ORDER BY fs.created_at LIMIT 5) s;
--   IF cardinality(p) < 5 THEN RAISE EXCEPTION 'UJI_GAGAL setup: order uji kurang'; END IF;
--
--   -- Semua jadi milik peneliti uji (dikenali lewat email, auth_user_id NULL)
--   -- dan disetujui; p[1..4] jadi Kilat. Tanggal lama dibiarkan: jendela induk
--   -- jauh di masa lalu, jadi tidak beririsan dengan D.
--   PERFORM pg_temp.sebagai('');
--   UPDATE form_submissions
--      SET auth_user_id = NULL, email = 'uji-peneliti@example.com',
--          submission_status = 'completed', payment_status = 'paid',
--          airing_hour_wib = NULL, airing_minute_wib = NULL
--    WHERE id = ANY (p);
--   UPDATE form_submissions SET distribution_type = 'kilat', kilat_slot_hour = 15
--    WHERE id = ANY (p[1:4]);
--
--   -- 1  Peneliti pesan gelombang lagi D 15.00 → lolos; bentuk dipaksa.
--   PERFORM pg_temp.sebagai('peneliti');
--   PERFORM pg_temp.harus_lolos('1', pg_temp.pesan(p[1], kilat_instant_of(d, 15::smallint)));
--   SELECT * INTO r FROM ad_schedules
--    WHERE submission_id = p[1] AND source_table = 'form_submissions_extend';
--   IF r.kilat_slot_hour IS DISTINCT FROM 15 OR r.duration <> 1
--      OR r.end_date <> r.start_date + interval '24 hours'
--      OR r.slot_booked_by <> 'user' OR r.total_cost <> 0 OR r.distribution_type <> 'kilat' THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 1: bentuk baris salah (jam %, durasi %, akhir %, oleh %)',
--       r.kilat_slot_hour, r.duration, r.end_date, r.slot_booked_by;
--   END IF;
--
--   -- 2  Order kedua di gelombang yang sama → lolos (2/2); ketiga → penuh.
--   PERFORM pg_temp.harus_lolos('2', pg_temp.pesan(p[2], kilat_instant_of(d, 15::smallint)));
--   PERFORM pg_temp.harus_ditolak('3 penuh', pg_temp.pesan(p[3], kilat_instant_of(d, 15::smallint)),
--     'sudah penuh', 'kilat_wave_full');
--
--   -- 4  Jam di luar gelombang → ditolak RPC, untuk peneliti DAN admin.
--   PERFORM pg_temp.harus_ditolak('4a jam 14', pg_temp.pesan(p[3], kilat_instant_of(d, 14::smallint)),
--     '11.00 atau 15.00 WIB tepat', 'kilat_wave_invalid');
--   PERFORM pg_temp.harus_ditolak('4b 15.30', pg_temp.pesan(p[3], kilat_instant_of(d, 15::smallint) + interval '30 minutes'),
--     '11.00 atau 15.00 WIB tepat', 'kilat_wave_invalid');
--   PERFORM pg_temp.sebagai('admin');
--   PERFORM pg_temp.harus_ditolak('4c admin jam 8', pg_temp.pesan(p[3], kilat_instant_of(d, 8::smallint)),
--     '11.00 atau 15.00 WIB tepat', 'kilat_wave_invalid');
--
--   -- 5..7  Aturan waktu peneliti (trigger validate_kilat_extend_claim).
--   PERFORM pg_temp.sebagai('peneliti');
--   PERFORM pg_temp.harus_ditolak('5 Sabtu', pg_temp.pesan(p[3], kilat_instant_of(d + 5, 11::smallint)),
--     'Senin–Jumat', 'kilat_wave_closed');
--   INSERT INTO operational_holidays (holiday_date, label, is_active) VALUES (d + 3, 'Uji', true);
--   PERFORM pg_temp.harus_ditolak('6 libur', pg_temp.pesan(p[3], kilat_instant_of(d + 3, 11::smallint)),
--     'libur operasional', 'kilat_wave_closed');
--   PERFORM pg_temp.harus_ditolak('7 lewat batas pesan', pg_temp.pesan(p[3], kilat_instant_of(v_prev, 15::smallint)),
--     'sudah tutup', 'kilat_wave_closed');
--
--   -- 8  Jarak minimal 24 jam: p[1] D 15.00 [D 15, D+1 15).
--   --    D+1 11.00 beririsan → ditolak; D+1 15.00 bersentuhan → lolos.
--   PERFORM pg_temp.harus_ditolak('8a beririsan', pg_temp.pesan(p[1], kilat_instant_of(d + 1, 11::smallint)),
--     'beririsan', NULL);
--   PERFORM pg_temp.harus_lolos('8b bersentuhan', pg_temp.pesan(p[1], kilat_instant_of(d + 1, 15::smallint)));
--
--   -- 9  Admin melewati aturan waktu (Sabtu) tapi bentuknya tetap dipaksa.
--   PERFORM pg_temp.sebagai('admin');
--   PERFORM pg_temp.harus_lolos('9 admin Sabtu', pg_temp.pesan(p[3], kilat_instant_of(d + 5, 15::smallint)));
--   IF (SELECT kilat_slot_hour <> 15 OR duration <> 1 FROM ad_schedules
--        WHERE submission_id = p[3] AND source_table = 'form_submissions_extend') THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 9: jalur admin tidak membawa jam/durasi gelombang';
--   END IF;
--
--   -- 10  UPDATE langsung baris perpanjangan oleh peneliti (policy "melepas
--   --     reservasinya sendiri" mengizinkan barisnya).
--   PERFORM pg_temp.sebagai('peneliti');
--   SELECT source_id INTO v_ext FROM ad_schedules
--    WHERE submission_id = p[2] AND source_table = 'form_submissions_extend';
--   PERFORM pg_temp.harus_ditolak('10a pindah ke jam 14',
--     format('UPDATE ad_schedules SET start_date = %L, end_date = %L, kilat_slot_hour = 14 WHERE source_id = %L',
--       kilat_instant_of(d + 2, 14::smallint), kilat_instant_of(d + 2, 14::smallint) + interval '24 hours', v_ext),
--     'hanya pukul 11.00 dan 15.00', 'kilat_wave_invalid');
--   PERFORM pg_temp.harus_ditolak('10b instan tak sejalan jam',
--     format('UPDATE ad_schedules SET start_date = %L, end_date = %L WHERE source_id = %L',
--       kilat_instant_of(d + 2, 13::smallint), kilat_instant_of(d + 2, 13::smallint) + interval '24 hours', v_ext),
--     'satu gelombang', 'kilat_wave_invalid');
--   PERFORM pg_temp.harus_ditolak('10c dua hari',
--     format('UPDATE ad_schedules SET start_date = %L, end_date = %L WHERE source_id = %L',
--       kilat_instant_of(d + 2, 15::smallint), kilat_instant_of(d + 2, 15::smallint) + interval '48 hours', v_ext),
--     'satu gelombang', 'kilat_wave_invalid');
--   PERFORM pg_temp.harus_ditolak('10d jadi reguler',
--     format('UPDATE ad_schedules SET distribution_type = ''regular'' WHERE source_id = %L', v_ext),
--     'tidak bisa diubah', 'kilat_wave_invalid');
--   PERFORM pg_temp.harus_ditolak('10e atas nama admin',
--     format('UPDATE ad_schedules SET slot_booked_by = ''admin'' WHERE source_id = %L', v_ext),
--     'hanya bisa ditugaskan admin', 'kilat_wave_invalid');
--   PERFORM pg_temp.harus_lolos('10f pindah sah D+2 11.00',
--     format('UPDATE ad_schedules SET start_date = %L, end_date = %L, kilat_slot_hour = 11 WHERE source_id = %L',
--       kilat_instant_of(d + 2, 11::smallint), kilat_instant_of(d + 2, 11::smallint) + interval '24 hours', v_ext));
--
--   -- 11  Bukan klaim: catatan & pelepasan oleh peneliti → lolos.
--   PERFORM pg_temp.harus_lolos('11a catatan',
--     format('UPDATE ad_schedules SET admin_notes = admin_notes WHERE source_id = %L', v_ext));
--   PERFORM pg_temp.harus_lolos('11b lepas',
--     format('UPDATE ad_schedules SET status = ''cancelled'', slot_booked_by = NULL, slot_reserved_at = NULL
--               WHERE source_id = %L', v_ext));
--
--   -- 12  Iklan tidak tersentuh: akhir & durasi dari pemanggil, tanpa jam gelombang.
--   PERFORM pg_temp.harus_lolos('12 Iklan', pg_temp.pesan(p[5], airing_instant_of_date(d)));
--   IF (SELECT kilat_slot_hour IS NOT NULL OR duration <> 5
--              OR end_date <> airing_instant_of_date(d) + interval '5 days'
--         FROM ad_schedules WHERE submission_id = p[5] AND source_table = 'form_submissions_extend') THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 12: baris Iklan ikut dibentuk ulang';
--   END IF;
--   PERFORM pg_temp.harus_ditolak('12b Iklan jadi Kilat',
--     format('UPDATE ad_schedules SET distribution_type = ''kilat'' WHERE submission_id = %L
--               AND source_table = ''form_submissions_extend''', p[5]),
--     'tidak bisa diubah', 'kilat_wave_invalid');
--
--   -- 13  cron_activate_extends memakai rumus siaran. Baris perpanjangan Kilat
--   --     lunas yang sedang tayang [t0, t0+24 jam), sudah dinyala-matikan.
--   --     (Baris Iklan sengaja TIDAK disisipkan: kuota harian hari ini di
--   --     produksi bisa penuh dan menggagalkan uji tanpa alasan. Iklan dikunci
--   --     lewat identitas rumus di 13b.)
--   PERFORM pg_temp.sebagai('');
--   INSERT INTO ad_schedules (submission_id, ordinal, source_table, source_id,
--                             start_date, end_date, duration, status, review_status,
--                             payment_status, distribution_type, kilat_slot_hour, slot_booked_by,
--                             broadcast_at, broadcast_by, broadcast_ended_at, broadcast_ended_by)
--   VALUES (p[4], 2, 'form_submissions_extend', gen_random_uuid(),
--           v_t0, v_t0 + interval '24 hours', 1, 'scheduled', 'approved', 'paid', 'kilat',
--           EXTRACT(HOUR FROM v_t0 AT TIME ZONE 'Asia/Jakarta')::smallint, 'admin',
--           v_t0 + interval '5 minutes', 'uji', v_t0 + interval '1 hour', 'uji');
--   PERFORM public.cron_activate_extends();
--   IF EXISTS (SELECT 1 FROM survey_pages WHERE submission_id = p[4]
--                AND (publish_start_date IS DISTINCT FROM v_t0 + interval '5 minutes'
--                     OR publish_end_date IS DISTINCT FROM v_t0 + interval '1 hour')) THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 13a: cron menimpa jendela siaran Kilat';
--   END IF;
--   IF NOT EXISTS (SELECT 1 FROM survey_pages WHERE submission_id = p[4]) THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 13a: halaman uji hilang';
--   END IF;
--   -- 13b  Tanpa kolom siaran (setiap baris Iklan) rumusnya = start/end mentah,
--   --      jadi tick cron menulis nilai yang persis sama dengan sebelum sql/119.
--   IF airing_window_start(v_t0, NULL) <> v_t0
--      OR airing_window_end(v_t0, v_t0 + interval '5 days', NULL, NULL) <> v_t0 + interval '5 days' THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 13b: rumus berubah untuk baris tanpa siaran';
--   END IF;
--
--   RAISE EXCEPTION 'UJI_LULUS — 13 kelompok kasus lolos (hari uji %). Exception ini disengaja: semua tulisan uji dibatalkan.', d;
-- END
-- $uji$;
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK MIGRASI — hanya bila perlu. Salinan badan produksi 16 Okt 2026.
-- ============================================================================
--
-- ⚠️ Baris perpanjangan Kilat yang sudah lahir TIDAK dihapus rollback ini.
--    Cek dulu: SELECT count(*) FROM ad_schedules WHERE distribution_type =
--    'kilat' AND source_table = 'form_submissions_extend';
--
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_ad_schedules_kilat_extend_claim ON public.ad_schedules;
-- DROP FUNCTION IF EXISTS public.validate_kilat_extend_claim();
--
-- CREATE OR REPLACE FUNCTION public.create_ad_schedule(p_submission_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_duration integer, p_prize_per_winner integer DEFAULT 0, p_winner_count integer DEFAULT 0, p_additional_prize_per_winner integer DEFAULT 0, p_is_new_period boolean DEFAULT false, p_status text DEFAULT 'waiting_payment'::text, p_payment_status text DEFAULT 'pending'::text, p_total_cost integer DEFAULT 0, p_slot_booked_by text DEFAULT 'admin'::text, p_is_extra_ad boolean DEFAULT NULL::boolean, p_admin_notes text DEFAULT NULL::text, p_voucher_code text DEFAULT NULL::text, p_slot_reserved_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
--  RETURNS uuid
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_id                UUID := gen_random_uuid();
--   v_distribution_type TEXT;
--   v_review_status     TEXT;
--   v_submission_status TEXT;
--   v_is_extra          BOOLEAN;
--   v_is_admin          BOOLEAN;
--   v_owns              BOOLEAN;
--   v_booked_by         TEXT;
--   v_reserved_at       TIMESTAMPTZ;
--   v_total_cost        INTEGER;
--   v_start_ymd         DATE;
--   v_now_wib           TIMESTAMP;
--   claims              JSONB;
-- BEGIN
--   -- ── Gerbang wewenang ────────────────────────────────────────────────────
--   -- claims NULL = koneksi tanpa JWT (pg_cron, psql pemilik, migrasi). Pintu
--   -- resmi yang sama seperti guard_payment_columns() sql/33.
--   claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
--
--   v_is_admin := claims IS NULL
--                 OR COALESCE(claims ->> 'role', '')  = 'service_role'
--                 OR COALESCE(claims ->> 'email', '') = 'product@jakpat.net';
--
--   SELECT fs.distribution_type,
--          review_status_of(fs.submission_status),
--          fs.submission_status,
--          -- Kepemilikan menyalin policy SELECT `ad_schedules` PERSIS: sebagian
--          -- order lama tidak punya auth_user_id dan hanya bisa dikenali lewat
--          -- email. 303 baris, 87 di antaranya lunas (2026-09-11).
--          (fs.auth_user_id = auth.uid()
--           OR (fs.auth_user_id IS NULL
--               AND fs.email = COALESCE(claims ->> 'email', '')))
--     INTO v_distribution_type, v_review_status, v_submission_status, v_owns
--   FROM form_submissions fs WHERE fs.id = p_submission_id;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'create_ad_schedule: order % tidak ditemukan', p_submission_id;
--   END IF;
--
--   IF NOT v_is_admin AND NOT COALESCE(v_owns, false) THEN
--     RAISE EXCEPTION 'create_ad_schedule: hanya admin atau pemilik order yang boleh membuat jadwal';
--   END IF;
--
--   -- ── Aturan yang HANYA berlaku untuk peneliti ────────────────────────────
--   -- Jalur admin sengaja melewati semuanya: ia sudah punya kelonggaran cutoff
--   -- (commit 920b3cb) dan memang berwenang menjadwalkan Kilat & iklan tambahan.
--   IF NOT v_is_admin THEN
--     -- 1. Kilat tidak swalayan. Gelombangnya ditugaskan admin lewat
--     --    kilat_slot_hour, dan nol perpanjangan Kilat pernah terjadi.
--     IF v_distribution_type = 'kilat' THEN
--       RAISE EXCEPTION 'create_ad_schedule: order Kilat belum bisa dijadwalkan sendiri';
--     END IF;
--
--     -- 2. Order yang belum lolos review tidak boleh menambah jadwal.
--     IF v_review_status IS DISTINCT FROM 'approved' THEN
--       RAISE EXCEPTION 'create_ad_schedule: order ini belum disetujui, jadwal baru belum bisa dibuat';
--     END IF;
--
--     -- 2b. BARU (sql/88) — order yang sudah tidak aktif di sumbu TAYANG.
--     --
--     --     Dibaca dari `submission_status` MENTAH, bukan lewat
--     --     `review_status_of()`: fungsi itu menjawab pertanyaan lain, dan
--     --     jawabannya untuk `slot_cancelled` memang 'approved' (sql/62 §2).
--     --     Penjaga no. 2 di atas tetap tinggal — ia masih tugas yang benar
--     --     untuk menolak `in_review`; yang ini menangani nilai-nilai yang
--     --     memang bukan urusan sumbu review.
--     --
--     --     Kalimatnya dibaca PENELITI apa adanya: ScheduleAgainDialog
--     --     meneruskan `e?.message` langsung ke toast, jadi ia tidak boleh
--     --     berbunyi seperti jargon kolom.
--     IF v_submission_status IN ('slot_cancelled','cancelled','rejected','spam') THEN
--       RAISE EXCEPTION 'create_ad_schedule: order ini tidak aktif, jadwal baru tidak bisa dibuat';
--     END IF;
--
--     -- 3. Cutoff pemesanan 13.00 WIB — salinan KETIGA, diminta eksplisit oleh
--     --    catatan di src/utils/payment.ts. Tanpa ini peneliti bisa memesan
--     --    13.30 untuk tayang hari itu, lalu tagihannya ditolak terbit oleh
--     --    cabang `null` invoiceLifetimeMinutes() yang dirancang sebagai
--     --    gerbang ADMIN. Lihat BOOKING_CUTOFF_HOUR_WIB di airing-window.ts.
--     v_now_wib   := NOW() AT TIME ZONE 'Asia/Jakarta';
--     v_start_ymd := (p_start_date AT TIME ZONE 'Asia/Jakarta')::date;
--
--     IF v_start_ymd < v_now_wib::date
--        OR (v_start_ymd = v_now_wib::date AND EXTRACT(HOUR FROM v_now_wib) >= 13)
--     THEN
--       RAISE EXCEPTION
--         'create_ad_schedule: pemesanan untuk % sudah ditutup (batas 13.00 WIB)',
--         TO_CHAR(v_start_ymd, 'DD Mon YYYY');
--     END IF;
--
--     -- 4. Batch baru WAJIB berhadiah. Aturan ini hari ini hidup HANYA di
--     --    TypeScript (ScheduleForm.tsx:551) — jalur peneliti tidak lewat sana.
--     IF COALESCE(p_is_new_period, false)
--        AND (COALESCE(p_prize_per_winner, 0) <= 0 OR COALESCE(p_winner_count, 0) <= 0)
--     THEN
--       RAISE EXCEPTION 'create_ad_schedule: jadwal ini membuka batch hadiah baru — hadiah dan jumlah pemenang wajib diisi';
--     END IF;
--   END IF;
--
--   -- ── Nilai yang DIPAKSA untuk peneliti ───────────────────────────────────
--   -- Tidak boleh datang dari browser, apa pun yang dikirim pemanggil.
--   IF v_is_admin THEN
--     v_booked_by   := p_slot_booked_by;
--     v_reserved_at := p_slot_reserved_at;
--     v_total_cost  := COALESCE(p_total_cost, 0);
--     v_is_extra    := p_is_extra_ad;
--   ELSE
--     v_booked_by   := 'user';        -- satu-satunya nilai yang bisa lepas sendiri
--     v_reserved_at := NOW();         -- hold 1 jam mulai berdetak SEKARANG
--     v_total_cost  := 0;             -- harga lahir di create-payment.js, bukan di sini
--     v_is_extra    := false;         -- kolam iklan tambahan milik admin
--   END IF;
--
--   -- Tidak disebut = MEWARISI ordinal 1, bukan false. Lihat catatan no. 2 di
--   -- header sql/74. Untuk peneliti nilainya sudah dipaksa false di atas.
--   IF v_is_extra IS NULL THEN
--     SELECT a.is_extra_ad INTO v_is_extra
--     FROM ad_schedules a
--     WHERE a.submission_id = p_submission_id
--       AND a.source_table = 'form_submissions';
--   END IF;
--
--   IF COALESCE(p_status, 'waiting_payment') <> 'cancelled' THEN
--     PERFORM assert_schedule_window_free(p_submission_id, p_start_date, p_end_date, v_id, true);
--
--     -- BARU (sql/86): kapasitas HARI, bukan cuma tumpang tindih survei ini
--     -- sendiri. Dipanggil untuk SEMUA pemanggil — TOCTOU tidak peduli siapa
--     -- yang mengklik, dan admin pun bisa menjual hari yang sudah penuh.
--     PERFORM assert_daily_ad_quota_free(
--       p_start_date, p_end_date, COALESCE(v_is_extra, false), v_distribution_type, NULL);
--   END IF;
--
--   INSERT INTO ad_schedules (
--     submission_id, ordinal, source_table, source_id,
--     start_date, end_date, duration,
--     status, review_status, payment_status,
--     prize_per_winner, winner_count, additional_prize_per_winner,
--     is_new_period, period_batch,
--     total_cost, subtotal, ppn_amount, voucher_code,
--     slot_booked_by, slot_reserved_at, admin_notes,
--     distribution_type, kilat_slot_hour,
--     is_extra_ad,
--     created_at, updated_at
--   ) VALUES (
--     p_submission_id, 2, 'form_submissions_extend', v_id,
--     p_start_date, p_end_date, p_duration,
--     COALESCE(p_status, 'waiting_payment'), v_review_status, p_payment_status,
--     COALESCE(p_prize_per_winner, 0), COALESCE(p_winner_count, 0),
--     COALESCE(p_additional_prize_per_winner, 0),
--     COALESCE(p_is_new_period, false), NULL,   -- period_batch dihitung trg_ad_schedules_period_batch
--     v_total_cost, NULL, NULL, p_voucher_code,
--     v_booked_by, v_reserved_at, p_admin_notes,
--     v_distribution_type, NULL,
--     COALESCE(v_is_extra, false),
--     NOW(), NOW()
--   );
--
--   PERFORM resync_ad_schedule_ordinals(p_submission_id);
--
--   -- Mengembalikan `source_id`, BUKAN `ad_schedules.id` — itulah nilai yang
--   -- dulu dibaca pemanggil sebagai `form_submissions_extend.id`, dan yang
--   -- dipakai `invoices.extend_id` / `transactions.extend_id`.
--   --
--   -- ⚠️ PEMANGGIL YANG MENYUSUN LINK `/bayar/<id>` BUTUH `ad_schedules.id`,
--   -- BUKAN nilai ini. Resolver dan schedule_billing() dikunci ke yang pertama;
--   -- memakai yang salah TIDAK error, ia cuma tidak menemukan tagihan apa pun.
--   -- Lihat Langkah 5 rencana Phase 4.
--   RETURN v_id;
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
--   SET publish_start_date  = a.start_date,
--       publish_end_date    = a.end_date,
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
-- COMMIT;
