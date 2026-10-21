-- ============================================================================
-- sql/123 — SATU PINTU JADWAL, BAGIAN 1: MENAMBAH (expand)
-- ============================================================================
--
-- Rencana: ~/.claude/plans/…replicated-lantern.md (21 Okt 2026, cakupan B).
-- Pasangannya: sql/124 (MENUTUP), dijalankan SESUDAH Push A dideploy.
--
-- Berkas ini HANYA menambah. Kode `main` yang sedang live tetap berjalan
-- persis seperti sekarang sesudah berkas ini diterapkan.
--
-- ── PERILAKU SESUDAH BERKAS INI ─────────────────────────────────────────────
--
--   P1  create_ad_schedule (signature TIDAK berubah — CREATE OR REPLACE, ACL
--       ikut): badan produksi egidwis (sql/120, md5 f996e8e8…) + lima potongan
--       E1 sql/119 yang tertimpa sql/120:
--         • penolakan "order Kilat belum bisa dijadwalkan sendiri" DICABUT
--           (Kilat R8 "Pesan gelombang lagi");
--         • order Kilat, SEMUA pemanggil: jam gelombang diturunkan dari jam WIB
--           p_start_date, wajib 11/15 tepat (HINT kilat_wave_invalid); end
--           DIPAKSA start + 24 jam, duration DIPAKSA 1, kilat_slot_hour
--           DITULIS (sql/120 menulis NULL → ScheduleForm Kilat salah bentuk);
--         • cutoff 13.00 WIB tidak berlaku untuk Kilat (batasnya gelombang −
--           2 jam, ditegakkan validate_kilat_extend_claim).
--       Pemaksaan status sql/120 (peneliti selalu waiting_payment/pending,
--       SEBELUM cek kuota) TETAP, tanpa perubahan.
--
--   P2  _schedule_door_act_as(actor, email) — BARU, tak bisa dipanggil peran
--       mana pun selain pemiliknya (postgres). Memasang klaim peneliti yang
--       SUDAH diverifikasi endpoint (/auth/v1/user) untuk sisa transaksi,
--       ditambah penanda `jfu.schedule_door = 'on'`. Akibatnya setiap trigger
--       (validate_kilat_wave_claim, kuota, guard_payment_columns, penjaga
--       egidwis) menilai tulisan pintu SEBAGAI PENELITI — persis seperti PATCH
--       browser hari ini. Penanda dibaca guard_schedule_door di sql/124.
--
--   P3  door_lock_kilat_wave(actor, email, submission, ymd, hour) — BARU,
--       service_role saja. Mengunci gelombang ordinal 1 order Kilat milik
--       actor, bentuk Kilat ([ymd, ymd+1) + kilat_slot_hour + durasi 1).
--       Syarat baris: pemilik, distribution_type='kilat', belum lunas,
--       submission_status ∈ {approved, waiting_payment, slot_reserved},
--       forced_manual_reason NULL. Nol baris = galat HINT kilat_lock_not_allowed.
--
--   P4  door_create_extension(actor, email, …argumen peneliti create_ad_schedule)
--       — BARU, service_role saja. act_as lalu create_ad_schedule, jadi seluruh
--       aturan peneliti di P1 dan trigger berlaku. Memulangkan source_id.
--
--   P5  door_release_slot(actor, email, submission) — BARU, service_role saja.
--       Bagian jadwal releaseExpiredSlot: hold mandiri ('user') ordinal 1
--       dilepas, tanggal dikosongkan, payment_status 'expired'.
--
--   P6  door_cancel_schedule(actor, email, submission, source, is_extension)
--       — BARU, service_role saja. Bagian jadwal cancelSchedule: perpanjangan
--       → ad_schedules.status 'cancelled'; ordinal 1 → 'slot_cancelled' +
--       'expired'. Tanggal tetap. Tagihan & DOKU tetap di klien.
--
--   P5/P6 sengaja ikut act_as, bukan PATCH service role: service_role
--   dipercaya guard_payment_columns, jadi PATCH service role bisa membatalkan
--   order tempo `scheduled` yang hari ini ditolak untuk peneliti.
--
--   Pemanggilnya: functions/api/schedules/lock.js (aksi lock Kilat, extend,
--   release, cancel).
--
-- ── KENAPA BUKAN "trigger hanya service_role" ───────────────────────────────
--
--   service_role dipercaya SEMUA penjaga (validate_kilat_wave_claim melompati
--   jam/hari kerja/libur/H-2 jam). PATCH service role untuk Kilat = semua
--   aturan gelombang hilang. Dengan act_as, endpoint memegang kunci pintu
--   tapi DB tetap yang menilai, dengan kacamata peneliti.
--
-- ── URUTAN ──────────────────────────────────────────────────────────────────
--
--   Langkah 1 (pra-cek) → Langkah 2 (migrasi) → Langkah 3 (verifikasi) →
--   Langkah 4 (uji, selalu dibatalkan). Jalankan di SQL Editor Supabase.
--   JANGAN lewat MCP. Sesudah ini: deploy Push A, lalu sql/124.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — PRA-CEK (baca saja)
-- ============================================================================
--
-- 1a. Badan create_ad_schedule yang hidup SAMA dengan salinan di blok
--     ROLLBACK (diambil 21 Okt 2026, sesudah sql/122). Harapan: sama = true.
--
-- SELECT md5(pg_get_functiondef('public.create_ad_schedule'::regproc))
--        = 'f996e8e88b2bb76f6de2867579b6c6bc' AS sama;
--
-- 1b. Satu overload saja. Harapan: 1 baris.
--
-- SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'create_ad_schedule';
--
-- 1c. sql/122 sudah hidup, nama baru belum dipakai, auth.uid() membaca
--     request.jwt.claim.sub ATAU request.jwt.claims->>'sub' (dua-duanya
--     dipasang P2). Harapan: sql122 = 2, baru = 0, uid_baca_sub = true.
--
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'form_submissions'
--       AND column_name = 'forced_manual_reason')
--   + (SELECT count(*) FROM pg_proc WHERE proname = 'kilat_last_bookable_date') AS sql122,
--   (SELECT count(*) FROM pg_proc WHERE proname IN
--     ('_schedule_door_act_as', 'door_lock_kilat_wave', 'door_create_extension',
--      'door_release_slot', 'door_cancel_schedule')) AS baru,
--   pg_get_functiondef('auth.uid'::regproc) LIKE '%request.jwt.claim.sub%'
--     AND pg_get_functiondef('auth.uid'::regproc) LIKE '%request.jwt.claims%' AS uid_baca_sub;


