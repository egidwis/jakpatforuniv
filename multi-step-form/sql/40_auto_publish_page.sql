-- ============================================================
-- Migration 40: Auto-create + auto-publish the survey page on payment
-- Date: 2026-08-03  (Phase 1)
--
-- WHY
-- ---
-- An ad cannot air without a survey_pages row, and today that row only exists
-- once an admin builds it by hand. Every field on it is derivable from the
-- order except one — the banner. So a paid ad can sit dark waiting on a human
-- for the only part a human is actually needed for.
--
-- Business decision (2026-08-03): publish on payment, without a banner. A
-- missing banner renders as no banner (SurveyPage.tsx renders it conditionally)
-- and the public page is still gated by its publish window, so nothing leaks
-- early.
--
-- This is not a new situation for consumers: measured 2026-08-03, 235 of 262
-- published pages already carry no banner, continuously from 13 Mar to 26 Jul.
-- The Jakpat app has been serving banner-less cards for months, so no
-- confirmation from the app team is needed and no placeholder image is
-- warranted — adding one only for auto-created pages would make the feed less
-- consistent, not more.
--
-- WHY A TRIGGER AND NOT THE WEBHOOK
-- ---------------------------------
-- "Mark as Paid" updates the row directly and never reaches the DOKU webhook,
-- so a webhook-side implementation would silently skip every manually settled
-- order. A trigger catches all three paths: webhook, Mark as Paid, and manual
-- SQL correction.
--
-- ⚠️ APPLYING THIS FILE TURNS THE FEATURE ON. Unlike migrations 36-39, which
-- were corrective, this one changes what happens on every future payment. Do
-- not apply it until:
--   1. the Phase 0 frontend is deployed — without it, saving an auto-created
--      page from the Submissions screen still overwrites its airing window;
--   2. the Jakpat app team has confirmed a card with banner_url = null renders
--      correctly, since /api/surveys will start serving those.
--
-- Idempotent: CREATE OR REPLACE / IF NOT EXISTS throughout. ensure_survey_page
-- is itself idempotent, so a webhook retry cannot produce a second page.
--
-- Depends on airing_instant_of_date() from sql/39 (already applied).
-- ============================================================

-- ============================================
-- 0. Schema assertions — refuse to run against a shape we did not expect
-- ============================================
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  SELECT string_agg(c, ', ')
    INTO v_missing
  FROM unnest(ARRAY[
    'id','submission_id','slug','title','banner_url','is_published','blocks',
    'custom_fields','publish_start_date','publish_end_date',
    'redirect_url','is_extra_ad','display_order','requires_banner_update','is_hidden'
  ]) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'survey_pages' AND column_name = c
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'survey_pages is missing expected column(s): %. Re-check the schema before applying.', v_missing;
  END IF;

  -- form_submissions dates are DATE (see sql/39); publish_* are TIMESTAMPTZ.
  -- The conversion below depends on that asymmetry still holding.
  IF (SELECT data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='form_submissions' AND column_name='start_date')
     IS DISTINCT FROM 'date' THEN
    RAISE EXCEPTION 'form_submissions.start_date is no longer DATE — revisit the airing_instant_of_date() conversion in ensure_survey_page().';
  END IF;
END $$;


-- ============================================
-- 1. One page per submission, enforced by the database
-- ============================================
-- ensure_survey_page() checks for an existing page before inserting, but that
-- is read-then-write: two concurrent webhook retries can both pass the check.
-- Two pages for one submission would make `UPDATE ... FROM survey_pages` in
-- cron_activate_extends ambiguous and double-count the survey's slot usage.
--
-- Partial, because announcement pages legitimately have submission_id NULL
-- (see adTypePriority() in functions/api/surveys.js).
--
-- ⚠️ Run the duplicate pre-check at the bottom FIRST. If it returns rows this
-- statement fails, and which page to keep is a human decision.
CREATE UNIQUE INDEX IF NOT EXISTS uq_survey_pages_submission
  ON survey_pages (submission_id)
  WHERE submission_id IS NOT NULL;


-- ============================================
-- 2. ensure_survey_page — idempotent, safe to call repeatedly
-- ============================================
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
    -- Not NULL: orderBand() in functions/api/surveys.js puts unplaced regular
    -- pages in band 0, the very top of the app feed. A card that has no banner
    -- yet must not be the most prominent thing in the app. MAX+1 lands it
    -- behind everything an admin has already arranged; set_survey_pages_order
    -- renormalises it the moment anyone drags the list.
    (SELECT COALESCE(MAX(display_order), -1) + 1 FROM survey_pages),
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
  'Creates and publishes the survey page for a paid submission if it does not exist yet. Gets the generic default banner, not a real one. Idempotent — returns the existing page id on a retry.';


