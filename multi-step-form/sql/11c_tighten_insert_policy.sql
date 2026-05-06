-- ============================================================
-- Post-deploy: Tighten INSERT policy for form_submissions
-- Now that frontend sends auth_user_id on every insert,
-- remove the backward-compat NULL allowance from 11b_hotfix.
-- ============================================================
-- Run this in Supabase SQL Editor AFTER confirming frontend is deployed.
-- ============================================================

DROP POLICY IF EXISTS "Users can insert submissions" ON form_submissions;
CREATE POLICY "Users can insert submissions" ON form_submissions
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());
