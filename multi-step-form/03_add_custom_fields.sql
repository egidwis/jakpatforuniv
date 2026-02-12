ALTER TABLE survey_pages ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '[]'::jsonb;
ALTER TABLE page_respondents ADD COLUMN IF NOT EXISTS custom_answers JSONB DEFAULT '{}'::jsonb;
