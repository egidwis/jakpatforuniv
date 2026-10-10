-- ============================================================================
-- sql/116 — "HENTIKAN TAYANG" JADWAL KREDIT LEWAT service_role
-- ============================================================================
--
-- MASALAH
-- sql/113 menolak setiap JWT non-service_role yang mengubah submission_status
-- dari/ke paid|scheduled|live|completed. Jadwal kredit (tayang sebelum lunas,
-- sql/102) berstatus `scheduled`/`live` padahal belum lunas, jadi
-- "Hentikan Tayang"/"Batalkan" admin (cancelSchedule di browser) kini ditolak
-- di tulisan statusnya: scheduled -> slot_cancelled. Di jalur pra-tayang
-- tagihannya sudah lebih dulu dimatikan, sehingga hasilnya iklan TETAP tayang
-- TANPA tagihan (FJJZ5DK5, 9 Okt 08:19:43Z).
--
-- PERBAIKAN — keamanan TIDAK diturunkan
-- sql/113 tidak disentuh. Satu-satunya kemampuan baru: MENGURANGI tayang
-- (scheduled|live -> slot_cancelled) pada jadwal ordinal 1 yang KREDIT dan
-- BELUM LUNAS. Kemampuan ini tidak pernah memberi tayang dan tidak pernah
-- menandai lunas. Hanya service_role yang bisa memanggilnya; function
-- Cloudflare /api/admin/stop-credit memverifikasi token admin dulu (pola yang
-- sama dengan /api/admin/mark-on-credit).
--
-- Mode ditegakkan di server, bukan dipercaya dari browser:
--   stop_aired         start_date <= now(). Status saja → utang TETAP (K6).
--   cancel_before_air  start_date >  now(). Juga payment_status='expired' dan
--                      slot dilepas — persis jalur pra-tayang cancelSchedule.
--   Tidak cocok → 'mode_mismatch' (nol tulisan).
--
-- PENGETATAN SEKALIAN
-- mark_schedules_on_credit masih bisa di-EXECUTE `authenticated` (sisa
-- sql/102). Sejak c89472a satu-satunya pemanggil produksinya adalah
-- /api/admin/mark-on-credit (service_role). Hak itu dicabut.
--
-- URUTAN: terapkan berkas ini SEBELUM kode yang memanggil /api/admin/stop-credit
-- di-push (push main = deploy otomatis). Pencabutan hak aman diterapkan kapan
-- pun: kode produksi sudah lewat function.
--
-- Jalankan blok demi blok di SQL Editor. JANGAN lewat MCP.
-- ============================================================================


-- ── 1. DRY-RUN ─────────────────────────────────────────────────────────────
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proacl::text
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('stop_credit_schedule', 'mark_schedules_on_credit');
-- Harapan: 1 baris saja — mark_schedules_on_credit | p_schedule_ids uuid[], p_note text |
-- {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}.
-- stop_credit_schedule belum ada.


-- ── 2. APPLY ───────────────────────────────────────────────────────────────
BEGIN;

