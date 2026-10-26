-- ============================================================================
-- sql/129 — PENYEBAB JADWAL BATAL (ad_schedules.cancelled_by)
-- ============================================================================
--
-- Kartu jadwal peneliti menyebut "Tim Jakpat membatalkan tanggal tayang…"
-- (ordinal 1, `slot_cancelled`) dan "Jadwal ini dibatalkan tim kami."
-- (perpanjangan, `cancelled`) untuk SETIAP pembatalan — padahal tiga pihak
-- menulis bentuk baris yang sama (dibaca prod 26 Okt 2026):
--
--   admin      /api/admin/schedule cancel-schedule, /api/admin/stop-credit,
--              /api/admin/review, papan admin (JWT product@jakpat.net)
--   peneliti   door_cancel_schedule / door_cancel_order (klaim peneliti lewat
--              _schedule_door_act_as), PATCH browser pra-sql/124
--   otomatis   hold 60 menit habis: cron release_expired_schedule_slots
--              (perpanjangan, tanpa JWT) dan handleExpired di Jadwal & Bayar
--              (ordinal 1 bersaudara & perpanjangan, lewat pintu peneliti)
--
-- Tidak ada kolom yang membedakannya, jadi penyebabnya DICATAT SAAT TERJADI.
--
-- ── PERILAKU SESUDAH BERKAS INI ─────────────────────────────────────────────
--
--   C1  Kolom `ad_schedules.cancelled_by` text NULL, CHECK ∈ ('admin',
--       'researcher', 'expired'). NULL = belum batal, ATAU batal sebelum
--       berkas ini (pelakunya memang tidak diketahui → kartu memakai kalimat
--       netral, tidak menuduh siapa pun).
--
--   C2  Trigger BEFORE `trg_zz_cancelled_by` (nama `zz` = berjalan PALING
--       AKHIR, sesudah semua penjaga kolom; kolom ini bukan urusan mereka).
--       Kolomnya MILIK TRIGGER — nilai dari penulis mana pun diabaikan:
--         INSERT                              → NULL
--         UPDATE status masuk 'cancelled'     → dihitung (di bawah)
--         UPDATE status tetap 'cancelled'     → nilai lama dipertahankan
--         UPDATE status keluar 'cancelled'    → NULL
--       Hitungannya, berurutan:
--         1. hold peneliti sudah ≥ 55 menit (OLD.slot_booked_by = 'user')
--            → 'expired'. 55, bukan 60: handleExpired berjalan di jam
--            perangkat peneliti, yang boleh beberapa menit lebih cepat dari
--            server. Akibatnya pembatalan sengaja dalam 5 menit terakhir hold
--            terbaca "dilepas otomatis" — kalimat yang tetap benar adanya.
--         2. tanpa JWT (SQL Editor, migrasi) → 'admin'. Cron pelepas selalu
--            sudah tertangkap di langkah 1 (syaratnya hold > 60 menit).
--         3. role service_role ATAU email admin → 'admin'. Seluruh penulis
--            `cancelled` lewat service_role adalah jalur admin (lock.js
--            memakai klaim peneliti untuk batal; create-payment hanya menutup
--            `invoices`).
--         4. selebihnya → 'researcher'.
--
--   Ordinal 1 ikut tercatat: barisnya cermin yang ditulis
--   sync_ad_schedule_from_submission (AFTER, upsert). DO UPDATE SET-nya tidak
--   menyebut `cancelled_by`, dan trigger BEFORE UPDATE ini melihat OLD = cermin
--   sebelum sinkron (hold lama masih ada) dengan klaim penulis aslinya.
--
--   ⚠️ Untuk PESANAN yang batal seluruhnya (`cancelled`), kartu tetap membaca
--   `review_history` (ReviewPhase) — kolom ini hanya memilih kalimat kartu
--   JADWAL (`slot_cancelled` ordinal 1 dan perpanjangan `cancelled`).
--
--   C3  Backfill satu baris yang pelakunya pasti: #6362d67e (order uji akun
--       tegarerputra, dibatalkan peneliti lewat door_cancel_schedule saat
--       smoke test Push A 25 Okt) → 'researcher'. 27 baris batal lain
--       dibiarkan NULL.
--
-- ── URUTAN ──────────────────────────────────────────────────────────────────
--
--   Langkah 1 → 2 → 3 SEBELUM kode yang membaca `cancelled_by` dideploy.
--   ⚠️ fetchAdSchedules memilih kolom ini secara eksplisit — tanpa kolomnya
--   SELURUH kueri ditolak 400 (dashboard peneliti & papan admin kosong; pola
--   insiden sql/99). Independen dari sql/124 dan sql/128.
--   Jalankan di SQL Editor Supabase. JANGAN lewat MCP.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — PRA-CEK (baca saja)
-- ============================================================================
--
-- 1a. Kolom & trigger belum ada. Harapan: kolom = 0, trigger = 0.
--
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'ad_schedules' AND column_name = 'cancelled_by') AS kolom,
--   (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_zz_cancelled_by') AS trigger;
--
-- 1b. Tidak ada trigger BEFORE di ad_schedules yang namanya diurutkan sesudah
--     `trg_zz_…`. Harapan: 0 baris.
--
-- SELECT tgname FROM pg_trigger
-- WHERE tgrelid = 'public.ad_schedules'::regclass AND NOT tgisinternal
--   AND tgname > 'trg_zz_cancelled_by';
--
-- 1c. Baris backfill C3. Harapan: 1 baris, ordinal 1, status cancelled.
--
-- SELECT id, ordinal, status FROM public.ad_schedules
-- WHERE submission_id = '6362d67e-c029-4c1d-bf83-d79d47511536' AND ordinal = 1;


-- ============================================================================
-- LANGKAH 2 — MIGRASI (satu transaksi)
-- ============================================================================

BEGIN;

ALTER TABLE public.ad_schedules
  ADD COLUMN cancelled_by text
  CONSTRAINT ad_schedules_cancelled_by_check
  CHECK (cancelled_by IN ('admin', 'researcher', 'expired'));

COMMENT ON COLUMN public.ad_schedules.cancelled_by IS
  'Penyebab status cancelled (sql/129): admin | researcher | expired (hold 60 menit habis). NULL = belum batal, atau batal sebelum sql/129. Ditulis trg_zz_cancelled_by saja.';

-- C3 — sebelum trigger ada, supaya tidak ditimpa.
UPDATE public.ad_schedules
   SET cancelled_by = 'researcher'
 WHERE submission_id = '6362d67e-c029-4c1d-bf83-d79d47511536'
   AND ordinal = 1
   AND status = 'cancelled';

CREATE FUNCTION public.set_schedule_cancelled_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.cancelled_by := NULL;
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status, '') <> 'cancelled' THEN
    NEW.cancelled_by := NULL;
  ELSIF COALESCE(OLD.status, '') = 'cancelled' THEN
    NEW.cancelled_by := OLD.cancelled_by;
  ELSIF OLD.slot_booked_by = 'user'
        AND OLD.slot_reserved_at IS NOT NULL
        AND OLD.slot_reserved_at <= NOW() - interval '55 minutes' THEN
    NEW.cancelled_by := 'expired';
  ELSIF claims IS NULL
        OR coalesce(claims ->> 'role', '') = 'service_role'
        OR lower(coalesce(claims ->> 'email', '')) = 'product@jakpat.net' THEN
    NEW.cancelled_by := 'admin';
  ELSE
    NEW.cancelled_by := 'researcher';
  END IF;
  RETURN NEW;
