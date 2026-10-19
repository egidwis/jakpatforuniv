-- ============================================================================
-- sql/119 — KRITERIA, HARGA, DAN TANGGAL ORDER HANYA LEWAT service_role
-- ============================================================================
--
-- Sesudah /api/admin/order dan /api/admin/schedule hidup.
-- Akun product@jakpat.net tidak lagi boleh mengubah kolom di bawah lewat
-- PostgREST. Pemilik baris (peneliti) tetap boleh, termasuk mengosongkan
-- tanggal saat menjadwalkan ulang.
--
-- ⚠️ JANGAN DIJALANKAN SEBELUM function Cloudflare sudah di-deploy dan dicoba:
--   simpan kriteria, ubah jumlah soal / hadiah, pindah tanggal, buat jadwal,
--   pindah kolam kuota (masing-masing 200).
--
-- sql/113 tidak diubah. Penjaga ini menambah kolom yang sebelumnya masih
-- terbuka selama order belum lunas.
--
-- create_ad_schedule TIDAK dicabut dari authenticated: peneliti membuat
-- jadwal baru lewat RPC itu. set_schedule_extra_ad hanya dipakai Product.
--
-- Jalankan APPLY utuh. Jangan lewat MCP.
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT tgname
FROM pg_trigger
WHERE tgname = 'trg_guard_product_order_fields'
  AND NOT tgisinternal;

-- ── APPLY ──────────────────────────────────────────────────────────────────
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_product_order_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  claims jsonb;
  jwt_role text;
  jwt_email text;
  is_owner boolean;
  touched boolean;
BEGIN
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  IF claims IS NULL THEN
    RETURN NEW;
  END IF;

  jwt_role := coalesce(claims ->> 'role', '');
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  touched :=
    NEW.criteria_responden IS DISTINCT FROM OLD.criteria_responden
    OR NEW.question_count IS DISTINCT FROM OLD.question_count
    OR NEW.duration IS DISTINCT FROM OLD.duration
    OR NEW.prize_per_winner IS DISTINCT FROM OLD.prize_per_winner
    OR NEW.winner_count IS DISTINCT FROM OLD.winner_count
    OR NEW.total_cost IS DISTINCT FROM OLD.total_cost
    OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.ppn_amount IS DISTINCT FROM OLD.ppn_amount
    OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date
    OR NEW.airing_hour_wib IS DISTINCT FROM OLD.airing_hour_wib
    OR NEW.airing_minute_wib IS DISTINCT FROM OLD.airing_minute_wib
    OR NEW.kilat_slot_hour IS DISTINCT FROM OLD.kilat_slot_hour
    OR NEW.distribution_type IS DISTINCT FROM OLD.distribution_type;
  IF NOT touched THEN
    RETURN NEW;
  END IF;

  jwt_email := lower(coalesce(claims ->> 'email', ''));
  is_owner := NEW.auth_user_id = auth.uid()
    OR (NEW.auth_user_id IS NULL AND lower(coalesce(NEW.email, '')) = jwt_email AND jwt_email <> '');
  IF is_owner THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'kolom order ini hanya boleh diubah pemilik baris atau service_role';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_product_order_fields ON public.form_submissions;
CREATE TRIGGER trg_guard_product_order_fields
  BEFORE UPDATE ON public.form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_product_order_fields();

REVOKE ALL ON FUNCTION public.set_schedule_extra_ad(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_schedule_extra_ad(uuid, boolean) TO service_role;

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT pg_get_functiondef('public.guard_product_order_fields()'::regprocedure)
  ILIKE '%service_role%' AS mengenal_service_role;
-- Harus true.

SELECT has_function_privilege(
  'authenticated',
  'public.set_schedule_extra_ad(uuid, boolean)',
  'EXECUTE'
) AS authenticated_masih_boleh;
-- Harus false.

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_guard_product_order_fields ON public.form_submissions;
-- DROP FUNCTION IF EXISTS public.guard_product_order_fields();
-- GRANT EXECUTE ON FUNCTION public.set_schedule_extra_ad(uuid, boolean) TO authenticated;
-- COMMIT;
