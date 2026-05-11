-- ============================================================
-- Migration: Add check_duplicate_respondent RPC
-- Purpose: Safely check for duplicate respondents from public endpoints without breaking RLS
-- ============================================================

CREATE OR REPLACE FUNCTION check_duplicate_respondent(p_page_id UUID, p_jakpat_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM page_respondents
    WHERE page_id = p_page_id AND jakpat_id = p_jakpat_id
  ) INTO v_exists;
  RETURN v_exists;
END;
$$;
