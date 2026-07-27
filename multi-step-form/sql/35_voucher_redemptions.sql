-- ============================================================
-- Migration 35: voucher_redemptions
--
-- Records a one-time-per-account voucher redemption. Introduced for
-- ILKOMUNY (valid until 2026-12-31, one use per account), but the table is
-- generic so any future limited-use voucher can reuse it.
--
-- Enforcement model: the authoritative row is INSERTed by the DOKU webhook
-- (webhook.js, service_role) at the moment a submission using a limited
-- voucher becomes `paid`. The UNIQUE(auth_user_id, voucher_code) constraint is
-- the final guarantee that at most one *paid* redemption per account can stick.
-- The client (StepCheckout) and admin (SchedulePaymentView) additionally read
-- this table to block obvious double-use before money changes hands.
--
-- Idempotent: safe to re-run (IF NOT EXISTS + DROP POLICY IF EXISTS).
-- Run this in the Supabase SQL Editor BEFORE deploying the code — webhook.js
-- writes to this table, so it must exist first.
-- ============================================================

-- ============================================
-- 1. Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.voucher_redemptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voucher_code       TEXT NOT NULL,                                   -- stored UPPERCASE
  form_submission_id UUID REFERENCES public.form_submissions(id) ON DELETE SET NULL,
  redeemed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- At most one redemption of a given code per account.
  UNIQUE (auth_user_id, voucher_code)
);

-- ============================================
-- 2. RLS
-- ============================================
ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;

-- Owner may read their own redemptions (StepCheckout "already used?" check).
DROP POLICY IF EXISTS "Users can view own voucher redemptions" ON public.voucher_redemptions;
CREATE POLICY "Users can view own voucher redemptions"
  ON public.voucher_redemptions FOR SELECT
  USING (auth.uid() = auth_user_id);

-- Admin (dashboard, authenticated as product@jakpat.net) may read all
-- redemptions — same pattern as invoices (sql/24) / customer profiles (sql/32).
-- Lets the internal dashboard inspect / gate ILKOMUNY use if wired later.
DROP POLICY IF EXISTS "Admin can view all voucher redemptions" ON public.voucher_redemptions;
CREATE POLICY "Admin can view all voucher redemptions"
  ON public.voucher_redemptions FOR SELECT
  USING ((auth.jwt() ->> 'email') = 'product@jakpat.net');

-- Service role (webhook) full access. There is deliberately NO user INSERT
-- policy: redemptions are written only by the server on confirmed payment.
DROP POLICY IF EXISTS "Service role full access voucher redemptions" ON public.voucher_redemptions;
CREATE POLICY "Service role full access voucher redemptions"
  ON public.voucher_redemptions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- Verification (run after applying)
-- ============================================================
-- Table + unique index exist:
--   select conname from pg_constraint
--   where conrelid = 'public.voucher_redemptions'::regclass and contype = 'u';
--
-- No duplicates possible (the UNIQUE constraint rejects a 2nd insert):
--   insert into public.voucher_redemptions (auth_user_id, voucher_code)
--   values ('<some-uuid>', 'ILKOMUNY');   -- 2nd run must error 23505

-- ============================================================
-- Rollback
-- ============================================================
-- drop table if exists public.voucher_redemptions;
