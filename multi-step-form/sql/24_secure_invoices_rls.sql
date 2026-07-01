-- ============================================================
-- Migration 24: Secure the `invoices` table with RLS
-- Date: 2026-07-01
--
-- WHY: `invoices` was reachable by the public anon key (RLS was never enabled on
-- the table, so the policies in 02_fix_invoice_rls.sql are dormant). Anyone with
-- the frontend anon key could read all invoices and mark any invoice paid / change
-- amounts / delete rows. `transactions` and `form_submissions` are already locked;
-- this brings `invoices` to parity.
--
-- PREREQUISITE: deploy the server-side payment flow FIRST
--   - functions/api/doku/create-payment.js
--   - src/utils/payment.ts (createPayment now calls that endpoint)
-- Otherwise the public retry (/payment-retry) and user checkout
-- (/dashboard/payment/:id), which used to insert invoices via the anon key, break.
--
-- End state: invoices writable only by admin (product@jakpat.net) + service_role;
-- readable only by the owner + admin. The DOKU webhook uses service_role and
-- bypasses RLS. Run this in the Supabase SQL Editor AFTER the code is deployed.
-- ============================================================

-- 0. Pre-check (run this alone first to confirm the gap):
--    SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'invoices';
--    Expect relrowsecurity = false BEFORE this migration.

-- 1. (Re)assert the policies idempotently. If 02_fix_invoice_rls.sql was never
--    applied in this environment, enabling RLS with zero policies would lock out
--    admin + owners — so we recreate the required set here to be self-contained.

-- Owner sees own invoices; admin sees all.
DROP POLICY IF EXISTS "Users Select Invoices" ON public.invoices;
CREATE POLICY "Users Select Invoices" ON public.invoices
FOR SELECT TO authenticated
USING (
  ((auth.jwt() ->> 'email') = 'product@jakpat.net')
  OR EXISTS (
    SELECT 1 FROM public.form_submissions
    WHERE form_submissions.id = invoices.form_submission_id
      AND form_submissions.email = (auth.jwt() ->> 'email')
  )
);

-- Admin (dashboard, authenticated as product@jakpat.net) can create invoices.
DROP POLICY IF EXISTS "Admin Insert Invoices" ON public.invoices;
CREATE POLICY "Admin Insert Invoices" ON public.invoices
FOR INSERT TO authenticated
WITH CHECK ((auth.jwt() ->> 'email') = 'product@jakpat.net');

-- Admin can update invoices (manual reconciliation, corrections).
DROP POLICY IF EXISTS "Admin Update Invoices" ON public.invoices;
CREATE POLICY "Admin Update Invoices" ON public.invoices
FOR UPDATE TO authenticated
USING ((auth.jwt() ->> 'email') = 'product@jakpat.net')
WITH CHECK ((auth.jwt() ->> 'email') = 'product@jakpat.net');

-- Admin can delete invoices (cleanup).
DROP POLICY IF EXISTS "Admin Delete Invoices" ON public.invoices;
CREATE POLICY "Admin Delete Invoices" ON public.invoices
FOR DELETE TO authenticated
USING ((auth.jwt() ->> 'email') = 'product@jakpat.net');

-- NOTE: intentionally NO anon policy and NO "Users Insert Invoices" policy.
-- Self-service payment creation now runs server-side with service_role, which
-- bypasses RLS entirely — so regular users never need direct invoice write access.

-- 2. Turn RLS on — this is the line that actually closes the hole.
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- 3. Post-check:
--    SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'invoices';  -- expect true
--    With the anon key:
--      GET   /rest/v1/invoices?select=id            -> []       (was: 266 rows)
--      PATCH /rest/v1/invoices?id=eq.<some-id>      -> 0 rows   (was: succeeded)

-- Rollback (instant): ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;
