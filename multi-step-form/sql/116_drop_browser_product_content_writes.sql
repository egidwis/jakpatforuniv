-- ============================================================================
-- sql/116 — CABUT TULIS KONTEN PRODUCT DARI BROWSER
-- ============================================================================
--
-- Sesudah /api/admin/content hidup. Akun product@jakpat.net tidak lagi boleh
-- mengosongkan bukti tayang, membuat/menghapus tautan kampanye, atau mengubah
-- halaman survei orang lain lewat PostgREST.
--
-- ⚠️ JANGAN DIJALANKAN SEBELUM function Cloudflare sudah di-deploy dan dicoba:
--   hapus satu bukti, buat satu tautan, ubah satu halaman (masing-masing 200).
--
-- Yang tetap:
--   Product MEMBACA campaign_links, page_respondents, dan seluruh survey_pages.
--   Pemilik order tetap mengurus survey_pages miliknya.
--   Pengunjung tetap boleh INSERT page_respondents dan membaca halaman publik.
--   Penghitung klik tetap lewat increment_campaign_click().
--
-- Jalankan APPLY utuh. Jangan lewat MCP.
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('campaign_links', 'page_respondents', 'survey_pages')
ORDER BY tablename, cmd, policyname;

-- ── APPLY ──────────────────────────────────────────────────────────────────
BEGIN;

DROP POLICY IF EXISTS "Product manages campaign links" ON public.campaign_links;
DROP POLICY IF EXISTS "Product reads campaign links" ON public.campaign_links;
CREATE POLICY "Product reads campaign links"
ON public.campaign_links
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

DROP POLICY IF EXISTS "Product updates page respondents" ON public.page_respondents;
DROP POLICY IF EXISTS "Admin Update Page Respondents" ON public.page_respondents;

DROP POLICY IF EXISTS "Product manages survey pages" ON public.survey_pages;
DROP POLICY IF EXISTS "Product reads survey pages" ON public.survey_pages;
CREATE POLICY "Product reads survey pages"
ON public.survey_pages
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('campaign_links', 'page_respondents', 'survey_pages')
  AND policyname IN (
    'Product manages campaign links',
    'Product updates page respondents',
    'Admin Update Page Respondents',
    'Product manages survey pages'
  );
-- Harus 0 baris.

-- Harus MASIH ADA:
--   Product reads campaign links
--   Product reads page respondents
--   Public insert page_respondents (WITH CHECK true)
--   Product reads survey pages
--   Owners manage own survey pages
--   Public pages are viewable by everyone

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP POLICY IF EXISTS "Product reads campaign links" ON public.campaign_links;
-- CREATE POLICY "Product manages campaign links"
-- ON public.campaign_links
-- FOR ALL
-- TO authenticated
-- USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
-- WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');
--
-- CREATE POLICY "Product updates page respondents"
-- ON public.page_respondents
-- FOR UPDATE
-- TO authenticated
-- USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
-- WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');
--
-- DROP POLICY IF EXISTS "Product reads survey pages" ON public.survey_pages;
-- CREATE POLICY "Product manages survey pages"
-- ON public.survey_pages
-- FOR ALL
-- TO authenticated
-- USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
-- WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');
-- COMMIT;
