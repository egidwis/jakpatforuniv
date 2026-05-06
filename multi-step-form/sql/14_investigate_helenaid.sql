-- ============================================================
-- Investigasi HelenaID: Timeline fraud activity
-- ============================================================

-- QUERY 1: Timeline aktivitas HelenaID per page (kapan mulai, kapan terakhir)
SELECT 
  pr.page_id,
  sp.submission_id,
  COUNT(*) AS total_submissions,
  MIN(pr.created_at) AS first_submit,
  MAX(pr.created_at) AS last_submit,
  MAX(pr.created_at) - MIN(pr.created_at) AS duration
FROM page_respondents pr
LEFT JOIN survey_pages sp ON sp.id = pr.page_id
WHERE pr.jakpat_id = 'HelenaID'
GROUP BY pr.page_id, sp.submission_id
ORDER BY MAX(pr.created_at) DESC;

-- QUERY 2: Cek apakah HelenaID masih submit di page terbaru (30 hari terakhir)
SELECT 
  pr.page_id,
  pr.created_at,
  pr.proof_url,
  pr.ewallet_provider
FROM page_respondents pr
WHERE pr.jakpat_id = 'HelenaID'
  AND pr.created_at >= NOW() - INTERVAL '30 days'
ORDER BY pr.created_at DESC
LIMIT 20;

-- QUERY 3: Bandingkan — kapan terakhir kali HelenaID melakukan duplikat?
SELECT 
  MAX(created_at) AS last_duplicate_activity
FROM page_respondents
WHERE jakpat_id = 'HelenaID'
  AND (page_id, jakpat_id) IN (
    SELECT page_id, jakpat_id 
    FROM page_respondents 
    WHERE jakpat_id = 'HelenaID'
    GROUP BY page_id, jakpat_id 
    HAVING COUNT(*) > 1
  );
