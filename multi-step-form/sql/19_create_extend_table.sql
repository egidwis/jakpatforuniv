-- ============================================================
-- Migration 19: Extend Ad Duration
-- Creates form_submissions_extend table + related column changes
-- Date: 2026-06-02
-- ============================================================

-- ============================================
-- 1. Table: form_submissions_extend
-- ============================================
CREATE TABLE IF NOT EXISTS form_submissions_extend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,

  -- Scheduling
  duration INTEGER NOT NULL,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  slot_booked_by TEXT,
  slot_reserved_at TIMESTAMPTZ,

  -- Status lifecycle
  submission_status TEXT DEFAULT 'waiting_payment'
    CHECK (submission_status IN (
      'waiting_payment', 'paid', 'scheduled', 'live', 'completed', 'cancelled'
    )),
  payment_status TEXT DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'expired', 'failed')),

  -- Reward (new month)
  prize_per_winner INTEGER DEFAULT 0,
  winner_count INTEGER DEFAULT 0,

  -- Reward (same month)
  additional_prize_per_winner INTEGER DEFAULT 0,

  -- Metadata
  is_new_month BOOLEAN DEFAULT false,
  period_batch TEXT,
  total_cost INTEGER NOT NULL DEFAULT 0,
  voucher_code TEXT,
  admin_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_extend_submission_id ON form_submissions_extend(submission_id);
CREATE INDEX IF NOT EXISTS idx_extend_status ON form_submissions_extend(submission_status);
CREATE INDEX IF NOT EXISTS idx_extend_dates ON form_submissions_extend(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_extend_batch ON form_submissions_extend(period_batch);

-- ============================================
-- 3. Trigger: auto-compute period_batch from end_date
-- ============================================
CREATE OR REPLACE FUNCTION compute_extend_period_batch()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.end_date IS NOT NULL THEN
    NEW.period_batch := TO_CHAR(NEW.end_date, 'YYYY-MM');
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_extend_period_batch ON form_submissions_extend;
CREATE TRIGGER trg_extend_period_batch
  BEFORE INSERT OR UPDATE OF end_date ON form_submissions_extend
  FOR EACH ROW EXECUTE FUNCTION compute_extend_period_batch();

-- ============================================
-- 4. RLS Policies
-- ============================================
ALTER TABLE form_submissions_extend ENABLE ROW LEVEL SECURITY;

-- Users can read their own extends (via parent submission ownership)
DROP POLICY IF EXISTS "Users can view own extends" ON form_submissions_extend;
CREATE POLICY "Users can view own extends"
  ON form_submissions_extend FOR SELECT
  USING (
    submission_id IN (
      SELECT id FROM form_submissions
      WHERE auth_user_id = auth.uid()
    )
  );

-- Users can insert extends for their own submissions
DROP POLICY IF EXISTS "Users can create extends" ON form_submissions_extend;
CREATE POLICY "Users can create extends"
  ON form_submissions_extend FOR INSERT
  WITH CHECK (
    submission_id IN (
      SELECT id FROM form_submissions
      WHERE auth_user_id = auth.uid()
    )
  );

-- Service role (admin) full access
DROP POLICY IF EXISTS "Service role full access extends" ON form_submissions_extend;
CREATE POLICY "Service role full access extends"
  ON form_submissions_extend FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 5. ALTER existing tables
-- ============================================

-- transactions: routing extend vs submission
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'submission';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS extend_id UUID REFERENCES form_submissions_extend(id);

-- invoices: same routing
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'submission';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS extend_id UUID REFERENCES form_submissions_extend(id);

-- survey_pages: pre-computed batch + banner update flag
ALTER TABLE survey_pages ADD COLUMN IF NOT EXISTS current_period_batch TEXT;
ALTER TABLE survey_pages ADD COLUMN IF NOT EXISTS requires_banner_update BOOLEAN DEFAULT false;

-- page_respondents: LOI tracking
ALTER TABLE page_respondents ADD COLUMN IF NOT EXISTS loi_seconds INTEGER;
ALTER TABLE page_respondents ADD COLUMN IF NOT EXISTS survey_started_at TIMESTAMPTZ;
