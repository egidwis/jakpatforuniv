-- ============================================================
-- Create survey_winners table for tracking rewardees
-- ============================================================

CREATE TABLE public.survey_winners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         UUID REFERENCES survey_pages(id) ON DELETE CASCADE,
  jakpat_id       TEXT NOT NULL,
  respondent_name TEXT,
  reward_amount   INTEGER,
  reward_status   TEXT DEFAULT 'selected',
  ewallet_provider TEXT,
  e_wallet_number  TEXT,
  selected_at     TIMESTAMPTZ DEFAULT NOW(),
  selected_by     TEXT,
  notes           TEXT,
  UNIQUE(page_id, jakpat_id)
);

-- Index for fast lookup
CREATE INDEX idx_survey_winners_page_id ON public.survey_winners(page_id);
CREATE INDEX idx_survey_winners_jakpat_id ON public.survey_winners(jakpat_id);

-- RLS
ALTER TABLE public.survey_winners ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access to survey_winners"
ON public.survey_winners
FOR ALL
USING (true)
WITH CHECK (true);
