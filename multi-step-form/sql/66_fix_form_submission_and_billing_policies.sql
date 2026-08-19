-- 66_fix_form_submission_and_billing_policies.sql
--
-- Dua perbaikan izin yang HARUS berpasangan. Diukur di produksi 2026-08-19.
--
-- ============================================================================
-- BAGIAN 1 — form_submissions terbuka untuk setiap akun yang login
-- ============================================================================
--
-- Policy permissive di Postgres di-OR-kan. Satu policy longgar mengalahkan
-- semua yang ketat. Produksi memegang tiga policy `true` yang TIDAK ADA di
-- repo ini — dibuat di luar berkas migrasi, jadi `sql/` tidak pernah
-- menggambarkan RLS produksi yang sebenarnya:
--
--   SELECT "User View Own Submissions"   USING (true)        <- namanya bohong
--   INSERT "User Insert Own Submissions" WITH CHECK (true)
--   INSERT "Users Can Insert Submissions" WITH CHECK (true)
--
-- Akibat SELECT: setiap akun yang login membaca SELURUH baris order — nama,
-- email, telepon, universitas, admin_notes, total_cost. `sql/47` hanya menutup
-- `anon`, dan kepalanya menyatakan authenticated "sudah dibatasi ke barisnya
-- sendiri". Premis itu salah sejak awal.
--
-- Akibat INSERT: `sql/11c_tighten_insert_policy.sql` ditulis persis untuk
-- menutup ini, tapi kedua policy longgarnya tidak pernah di-DROP — jadi
-- pengetatannya TIDAK PERNAH BERLAKU. Akun mana pun bisa menyisipkan order
-- atas nama `auth_user_id` orang lain.
--
-- Yang ketat sudah berdiri dan tetap dipakai (tidak disentuh berkas ini):
--   SELECT "Users can view own submissions"
--     USING (auth_user_id = auth.uid()
--            OR (auth_user_id IS NULL AND email = auth.jwt()->>'email'))
--   SELECT "Admin View All Submissions"    (product@jakpat.net)
--   INSERT "Users can insert submissions"  WITH CHECK (auth_user_id = auth.uid())
--   SELECT "Allow anon read published survey submissions"  (anon, kolomnya
--          sudah dipersempit sql/47 — tidak ikut berubah)
--
-- DIUKUR — mencabut `USING (true)` tidak menghilangkan akses siapa pun.
-- Dari 1006 order: 695 punya `auth_user_id` (terlihat lewat policy ketat),
-- 12 tanpa `auth_user_id` tapi emailnya punya akun (tertangkap cabang
-- fallback), dan 299 tanpa `auth_user_id` yang emailnya TIDAK punya akun sama
-- sekali — tak seorang pun bisa login sebagai mereka. Nol baris yatim.
--
-- Prasyarat yang membuat ini murah SEKARANG: `sql/63` sudah memindahkan kedua
-- kaki `fetchSlotAvailability` ke RPC SECURITY DEFINER
-- (`get_submission_slot_occupancy`, `get_extend_slot_occupancy`), jadi kuota
-- slot tidak lagi bergantung pada pembacaan mentah `USING (true)`.
--
-- ============================================================================
-- BAGIAN 2 — peneliti yang email order-nya beda dari email akun tidak bisa
--            melihat tagihannya
-- ============================================================================
--
-- `invoices` (sql/24) dan `transactions` mengunci kepemilikan pada EMAIL,
-- sementara `form_submissions` sudah pindah ke `auth_user_id` sejak `sql/11`.
-- Order yang `auth_user_id`-nya cocok tapi emailnya beda (memesan dengan email
-- kampus lalu login dengan email lain, atau mengganti email akun) TERLIHAT di
-- dashboard tapi tagihannya kosong.
--
-- Terukur: 16 order seperti itu, 9 punya invoice, 2 di antaranya belum lunas
-- dengan tagihan `pending` — dua peneliti yang hari ini tidak punya tombol
-- bayar sama sekali (c1d195a5, 91bd5fb2).
--
-- Arahnya dua-duanya benar. Selain melebar untuk pemilik sah, ia juga
-- MENYEMPIT: 8 order punya email yang dimiliki akun LAIN, dan akun itu selama
-- ini bisa membaca tagihan order yang bukan miliknya. Setelah Bagian 1 ia tidak
-- lagi bisa membaca ordernya — tanpa Bagian 2 ia masih bisa membaca uangnya.
--
-- ⚠️ KENAPA HARUS SATU TRANSAKSI. Sub-query di dalam policy tetap tunduk RLS
-- `form_submissions`. Menerapkan Bagian 1 sendirian mempersempit apa yang bisa
-- dilihat `EXISTS`-nya, jadi jendela di antara keduanya = peneliti kehilangan
-- tagihan. Terapkan bersama, atau tidak sama sekali.
--
-- Task 13 menjadikan `schedule_billing_bulk()` jalur utama dashboard peneliti
-- dan fungsi itu SECURITY INVOKER — ia mewarisi lubang ini bulat-bulat.
-- ============================================================================

