-- ============================================================
-- Migration 43: survey_winners jadi arsip beku + rapikan kebijakan RLS
-- Date: 2026-08-04  (Phase 2 Task 8C)
--
-- Pengundian dulu dijalankan dari dashboard admin ini. Sejak 2026-05-05 ia
-- diserahkan ke platform pihak ketiga, dan survey_winners berhenti terisi —
-- itu serah terima yang disengaja, bukan tabel yang rusak. File ini menuliskan
-- keadaan itu ke dalam skema, lalu merapikan kebijakan RLS-nya.
--
-- TIDAK ADA perubahan skema dan TIDAK ADA baris yang tersentuh. Tabelnya tetap,
-- indeksnya tetap, dan UNIQUE(page_id, jakpat_id) SENGAJA dibiarkan apa adanya —
-- aturan "satu responden menang sekali" sekarang ditegakkan pihak ketiga, dan
-- constraint ini tidak lagi menghalangi apa pun karena tidak ada yang menulis.
--
-- ⚠️ TEMUAN PRE-CHECK (2026-08-04) YANG MENGUBAH ISI FILE INI:
-- sql/15_secure_survey_winners.sql membuat DUA kebijakan: SELECT publik
-- ("Allow public read survey_winners", USING (true)) dan FOR ALL admin
-- ("Allow product admin to modify survey_winners"). Query pg_policies di
-- produksi hari ini hanya menunjukkan SATU — FOR ALL admin. Kebijakan SELECT
-- publik sudah tidak ada, dan tidak ada satu pun file sql/16-42 yang
-- mencabutnya — artinya seseorang menutupnya langsung di dashboard Supabase,
-- di luar jalur migrasi tercatat. Baik: anon sudah dapat nol baris sekarang
-- (RLS enabled + hanya kebijakan FOR ALL yang mensyaratkan
-- authenticated+email admin = default deny untuk role lain). Tapi itu
-- proteksi IMPLISIT — hidup karena tidak ada kebijakan permisif untuk anon,
-- bukan karena ada kebijakan eksplisit yang menyatakannya. File ini membuatnya
-- eksplisit: satu kebijakan SELECT bernama untuk admin, tulis lewat browser
-- ditutup total. DROP POLICY IF EXISTS dipakai untuk kebijakan lama supaya
-- migrasi ini idempoten di lingkungan mana pun (staging yang mungkin belum
-- ikut ditutup manual, atau replay penuh dari sql/01).
--
-- Idempotent: COMMENT ON + DROP POLICY IF EXISTS + CREATE POLICY. Aman diulang.
--
-- ⚠️ JALANKAN PRE-CHECK DI BAGIAN BAWAH LEBIH DULU, KHUSUSNYA (3). Grep repo
-- tidak bisa melihat objek di dalam database — kalau ada function/view yang
-- membaca survey_winners, bagian 3 di bawah bisa mematikannya diam-diam.
-- ============================================================


-- ============================================
-- 1. Tanda arsip di skema
-- ============================================
-- Mengikuti presenden sql/09 (scheduled_ads) untuk tabel yang dipensiunkan.
COMMENT ON TABLE public.survey_winners IS
  'ARSIP BEKU (sejak 2026-05-05) — pengundian pindah ke platform pihak ketiga. '
  'Tabel ini TIDAK LAGI DITULIS oleh kode mana pun; isinya berhenti di periode Mei 2026 '
  '(267 baris per 2026-08-04, MAX(selected_at) = 2026-05-05). Satu-satunya pembaca '
  'adalah modal "Arsip Pemenang" di dashboard admin '
  '(src/components/PublishPageManagement.tsx). Jangan jadikan sumber untuk fitur baru — '
  'angka pemenang yang berlaku ada di platform pihak ketiga, dan dashboard ini tidak '
  'pernah tahu tentangnya. UNIQUE(page_id, jakpat_id) sengaja dipertahankan (sql/08). '
  'CATATAN INTEGRITAS: page_id masih REFERENCES survey_pages(id) ON DELETE CASCADE. '
  'Referential action TIDAK tunduk pada RLS, jadi tidak ada policy yang bisa melindungi '
  'baris arsip dari penghapusan survey_pages. Per 2026-08-04 satu-satunya jalur hapus '
  'halaman adalah halaman DRAFT (PageBuilderModal.handleDelete + convertDistributionType), '
  'dan halaman draft tidak pernah punya pemenang — jadi eksposurnya nyata tapi tidak '
  'terjangkau. Kalau suatu saat halaman published bisa dihapus, tinjau ulang FK ini.';

COMMENT ON COLUMN public.survey_winners.e_wallet_number IS
  'Identitas finansial responden. Bersama respondent_name dan reward_amount, inilah alasan '
  'kebijakan SELECT dibuat eksplisit (bukan cuma default-deny implisit) di sql/43 bagian 2.';


