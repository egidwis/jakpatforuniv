-- Migration: Add display_order column to survey_pages + atomic reorder RPC
-- Purpose: Let admins manually order the LIVE ad listing (drag-to-reorder in the
-- "Live" tab of the Pages screen). The mobile API (/api/surveys) and the public
-- web listing use a 3-band sort applied in JS (see src/utils/adOrdering.ts —
-- compareDisplayOrder; the mobile API keeps an in-sync copy):
--   TOP    = new, unplaced (display_order NULL) regular & announcement pages
--   MIDDLE = placed pages, by display_order ASC
--   BOTTOM = new, unplaced (display_order NULL) extra ads
-- (The banding needs a CASE-style expression, so it lives in JS; display_order
-- itself lives here.) Run this in Supabase Dashboard > SQL Editor.

-- 1. Ordering column. NULL = unplaced: a new regular/announcement floats to the TOP
--    and a new extra ad sinks to the BOTTOM (banding in JS). Once an admin drags +
--    saves, display_order is set and that manual order wins absolutely.
ALTER TABLE survey_pages
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT NULL;

COMMENT ON COLUMN survey_pages.display_order IS
  'Manual ordering for the live ad listing (ASC). NULL = unplaced: new regular/announcement float to top, new extra ads to bottom (banding in src/utils/adOrdering.ts). Managed by the Ads "Live" tab.';

-- 2. Atomic reorder RPC. Assigns display_order = 0..N-1 following the given id order.
-- SECURITY INVOKER (default) so the caller's RLS applies — the admin client already
-- has UPDATE rights on survey_pages (used by the Page Builder).
CREATE OR REPLACE FUNCTION set_survey_pages_order(ordered_ids uuid[])
RETURNS void
LANGUAGE sql
AS $$
  UPDATE survey_pages sp
  SET display_order = t.ord - 1,
      updated_at = now()
  FROM unnest(ordered_ids) WITH ORDINALITY AS t(id, ord)
  WHERE sp.id = t.id;
$$;
