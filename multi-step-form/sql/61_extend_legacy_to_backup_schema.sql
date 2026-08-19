-- 61_extend_legacy_to_backup_schema.sql
-- Date: 2026-08-19  ·  Susulan keamanan untuk sql/52
--
-- Menutup satu-satunya ERROR di Supabase Security Advisor:
--   "RLS Disabled in Public"  ->  public.form_submissions_extend_legacy
--
-- ============================================================================
-- APA YANG TERJADI
-- ============================================================================
-- Bagian 1 sql/52 membuat snapshot jalan-pulang dengan
-- `CREATE TABLE form_submissions_extend_legacy AS SELECT * FROM ...`.
-- Dua sifat Postgres/Supabase bertemu di situ:
--
--   (1) `CREATE TABLE ... AS SELECT` TIDAK mewarisi RLS maupun policy dari
--       tabel sumbernya. Snapshot lahir dengan `relrowsecurity = false`,
--       nol policy — walau sumbernya punya empat policy.
--   (2) `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon` yang
--       dipasang Supabase di skema `public` langsung memberi tabel baru itu
--       tujuh privilege untuk `anon`, tanpa satu baris GRANT pun ditulis.
--
-- Ini JEBAKAN YANG SAMA yang sudah ditemukan dan ditutup di bagian 7 sql/52
-- untuk VIEW-nya. Yang luput: snapshot di bagian 1 dibuat SEBELUM temuan itu
-- muncul, dan tidak ikut disapu REVOKE.
--
-- Terukur sebagai `anon` sebelum perbaikan ini (di dalam transaksi yang
-- dibatalkan, jadi tidak ada data yang berubah):
--   SELECT  -> 15 baris terbaca, agregat total_cost 6.316.683
--   UPDATE  -> 15 baris berhasil ditulis
-- `anon` key ada di bundel frontend dan skema `public` diekspos PostgREST,
-- jadi ini terjangkau dari internet lewat
-- GET/PATCH /rest/v1/form_submissions_extend_legacy.
--
-- Peredam yang kebetulan berlaku: `admin_notes` dan `voucher_code` NULL di
-- kelima belas baris, dan tidak ada nama/email di tabel ini. Yang terekspos:
-- submission_id, jendela tayang, payment_status, total_cost/subtotal/
-- ppn_amount, hadiah. Tulisan `anon` tidak menjalar ke data hidup (snapshot
-- CTAS tidak punya trigger maupun FK) tapi ia bisa MERUSAK jalan pulang sql/52.
--
-- ============================================================================
-- KENAPA PINDAH SKEMA, BUKAN SEKADAR "ENABLE RLS"
-- ============================================================================
-- Snapshot rollback tidak punya alasan apa pun untuk terlihat dari API. Selama
-- ia duduk di `public` ia akan SELALU: diekspos PostgREST, dan mewarisi default
-- privilege `anon` setiap kali seseorang membuatnya ulang. Memindahkannya
-- mencabut kedua sifat itu sekaligus, di sumbernya.
--
-- Terverifikasi sebelum menerapkan: `pg_default_acl` untuk anon/authenticated
-- HANYA terpasang di `public` (juga storage/graphql) — TIDAK ada entri lintas
-- skema. Jadi skema `backup` tidak mewarisi jebakan (2).
--
-- ⚠️ Tapi GRANT yang SUDAH melekat IKUT PINDAH bersama tabelnya —
-- `ALTER TABLE ... SET SCHEMA` tidak menyentuh ACL sama sekali. REVOKE di
-- bawah WAJIB, bukan kehati-hatian berlebih. Tanpa itu tabelnya cuma berpindah
-- alamat sambil membawa serta hak `anon`-nya.
--
-- ⚠️ `backup` TIDAK BOLEH ditambahkan ke "Exposed schemas" (Dashboard >
-- Settings > API). Seluruh perbaikan ini bergantung pada skema itu tetap di
-- luar jangkauan PostgREST.
--
-- Idempoten: aman dijalankan ulang, dan tidak error kalau snapshotnya sudah
-- terlanjur dibuang.
-- ============================================================================


-- ============================================================================
-- 1. Skema `backup` — bukan bagian dari permukaan API
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS backup;

-- Skema baru di Postgres tidak memberi USAGE ke PUBLIC secara default; baris
-- ini menegaskannya supaya tidak bergantung pada default yang bisa berubah.
-- `anon`/`authenticated` sengaja TIDAK diberi USAGE: itu gerbang utamanya —
-- tanpa USAGE, grant tabel apa pun yang tersisa jadi tidak bisa dipakai.
REVOKE ALL ON SCHEMA backup FROM PUBLIC;

COMMENT ON SCHEMA backup IS
  'Snapshot & tabel jalan-pulang migrasi. DI LUAR permukaan PostgREST — '
  'jangan pernah tambahkan ke Exposed schemas, dan jangan beri USAGE ke '
  'anon/authenticated. Isinya boleh dibuang setelah migrasi terkait tenang.';


