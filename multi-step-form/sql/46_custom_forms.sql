-- Migration 46: Custom Forms and Form Responses
-- Adds custom form builder support and response logging

-- 1. Ensure username column exists in customer_profiles / profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'customer_profiles' AND column_name = 'username'
  ) THEN
    ALTER TABLE customer_profiles ADD COLUMN username TEXT UNIQUE;
  END IF;
END $$;

-- 2. Create custom_forms table
CREATE TABLE IF NOT EXISTS custom_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT,
  title TEXT NOT NULL DEFAULT 'Untitled Form',
  description TEXT DEFAULT '',
  schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'published', 'archived'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for user lookup and slug lookup
CREATE INDEX IF NOT EXISTS idx_custom_forms_user_id ON custom_forms(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_forms_slug ON custom_forms(user_id, slug);

-- 3. Create custom_form_responses table
CREATE TABLE IF NOT EXISTS custom_form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES custom_forms(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for form response analytics
CREATE INDEX IF NOT EXISTS idx_custom_form_responses_form_id ON custom_form_responses(form_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE custom_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_form_responses ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for custom_forms
-- Owners can read, insert, update, and delete their own forms
CREATE POLICY "Users can manage their own custom_forms"
  ON custom_forms
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public can read published forms by ID or slug
CREATE POLICY "Public can view published custom_forms"
  ON custom_forms
  FOR SELECT
  USING (status = 'published');

-- 6. RLS Policies for custom_form_responses
-- Anyone can submit a response to a published form
CREATE POLICY "Public can submit responses to published forms"
  ON custom_form_responses
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM custom_forms
      WHERE custom_forms.id = custom_form_responses.form_id
      AND custom_forms.status = 'published'
    )
  );

-- Form owners can view responses for their forms
CREATE POLICY "Form owners can view responses"
  ON custom_form_responses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM custom_forms
      WHERE custom_forms.id = custom_form_responses.form_id
      AND custom_forms.user_id = auth.uid()
    )
  );