-- ============================================================================
-- LANGKAH 2 — MIGRASI (satu transaksi)
-- ============================================================================

BEGIN;

-- ── 2.1 (P1) create_ad_schedule ────────────────────────────────────────────
-- Badan = produksi 21 Okt (md5 f996e8e8…) + tambalan bertanda "sql/123 (E1)".
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
  v_status            TEXT;
  v_payment_status    TEXT;
  -- sql/123 (E1): gelombang perpanjangan Kilat.
  v_kilat_hour        SMALLINT;
  v_wave_wib          TIMESTAMP;
  v_end               TIMESTAMPTZ := p_end_date;
  v_duration          INTEGER     := p_duration;
  claims              JSONB;
BEGIN
  claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;

  v_is_admin := claims IS NULL
                OR COALESCE(claims ->> 'role', '')  = 'service_role'
                OR COALESCE(claims ->> 'email', '') = 'product@jakpat.net';

  SELECT fs.distribution_type,
         review_status_of(fs.submission_status),
         fs.submission_status,
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

  -- sql/123 (E1): bentuk gelombang Kilat, untuk SEMUA pemanggil. Jam
  -- gelombang DITURUNKAN dari jam WIB p_start_date; akhir & durasi DIPAKSA.
  -- Aturan waktu peneliti (hari kerja, libur, 3 hari kerja, H-2 jam) ada di
  -- trigger validate_kilat_extend_claim.
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

  IF NOT v_is_admin THEN
    -- sql/123 (E1): penolakan Kilat untuk peneliti (sql/74) dicabut —
    -- Kilat R8 swalayan.

    IF v_review_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'create_ad_schedule: order ini belum disetujui, jadwal baru belum bisa dibuat';
    END IF;

    IF v_submission_status IN ('slot_cancelled','cancelled','rejected','spam') THEN
      RAISE EXCEPTION 'create_ad_schedule: order ini tidak aktif, jadwal baru tidak bisa dibuat';
    END IF;

    v_now_wib   := NOW() AT TIME ZONE 'Asia/Jakarta';
    v_start_ymd := (p_start_date AT TIME ZONE 'Asia/Jakarta')::date;

    -- sql/123 (E1): Kilat tidak memakai cutoff 13.00.
    IF v_distribution_type IS DISTINCT FROM 'kilat'
       AND (v_start_ymd < v_now_wib::date
            OR (v_start_ymd = v_now_wib::date AND EXTRACT(HOUR FROM v_now_wib) >= 13))
    THEN
      RAISE EXCEPTION
        'create_ad_schedule: pemesanan untuk % sudah ditutup (batas 13.00 WIB)',
        TO_CHAR(v_start_ymd, 'DD Mon YYYY');
    END IF;

    IF COALESCE(p_is_new_period, false)
       AND (COALESCE(p_prize_per_winner, 0) <= 0 OR COALESCE(p_winner_count, 0) <= 0)
    THEN
      RAISE EXCEPTION 'create_ad_schedule: jadwal ini membuka batch hadiah baru — hadiah dan jumlah pemenang wajib diisi';
    END IF;
  END IF;

  IF v_is_admin THEN
    v_booked_by   := p_slot_booked_by;
    v_reserved_at := p_slot_reserved_at;
    v_total_cost  := COALESCE(p_total_cost, 0);
    v_is_extra    := p_is_extra_ad;
  ELSE
    v_booked_by   := 'user';
    v_reserved_at := NOW();
    v_total_cost  := 0;
    v_is_extra    := false;
  END IF;

  IF v_is_extra IS NULL THEN
    SELECT a.is_extra_ad INTO v_is_extra
    FROM ad_schedules a
    WHERE a.submission_id = p_submission_id
      AND a.source_table = 'form_submissions';
  END IF;

  -- sql/120. Dipaksa SEBELUM cek kuota, supaya p_status=cancelled tidak
  -- bisa dipakai untuk melewati assert_daily_ad_quota_free lalu tetap lahir
  -- sebagai jadwal yang menunggu bayar.
  v_status := COALESCE(p_status, 'waiting_payment');
  v_payment_status := COALESCE(p_payment_status, 'pending');
  IF claims IS NOT NULL AND COALESCE(claims ->> 'role', '') <> 'service_role' THEN
    v_status := 'waiting_payment';
    v_payment_status := 'pending';
  END IF;

  IF v_status <> 'cancelled' THEN
    PERFORM assert_schedule_window_free(p_submission_id, p_start_date, v_end, v_id, true);
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
    v_status, v_review_status, v_payment_status,
    COALESCE(p_prize_per_winner, 0), COALESCE(p_winner_count, 0),
    COALESCE(p_additional_prize_per_winner, 0),
    COALESCE(p_is_new_period, false), NULL,
    v_total_cost, NULL, NULL, p_voucher_code,
    v_booked_by, v_reserved_at, p_admin_notes,
    v_distribution_type, v_kilat_hour,
    COALESCE(v_is_extra, false),
    NOW(), NOW()
  );

  PERFORM resync_ad_schedule_ordinals(p_submission_id);
  RETURN v_id;
