-- ============================================================
-- Migrasi 74: RPC `create_ad_schedule()` — pengganti INSERT lewat view
--
-- Langkah *contract* Task 11, bagian kedua. `sql/73` sudah memindahkan seluruh
-- fungsi DB dari view `form_submissions_extend`; berkas ini memindahkan satu-
-- satunya jalur TULIS yang tersisa di sisi aplikasi: `ScheduleForm.handleSaveCreate`
-- yang hari ini melakukan `.from('form_submissions_extend').insert([...])`.
--
-- ── Kenapa RPC, bukan `.insert()` langsung ke ad_schedules ─────────────────
--
-- Trigger `INSTEAD OF INSERT` view (`extend_view_insert`) mengerjakan LIMA aturan,
-- bukan sekadar menyalin kolom:
--
--   1. menurunkan `distribution_type` + `review_status` dari order induk
--   2. MEWARISI `is_extra_ad` dari jadwal ordinal 1 saat NULL — komentarnya
--      sendiri menyebut default `false` sebagai regresi yang tak terlihat
--      sampai kolam iklan reguler kelebihan jual
--   3. memanggil `assert_schedule_window_free` (kecuali jadwal batal)
--   4. memetakan `is_new_month` → `is_new_period`
--   5. memanggil `resync_ad_schedule_ordinals` sesudah menyisipkan
--
-- Mengubah pemanggilnya jadi `.insert()` polos memindahkan kelimanya ke
-- TypeScript, tempat ia akan menyimpang. RPC ini menahannya tetap di DB.
--
-- ── Wewenang: LEBIH KETAT dari view yang digantikannya ────────────────────
--
-- View memberi grant INSERT ke `authenticated` dan trigger-nya SECURITY DEFINER
-- milik `postgres` tanpa satu pun cek kepemilikan — jadi ia jalan tulis yang
-- MELEWATI RLS `ad_schedules` (yang untuk `authenticated` hanya punya policy
-- SELECT). Itu lubang yang lahir bersama `sql/52`; ia ditutup saat view di-DROP
-- (`sql/75`), dan RPC ini sengaja TIDAK mewarisinya.
--
-- Gerbangnya `service_role` atau admin, mengikuti pola `guard_extend_payment_columns`.
-- Terukur 2026-08-30: jalur create memang admin-only — satu-satunya pemanggil
-- `mode="create"` adalah `SubmissionDetailSheet` (dashboard admin).
-- `RescheduleDialog` hanya `mode="edit"`. Kalau Phase 4 kelak membuka
-- penjadwalan swalayan, pelebarannya dilakukan SADAR di sini.
--
-- Idempoten: `CREATE OR REPLACE`. Nol perubahan skema, nol perubahan data.
-- ============================================================

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
  p_voucher_code                 text    DEFAULT NULL
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
  v_is_extra          BOOLEAN;
  claims              JSONB;
BEGIN
  -- ── Gerbang wewenang ────────────────────────────────────────────────────
  -- claims NULL = koneksi tanpa JWT (pg_cron, psql pemilik, migrasi). Itu
  -- pintu resmi yang sama seperti guard_payment_columns() sql/33.
  claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  IF claims IS NOT NULL
     AND COALESCE(claims ->> 'role', '')  <> 'service_role'
     AND COALESCE(claims ->> 'email', '') <> 'product@jakpat.net'
  THEN
    RAISE EXCEPTION 'create_ad_schedule: hanya admin yang boleh membuat jadwal';
  END IF;

  SELECT fs.distribution_type, review_status_of(fs.submission_status)
    INTO v_distribution_type, v_review_status
  FROM form_submissions fs WHERE fs.id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_ad_schedule: order % tidak ditemukan', p_submission_id;
  END IF;

  -- Tidak disebut = MEWARISI ordinal 1, bukan false. Lihat catatan no. 2 di header.
  v_is_extra := p_is_extra_ad;
  IF v_is_extra IS NULL THEN
    SELECT a.is_extra_ad INTO v_is_extra
    FROM ad_schedules a
    WHERE a.submission_id = p_submission_id
      AND a.source_table = 'form_submissions';
  END IF;

  IF COALESCE(p_status, 'waiting_payment') <> 'cancelled' THEN
    PERFORM assert_schedule_window_free(p_submission_id, p_start_date, p_end_date, v_id, true);
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
    COALESCE(p_total_cost, 0), NULL, NULL, p_voucher_code,
    p_slot_booked_by, NULL, p_admin_notes,
    v_distribution_type, NULL,
    COALESCE(v_is_extra, false),
    NOW(), NOW()
  );

  PERFORM resync_ad_schedule_ordinals(p_submission_id);

  -- Mengembalikan `source_id`, BUKAN `ad_schedules.id` — itulah nilai yang
  -- dulu dibaca pemanggil sebagai `form_submissions_extend.id`, dan yang
  -- dipakai `invoices.extend_id` / `transactions.extend_id`.
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_ad_schedule(uuid, timestamptz, timestamptz, integer, integer, integer, integer, boolean, text, text, integer, text, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_ad_schedule(uuid, timestamptz, timestamptz, integer, integer, integer, integer, boolean, text, text, integer, text, boolean, text, text) TO authenticated, service_role;

-- ============================================
-- Verifikasi
-- ============================================
--
-- (1) Ada dan bisa dipanggil peran yang benar:
--   SELECT proname, pg_get_userbyid(proowner) AS pemilik, prosecdef AS security_definer
--   FROM pg_proc WHERE proname = 'create_ad_schedule';
--
-- (2) Gerbang wewenang menolak non-admin — jalankan DI DALAM transaksi lalu ROLLBACK:
--   BEGIN;
--     SET LOCAL request.jwt.claims = '{"role":"authenticated","email":"bukan@admin.com"}';
--     SELECT create_ad_schedule('<uuid order>', now(), now() + interval '1 day', 1);
--     -- harapan: ERROR 'hanya admin yang boleh membuat jadwal'
--   ROLLBACK;
--
-- (3) Paritas perilaku dengan extend_view_insert — buat satu jadwal lewat RPC
--     pada order yang jadwal ordinal 1-nya `is_extra_ad = true`, TANPA menyebut
--     p_is_extra_ad. Harapan: baris baru ikut `is_extra_ad = true` (warisan),
--     bukan false. Ini aturan yang paling mudah hilang saat dipindah.
