-- 1. Create campaign_clicks table
CREATE TABLE IF NOT EXISTS campaign_clicks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_name text DEFAULT 'jakpatforuniv_landing',
  source text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE campaign_clicks ENABLE ROW LEVEL SECURITY;

-- 3. Create policies
-- Allow anonymous users (public) to insert click data
CREATE POLICY "Allow anon insert clicks" ON campaign_clicks FOR INSERT WITH CHECK (true);

-- Allow authenticated (admin) to read the clicks
CREATE POLICY "Allow read access" ON campaign_clicks FOR SELECT USING (true);
