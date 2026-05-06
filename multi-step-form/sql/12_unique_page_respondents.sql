-- ============================================================
-- Migration: Add UNIQUE constraint on (page_id, jakpat_id) in page_respondents
-- Purpose: Prevent duplicate respondent submissions at the database level
-- ============================================================

-- ============================================================
-- STEP 1: PREVIEW - Check how many duplicates exist
-- ============================================================
SELECT page_id, jakpat_id, COUNT(*) as cnt
FROM page_respondents
GROUP BY page_id, jakpat_id
HAVING COUNT(*) > 1
ORDER BY cnt DESC
LIMIT 30;

-- ============================================================
-- STEP 2: DEDUP - Keep the earliest entry, remove duplicates
-- Run this ONLY after reviewing Step 1 output
-- ============================================================
-- DELETE FROM page_respondents
-- WHERE id NOT IN (
--   SELECT DISTINCT ON (page_id, jakpat_id) id
--   FROM page_respondents
--   ORDER BY page_id, jakpat_id, created_at ASC
-- );

-- ============================================================
-- STEP 3: ADD CONSTRAINT - Run AFTER dedup is complete
-- ============================================================
-- ALTER TABLE page_respondents
--   ADD CONSTRAINT uq_page_respondent UNIQUE (page_id, jakpat_id);
