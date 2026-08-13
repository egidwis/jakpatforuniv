-- ============================================================
-- Migration 55: Auto-created ad pages no longer sink to the bottom
-- Date: 2026-08-13
--
-- WHY
-- ---
-- sql/40 (2026-08-03, carried forward unchanged by sql/42's Kilat guard) gave
-- every auto-created survey_pages row display_order = MAX(display_order) + 1
-- instead of NULL. Intent: a page that still carries the generic placeholder
-- banner ('/default-ad-banner.jpg') shouldn't be the most prominent card in
-- the listing until an admin swaps in a real banner and drags it into place.
--
-- Product decision 2026-08-13, reverting that: the cons outweigh the pros.
-- MAX+1 always produces a NEW highest number, so every auto-created page —
-- which today is nearly all of them, since Page Calendar (the manual-creation
-- path) was retired 2026-08-08 — lands at the very end of the MIDDLE band.
-- In practice that means every paid ad's card sits at the bottom of the
-- listing for as long as it airs, unless an admin remembers to open the Live
-- tab and drag it up. A paying customer's response count depends on that
-- admin follow-up step, and that step is easy to forget.
--
-- The fix touches ONE value: display_order goes back to NULL at insert, same
-- as the pre-Phase-1 manual-creation path (PageBuilderModal.tsx never sets
-- display_order either). orderBand() in src/utils/adOrdering.ts (and its
-- required-in-sync copy in functions/api/surveys.js) already treats a NULL,
-- non-extra-ad page as band 0 (TOP) — no frontend change needed. This makes
-- ordering blind to banner status: a freshly-created page now floats to the
-- top newest-first exactly like a manually-built one always did, whether or
-- not it has been given a real banner yet. An admin can still drag any page
-- into a manual position via the Live tab; set_survey_pages_order() is
-- untouched, so a saved position still wins absolutely.
--
-- NOT touched here: the 49 existing rows created by the MAX+1 rule between
-- 2026-08-04 and today keep whatever display_order they were assigned. Some
-- of those may have since been manually re-dragged by an admin; there is no
-- way to tell the two apart from the data alone, so backfilling them to NULL
-- is a separate, deliberate decision — not bundled into this migration.
--
-- This is a straight CREATE OR REPLACE of sql/42's ensure_survey_page() (the
-- version actually live in production — verified against pg_get_functiondef
-- before writing this file), with the Kilat guard from sql/42 kept intact.
-- Idempotent, no data changes, no schema changes.
-- ============================================================

CREATE OR REPLACE FUNCTION ensure_survey_page(p_submission_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub        RECORD;
  v_base_slug  TEXT;
  v_slug       TEXT;
  v_suffix     INT := 2;
  v_page_id    UUID;
  -- Mirror of defaultSurveiAdBlocks in
  -- src/components/PageBuilder/PageBuilderModal.tsx. Two copies of a static
  -- template is the lesser evil versus an edge function for three paragraphs —
  -- but if you change one, change the other.
  v_blocks JSONB := '{
    "type": "doc",
    "content": [
      {"type":"paragraph","content":[{"type":"text","text":"Hi Jakpaters! Yuk, isi survei berikut sesuai dengan kondisi kamu saat ini. Hanya responden yang sesuai kriteria, mengisi dengan serius, dan tidak menjawab asal-asalan yang akan masuk ke dalam undian 😉"}]},
      {"type":"paragraph","content":[{"type":"text","text":"Jangan lupa untuk mengisi Jakpat ID kamu dengan benar (tanpa teks \"https://jakpat.net/s/\" di awal dan tanpa spasi di dalam Jakpat ID mu)."}]},
      {"type":"paragraph","content":[{"type":"text","text":"Semua pemenang undian survei akan diumumkan setiap akhir bulan, jadi tunggu pengumuman dari kami ya. Semoga beruntung! ✨"}]}
    ]
  }'::JSONB;
