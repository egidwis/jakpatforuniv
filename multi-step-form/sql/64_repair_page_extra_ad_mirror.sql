-- 64_repair_page_extra_ad_mirror.sql
-- Date: 2026-08-19  ·  perbaikan sql/63
--
-- Menutup 9 order yang cerminnya tidak ikut terisi saat sql/63 diterapkan.
--
-- ============================================================================
-- SEBABNYA: URUTAN DI DALAM sql/63 SENDIRI
-- ============================================================================
--
-- sql/63 menjalankan backfill di bagian 2, lalu memasang trigger pendorong
-- cermin di bagian 7. Trigger tidak berlaku surut. Jadi 24 baris yang
-- di-backfill itu TIDAK PERNAH mendorong nilainya ke `survey_pages` —
-- yang tersisa cuma order yang kebetulan halamannya SUDAH bernilai sama.
--
-- Yang tertinggal persis order yang ke-extra-annya hanya datang dari penanda
-- teks `admin_notes = '[EXTRA_AD]'`: di sana halamannya memang masih `false`.
-- Terukur sesudah sql/63 diterapkan: 9 order.
--
-- Gejalanya HALUS dan itu yang membuatnya layak diperbaiki cepat: papan
-- kapasitas memindahkan mereka ke kolam Tambahan (ia membaca `ad_schedules`),
-- sementara label "Type" di daftar Submissions dan urutan kartu di feed
-- aplikasi tetap membacanya reguler (keduanya membaca `survey_pages`). Satu
-- order, dua jawaban — persis keadaan yang sepasang trigger itu dipasang untuk
-- mencegah.
--
-- ============================================================================
-- APA YANG BERUBAH DI LAYAR
-- ============================================================================
--
-- `orderBand()` di `src/utils/adOrdering.ts` menaruh iklan tambahan di pita
-- BAWAH. Jadi kesembilan order ini turun posisinya di feed aplikasi — yang
-- memang maksud admin sejak mereka mengetik `[EXTRA_AD]`, dan yang selama ini
-- diam-diam tidak terjadi.
--
-- Diperiksa sebelum menulis: kesembilannya `is_published = true` tetapi
-- **NOL yang sedang tayang** (jendela publish-nya sudah lewat). Jadi tidak ada
-- iklan berjalan yang berpindah urutan saat migrasi ini dijalankan.

BEGIN;

UPDATE survey_pages sp
SET is_extra_ad = a.is_extra_ad
FROM ad_schedules a
WHERE a.submission_id = sp.submission_id
  AND a.source_table = 'form_submissions'
  AND COALESCE(sp.is_extra_ad, false) IS DISTINCT FROM a.is_extra_ad;

COMMIT;

-- ============================================================================
-- VERIFIKASI
-- ============================================================================
--
--   -- 0 — cermin sepakat dengan jadwal ordinal 1
--   SELECT count(*) FROM survey_pages sp
--   JOIN ad_schedules a ON a.submission_id = sp.submission_id
--                      AND a.source_table = 'form_submissions'
--   WHERE COALESCE(sp.is_extra_ad,false) IS DISTINCT FROM a.is_extra_ad;
--
--   -- halaman yang BELUM lahir tidak perlu dikejar: trigger
--   -- trg_survey_pages_pull_extra_ad mengisinya saat barisnya dibuat.
--
-- ============================================================================
-- PELAJARAN UNTUK MIGRASI BERIKUTNYA
-- ============================================================================
--
--   Backfill yang mengandalkan trigger untuk menyebar harus dijalankan SESUDAH
--   triggernya terpasang, atau menyebarkannya sendiri di pernyataan yang sama.
--   Verifikasi di kaki sql/63 sebenarnya sudah memuat kuerinya — ia hanya
--   dijalankan sesudah COMMIT, dan angkanya (9, bukan 0) yang menemukan ini.
