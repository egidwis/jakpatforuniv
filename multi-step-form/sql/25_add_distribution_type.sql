-- Add distribution_type column to form_submissions
ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS distribution_type TEXT DEFAULT 'regular'
  CHECK (distribution_type IN ('regular', 'kilat'));

-- Index for admin filtering
CREATE INDEX IF NOT EXISTS idx_form_submissions_distribution_type
  ON form_submissions(distribution_type);
