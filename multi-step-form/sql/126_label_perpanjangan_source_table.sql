-- ============================================================================
-- sql/126 — DOKUMENTASI: 'form_submissions_extend' adalah LABEL, bukan tabel
-- ============================================================================
--
-- Hanya COMMENT ON COLUMN. Nol perubahan data, skema, hibah, atau perilaku.
--
-- ── KENAPA ──────────────────────────────────────────────────────────────────
--
--   Tabel/VIEW public.form_submissions_extend sudah DICABUT (sql/73–76).
--   Sejak Phase 4 semua jadwal — pertama maupun perpanjangan — setara di
--   ad_schedules. Yang tersisa hanya TEKS di ad_schedules.source_table:
--
--     'form_submissions'         → ordinal 1, source_id = form_submissions.id
--     'form_submissions_extend'  → ordinal ≥2 (perpanjangan), source_id =
--                                  gen_random_uuid() dari create_ad_schedule;
--                                  TIDAK menunjuk ke tabel mana pun
--
--   Nama label itu terbaca seperti nama tabel dan sudah membingungkan
--   (22 Okt 2026). Labelnya SENGAJA tidak diganti: dipakai 13 fungsi, CHECK
--   ad_schedules_source_table_check, unique key (source_table, source_id),
--   ±14 berkas kode, trigger sql/125, dan md5 create_ad_schedule yang dijaga
--   sql/123. Mengganti nama = proyek terpisah sesudah sql/123/124.
--
--   Salinan lama tabelnya (hanya arsip, tanpa hibah klien):
--     backup.form_submissions_extend_legacy, backup.del_20260820_form_submissions_extend
--
-- ── URUTAN ──────────────────────────────────────────────────────────────────
--
--   Langkah 1 (pra-cek) → Langkah 2 (migrasi) → Langkah 3 (verifikasi).
--   Independen dari 123/124/125; boleh diterapkan kapan saja.


-- ============================================================================
-- LANGKAH 1 — PRA-CEK (hanya baca). Harapan: SEMUA kolom true.
-- ============================================================================

select
  to_regclass('public.form_submissions_extend') is null                  as tabel_extend_sudah_tiada,
  col_description('public.ad_schedules'::regclass,
    (select attnum from pg_attribute
      where attrelid = 'public.ad_schedules'::regclass and attname = 'source_table')) is null
                                                                          as source_table_belum_berkomentar,
  not exists (select 1 from public.ad_schedules
               where source_table = 'form_submissions_extend' and ordinal < 2)
                                                                          as label_extend_selalu_ordinal_2_ke_atas;


-- ============================================================================
-- LANGKAH 2 — MIGRASI
-- ============================================================================

-- >>> MIGRASI
COMMENT ON COLUMN public.ad_schedules.source_table IS
  'LABEL asal jadwal, BUKAN nama tabel yang dirujuk. '
  '''form_submissions'' = jadwal pertama (ordinal 1, source_id = form_submissions.id). '
  '''form_submissions_extend'' = perpanjangan (ordinal >= 2, source_id = uuid acak dari create_ad_schedule). '
  'Tabel form_submissions_extend sudah dicabut (sql/73-76); labelnya dipertahankan karena dipakai fungsi, CHECK, unique key, dan kode (sql/126).';
-- <<< MIGRASI


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI. Harapan: komentar diawali "LABEL asal jadwal".
-- ============================================================================

select col_description('public.ad_schedules'::regclass, a.attnum) as komentar
  from pg_attribute a
 where a.attrelid = 'public.ad_schedules'::regclass and a.attname = 'source_table';


-- ============================================================================
-- ROLLBACK — hanya bila perlu. Sebelum sql/126 kolom ini tanpa komentar.
-- ============================================================================

-- >>> ROLLBACK
-- COMMENT ON COLUMN public.ad_schedules.source_table IS NULL;
-- <<< ROLLBACK