BEGIN
  -- Already has a page: return it. This is the retry path.
  SELECT id INTO v_page_id FROM survey_pages WHERE submission_id = p_submission_id;
  IF FOUND THEN
    RETURN v_page_id;
  END IF;

  SELECT * INTO v_sub FROM form_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Kilat runs via push notification, not an ad card in the app feed.
  -- Publishing a page for it hands out airtime capacity nobody paid for.
  IF v_sub.distribution_type = 'kilat' THEN
    RETURN NULL;
  END IF;

  -- Prerequisites. A page without a working survey link is worse than no page,
  -- and a page with no window would be published indefinitely.
  IF v_sub.submission_status IN ('rejected', 'spam')
     OR COALESCE(BTRIM(v_sub.survey_url), '') = ''
     OR v_sub.start_date IS NULL
     OR v_sub.end_date IS NULL
     OR COALESCE(BTRIM(v_sub.title), '') = ''
  THEN
    RETURN NULL;
  END IF;

  -- Slug: same rules as generateSlug() in PageBuilderModal.tsx — lowercase,
  -- strip anything but a-z 0-9 space hyphen, spaces to hyphens, collapse
  -- hyphens, cap at 60.
  v_base_slug := LEFT(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(LOWER(BTRIM(v_sub.title)), '[^a-z0-9[:space:]-]', '', 'g'),
        '[[:space:]]+', '-', 'g'),
      '-+', '-', 'g'),
    60);
  v_base_slug := BTRIM(v_base_slug, '-');

  IF v_base_slug = '' THEN
    v_base_slug := 'survei';
  END IF;

  -- Uniqueness matters far more here than when an admin was watching: the
  -- public page loads with .eq('slug', slug).single(), so two pages sharing a
  -- slug break BOTH of them.
  v_slug := v_base_slug;
  IF EXISTS (SELECT 1 FROM survey_pages WHERE slug = v_slug) THEN
    v_slug := LEFT(v_base_slug, 53) || '-' || LEFT(p_submission_id::TEXT, 6);
    WHILE EXISTS (SELECT 1 FROM survey_pages WHERE slug = v_slug) LOOP
      v_slug := LEFT(v_base_slug, 51) || '-' || LEFT(p_submission_id::TEXT, 6) || '-' || v_suffix;
      v_suffix := v_suffix + 1;
    END LOOP;
  END IF;

  -- Note there is no criteria column to fill: respondent criteria live on
  -- form_submissions.criteria_responden and the public page reads them through
  -- the join, exactly as PageBuilderModal does. survey_pages.criteria (jsonb)
  -- is a different, unused column — do not repurpose it here.
  INSERT INTO survey_pages (
    submission_id, slug, title, banner_url, is_published,
    blocks, custom_fields,
    publish_start_date, publish_end_date,
    redirect_url, is_extra_ad, is_hidden,
    display_order, requires_banner_update
  ) VALUES (
    p_submission_id,
    v_slug,
    v_sub.title,
    -- Generic ad banner, served from public/. Not a technical fallback: without
    -- one the Jakpat app falls back to its own card styling, which looks
    -- nothing like an ad, and respondents cannot tell a paid survey from an
    -- announcement. Deliberately carries no prize figure, so it never goes
    -- stale when a reward batch changes.
    -- DUPLICATED as DEFAULT_AD_BANNER_URL in src/utils/constants.ts.
    '/default-ad-banner.jpg',
    TRUE,
    v_blocks,
    '[]'::JSONB,
    -- form_submissions stores DATE; the airing window is 15:00 WIB on that day.
    airing_instant_of_date(v_sub.start_date),
    airing_instant_of_date(v_sub.end_date),
    NULL,
    FALSE,
    FALSE,                    -- visible in the app feed, per the 2026-08-03 decision
    -- NULL, not MAX+1 (sql/40/42's original rule) — reverted 2026-08-13.
    -- orderBand() in src/utils/adOrdering.ts treats a NULL, non-extra-ad page
    -- as band 0 (TOP), exactly like a manually-built page always got. Ordering
    -- no longer depends on whether a real banner has been uploaded yet, so a
    -- paying customer's ad isn't punished for an admin follow-up step nobody
    -- has done yet. set_survey_pages_order() still lets an admin place any
    -- page manually whenever they want.
    NULL,
    -- FALSE, deliberately. The flag means "the banner is showing stale reward
    -- info" — that is what the DOKU webhook sets it for, when a new batch or a
    -- top-up changes the prize. A page that has no banner has nothing stale to
    -- show. Setting it TRUE here would raise a badge on every newly paid order,
    -- and since 235 of 262 published pages already run with no banner at all,
    -- that badge would be permanent and universal. A warning that is always on
    -- is a warning that stops being read.
    FALSE
  )
  RETURNING id INTO v_page_id;

  RETURN v_page_id;
END;
$$;

COMMENT ON FUNCTION ensure_survey_page(UUID) IS
  'Creates and publishes the survey page for a paid submission if it does not exist yet, EXCEPT for distribution_type = ''kilat'' which has no ad page at all (sql/42). Gets the generic default banner, not a real one. display_order stays NULL so a new page floats to the top of the listing regardless of banner status (sql/55). Idempotent — returns the existing page id on a retry.';


-- ============================================
-- VERIFICATION — run after applying
-- ============================================
-- (1) Function body actually changed — should show NULL, not a MAX(...) subquery:
-- SELECT pg_get_functiondef('public.ensure_survey_page(uuid)'::regprocedure);
--
-- (2) Next auto-created page lands with display_order NULL:
-- SELECT display_order FROM survey_pages WHERE submission_id = '<uuid-order-baru-lunas>';
-- -- expect: NULL
--
-- (3) Kilat guard still intact — must still return NULL and leave no row:
-- SELECT ensure_survey_page('<uuid-order-kilat-tanpa-halaman>');
-- SELECT count(*) FROM survey_pages WHERE submission_id = '<uuid-order-kilat>';  -- 0


-- ============================================
-- ROLLBACK
-- ============================================
-- Re-run sql/42's section 2 (or sql/40's, minus the Kilat guard — don't do
-- that) to restore the MAX+1 behaviour.
