-- Add custom_fields column to survey_pages table
ALTER TABLE public.survey_pages 
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '[]'::jsonb;

-- Add custom_answers column to page_respondents table
ALTER TABLE public.page_respondents 
ADD COLUMN IF NOT EXISTS custom_answers JSONB DEFAULT '{}'::jsonb;
