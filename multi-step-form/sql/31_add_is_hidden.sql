-- Add is_hidden flag to survey_pages to exclude them from the mobile API
-- while keeping them "published" (Live) in the dashboard.

ALTER TABLE survey_pages
ADD COLUMN is_hidden BOOLEAN DEFAULT false;
