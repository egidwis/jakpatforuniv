-- ============================================================
-- Migration 37: Ask the right question about reward batches
-- Date: 2026-08-03
--
-- Two independent money bugs, both rooted in the same wrong question.
--
-- BUG A — "is this a new month?" is asked against the FIRST schedule
-- ------------------------------------------------------------------
-- ExtendSection.computeIsNewMonth() compares the new schedule's end month
-- against the parent submission's end month. So schedule #3 landing in the same
-- month as schedule #2 is still judged "new month" whenever schedule #1 was in
-- an earlier month — the admin is forced to fund a fresh prize pool and the
-- respondent incentive for that batch gets billed twice.
--
-- The service rule is: a researcher may reuse the same reward for as long as it
-- has not been distributed, and a batch is a calendar month. So the question is
-- not "different month from the first schedule?" but "does this survey already
-- have a schedule in the target batch?". get_schedule_batch_context() answers
-- exactly that, server-side, using the same TO_CHAR(end_date, 'YYYY-MM')
-- expression as the compute_extend_period_batch() trigger — so the client can
-- never disagree with the stored period_batch.
--
-- Note it deliberately does NOT filter on payment. The question is whether a
-- pool has already been promised for the batch, not whether it has been paid
-- for; an unpaid first schedule has already had that incentive put on an
-- invoice, and charging it again is the very double-billing being fixed here.
-- Cancelled/rejected/spam schedules promised nothing and are excluded.
--
-- BUG B — the parent row is not filtered at all in get_batch_rewards
-- -------------------------------------------------------------------
-- Extends must be `payment_status = 'paid'` to contribute to a batch's
-- advertised prize; the parent form_submissions row was selected with no filter
-- whatsoever, so junk rows could contribute prize money.
--
-- ⚠️ A PAYMENT-BASED FILTER WAS TRIED AND REVERTED — do not reintroduce it.
-- The first version of this migration required the parent to be
-- `payment_status IN ('paid','completed')` or already airing. The pre-check at
-- the bottom of this file showed that removes the prize from 17 surveys whose
-- pages are published and whose prizes were advertised to respondents:
-- JAK2679, JAK2609, JAK2607, JAK2603, JAK2660, JAK2637, JAK2638, JAK2636,
-- JAK2635, JAK2634, JAK2633, JAK2632, JAK2630, EMJAK2609, plus three
-- researcher surveys.
--
-- Confirmed by the product owner 2026-08-03: those orders were **paid outside
-- the system**, so the row keeps `payment_status = 'pending'` forever while the
-- money did arrive. `payment_status` therefore is not evidence of non-payment
-- in this database, and nothing that decides whether a prize is real may be
-- built on it.
--
-- So the filter is the narrow one that is actually defensible: a rejected or
-- spam order never aired and never promised anything. Every such row in
-- production today has no published page, so this changes nothing that any
-- respondent ever saw — it only stops junk from being able to contribute.
--
-- Note this function is only ever called for a specific submission
-- (functions/api/respondents.js Mode 2, and the public page), and those callers
-- only reach surveys that have pages. A phantom prize on a spam row was never
-- actually reachable; the guard is correctness, not a live fix.
--
-- CONTRACT: get_batch_rewards keeps its exact signature and column list. It is
-- called by functions/api/respondents.js (Mode 2) for the lottery platform.
-- Only the numbers change, never the shape.
--
-- Idempotent: CREATE OR REPLACE only, no schema or data change.
-- RUN THE PRE-CHECK AT THE BOTTOM FIRST — it reports which surveys lose a batch.
-- DEPENDS ON sql/39 for airing_instant_of_date(); apply 39 before this file.
-- ============================================================

-- ============================================
-- 1. get_batch_rewards — parent row now filtered (BUG B)
-- ============================================
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
    -- Parent submission (the first schedule)
    SELECT
      TO_CHAR(fs.end_date, 'YYYY-MM') AS pb,
      fs.prize_per_winner AS base_p,
      0 AS add_p,
      fs.winner_count AS wc,
      fs.submission_status AS status,
      -- form_submissions stores DATE, extends store TIMESTAMPTZ. Left alone,
      -- the UNION below widens the DATE to midnight UTC (07:00 WIB), which is
      -- eight hours before the ad actually runs. Two visible effects: the batch
      -- period reported to the lottery platform started at 00:00, and
      -- `ap.ed > NOW()` went false eight hours early — so can_select_winners
      -- could say a batch was ready to draw while its ad was still collecting
      -- respondents. airing_instant_of_date() is defined in sql/39.
      airing_instant_of_date(fs.start_date) AS sd,
      airing_instant_of_date(fs.end_date)   AS ed
    FROM form_submissions fs
    WHERE fs.id = p_submission_id
      -- rejected/spam never aired and promised nothing. Deliberately NOT a
      -- payment check — see the header for why that was reverted.
      AND fs.submission_status NOT IN ('rejected', 'spam')

    UNION ALL

    -- Later schedules (only paid ones)
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
      BOOL_OR(
        ap.status IN ('live', 'scheduled', 'paid', 'waiting_payment')
        AND (ap.ed IS NULL OR ap.ed > NOW())
      ) AS has_active,
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


