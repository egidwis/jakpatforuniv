-- ============================================================
-- Migration 20: Extend RPCs + pg_cron Activation
-- Date: 2026-06-02
-- ============================================================

-- ============================================
-- 1. RPC: get_page_active_period
--    Used by SurveyPage.tsx to check if page is active
-- ============================================
CREATE OR REPLACE FUNCTION get_page_active_period(p_slug TEXT)
RETURNS TABLE (
  is_active BOOLEAN,
  active_source TEXT,
  active_period_id UUID,
  active_start_date TIMESTAMPTZ,
  active_end_date TIMESTAMPTZ,
  period_batch TEXT
) AS $$
DECLARE
  v_page RECORD;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Get page + parent submission
  SELECT sp.id AS page_id, sp.submission_id,
         fs.start_date AS parent_start, fs.end_date AS parent_end
  INTO v_page
  FROM survey_pages sp
  JOIN form_submissions fs ON fs.id = sp.submission_id
  WHERE sp.slug = p_slug AND sp.is_published = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TEXT;
    RETURN;
  END IF;

  -- Check parent period first
  IF v_page.parent_start <= v_now AND v_page.parent_end > v_now THEN
    RETURN QUERY SELECT true, 'parent'::TEXT, v_page.submission_id,
      v_page.parent_start, v_page.parent_end,
      TO_CHAR(v_page.parent_end, 'YYYY-MM');
    RETURN;
  END IF;

  -- Check extends (find current active one)
  RETURN QUERY
    SELECT true, 'extend'::TEXT, e.id,
      e.start_date, e.end_date, e.period_batch
    FROM form_submissions_extend e
    WHERE e.submission_id = v_page.submission_id
      AND e.submission_status = 'live'
      AND e.payment_status = 'paid'
      AND e.start_date <= v_now
      AND e.end_date > v_now
    ORDER BY e.start_date ASC
    LIMIT 1;

  -- If no rows returned above, page is not active
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. RPC: get_batch_rewards
--    Used by respondents.js API for batch reward info
-- ============================================
CREATE OR REPLACE FUNCTION get_batch_rewards(p_submission_id UUID)
RETURNS TABLE (
  period_batch TEXT,
  prize_per_winner INTEGER,
  winner_count INTEGER,
  batch_status TEXT,
  can_select_winners BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH all_periods AS (
    -- Parent submission
    SELECT
      TO_CHAR(fs.end_date, 'YYYY-MM') AS pb,
      fs.prize_per_winner AS base_p,
      0 AS add_p,
      fs.winner_count AS wc,
      fs.submission_status AS status
    FROM form_submissions fs WHERE fs.id = p_submission_id

    UNION ALL

    -- Extends (only paid ones)
    SELECT
      e.period_batch AS pb,
      COALESCE(e.prize_per_winner, 0),
      COALESCE(e.additional_prize_per_winner, 0),
      COALESCE(e.winner_count, 0),
      e.submission_status
    FROM form_submissions_extend e
    WHERE e.submission_id = p_submission_id
      AND e.payment_status = 'paid'
  ),
  batch_agg AS (
    SELECT
      ap.pb,
      MAX(CASE WHEN ap.base_p > 0 THEN ap.base_p ELSE 0 END) AS base_prize,
      SUM(ap.add_p) AS total_additional,
      MAX(CASE WHEN ap.wc > 0 THEN ap.wc ELSE 0 END) AS wc,
      BOOL_OR(ap.status IN ('live', 'scheduled', 'paid', 'waiting_payment')) AS has_active
    FROM all_periods ap
    GROUP BY ap.pb
  )
  SELECT
    ba.pb,
    (ba.base_prize + ba.total_additional)::INTEGER,
    ba.wc::INTEGER,
    CASE WHEN ba.has_active THEN 'active'::TEXT ELSE 'closed'::TEXT END,
    NOT ba.has_active
  FROM batch_agg ba
  ORDER BY ba.pb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. pg_cron: Activate & Complete Extends
--    Runs every 15 minutes
-- ============================================

-- Activation function
CREATE OR REPLACE FUNCTION cron_activate_extends()
RETURNS void AS $$
BEGIN
  -- Activate extends where start_date has passed AND banner is ready
  UPDATE form_submissions_extend e
  SET submission_status = 'live',
      updated_at = NOW()
  FROM survey_pages sp
  WHERE e.submission_id = sp.submission_id
    AND e.submission_status = 'scheduled'
    AND e.payment_status = 'paid'
    AND e.start_date <= NOW()
    AND e.end_date > NOW()
    AND (sp.requires_banner_update IS NULL OR sp.requires_banner_update = false);

  -- Sync survey_pages dates for newly activated extends
  UPDATE survey_pages sp
  SET publish_start_date = e.start_date,
      publish_end_date = e.end_date,
      current_period_batch = e.period_batch
  FROM form_submissions_extend e
  WHERE e.submission_id = sp.submission_id
    AND e.submission_status = 'live'
    AND e.start_date <= NOW()
    AND e.end_date > NOW();

  -- Complete extends that have ended
  UPDATE form_submissions_extend
  SET submission_status = 'completed',
      updated_at = NOW()
  WHERE submission_status = 'live'
    AND end_date <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NOTE: Run this manually in Supabase SQL Editor after enabling pg_cron extension:
-- SELECT cron.schedule(
--   'activate-extends',
--   '*/15 * * * *',
--   'SELECT cron_activate_extends()'
-- );
