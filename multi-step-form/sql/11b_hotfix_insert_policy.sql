-- HOTFIX: Allow inserts without auth_user_id (backward compat with old frontend)
-- Run this NOW if frontend hasn't been deployed yet after 11_add_auth_user_id.sql
-- After frontend deploy, this can be tightened back to require auth_user_id

DROP POLICY IF EXISTS "Users can insert submissions" ON form_submissions;
CREATE POLICY "Users can insert submissions" ON form_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_user_id = auth.uid()
    OR auth_user_id IS NULL  -- Allow old frontend that doesn't send auth_user_id
  );
