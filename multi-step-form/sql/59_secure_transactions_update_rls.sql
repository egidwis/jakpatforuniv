-- 59_secure_transactions_update_rls.sql
-- Date: 2026-08-19
--
-- WHY: `transactions` has RLS enabled (relrowsecurity=true) but has NEVER had
-- an UPDATE policy — only INSERT and SELECT (see pg_policies: "Admin Insert
-- Transactions", "Users Insert Transactions", "Admin View All Transactions",
-- "Users Select Transactions"). `invoices` got its full CRUD set in
-- 24_secure_invoices_rls.sql; `transactions` was apparently never brought to
-- parity.
--
-- CONSEQUENCE: every UPDATE to `transactions.status` issued from the browser
-- (anon key + user JWT, fully subject to RLS) has always silently affected
-- ZERO rows. Supabase-js does not surface this as an error — PostgREST just
-- reports "0 rows matched" the same way it would for a legitimate no-op.
-- Found while debugging the new `markScheduleAsPaid()` (Task 11): its
-- `invoices` write succeeded, its `transactions` write for the SAME schedule
-- silently no-op'd. This is NOT new — `updatePaymentStatus()` (legacy) and
-- three other call sites that mark transactions 'expired'
-- (releaseScheduleSlot, prepareSubmissionForReschedule, closePaymentLink) hit
-- the exact same gap and have for as long as this policy set has existed.
-- Server-side writers (functions/api/doku/webhook.js, create-payment.js) were
-- never affected — they use service_role, which bypasses RLS entirely.
--
-- SCOPE: additive only. Mirrors "Admin Update Invoices" exactly — same admin
-- identity (product@jakpat.net), same USING/WITH CHECK shape. Does not touch
-- INSERT/SELECT/DELETE policies, does not touch any other table.
--
-- Run this in the Supabase SQL Editor. Verification + rollback at the bottom.
-- ============================================================================

-- ============================================================================
-- 1. Admin can update transactions (manual reconciliation, corrections).
-- ============================================================================
DROP POLICY IF EXISTS "Admin Update Transactions" ON public.transactions;
CREATE POLICY "Admin Update Transactions" ON public.transactions
FOR UPDATE TO authenticated
USING ((auth.jwt() ->> 'email') = 'product@jakpat.net')
WITH CHECK ((auth.jwt() ->> 'email') = 'product@jakpat.net');

-- ============================================================================
-- 2. Backfill: transactions stuck 'pending' whose PAIRED invoice (same
--    payment_id — the actual 1:1 link written together by every payment
--    flow) already says 'paid'. This is NOT the same as joining on
--    schedule_id: a schedule can carry many abandoned retry-attempt
--    transaction rows that are correctly still 'pending' forever (up to 29
--    for one schedule, per Task 11 audit). payment_id is the pair that
--    actually moved together; matching on it found exactly 6 rows, not the
--    ~60 a schedule_id join would over-count.
--
--    Hardcoded to the 6 tx ids identified and individually inspected
--    2026-08-19, not a live re-match — a query run later could pick up
--    unrelated future rows if this migration were ever re-run. The `status
--    <> 'paid'` guard keeps a re-run idempotent regardless.
-- ============================================================================
UPDATE public.transactions
SET status = 'paid',
    updated_at = now()
WHERE id IN (
  '23507867-f3c4-4002-8922-62f4c95b949b', -- mayar_manual_invoice, paid 2026-01-15, Rp200.000
  'f82296e3-2c9d-49ee-b4ae-debc0994fce2', -- markScheduleAsPaid test row, paid 2026-08-18
  '7cfbcdf1-2fd0-49e3-b4b6-d829de51f8a9', -- doku, invoice paid but paid_at NULL — manually marked pre-fix
  '3a19f509-33c8-4c26-945f-10d478f5f17a', -- doku, invoice paid but paid_at NULL — manually marked pre-fix
  'c1cc581c-2e54-4a65-b8ec-b4604ceb9660', -- doku, invoice paid but paid_at NULL — manually marked pre-fix
  '60a1ec0e-ae8c-4b3d-8330-837ac76c9931'  -- doku, invoice paid but paid_at NULL — manually marked pre-fix
)
AND status <> 'paid';

-- ============================================================================
-- 3. `payment_method`/`payment_channel` for the ONE row we have first-hand
--    certainty about (f82296e3 — the markScheduleAsPaid() test that surfaced
--    this whole gap, 2026-08-19). The other 5 backfilled rows in step 2 are
--    left with whatever payment_method they already had: their provenance
--    (which admin action, which code version) isn't certain enough to stamp
--    'MANUAL_VERIFIED' on them, and `unmarkScheduleAsPaid()`'s undo button
--    deliberately only appears for rows carrying that exact marker.
-- ============================================================================
UPDATE public.transactions
SET payment_method = 'manual', payment_channel = 'MANUAL_VERIFIED'
WHERE id = 'f82296e3-2c9d-49ee-b4ae-debc0994fce2';

-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- -- Expect a row for "Admin Update Transactions", cmd=UPDATE:
-- select policyname, cmd, roles from pg_policies where tablename='transactions';
--
-- -- Expect 0 (was 6):
-- select count(*) from invoices i join transactions t on t.payment_id = i.payment_id
--  where i.status = 'paid' and t.status not in ('paid','completed');
--
-- -- With the anon key, authenticated as product@jakpat.net:
-- --   PATCH /rest/v1/transactions?id=eq.<some-id>  -> 1 row updated (was: 0 rows, no error)

-- ============================================================================
-- Rollback
-- ============================================================================
-- DROP POLICY IF EXISTS "Admin Update Transactions" ON public.transactions;
-- -- The backfill UPDATE is not mechanically reversible (previous status per
-- -- row wasn't preserved); re-derive from webhook logs / payment_id history
-- -- if a specific row ever needs to go back to 'pending'.
