-- ============================================================================
-- sql/120 — BOOKING JADWAL TIDAK BISA MENULIS STATUS LUNAS
-- ============================================================================
--
-- Halaman "Lock This Date" menulis form_submissions jadi waiting_payment +
-- payment pending. sql/113 sudah menolak ubah itu jadi paid/scheduled/live.
-- Yang bolong ada di RPC create_ad_schedule (jadwal ke-2, Jadwal Baru):
-- p_status dan p_payment_status masuk apa adanya pada INSERT, sementara
-- penjaga uang ad_schedules hanya BEFORE UPDATE. Peneliti bisa memanggil
-- RPC dengan p_status=scheduled dan p_payment_status=paid, lalu cron
-- menayangkannya tanpa DOKU.
--
-- Berkas ini memaksa dua kolom itu ke waiting_payment / pending untuk setiap
-- pemanggil yang bukan service_role dan bukan koneksi tanpa JWT (SQL Editor,
-- cron). product@ ikut dipaksa: pelunasan tidak lewat RPC ini. Function
-- admin tetap service_role, jadi buat jadwal dari internal dashboard tidak
-- berubah.
--
-- Tambahan: INSERT form_submissions tidak lagi boleh lahir dengan
-- submission_status paid/scheduled/live/completed. sql/113 sebelumnya hanya
-- memaksa payment_status=pending.
--
-- ⚠️ DRY-RUN harus dua-duanya true sebelum APPLY. Kalau badan fungsi di
-- produksi bukan sql/88 (16 argumen + kalimat "order ini tidak aktif"),
-- JANGAN APPLY — kabari dulu.
--
-- Jalankan APPLY utuh. Jangan lewat MCP. Boleh dijalankan tanpa deploy baru:
-- layar peneliti sudah mengirim default waiting_payment / pending.
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT p.pronargs = 16 AS enam_belas_argumen,
       pg_get_functiondef(p.oid) ILIKE '%order ini tidak aktif%' AS badan_masih_sql_88
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'create_ad_schedule';
-- Harus satu baris, keduanya true.

SELECT pg_get_functiondef('public.guard_payment_columns()'::regprocedure)
  ILIKE '%payment_status can only be set to pending/expired/failed%' AS penjaga_masih_sql_113;
-- Harus true.

-- ── APPLY ──────────────────────────────────────────────────────────────────
BEGIN;

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
  v_status            TEXT;
  v_payment_status    TEXT;
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

  IF NOT v_is_admin THEN
    IF v_distribution_type = 'kilat' THEN
      RAISE EXCEPTION 'create_ad_schedule: order Kilat belum bisa dijadwalkan sendiri';
    END IF;

    IF v_review_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'create_ad_schedule: order ini belum disetujui, jadwal baru belum bisa dibuat';
    END IF;

    IF v_submission_status IN ('slot_cancelled','cancelled','rejected','spam') THEN
      RAISE EXCEPTION 'create_ad_schedule: order ini tidak aktif, jadwal baru tidak bisa dibuat';
    END IF;

    v_now_wib   := NOW() AT TIME ZONE 'Asia/Jakarta';
    v_start_ymd := (p_start_date AT TIME ZONE 'Asia/Jakarta')::date;

    IF v_start_ymd < v_now_wib::date
       OR (v_start_ymd = v_now_wib::date AND EXTRACT(HOUR FROM v_now_wib) >= 13)
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
    PERFORM assert_schedule_window_free(p_submission_id, p_start_date, p_end_date, v_id, true);
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
    v_status, v_review_status, v_payment_status,
    COALESCE(p_prize_per_winner, 0), COALESCE(p_winner_count, 0),
    COALESCE(p_additional_prize_per_winner, 0),
    COALESCE(p_is_new_period, false), NULL,
    v_total_cost, NULL, NULL, p_voucher_code,
    v_booked_by, v_reserved_at, p_admin_notes,
    v_distribution_type, NULL,
    COALESCE(v_is_extra, false),
    NOW(), NOW()
  );

  PERFORM resync_ad_schedule_ordinals(p_submission_id);
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_schedule_airing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  claims jsonb;
  jwt_role text;
BEGIN
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  IF claims IS NULL THEN
    RETURN NEW;
  END IF;

  jwt_role := coalesce(claims ->> 'role', '');
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_status IN ('paid', 'completed')
       OR NEW.status IN ('paid', 'scheduled', 'live', 'completed') THEN
      RAISE EXCEPTION 'jadwal baru tidak boleh lahir lunas atau tayang';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('paid', 'scheduled', 'live', 'completed') THEN
    RAISE EXCEPTION 'status tayang hanya boleh diubah service_role';
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NEW.payment_status IN ('paid', 'completed') THEN
    RAISE EXCEPTION 'payment_status lunas hanya boleh diubah service_role';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_schedules_guard_airing ON public.ad_schedules;
CREATE TRIGGER trg_ad_schedules_guard_airing
  BEFORE INSERT OR UPDATE ON public.ad_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_schedule_airing_columns();

CREATE OR REPLACE FUNCTION public.guard_payment_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  claims jsonb;
  jwt_role text;
BEGIN
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  IF claims IS NULL THEN
    RETURN NEW;
  END IF;

  jwt_role := coalesce(claims ->> 'role', '');
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.payment_status := 'pending';
    IF NEW.submission_status IN ('paid', 'scheduled', 'live', 'completed') THEN
      RAISE EXCEPTION 'submission_status % tidak boleh ditulis saat order dibuat', NEW.submission_status;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF OLD.payment_status IN ('paid', 'completed') THEN
      RAISE EXCEPTION 'payment_status of a paid submission can only be changed by service_role';
    END IF;
    IF NEW.payment_status NOT IN ('pending', 'expired', 'failed') THEN
      RAISE EXCEPTION 'payment_status can only be set to pending/expired/failed by a user (got %)', NEW.payment_status;
    END IF;
  END IF;

  IF NEW.submission_status IS DISTINCT FROM OLD.submission_status THEN
    IF NEW.submission_status IN ('paid', 'scheduled', 'live', 'completed')
       OR OLD.submission_status IN ('paid', 'scheduled', 'live', 'completed') THEN
      RAISE EXCEPTION 'submission_status transition % -> % requires service_role', OLD.submission_status, NEW.submission_status;
    END IF;
  END IF;

  IF (NEW.total_cost IS DISTINCT FROM OLD.total_cost
      OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.ppn_amount IS DISTINCT FROM OLD.ppn_amount)
     AND OLD.payment_status IN ('paid', 'completed') THEN
    RAISE EXCEPTION 'total_cost / subtotal / ppn_amount are frozen once the submission is paid';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT pg_get_functiondef('public.create_ad_schedule(uuid,timestamptz,timestamptz,integer,integer,integer,integer,boolean,text,text,integer,text,boolean,text,text,timestamptz)'::regprocedure)
  ILIKE '%v_status := ''waiting_payment''%' AS memaksa_menunggu_bayar;
-- Harus true.

SELECT tgname
FROM pg_trigger
WHERE tgname = 'trg_ad_schedules_guard_airing'
  AND NOT tgisinternal;
-- Harus satu baris.

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_ad_schedules_guard_airing ON public.ad_schedules;
-- DROP FUNCTION IF EXISTS public.guard_schedule_airing_columns();
-- Jalankan ulang badan create_ad_schedule dari sql/88 (CREATE OR REPLACE
-- sampai END; $function$;) dan badan guard_payment_columns dari sql/113.
-- COMMIT;
