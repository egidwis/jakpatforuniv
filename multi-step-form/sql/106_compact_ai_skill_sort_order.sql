-- ============================================================================
-- sql/106 — RAPATKAN NOMOR SKILL MIMIN (sort_order 1..n)
-- ============================================================================
--
-- Skill 5 dan 6 dihapus, 7–8 tidak digeser, jadi badge di /internal-dash
-- menampilkan 1, 2, 3, 4, 7, 8. Urutan relatif tidak berubah: PII jadi 5,
-- eskalasi Product jadi 6.
--
-- Setup admin (fetchAllAISkills) juga merapatkan sendiri saat halaman dibuka.
-- Berkas ini untuk rapat dari SQL Editor tanpa menunggu orang buka dashboard.
--
-- ============================================================================

-- ── DRY-RUN ────────────────────────────────────────────────────────────────
SELECT id, sort_order, name
FROM ai_skills
ORDER BY sort_order ASC, name ASC;

-- ── APPLY ──────────────────────────────────────────────────────────────────
WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY sort_order ASC, name ASC) AS next_order
  FROM ai_skills
)
UPDATE ai_skills AS s
SET
  sort_order = ordered.next_order + 1000,
  updated_at = NOW()
FROM ordered
WHERE s.id = ordered.id;

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY sort_order ASC, name ASC) AS next_order
  FROM ai_skills
)
UPDATE ai_skills AS s
SET
  sort_order = ordered.next_order,
  updated_at = NOW()
FROM ordered
WHERE s.id = ordered.id;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
-- Harus 1..6 rapat (atau 1..n sesuai jumlah baris).
SELECT id, sort_order, name
FROM ai_skills
ORDER BY sort_order ASC;

-- ── ROLLBACK ───────────────────────────────────────────────────────────────
-- Nomor lama 7/8 tidak disimpan. Rollback ke gap hanya relevan jika kamu
-- sengaja ingin badge lompat lagi:
-- UPDATE ai_skills SET sort_order = 7
-- WHERE name = 'Panduan Lolos Review Kuesioner & Aturan Privasi (PII)';
-- UPDATE ai_skills SET sort_order = 8
-- WHERE name = 'Eskalasi Informasi Khusus & Pertanyaan di Luar SOP ke Tim Product';