-- ============================================
-- 3. Trigger: fire when an order becomes paid
-- ============================================
CREATE OR REPLACE FUNCTION trg_ensure_survey_page()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was_paid BOOLEAN;
  v_is_paid  BOOLEAN;
BEGIN
  -- "Paid" is read from either column. payment_status alone is not sufficient:
  -- some orders are settled outside the system and keep payment_status
  -- 'pending' forever, reaching 'paid'/'scheduled' via submission_status only.
  v_was_paid := COALESCE(OLD.payment_status IN ('paid', 'completed'), FALSE)
             OR COALESCE(OLD.submission_status IN ('paid', 'scheduled', 'live', 'completed'), FALSE);
  v_is_paid  := COALESCE(NEW.payment_status IN ('paid', 'completed'), FALSE)
             OR COALESCE(NEW.submission_status IN ('paid', 'scheduled', 'live', 'completed'), FALSE);

  -- Only on the transition into paid, so an unrelated edit to a long-paid order
  -- does not re-enter this path.
  IF v_is_paid AND NOT v_was_paid THEN
    PERFORM ensure_survey_page(NEW.id);
  END IF;

  RETURN NULL;  -- AFTER trigger
END;
$$;

DROP TRIGGER IF EXISTS trg_form_submissions_ensure_page ON form_submissions;
CREATE TRIGGER trg_form_submissions_ensure_page
  AFTER UPDATE OF payment_status, submission_status
  ON form_submissions
  FOR EACH ROW EXECUTE FUNCTION trg_ensure_survey_page();


-- ============================================
-- PRE-CHECK A — duplicate pages, run BEFORE section 1
-- ============================================
-- Must be empty, otherwise the unique index cannot be created and you have to
-- decide which page survives. Do not let a script pick.
--
-- SELECT sp.submission_id, fs.title, COUNT(*) AS pages,
--        string_agg(sp.slug || ' (' || sp.id::TEXT || ')', ' | ' ORDER BY sp.created_at) AS halaman
-- FROM survey_pages sp
-- JOIN form_submissions fs ON fs.id = sp.submission_id
-- WHERE sp.submission_id IS NOT NULL
-- GROUP BY sp.submission_id, fs.title
-- HAVING COUNT(*) > 1;

-- ============================================
-- PRE-CHECK B — dry run: which paid orders have no page today
-- ============================================
-- The trigger only fires on future transitions, so these stay pageless unless
-- you deliberately backfill. Review the list before deciding.
--
-- SELECT fs.id, fs.title, fs.submission_status, fs.payment_status,
--        fs.start_date, fs.end_date,
--        (COALESCE(BTRIM(fs.survey_url), '') = '') AS survey_url_kosong
-- FROM form_submissions fs
-- LEFT JOIN survey_pages sp ON sp.submission_id = fs.id
-- WHERE sp.id IS NULL
--   AND fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
--   AND fs.submission_status NOT IN ('rejected', 'spam')
--   AND (fs.payment_status IN ('paid','completed')
--     OR fs.submission_status IN ('paid','scheduled','live','completed'))
-- ORDER BY fs.end_date DESC;

-- ============================================
-- OPTIONAL — give existing banner-less pages the same default banner
-- ============================================
-- The reason for the default is visual consistency, and that argument does not
-- only apply to new pages: measured 2026-08-03, 235 of 262 published pages have
-- no banner at all. Leaving them as they are means the feed shows two different
-- kinds of card side by side — which is the confusion this was meant to remove.
--
-- Restricted to pages whose window has not finished, so nothing is rewritten on
-- campaigns that are already over. Drop the date filter to cover everything.
--
-- UPDATE survey_pages
-- SET banner_url = '/default-ad-banner.jpg',
--     updated_at = NOW()
-- WHERE (banner_url IS NULL OR BTRIM(banner_url) = '')
--   AND is_published = true
--   AND (publish_end_date IS NULL OR publish_end_date >= NOW());

-- ============================================
-- OPTIONAL BACKFILL — opt-in, never run blind
-- ============================================
-- Restricted to windows that have not finished yet. Publishing pages for
-- campaigns that already ended would put stale ads back in the app feed.
--
-- SELECT fs.id, fs.title, ensure_survey_page(fs.id) AS page_id
-- FROM form_submissions fs
-- LEFT JOIN survey_pages sp ON sp.submission_id = fs.id
-- WHERE sp.id IS NULL
--   AND fs.end_date >= CURRENT_DATE
--   AND fs.submission_status NOT IN ('rejected', 'spam')
--   AND (fs.payment_status IN ('paid','completed')
--     OR fs.submission_status IN ('paid','scheduled','live','completed'));
