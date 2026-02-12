-- Add publish_start_date and publish_end_date columns to survey_pages table
ALTER TABLE public.survey_pages 
ADD COLUMN IF NOT EXISTS publish_start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS publish_end_date TIMESTAMPTZ;

-- Allow nulls for now (default)
