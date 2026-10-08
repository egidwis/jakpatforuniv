-- ============================================================================
-- sql/111 — KUNCI campaign_links, doku_payouts, page_respondents
-- ============================================================================
--
-- Sisa audit JFU sesudah sql/110. Tiga tabel yang policy-nya masih `true`
-- atau "semua yang login":
--
--   campaign_links
--     ALL true. Tab Campaign di internal dash (Product) yang baca/tambah/hapus.
--     Klik publik TIDAK lewat tabel ini: CampaignTracker memanggil
--     increment_campaign_click() (SECURITY DEFINER), jadi policy klien
--     tidak memutus penghitung.
--
--   doku_payouts
--     SELECT true untuk authenticated. Isinya rekening + nominal.
--     Tulisan payout & webhook jalan di Cloudflare dengan service_role,
--     yang menembus RLS.
--
--   page_respondents
--     SELECT = semua yang login, termasuk e-wallet. INSERT publik
--     ("Public can insert respondents", WITH CHECK true) DIPERTAHANKAN —
--     form survei anon memakainya. Cek duplikat di SurveyPage adalah
--     SELECT; anon memang sudah tidak melihat baris orang lain. Yang
--     dikunci di sini adalah bacaan semua login.
--
-- JM_* / ra_* / campaign_link_clicks sengaja tidak di sini.
-- Jalankan DRY-RUN dulu, lalu APPLY. Jangan lewat MCP.
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('campaign_links', 'doku_payouts', 'page_respondents')
ORDER BY tablename, cmd, policyname;

-- ── APPLY ──────────────────────────────────────────────────────────────────
BEGIN;

-- ── 1. campaign_links: hanya Product ───────────────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campaign_links'
      AND (
        qual IN ('true', '(true)', '(auth.role() = ''authenticated''::text)', '(auth.role() = ''authenticated'')')
        OR with_check IN ('true', '(true)', '(auth.role() = ''authenticated''::text)', '(auth.role() = ''authenticated'')')
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.campaign_links', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Product manages campaign links" ON public.campaign_links;
CREATE POLICY "Product manages campaign links"
ON public.campaign_links
FOR ALL
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

-- ── 2. doku_payouts: baca hanya Product ────────────────────────────────────
DROP POLICY IF EXISTS "Allow select on doku_payouts for authenticated users" ON public.doku_payouts;
DROP POLICY IF EXISTS "Product reads doku payouts" ON public.doku_payouts;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'doku_payouts'
      AND cmd = 'SELECT'
      AND (
        qual IN ('true', '(true)', '(auth.role() = ''authenticated''::text)', '(auth.role() = ''authenticated'')')
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.doku_payouts', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Product reads doku payouts"
ON public.doku_payouts
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

-- ── 3. page_respondents: cabut SELECT lebar, pertahankan INSERT publik ────
DROP POLICY IF EXISTS "Admins can view respondents" ON public.page_respondents;
DROP POLICY IF EXISTS "Product reads page respondents" ON public.page_respondents;
DROP POLICY IF EXISTS "Product updates page respondents" ON public.page_respondents;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'page_respondents'
      AND cmd = 'SELECT'
      AND (
        qual IN ('true', '(true)', '(auth.role() = ''authenticated''::text)', '(auth.role() = ''authenticated'')')
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.page_respondents', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Product reads page respondents"
ON public.page_respondents
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

CREATE POLICY "Product updates page respondents"
ON public.page_respondents
FOR UPDATE
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('campaign_links', 'doku_payouts', 'page_respondents')
ORDER BY tablename, cmd, policyname;

-- Harus ADA:
--   Product manages campaign links
--   Product reads doku payouts
--   Public can insert respondents          (WITH CHECK true, jangan hilang)
--   Product reads page respondents
--   Product updates page respondents
--
-- Harus HILANG:
--   policy campaign_links yang qual/with_check true
--   Allow select on doku_payouts for authenticated users
--   Admins can view respondents

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP POLICY IF EXISTS "Product manages campaign links" ON public.campaign_links;
-- CREATE POLICY "Allow all on campaign_links"
-- ON public.campaign_links FOR ALL USING (true) WITH CHECK (true);
--
-- DROP POLICY IF EXISTS "Product reads doku payouts" ON public.doku_payouts;
-- CREATE POLICY "Allow select on doku_payouts for authenticated users"
-- ON public.doku_payouts FOR SELECT TO authenticated USING (true);
--
-- DROP POLICY IF EXISTS "Product reads page respondents" ON public.page_respondents;
-- DROP POLICY IF EXISTS "Product updates page respondents" ON public.page_respondents;
-- CREATE POLICY "Admins can view respondents"
-- ON public.page_respondents FOR SELECT
-- USING (auth.role() = 'authenticated');
-- COMMIT;
