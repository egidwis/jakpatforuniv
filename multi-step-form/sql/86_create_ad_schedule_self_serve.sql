-- ============================================================================
-- 86 — `create_ad_schedule()` melebar ke PENELITI (Phase 4, Langkah 2)
-- ============================================================================
-- Nomor `86` dipesan sejak sql/85 untuk persis pekerjaan ini. Diambil sesudah
-- `git fetch` (aturan yang lahir dari tabrakan `85`): kosong di seluruh remote
-- per 2026-09-11.
--
-- sql/74 menutup dirinya dengan kalimat ini: *"Kalau Phase 4 kelak membuka
-- penjadwalan swalayan, pelebarannya dilakukan SADAR di sini."* Berkas ini
-- pelebaran itu.
--
-- ── Yang berubah ───────────────────────────────────────────────────────────
-- 1. Gerbang wewenang menerima PEMILIK ORDER, bukan cuma admin/service_role.
-- 2. Parameter baru `p_slot_reserved_at` — hold 1 jam akhirnya punya wujud di DB.
-- 3. Untuk pemanggil non-admin, RPC MEMAKSA nilai: slot_booked_by='user',
--    slot_reserved_at=now(), is_extra_ad=false, total_cost=0.
-- 4. Empat penolakan baru: Kilat, belum lolos review, lewat cutoff 13.00,
--    hadiah kosong saat batch baru.
-- 5. Penjaga KUOTA HARIAN di dalam DB — sebelumnya hanya ada di TypeScript.
--
-- ⚠️ Jalur ADMIN tidak berubah perilakunya sama sekali. Semua yang baru
-- bercabang pada "pemanggilnya admin atau bukan"; admin melewati semuanya
-- persis seperti hari ini. Itu disengaja: Rilis B tidak boleh menyentuh jalur
-- yang sedang dipakai admin setiap hari.
--
-- ── Kenapa kuota harian WAJIB pindah ke sini ──────────────────────────────
-- `MAX_REGULAR_ADS_PER_DAY = 4` hidup HANYA di TypeScript (`src/utils/constants.ts`,
-- dibaca 6 berkas, nol SQL). `assert_schedule_window_free` TIDAK menjaganya —
-- kedua kakinya menyaring `submission_id = p_submission_id`, jadi ia menjaga
-- satu survei dari beririsan dengan DIRINYA SENDIRI, bukan kapasitas hari.
-- `supabase.ts` sendiri sudah menuliskannya: *"a date could be sold past
-- MAX_REGULAR_ADS_PER_DAY."*
--
-- Yang menyerialkan pemesanan hari ini adalah ADMIN — seorang manusia yang
-- memesan satu per satu. Phase 4 mencabut manusia itu dan menggantinya dengan
-- N peneliti yang mengklik bersamaan: TOCTOU. Kalender mengatakan "sisa 1",
-- dua browser mengirim, keduanya lolos.
--
-- ⚠️ Kuota jadi punya DUA penjaga (kalender untuk UX, RPC untuk kebenaran) dan
-- itu DISENGAJA — tapi angkanya wajib sama. Kalau `MAX_REGULAR_ADS_PER_DAY`
-- di `src/utils/constants.ts` berubah, KONSTANTA DI BAWAH WAJIB IKUT BERUBAH.
-- Pola "DUPLICATED … WAJIB diubah bersamaan" yang sama dipakai PPN_RATE,
-- KILAT_SLOT_HOURS, dan DEFAULT_AD_BANNER_URL.
--
-- Cara menghitungnya menyalin `holdsSlot()` + `fetchSlotAvailability()`
-- (supabase.ts) PERSIS, karena kalender dan RPC harus sepakat:
--   * dua kaki — jadwal ordinal 1 (`form_submissions`) dan jadwal ke-2 dst.
--     (`ad_schedules`), saringan status identik dengan
--     `get_submission_slot_occupancy` / `get_extend_slot_occupancy`;
--   * hold yang SUDAH LEPAS tidak menghitung — `slot_booked_by='user'` DAN
--     belum lunas DAN `slot_reserved_at` lewat 1 jam. Ambangnya eksklusif,
--     sama dengan `holdsSlot`;
--   * akhir-EKSKLUSIF: hari `end_date` bukan hari tayang;
--   * kolam terpisah — `is_extra_ad` punya kuotanya sendiri.
--
-- Diukur ke produksi 2026-09-11 dengan kueri yang identik dengan penjaga di
-- bawah: 10–15 Sep sudah **4/4 (penuh)**, 16 Sep di 3, 17 Sep dst. di 1.
-- Jadi penolakan ini BUKAN teoretis — hari penuh benar-benar ada minggu ini.
--
-- ── Cutoff 13.00 jadi salinan KETIGA, dan itu diminta eksplisit ────────────
-- `src/utils/payment.ts` menulis peringatannya sendiri:
--   *"⚠️ KALAU PHASE 4 MEMBUKA PENJADWALAN SWALAYAN, ia menambah jalur peneliti
--   KEDUA yang tidak lewat submitOrder.ts — dan cutoff pemesanannya harus ikut
--   ditegakkan di sana (di RPC-nya), atau invarian ini patah."*
--
-- Invarian yang dimaksud: `PAYMENT_CUTOFF_HOUR_WIB (14) − BOOKING_CUTOFF_HOUR_WIB
-- (13) = 60 menit = MIN_INVOICE_MINUTES`, yang membuat cabang `null`
-- `invoiceLifetimeMinutes()` mustahil dicapai peneliti. Tanpa penegakan di
-- sini, peneliti bisa memesan jam 13.30 untuk tayang hari itu juga, lalu
-- tagihannya ditolak terbit oleh cabang yang dirancang sebagai gerbang ADMIN.
--
-- ⚠️ TIGA SALINAN sekarang: `airing-window.ts` (BOOKING_CUTOFF_HOUR_WIB),
-- `submitOrder.ts` (penegak jalur order pertama), dan berkas ini.
--
-- ── Kepemilikan: `auth.uid()` SAJA TIDAK CUKUP ────────────────────────────
-- ⚠️ **303 order ber-`auth_user_id` NULL, 87 di antaranya LUNAS** (diukur
-- 2026-09-11). Gerbang `auth.uid() = auth_user_id` menolak mereka semua —
-- `NULL = NULL` bukan TRUE di SQL, jadi arahnya gagal-TERTUTUP (aman), tapi
-- 87 order lunas itu justru populasi sasaran Phase 4.
--
-- Maka gerbangnya menyalin policy SELECT `ad_schedules` yang SUDAH berdiri:
--   auth_user_id = auth.uid()
--   OR (auth_user_id IS NULL AND email = auth.jwt()->>'email')
-- Satu aturan kepemilikan untuk satu tabel; jangan melahirkan versi kedua.
--
-- ── Yang TIDAK dilakukan berkas ini ───────────────────────────────────────
-- ⚠️ TIDAK menambah policy INSERT `ad_schedules` untuk `authenticated`.
-- Fungsi ini SECURITY DEFINER milik `postgres`, jadi ia sudah melewati RLS.
-- Membuka policy INSERT akan melahirkan lagi lubang yang ditutup sql/75.
--
-- ⚠️ TIDAK menyentuh harga. `p_total_cost` dipaksa 0 untuk non-admin; harga
-- jadwal ke-2 lahir di `create-payment.js` (Langkah 4), bukan dari browser.
--
-- ── ACL ────────────────────────────────────────────────────────────────────
-- ⚠️ Produksi hari ini punya `anon=X` pada `create_ad_schedule` — datang dari
-- `pg_default_acl`, bukan dari sql/74 (berkasnya tidak pernah memberikannya).
-- Diverifikasi 2026-09-11. Fungsi ini sekarang MENULIS jadwal dan membaca
-- `auth.uid()`; dipanggil dengan kunci anon (yang ikut terkirim di bundel
-- klien) `auth.uid()` NULL sehingga gerbang kepemilikan menolak — tapi
-- mengandalkan itu adalah pertahanan lapis tunggal. Dicabut EKSPLISIT, pola
-- sql/87.
--
-- Idempoten: CREATE OR REPLACE. Tanda tangannya BERTAMBAH satu parameter
-- ber-DEFAULT, jadi pemanggil lama (`ScheduleForm`, 15 argumen) tetap cocok.
-- ⚠️ Karena tanda tangannya berubah, versi 15-parameter lama TIDAK otomatis
-- tergantikan — ia di-DROP eksplisit di bawah supaya tidak ada dua fungsi
-- dengan nama sama yang bisa dipilih PostgREST secara tak terduga.
--
-- Jalankan di Supabase SQL Editor.
-- ============================================================================

