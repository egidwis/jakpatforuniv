-- ============================================================================
-- sql/113 — KOLOM UANG HANYA BOLEH DITULIS service_role
-- ============================================================================
--
-- Tahap 1 pelunasan manual. Sesudah layar memanggil
-- /api/admin/manual-payment (service_role), JWT product@jakpat.net tidak
-- lagi boleh mengubah status lunas dari browser.
--
-- ⚠️ JANGAN DIJALANKAN SEBELUM function Cloudflare-nya hidup di produksi.
-- Kalau trigger ini dipasang lebih dulu, "Tandai Lunas" di internal dash
-- gagal: browser masih menulis langsung dan penjaga ini menolaknya.
--
-- Yang tetap boleh dari browser: batal/kedaluwarsa tagihan yang BELUM lunas,
-- edit jadwal yang tidak menyentuh kolom uang, cron (tanpa JWT), SQL Editor.
--
-- Jalankan APPLY utuh. Jangan lewat MCP.
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT proname
FROM pg_proc
WHERE proname IN ('guard_payment_columns', 'guard_extend_payment_columns');

-- ── APPLY ──────────────────────────────────────────────────────────────────
BEGIN;

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

CREATE OR REPLACE FUNCTION public.guard_extend_payment_columns()
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

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.total_cost IS DISTINCT FROM OLD.total_cost
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.ppn_amount IS DISTINCT FROM OLD.ppn_amount THEN
    RAISE EXCEPTION 'payment columns on an extension schedule can only be changed by service_role';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_paid_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  claims jsonb;
  jwt_role text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  IF claims IS NULL THEN
    RETURN NEW;
  END IF;

  jwt_role := coalesce(claims ->> 'role', '');
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('paid', 'completed', 'settled')
     OR OLD.status IN ('paid', 'completed', 'settled') THEN
    RAISE EXCEPTION 'status lunas pada % hanya boleh diubah service_role', TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_invoice_paid_status ON public.invoices;
CREATE TRIGGER trg_guard_invoice_paid_status
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_paid_status_transition();

DROP TRIGGER IF EXISTS trg_guard_transaction_paid_status ON public.transactions;
CREATE TRIGGER trg_guard_transaction_paid_status
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_paid_status_transition();

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT pg_get_functiondef('public.guard_payment_columns()'::regprocedure)
  ILIKE '%product@jakpat.net%' AS form_masih_meloloskan_product;
-- Harus false.

SELECT tgname, relname
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE tgname IN ('trg_guard_invoice_paid_status', 'trg_guard_transaction_paid_status');
-- Harus 2 baris.

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Jalankan ulang badan fungsi di sql/34_add_ppn_columns.sql (baris
-- guard_payment_columns dan guard_extend_payment_columns) supaya email
-- product@jakpat.net kembali diloloskan, lalu:
-- DROP TRIGGER IF EXISTS trg_guard_invoice_paid_status ON public.invoices;
-- DROP TRIGGER IF EXISTS trg_guard_transaction_paid_status ON public.transactions;
-- DROP FUNCTION IF EXISTS public.guard_paid_status_transition();
