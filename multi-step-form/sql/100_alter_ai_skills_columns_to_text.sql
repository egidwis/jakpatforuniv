-- Migration 100: Widen ai_skills varchar columns to TEXT to avoid string truncation errors (code 22001)
-- Prevents "value too long for type character varying(100)" when entering descriptive tag labels or names

ALTER TABLE ai_skills 
    ALTER COLUMN tag_label TYPE TEXT,
    ALTER COLUMN name TYPE TEXT,
    ALTER COLUMN tag TYPE TEXT;
