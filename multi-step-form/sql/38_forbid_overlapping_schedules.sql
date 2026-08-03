-- ============================================================
-- Migration 38: One survey cannot air in two windows at once
-- Date: 2026-08-03
--
-- WHY
-- ---
-- A survey's schedules are meant to be consecutive, never concurrent — a page
-- can only be airing in one window at a time, so an overlap has no meaning to
-- begin with. Nothing enforced that until now, and the ambiguity leaks
-- outwards: /api/respondents Mode 2 sends respondents as a flat list (only
-- `submitted_at`) alongside a separate `batches` array, so the lottery platform
-- infers which batch a respondent belongs to from `period.start`/`period.end`.
-- Two overlapping schedules from different batches put a respondent inside two
-- batch ranges at once, and nothing in the payload breaks the tie.
--
-- The cheap alternative would have been adding `period_batch` to every
-- respondent row — but that changes the shape of a third-party API contract.
-- Forbidding the overlap gets the same guarantee and leaves the contract
-- untouched: if windows never intersect, the inference is always unambiguous.
--
-- WINDOW CONVENTION
-- -----------------
-- Half-open [start_date, end_date), matching the slot counter in
-- fetchSlotAvailability (`while (current < endDay)`). So a schedule ending on
-- the 8th and one starting on the 8th do NOT overlap — the end date is the
-- hand-over day, not an aired day.
--
-- ⚠️ THE TWO TABLES DO NOT STORE THE SAME TYPE.
--     form_submissions.start_date / end_date        DATE
--     form_submissions_extend.start_date / end_date TIMESTAMPTZ
-- A DATE carries no time of day; the convention is that it means 15:00 WIB on
-- that day. Comparing the two directly makes Postgres widen the DATE to
-- midnight UTC — 07:00 WIB — so the parent window reads eight hours early at
-- both ends and neighbouring schedules are judged wrongly. Every cross-table
-- comparison below therefore lifts the DATE through airing_instant_of_date()
-- (sql/39) first. Do not remove those calls.
--
-- WHAT DOES NOT OCCUPY A WINDOW
-- -----------------------------
-- Extends with submission_status = 'cancelled', and parent submissions that are
-- 'rejected' or 'spam'. Those promised nothing and never aired.
--
-- ⚠️ RUN THE PRE-CHECK AT THE BOTTOM BEFORE CREATING THE TRIGGERS. If legacy
-- rows already overlap, the triggers will block any future date edit on those
-- rows — which is correct, but you want to know about it in advance rather than
-- discover it when an admin is mid-reschedule.
--
-- Production on 2026-08-03 had two such pairs: "Studi Pengambilan Keputusan"
-- (parent 2–4 Aug, extend 2–4 Aug) and "Faktor-Faktor Psikologis" (parent
-- 30 Jul–4 Aug, extend 30 Jul–4 Aug). Once the DATE is lifted correctly these
-- are not near-misses — each parent window is *identical* to its own extend's,
-- so the survey has two schedules describing exactly the same days. That is a
-- genuine duplicate, not a rounding artefact, and what to do about it is a
-- business decision. Nothing breaks while they sit there; only a future date
-- edit on those rows is refused, which is the correct refusal.
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS. No data change.
-- ============================================================

CREATE OR REPLACE FUNCTION assert_no_schedule_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_submission_id UUID;
  v_start         TIMESTAMPTZ;
  v_end           TIMESTAMPTZ;
  v_conflict      RECORD;
  v_is_extend     BOOLEAN := (TG_TABLE_NAME = 'form_submissions_extend');
