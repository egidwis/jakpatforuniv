-- ============================================================================
-- sql/105 — CTA MAILTO UNTUK SKILL ESKALASI PRODUCT
-- ============================================================================
--
-- Skill "Eskalasi Informasi Khusus & Pertanyaan di Luar SOP ke Tim Product"
-- SOP-nya sudah mewajibkan tombol mailto:product@jakpat.net, tapi kolom
-- suggested_actions masih default form admin: navigate → /dashboard
-- ("Cek Status & Extend"). Blok itu yang disuntik ke system prompt sebagai
-- "CTA yang WAJIB", jadi model mengabaikan langkah SOP 4–5, atau menolak
-- di teks tanpa tombol sama sekali.
--
-- Client chat (ChatPage) menambal kasus ini, tapi CTA di DB tetap harus benar
-- supaya prompt dan inbox admin tidak mengajarkan tombol yang salah.
--
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
-- Harus 1 baris: CTA sekarang navigate /dashboard.
SELECT
  id,
  name,
  suggested_actions
FROM ai_skills
WHERE name = 'Eskalasi Informasi Khusus & Pertanyaan di Luar SOP ke Tim Product';

-- ── APPLY ──────────────────────────────────────────────────────────────────
UPDATE ai_skills
SET
  suggested_actions = '[
    {
      "label": "📧 Email product@jakpat.net",
      "action": "open_url",
      "url": "mailto:product@jakpat.net?subject=Pertanyaan%20dari%20Mimin%20AI%20%E2%80%94%20Jakpat%20for%20Universities"
    }
  ]'::jsonb,
  updated_at = NOW()
WHERE name = 'Eskalasi Informasi Khusus & Pertanyaan di Luar SOP ke Tim Product';

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- UPDATE ai_skills
-- SET
--   suggested_actions = '[
--     {
--       "url": "/dashboard",
--       "label": "🚀 Cek Status & Extend",
--       "action": "navigate"
--     }
--   ]'::jsonb,
--   updated_at = NOW()
-- WHERE name = 'Eskalasi Informasi Khusus & Pertanyaan di Luar SOP ke Tim Product';
