-- Migration: Add redirect_url column to survey_pages
-- Purpose: Allow announcement pages to redirect to external URLs (e.g. Instagram, blog posts)
-- instead of showing the internal detail page.

ALTER TABLE survey_pages 
ADD COLUMN IF NOT EXISTS redirect_url TEXT DEFAULT NULL;

COMMENT ON COLUMN survey_pages.redirect_url IS 'Optional external URL. When set, clicking the page redirects to this URL instead of showing the detail page.';