END;
$function$;

-- ── 2.2 (P2) Kacamata peneliti untuk tulisan pintu ─────────────────────────
-- ⚠️ Hanya boleh dipanggil fungsi pintu di bawah (pemilik = postgres). Peran
-- lain yang bisa memanggilnya bisa menyamar sebagai peneliti mana pun.
CREATE FUNCTION public._schedule_door_act_as(p_actor uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_actor IS NULL OR COALESCE(btrim(p_email), '') = '' THEN
    RAISE EXCEPTION 'pintu jadwal: identitas peneliti wajib ada';
  END IF;
  -- Klaim JSON (dibaca semua penjaga) + klaim tunggal (auth.uid() membacanya
  -- lebih dulu). Semuanya LOKAL transaksi: satu permintaan PostgREST.
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_actor, 'email', lower(btrim(p_email)),
    'role', 'authenticated', 'aud', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.email', lower(btrim(p_email)), true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('jfu.schedule_door', 'on', true);
END;
$function$;

REVOKE ALL ON FUNCTION public._schedule_door_act_as(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── 2.3 (P3) Kunci gelombang Kilat ordinal 1 ───────────────────────────────
CREATE FUNCTION public.door_lock_kilat_wave(
  p_actor uuid, p_email text, p_submission_id uuid, p_ymd date, p_hour smallint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  PERFORM _schedule_door_act_as(p_actor, p_email);

  -- Bentuk = rebookSlotForSubmission Kilat (R6). Jam, hari kerja, libur,
  -- 3 hari kerja, H-2 jam, dan kuota gelombang ditegakkan trigger dengan
  -- klaim peneliti di atas — bukan di sini.
  UPDATE form_submissions fs
  SET start_date       = p_ymd,
      end_date         = p_ymd + 1,
      kilat_slot_hour  = p_hour,
      duration         = 1,
      slot_booked_by   = 'user',
      slot_reserved_at = NOW(),
      submission_status = 'waiting_payment',
      payment_status   = 'pending',
      updated_at       = NOW()
  WHERE fs.id = p_submission_id
    AND (fs.auth_user_id = p_actor
         OR (fs.auth_user_id IS NULL
             AND lower(COALESCE(fs.email, '')) = lower(btrim(p_email))))
    AND fs.distribution_type = 'kilat'
    AND COALESCE(fs.payment_status, '') NOT IN ('paid', 'completed')
    AND fs.submission_status IN ('approved', 'waiting_payment', 'slot_reserved')
    -- Order yang dialihkan ke jalur manual karena mode libur (sql/122):
    -- tanggalnya milik admin.
    AND fs.forced_manual_reason IS NULL
  RETURNING fs.id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Gelombang tidak bisa dikunci — kemungkinan order sudah lunas, dibatalkan, bukan Kilat, atau jadwalnya diatur tim Jakpat.'
      USING HINT = 'kilat_lock_not_allowed';
  END IF;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.door_lock_kilat_wave(uuid, text, uuid, date, smallint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.door_lock_kilat_wave(uuid, text, uuid, date, smallint)
  TO service_role;

-- ── 2.4 (P4) Jadwal lanjutan (Iklan "Jadwalkan lagi", Kilat R8) ────────────
-- Argumen = yang dikirim JadwalBaruPage. Sisanya (status, harga, booked_by,
-- is_extra_ad, catatan, voucher) dipaksa create_ad_schedule untuk peneliti.
CREATE FUNCTION public.door_create_extension(
  p_actor uuid, p_email text, p_submission_id uuid,
  p_start_date timestamptz, p_end_date timestamptz, p_duration integer,
  p_prize_per_winner integer, p_winner_count integer,
  p_additional_prize_per_winner integer, p_is_new_period boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM _schedule_door_act_as(p_actor, p_email);
  RETURN create_ad_schedule(
    p_submission_id => p_submission_id,
    p_start_date => p_start_date,
    p_end_date => p_end_date,
    p_duration => p_duration,
    p_prize_per_winner => COALESCE(p_prize_per_winner, 0),
    p_winner_count => COALESCE(p_winner_count, 0),
    p_additional_prize_per_winner => COALESCE(p_additional_prize_per_winner, 0),
    p_is_new_period => COALESCE(p_is_new_period, false));
END;
$function$;

REVOKE ALL ON FUNCTION public.door_create_extension(uuid, text, uuid, timestamptz, timestamptz, integer, integer, integer, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.door_create_extension(uuid, text, uuid, timestamptz, timestamptz, integer, integer, integer, integer, boolean)
  TO service_role;

-- ── 2.5 (P5) Lepas hold mandiri ordinal 1 (releaseExpiredSlot) ───────────
-- Syarat = policy "Users Update Own Submissions" + aturan hold slotHold.ts
-- (hanya slot_booked_by='user' yang lepas). Transisi status dinilai
-- guard_payment_columns sebagai peneliti (mis. 'scheduled' kredit ditolak).
-- Nol baris BUKAN galat: sudah lepas, sudah lunas, atau hold admin.
CREATE FUNCTION public.door_release_slot(p_actor uuid, p_email text, p_submission_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  PERFORM _schedule_door_act_as(p_actor, p_email);

  -- ⛔ survey_pages tidak disentuh (sql/99): trg_form_submissions_close_page
  -- menutup jendela halamannya.
  UPDATE form_submissions fs
  SET start_date        = NULL,
      end_date          = NULL,
      slot_booked_by    = NULL,
      slot_reserved_at  = NULL,
      submission_status = 'slot_reserved',
      payment_status    = 'expired',
      updated_at        = NOW()
  WHERE fs.id = p_submission_id
    AND (fs.auth_user_id = p_actor
         OR (fs.auth_user_id IS NULL
             AND lower(COALESCE(fs.email, '')) = lower(btrim(p_email))))
    AND fs.slot_booked_by = 'user'
    AND COALESCE(fs.payment_status, '') NOT IN ('paid', 'completed')
  RETURNING fs.id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.door_release_slot(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.door_release_slot(uuid, text, uuid)
  TO service_role;

-- ── 2.6 (P6) Batalkan satu jadwal (bagian jadwal cancelSchedule) ──────────
-- Perpanjangan: syarat = policy "Peneliti melepas reservasinya sendiri".
-- Ordinal 1: syarat = policy pemilik + belum lunas. Tanggal TETAP (riwayat).
-- Nol baris = NULL; pemanggil menjelaskan sebabnya (explainNoRowsCancelling).
-- Tagihan/DOKU tetap di klien — di luar cakupan pintu jadwal.
CREATE FUNCTION public.door_cancel_schedule(
  p_actor uuid, p_email text, p_submission_id uuid, p_source_id uuid, p_is_extension boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_owns boolean;
BEGIN
  PERFORM _schedule_door_act_as(p_actor, p_email);

  SELECT (fs.auth_user_id = p_actor
          OR (fs.auth_user_id IS NULL
              AND lower(COALESCE(fs.email, '')) = lower(btrim(p_email))))
    INTO v_owns
  FROM form_submissions fs WHERE fs.id = p_submission_id;
  IF NOT COALESCE(v_owns, false) THEN
    RETURN NULL;
  END IF;

  IF COALESCE(p_is_extension, false) THEN
    UPDATE ad_schedules a
    SET status           = 'cancelled',
        slot_booked_by   = NULL,
        slot_reserved_at = NULL,
        updated_at       = NOW()
    WHERE a.source_table = 'form_submissions_extend'
      AND a.source_id = p_source_id
      AND a.submission_id = p_submission_id
      AND a.slot_booked_by = 'user'
      AND COALESCE(a.payment_status, '') NOT IN ('paid', 'completed')
    RETURNING a.id INTO v_id;
  ELSE
    UPDATE form_submissions fs
    SET submission_status = 'slot_cancelled',
        payment_status    = 'expired',
        slot_booked_by    = NULL,
        slot_reserved_at  = NULL,
        updated_at        = NOW()
    WHERE fs.id = p_submission_id
      AND p_source_id = p_submission_id
      AND COALESCE(fs.payment_status, '') NOT IN ('paid', 'completed')
    RETURNING fs.id INTO v_id;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.door_cancel_schedule(uuid, text, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.door_cancel_schedule(uuid, text, uuid, uuid, boolean)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. ACL. Harapan, persis:
--       _schedule_door_act_as  → postgres saja
--       door_lock_kilat_wave   → postgres | service_role
--       door_create_extension  → postgres | service_role
--       door_release_slot      → postgres | service_role
--       door_cancel_schedule   → postgres | service_role
--       create_ad_schedule     → TIDAK berubah (postgres | authenticated |
--                                service_role) — dicabut di sql/124.
--     ⚠️ Ada `anon=` atau `authenticated=` di lima fungsi baru = BERHENTI
--     (pg_default_acl memberi keduanya ke setiap fungsi baru di public).
--
-- SELECT p.proname, array_to_string(p.proacl, ' | ') AS acl
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('_schedule_door_act_as', 'door_lock_kilat_wave',
--                     'door_create_extension', 'door_release_slot',
--                     'door_cancel_schedule', 'create_ad_schedule')
-- ORDER BY 1;
--
-- 3b. Potongan E1 hidup lagi. Harapan: tiga kolom true.
--
-- SELECT d LIKE '%v_kilat_hour := EXTRACT(HOUR FROM v_wave_wib)%'      AS gelombang,
--        d NOT LIKE '%order Kilat belum bisa dijadwalkan sendiri%'      AS kilat_swalayan,
--        d LIKE '%v_status := ''waiting_payment'';%'                    AS paksa_sql120
-- FROM (SELECT pg_get_functiondef('public.create_ad_schedule'::regproc) d) x;


-- ============================================================================
-- LANGKAH 4 — UJI. Menulis apa pun TIDAK; selalu dibatalkan.
-- ============================================================================
--
-- Matriks aturan Kilat lewat pintu diuji di PGlite dengan badan produksi
-- (Sabtu, libur, hari kerja ke-4, H-2 jam, bukan pemilik, lunas, Iklan,
-- forced_manual_reason). Di produksi cukup dua hal yang tak bisa dipalsukan
-- PGlite: hak eksekusi peran Supabase sungguhan, dan galat pintu yang rapi.
--
-- Harapan: "UJI_LULUS — 4 kasus".
--
-- BEGIN;
-- DO $uji$
-- DECLARE v_err text; v_hint text; v_n int := 0;
-- BEGIN
--   -- 1–2. authenticated & anon tidak bisa memanggil pintu.
--   FOREACH v_err IN ARRAY ARRAY['authenticated', 'anon'] LOOP
--     BEGIN
--       EXECUTE format('SET LOCAL ROLE %I', v_err);
--       PERFORM public.door_lock_kilat_wave(gen_random_uuid(), 'x@example.com',
--         gen_random_uuid(), current_date, 15::smallint);
--       RAISE EXCEPTION 'UJI_GAGAL: % bisa memanggil door_lock_kilat_wave', v_err;
--     EXCEPTION WHEN insufficient_privilege THEN
--       v_n := v_n + 1;
--     END;
--     RESET ROLE;
--   END LOOP;
--
--   -- 3. service_role bisa; order tak dikenal → galat pintu ber-HINT.
--   SET LOCAL ROLE service_role;
--   BEGIN
--     PERFORM public.door_lock_kilat_wave(gen_random_uuid(), 'x@example.com',
--       gen_random_uuid(), current_date, 15::smallint);
--     RAISE EXCEPTION 'UJI_GAGAL: order tak dikenal terkunci';
--   EXCEPTION WHEN OTHERS THEN
--     GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
--     IF v_hint IS DISTINCT FROM 'kilat_lock_not_allowed' THEN
--       RAISE EXCEPTION 'UJI_GAGAL kasus 3: %', v_err;
--     END IF;
--     v_n := v_n + 1;
--   END;
--
--   -- 4. service_role tidak bisa memanggil act_as langsung.
--   BEGIN
--     PERFORM public._schedule_door_act_as(gen_random_uuid(), 'x@example.com');
--     RAISE EXCEPTION 'UJI_GAGAL: service_role bisa memanggil _schedule_door_act_as';
--   EXCEPTION WHEN insufficient_privilege THEN
--     v_n := v_n + 1;
--   END;
--   RESET ROLE;
--
--   RAISE EXCEPTION 'UJI_LULUS — % kasus', v_n;
-- END
-- $uji$;
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK MIGRASI — hanya bila perlu. Salinan badan produksi 21 Okt 2026.
-- ============================================================================
--
-- ⚠️ Kode Push A memanggil door_*; rollback SESUDAH deploy mematikan kunci
--    gelombang Kilat & "Jadwalkan lagi". Rollback kodenya dulu.
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.door_cancel_schedule(uuid, text, uuid, uuid, boolean);
-- DROP FUNCTION IF EXISTS public.door_release_slot(uuid, text, uuid);
-- DROP FUNCTION IF EXISTS public.door_create_extension(uuid, text, uuid, timestamptz, timestamptz, integer, integer, integer, integer, boolean);
-- DROP FUNCTION IF EXISTS public.door_lock_kilat_wave(uuid, text, uuid, date, smallint);
-- DROP FUNCTION IF EXISTS public._schedule_door_act_as(uuid, text);
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
--   v_status            TEXT;
--   v_payment_status    TEXT;
--   claims              JSONB;
-- BEGIN
--   claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
--
--   v_is_admin := claims IS NULL
--                 OR COALESCE(claims ->> 'role', '')  = 'service_role'
--                 OR COALESCE(claims ->> 'email', '') = 'product@jakpat.net';
--
--   SELECT fs.distribution_type,
--          review_status_of(fs.submission_status),
--          fs.submission_status,
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
--   IF NOT v_is_admin THEN
--     IF v_distribution_type = 'kilat' THEN
--       RAISE EXCEPTION 'create_ad_schedule: order Kilat belum bisa dijadwalkan sendiri';
--     END IF;
--
--     IF v_review_status IS DISTINCT FROM 'approved' THEN
--       RAISE EXCEPTION 'create_ad_schedule: order ini belum disetujui, jadwal baru belum bisa dibuat';
--     END IF;
--
--     IF v_submission_status IN ('slot_cancelled','cancelled','rejected','spam') THEN
--       RAISE EXCEPTION 'create_ad_schedule: order ini tidak aktif, jadwal baru tidak bisa dibuat';
--     END IF;
--
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
--     IF COALESCE(p_is_new_period, false)
--        AND (COALESCE(p_prize_per_winner, 0) <= 0 OR COALESCE(p_winner_count, 0) <= 0)
--     THEN
--       RAISE EXCEPTION 'create_ad_schedule: jadwal ini membuka batch hadiah baru — hadiah dan jumlah pemenang wajib diisi';
--     END IF;
--   END IF;
--
--   IF v_is_admin THEN
--     v_booked_by   := p_slot_booked_by;
--     v_reserved_at := p_slot_reserved_at;
--     v_total_cost  := COALESCE(p_total_cost, 0);
--     v_is_extra    := p_is_extra_ad;
--   ELSE
--     v_booked_by   := 'user';
--     v_reserved_at := NOW();
--     v_total_cost  := 0;
--     v_is_extra    := false;
--   END IF;
--
--   IF v_is_extra IS NULL THEN
--     SELECT a.is_extra_ad INTO v_is_extra
--     FROM ad_schedules a
--     WHERE a.submission_id = p_submission_id
--       AND a.source_table = 'form_submissions';
--   END IF;
--
--   -- sql/120. Dipaksa SEBELUM cek kuota, supaya p_status=cancelled tidak
--   -- bisa dipakai untuk melewati assert_daily_ad_quota_free lalu tetap lahir
--   -- sebagai jadwal yang menunggu bayar.
--   v_status := COALESCE(p_status, 'waiting_payment');
--   v_payment_status := COALESCE(p_payment_status, 'pending');
--   IF claims IS NOT NULL AND COALESCE(claims ->> 'role', '') <> 'service_role' THEN
--     v_status := 'waiting_payment';
--     v_payment_status := 'pending';
--   END IF;
--
--   IF v_status <> 'cancelled' THEN
--     PERFORM assert_schedule_window_free(p_submission_id, p_start_date, p_end_date, v_id, true);
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
--     v_status, v_review_status, v_payment_status,
--     COALESCE(p_prize_per_winner, 0), COALESCE(p_winner_count, 0),
--     COALESCE(p_additional_prize_per_winner, 0),
--     COALESCE(p_is_new_period, false), NULL,
--     v_total_cost, NULL, NULL, p_voucher_code,
--     v_booked_by, v_reserved_at, p_admin_notes,
--     v_distribution_type, NULL,
--     COALESCE(v_is_extra, false),
--     NOW(), NOW()
--   );
--
--   PERFORM resync_ad_schedule_ordinals(p_submission_id);
--   RETURN v_id;
-- END;
-- $function$;
--
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
--
-- Verifikasi rollback: md5 kembali 'f996e8e88b2bb76f6de2867579b6c6bc' (Langkah 1a).
