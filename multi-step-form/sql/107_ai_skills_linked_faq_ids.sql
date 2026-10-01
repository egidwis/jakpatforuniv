-- ============================================================================
-- sql/107 — TAUTAN FAQ KE SKILL MIMIN
-- ============================================================================
--
-- Skill dan Simple FAQs selama ini hidup paralel: semua FAQ aktif disuntik
-- ke setiap chat, tanpa skill mana yang "punya" Q&A itu. Kolom ini memungkinkan
-- admin menandai FAQ mana yang jadi sumber jawaban sebuah SOP (mis. skill
-- "cara kerja JFU" → FAQ cara kerja / integrasi / siapa yang boleh pakai).
--
-- FAQ yang tidak tertaut tetap masuk knowledge base global. Yang tertaut
-- diulang di blok SOP-nya supaya model mengutamakan Q&A itu saat trigger cocok.
--
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ai_skills'
  AND column_name = 'linked_faq_ids';
-- 0 baris = kolom belum ada, aman diterapkan.

-- ── APPLY ──────────────────────────────────────────────────────────────────
ALTER TABLE ai_skills
  ADD COLUMN IF NOT EXISTS linked_faq_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN ai_skills.linked_faq_ids IS
  'id baris ai_knowledge_base yang wajib dipakai sebagai sumber jawaban SOP ini';

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT id, name, cardinality(linked_faq_ids) AS faq_count
FROM ai_skills
ORDER BY sort_order ASC;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- ALTER TABLE ai_skills DROP COLUMN IF EXISTS linked_faq_ids;