-- ============================================
-- 2. get_schedule_batch_context — replaces client-side computeIsNewMonth (BUG A)
-- ============================================
-- Given a survey and a candidate end_date, answer:
--   period_batch          — the batch the schedule would land in
--   is_new_batch          — true when no other live/planned schedule occupies it
--                           (=> a fresh pool must be funded, incentive billed)
--   pool_prize_per_winner — the pool already funded for that batch, if any,
--   pool_winner_count       computed as base + top-ups exactly like
--                           get_batch_rewards so the admin and the respondent
--                           are never shown two different prizes for one batch
--
-- One difference from get_batch_rewards is deliberate: that function counts
-- only PAID extends, this one counts every non-cancelled schedule. The billing
-- question is "has a pool been promised for this batch", and a pool sitting on
-- an unpaid invoice has been promised. So while a schedule is awaiting payment
-- the two can legitimately disagree; they converge once it is paid.
--
-- p_exclude_schedule_id lets an edit skip its own row.
CREATE OR REPLACE FUNCTION get_schedule_batch_context(
  p_submission_id UUID,
  p_end_date TIMESTAMPTZ,
  p_exclude_schedule_id UUID DEFAULT NULL
)
RETURNS TABLE (
  period_batch TEXT,
  is_new_batch BOOLEAN,
  pool_prize_per_winner INTEGER,
  pool_winner_count INTEGER
) AS $$
DECLARE
  -- identical expression to compute_extend_period_batch() in sql/19
  v_batch TEXT := TO_CHAR(p_end_date, 'YYYY-MM');
BEGIN
  RETURN QUERY
  WITH occupants AS (
    -- the first schedule
    SELECT
      COALESCE(fs.prize_per_winner, 0) AS prize,
      COALESCE(fs.winner_count, 0)     AS wc,
      0                                AS additional
    FROM form_submissions fs
    WHERE fs.id = p_submission_id
      AND fs.end_date IS NOT NULL
      AND TO_CHAR(fs.end_date, 'YYYY-MM') = v_batch
      AND fs.submission_status NOT IN ('rejected', 'spam')
      AND (p_exclude_schedule_id IS NULL OR fs.id <> p_exclude_schedule_id)

    UNION ALL

    -- every schedule after it
    SELECT
      COALESCE(e.prize_per_winner, 0)             AS prize,
      COALESCE(e.winner_count, 0)                 AS wc,
      COALESCE(e.additional_prize_per_winner, 0)  AS additional
    FROM form_submissions_extend e
    WHERE e.submission_id = p_submission_id
      AND e.period_batch = v_batch
      AND e.submission_status <> 'cancelled'
      AND (p_exclude_schedule_id IS NULL OR e.id <> p_exclude_schedule_id)
  )
  SELECT
    v_batch,
    NOT EXISTS (SELECT 1 FROM occupants),
    -- Same arithmetic as get_batch_rewards: base prize plus every top-up.
    -- These two must agree, otherwise the admin funding a schedule sees one
    -- prize while respondents are shown another for the same batch.
    -- NULLIF so a 0-prize row never masks the row that actually funded the pool.
    (COALESCE(MAX(NULLIF(o.prize, 0)), 0) + COALESCE(SUM(o.additional), 0))::INTEGER,
    COALESCE(MAX(NULLIF(o.wc, 0)), 0)::INTEGER
  FROM occupants o;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- PRE-CHECK — run BEFORE applying section 1, review the output
-- ============================================
-- Surveys whose parent row stops contributing a prize under the filter above.
-- Any row with page_was_published = true is a red flag: its respondents were
-- shown that prize on a live page. Ran 2026-08-03 against production — every
-- hit was an unpublished spam/rejected row, which is the intended target.
--
-- SELECT fs.id,
--        fs.title,
--        fs.submission_status,
--        fs.payment_status,
--        fs.prize_per_winner,
--        fs.winner_count,
--        TO_CHAR(fs.end_date, 'YYYY-MM') AS period_batch,
--        (sp.id IS NOT NULL)             AS page_was_published
-- FROM form_submissions fs
-- LEFT JOIN survey_pages sp ON sp.submission_id = fs.id
-- WHERE fs.end_date IS NOT NULL
--   AND COALESCE(fs.prize_per_winner, 0) > 0
--   AND fs.submission_status IN ('rejected', 'spam')
-- ORDER BY page_was_published DESC, fs.end_date DESC;

-- Surveys that were double-billed by the old is_new_month rule: a schedule
-- flagged is_new_month=true that landed in a batch another schedule already
-- occupied. These are past incidents — the fix stops new ones, it does not
-- refund these. Review and decide separately.
--
-- SELECT e.submission_id,
--        fs.title,
--        e.id AS extend_id,
--        e.period_batch,
--        e.start_date,
--        e.end_date,
--        e.prize_per_winner,
--        e.winner_count
-- FROM form_submissions_extend e
-- JOIN form_submissions fs ON fs.id = e.submission_id
-- WHERE e.is_new_month = true
--   AND e.submission_status <> 'cancelled'
--   AND (
--     TO_CHAR(fs.end_date, 'YYYY-MM') = e.period_batch
--     OR EXISTS (
--       SELECT 1 FROM form_submissions_extend o
--       WHERE o.submission_id = e.submission_id
--         AND o.id <> e.id
--         AND o.period_batch = e.period_batch
--         AND o.submission_status <> 'cancelled'
--         AND o.created_at < e.created_at
--     )
--   )
-- ORDER BY e.created_at DESC;
