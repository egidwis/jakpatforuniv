-- ============================================================================
-- sql/109 — PRODUCT BOLEH MENYISIPKAN PESAN ADMIN
-- ============================================================================
--
-- sql/108 menambah kolom dan trigger, tapi INSERT chat_messages tetap
-- ditolak RLS: "new row violates row-level security policy".
-- Policy yang ada hanya mengizinkan pemilik sesi (peneliti). Akun
-- product@jakpat.net menulis ke sesi orang lain, jadi baris role=admin
-- tidak lolos WITH CHECK.
--
-- Policy baru ini PERMISSIVE: digabung dengan OR, tidak menggantikan
-- policy peneliti. Trigger sql/108 tetap menolak role=admin dari email lain.
--
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'chat_messages'
ORDER BY cmd, policyname;

-- ── APPLY ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Staff inserts admin chat messages" ON public.chat_messages;

CREATE POLICY "Staff inserts admin chat messages"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  role = 'admin'
  AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'product@jakpat.net'
);

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT policyname, cmd, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'chat_messages'
  AND policyname = 'Staff inserts admin chat messages';
-- Harus 1 baris.

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "Staff inserts admin chat messages" ON public.chat_messages;
