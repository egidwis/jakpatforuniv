-- ============================================================================
-- sql/121 — TULISAN JFU FORM HANYA LEWAT service_role
-- ============================================================================
--
-- Sesudah tiga endpoint ini hidup di produksi dan masing-masing 200:
--   POST /api/forms/save     buat, ubah draf, terbitkan, hapus
--   POST /api/forms/upload   gambar header dan blok
--   POST /api/forms/submit   jawaban responden anonim, hanya form published
--
-- ⚠️ JANGAN DIJALANKAN SEBELUM deploy commit yang memuat function itu.
-- Kalau policy ini dipasang lebih dulu, simpan form, unggah gambar lewat
-- browser, dan kirim jawaban responden gagal.
--
-- Baca tetap di browser: pemilik membaca drafnya, publik membaca form
-- yang published, pemilik membaca jawaban.
--
-- Bucket page-uploads TIDAK disentuh. Gambar halaman survei masih lewat
-- browser. Yang pindah hanya unggahan form builder, dan path-nya
-- users/{id}/.
--
-- Jalankan APPLY utuh. Jangan lewat MCP.
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT policyname, cmd
FROM pg_policies
WHERE tablename IN ('custom_forms', 'custom_form_responses')
ORDER BY tablename, policyname;

-- ── APPLY ──────────────────────────────────────────────────────────────────
BEGIN;

DROP POLICY IF EXISTS "Users can manage their own custom_forms" ON public.custom_forms;

CREATE POLICY "Users can read their own custom_forms"
  ON public.custom_forms
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public can submit responses to published forms" ON public.custom_form_responses;

REVOKE INSERT, UPDATE, DELETE ON public.custom_forms FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.custom_form_responses FROM PUBLIC, anon, authenticated;

COMMIT;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('custom_forms', 'custom_form_responses')
ORDER BY tablename, cmd;
-- Harus tersisa: custom_forms SELECT (pemilik + published),
-- custom_form_responses SELECT (pemilik). Tidak ada INSERT/UPDATE/DELETE/ALL.

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP POLICY IF EXISTS "Users can read their own custom_forms" ON public.custom_forms;
-- CREATE POLICY "Users can manage their own custom_forms"
--   ON public.custom_forms
--   FOR ALL
--   USING (auth.uid() = user_id)
--   WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Public can submit responses to published forms"
--   ON public.custom_form_responses
--   FOR INSERT
--   WITH CHECK (
--     EXISTS (
--       SELECT 1 FROM public.custom_forms
--       WHERE custom_forms.id = custom_form_responses.form_id
--         AND custom_forms.status = 'published'
--     )
--   );
-- GRANT INSERT, UPDATE, DELETE ON public.custom_forms TO anon, authenticated;
-- GRANT INSERT, UPDATE, DELETE ON public.custom_form_responses TO anon, authenticated;
-- COMMIT;
