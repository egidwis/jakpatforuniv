-- ============================================================
-- Migration: Submission Status Redesign
-- Date: 2026-04-10
-- Description: 
--   1. Rename status values (scheduling → slot_reserved, publishing → live)
--   2. Drop trigger handle_scheduled_ad_sync (replaced by application code)
--   3. Archive scheduled_ads table (add comment, keep data)
--
-- IMPORTANT: Run this AFTER deploying the new code to production.
-- ============================================================

-- ============================================================
-- PRE-CHECK: Run this first to see current status distribution
-- ============================================================
-- SELECT submission_status, COUNT(*) FROM form_submissions GROUP BY submission_status ORDER BY submission_status;

-- ============================================================
-- Step 1: Rename existing status values
-- ============================================================

-- 'pending' → 'in_review' (legacy submissions sebelum status distandarisasi)
UPDATE form_submissions 
SET submission_status = 'in_review' 
WHERE submission_status = 'pending';

-- 'process' → 'approved' (submission yang sedang diproses = sudah diapprove)
UPDATE form_submissions 
SET submission_status = 'approved' 
WHERE submission_status = 'process';

-- 'scheduling' → 'slot_reserved' (admin sudah pilih tanggal, belum bayar)
UPDATE form_submissions 
SET submission_status = 'slot_reserved' 
WHERE submission_status = 'scheduling';

-- 'publishing' → 'live' (iklan sedang tayang)
UPDATE form_submissions 
SET submission_status = 'live' 
WHERE submission_status = 'publishing';

-- NOTE: 'scheduled' is now a VALID status in the new flow (page created, waiting for start_date).
-- No need to rename — the code already handles it correctly.

-- ============================================================
-- Step 2: Drop the trigger and function
-- ============================================================
-- The trigger previously auto-synced scheduled_ads → form_submissions → survey_pages.
-- This is now handled explicitly by application code via updateScheduleDates().
DROP TRIGGER IF EXISTS on_scheduled_ad_change ON scheduled_ads;
DROP FUNCTION IF EXISTS handle_scheduled_ad_sync();

-- ============================================================
-- Step 3: Archive scheduled_ads table
-- ============================================================
COMMENT ON TABLE scheduled_ads IS 'ARCHIVED (2026-04-10) — Data lama dipertahankan untuk referensi. Tidak lagi digunakan oleh aplikasi. Sumber jadwal sekarang: survey_pages.publish_start_date/publish_end_date + form_submissions.start_date/end_date.';

-- ============================================================
-- POST-CHECK: Run this after migration to verify
-- ============================================================
-- SELECT submission_status, COUNT(*) FROM form_submissions GROUP BY submission_status ORDER BY submission_status;
-- Expected: no more 'scheduling' or 'publishing' rows. 'scheduled' may exist (valid).
-- SELECT COUNT(*) FROM scheduled_ads; -- data should still be there (archived, not deleted)