BEGIN;

-- ============================================
-- 1. Konstanta kuota — DUPLICATED dari src/utils/constants.ts
-- ============================================
-- ⚠️ MAX_REGULAR_ADS_PER_DAY = 4 dan MAX_EXTRA_ADS_PER_DAY = 4 di
-- `src/utils/constants.ts`. WAJIB diubah bersamaan dengan fungsi di bawah.
-- Ditulis sebagai fungsi, bukan angka telanjang di badan, supaya ada SATU
-- tempat yang bisa di-grep saat tarifnya bergeser.
CREATE OR REPLACE FUNCTION public.max_regular_ads_per_day()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 4 $$;

CREATE OR REPLACE FUNCTION public.max_extra_ads_per_day()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 4 $$;

COMMENT ON FUNCTION public.max_regular_ads_per_day() IS
  'Kuota iklan reguler per hari. DUPLICATED dari MAX_REGULAR_ADS_PER_DAY di '
  'src/utils/constants.ts — WAJIB diubah bersamaan, kalau tidak kalender dan '
  'penjaga RPC berselisih. Ditambahkan sql/86.';
COMMENT ON FUNCTION public.max_extra_ads_per_day() IS
  'Kuota iklan tambahan per hari. DUPLICATED dari MAX_EXTRA_ADS_PER_DAY di '
  'src/utils/constants.ts — WAJIB diubah bersamaan. Ditambahkan sql/86.';

