-- ============================================================================
-- sql/117 — CABUT TULIS MIMIN DAN MISI KUSTOM DARI BROWSER
-- ============================================================================
--
-- Sesudah /api/admin/mimin hidup. Akun product@jakpat.net tidak lagi boleh
-- mengubah prompt, FAQ, skill, atau status misi kustom lewat PostgREST.
--
-- ⚠️ JANGAN DIJALANKAN SEBELUM function Cloudflare sudah di-deploy dan dicoba:
--   simpan prompt, simpan FAQ, simpan skill, ubah status misi (masing-masing 200).
--
-- Yang tetap:
--   Product MEMBACA pengaturan Mimin, seluruh FAQ/skill, dan seluruh inbox misi.
--   Pengunjung tetap membaca FAQ dan skill yang aktif.
--   Siapa pun tetap boleh INSERT permintaan misi baru.
--   Peneliti tetap membaca permintaan miliknya.
--
-- Jalankan APPLY utuh. Jangan lewat MCP.
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'ai_settings',
    'ai_knowledge_base',
    'ai_skills',
    'custom_mission_requests'
  )
ORDER BY tablename, cmd, policyname;

-- ── APPLY ──────────────────────────────────────────────────────────────────
BEGIN;

DROP POLICY IF EXISTS "Product manages ai_settings" ON public.ai_settings;
DROP POLICY IF EXISTS "Product reads ai_settings" ON public.ai_settings;
CREATE POLICY "Product reads ai_settings"
ON public.ai_settings
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

DROP POLICY IF EXISTS "Product manages ai_knowledge_base" ON public.ai_knowledge_base;
DROP POLICY IF EXISTS "Product reads ai_knowledge_base" ON public.ai_knowledge_base;
CREATE POLICY "Product reads ai_knowledge_base"
ON public.ai_knowledge_base
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

DROP POLICY IF EXISTS "Product manages ai_skills" ON public.ai_skills;
DROP POLICY IF EXISTS "Product reads ai_skills" ON public.ai_skills;
CREATE POLICY "Product reads ai_skills"
ON public.ai_skills
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

DROP POLICY IF EXISTS "Product updates custom mission requests" ON public.custom_mission_requests;

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'ai_settings',
    'ai_knowledge_base',
    'ai_skills',
    'custom_mission_requests'
  )
  AND policyname IN (
    'Product manages ai_settings',
    'Product manages ai_knowledge_base',
    'Product manages ai_skills',
    'Product updates custom mission requests'
  );
-- Harus 0 baris.

-- Harus MASIH ADA:
--   Product reads ai_settings / ai_knowledge_base / ai_skills
--   Public reads active knowledge base
--   Allow public read active skills
--   Product reads all custom mission requests
--   Allow public insert for custom mission requests
--   Users can view own custom mission requests

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP POLICY IF EXISTS "Product reads ai_settings" ON public.ai_settings;
-- CREATE POLICY "Product manages ai_settings"
-- ON public.ai_settings FOR ALL TO authenticated
-- USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
-- WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');
--
-- DROP POLICY IF EXISTS "Product reads ai_knowledge_base" ON public.ai_knowledge_base;
-- CREATE POLICY "Product manages ai_knowledge_base"
-- ON public.ai_knowledge_base FOR ALL TO authenticated
-- USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
-- WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');
--
-- DROP POLICY IF EXISTS "Product reads ai_skills" ON public.ai_skills;
-- CREATE POLICY "Product manages ai_skills"
-- ON public.ai_skills FOR ALL TO authenticated
-- USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
-- WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');
--
-- CREATE POLICY "Product updates custom mission requests"
-- ON public.custom_mission_requests FOR UPDATE TO authenticated
-- USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
-- WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');
-- COMMIT;
