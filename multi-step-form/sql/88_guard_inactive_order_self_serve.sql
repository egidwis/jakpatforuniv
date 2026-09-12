-- ============================================================================
-- 88 — "order ini masih aktif?" berhenti ditanyakan ke sumbu yang salah
-- ============================================================================
-- `create_ad_schedule` sudah menolak order yang belum lolos review lewat
-- `review_status_of()`. Tapi "boleh menambah jadwal?" adalah pertanyaan sumbu
-- TAYANG, bukan sumbu review — dan sql/62 sengaja memetakan `slot_cancelled`
-- ke `approved` supaya membatalkan slot tidak menghapus riwayat persetujuan.
--
-- Akibatnya order `slot_cancelled` LOLOS penjaga review, dan peneliti bisa
-- menjadwalkan ulang order yang slotnya sudah dibatalkan tim.
--
-- ⚠️ CAKUPANNYA 9 ORDER, BUKAN 147. Diukur ke produksi 2026-09-12 — berapa
--    yang lolos `review_status_of()`:
--
--      submission_status | jumlah | lolos penjaga review
--      ------------------+--------+---------------------
--      in_review         |    397 |   0
--      spam              |    110 |   0
--      rejected          |     17 |   0
--      cancelled         |     11 |   0
--      slot_cancelled    |      9 |   9   ← hanya ini yang sampai ke sini
--
--    138 sisanya tidak pernah lolos sejak awal. Penjaga ini tetap ditulis —
--    berlapis di jalur uang itu murah, dan `slot_cancelled` memang lolos —
--    tapi jangan menaksir bobotnya 15x lebih besar dari sebenarnya.
--
-- ⚠️ `review_status_of()` TIDAK DISENTUH. Mengubahnya merusak desain dua-sumbu
--    sql/46+62 dan menghapus riwayat persetujuan 13 order. sql/62 menulis
--    alasannya dengan huruf besar: "TANPA BAGIAN INI, MEMBATALKAN SLOT AKAN
--    MENGHAPUS RIWAYAT REVIEW. Membatalkan slot tidak membatalkan persetujuan."
--    Yang keliru bukan fungsinya, melainkan PEMAKAIANNYA di sql/86.
--
-- ⚠️ HANYA jalur NON-ADMIN. Admin tetap boleh menjadwalkan order
--    `slot_cancelled` — itu justru caranya memperbaiki slot yang ia batalkan.
--    Dikunci uji no. 5 di bawah.
--
-- ⚠️ BADAN FUNGSI DISALIN DARI PRODUKSI (`pg_get_functiondef`, 2026-09-12),
--    BUKAN dari berkas sql/86. Menyalin dari berkas yang salah pernah
--    menghidupkan lagi cabang yang sudah dibuang — lihat sql/49 vs sql/51.
--    Versi yang berlaku saat migrasi ini ditulis: 16 parameter (sql/86 sudah
--    diterapkan). Kalau `pronargs` bukan 16 saat Anda membaca ini, JANGAN
--    terapkan berkas ini sebelum memeriksa apa yang berubah.
--
-- ⚠️ NOL `REVOKE` YANG DIPERLUKAN. Diperiksa 2026-09-12, `proacl` fungsi ini
--    berbunyi {postgres=X,authenticated=X,service_role=X} — `anon` TIDAK ada.
--    Jadi jebakan `pg_default_acl` (memori `anon-default-acl-on-new-functions`)
--    tidak berlaku di sini: `CREATE OR REPLACE` mempertahankan ACL yang sudah
--    ada, ia tidak melahirkan hibah baru. Periksa lagi sesudah menerapkan.
--
-- Nomor 88 diambil sesudah `git fetch` (tertinggi di origin/main: 87).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_ad_schedule(
  p_submission_id uuid,
  p_start_date timestamp with time zone,
  p_end_date timestamp with time zone,
  p_duration integer,
  p_prize_per_winner integer DEFAULT 0,
  p_winner_count integer DEFAULT 0,
  p_additional_prize_per_winner integer DEFAULT 0,
  p_is_new_period boolean DEFAULT false,
  p_status text DEFAULT 'waiting_payment'::text,
  p_payment_status text DEFAULT 'pending'::text,
  p_total_cost integer DEFAULT 0,
  p_slot_booked_by text DEFAULT 'admin'::text,
  p_is_extra_ad boolean DEFAULT NULL::boolean,
  p_admin_notes text DEFAULT NULL::text,
  p_voucher_code text DEFAULT NULL::text,
  p_slot_reserved_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
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

  -- ── Aturan yang HANYA berlaku untuk peneliti ────────────────────────────
  -- Jalur admin sengaja melewati semuanya: ia sudah punya kelonggaran cutoff
  -- (commit 920b3cb) dan memang berwenang menjadwalkan Kilat & iklan tambahan.
  IF NOT v_is_admin THEN
    -- 1. Kilat tidak swalayan. Gelombangnya ditugaskan admin lewat
    --    kilat_slot_hour, dan nol perpanjangan Kilat pernah terjadi.
    IF v_distribution_type = 'kilat' THEN
      RAISE EXCEPTION 'create_ad_schedule: order Kilat belum bisa dijadwalkan sendiri';
    END IF;

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

    IF v_start_ymd < v_now_wib::date
       OR (v_start_ymd = v_now_wib::date AND EXTRACT(HOUR FROM v_now_wib) >= 13)
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
    PERFORM assert_schedule_window_free(p_submission_id, p_start_date, p_end_date, v_id, true);

    -- BARU (sql/86): kapasitas HARI, bukan cuma tumpang tindih survei ini
    -- sendiri. Dipanggil untuk SEMUA pemanggil — TOCTOU tidak peduli siapa
    -- yang mengklik, dan admin pun bisa menjual hari yang sudah penuh.
    PERFORM assert_daily_ad_quota_free(
      p_start_date, p_end_date, COALESCE(v_is_extra, false), v_distribution_type, NULL);
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
    p_start_date, p_end_date, p_duration,
    COALESCE(p_status, 'waiting_payment'), v_review_status, p_payment_status,
    COALESCE(p_prize_per_winner, 0), COALESCE(p_winner_count, 0),
    COALESCE(p_additional_prize_per_winner, 0),
    COALESCE(p_is_new_period, false), NULL,   -- period_batch dihitung trg_ad_schedules_period_batch
    v_total_cost, NULL, NULL, p_voucher_code,
    v_booked_by, v_reserved_at, p_admin_notes,
    v_distribution_type, NULL,
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

-- ── Verifikasi sesudah menerapkan ───────────────────────────────────────────
--
-- 1. Peneliti + order slot_cancelled → DITOLAK penjaga baru.
--    Ganti <ID> dengan hasil:
--      SELECT id, email FROM form_submissions
--      WHERE submission_status = 'slot_cancelled' AND auth_user_id IS NOT NULL
--      LIMIT 1;
--    lalu pakai email pemilik ASLI supaya penjaga kepemilikan lewat dan
--    penjaga berikutnya yang bicara:
--
--      BEGIN;
--      SET LOCAL request.jwt.claims = '{"role":"authenticated","email":"<EMAIL PEMILIK>"}';
--      SELECT create_ad_schedule(
--        p_submission_id := '<ID>'::uuid,
--        p_start_date    := (now() + interval '10 days'),
--        p_end_date      := (now() + interval '17 days'),
--        p_duration      := 7);
--      ROLLBACK;
--
--    Harapan: ERROR 'order ini tidak aktif, jadwal baru tidak bisa dibuat'.
--
-- 2. ADMIN + order slot_cancelled yang sama → TETAP DIIZINKAN.
--
--      BEGIN;
--      SET LOCAL request.jwt.claims = '{"role":"authenticated","email":"product@jakpat.net"}';
--      SELECT create_ad_schedule( ... sama seperti di atas ... );
--      ROLLBACK;   -- ⚠️ WAJIB: tanpa ini jadwal uji betulan lahir dan
--                  --    memakan kuota harian nyata.
--
--    Harapan: mengembalikan UUID, tidak melempar.
--
-- 3. ACL tidak melahirkan hibah anon:
--      SELECT proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='public' AND p.proname='create_ad_schedule';
--    Harapan: tidak memuat `anon=X`.
