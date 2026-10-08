-- ============================================================================
-- sql/112 — KUNCI BACA campaign_link_clicks KE PRODUCT
-- ============================================================================
--
-- sql/68 memberi SELECT USING (true) ke semua yang login. Log klik (source +
-- waktu) ikut terbaca peneliti dan user JM/RA.
--
-- Penulis satu-satunya tetap increment_campaign_click() (SECURITY DEFINER).
-- Policy service_role tidak disentuh. Tab Campaign di internal dash jalan
-- sebagai product@jakpat.net, jadi SELECT baru cukup untuk layar itu.
--
-- Jalankan DRY-RUN dulu, lalu APPLY. Jangan lewat MCP.
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'campaign_link_clicks'
ORDER BY cmd, policyname;

-- ── APPLY ──────────────────────────────────────────────────────────────────
BEGIN;

DROP POLICY IF EXISTS "Authenticated can read campaign link clicks" ON public.campaign_link_clicks;
DROP POLICY IF EXISTS "Product reads campaign link clicks" ON public.campaign_link_clicks;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campaign_link_clicks'
      AND cmd = 'SELECT'
      AND NOT (roles @> ARRAY['service_role']::name[])
      AND qual IN (
        'true',
        '(true)',
        '(auth.role() = ''authenticated''::text)',
        '(auth.role() = ''authenticated'')'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.campaign_link_clicks', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Product reads campaign link clicks"
ON public.campaign_link_clicks
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'campaign_link_clicks'
ORDER BY cmd, policyname;

-- Harus ADA:
--   Product reads campaign link clicks          SELECT authenticated
--   Service role full access campaign link clicks   ALL service_role
--
-- Harus HILANG:
--   Authenticated can read campaign link clicks

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP POLICY IF EXISTS "Product reads campaign link clicks" ON public.campaign_link_clicks;
-- CREATE POLICY "Authenticated can read campaign link clicks"
-- ON public.campaign_link_clicks
-- FOR SELECT
-- TO authenticated
-- USING (true);
-- COMMIT;
