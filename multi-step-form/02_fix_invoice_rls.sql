-- Fix RLS Policy for Invoices and Transactions
-- Allow Admin (product@jakpat.net) to INSERT into invoices and transactions tables

-- 1. Policy for Inserting Invoices
DROP POLICY IF EXISTS "Admin Insert Invoices" ON invoices;
CREATE POLICY "Admin Insert Invoices" ON invoices
FOR INSERT TO authenticated
WITH CHECK ((auth.jwt() ->> 'email') = 'product@jakpat.net');

-- 1a. Policy for SELECT Invoices (User can see own invoices, Admin can see all)
DROP POLICY IF EXISTS "Users Select Invoices" ON invoices;
CREATE POLICY "Users Select Invoices" ON invoices
FOR SELECT TO authenticated
USING (
  -- Admin can see all
  ((auth.jwt() ->> 'email') = 'product@jakpat.net')
  OR
  -- User can see own invoices via join
  EXISTS (
    SELECT 1 FROM form_submissions
    WHERE form_submissions.id = invoices.form_submission_id
    AND form_submissions.email = (auth.jwt() ->> 'email')
  )
);

-- 2. Policy for Updating Invoices (if needed)
DROP POLICY IF EXISTS "Admin Update Invoices" ON invoices;
CREATE POLICY "Admin Update Invoices" ON invoices
FOR UPDATE TO authenticated
USING ((auth.jwt() ->> 'email') = 'product@jakpat.net')
WITH CHECK ((auth.jwt() ->> 'email') = 'product@jakpat.net');

-- 3. Policy for Inserting Transactions (if admin needs to create manual transactions manually)
DROP POLICY IF EXISTS "Admin Insert Transactions" ON transactions;
CREATE POLICY "Admin Insert Transactions" ON transactions
FOR INSERT TO authenticated
WITH CHECK ((auth.jwt() ->> 'email') = 'product@jakpat.net');

-- 3b. Policy for Users INSERT Transactions (Auto-payment flow)
DROP POLICY IF EXISTS "Users Insert Transactions" ON transactions;
CREATE POLICY "Users Insert Transactions" ON transactions
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM form_submissions
    WHERE form_submissions.id = transactions.form_submission_id
    AND form_submissions.email = (auth.jwt() ->> 'email')
  )
);

-- 3a. Policy for SELECT Transactions
DROP POLICY IF EXISTS "Users Select Transactions" ON transactions;
CREATE POLICY "Users Select Transactions" ON transactions
FOR SELECT TO authenticated
USING (
  -- Admin can see all
  ((auth.jwt() ->> 'email') = 'product@jakpat.net')
  OR
  -- User can see own transactions via join
  EXISTS (
    SELECT 1 FROM form_submissions
    WHERE form_submissions.id = transactions.form_submission_id
    AND form_submissions.email = (auth.jwt() ->> 'email')
  )
);

-- 4. Ensure Form Submissions can be updated by Admin (to change status)
DROP POLICY IF EXISTS "Admin Update Submissions" ON form_submissions;
CREATE POLICY "Admin Update Submissions" ON form_submissions
FOR UPDATE TO authenticated
USING ((auth.jwt() ->> 'email') = 'product@jakpat.net')
WITH CHECK ((auth.jwt() ->> 'email') = 'product@jakpat.net');

-- 5. Enable Delete for invoices (optional cleanup)
DROP POLICY IF EXISTS "Admin Delete Invoices" ON invoices;
CREATE POLICY "Admin Delete Invoices" ON invoices
FOR DELETE TO authenticated
USING ((auth.jwt() ->> 'email') = 'product@jakpat.net');