-- ============================================================================
-- 2. Cabut hak `anon`, lalu pindahkan
-- ============================================================================
-- Urutannya sengaja REVOKE dulu baru pindah: kalau langkah pindah gagal di
-- tengah, lubangnya sudah tertutup lebih dulu.
DO $$
DECLARE
  v_schema TEXT;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'form_submissions_extend_legacy'
    AND c.relkind = 'r'
    AND n.nspname IN ('public', 'backup');

  IF v_schema IS NULL THEN
    RAISE NOTICE 'form_submissions_extend_legacy tidak ada di public maupun backup — snapshot sudah dibuang. Tidak ada yang dikerjakan.';
    RETURN;
  END IF;

  EXECUTE format(
    'REVOKE ALL ON %I.form_submissions_extend_legacy FROM anon, authenticated',
    v_schema);

  IF v_schema = 'public' THEN
    EXECUTE 'ALTER TABLE public.form_submissions_extend_legacy SET SCHEMA backup';
    RAISE NOTICE 'form_submissions_extend_legacy dipindah public -> backup.';
  END IF;

  -- Sabuk kedua. Dengan skema di luar PostgREST dan tanpa USAGE, ini memang
  -- berlebih HARI INI — dan itulah gunanya: kalau suatu saat `backup` diekspos
  -- atau seseorang memberi USAGE, tabel ini tetap tertutup. Biayanya nol,
  -- tidak ada satu pun kode aplikasi yang membacanya.
  -- `postgres` dan `service_role` punya BYPASSRLS, jadi rollback sql/52 dari
  -- SQL Editor tetap bisa membacanya.
  EXECUTE 'ALTER TABLE backup.form_submissions_extend_legacy ENABLE ROW LEVEL SECURITY';

  EXECUTE $c$
    COMMENT ON TABLE backup.form_submissions_extend_legacy IS
      'Snapshot form_submissions_extend tepat sebelum sql/52 mengubahnya jadi '
      'view (2026-08-19, 15 baris). Jalan pulang kalau Deploy B harus '
      'dibatalkan. Dipindah dari public ke backup oleh sql/61 karena lahir '
      'tanpa RLS dan mewarisi hak penuh anon. Boleh dibuang setelah satu '
      'siklus rilis sql/52 tanpa keluhan — lihat docs/jadwal-iklan-progress.md '
      'Sec.00N. Baris yang lahir SESUDAH sql/52 tidak ada di sini.'
  $c$;
END $$;


-- ============================================================================
-- VERIFIKASI — jalankan SESUDAH menerapkan
-- ============================================================================
-- -- (1) Tabelnya ada di `backup`, RLS hidup, dan `public` sudah bersih:
-- SELECT n.nspname AS skema, c.relrowsecurity AS rls_hidup
-- FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE c.relname = 'form_submissions_extend_legacy';
-- -- harapan: satu baris, backup / true
--
-- -- (2) Nol hak untuk anon & authenticated (harus nol baris):
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_name = 'form_submissions_extend_legacy'
--    AND grantee IN ('anon', 'authenticated');
--
-- -- (3) Skema tak terjangkau (harus false, false):
-- SELECT has_schema_privilege('anon','backup','USAGE') AS anon_usage,
--        has_schema_privilege('authenticated','backup','USAGE') AS auth_usage;
--
-- -- (4) Datanya utuh — 15 baris, sidik jari sama seperti kepala sql/52:
-- SELECT count(*) FROM backup.form_submissions_extend_legacy;
--
-- -- (5) Security Advisor: ERROR "RLS Disabled in Public" harus hilang.
--
-- -- (6) View-nya TIDAK tersentuh — masih 15 baris lewat ad_schedules:
-- SELECT count(*) FROM public.form_submissions_extend;

-- ============================================================================
-- ROLLBACK sql/52 SESUDAH sql/61 — pathnya berubah
-- ============================================================================
-- Prosedurnya sama persis seperti di kaki sql/52, hanya sumbernya kini
-- `backup.form_submissions_extend_legacy`, bukan `public....`:
--
-- DROP VIEW public.form_submissions_extend CASCADE;
-- CREATE TABLE public.form_submissions_extend AS
--   SELECT * FROM backup.form_submissions_extend_legacy;
-- -- lalu pulihkan pkey/index/RLS/trigger dari 19_create_extend_table.sql
-- -- + 33 + 38 + 41, dan kembalikan assert_no_schedule_overlap() ke versi sql/38.
-- ⚠️ Tabel hasil CREATE TABLE AS SELECT itu akan lahir TANPA RLS dan DENGAN
--    hak penuh anon — persis bug yang berkas ini tutup. Kalau rollback benar-
--    benar dijalankan, sertakan ENABLE RLS + REVOKE anon di transaksi yang sama.
--
-- ============================================================================
-- MEMBATALKAN sql/61 SENDIRI (jarang dibutuhkan)
-- ============================================================================
-- ALTER TABLE backup.form_submissions_extend_legacy SET SCHEMA public;
-- ALTER TABLE public.form_submissions_extend_legacy DISABLE ROW LEVEL SECURITY;
-- -- ⚠️ jangan kembalikan grant anon-nya. Lubang itu tidak pernah disengaja.
