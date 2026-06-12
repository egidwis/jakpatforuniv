-- Migration 22: Update get_batch_rewards RPC to return start_date and end_date
-- Date: 2026-06-12

CREATE OR REPLACE FUNCTION get_batch_rewards(p_submission_id UUID)
RETURNS TABLE (
  period_batch TEXT,
  prize_per_winner INTEGER,
  winner_count INTEGER,
  batch_status TEXT,
  can_select_winners BOOLEAN,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
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
      fs.submission_status AS status,
      fs.start_date AS sd,
      fs.end_date AS ed
    FROM form_submissions fs WHERE fs.id = p_submission_id

    UNION ALL

    -- Extends (only paid ones)
    SELECT
      e.period_batch AS pb,
      COALESCE(e.prize_per_winner, 0) AS base_p,
      COALESCE(e.additional_prize_per_winner, 0) AS add_p,
      COALESCE(e.winner_count, 0) AS wc,
      e.submission_status AS status,
      e.start_date AS sd,
      e.end_date AS ed
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
      BOOL_OR(ap.status IN ('live', 'scheduled', 'paid', 'waiting_payment')) AS has_active,
      MIN(ap.sd) AS start_d,
      MAX(ap.ed) AS end_d
    FROM all_periods ap
    GROUP BY ap.pb
  )
  SELECT
    ba.pb,
    (ba.base_prize + ba.total_additional)::INTEGER,
    ba.wc::INTEGER,
    CASE WHEN ba.has_active THEN 'active'::TEXT ELSE 'closed'::TEXT END,
    NOT ba.has_active,
    ba.start_d,
    ba.end_d
  FROM batch_agg ba
  ORDER BY ba.pb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
