-- 47_restrict_anon_form_submissions.sql
--
-- Problem: role `anon` bisa membaca DATA PRIBADI pemesan.
--
-- Dua hal bertemu:
--   1. Policy "Allow anon read published survey submissions" memberi anon akses
--      BARIS untuk setiap order yang punya survey_pages.is_published = true.
--      Cakupan baris ini memang disengaja — halaman iklan publik perlu
--      menampilkan hadiah tiap survei.
--   2. Tapi anon memegang GRANT SELECT di SELURUH kolom form_submissions,
--      termasuk email, phone_number, full_name, admin_notes, university,
--      total_cost, voucher_code, auth_user_id.
--
-- RLS bersifat row-level, bukan column-level — jadi policy di (1) tidak pernah
-- membatasi kolom. Terukur 2026-08-09 di produksi: 277 order terekspos, SEMUA
-- punya email dan nomor HP, 32 di antaranya membawa admin_notes internal.
-- Anon key dikirim di bundle frontend publik, jadi ini bisa ditarik siapa saja
-- lewat satu request PostgREST.
--
-- Design: JANGAN sentuh policy RLS-nya (cakupan barisnya sudah benar dan
-- halaman publik bergantung padanya). Cukup persempit GRANT ke tingkat KOLOM,
-- yaitu lapisan yang memang mengatur "kolom mana yang boleh dibaca".
--
-- Kolom yang benar-benar dipakai konsumen anon (sudah ditelusuri seluruhnya):
--   survey_url, start_date, end_date, prize_per_winner, winner_count,
--   criteria_responden
--     ← src/pages/public/SurveyPage.tsx:187  (halaman iklan /pages/:slug)
--   prize_per_winner, winner_count
--     ← src/pages/public/SurveyListingPage.tsx:45  (browser, anon key)
--     ← functions/api/surveys.js:153               (anon key)
--   criteria_responden
--     ← functions/api/respondents.js  (utamanya pakai service_role; anon hanya
--       jalur cadangan bila SUPABASE_SERVICE_ROLE_KEY tidak diset)
--   id
--     ← dibutuhkan PostgREST untuk menyelesaikan embed
--       `form_submissions!submission_id(...)` dari survey_pages.
--
-- Tidak ada satu pun kolom di atas yang bersifat pribadi: survey_url memang
-- dibuka responden, tanggal tayang memang ditampilkan di halaman iklan.
--
-- Dua Pages Function dulu memakai `select('*')` dengan anon key dan akan ERROR
-- setelah migrasi ini (bukan sekadar kosong). Keduanya SUDAH DIHAPUS bersama
-- migrasi ini, jadi tidak ada lagi yang perlu disesuaikan:
--   functions/api/form-data.js     — tanpa pemanggil, dan endpoint ini sendiri
--                                    membocorkan satu baris penuh per ID
--                                    (jalur bocor kedua di samping yang di atas)
--   functions/api/send-to-sheets.js — sinkronisasi Google Sheets sudah tidak
--                                    dipakai lagi (keputusan pemilik produk
--                                    2026-08-09). Ikut terhapus: mock-sheets.js
--                                    dan src/utils/sheets-service.ts.
--
-- Grant `authenticated` TIDAK diubah: policy "User View Own Submissions"
-- (11_add_auth_user_id.sql) sudah membatasi user ke barisnya sendiri, dan
-- dashboard memang perlu seluruh kolom order miliknya.
--
-- Jalankan di Supabase SQL Editor. Verifikasi + rollback ada di bawah.

-- ============================================================================
-- 1. Persempit grant anon ke tingkat kolom
-- ============================================================================

-- Cabut grant tabel-lebar lebih dulu; tanpa ini, grant kolom di bawah hanya
-- menumpuk dan tidak mempersempit apa pun.
revoke select on table public.form_submissions from anon;

grant select (
  id,
  survey_url,
  start_date,
  end_date,
  prize_per_winner,
  winner_count,
  criteria_responden
) on table public.form_submissions to anon;

-- ============================================================================
-- 2. Verifikasi
-- ============================================================================

-- 2a. anon HARUS tinggal 7 kolom; authenticated tetap utuh (34 kolom).
--
-- select grantee, count(*) as kolom, string_agg(column_name, ', ' order by column_name) as daftar
-- from information_schema.column_privileges
-- where table_name = 'form_submissions'
--   and grantee in ('anon', 'authenticated')
--   and privilege_type = 'SELECT'
-- group by grantee;
--
-- Harapan:
--   anon          | 7  | criteria_responden, end_date, id, prize_per_winner,
--                        start_date, survey_url, winner_count
--   authenticated | 34 | admin_notes, auth_user_id, ...

-- 2b. Uji nyata dari luar (ganti $URL dan $ANON dengan nilai proyek):
--
--   # HARUS gagal / kosong setelah migrasi ini:
--   curl "$URL/rest/v1/form_submissions?select=email,phone_number&limit=5" \
--        -H "apikey: $ANON"
--
--   # HARUS tetap berhasil (dipakai halaman iklan publik):
--   curl "$URL/rest/v1/survey_pages?select=slug,form_submissions!submission_id(prize_per_winner,winner_count)&is_published=eq.true&limit=3" \
--        -H "apikey: $ANON"

-- 2c. Regresi aplikasi yang wajib dicek setelah dijalankan:
--   - /pages          (SurveyListingPage) — hadiah tiap kartu masih tampil
--   - /pages/:slug    (SurveyPage)
--   - /api/surveys    dan /api/respondents
--   - dashboard user login — seluruh detail ordernya masih terbaca

-- ============================================================================
-- 3. Rollback
-- ============================================================================
--
-- Mengembalikan keadaan sebelum migrasi (anon membaca semua kolom lagi —
-- HANYA untuk keadaan darurat bila ada konsumen anon yang terlewat):
--
--   grant select on table public.form_submissions to anon;
--
-- Kalau ternyata cuma kurang satu kolom, JANGAN rollback penuh; tambahkan
-- kolom itu saja, mis.:
--
--   grant select (question_count) on table public.form_submissions to anon;
