-- 47_add_custom_form_id_to_submissions.sql
--
-- Traces a form_submissions row back to the JFU-built custom_forms row it
-- was launched from (via the "Sebar via Jakpat" CTA on /dashboard/forms).
-- Nullable: only submissions launched from a JFU form set it; Google-Form
-- and pre-existing rows stay NULL. FK is ON DELETE SET NULL so deleting a
-- custom_forms row never blocks/cascades into paid submission history.
--
-- Idempotent: safe to re-run. Run this in the Supabase SQL Editor.

alter table public.form_submissions
  add column if not exists custom_form_id uuid references public.custom_forms(id) on delete set null;

create index if not exists idx_form_submissions_custom_form_id
  on public.form_submissions(custom_form_id);

-- ============================================================================
-- Verification (run after applying)
-- ============================================================================
-- select column_name, data_type from information_schema.columns
--  where table_name = 'form_submissions' and column_name = 'custom_form_id';

-- ============================================================================
-- Rollback
-- ============================================================================
-- alter table public.form_submissions drop column if exists custom_form_id;
