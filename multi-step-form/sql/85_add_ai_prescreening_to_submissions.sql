-- 85_add_ai_prescreening_to_submissions.sql
-- Date: 2026-09-10
--
-- Menambahkan kolom ai_prescreening (JSONB) pada form_submissions
-- untuk menyimpan hasil automated audit kuesioner (PII, question count, randomizer).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Aman dijalankan ulang.

ALTER TABLE form_submissions
ADD COLUMN IF NOT EXISTS ai_prescreening JSONB;

COMMENT ON COLUMN form_submissions.ai_prescreening IS
  'Hasil audit otomatis AI pre-screening (deteksi PII, matching jumlah pertanyaan, deteksi randomizer, dan rekomendasi review).';
