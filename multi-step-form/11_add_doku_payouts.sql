-- Migration: Create doku_payouts table to track Sub Account payouts

CREATE TABLE IF NOT EXISTS doku_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  bank_code TEXT NOT NULL,
  bank_account_number TEXT NOT NULL,
  bank_account_name TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies for doku_payouts
ALTER TABLE doku_payouts ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users
CREATE POLICY "Allow select on doku_payouts for authenticated users"
  ON doku_payouts
  FOR SELECT
  TO authenticated
  USING (true);

-- Note: Inserts will be done via server-side (Cloudflare Functions) which usually use Service Role Key
-- bypassing RLS, so we don't necessarily need an INSERT policy for anon/authenticated if it's only done by server.
-- But if the client can insert, we should add one. For now, server handles it.