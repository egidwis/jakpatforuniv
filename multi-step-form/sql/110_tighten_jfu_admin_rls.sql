-- ============================================================================
-- sql/110 — KUNCI TULISAN ADMIN JFU YANG TERBUKA KE SEMUA LOGIN
-- ============================================================================
--
-- Audit sql/13 (query 2, produksi 2026-10-07) menemukan policy yang namanya
-- "admin" tapi syaratnya cuma `auth.role() = 'authenticated'` atau `true`.
-- Siapa pun yang punya akun login di proyek Supabase yang sama — termasuk
-- peneliti JFU dan user JM/RA — bisa menulis SOP Mimin, membaca inbox chat
-- orang lain, mengubah status misi kustom, dan mengedit halaman iklan.
--
-- Identitas admin JFU di kode = email JWT `product@jakpat.net` (bukan
-- user.role). Pola yang sama sudah dipakai invoices/transactions/sql/109.
--
-- ── LINGKUP ────────────────────────────────────────────────────────────────
--
--   ai_settings / ai_knowledge_base / ai_skills
--     Baca publik (FAQ & SOP aktif) TETAP. Tulis hanya Product.
--
--   chat_sessions / chat_messages
--     Peneliti: sesi & pesan miliknya. Product: semua + pesan role=admin
--     (sql/109 tidak diubah).
--
--   custom_mission_requests
--     Insert publik & SELECT milik sendiri TETAP. Inbox internal hanya Product.
--
--   survey_pages
--     Baca halaman published TETAP. Hapus "Admins can do everything on pages"
--     (semua yang login). Ganti: Product semua baris; peneliti hanya halaman
--     order miliknya. Tanpa policy pemilik, PageBuilder peneliti mati.
--
-- Sengaja TIDAK di sini (sql/111+): campaign_links, doku_payouts,
-- page_respondents SELECT, JM_*, ra_*.
--
-- Jalankan DRY-RUN dulu, lalu APPLY. Jangan lewat MCP.
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'ai_settings',
    'ai_knowledge_base',
    'ai_skills',
    'chat_sessions',
    'chat_messages',
    'custom_mission_requests',
    'survey_pages'
  )
ORDER BY tablename, cmd, policyname;

-- ── APPLY ──────────────────────────────────────────────────────────────────
BEGIN;

-- ── 1. Mimin: SOP/FAQ/prompt ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow authenticated full access on ai_settings" ON public.ai_settings;
DROP POLICY IF EXISTS "Product manages ai_settings" ON public.ai_settings;
CREATE POLICY "Product manages ai_settings"
ON public.ai_settings
FOR ALL
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

DROP POLICY IF EXISTS "Allow authenticated full access on ai_knowledge_base" ON public.ai_knowledge_base;
DROP POLICY IF EXISTS "Allow public read access on ai_knowledge_base" ON public.ai_knowledge_base;
DROP POLICY IF EXISTS "Public reads active knowledge base" ON public.ai_knowledge_base;
DROP POLICY IF EXISTS "Product manages ai_knowledge_base" ON public.ai_knowledge_base;

CREATE POLICY "Public reads active knowledge base"
ON public.ai_knowledge_base
FOR SELECT
USING (is_active = true);

CREATE POLICY "Product manages ai_knowledge_base"
ON public.ai_knowledge_base
FOR ALL
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

DROP POLICY IF EXISTS "Allow authenticated users manage ai_skills" ON public.ai_skills;
DROP POLICY IF EXISTS "Product manages ai_skills" ON public.ai_skills;
CREATE POLICY "Product manages ai_skills"
ON public.ai_skills
FOR ALL
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

