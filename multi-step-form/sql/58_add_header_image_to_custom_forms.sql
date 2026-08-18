-- 58_add_header_image_to_custom_forms.sql
--
-- Cover/header image for JFU custom forms, shown at the top of the public
-- survey page. Nullable — existing forms without a cover image are unaffected.
--
-- Idempotent: safe to re-run. Run this in the Supabase SQL Editor.

alter table public.custom_forms
  add column if not exists header_image_url text;

-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- select column_name, data_type from information_schema.columns
--  where table_name = 'custom_forms' and column_name = 'header_image_url';

-- ============================================================================
-- Rollback
-- ============================================================================
-- alter table public.custom_forms drop column if exists header_image_url;