-- ============================================
-- 2. Penjaga kuota harian — cerminan holdsSlot() + fetchSlotAvailability()
-- ============================================
-- SECURITY DEFINER: kuota WAJIB melihat jadwal SEMUA ORANG. RLS `ad_schedules`
-- hanya memapar milik sendiri, dan penjaga yang tidak bisa melihat semua jadwal
-- akan MELEWATKAN hari penuh, bukan menolaknya — alasan yang sama persis
-- dituliskan `assert_schedule_window_free` (sql/52) untuk dirinya sendiri.
CREATE OR REPLACE FUNCTION public.assert_daily_ad_quota_free(
  p_start             TIMESTAMPTZ,
  p_end               TIMESTAMPTZ,
  p_is_extra_ad       BOOLEAN,
  p_distribution_type TEXT,
  p_exclude_source_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_quota  INTEGER;
  v_day    DATE;
  v_full   RECORD;
BEGIN
  IF p_start IS NULL OR p_end IS NULL THEN RETURN; END IF;

  -- Kilat punya kolam gelombangnya sendiri (8/11/14/17 WIB, 2 order/gelombang)
  -- dan TIDAK diatur kuota harian ini. Penjadwalan swalayan menolak Kilat lebih
  -- dulu di create_ad_schedule(), jadi cabang ini hanya melindungi pemanggil lain.
  IF p_distribution_type = 'kilat' THEN RETURN; END IF;

  v_quota := CASE WHEN COALESCE(p_is_extra_ad, false)
                  THEN max_extra_ads_per_day()
                  ELSE max_regular_ads_per_day() END;

  -- Akhir-EKSKLUSIF: hari `end_date` adalah hari serah-terima, bukan hari tayang.
  -- Hari dihitung menurut kalender WIB, bukan UTC — sebuah jendela yang mulai
  -- 15.00 WIB adalah 08:00 UTC di tanggal yang sama.
  FOR v_day IN
    SELECT generate_series(
             (p_start AT TIME ZONE 'Asia/Jakarta')::date,
             (p_end   AT TIME ZONE 'Asia/Jakarta')::date - 1,
             '1 day')::date
  LOOP
    SELECT COUNT(*) AS n INTO v_full
    FROM (
      -- Kaki 1 — jadwal ordinal 1. Saringan status identik dengan
      -- get_submission_slot_occupancy().
      SELECT fs.id AS source_id,
             airing_instant_of_date(fs.start_date) AS sd,
             airing_instant_of_date(fs.end_date)   AS ed,
             fs.slot_booked_by, fs.slot_reserved_at, fs.payment_status,
             COALESCE(a.is_extra_ad, false) AS is_extra
      FROM form_submissions fs
      JOIN ad_schedules a
        ON a.source_table = 'form_submissions' AND a.source_id = fs.id
      WHERE fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
        AND fs.submission_status NOT IN
            ('rejected','spam','in_review','completed','cancelled','slot_cancelled')
        AND fs.distribution_type = p_distribution_type

      UNION ALL

      -- Kaki 2 — jadwal ke-2 dst. Saringan status identik dengan
      -- get_extend_slot_occupancy().
      SELECT a.source_id, a.start_date, a.end_date,
             a.slot_booked_by, a.slot_reserved_at, a.payment_status,
             COALESCE(a.is_extra_ad, false)
      FROM ad_schedules a
      JOIN form_submissions fs ON fs.id = a.submission_id
      WHERE a.source_table = 'form_submissions_extend'
        AND a.start_date IS NOT NULL AND a.end_date IS NOT NULL
        AND a.status IN ('waiting_payment','paid','scheduled','live')
        AND fs.distribution_type IS NOT DISTINCT FROM p_distribution_type
    ) occ
    WHERE occ.is_extra = COALESCE(p_is_extra_ad, false)
      AND (p_exclude_source_id IS NULL OR occ.source_id <> p_exclude_source_id)
      AND v_day >= (occ.sd AT TIME ZONE 'Asia/Jakarta')::date
      AND v_day <  (occ.ed AT TIME ZONE 'Asia/Jakarta')::date
      -- Aturan pelepasan holdsSlot(): hold peneliti yang belum lunas dan sudah
      -- lewat 1 jam TIDAK LAGI menahan kapasitas. Ambang eksklusif — tepat di
      -- detik tenggat, slotnya masih ditahan.
      AND NOT (
        COALESCE(occ.slot_booked_by,'') = 'user'
        AND COALESCE(occ.payment_status,'pending') NOT IN ('paid','completed')
        AND occ.slot_reserved_at IS NOT NULL
        AND occ.slot_reserved_at < NOW() - INTERVAL '1 hour'
      );

    IF v_full.n >= v_quota THEN
      RAISE EXCEPTION
        'Kuota iklan % pada % sudah penuh (% dari %). Pilih tanggal lain.',
        CASE WHEN COALESCE(p_is_extra_ad,false) THEN 'tambahan' ELSE 'reguler' END,
        TO_CHAR(v_day, 'DD Mon YYYY'), v_full.n, v_quota;
    END IF;
  END LOOP;
END;
$fn$;

COMMENT ON FUNCTION public.assert_daily_ad_quota_free(timestamptz, timestamptz, boolean, text, uuid) IS
  'Menolak jendela tayang yang melewati kuota harian. Mencerminkan holdsSlot() + '
  'fetchSlotAvailability() di src/utils/supabase.ts — dua kaki occupancy, hold '
  'lepas tidak dihitung, akhir-eksklusif, kolam extra terpisah. Ditambahkan sql/86 '
  'karena Phase 4 mencabut admin sebagai penyerialisasi pemesanan (TOCTOU).';

REVOKE ALL ON FUNCTION public.assert_daily_ad_quota_free(timestamptz, timestamptz, boolean, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_daily_ad_quota_free(timestamptz, timestamptz, boolean, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_daily_ad_quota_free(timestamptz, timestamptz, boolean, text, uuid) TO authenticated, service_role;

-- ============================================
-- 3. create_ad_schedule() — wewenang melebar ke pemilik order
-- ============================================
-- Tanda tangan lama (15 parameter) dibuang: yang baru menambah
-- `p_slot_reserved_at`, jadi CREATE OR REPLACE saja akan meninggalkan DUA
-- fungsi bernama sama dan PostgREST bisa memilih yang salah.
DROP FUNCTION IF EXISTS public.create_ad_schedule(
  uuid, timestamptz, timestamptz, integer, integer, integer, integer,
  boolean, text, text, integer, text, boolean, text, text);

CREATE OR REPLACE FUNCTION public.create_ad_schedule(
  p_submission_id                uuid,
  p_start_date                   timestamptz,
  p_end_date                     timestamptz,
  p_duration                     integer,
  p_prize_per_winner             integer DEFAULT 0,
  p_winner_count                 integer DEFAULT 0,
  p_additional_prize_per_winner  integer DEFAULT 0,
  p_is_new_period                boolean DEFAULT false,
  p_status                       text    DEFAULT 'waiting_payment',
  p_payment_status               text    DEFAULT 'pending',
  p_total_cost                   integer DEFAULT 0,
  p_slot_booked_by               text    DEFAULT 'admin',
  p_is_extra_ad                  boolean DEFAULT NULL,
  p_admin_notes                  text    DEFAULT NULL,
  p_voucher_code                 text    DEFAULT NULL,
  -- BARU (sql/86). Hold 1 jam akhirnya punya jalan ke DB; sql/74 menulis
  -- kolom ini hardcoded NULL, jadi `slot_reserved_at` terisi di 0 dari 18
  -- jadwal ordinal >=2 di produksi.
  p_slot_reserved_at             timestamptz DEFAULT NULL
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

COMMENT ON FUNCTION public.create_ad_schedule(uuid, timestamptz, timestamptz, integer, integer, integer, integer, boolean, text, text, integer, text, boolean, text, text, timestamptz) IS
  'Membuat jadwal iklan ke-2 dst. Sejak sql/86 pemilik order boleh memanggilnya '
  'sendiri (Phase 4): untuk non-admin RPC memaksa slot_booked_by=user, '
  'slot_reserved_at=now(), is_extra_ad=false, total_cost=0, dan menolak Kilat, '
  'order belum approved, pemesanan lewat 13.00 WIB, serta batch baru tanpa hadiah. '
  'Kuota harian ditegakkan assert_daily_ad_quota_free(). Mengembalikan source_id, '
  'BUKAN ad_schedules.id.';

-- ── ACL ────────────────────────────────────────────────────────────────────
-- `anon` dicabut EKSPLISIT: pg_default_acl memberikannya ke setiap fungsi baru
-- di `public`, dan REVOKE FROM PUBLIC tidak menyentuh hibah langsung ke role.
-- Diverifikasi 2026-09-11: produksi punya `anon=X` pada versi sql/74.
REVOKE ALL ON FUNCTION public.create_ad_schedule(uuid, timestamptz, timestamptz, integer, integer, integer, integer, boolean, text, text, integer, text, boolean, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_ad_schedule(uuid, timestamptz, timestamptz, integer, integer, integer, integer, boolean, text, text, integer, text, boolean, text, text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_ad_schedule(uuid, timestamptz, timestamptz, integer, integer, integer, integer, boolean, text, text, integer, text, boolean, text, text, timestamptz) TO authenticated, service_role;

COMMIT;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
-- Jalankan SESUDAH COMMIT.
--
-- 1) Hanya SATU create_ad_schedule, dengan 16 parameter, dan `anon` tercabut
--
-- SELECT pg_get_function_identity_arguments(p.oid) AS args,
--        array_to_string(p.proacl::text[],' | ') AS acl
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public' AND p.proname='create_ad_schedule';
-- -- diharapkan: TEPAT 1 baris, argumen diakhiri `p_slot_reserved_at timestamptz`,
-- --             acl TANPA 'anon='
--
-- 2) Penjaga kuota memang menolak hari yang penuh (diukur 2026-09-11:
--    10–15 Sep = 4/4 penuh, 16 Sep = 3, 17 Sep dst = 1).
--    Ganti tanggalnya kalau hari ini sudah lewat.
--
-- SELECT assert_daily_ad_quota_free(
--   '2026-09-12T08:00:00Z'::timestamptz,   -- 15.00 WIB 12 Sep
--   '2026-09-13T08:00:00Z'::timestamptz,   -- akhir eksklusif = 1 hari tayang
--   false, 'regular', NULL);
-- -- diharapkan: EXCEPTION "Kuota iklan reguler pada 12 Sep 2026 sudah penuh (4 dari 4)"
--
-- SELECT assert_daily_ad_quota_free(
--   '2026-09-20T08:00:00Z'::timestamptz,
--   '2026-09-21T08:00:00Z'::timestamptz,
--   false, 'regular', NULL);
-- -- diharapkan: sukses (NULL), hari itu baru terisi 1 dari 4
--
-- 3) Penjaga kuota SEPAKAT dengan kalender. Nol baris = sepakat.
--    Kalau ada baris, kalender dan RPC akan memberi jawaban berbeda untuk
--    tanggal yang sama — itu pemblokir Langkah 5.
--
-- WITH occ AS (
--   SELECT fs.id AS source_id, airing_instant_of_date(fs.start_date) AS sd,
--          airing_instant_of_date(fs.end_date) AS ed, fs.slot_booked_by,
--          fs.slot_reserved_at, fs.payment_status, COALESCE(a.is_extra_ad,false) AS is_extra
--   FROM form_submissions fs
--   JOIN ad_schedules a ON a.source_table='form_submissions' AND a.source_id=fs.id
--   WHERE fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
--     AND fs.submission_status NOT IN ('rejected','spam','in_review','completed','cancelled','slot_cancelled')
--     AND fs.distribution_type='regular'
--   UNION ALL
--   SELECT a.source_id, a.start_date, a.end_date, a.slot_booked_by,
--          a.slot_reserved_at, a.payment_status, COALESCE(a.is_extra_ad,false)
--   FROM ad_schedules a JOIN form_submissions fs ON fs.id=a.submission_id
--   WHERE a.source_table='form_submissions_extend'
--     AND a.start_date IS NOT NULL AND a.end_date IS NOT NULL
--     AND a.status IN ('waiting_payment','paid','scheduled','live')
--     AND fs.distribution_type IS NOT DISTINCT FROM 'regular'
-- ), held AS (
--   SELECT * FROM occ WHERE NOT (COALESCE(slot_booked_by,'')='user'
--     AND COALESCE(payment_status,'pending') NOT IN ('paid','completed')
--     AND slot_reserved_at IS NOT NULL AND slot_reserved_at < NOW() - INTERVAL '1 hour')
-- ), days AS (SELECT generate_series(CURRENT_DATE, CURRENT_DATE+30,'1 day')::date AS d)
-- SELECT d.d, COUNT(*) FILTER (WHERE NOT h.is_extra) AS regular
-- FROM days d LEFT JOIN held h
--   ON d.d >= (h.sd AT TIME ZONE 'Asia/Jakarta')::date
--  AND d.d <  (h.ed AT TIME ZONE 'Asia/Jakarta')::date
-- GROUP BY d.d HAVING COUNT(*) FILTER (WHERE NOT h.is_extra) > max_regular_ads_per_day()
-- ORDER BY d.d;
-- -- diharapkan: NOL baris (tidak ada hari yang sudah melewati kuota)
--
-- 4) Jalur admin TIDAK berubah — jadwal admin masih bisa dibuat seperti biasa.
--    Jalankan dari SQL Editor (claims NULL = admin), lalu ROLLBACK.
--
-- BEGIN;
--   SELECT create_ad_schedule(
--     (SELECT id FROM form_submissions WHERE distribution_type='regular'
--       AND submission_status='paid' LIMIT 1),
--     '2026-10-01T08:00:00Z'::timestamptz, '2026-10-02T08:00:00Z'::timestamptz, 1);
-- ROLLBACK;
-- -- diharapkan: mengembalikan sebuah uuid, tanpa exception
