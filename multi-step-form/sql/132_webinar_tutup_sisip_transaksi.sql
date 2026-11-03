-- ============================================================================
-- sql/132 — BARIS TRANSAKSI WEBINAR TIDAK BOLEH MENUMPANG ORDER IKLAN
-- ============================================================================
--
-- Policy "Users Insert Transactions" mengizinkan akun yang login menyisipkan
-- baris transactions untuk order miliknya, tanpa membatasi kolom lain. Tanpa
-- berkas ini, akun biasa bisa menulis `entity_type='webinar'` di order iklannya
-- sendiri, lalu baris itu terhitung sebagai pendapatan webinar di Fase 4.
--
-- Baris webinar yang sah selalu tanpa order iklan (webinar_mark_paid, sql/131),
-- sedangkan policy tadi mewajibkan order iklan. CHECK ini membuat keduanya
-- mustahil terpenuhi bersamaan bagi akun biasa.
--
-- Berkas ini TIDAK menutup lubang umumnya, yaitu penyisipan baris
-- `status='completed'` ber-entity_type lain. Itu perlu migrasi terpisah.


-- ============================================================================
-- LANGKAH 1 — DRY-RUN (baca saja)
-- ============================================================================
--
-- Harapan: 0. Bila lebih, BERHENTI dan periksa barisnya.
--
-- SELECT count(*) FROM public.transactions
--  WHERE entity_type = 'webinar' AND (form_submission_id IS NOT NULL OR extend_id IS NOT NULL);


-- ============================================================================
-- LANGKAH 2 — TERAPKAN
-- ============================================================================

BEGIN;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_webinar_has_no_ad_order CHECK (
    entity_type IS DISTINCT FROM 'webinar'
    OR (form_submission_id IS NULL AND extend_id IS NULL AND schedule_id IS NULL)
  );

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- Harapan: satu baris berisi definisi CHECK di atas.
--
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conname = 'transactions_webinar_has_no_ad_order';


-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
-- BEGIN;
-- ALTER TABLE public.transactions DROP CONSTRAINT transactions_webinar_has_no_ad_order;
-- COMMIT;
