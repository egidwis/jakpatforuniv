-- ============================================================
-- Migration 41: ad_schedules — one row per airing window (EXPAND step)
-- Date: 2026-08-03
-- Phase 2, Task 8 of docs/superpowers/plans/2026-08-03-jadwal-iklan-redesign.md
--
-- WHAT THIS IS
-- ------------
-- A survey's first airing window lives in form_submissions (start_date,
-- end_date, duration, prize_per_winner, …) and every later one lives in
-- form_submissions_extend. Two tables, different column types, different status
-- vocabularies, different time rules — the shared root of the three separate
-- bugs patched in Phase 0 (slot quota, double-billed incentive, clobbered
-- window). ad_schedules makes "one row = one airing window" true for the FIRST
-- schedule too, so admin and user finally read the same rows.
--
-- THIS FILE IS EXPAND-ONLY. Nothing reads ad_schedules yet and nothing writes
-- it directly. It is a read-model kept in sync by triggers on the two old
-- tables, plus a backfill. Every existing reader and writer keeps working
-- untouched, and the migration can be abandoned at any point with no fallout.
--
-- ONE DIRECTION ONLY (old → new)
-- ------------------------------
-- The plan called for two-way triggers. At Task 8 there is no writer on the new
-- side to trigger the reverse direction, and skipping it removes three risk
-- surfaces at once:
--   * no UPDATE back into form_submissions, so guard_payment_columns (sql/33)
--     is never quietly bypassed by a new code path;
--   * trg_submission_no_overlap (sql/38) is never fired from a mirror write;
--   * with no trigger on ad_schedules itself, recursion is impossible — no
--     pg_trigger_depth() guard needed.
-- The reverse direction belongs to whichever task first moves a real writer.
--
-- ⚠️ TIME TYPES — THE TRAP THAT ALREADY BIT ONCE (sql/39)
-- form_submissions.start_date / end_date        DATE
-- form_submissions_extend.start_date / end_date TIMESTAMPTZ
-- A DATE carries no time of day; the convention is 15:00 WIB on that day.
-- Casting it straight to TIMESTAMPTZ lands on 00:00 UTC = 07:00 WIB — eight
-- hours early at both ends. Every parent date below therefore goes through
-- airing_instant_of_date() (sql/39). Do not remove those calls.
--
-- ⚠️ NO CHECK CONSTRAINT ON status / payment_status — ON PURPOSE
-- A mirror must never be able to reject what the source accepted. A CHECK that
-- fails on some unforeseen production value would make the trigger throw and
-- take down the *old* flow — the one thing this file must never do. The
-- intended vocabularies live in COMMENTs, and section 6 has a query that lists
-- what is actually in there. The constraints land in the task that makes
-- ad_schedules authoritative.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER IF EXISTS, INSERT … ON CONFLICT DO UPDATE. Safe to re-run.
-- DEPENDS ON sql/39 for airing_instant_of_date(). Apply 39 first.
-- RUN THE PRE-CHECK IN SECTION 6 BEFORE APPLYING.
-- ============================================================


-- ============================================
-- 1. Table
-- ============================================
CREATE TABLE IF NOT EXISTS ad_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,

  -- 1 = the first schedule (the form_submissions row). Later schedules are
  -- 2..n ordered by start_date. Ordinal 1 is ALWAYS reserved for the parent,
  -- even when the parent has no dates yet, so schedule numbers never shift
  -- under a researcher if the first window is booked later.
  ordinal       INTEGER NOT NULL,

  -- Provenance. Not in the original plan, but without it the mirror would have
  -- to re-derive the ordinal on every sync just to find its own row. It is also
  -- what makes the whole file idempotent: it is the ON CONFLICT target.
  source_table  TEXT NOT NULL CHECK (source_table IN ('form_submissions', 'form_submissions_extend')),
  source_id     UUID NOT NULL,

  -- Always an instant, never a DATE. Parent dates are lifted to 15:00 WIB.
  start_date    TIMESTAMPTZ,
  end_date      TIMESTAMPTZ,
  duration      INTEGER,

  status         TEXT,
  payment_status TEXT,

  prize_per_winner            INTEGER DEFAULT 0,
  winner_count                INTEGER DEFAULT 0,
  additional_prize_per_winner INTEGER DEFAULT 0,

  is_new_period BOOLEAN DEFAULT false,
  period_batch  TEXT,

  total_cost    BIGINT DEFAULT 0,
  subtotal      BIGINT,
  ppn_amount    BIGINT,
  voucher_code  TEXT,

  slot_booked_by   TEXT,
  slot_reserved_at TIMESTAMPTZ,
  admin_notes      TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Upsert target for the mirror. Deliberately NOT deferrable: ON CONFLICT
  -- cannot use a deferrable constraint.
  CONSTRAINT ad_schedules_source_key UNIQUE (source_table, source_id)
);

