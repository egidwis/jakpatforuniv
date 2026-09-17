-- ============================================================================
-- 91. Peneliti boleh MENCATAT sebab kegagalan Cancel Order pada tagihannya
-- ============================================================================
--
-- MASALAHNYA — lapis KEDUA dari kegagalan senyap yang ditemukan 2026-09-17.
--
-- Saat peneliti membatalkan jadwalnya (jalur baru Phase 4), `cancelSchedule()`
-- memanggil Cancel Order DOKU lebih dulu. Kalau gagal, `recordDokuCancelError()`
-- (`supabase.ts`) menyimpan sebabnya ke `invoices.doku_cancel_last_error`.
--
-- Tapi `invoices` hanya punya SATU policy UPDATE:
--
--     Admin Update Invoices → auth.jwt() ->> 'email' = 'product@jakpat.net'
--
-- Peneliti bisa MEMBACA `invoices` (policy `Users Select Invoices`) tetapi tidak
-- bisa menulisnya. Jadi pencatatannya ditolak RLS — nol baris, tanpa exception,
-- tanpa jejak. Terukur: ketiga tagihan uji 17 Sep punya
-- `doku_cancel_last_error = NULL` padahal Cancel Order jelas tidak berhasil.
--
-- Itu membuat lapis PERTAMA (gerbang admin 401 di `_middleware.js`, diperbaiki
-- di commit yang sama) mustahil didiagnosis dari data: satu-satunya tempat yang
-- akan merekam sebabnya justru yang ikut diblokir.
--
-- Kambuh KELIMA dari pola "RLS UPDATE hilang = 0 baris senyap".
--
-- ⚠️ SESEMPIT MUNGKIN, DAN SENGAJA. Policy ini TIDAK memberi peneliti kuasa atas
-- uang. Yang dijaga:
--
--   * hanya tagihan MILIKNYA (pola kepemilikan disalin apa adanya dari
--     `Users Select Invoices`, supaya keduanya tidak bisa menyimpang);
--   * `WITH CHECK` mengunci SELURUH kolom yang menentukan uang dan keadaan —
--     `status`, `amount`, `paid_at`, `doku_cancelled_at`, `payment_id`,
--     `schedule_id`, `form_submission_id`, `expires_at` — sehingga satu-satunya
--     yang benar-benar bisa berubah adalah `doku_cancel_last_error`.
--
-- ⚠️ POSTGRES TIDAK PUNYA "policy per-kolom" untuk UPDATE. Cara menegakkannya
-- adalah membandingkan NEW vs OLD di `WITH CHECK`; itulah bentuk panjang di
-- bawah. Menghapus satu baris perbandingan = membuka kolom itu untuk ditulis
-- peneliti.
--
-- Idempoten: DROP POLICY IF EXISTS lebih dulu.
-- ============================================================================

DROP POLICY IF EXISTS "Peneliti mencatat sebab gagal cancel DOKU" ON public.invoices;

CREATE POLICY "Peneliti mencatat sebab gagal cancel DOKU"
  ON public.invoices
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM form_submissions fs
      WHERE fs.id = invoices.form_submission_id
        AND (fs.auth_user_id = auth.uid()
             OR (fs.auth_user_id IS NULL AND fs.email = (auth.jwt() ->> 'email')))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM form_submissions fs
      WHERE fs.id = invoices.form_submission_id
        AND (fs.auth_user_id = auth.uid()
             OR (fs.auth_user_id IS NULL AND fs.email = (auth.jwt() ->> 'email')))
    )
  );

/*
  Kolom-kolom yang TIDAK BOLEH bergeser lewat policy di atas.

  ⚠️ Ini trigger, bukan bagian dari policy, karena `WITH CHECK` tidak bisa
  melihat baris LAMA. Tanpa ini, policy di atas mengizinkan peneliti menulis
  `status = 'paid'` pada tagihannya sendiri — kuasa uang yang justru tidak boleh
  diberikan. Trigger-lah satu-satunya tempat NEW dan OLD bisa dibandingkan.

  Admin dan service_role dilewati; jalur mereka memang berhak mengubah kolom ini
  (`cancelInvoice`, `settleGroupAsPaid`, webhook DOKU).
*/
CREATE OR REPLACE FUNCTION public.guard_invoice_columns_for_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  claims jsonb;
  jwt_role  text;
  jwt_email text;
BEGIN
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  -- Tanpa klaim = bukan permintaan lewat PostgREST (cron, psql, trigger lain).
  IF claims IS NULL THEN RETURN NEW; END IF;

  jwt_role  := coalesce(claims ->> 'role', '');
  jwt_email := lower(coalesce(claims ->> 'email', ''));

  IF jwt_role = 'service_role' OR jwt_email = 'product@jakpat.net' THEN
    RETURN NEW;
  END IF;

  IF NEW.status              IS DISTINCT FROM OLD.status
     OR NEW.amount           IS DISTINCT FROM OLD.amount
     OR NEW.paid_at          IS DISTINCT FROM OLD.paid_at
     OR NEW.doku_cancelled_at IS DISTINCT FROM OLD.doku_cancelled_at
     OR NEW.payment_id       IS DISTINCT FROM OLD.payment_id
     OR NEW.schedule_id      IS DISTINCT FROM OLD.schedule_id
     OR NEW.form_submission_id IS DISTINCT FROM OLD.form_submission_id
     OR NEW.expires_at       IS DISTINCT FROM OLD.expires_at
  THEN
    RAISE EXCEPTION 'Kolom tagihan ini hanya bisa diubah admin; peneliti hanya boleh mencatat doku_cancel_last_error.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_invoices_guard_owner_columns ON public.invoices;
CREATE TRIGGER trg_invoices_guard_owner_columns
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_columns_for_owner();

COMMENT ON POLICY "Peneliti mencatat sebab gagal cancel DOKU" ON public.invoices IS
  'Phase 4 (2026-09-17): supaya recordDokuCancelError() berhenti gagal senyap saat '
  'peneliti membatalkan jadwalnya. Dipasangkan dengan trigger '
  'guard_invoice_columns_for_owner() yang mengunci status/amount/paid_at/'
  'doku_cancelled_at/payment_id/schedule_id/form_submission_id/expires_at, sehingga '
  'satu-satunya kolom yang efektif bisa ditulis peneliti adalah doku_cancel_last_error.';

-- ============================================================================
-- VERIFIKASI (jalankan manual sesudah menerapkan)
-- ============================================================================
-- -- 1. Dua policy UPDATE sekarang, yang lama utuh:
-- SELECT polname, polcmd FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
--  WHERE c.relname='invoices' ORDER BY polcmd, polname;
--
-- -- 2. Trigger terpasang:
-- SELECT tgname FROM pg_trigger WHERE tgrelid='public.invoices'::regclass AND NOT tgisinternal;
--
-- -- 3. Uji negatif WAJIB (jalankan sebagai peneliti, bukan service_role):
-- --    UPDATE invoices SET status='paid' WHERE payment_id='<milik sendiri>';
-- --    diharapkan: EXCEPTION 'Kolom tagihan ini hanya bisa diubah admin…'
