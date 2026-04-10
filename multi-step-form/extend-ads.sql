-- ============================================================
-- Script: Extend end_date by 1 day for ads starting 8 Apr 2026
-- Reason: Page was not set up on time, ads published 1 day late
-- Date: 9 April 2026
-- ============================================================

-- Step 1: Preview - Check which ads will be affected
SELECT 
    sa.id,
    fs.title,
    fs.full_name as researcher,
    sa.start_date,
    sa.end_date as current_end_date,
    sa.end_date + INTERVAL '1 day' as new_end_date
FROM scheduled_ads sa
JOIN form_submissions fs ON fs.id = sa.form_submission_id
WHERE sa.start_date::date = '2026-04-08';

-- Step 2: Update scheduled_ads end_date (+1 day)
UPDATE scheduled_ads
SET end_date = end_date + INTERVAL '1 day'
WHERE start_date::date = '2026-04-08';

-- Step 3: Update corresponding form_submissions end_date (+1 day)
UPDATE form_submissions
SET end_date = end_date::date + INTERVAL '1 day'
WHERE id IN (
    SELECT form_submission_id 
    FROM scheduled_ads 
    WHERE start_date::date = '2026-04-08'
);

-- Step 4: Update survey_pages publish_end_date (+1 day) if exists
UPDATE survey_pages
SET publish_end_date = publish_end_date + INTERVAL '1 day'
WHERE submission_id IN (
    SELECT form_submission_id 
    FROM scheduled_ads 
    WHERE start_date::date = '2026-04-08'
)
AND publish_end_date IS NOT NULL;

-- Step 5: Verify the changes
SELECT 
    sa.id,
    fs.title,
    fs.full_name as researcher,
    sa.start_date,
    sa.end_date as updated_end_date,
    sp.publish_end_date as page_end_date
FROM scheduled_ads sa
JOIN form_submissions fs ON fs.id = sa.form_submission_id
LEFT JOIN survey_pages sp ON sp.submission_id = sa.form_submission_id
WHERE sa.start_date::date = '2026-04-08';