-- Renumbering runs as a single multi-row UPDATE, which transiently violates
-- uniqueness mid-statement (2→3 while 3 still exists). Deferring the check to
-- COMMIT is what makes that legal.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ad_schedules_ordinal_key'
  ) THEN
    ALTER TABLE ad_schedules
      ADD CONSTRAINT ad_schedules_ordinal_key
      UNIQUE (submission_id, ordinal) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ad_schedules_submission ON ad_schedules(submission_id);
CREATE INDEX IF NOT EXISTS idx_ad_schedules_dates      ON ad_schedules(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_ad_schedules_batch      ON ad_schedules(period_batch);
CREATE INDEX IF NOT EXISTS idx_ad_schedules_status     ON ad_schedules(status);

COMMENT ON TABLE ad_schedules IS
  'One row per airing window, including the first one. Phase 2 Task 8: read-model only — populated by triggers on form_submissions and form_submissions_extend, never written directly. Do not point application writes here until the task that moves them says so.';
COMMENT ON COLUMN ad_schedules.status IS
  'Airing lifecycle only: waiting_payment | paid | scheduled | live | completed | cancelled. Intentionally unconstrained while this table is a mirror — see file header.';
COMMENT ON COLUMN ad_schedules.payment_status IS
  'Copied verbatim from the source row (pending | paid | expired | failed, and ''completed'' on some legacy form_submissions rows). Normalisation is Task 10 work, not a mirror concern.';
COMMENT ON COLUMN ad_schedules.period_batch IS
  'Copied from the source, never recomputed here. Parent rows use TO_CHAR(form_submissions.end_date, ''YYYY-MM'') — the exact expression get_batch_rewards uses; extends copy the value compute_extend_period_batch() already stored. Anything else risks drifting from what the lottery platform is told.';
COMMENT ON COLUMN ad_schedules.ordinal IS
  '1 = the first schedule (form_submissions), 2..n = later schedules ordered by start_date. Ordinal 1 stays reserved for the parent even when it has no dates.';


-- ============================================
-- 2. RLS
-- ============================================
-- Nothing client-side reads this table in Task 8, so it opens no wider than it
-- has to. Read = owner or admin, following the newer convention (sql/24, 28,
-- 35) rather than the blanket `authenticated → true` that sql/21 left on
-- form_submissions_extend. No INSERT/UPDATE/DELETE policy at all: writes are
-- the triggers' job, and those are SECURITY DEFINER.
ALTER TABLE ad_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner or admin can view ad_schedules" ON ad_schedules;
CREATE POLICY "Owner or admin can view ad_schedules"
  ON ad_schedules FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'product@jakpat.net'
    OR submission_id IN (
      SELECT id FROM form_submissions
      WHERE auth_user_id = auth.uid()
         OR (auth_user_id IS NULL AND email = (auth.jwt() ->> 'email'))
    )
  );

DROP POLICY IF EXISTS "Service role full access ad_schedules" ON ad_schedules;
CREATE POLICY "Service role full access ad_schedules"
  ON ad_schedules FOR ALL
  USING (auth.role() = 'service_role');


