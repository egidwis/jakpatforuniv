-- ============================================================
-- STEP 1: CHECK - Lihat dulu berapa banyak duplicate yang ada
-- ============================================================
SELECT jakpat_id, COUNT(*) as total_rows
FROM "respondents-masterdata"
GROUP BY jakpat_id
HAVING COUNT(*) > 1
ORDER BY total_rows DESC
LIMIT 20;

-- ============================================================
-- STEP 2: PREVIEW - Lihat row mana yang akan di-DELETE (dry run)
-- ============================================================
SELECT jakpat_id, ktp_number, display_name, email, rn
FROM (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY jakpat_id
           ORDER BY 
             -- Prioritas 1: Row yang punya ktp_number di-keep (rank atas)
             CASE WHEN ktp_number IS NOT NULL AND ktp_number != '' THEN 0 ELSE 1 END,
             -- Prioritas 2: Row yang lebih awal (urutan atas) di-keep
             ctid ASC
         ) AS rn
  FROM "respondents-masterdata"
) ranked
WHERE rn > 1
ORDER BY jakpat_id
LIMIT 50;

-- ============================================================
-- STEP 3: DELETE - Jalankan ini setelah preview di atas OK
-- ============================================================
-- DELETE FROM "respondents-masterdata"
-- WHERE ctid IN (
--   SELECT ctid
--   FROM (
--     SELECT ctid,
--            ROW_NUMBER() OVER (
--              PARTITION BY jakpat_id
--              ORDER BY 
--                CASE WHEN ktp_number IS NOT NULL AND ktp_number != '' THEN 0 ELSE 1 END,
--                ctid ASC
--            ) AS rn
--     FROM "respondents-masterdata"
--   ) ranked
--   WHERE rn > 1
-- );
