-- Migration 59: Survey Data Analyses Projects
-- Stores AI-assisted survey data analysis sessions, canvas blocks, and chat history.

-- 1. Create survey_analyses table
CREATE TABLE IF NOT EXISTS survey_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Analisis Data Survei',
  description TEXT DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'csv_upload', -- 'csv_upload', 'custom_form', 'google_form'
  source_id UUID REFERENCES custom_forms(id) ON DELETE SET NULL,
  dataset_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_data_sample JSONB DEFAULT '[]'::jsonb,
  canvas_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  chat_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for fast user lookups and sorting
CREATE INDEX IF NOT EXISTS idx_survey_analyses_user_id ON survey_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_survey_analyses_updated_at ON survey_analyses(updated_at DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE survey_analyses ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Owners can view, insert, update, and delete their own analysis projects
CREATE POLICY "Users can manage their own survey_analyses"
  ON survey_analyses
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