-- ============================================
-- 3. Ordinal renumbering
-- ============================================
-- Later schedules are numbered by when they air, not by when they were created,
-- so inserting a schedule that starts earlier than an existing one renumbers the
-- rest. Ties break on created_at then id so the result is deterministic.
CREATE OR REPLACE FUNCTION resync_ad_schedule_ordinals(p_submission_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ad_schedules a
  SET ordinal = r.new_ordinal
  FROM (
    SELECT id,
           1 + ROW_NUMBER() OVER (
             ORDER BY start_date NULLS LAST, created_at, id
           ) AS new_ordinal
    FROM ad_schedules
    WHERE submission_id = p_submission_id
      AND source_table = 'form_submissions_extend'
  ) r
  WHERE a.id = r.id
    AND a.ordinal IS DISTINCT FROM r.new_ordinal;
END;
$$;


-- ============================================
-- 4. Mirror: form_submissions → ad_schedules (ordinal 1)
-- ============================================
-- The parent row is an ORDER that may never become a schedule, so its mirror
-- row exists if and only if it has a start_date. An extend row, by contrast, IS
-- a schedule by construction and always gets a row (section 5). That asymmetry
-- is deliberate — it is what makes the row-count check in section 6 meaningful.
--
-- Status mapping. form_submissions carries the review axis and the airing axis
-- in one column, plus a legacy `status` column that deriveLifecycle still reads
-- (src/components/submissions/lifecycle.ts). Both are folded down here:
--   1. rejected/spam           → cancelled   (beats everything; sql/38 already
--                                             treats them as occupying nothing)
--   2. legacy status live/scheduled/completed → that value (those rows were
--                                             never transitioned in
--                                             submission_status)
--   3. submission_status in the airing vocabulary → itself
--   4. in_review/approved/slot_reserved/anything else → waiting_payment
--
-- NOT derived here: 'completed' from an end_date in the past. deriveLifecycle
-- infers that client-side today; copying the inference would create a second
-- source that drifts. The mirror stays literal. Moving that logic is Task 9.
CREATE OR REPLACE FUNCTION sync_ad_schedule_from_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.start_date IS NULL THEN
    DELETE FROM ad_schedules
    WHERE source_table = 'form_submissions' AND source_id = NEW.id;
    RETURN NULL;
  END IF;

  INSERT INTO ad_schedules (
    submission_id, ordinal, source_table, source_id,
    start_date, end_date, duration,
    status, payment_status,
    prize_per_winner, winner_count, additional_prize_per_winner,
    is_new_period, period_batch,
    total_cost, subtotal, ppn_amount, voucher_code,
    slot_booked_by, slot_reserved_at, admin_notes,
    created_at, updated_at
  )
  VALUES (
    NEW.id, 1, 'form_submissions', NEW.id,
    airing_instant_of_date(NEW.start_date),
    airing_instant_of_date(NEW.end_date),
    NEW.duration,
    CASE
      WHEN NEW.submission_status IN ('rejected', 'spam') THEN 'cancelled'
      WHEN NEW.status IN ('live', 'scheduled', 'completed') THEN NEW.status
      WHEN NEW.submission_status IN ('waiting_payment', 'paid', 'scheduled', 'live', 'completed')
        THEN NEW.submission_status
      ELSE 'waiting_payment'
    END,
    NEW.payment_status,
    COALESCE(NEW.prize_per_winner, 0),
    COALESCE(NEW.winner_count, 0),
    0,                      -- top-ups only ever attach to later schedules
    false,                  -- the first schedule opens the first pool by definition
    TO_CHAR(NEW.end_date, 'YYYY-MM'),
    COALESCE(NEW.total_cost, 0), NEW.subtotal, NEW.ppn_amount, NEW.voucher_code,
    NEW.slot_booked_by, NEW.slot_reserved_at, NEW.admin_notes,
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT ON CONSTRAINT ad_schedules_source_key DO UPDATE SET
    start_date       = EXCLUDED.start_date,
    end_date         = EXCLUDED.end_date,
    duration         = EXCLUDED.duration,
    status           = EXCLUDED.status,
    payment_status   = EXCLUDED.payment_status,
    prize_per_winner = EXCLUDED.prize_per_winner,
    winner_count     = EXCLUDED.winner_count,
    period_batch     = EXCLUDED.period_batch,
    total_cost       = EXCLUDED.total_cost,
    subtotal         = EXCLUDED.subtotal,
    ppn_amount       = EXCLUDED.ppn_amount,
    voucher_code     = EXCLUDED.voucher_code,
    slot_booked_by   = EXCLUDED.slot_booked_by,
    slot_reserved_at = EXCLUDED.slot_reserved_at,
    admin_notes      = EXCLUDED.admin_notes,
    updated_at       = EXCLUDED.updated_at;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_schedule_from_submission ON form_submissions;
CREATE TRIGGER trg_ad_schedule_from_submission
  AFTER INSERT OR UPDATE OF
    start_date, end_date, duration, submission_status, status, payment_status,
    prize_per_winner, winner_count, total_cost, subtotal, ppn_amount,
    voucher_code, slot_booked_by, slot_reserved_at, admin_notes
  ON form_submissions
  FOR EACH ROW EXECUTE FUNCTION sync_ad_schedule_from_submission();


-- ============================================
-- 5. Mirror: form_submissions_extend → ad_schedules (ordinal 2..n)
-- ============================================
-- Extends already store instants and already use the target status vocabulary,
-- so this is a straight copy. period_batch is copied, never recomputed — the
-- value compute_extend_period_batch() stored is what the rest of the system
-- (and the lottery platform) has already been told.
CREATE OR REPLACE FUNCTION sync_ad_schedule_from_extend()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_submission_id := OLD.submission_id;
    DELETE FROM ad_schedules
    WHERE source_table = 'form_submissions_extend' AND source_id = OLD.id;
    PERFORM resync_ad_schedule_ordinals(v_submission_id);
    RETURN NULL;
  END IF;

  v_submission_id := NEW.submission_id;

  -- Ordinal 2 is a placeholder: resync below assigns the real number before the
  -- statement ends, and ad_schedules_ordinal_key is deferred to COMMIT, so a
  -- transient collision here is legal.
  INSERT INTO ad_schedules (
    submission_id, ordinal, source_table, source_id,
    start_date, end_date, duration,
    status, payment_status,
    prize_per_winner, winner_count, additional_prize_per_winner,
    is_new_period, period_batch,
    total_cost, subtotal, ppn_amount, voucher_code,
    slot_booked_by, slot_reserved_at, admin_notes,
    created_at, updated_at
  )
  VALUES (
    NEW.submission_id, 2, 'form_submissions_extend', NEW.id,
    NEW.start_date, NEW.end_date, NEW.duration,
    COALESCE(NEW.submission_status, 'waiting_payment'),
    NEW.payment_status,
    COALESCE(NEW.prize_per_winner, 0),
    COALESCE(NEW.winner_count, 0),
    COALESCE(NEW.additional_prize_per_winner, 0),
    COALESCE(NEW.is_new_month, false),
    NEW.period_batch,
    COALESCE(NEW.total_cost, 0), NEW.subtotal, NEW.ppn_amount, NEW.voucher_code,
    NEW.slot_booked_by, NEW.slot_reserved_at, NEW.admin_notes,
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT ON CONSTRAINT ad_schedules_source_key DO UPDATE SET
    start_date                  = EXCLUDED.start_date,
    end_date                    = EXCLUDED.end_date,
    duration                    = EXCLUDED.duration,
    status                      = EXCLUDED.status,
    payment_status              = EXCLUDED.payment_status,
    prize_per_winner            = EXCLUDED.prize_per_winner,
    winner_count                = EXCLUDED.winner_count,
    additional_prize_per_winner = EXCLUDED.additional_prize_per_winner,
    is_new_period               = EXCLUDED.is_new_period,
    period_batch                = EXCLUDED.period_batch,
    total_cost                  = EXCLUDED.total_cost,
    subtotal                    = EXCLUDED.subtotal,
    ppn_amount                  = EXCLUDED.ppn_amount,
    voucher_code                = EXCLUDED.voucher_code,
    slot_booked_by              = EXCLUDED.slot_booked_by,
    slot_reserved_at            = EXCLUDED.slot_reserved_at,
    admin_notes                 = EXCLUDED.admin_notes,
    updated_at                  = EXCLUDED.updated_at;

  -- Only renumber when the ordering could actually have moved. This matters:
  -- cron_activate_extends() flips submission_status for every due schedule in
  -- one statement, and without this guard each of those rows would drag a
  -- pointless renumber pass behind it.
  IF TG_OP = 'INSERT' OR NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    PERFORM resync_ad_schedule_ordinals(v_submission_id);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_schedule_from_extend ON form_submissions_extend;
CREATE TRIGGER trg_ad_schedule_from_extend
  AFTER INSERT OR DELETE OR UPDATE OF
    start_date, end_date, duration, submission_status, payment_status,
    prize_per_winner, winner_count, additional_prize_per_winner, is_new_month,
    period_batch, total_cost, subtotal, ppn_amount, voucher_code,
    slot_booked_by, slot_reserved_at, admin_notes
  ON form_submissions_extend
  FOR EACH ROW EXECUTE FUNCTION sync_ad_schedule_from_extend();


-- ============================================
-- 6. Backfill
-- ============================================
-- Same mapping as the triggers, expressed set-wise. Idempotent: re-running
-- refreshes existing rows instead of duplicating them.

-- 6a. First schedules.
INSERT INTO ad_schedules (
  submission_id, ordinal, source_table, source_id,
  start_date, end_date, duration,
  status, payment_status,
  prize_per_winner, winner_count, additional_prize_per_winner,
  is_new_period, period_batch,
  total_cost, subtotal, ppn_amount, voucher_code,
  slot_booked_by, slot_reserved_at, admin_notes,
  created_at, updated_at
)
SELECT
  fs.id, 1, 'form_submissions', fs.id,
  airing_instant_of_date(fs.start_date),
  airing_instant_of_date(fs.end_date),
  fs.duration,
  CASE
    WHEN fs.submission_status IN ('rejected', 'spam') THEN 'cancelled'
    WHEN fs.status IN ('live', 'scheduled', 'completed') THEN fs.status
    WHEN fs.submission_status IN ('waiting_payment', 'paid', 'scheduled', 'live', 'completed')
      THEN fs.submission_status
    ELSE 'waiting_payment'
  END,
  fs.payment_status,
  COALESCE(fs.prize_per_winner, 0),
  COALESCE(fs.winner_count, 0),
  0,
  false,
  TO_CHAR(fs.end_date, 'YYYY-MM'),
  COALESCE(fs.total_cost, 0), fs.subtotal, fs.ppn_amount, fs.voucher_code,
  fs.slot_booked_by, fs.slot_reserved_at, fs.admin_notes,
  COALESCE(fs.created_at, NOW()), COALESCE(fs.updated_at, NOW())
FROM form_submissions fs
WHERE fs.start_date IS NOT NULL
ON CONFLICT ON CONSTRAINT ad_schedules_source_key DO UPDATE SET
  start_date       = EXCLUDED.start_date,
  end_date         = EXCLUDED.end_date,
  duration         = EXCLUDED.duration,
  status           = EXCLUDED.status,
  payment_status   = EXCLUDED.payment_status,
  prize_per_winner = EXCLUDED.prize_per_winner,
  winner_count     = EXCLUDED.winner_count,
  period_batch     = EXCLUDED.period_batch,
  total_cost       = EXCLUDED.total_cost,
  subtotal         = EXCLUDED.subtotal,
  ppn_amount       = EXCLUDED.ppn_amount,
  voucher_code     = EXCLUDED.voucher_code,
  slot_booked_by   = EXCLUDED.slot_booked_by,
  slot_reserved_at = EXCLUDED.slot_reserved_at,
  admin_notes      = EXCLUDED.admin_notes,
  updated_at       = EXCLUDED.updated_at;

-- 6b. Later schedules, numbered by when they air.
INSERT INTO ad_schedules (
  submission_id, ordinal, source_table, source_id,
  start_date, end_date, duration,
  status, payment_status,
  prize_per_winner, winner_count, additional_prize_per_winner,
  is_new_period, period_batch,
  total_cost, subtotal, ppn_amount, voucher_code,
  slot_booked_by, slot_reserved_at, admin_notes,
  created_at, updated_at
)
SELECT
  e.submission_id,
  1 + ROW_NUMBER() OVER (
    PARTITION BY e.submission_id
    ORDER BY e.start_date NULLS LAST, e.created_at, e.id
  ),
  'form_submissions_extend', e.id,
  e.start_date, e.end_date, e.duration,
  COALESCE(e.submission_status, 'waiting_payment'),
  e.payment_status,
  COALESCE(e.prize_per_winner, 0),
  COALESCE(e.winner_count, 0),
  COALESCE(e.additional_prize_per_winner, 0),
  COALESCE(e.is_new_month, false),
  e.period_batch,
  COALESCE(e.total_cost, 0), e.subtotal, e.ppn_amount, e.voucher_code,
  e.slot_booked_by, e.slot_reserved_at, e.admin_notes,
  COALESCE(e.created_at, NOW()), COALESCE(e.updated_at, NOW())
FROM form_submissions_extend e
ON CONFLICT ON CONSTRAINT ad_schedules_source_key DO UPDATE SET
  ordinal                     = EXCLUDED.ordinal,
  start_date                  = EXCLUDED.start_date,
  end_date                    = EXCLUDED.end_date,
  duration                    = EXCLUDED.duration,
  status                      = EXCLUDED.status,
  payment_status              = EXCLUDED.payment_status,
  prize_per_winner            = EXCLUDED.prize_per_winner,
  winner_count                = EXCLUDED.winner_count,
  additional_prize_per_winner = EXCLUDED.additional_prize_per_winner,
  is_new_period               = EXCLUDED.is_new_period,
  period_batch                = EXCLUDED.period_batch,
  total_cost                  = EXCLUDED.total_cost,
  subtotal                    = EXCLUDED.subtotal,
  ppn_amount                  = EXCLUDED.ppn_amount,
  voucher_code                = EXCLUDED.voucher_code,
  slot_booked_by              = EXCLUDED.slot_booked_by,
  slot_reserved_at            = EXCLUDED.slot_reserved_at,
  admin_notes                 = EXCLUDED.admin_notes,
  updated_at                  = EXCLUDED.updated_at;


-- ============================================
-- 7. PRE-CHECK — run BEFORE applying sections 1-6
-- ============================================
-- Nothing here writes. Run them ONE AT A TIME — the Supabase SQL Editor only
-- shows the last statement's result when several are run together.
--
-- -- (0a) Dependency: airing_instant_of_date() from sql/39. Must return 1 row.
-- -- Zero rows means apply sql/39 first — without it sections 4 and 6a fail.
-- SELECT p.proname,
--        pg_get_function_arguments(p.oid) AS argumen,
--        pg_get_function_result(p.oid)    AS hasil
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'airing_instant_of_date';
--
-- -- (0b) Fresh install or a re-run? 0 = fresh. 1 = already applied once; this
-- -- file is idempotent so a re-run is safe, but know it before reading §8.
-- SELECT COUNT(*) AS ad_schedules_sudah_ada
-- FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'ad_schedules';
--
-- -- (0c) Every column this file reads off form_submissions must exist — MUST
-- -- return 18 rows. The list was verified against the app's own insert/update
-- -- payloads (StepCheckout.tsx, supabase.ts, sql/33, sql/34), not against the
-- -- live schema.
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'form_submissions'
--   AND column_name IN (
--     'start_date','end_date','duration','status','submission_status',
--     'payment_status','prize_per_winner','winner_count','total_cost',
--     'subtotal','ppn_amount','voucher_code','slot_booked_by',
--     'slot_reserved_at','admin_notes','created_at','updated_at','auth_user_id'
--   )
-- ORDER BY column_name;
-- -- ⚠️ start_date/end_date must report `date` here. If either ever reports
-- -- `timestamp with time zone`, the airing_instant_of_date() calls in sections
-- -- 4 and 6a are wrong and this file must not be applied unchanged.
--
-- -- (0d) Same for the extend table — MUST return 17 rows. Here start_date and
-- -- end_date must report `timestamp with time zone`: they are copied as-is,
-- -- never lifted.
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'form_submissions_extend'
--   AND column_name IN (
--     'submission_id','start_date','end_date','duration','submission_status',
--     'payment_status','prize_per_winner','winner_count',
--     'additional_prize_per_winner','is_new_month','period_batch','total_cost',
--     'subtotal','ppn_amount','voucher_code','slot_booked_by','slot_reserved_at'
--   )
-- ORDER BY column_name;
--
-- -- How many rows will be born, per source. Write both numbers down — §8(1)
-- -- checks the difference against them.
-- SELECT (SELECT COUNT(*) FROM form_submissions WHERE start_date IS NOT NULL) AS parent_berjadwal,
--        (SELECT COUNT(*) FROM form_submissions_extend)                       AS extend_semua;
--
-- -- Surveys whose later schedules exist while the first one never got dates.
-- -- Those get ordinals starting at 2 with no ordinal 1 — intended, but the
-- -- number should look plausible before you apply.
-- SELECT COUNT(DISTINCT e.submission_id) AS extend_tanpa_jadwal_pertama
-- FROM form_submissions_extend e
-- JOIN form_submissions fs ON fs.id = e.submission_id
-- WHERE fs.start_date IS NULL;
--
-- -- Every status value the mapping in section 4 has to survive. Anything here
-- -- that is not in the CASE lands on 'waiting_payment' — check that is right
-- -- for each one before applying.
-- SELECT 'form_submissions.submission_status' AS kolom, submission_status AS nilai, COUNT(*)
-- FROM form_submissions WHERE start_date IS NOT NULL GROUP BY 2
-- UNION ALL
-- SELECT 'form_submissions.status', status, COUNT(*)
-- FROM form_submissions WHERE start_date IS NOT NULL GROUP BY 2
-- UNION ALL
-- SELECT 'form_submissions.payment_status', payment_status, COUNT(*)
-- FROM form_submissions WHERE start_date IS NOT NULL GROUP BY 2
-- UNION ALL
-- SELECT 'extend.submission_status', submission_status, COUNT(*)
-- FROM form_submissions_extend GROUP BY 2
-- ORDER BY 1, 3 DESC;
--
-- -- Pick a test subject for the live mirror check in §8(6): a survey whose
-- -- first schedule has dates AND that has at least two later schedules, so
-- -- renumbering is actually exercised.
-- SELECT fs.id, fs.title, fs.start_date, fs.end_date,
--        COUNT(e.id) AS jumlah_perpanjangan
-- FROM form_submissions fs
-- JOIN form_submissions_extend e ON e.submission_id = fs.id
-- WHERE fs.start_date IS NOT NULL
-- GROUP BY fs.id, fs.title, fs.start_date, fs.end_date
-- HAVING COUNT(e.id) >= 2
-- ORDER BY fs.start_date DESC
-- LIMIT 10;


-- ============================================
-- 8. VERIFY — run AFTER applying
-- ============================================
-- -- (1) Row-count parity. Both differences must be 0.
-- SELECT
--   (SELECT COUNT(*) FROM ad_schedules WHERE ordinal = 1)
--     - (SELECT COUNT(*) FROM form_submissions WHERE start_date IS NOT NULL) AS selisih_jadwal_pertama,
--   (SELECT COUNT(*) FROM ad_schedules WHERE ordinal > 1)
--     - (SELECT COUNT(*) FROM form_submissions_extend)                       AS selisih_jadwal_lanjutan;
--
-- -- (2) No duplicate ordinals, no gaps in 2..n. Both must return zero rows.
-- SELECT submission_id, ordinal, COUNT(*)
-- FROM ad_schedules GROUP BY 1, 2 HAVING COUNT(*) > 1;
--
-- SELECT submission_id,
--        COUNT(*) FILTER (WHERE ordinal > 1) AS jumlah_lanjutan,
--        MAX(ordinal)                        AS ordinal_tertinggi
-- FROM ad_schedules
-- GROUP BY 1
-- HAVING MAX(ordinal) <> 1 + COUNT(*) FILTER (WHERE ordinal > 1);
--
-- -- (3) ⚠️ THE IMPORTANT ONE. Parent dates must read 15:00 WIB on the same day
-- -- as the DATE they came from, never 07:00. Both columns must be empty.
-- SELECT COUNT(*) FILTER (
--          WHERE TO_CHAR(a.start_date AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') <> '15:00'
--        ) AS jam_mulai_salah,
--        COUNT(*) FILTER (
--          WHERE (a.start_date AT TIME ZONE 'Asia/Jakarta')::DATE <> fs.start_date
--        ) AS tanggal_mulai_bergeser
-- FROM ad_schedules a
-- JOIN form_submissions fs ON fs.id = a.source_id
-- WHERE a.source_table = 'form_submissions' AND a.start_date IS NOT NULL;
--
-- -- (4) period_batch must agree with what the rest of the system already says.
-- -- Zero rows.
-- SELECT a.id, a.period_batch, TO_CHAR(fs.end_date, 'YYYY-MM') AS batch_lama
-- FROM ad_schedules a
-- JOIN form_submissions fs ON fs.id = a.source_id
-- WHERE a.source_table = 'form_submissions'
--   AND a.period_batch IS DISTINCT FROM TO_CHAR(fs.end_date, 'YYYY-MM');
--
-- SELECT a.id, a.period_batch, e.period_batch AS batch_lama
-- FROM ad_schedules a
-- JOIN form_submissions_extend e ON e.id = a.source_id
-- WHERE a.source_table = 'form_submissions_extend'
--   AND a.period_batch IS DISTINCT FROM e.period_batch;
--
-- -- (5) What actually landed in the unconstrained columns.
-- SELECT status, payment_status, COUNT(*) FROM ad_schedules GROUP BY 1, 2 ORDER BY 3 DESC;
--
-- -- (6) Live mirror test. Pick a survey with at least two schedules, nudge the
-- -- old table, confirm the mirror follows, then put it back.
-- --   UPDATE form_submissions SET end_date = end_date + 1 WHERE id = '<uuid>';
-- --   SELECT ordinal, start_date, end_date, status FROM ad_schedules
-- --   WHERE submission_id = '<uuid>' ORDER BY ordinal;
-- --   UPDATE form_submissions SET end_date = end_date - 1 WHERE id = '<uuid>';
-- -- Renumbering: insert a later schedule that STARTS EARLIER than an existing
-- -- one and confirm the ordinals resort by start_date, not by insertion order.
--
-- -- (7) No regression in the old flow. cron must still run clean.
-- --   SELECT cron_activate_extends();
-- -- Then, in the app: the booking wizard's n/4 slot numbers are unchanged, and
-- -- neither dashboard looks any different. This file changes nothing visible.


-- ============================================
-- 9. ROLLBACK
-- ============================================
-- Nothing outside this file references ad_schedules, so dropping it is complete.
--
-- DROP TRIGGER IF EXISTS trg_ad_schedule_from_extend ON form_submissions_extend;
-- DROP TRIGGER IF EXISTS trg_ad_schedule_from_submission ON form_submissions;
-- DROP FUNCTION IF EXISTS sync_ad_schedule_from_extend();
-- DROP FUNCTION IF EXISTS sync_ad_schedule_from_submission();
-- DROP FUNCTION IF EXISTS resync_ad_schedule_ordinals(UUID);
-- DROP TABLE IF EXISTS ad_schedules;