-- ============================================
-- 2. Kebijakan baca — jadikan eksplisit, bukan cuma default-deny
-- ============================================
-- Lihat catatan pre-check di atas: kebijakan SELECT publik dari sql/15 sudah
-- tidak ada di produksi (dicabut manual, tidak tercatat). anon dan
-- authenticated non-admin SUDAH dapat nol baris hari ini. Bagian ini tidak
-- "menutup kebocoran yang masih terbuka" — ia mengganti proteksi implisit
-- (aman karena tidak ada kebijakan permisif) dengan kebijakan bernama yang
-- menyatakan niatnya, supaya pembaca masa depan tidak perlu menyimpulkan dari
-- ketiadaan baris di pg_policies.
--
-- Dibuat DULU, baru yang lama (kalau ada, di lingkungan yang belum ditutup
-- manual) dicabut — supaya tidak pernah ada jeda tanpa akses baca admin.
DROP POLICY IF EXISTS "Admin reads survey_winners archive" ON public.survey_winners;
CREATE POLICY "Admin reads survey_winners archive"
  ON public.survey_winners FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'email') = 'product@jakpat.net');

DROP POLICY IF EXISTS "Allow public read survey_winners" ON public.survey_winners;


-- ============================================
-- 3. Tutup tulis dari browser
-- ============================================
-- Arsip yang masih bisa ditulis dari browser bukan arsip.
--
-- sql/15 meninggalkan policy FOR ALL untuk product@jakpat.net. FOR ALL mencakup
-- INSERT/UPDATE/DELETE *dan* SELECT — karena itu bagian 2 di atas membuat policy
-- SELECT eksplisit lebih dulu, supaya mencabut yang ini tidak ikut mencabut baca.
--
-- Tidak ada kode yang menulis tabel ini sejak 2026-05-05 (MAX(selected_at) di
-- pre-check membuktikannya), jadi pencabutan ini tidak mematikan jalur mana
-- pun yang hidup. Mengikuti sql/41 yang juga tidak memberi policy tulis sama
-- sekali pada tabel read-model-nya.
--
-- Yang SENGAJA tidak ikut tertutup: SQL Editor Supabase (role postgres) dan
-- service_role tetap bisa menulis — keduanya melewati RLS. Koreksi manual atas
-- baris arsip masih mungkin lewat jalur yang memang seharusnya dipakai untuk itu.
-- Yang hilang hanya kemampuan menulis lewat anon/authenticated key di browser,
-- yaitu persis jalur yang tidak boleh dipakai lagi.
DROP POLICY IF EXISTS "Allow product admin to modify survey_winners" ON public.survey_winners;

-- Catatan untuk pembaca masa depan: functions/api/respondents.js dan
-- storage-cleanup.js memakai pola `serviceRoleKey || supabaseAnonKey`. Tidak
-- ada satu pun endpoint yang membaca survey_winners hari ini, tapi kalau kelak
-- ada dan SUPABASE_SERVICE_ROLE_KEY hilang dari env Cloudflare, ia akan jatuh
-- ke anon dan mendapat NOL BARIS — bukan error. Kalau arsip tiba-tiba tampak
-- kosong dari sisi server, periksa env dulu.


-- ============================================
-- PRE-CHECK — jalankan SEBELUM bagian 2 & 3
-- ============================================
-- (1) Konfirmasi tabelnya memang beku. `terakhir` harus <= 2026-05-05.
--     Sudah dijalankan 2026-08-04: total_baris = 267, pertama = 2026-04-03,
--     terakhir = 2026-05-05. Jauh di bawah batas 1000 baris PostgREST, jadi
--     query un-paginated di PublishPageManagement.tsx aman tanpa paginasi.
-- SELECT COUNT(*) AS total_baris,
--        MIN(selected_at) AS pertama,
--        MAX(selected_at) AS terakhir
-- FROM public.survey_winners;
--
-- (2) Policy yang ada sekarang. Simpan hasilnya untuk perbandingan & rollback.
--     Sudah dijalankan 2026-08-04: HANYA "Allow product admin to modify
--     survey_winners" (FOR ALL, roles={public}, qual mensyaratkan
--     authenticated+email admin). Kebijakan SELECT publik dari sql/15 TIDAK
--     ADA — lihat catatan di header file ini.
-- SELECT policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'survey_winners'
-- ORDER BY cmd, policyname;
--
-- (3) ⚠️ YANG PALING PENTING. Grep repo tidak bisa melihat objek di dalam
--     database. Kedua query ini HARUS mengembalikan nol baris; kalau ada
--     function atau view yang membaca survey_winners, ia mungkin SECURITY
--     INVOKER dan akan ikut mati saat bagian 3 mencabut policy tulis (kalau ia
--     menulis) atau tetap aman kalau ia hanya baca (kebijakan SELECT admin
--     di bagian 2 tidak dicabut, hanya diganti nama).
--     Sudah dijalankan 2026-08-04: KEDUANYA nol baris.
-- SELECT n.nspname, p.proname
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname NOT IN ('pg_catalog','information_schema')
--   AND p.prosrc ILIKE '%survey_winners%';
--
-- SELECT schemaname, viewname FROM pg_views
-- WHERE schemaname = 'public' AND definition ILIKE '%survey_winners%';
--
-- (4) Pembaca di luar repo (Metabase, Retool, Apps Script, spreadsheet, siapa pun
--     yang pernah diberi anon key). Ini TIDAK bisa dijawab dengan SQL — buka
--     Supabase Dashboard → Logs → API, rentang 30 hari, filter path
--     '/rest/v1/survey_winners'. Yang wajar: hanya request yang membawa
--     Authorization Bearer JWT product@jakpat.net. Kalau ada request dengan
--     apikey anon TANPA JWT yang balik 200, itu jejak kebijakan publik lama
--     sebelum ditutup manual — informasional, tidak lagi relevan untuk
--     memutuskan apakah migrasi ini aman dijalankan, tapi tetap layak diketahui.


