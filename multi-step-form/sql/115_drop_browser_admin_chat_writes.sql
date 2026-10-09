-- ============================================================================
-- sql/115 — CABUT TULIS CHAT ADMIN DARI BROWSER
-- ============================================================================
--
-- Sesudah /api/admin/chat hidup. Akun product@jakpat.net tidak lagi boleh
-- menyisipkan pesan admin atau mengubah sesi orang lain lewat PostgREST.
--
-- ⚠️ JANGAN DIJALANKAN SEBELUM:
--   1. sql/114 sudah terpasang (trigger mengenal service_role)
--   2. function Cloudflare sudah di-deploy dan dicoba (balas + ambil alih)
--
-- Yang tetap: peneliti menulis dan membaca sesinya sendiri. Product tetap
-- boleh MEMBACA seluruh inbox. Pesan peneliti (role user/assistant) tidak
-- disentuh.
--
-- Jalankan APPLY utuh. Jangan lewat MCP.
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('chat_messages', 'chat_sessions')
ORDER BY tablename, cmd, policyname;

-- ── APPLY ──────────────────────────────────────────────────────────────────
BEGIN;

DROP POLICY IF EXISTS "Staff inserts admin chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Product updates any chat session" ON public.chat_sessions;

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('chat_messages', 'chat_sessions')
  AND policyname IN (
    'Staff inserts admin chat messages',
    'Product updates any chat session'
  );
-- Harus 0 baris.

-- Harus MASIH ADA:
--   Users insert own chat messages / Users can insert own messages
--   Product reads all chat sessions / messages
--   Users read/update own chat sessions

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- CREATE POLICY "Staff inserts admin chat messages"
-- ON public.chat_messages
-- FOR INSERT
-- TO authenticated
-- WITH CHECK (
--   role = 'admin'
--   AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net'
-- );
--
-- CREATE POLICY "Product updates any chat session"
-- ON public.chat_sessions
-- FOR UPDATE
-- TO authenticated
-- USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net')
-- WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net');
