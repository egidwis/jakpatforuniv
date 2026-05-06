-- ============================================================
-- PENGAMANAN TABEL: respondents-masterdata
-- Tujuan: HANYA user dengan email 'product@jakpat.net' yang bisa mengakses
--         (SELECT, INSERT, UPDATE, DELETE) tabel ini.
-- ============================================================

-- 1. Hapus policy lama yang membuka akses READ (SELECT) untuk public
DROP POLICY IF EXISTS "Allow read respondents-masterdata" ON "respondents-masterdata";

-- 2. Buat policy baru yang membatasi SEMUA akses (ALL) hanya untuk admin
--    dengan email product@jakpat.net
CREATE POLICY "Allow product admin full access to respondents-masterdata"
ON "respondents-masterdata"
FOR ALL 
USING (
  auth.role() = 'authenticated' AND 
  auth.jwt() ->> 'email' = 'product@jakpat.net'
)
WITH CHECK (
  auth.role() = 'authenticated' AND 
  auth.jwt() ->> 'email' = 'product@jakpat.net'
);