END;
$function$;

-- Fungsi trigger tidak dipanggil langsung; cabut hibah bawaan pg_default_acl.
REVOKE ALL ON FUNCTION public.set_schedule_cancelled_by() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_zz_cancelled_by
  BEFORE INSERT OR UPDATE ON public.ad_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_schedule_cancelled_by();

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. Kolom, CHECK, trigger ada. Harapan: 1 | 1 | 1.
--
-- SELECT
--   (SELECT count(*) FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'ad_schedules' AND column_name = 'cancelled_by') AS kolom,
--   (SELECT count(*) FROM pg_constraint WHERE conname = 'ad_schedules_cancelled_by_check') AS cek,
--   (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_zz_cancelled_by') AS trigger;
--
-- 3b. Backfill C3 & sebaran awal. Harapan: researcher = 1, sisanya NULL.
--
-- SELECT status, cancelled_by, count(*) FROM public.ad_schedules
-- WHERE status = 'cancelled' GROUP BY 1, 2;
--
-- 3c. Uji perilaku tanpa jejak (ROLLBACK). Ganti :ext dengan id perpanjangan
--     yang BELUM batal & belum lunas (mis. order uji). Harapan: admin.
--
-- BEGIN;
-- SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- UPDATE public.ad_schedules SET status = 'cancelled' WHERE id = ':ext' RETURNING cancelled_by;
-- ROLLBACK;
--
-- 3d. Sesudah beberapa hari: pembatalan baru selalu terisi. Harapan: 0.
--
-- SELECT count(*) FROM public.ad_schedules
-- WHERE status = 'cancelled' AND cancelled_by IS NULL AND updated_at > '<waktu Langkah 2>';


-- ============================================================================
-- ROLLBACK — hanya bila perlu
-- ============================================================================
--
-- ⚠️ Revert DULU kode yang memilih `cancelled_by` (fetchAdSchedules) — tanpa
-- kolomnya seluruh kueri jadwal gagal 400.
--
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_zz_cancelled_by ON public.ad_schedules;
-- DROP FUNCTION IF EXISTS public.set_schedule_cancelled_by();
-- ALTER TABLE public.ad_schedules DROP COLUMN IF EXISTS cancelled_by;
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