-- ── 2. Chat: cabut SELECT/UPDATE yang terbuka ke semua login ───────────────
-- Policy INSERT Product (sql/109) dibiarkan. INSERT/SELECT/UPDATE yang
-- qual-nya `true` atau cuma `authenticated` dicabut, lalu diganti Product +
-- pemilik sesi — termasuk INSERT, supaya kirim chat tidak mati kalau policy
-- lama ternyata WITH CHECK (true).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('chat_sessions', 'chat_messages')
      AND policyname <> 'Staff inserts admin chat messages'
      AND (
        qual IN (
          'true',
          '(true)',
          '(auth.role() = ''authenticated''::text)',
          '(auth.role() = ''authenticated'')'
        )
        OR with_check IN (
          'true',
          '(true)',
          '(auth.role() = ''authenticated''::text)',
          '(auth.role() = ''authenticated'')'
        )
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Allow authenticated users update chat_sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Admins can view all" ON public.chat_sessions;
DROP POLICY IF EXISTS "Admins can view all" ON public.chat_messages;
DROP POLICY IF EXISTS "Product reads all chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users read own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Product updates any chat session" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users update own chat session" ON public.chat_sessions;
DROP POLICY IF EXISTS "Product reads all chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users read own chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users insert own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users insert own chat messages" ON public.chat_messages;

CREATE POLICY "Users read own chat sessions"
ON public.chat_sessions
FOR SELECT
TO authenticated
USING (
  lower(coalesce(user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

CREATE POLICY "Product reads all chat sessions"
ON public.chat_sessions
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

CREATE POLICY "Users update own chat session"
ON public.chat_sessions
FOR UPDATE
TO authenticated
USING (
  lower(coalesce(user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
WITH CHECK (
  lower(coalesce(user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

CREATE POLICY "Product updates any chat session"
ON public.chat_sessions
FOR UPDATE
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

CREATE POLICY "Users read own chat messages"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.chat_sessions s
    WHERE s.id = chat_messages.session_id
      AND lower(coalesce(s.user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

CREATE POLICY "Product reads all chat messages"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

CREATE POLICY "Users insert own chat sessions"
ON public.chat_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  lower(coalesce(user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

CREATE POLICY "Users insert own chat messages"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.chat_sessions s
    WHERE s.id = chat_messages.session_id
      AND lower(coalesce(s.user_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

-- ── 3. Misi kustom: inbox internal hanya Product ───────────────────────────
DROP POLICY IF EXISTS "Allow authenticated read for internal dashboard" ON public.custom_mission_requests;
DROP POLICY IF EXISTS "Allow authenticated update for internal dashboard" ON public.custom_mission_requests;
DROP POLICY IF EXISTS "Product reads all custom mission requests" ON public.custom_mission_requests;
DROP POLICY IF EXISTS "Product updates custom mission requests" ON public.custom_mission_requests;

CREATE POLICY "Product reads all custom mission requests"
ON public.custom_mission_requests
FOR SELECT
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

CREATE POLICY "Product updates custom mission requests"
ON public.custom_mission_requests
FOR UPDATE
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

-- ── 4. survey_pages: Product + pemilik order; published tetap publik ───────
DROP POLICY IF EXISTS "Admins can do everything on pages" ON public.survey_pages;
DROP POLICY IF EXISTS "Product manages survey pages" ON public.survey_pages;
DROP POLICY IF EXISTS "Owners manage own survey pages" ON public.survey_pages;

CREATE POLICY "Product manages survey pages"
ON public.survey_pages
FOR ALL
TO authenticated
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');

CREATE POLICY "Owners manage own survey pages"
ON public.survey_pages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.form_submissions fs
    WHERE fs.id = survey_pages.submission_id
      AND (
        fs.auth_user_id = auth.uid()
        OR (fs.auth_user_id IS NULL AND fs.email = (auth.jwt() ->> 'email'))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.form_submissions fs
    WHERE fs.id = survey_pages.submission_id
      AND (
        fs.auth_user_id = auth.uid()
        OR (fs.auth_user_id IS NULL AND fs.email = (auth.jwt() ->> 'email'))
      )
  )
);

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'ai_settings',
    'ai_knowledge_base',
    'ai_skills',
    'chat_sessions',
    'chat_messages',
    'custom_mission_requests',
    'survey_pages'
  )
ORDER BY tablename, cmd, policyname;

-- Harus HILANG:
--   Allow authenticated full access on ai_*
--   Allow authenticated users manage ai_skills
--   Allow authenticated users update chat_sessions
--   Admins can view all (chat)
--   Allow authenticated read/update for internal dashboard (misi)
--   Admins can do everything on pages
--
-- Harus ADA:
--   Product manages ai_* / ai_skills
--   Public reads active knowledge base  (qual: is_active = true)
--   Users/Product read+update chat_sessions
--   Users insert own chat sessions / messages
--   Users/Product read chat_messages
--   Staff inserts admin chat messages   (sql/109)
--   Product reads/updates custom mission requests
--   Product/Owners manage survey pages
--   Public pages are viewable by everyone

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP POLICY IF EXISTS "Product manages ai_settings" ON public.ai_settings;
-- CREATE POLICY "Allow authenticated full access on ai_settings"
-- ON public.ai_settings FOR ALL USING (auth.role() = 'authenticated');
--
-- DROP POLICY IF EXISTS "Product manages ai_knowledge_base" ON public.ai_knowledge_base;
-- DROP POLICY IF EXISTS "Public reads active knowledge base" ON public.ai_knowledge_base;
-- CREATE POLICY "Allow public read access on ai_knowledge_base"
-- ON public.ai_knowledge_base FOR SELECT USING (true);
-- CREATE POLICY "Allow authenticated full access on ai_knowledge_base"
-- ON public.ai_knowledge_base FOR ALL USING (auth.role() = 'authenticated');
--
-- DROP POLICY IF EXISTS "Product manages ai_skills" ON public.ai_skills;
-- CREATE POLICY "Allow authenticated users manage ai_skills"
-- ON public.ai_skills FOR ALL
-- USING (auth.role() = 'authenticated')
-- WITH CHECK (auth.role() = 'authenticated');
--
-- DROP POLICY IF EXISTS "Product reads all chat sessions" ON public.chat_sessions;
-- DROP POLICY IF EXISTS "Users read own chat sessions" ON public.chat_sessions;
-- DROP POLICY IF EXISTS "Product updates any chat session" ON public.chat_sessions;
-- DROP POLICY IF EXISTS "Users update own chat session" ON public.chat_sessions;
-- DROP POLICY IF EXISTS "Product reads all chat messages" ON public.chat_messages;
-- DROP POLICY IF EXISTS "Users read own chat messages" ON public.chat_messages;
-- DROP POLICY IF EXISTS "Users insert own chat sessions" ON public.chat_sessions;
-- DROP POLICY IF EXISTS "Users insert own chat messages" ON public.chat_messages;
-- CREATE POLICY "Allow authenticated users update chat_sessions"
-- ON public.chat_sessions FOR UPDATE USING (auth.role() = 'authenticated');
--
-- DROP POLICY IF EXISTS "Product reads all custom mission requests" ON public.custom_mission_requests;
-- DROP POLICY IF EXISTS "Product updates custom mission requests" ON public.custom_mission_requests;
-- CREATE POLICY "Allow authenticated read for internal dashboard"
-- ON public.custom_mission_requests FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "Allow authenticated update for internal dashboard"
-- ON public.custom_mission_requests FOR UPDATE TO authenticated
-- USING (true) WITH CHECK (true);
--
-- DROP POLICY IF EXISTS "Product manages survey pages" ON public.survey_pages;
-- DROP POLICY IF EXISTS "Owners manage own survey pages" ON public.survey_pages;
-- CREATE POLICY "Admins can do everything on pages"
-- ON public.survey_pages FOR ALL USING (auth.role() = 'authenticated');
-- COMMIT;
