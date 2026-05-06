-- ============================================================
-- RLS POLICY AUDIT
-- Jalankan di Supabase SQL Editor untuk melihat semua policies
-- ============================================================

-- ============================================================
-- QUERY 1: Cek apakah RLS aktif di semua tabel publik
-- ============================================================
SELECT 
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ============================================================
-- QUERY 2: Lihat semua RLS policies per tabel
-- Fokus: command (SELECT/INSERT/UPDATE/DELETE) dan roles
-- ============================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd AS command,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- ============================================================
-- QUERY 3: Fokus pada tabel sensitif — lihat apa yang bisa 
-- dilakukan role 'anon' (public/unauthenticated)
-- ============================================================
SELECT 
  tablename,
  policyname,
  cmd AS command,
  roles,
  qual AS using_condition,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[])
  AND tablename IN (
    'page_respondents',
    'transactions',
    'form_submissions',
    'survey_pages',
    'campaign_clicks',
    'respondents-masterdata',
    'survey_winners'
  )
ORDER BY tablename, cmd;
