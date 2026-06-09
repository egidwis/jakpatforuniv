-- ============================================================
-- Migration 21: Fix RLS for form_submissions_extend
-- Allows authenticated users (admin) full CRUD access
-- Date: 2026-06-04
-- ============================================================
-- Problem: Admin dashboard uses anon/authenticated Supabase client,
-- not service_role. The existing INSERT policy only allows users
-- to create extends for their OWN submissions (auth_user_id = auth.uid()),
-- but admin needs to create extends for ANY submission.
-- ============================================================

-- Drop the overly restrictive user-only policies
DROP POLICY IF EXISTS "Users can view own extends" ON form_submissions_extend;
DROP POLICY IF EXISTS "Users can create extends" ON form_submissions_extend;

-- Authenticated users can SELECT all extends
-- (admin needs to see all; user-level filtering is done in the app)
CREATE POLICY "Authenticated can view extends"
  ON form_submissions_extend FOR SELECT TO authenticated
  USING (true);

-- Authenticated users can INSERT extends
CREATE POLICY "Authenticated can insert extends"
  ON form_submissions_extend FOR INSERT TO authenticated
  WITH CHECK (true);

-- Authenticated users can UPDATE extends
CREATE POLICY "Authenticated can update extends"
  ON form_submissions_extend FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Authenticated users can DELETE extends
CREATE POLICY "Authenticated can delete extends"
  ON form_submissions_extend FOR DELETE TO authenticated
  USING (true);

-- Keep service_role full access (for cron jobs, webhooks, etc.)
-- This policy already exists from migration 19, no changes needed.
