-- ============================================================
-- PENGAMANAN TABEL: survey_winners
-- Tujuan: Hanya user dengan email 'product@jakpat.net' yang bisa melakukan
--         perubahan (INSERT, UPDATE, DELETE).
-- ============================================================

-- 1. Hapus policy lama yang membuka akses secara bebas
DROP POLICY IF EXISTS "Admin full access to survey_winners" ON survey_winners;

-- 2. Buat policy baru untuk READ (SELECT) 
-- Asumsi: Semua orang (termasuk anon) boleh melihat daftar pemenang 
-- Jika hanya admin yang boleh melihat, ubah `true` menjadi `auth.role() = 'authenticated'`
CREATE POLICY "Allow public read survey_winners" 
ON survey_winners
FOR SELECT
USING (true);

-- 3. Buat policy baru untuk WRITE (INSERT, UPDATE, DELETE)
-- Hanya user yang login (authenticated) DAN memiliki email product@jakpat.net
CREATE POLICY "Allow product admin to modify survey_winners"
ON survey_winners
FOR ALL 
USING (
  auth.role() = 'authenticated' AND 
  auth.jwt() ->> 'email' = 'product@jakpat.net'
)
WITH CHECK (
  auth.role() = 'authenticated' AND 
  auth.jwt() ->> 'email' = 'product@jakpat.net'
);