-- ============================================
-- VERIFIKASI — jalankan SESUDAH menerapkan
-- ============================================
-- (1) Inventaris policy. Harus tersisa TEPAT SATU baris: SELECT, {authenticated},
--     qual berisi product@jakpat.net. Tidak ada policy untuk anon, tidak ada
--     policy untuk INSERT/UPDATE/DELETE/ALL.
-- SELECT policyname, cmd, roles, qual FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'survey_winners' ORDER BY cmd;
--
-- (2) anon benar-benar buta. SQL Editor jalan sebagai `postgres` dan MELEWATI
--     RLS, jadi SELECT biasa di sini membuktikan NOL, bukan aman. Pakai SET
--     LOCAL ROLE:
-- BEGIN;
--   SET LOCAL ROLE anon;
--   SELECT COUNT(*) AS harus_nol FROM public.survey_winners;
-- ROLLBACK;
--
-- (3) Admin masih bisa membaca:
-- BEGIN;
--   SELECT set_config('request.jwt.claims',
--     '{"role":"authenticated","email":"product@jakpat.net"}', true);
--   SET LOCAL ROLE authenticated;
--   SELECT COUNT(*) AS harus_sama_dengan_precheck_1 FROM public.survey_winners;
-- ROLLBACK;
--
-- (4) User login BIASA (bukan admin) tidak bisa membaca:
-- BEGIN;
--   SELECT set_config('request.jwt.claims',
--     '{"role":"authenticated","email":"mahasiswa@contoh.ac.id"}', true);
--   SET LOCAL ROLE authenticated;
--   SELECT COUNT(*) AS harus_nol FROM public.survey_winners;
-- ROLLBACK;
--
-- (5) Tulis dari admin lewat RLS ditolak. INSERT harus GAGAL dengan
--     SQLSTATE 42501 "new row violates row-level security policy".
--     (UPDATE/DELETE tidak melempar error — ia hanya mengenai nol baris,
--      karena tanpa policy tidak ada baris yang terlihat untuk diubah.)
-- BEGIN;
--   SELECT set_config('request.jwt.claims',
--     '{"role":"authenticated","email":"product@jakpat.net"}', true);
--   SET LOCAL ROLE authenticated;
--   INSERT INTO public.survey_winners (page_id, jakpat_id) VALUES (NULL, 'TEST-8C');
-- ROLLBACK;
--
-- (6) Tidak ada baris yang hilang. Harus identik dengan PRE-CHECK (1) = 267.
-- SELECT COUNT(*) FROM public.survey_winners;
--
-- (7) Komentarnya menempel:
-- SELECT obj_description('public.survey_winners'::regclass, 'pg_class');


-- ============================================
-- ROLLBACK
-- ============================================
-- Mengembalikan persis keadaan sql/15. Tidak ada data yang perlu dipulihkan —
-- file ini tidak pernah menyentuh baris.
--
-- DROP POLICY IF EXISTS "Admin reads survey_winners archive" ON public.survey_winners;
--
-- CREATE POLICY "Allow public read survey_winners"
--   ON public.survey_winners FOR SELECT USING (true);
--
-- CREATE POLICY "Allow product admin to modify survey_winners"
--   ON public.survey_winners FOR ALL
--   USING (auth.role() = 'authenticated' AND auth.jwt() ->> 'email' = 'product@jakpat.net')
--   WITH CHECK (auth.role() = 'authenticated' AND auth.jwt() ->> 'email' = 'product@jakpat.net');
--
-- COMMENT ON TABLE public.survey_winners IS NULL;
-- COMMENT ON COLUMN public.survey_winners.e_wallet_number IS NULL;
