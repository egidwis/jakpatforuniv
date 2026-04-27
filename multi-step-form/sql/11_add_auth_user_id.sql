-- ============================================================
-- Phase 1: Add auth_user_id to form_submissions
-- Fix email mismatch between login and form contact email
-- ============================================================
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- Project: jakpatforuniv
-- ============================================================

-- 1. Add auth_user_id column (links submission to Supabase Auth user)
ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id);

-- 2. Backfill existing data: match form_submissions.email → auth.users.email
-- This populates auth_user_id for all existing submissions where the email matches
UPDATE form_submissions fs
SET auth_user_id = au.id
FROM auth.users au
WHERE LOWER(fs.email) = LOWER(au.email)
  AND fs.auth_user_id IS NULL;

-- 3. Create index for fast lookups by auth_user_id
CREATE INDEX IF NOT EXISTS idx_form_submissions_auth_user_id
  ON form_submissions(auth_user_id);

-- 4. Fix RLS Policies
-- The old policy used (auth.jwt() ->> 'email') = email which BREAKS
-- when the user changes their email in Step 2 of the form.
-- New policies use auth_user_id with email fallback for pre-migration data.

-- 4a. SELECT policy: users can view their own submissions
DROP POLICY IF EXISTS "Users can view own submissions" ON form_submissions;
CREATE POLICY "Users can view own submissions" ON form_submissions
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR (auth_user_id IS NULL AND email = (auth.jwt() ->> 'email'))
  );

-- 4b. UPDATE policy: users can update their own submissions (reschedule, etc.)
DROP POLICY IF EXISTS "Users Update Own Submissions" ON form_submissions;
CREATE POLICY "Users Update Own Submissions" ON form_submissions
  FOR UPDATE TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR (auth_user_id IS NULL AND email = (auth.jwt() ->> 'email'))
  )
  WITH CHECK (
    auth_user_id = auth.uid()
    OR (auth_user_id IS NULL AND email = (auth.jwt() ->> 'email'))
  );

-- 4c. INSERT policy: new submissions must have auth_user_id set
DROP POLICY IF EXISTS "Users can insert submissions" ON form_submissions;
CREATE POLICY "Users can insert submissions" ON form_submissions
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- 5. Verify: check how many submissions were backfilled
SELECT
  COUNT(*) AS total_submissions,
  COUNT(auth_user_id) AS with_auth_user_id,
  COUNT(*) - COUNT(auth_user_id) AS orphaned
FROM form_submissions;
