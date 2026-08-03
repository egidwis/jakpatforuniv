-- ============================================================
-- Migration 36: Open the banner gate in cron_activate_extends()
-- Date: 2026-08-03
--
-- WHY
-- ---
-- Until now an extend could only go live if its survey page had
-- `requires_banner_update = false`. That flag is set by the DOKU webhook
-- (functions/api/doku/webhook.js) every time an extend payment is confirmed for
-- a new batch or with an additional prize — so *every* such extend starts life
-- gated, and stays dark until an admin manually clears the flag.
--
-- The cron has no catch-up window: it only activates rows where
-- `start_date <= NOW() AND end_date > NOW()`. An extend whose flag is not
-- cleared before `end_date` therefore never airs at all — the customer pays and
-- gets nothing. This has already happened in production.
--
-- Business decision (2026-08-03): an ad airs on schedule whether or not its
-- banner has been refreshed. A missing banner renders as no banner
-- (SurveyPage.tsx renders it conditionally), which is strictly better than a
-- dark ad. `requires_banner_update` keeps being set and keeps being shown in
-- Publish Pages — it is now an admin to-do marker, not a gate.
--
-- WHAT CHANGED vs migration 20
-- ----------------------------
-- 1. Dropped `AND (sp.requires_banner_update IS NULL OR sp.requires_banner_update = false)`
--    from the activation UPDATE.
-- 2. Dropped `FROM survey_pages sp` / `WHERE e.submission_id = sp.submission_id`
--    from that same UPDATE. With the flag check gone the join has no purpose,
--    and leaving it in would keep a second, quieter bug alive: an extend whose
--    submission has no survey_pages row could never activate, because the join
--    matched nothing.
--
-- The second UPDATE ("sync survey_pages dates") keeps its join — there the join
-- is the point, since survey_pages is the table being written.
--
-- KNOWN GAP (closed by the Phase 1 auto-publish work, not here)
-- ------------------------------------------------------------
-- Because of change 2, an extend belonging to a submission with no survey_pages
-- row will now reach `live` even though no public page exists. That is an
-- honest status rather than a silent freeze at `scheduled`, and it is visible
-- via the audit query at the bottom of this file. Auto-creating the page on
-- payment removes the case entirely.
--
-- Idempotent: CREATE OR REPLACE only. Safe to re-run. No schema change, no data
-- change. The pg_cron schedule set up in migration 20 keeps calling the same
-- function name, so nothing needs rescheduling.
-- ============================================================

CREATE OR REPLACE FUNCTION cron_activate_extends()
RETURNS void AS $$
BEGIN
  -- 1. Activate extends whose airing window has started.
  --    No banner gate, no survey_pages join — see header.
  UPDATE form_submissions_extend e
  SET submission_status = 'live',
      updated_at = NOW()
  WHERE e.submission_status = 'scheduled'
    AND e.payment_status = 'paid'
    AND e.start_date <= NOW()
    AND e.end_date > NOW();

  -- 2. Point the survey page at the currently airing extend.
  --    Join required: survey_pages is the target here.
  UPDATE survey_pages sp
  SET publish_start_date = e.start_date,
      publish_end_date = e.end_date,
      current_period_batch = e.period_batch
  FROM form_submissions_extend e
  WHERE e.submission_id = sp.submission_id
    AND e.submission_status = 'live'
    AND e.start_date <= NOW()
    AND e.end_date > NOW();

  -- 3. Close out extends whose window has passed.
  UPDATE form_submissions_extend
  SET submission_status = 'completed',
      updated_at = NOW()
  WHERE submission_status = 'live'
    AND end_date <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- Post-deploy audit — run manually, do not automate
-- ============================================
-- Extends that are paid but still sitting at 'scheduled'. Rows with
-- `end_date > NOW()` heal themselves on the next cron tick (or run
-- `SELECT cron_activate_extends();` to heal them immediately). Rows with
-- `end_date <= NOW()` have already lost their airing window; code cannot give
-- that back, so they are a commercial decision (re-air or refund) and must be
-- reported to a human rather than quietly patched.
--
-- SELECT e.id,
--        e.submission_id,
--        fs.title,
--        e.start_date,
--        e.end_date,
--        e.period_batch,
--        (e.end_date > NOW())              AS still_salvageable,
--        (sp.id IS NULL)                   AS has_no_survey_page,
--        sp.requires_banner_update
-- FROM form_submissions_extend e
-- LEFT JOIN form_submissions fs ON fs.id = e.submission_id
-- LEFT JOIN survey_pages     sp ON sp.submission_id = e.submission_id
-- WHERE e.submission_status = 'scheduled'
--   AND e.payment_status = 'paid'
-- ORDER BY e.start_date;
