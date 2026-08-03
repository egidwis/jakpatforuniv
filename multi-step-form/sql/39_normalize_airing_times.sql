-- ============================================================
-- Migration 39: RETRACTED — do not run
-- Date: 2026-08-03
--
-- WHAT THIS FILE ORIGINALLY TRIED TO DO, AND WHY IT WAS WRONG
-- -----------------------------------------------------------
-- It tried to normalise form_submissions.start_date / end_date to 15:00 WIB,
-- on the belief that some rows were stored at 00:00 UTC (07:00 WIB) — eight
-- hours early.
--
-- That belief came from misreading a query. The overlap report in sql/38 does
--
--     SELECT fs.start_date ... UNION ALL SELECT e.start_date ...
--
-- and UNION has to settle on one type. form_submissions.start_date is DATE,
-- form_submissions_extend.start_date is TIMESTAMPTZ, so the DATE was widened to
-- midnight UTC in the output. The "00:00:00+00" was produced by that cast. It
-- was never stored, and no ad ever aired at 07:00 WIB.
--
-- Verified 2026-08-03 via information_schema.columns:
--     form_submissions.start_date        date
--     form_submissions.end_date          date
--     form_submissions_extend.start_date timestamp with time zone
--     form_submissions_extend.end_date   timestamp with time zone
--     survey_pages.publish_start_date    timestamp with time zone
--     survey_pages.publish_end_date      timestamp with time zone
--
-- CONSEQUENCE OF HAVING RUN IT
-- ----------------------------
-- It was applied to production before the mistake was caught. Assigning a
-- TIMESTAMPTZ to a DATE column truncates it back to the same date, so no
-- schedule, price or status changed. What did change is `updated_at`: 847 of
-- 849 scheduled rows were stamped with the migration's run time. Not
-- recoverable short of PITR, and not worth PITR.
--
-- The WHERE clauses could never be satisfied either — a DATE cast to TIMESTAMPTZ
-- is always midnight and never equals 15:00 WIB — so re-running would rewrite
-- every row again, forever, while changing nothing.
--
-- THE ACTUAL MODEL
-- ----------------
-- The first schedule stores a DATE. Its time of day is a convention, not data:
-- the ad airs from that date at 15:00 WIB until end_date at 15:00 WIB. The
-- instant that actually gates the public page lives in survey_pages
-- (publish_start_date / publish_end_date, TIMESTAMPTZ), which is already
-- correct. There is nothing to normalise in form_submissions.
--
-- WHAT REMAINS BELOW
-- ------------------
-- Only the helpers. They are needed by sql/38, which has to compare a DATE
-- window against a TIMESTAMPTZ window and must lift the DATE to the right
-- instant first. No UPDATE statements — this file is now inert.
-- ============================================================

-- 15:00 WIB on the WIB day a DATE denotes. Built as `date + time` so it never
-- depends on the session TimeZone: casting a DATE to TIMESTAMPTZ first would
-- land on the previous WIB day for any session east of UTC+7.
CREATE OR REPLACE FUNCTION airing_instant_of_date(d DATE)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT (d + TIME '15:00') AT TIME ZONE 'Asia/Jakarta';
$$;

COMMENT ON FUNCTION airing_instant_of_date(DATE) IS
  'The instant a schedule stored as a DATE actually starts/ends: 15:00 WIB on that day. Use whenever a form_submissions date is compared against a TIMESTAMPTZ.';

-- Same idea for a value that already carries a time: pin it to 15:00 WIB on the
-- WIB day it falls on. Kept for ad-hoc reporting on the TIMESTAMPTZ tables.
CREATE OR REPLACE FUNCTION to_airing_instant(ts TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT (date_trunc('day', ts AT TIME ZONE 'Asia/Jakarta') + INTERVAL '15 hours')
           AT TIME ZONE 'Asia/Jakarta';
$$;
