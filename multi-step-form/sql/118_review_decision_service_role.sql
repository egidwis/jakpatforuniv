-- ============================================================================
-- sql/118 — KEPUTUSAN REVIEW PRODUCT HANYA LEWAT service_role
-- ============================================================================
--
-- Sesudah /api/admin/review hidup. Akun product@jakpat.net tidak lagi boleh
-- mengubah submission_status keputusan review, admin_notes, atau
-- review_history lewat PostgREST.
--
-- ⚠️ JANGAN DIJALANKAN SEBELUM function Cloudflare sudah di-deploy dan dicoba:
--   setujui, tolak, batalkan, reset ke in_review, dan tandai spam
--   (masing-masing POST /api/admin/review 200).
--
-- Yang tetap dari browser:
--   Pemilik baris (peneliti): batal sendiri, ajukan review ulang, jadwalkan
--   ulang (approved), dan tulis riwayat miliknya.
--   Product: kolom lain (tanggal, kriteria, harga belum lunas, slot_reserved).
--   sql/113 tetap menolak lompatan ke paid|scheduled|live|completed.
--
-- Jalankan APPLY utuh. Jangan lewat MCP.
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT tgname
FROM pg_trigger
WHERE tgname = 'trg_guard_review_decision'
  AND NOT tgisinternal;

-- ── APPLY ──────────────────────────────────────────────────────────────────
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_review_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  claims jsonb;
  jwt_role text;
  jwt_email text;
  is_owner boolean;
  review_status_changed boolean;
  notes_changed boolean;
  history_changed boolean;
BEGIN
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  IF claims IS NULL THEN
    RETURN NEW;
  END IF;

  jwt_role := coalesce(claims ->> 'role', '');
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  review_status_changed :=
    NEW.submission_status IS DISTINCT FROM OLD.submission_status
    AND NEW.submission_status IN ('approved', 'rejected', 'cancelled', 'in_review', 'spam');
  notes_changed := NEW.admin_notes IS DISTINCT FROM OLD.admin_notes;
  history_changed := NEW.review_history IS DISTINCT FROM OLD.review_history;

  IF NOT review_status_changed AND NOT notes_changed AND NOT history_changed THEN
    RETURN NEW;
  END IF;

  jwt_email := lower(coalesce(claims ->> 'email', ''));
  is_owner := NEW.auth_user_id = auth.uid()
    OR (NEW.auth_user_id IS NULL AND lower(coalesce(NEW.email, '')) = jwt_email AND jwt_email <> '');
  IF is_owner THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'keputusan review hanya boleh diubah pemilik baris atau service_role';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_review_decision ON public.form_submissions;
CREATE TRIGGER trg_guard_review_decision
  BEFORE UPDATE ON public.form_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_review_decision();

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT pg_get_functiondef('public.guard_review_decision()'::regprocedure)
  ILIKE '%service_role%' AS mengenal_service_role;
-- Harus true.

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_guard_review_decision ON public.form_submissions;
-- DROP FUNCTION IF EXISTS public.guard_review_decision();
-- COMMIT;
