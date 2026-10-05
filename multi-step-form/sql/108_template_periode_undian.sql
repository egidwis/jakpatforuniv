-- ============================================================================
-- sql/108 — TEMPLATE HALAMAN BARU: PERIODE UNDIAN, BUKAN PENGUMUMAN AKHIR BULAN
-- ============================================================================
--
-- Kalimat default "Semua pemenang undian survei akan diumumkan setiap akhir
-- bulan" tidak benar. Yang benar: periode undian ditutup tiap akhir bulan,
-- dan pemenang diundi sekitar minggu pertama bulan berikutnya. Tanggal
-- pengundiannya perkiraan, jadi teksnya memakai "sekitar", bukan janji hari.
--
-- Dua salinan template (komentar di ensure_survey_page, sql/99):
--   · src/components/PageBuilder/PageBuilderModal.tsx  → sudah diubah di kode
--   · public.ensure_survey_page(uuid)                 → berkas ini
--
-- ⚠️ HALAMAN YANG SUDAH TERSIMPAN TIDAK DISENTUH.
-- ensure_survey_page hanya menulis `blocks` saat INSERT halaman baru.
-- Cabang buka-ulang (auto_closed_at) tidak menulis `blocks`. Berkas ini
-- juga tidak menjalankan UPDATE pada survey_pages.
--
-- Cara kerjanya: ambil definisi fungsi yang HIDUP di database, ganti satu
-- kalimat, lalu CREATE OR REPLACE dari hasil itu. Badan fungsi yang lain
-- tidak disalin dari berkas lama, jadi perubahan produksi sesudah sql/99
-- tidak tertimpa.
--
-- CREATE OR REPLACE mempertahankan ACL. Jangan REVOKE di sini.
-- ============================================================================


-- ============================================================================
-- DRY-RUN — jalankan ini DULU, tanpa menulis apa pun.
-- Harapan:
--   fungsi_masih_kalimat_lama = true
--   kalimat_lama_muncul       = 1
--   halaman_tersimpan         = berapa pun (hanya dihitung, tidak diubah)
-- ============================================================================
--
-- SELECT
--   position(
--     'Semua pemenang undian survei akan diumumkan setiap akhir bulan'
--     IN pg_get_functiondef('public.ensure_survey_page(uuid)'::regprocedure)
--   ) > 0 AS fungsi_masih_kalimat_lama,
--   (
--     length(pg_get_functiondef('public.ensure_survey_page(uuid)'::regprocedure))
--     - length(replace(
--         pg_get_functiondef('public.ensure_survey_page(uuid)'::regprocedure),
--         'Semua pemenang undian survei akan diumumkan setiap akhir bulan, jadi tunggu pengumuman dari kami ya. Semoga beruntung! ✨',
--         ''
--       ))
--   ) / length('Semua pemenang undian survei akan diumumkan setiap akhir bulan, jadi tunggu pengumuman dari kami ya. Semoga beruntung! ✨')
--     AS kalimat_lama_muncul,
--   (SELECT count(*) FROM survey_pages
--     WHERE blocks::text LIKE '%Semua pemenang undian survei akan diumumkan setiap akhir bulan%')
--     AS halaman_tersimpan;


BEGIN;

DO $patch$
DECLARE
  def text;
  old_sentence text := 'Semua pemenang undian survei akan diumumkan setiap akhir bulan, jadi tunggu pengumuman dari kami ya. Semoga beruntung! ✨';
  new_sentence text := 'Periode undian bulan ini ditutup di akhir bulan. Pemenang diundi sekitar minggu pertama bulan berikutnya. Tunggu pengumuman dari kami ya. Semoga beruntung! ✨';
  n int;
BEGIN
  def := pg_get_functiondef('public.ensure_survey_page(uuid)'::regprocedure);
  n := (length(def) - length(replace(def, old_sentence, ''))) / length(old_sentence);

  IF n = 0 AND position(new_sentence IN def) > 0 THEN
    RAISE NOTICE 'ensure_survey_page sudah memakai kalimat baru. Tidak ada yang diubah.';
    RETURN;
  END IF;

  IF n <> 1 THEN
    RAISE EXCEPTION 'Kalimat lama muncul % kali di ensure_survey_page, diharapkan 1. Tidak ada yang diubah.', n;
  END IF;

  EXECUTE replace(def, old_sentence, new_sentence);
END
$patch$;

COMMIT;


-- ============================================================================
-- VERIFIKASI — sesudah COMMIT. Harapan: kalimat baru ada, kalimat lama hilang
-- dari fungsi, dan jumlah halaman tersimpan SAMA dengan dry-run.
-- ============================================================================
--
-- SELECT
--   position(
--     'Pemenang diundi sekitar minggu pertama bulan berikutnya'
--     IN pg_get_functiondef('public.ensure_survey_page(uuid)'::regprocedure)
--   ) > 0 AS fungsi_kalimat_baru,
--   position(
--     'Semua pemenang undian survei akan diumumkan setiap akhir bulan'
--     IN pg_get_functiondef('public.ensure_survey_page(uuid)'::regprocedure)
--   ) > 0 AS fungsi_masih_kalimat_lama,
--   (SELECT count(*) FROM survey_pages
--     WHERE blocks::text LIKE '%Semua pemenang undian survei akan diumumkan setiap akhir bulan%')
--     AS halaman_tersimpan_tidak_disentuh;


-- ============================================================================
-- ROLLBACK — mengembalikan kalimat lama ke dalam fungsi yang hidup.
-- Tidak menulis survey_pages.
-- ============================================================================
--
-- BEGIN;
-- DO $rollback$
-- DECLARE
--   def text;
--   old_sentence text := 'Periode undian bulan ini ditutup di akhir bulan. Pemenang diundi sekitar minggu pertama bulan berikutnya. Tunggu pengumuman dari kami ya. Semoga beruntung! ✨';
--   new_sentence text := 'Semua pemenang undian survei akan diumumkan setiap akhir bulan, jadi tunggu pengumuman dari kami ya. Semoga beruntung! ✨';
--   n int;
-- BEGIN
--   def := pg_get_functiondef('public.ensure_survey_page(uuid)'::regprocedure);
--   n := (length(def) - length(replace(def, old_sentence, ''))) / length(old_sentence);
--   IF n <> 1 THEN
--     RAISE EXCEPTION 'Kalimat baru muncul % kali, diharapkan 1. Rollback dibatalkan.', n;
--   END IF;
--   EXECUTE replace(def, old_sentence, new_sentence);
-- END
-- $rollback$;
-- COMMIT;