CREATE OR REPLACE FUNCTION public.stop_credit_schedule(p_schedule_id uuid, p_mode text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_sched  record;
  v_sub    record;
  v_aired  boolean;
BEGIN
  -- Lapis kedua di samping hibah EXECUTE: JWT apa pun selain service_role
  -- ditolak walau hibahnya kelak terbuka tanpa sengaja (memori
  -- anon-default-acl). Tanpa klaim = SQL Editor / cron → boleh.
  IF v_claims IS NOT NULL AND coalesce(v_claims ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Hanya service_role yang bisa menghentikan jadwal kredit.';
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('stop_aired', 'cancel_before_air') THEN
    RAISE EXCEPTION 'Mode tidak dikenal: %', p_mode;
  END IF;

  -- Urutan kunci sama dengan mark_schedules_on_credit: ad_schedules dulu,
  -- lalu form_submissions.
  SELECT a.id, a.source_table, a.source_id, a.start_date, a.air_on_credit_at
    INTO v_sched
    FROM ad_schedules a
   WHERE a.id = p_schedule_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- Perpanjangan (ordinal >= 2) tidak lewat sini: tulisan status
  -- ad_schedules-nya tidak diblokir sql/113, jalur browser tetap berlaku.
  IF v_sched.source_table IS DISTINCT FROM 'form_submissions'
     OR v_sched.air_on_credit_at IS NULL THEN
    RETURN 'not_credit';
  END IF;

  SELECT fs.submission_status, fs.payment_status
    INTO v_sub
    FROM form_submissions fs
   WHERE fs.id = v_sched.source_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- Pembayaran bisa mendarat lewat webhook tepat saat admin mengklik.
  IF coalesce(v_sub.payment_status, '') IN ('paid', 'completed') THEN
    RETURN 'already_paid';
  END IF;

  IF coalesce(v_sub.submission_status, '') NOT IN ('scheduled', 'live') THEN
    RETURN 'not_eligible';
  END IF;

  v_aired := v_sched.start_date IS NOT NULL AND v_sched.start_date <= now();
  IF v_aired IS DISTINCT FROM (p_mode = 'stop_aired') THEN
    RETURN 'mode_mismatch';
  END IF;

  IF p_mode = 'stop_aired' THEN
    -- K6: utang tetap penuh. payment_status tetap 'pending', tagihan tempo
    -- tidak disentuh. trg_form_submissions_close_page menutup halamannya.
    UPDATE form_submissions
       SET submission_status = 'slot_cancelled',
           updated_at        = now()
     WHERE id = v_sched.source_id;
  ELSE
    -- Iklannya tidak pernah diterima: porsinya keluar dari tagihan. Baris
    -- transactions/invoices ditutup browser sesudahnya (diizinkan sql/113).
    UPDATE form_submissions
       SET submission_status = 'slot_cancelled',
           payment_status    = 'expired',
           slot_booked_by    = NULL,
           slot_reserved_at  = NULL,
           updated_at        = now()
     WHERE id = v_sched.source_id;
  END IF;

  RETURN 'ok';
END;
$function$;

-- pg_default_acl memberi anon DAN authenticated ke setiap fungsi baru;
-- REVOKE FROM PUBLIC saja tidak mencabutnya.
REVOKE ALL ON FUNCTION public.stop_credit_schedule(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stop_credit_schedule(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mark_schedules_on_credit(uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_schedules_on_credit(uuid[], text) TO service_role;

COMMIT;


-- ── 3. VERIFY ──────────────────────────────────────────────────────────────
SELECT p.proname, p.proacl::text
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND p.proname IN ('stop_credit_schedule', 'mark_schedules_on_credit')
 ORDER BY 1;
-- Harapan: 2 baris, KEDUANYA persis {postgres=X/postgres,service_role=X/postgres}
-- — tanpa anon, tanpa authenticated.

-- 3b. Admin dari browser DITOLAK (jalankan 4 baris ini bersama):
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","email":"product@jakpat.net"}', true);
SELECT public.stop_credit_schedule(gen_random_uuid(), 'stop_aired');
-- Harapan: ERROR permission denied for function stop_credit_schedule.
-- Lalu jalankan:
ROLLBACK;

-- 3c. service_role DITERIMA (jalankan 4 baris ini bersama):
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT public.stop_credit_schedule(gen_random_uuid(), 'stop_aired') AS hasil;
-- Harapan: hasil = not_found (uuid acak) — artinya bisa dipanggil.
ROLLBACK;


-- ── 4. ROLLBACK ────────────────────────────────────────────────────────────
-- Sebelum me-rollback, pastikan kode yang memanggil /api/admin/stop-credit
-- belum/tidak lagi dideploy — kalau tidak, "Hentikan Tayang" kredit kembali
-- gagal seperti 9 Okt.
--
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.stop_credit_schedule(uuid, text);
-- GRANT EXECUTE ON FUNCTION public.mark_schedules_on_credit(uuid[], text) TO authenticated;
-- COMMIT;
