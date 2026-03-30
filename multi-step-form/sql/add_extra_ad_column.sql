-- Migration: Add is_extra_ad column to survey_pages and scheduled_ads
-- Run this in Supabase Dashboard > SQL Editor

-- 1. Add is_extra_ad to survey_pages
ALTER TABLE survey_pages ADD COLUMN IF NOT EXISTS is_extra_ad BOOLEAN DEFAULT FALSE;

-- 2. Add is_extra_ad to scheduled_ads
ALTER TABLE scheduled_ads ADD COLUMN IF NOT EXISTS is_extra_ad BOOLEAN DEFAULT FALSE;
