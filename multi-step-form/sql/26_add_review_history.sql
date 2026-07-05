-- Migration to add review_history column to form_submissions table
-- Run this in your Supabase SQL Editor to enable history log logging.

ALTER TABLE form_submissions 
ADD COLUMN IF NOT EXISTS review_history jsonb DEFAULT '[]'::jsonb;
