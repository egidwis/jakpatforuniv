-- 1. Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Create the Admin User (product@jakpat.net)
-- Note: This inserts directly into auth.users. Be careful with existing users.
DO $$
DECLARE
  new_uid uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'product@jakpat.net') THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_uid,
      'authenticated',
      'authenticated',
      'product@jakpat.net',
      crypt('jakpat2026', gen_salt('bf')), -- Password: jakpat2026
      now(), -- Auto confirm email
      '{"provider": "email", "providers": ["email"]}',
      '{"full_name": "Admin Product"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
    
    -- Optional: If you have a public.users table triggered by auth.users, it acts automatically.
    -- If you insert manually into public.users, uncomment below:
    -- INSERT INTO public.users (id, full_name, email) VALUES (new_uid, 'Admin Product', 'product@jakpat.net');
    
    RAISE NOTICE 'User product@jakpat.net created successfully.';
  ELSE
    RAISE NOTICE 'User product@jakpat.net already exists.';
  END IF;
END $$;

-- 3. Set RLS Policies for Admin Access
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Drop existing admin policies to avoid conflicts
DROP POLICY IF EXISTS "Admin View All Submissions" ON form_submissions;
DROP POLICY IF EXISTS "Admin View All Transactions" ON transactions;
DROP POLICY IF EXISTS "Admin View All Invoices" ON invoices;
DROP POLICY IF EXISTS "User View Own Submissions" ON form_submissions;

-- Create Policies
CREATE POLICY "Admin View All Submissions" ON form_submissions
FOR SELECT TO authenticated
USING ((auth.jwt() ->> 'email') = 'product@jakpat.net');

CREATE POLICY "Admin View All Transactions" ON transactions
FOR SELECT TO authenticated
USING ((auth.jwt() ->> 'email') = 'product@jakpat.net');

CREATE POLICY "Admin View All Invoices" ON invoices
FOR SELECT TO authenticated
USING ((auth.jwt() ->> 'email') = 'product@jakpat.net');

-- Create User Policy (Regular users see own data based on EMAIL)
CREATE POLICY "User View Own Submissions" ON form_submissions
FOR SELECT TO authenticated
USING (email = (auth.jwt() ->> 'email'));