BEGIN;

-- ── Bagian 1 ────────────────────────────────────────────────────────────────
-- Nol policy baru dibuat. Hanya mencabut yang longgar.
DROP POLICY IF EXISTS "User View Own Submissions"   ON public.form_submissions;
DROP POLICY IF EXISTS "User Insert Own Submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Users Can Insert Submissions" ON public.form_submissions;

-- ── Bagian 2 ────────────────────────────────────────────────────────────────
-- Bentuknya SENGAJA identik dengan "Users can view own submissions". Kalau
-- kepemilikan `form_submissions` berubah lagi, ketiganya berubah bersama.

DROP POLICY IF EXISTS "Users Select Invoices" ON public.invoices;
CREATE POLICY "Users Select Invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'product@jakpat.net'
    OR EXISTS (
      SELECT 1 FROM public.form_submissions fs
      WHERE fs.id = invoices.form_submission_id
        AND (
          fs.auth_user_id = auth.uid()
          OR (fs.auth_user_id IS NULL AND fs.email = (auth.jwt() ->> 'email'))
        )
    )
  );

DROP POLICY IF EXISTS "Users Select Transactions" ON public.transactions;
CREATE POLICY "Users Select Transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'product@jakpat.net'
    OR EXISTS (
      SELECT 1 FROM public.form_submissions fs
      WHERE fs.id = transactions.form_submission_id
        AND (
          fs.auth_user_id = auth.uid()
          OR (fs.auth_user_id IS NULL AND fs.email = (auth.jwt() ->> 'email'))
        )
    )
  );

COMMIT;

-- ── CATATAN: "Users Insert Transactions" sengaja TIDAK disentuh ─────────────
--
-- Policy itu masih berbasis email, tapi peneliti tidak pernah menyisipkan
-- `transactions` dari klien — `create-payment.js` menulisnya lewat
-- service_role, dan `InvoiceForm` (admin) lewat "Admin Insert Transactions".
-- Mengubahnya hanya bisa MELEBARKAN izin tulis di jalur uang tanpa satu pun
-- pemanggil yang membutuhkannya. Dibiarkan sempit dengan sengaja.

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
-- Harus memulangkan 4 baris dan TIDAK ADA satu pun berisi qual/with_check 'true':
--
--   SELECT policyname, cmd, qual, with_check
--     FROM pg_policies
--    WHERE schemaname='public' AND tablename='form_submissions'
--      AND 'authenticated' = ANY (roles)
--    ORDER BY cmd, policyname;
--
-- Lalu login sebagai peneliti biasa (BUKAN product@jakpat.net):
--   - `select count(*) from form_submissions` = jumlah ordernya sendiri saja
--   - order c1d195a5 / 91bd5fb2 sekarang menampilkan tagihan `pending`-nya
--   - kalender ketersediaan slot masih menunjukkan tanggal penuh — ini yang
--     membuktikan kedua RPC SECURITY DEFINER bekerja. Kalau gagal, ia gagal
--     SUNYI: angkanya salah, tanpa error.

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Kalau ada yang patah, ini mengembalikan keadaan persis seperti sebelum
-- berkas ini dijalankan (termasuk lubangnya — jangan tinggalkan lama).
--
-- BEGIN;
--
-- CREATE POLICY "User View Own Submissions" ON public.form_submissions
--   FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "User Insert Own Submissions" ON public.form_submissions
--   FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY "Users Can Insert Submissions" ON public.form_submissions
--   FOR INSERT TO authenticated WITH CHECK (true);
--
-- DROP POLICY IF EXISTS "Users Select Invoices" ON public.invoices;
-- CREATE POLICY "Users Select Invoices" ON public.invoices
--   FOR SELECT TO authenticated
--   USING (
--     (auth.jwt() ->> 'email') = 'product@jakpat.net'
--     OR EXISTS (SELECT 1 FROM public.form_submissions
--                 WHERE form_submissions.id = invoices.form_submission_id
--                   AND form_submissions.email = (auth.jwt() ->> 'email'))
--   );
--
-- DROP POLICY IF EXISTS "Users Select Transactions" ON public.transactions;
-- CREATE POLICY "Users Select Transactions" ON public.transactions
--   FOR SELECT TO authenticated
--   USING (
--     (auth.jwt() ->> 'email') = 'product@jakpat.net'
--     OR EXISTS (SELECT 1 FROM public.form_submissions
--                 WHERE form_submissions.id = transactions.form_submission_id
--                   AND form_submissions.email = (auth.jwt() ->> 'email'))
--   );
--
-- COMMIT;