BEGIN
  -- Lift the row being written onto the same timeline as everything it will be
  -- compared against: extends already carry an instant, a parent DATE means
  -- 15:00 WIB on that day.
  IF v_is_extend THEN
    v_start := NEW.start_date;
    v_end   := NEW.end_date;
  ELSE
    v_start := airing_instant_of_date(NEW.start_date);
    v_end   := airing_instant_of_date(NEW.end_date);
  END IF;

  -- A half-specified window cannot overlap anything yet.
  IF v_start IS NULL OR v_end IS NULL THEN
    RETURN NEW;
  END IF;

  -- ⚠️ Only validate when the window itself is being placed or moved, or when
  -- a dormant schedule is being revived. A status transition on a row that
  -- already overlaps must NEVER raise: cron_activate_extends() flips
  -- submission_status for every due schedule in one statement, so one legacy
  -- overlapping row would abort the whole run and freeze scheduling for
  -- everybody. Two such rows existed in production when this shipped.
  -- Nested, not chained: OLD is unassigned on INSERT and SQL does not promise
  -- left-to-right short-circuiting, so touching OLD in the same condition as
  -- the TG_OP test can abort every insert with "record OLD is not assigned".
  IF TG_OP = 'UPDATE' THEN
    IF NEW.start_date IS NOT DISTINCT FROM OLD.start_date
       AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date
       AND NOT (
         OLD.submission_status IN ('cancelled', 'rejected', 'spam')
         AND NEW.submission_status NOT IN ('cancelled', 'rejected', 'spam')
       )
    THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_is_extend THEN
    v_submission_id := NEW.submission_id;
    IF NEW.submission_status = 'cancelled' THEN
      RETURN NEW;
    END IF;
  ELSE
    v_submission_id := NEW.id;
    IF NEW.submission_status IN ('rejected', 'spam') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- 1. Against the first schedule (only relevant when a later one is written).
  IF v_is_extend THEN
    SELECT airing_instant_of_date(fs.start_date) AS start_date,
           airing_instant_of_date(fs.end_date)   AS end_date
      INTO v_conflict
    FROM form_submissions fs
    WHERE fs.id = v_submission_id
      AND fs.start_date IS NOT NULL
      AND fs.end_date IS NOT NULL
      AND fs.submission_status NOT IN ('rejected', 'spam')
      AND v_start < airing_instant_of_date(fs.end_date)
      AND airing_instant_of_date(fs.start_date) < v_end
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'Jadwal beririsan dengan jadwal pertama survei ini (% s/d %). Satu survei hanya bisa tayang di satu periode pada satu waktu.',
        TO_CHAR(v_conflict.start_date, 'DD Mon YYYY'),
        TO_CHAR(v_conflict.end_date, 'DD Mon YYYY');
    END IF;
  END IF;

  -- 2. Against every other schedule of the same survey.
  SELECT e.start_date, e.end_date
    INTO v_conflict
  FROM form_submissions_extend e
  WHERE e.submission_id = v_submission_id
    AND (NOT v_is_extend OR e.id <> NEW.id)
    AND e.submission_status <> 'cancelled'
    AND e.start_date IS NOT NULL
    AND e.end_date IS NOT NULL
    AND v_start < e.end_date
    AND e.start_date < v_end
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Jadwal beririsan dengan jadwal lain survei ini (% s/d %). Satu survei hanya bisa tayang di satu periode pada satu waktu.',
      TO_CHAR(v_conflict.start_date, 'DD Mon YYYY'),
      TO_CHAR(v_conflict.end_date, 'DD Mon YYYY');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_extend_no_overlap ON form_submissions_extend;
CREATE TRIGGER trg_extend_no_overlap
  BEFORE INSERT OR UPDATE OF start_date, end_date, submission_status
  ON form_submissions_extend
  FOR EACH ROW EXECUTE FUNCTION assert_no_schedule_overlap();

DROP TRIGGER IF EXISTS trg_submission_no_overlap ON form_submissions;
CREATE TRIGGER trg_submission_no_overlap
  BEFORE UPDATE OF start_date, end_date
  ON form_submissions
  FOR EACH ROW EXECUTE FUNCTION assert_no_schedule_overlap();


-- ============================================
-- PRE-CHECK — run BEFORE creating the triggers
-- ============================================
-- Every pair of currently overlapping schedules within one survey. An empty
-- result means the triggers can go in with no legacy fallout.
--
-- Note the airing_instant_of_date() calls: without them the UNION widens the
-- parent DATE to midnight UTC and every comparison here is off by eight hours.
--
-- WITH windows AS (
--   SELECT fs.id AS submission_id, fs.id AS schedule_id, 'jadwal-1' AS kind,
--          airing_instant_of_date(fs.start_date) AS start_date,
--          airing_instant_of_date(fs.end_date)   AS end_date
--   FROM form_submissions fs
--   WHERE fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
--     AND fs.submission_status NOT IN ('rejected', 'spam')
--   UNION ALL
--   SELECT e.submission_id, e.id, 'lanjutan', e.start_date, e.end_date
--   FROM form_submissions_extend e
--   WHERE e.start_date IS NOT NULL AND e.end_date IS NOT NULL
--     AND e.submission_status <> 'cancelled'
-- )
-- SELECT a.submission_id,
--        fs.title,
--        a.kind AS kind_a, a.start_date AS start_a, a.end_date AS end_a,
--        b.kind AS kind_b, b.start_date AS start_b, b.end_date AS end_b
-- FROM windows a
-- JOIN windows b
--   ON a.submission_id = b.submission_id
--  AND a.schedule_id < b.schedule_id
--  AND a.start_date < b.end_date
--  AND b.start_date < a.end_date
-- JOIN form_submissions fs ON fs.id = a.submission_id
-- ORDER BY a.start_date DESC;
