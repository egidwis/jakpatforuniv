-- ─────────────────────────────────────────────────────────────────────────────
-- 96_anon_boleh_baca_distribution_type.sql
--
-- 🔴 PERBAIKAN INSIDEN — /api/surveys DAN /pages MATI TOTAL SEJAK PHASE 5.
--
-- GEJALA
--   /api/surveys tidak memuat satu pun iklan; /pages kosong bagi pengunjung
--   yang tidak login. Keduanya gagal dengan:
--       "permission denied for table form_submissions"
--
-- SEBAB
--   Phase 5 (commit e5b73bc) menambahkan `distribution_type` ke select join
--   supaya halaman Kilat bisa disaring dari dua listing publik:
--
--       .select('*, form_submissions!submission_id(
--                   prize_per_winner, winner_count, distribution_type)')
--
--   Peran `anon` memegang hibah SELECT per-KOLOM di `form_submissions` —
--   bukan hibah tabel penuh. Sebelum Phase 5 join itu hanya meminta
--   `prize_per_winner` + `winner_count`, keduanya termasuk yang dihibahkan.
--   `distribution_type` TIDAK. PostgREST menolak seluruh kueri, bukan hanya
--   kolomnya, dan `surveys.js` melakukan `if (error) throw error` → 500.
--
--   Kolom yang boleh dibaca `anon` sebelum berkas ini (7 kolom):
--       criteria_responden, end_date, id, prize_per_winner,
--       start_date, survey_url, winner_count
--
--   Perhatikan bentuknya: sempit dan disengaja. Tidak ada email, telepon,
--   nama, universitas, maupun angka biaya. Itu batas PII, dan berkas ini
--   TIDAK melebarkannya selain satu kolom di bawah.
--
-- KENAPA HIBAH, BUKAN UBAH KODE
--   Alternatifnya membuang join lalu menyaring Kilat dengan cara lain, tapi
--   setiap cara lain butuh tahu tipe distribusi — jadi ia hanya memindahkan
--   masalah yang sama ke tempat yang lebih berbelit. `distribution_type`
--   sendiri BUKAN PII: nilainya cuma 'regular' atau 'kilat', dan ia sudah
--   tersirat di layar publik (iklan reguler tampil di /pages, Kilat tidak).
--
--   Yang dilindungi Phase 5 adalah TAUTAN halaman Kilat dari mata peneliti,
--   dan penjaganya ada di `getSurveyPagesBySubmissionIds` (supabase.ts) —
--   bukan di hibah kolom ini. Menghibahkan satu kolom enum tidak membuka
--   satu pun tautan Kilat.
--
-- ⚠️ JANGAN ganti berkas ini dengan `GRANT SELECT ON form_submissions TO anon`.
--    Itu membuka 40+ kolom termasuk email, telepon, dan seluruh angka uang.
--    Hibah per-kolom adalah bentuk yang benar di tabel ini.
-- ─────────────────────────────────────────────────────────────────────────────


-- ══════════════════════════════════════════════════════════════════════
-- DRY RUN — jalankan blok ini DULU. Tidak mengubah apa pun.
-- ══════════════════════════════════════════════════════════════════════

-- 1. Kolom apa saja yang kini boleh dibaca `anon`? (harap 7 kolom, tanpa
--    distribution_type — kalau distribution_type SUDAH ada, berkas ini
--    sudah pernah dijalankan dan tidak perlu diulang)
SELECT grantee,
       count(*)                                        AS jumlah_kolom,
       string_agg(column_name, ', ' ORDER BY column_name) AS kolom
FROM information_schema.column_privileges
WHERE table_name = 'form_submissions'
  AND privilege_type = 'SELECT'
  AND grantee = 'anon'
GROUP BY grantee;

-- 2. Pastikan `anon` TIDAK memegang hibah SELECT tingkat TABEL.
--    Harap NOL baris. Bila ada baris, hibah per-kolom jadi tidak relevan
--    dan situasinya jauh lebih serius daripada bug ini — hentikan dan
--    periksa, karena artinya seluruh kolom PII sudah terbuka.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'form_submissions'
  AND grantee = 'anon'
  AND privilege_type = 'SELECT';


-- ══════════════════════════════════════════════════════════════════════
-- PERBAIKAN — satu kolom, satu peran.
-- ══════════════════════════════════════════════════════════════════════

GRANT SELECT (distribution_type) ON public.form_submissions TO anon;


-- ══════════════════════════════════════════════════════════════════════
-- VERIFIKASI — jalankan SESUDAH blok di atas.
-- ══════════════════════════════════════════════════════════════════════

-- 1. Kini harus 8 kolom, dan distribution_type termasuk di dalamnya.
SELECT count(*) AS jumlah_kolom,
       bool_or(column_name = 'distribution_type') AS distribution_type_ada
FROM information_schema.column_privileges
WHERE table_name = 'form_submissions'
  AND privilege_type = 'SELECT'
  AND grantee = 'anon';

-- 2. Batas PII harus TETAP tertutup. Semua kolom di bawah harap NOL baris —
--    bila salah satu muncul, hibahnya kebablasan dan wajib dicabut.
SELECT column_name
FROM information_schema.column_privileges
WHERE table_name = 'form_submissions'
  AND privilege_type = 'SELECT'
  AND grantee = 'anon'
  AND column_name IN ('email','phone_number','full_name','university',
                      'total_cost','subtotal','ppn_amount','admin_notes',
                      'auth_user_id','voucher_code','review_history');


-- ══════════════════════════════════════════════════════════════════════
-- ROLLBACK
--
-- ⚠️ Mencabutnya MENGEMBALIKAN insiden: /api/surveys dan /pages akan mati
--    lagi selama kode masih meminta `distribution_type` di join. Cabut HANYA
--    bila kedua berkas berikut sudah lebih dulu diubah agar berhenti
--    memintanya:
--       - multi-step-form/functions/api/surveys.js
--       - multi-step-form/src/pages/public/SurveyListingPage.tsx
-- ══════════════════════════════════════════════════════════════════════

-- REVOKE SELECT (distribution_type) ON public.form_submissions FROM anon;
