-- ============================================================
-- Migration 44: satu implementasi agregasi batch, bukan dua
-- Tanggal: 2026-08-04  (Phase 2 / Task 8B-1)
--
-- MASALAHNYA
-- ----------
-- Agregasi "berapa hadiah batch ini, dan apakah batch ini sudah boleh diundi"
-- ditulis DUA KALI untuk melayani pihak ketiga yang sama:
--
--   * SQL  get_batch_rewards()      -> /api/respondents Mode 2 (detail satu survei)
--   * JS   buildBatches()           -> /api/respondents Mode 1 (daftar semua survei)
--                                      (functions/api/respondents.js:111)
--
-- Keduanya sudah menyimpang, dan simpangannya bukan teori:
--
--   1. AKHIR TAYANG. sql/39 mengangkat DATE milik form_submissions ke 15:00 WIB
--      lewat airing_instant_of_date(); sisi JS masih membaca 'YYYY-MM-DD' mentah,
--      yang jadi 00:00 UTC. Selisihnya 8 jam, dan hidup HANYA antara 00:00-08:00
--      UTC (07:00-15:00 WIB). Diukur 2026-08-04 pukul 14:17 UTC hasilnya nol --
--      NOL PALSU. Disimulasikan pukul 10:00 WIB, dua survei yang tayang hari itu
--      langsung berbeda: SQL bilang belum boleh diundi, JS bilang sudah boleh,
--      delapan jam sebelum iklannya berhenti mengumpulkan responden. Ini berulang
--      di hari terakhir SETIAP survei yang tayang; 13 order masih akan melewatinya.
--
--   2. "BATCH MASIH AKTIF?" SQL menanyakannya per baris
--      -- BOOL_OR(status aktif AND baris.end > NOW()) -- sementara JS menanyakannya
--      per batch: (ada status aktif) AND (MAX(end) > NOW()). Untuk batch berisi
--      lebih dari satu jadwal, baris yang sudah tidak aktif tapi berakhir paling
--      belakangan bisa menahan batch tetap "active" di sisi JS. Terukur: 6 batch
--      multi-baris, empat di antaranya punya jendela historis sampai 12 hari.
--
--   3. Sisi JS ikut menghitung parent ber-status 'rejected'/'spam' (sql/37 sudah
--      membuangnya) dan punya fallback ke publish_start/end_date yang tidak ada
--      padanannya di SQL. Nol baris terdampak di produksi hari ini, tapi keduanya
--      tetap sumber simpangan yang menunggu.
--
-- OBATNYA: hapus implementasi keduanya, bukan tambal salah satunya.
--
-- Yang dibuat di sini adalah versi massal dari get_batch_rewards -- LOGIKANYA
-- PERSIS SAMA, hanya menerima banyak submission sekaligus dan mengembalikan
-- submission_id supaya pemanggil bisa mengelompokkan. Mode 1 lalu memanggil
-- fungsi ini dan buildBatches() dihapus. get_batch_rewards() sendiri tinggal jadi
-- pembungkus tipis, jadi setelah file ini ada tepat SATU tempat yang tahu cara
-- menghitung sebuah batch.
--
-- ⚠️ TIDAK ADA perubahan perilaku yang diselundupkan ke sini. Setiap baris logika
-- di bawah disalin apa adanya dari sql/37_batch_pool_context.sql. Kalau logikanya
-- perlu diperbaiki (dan poin 3 di atas memang layak dibahas), itu migrasi lain --
-- supaya kalau nanti ada yang salah, jelas mana penyebabnya: "siapa yang
-- menghitung" atau "bagaimana menghitungnya", tidak dua-duanya sekaligus.
--
-- ⚠️ FILTER BERBASIS PEMBAYARAN TETAP TIDAK BOLEH DITAMBAHKAN pada baris parent.
-- Lihat header sql/37: sebagian order dibayar DI LUAR sistem dan payment_status-nya
-- 'pending' selamanya. Itu masih berlaku di sini.
--
-- KONTRAK: get_batch_rewards mempertahankan nama, argumen, dan daftar kolom
-- kembaliannya persis. Ia dipanggil pihak ketiga lewat /api/respondents Mode 2.
--
-- Idempotent: CREATE OR REPLACE saja. TIDAK ADA perubahan skema dan TIDAK ADA
-- baris data yang tersentuh.
-- BERGANTUNG PADA sql/39 (airing_instant_of_date) dan sql/37 -- terapkan keduanya
-- lebih dulu.
-- JALANKAN PRE-CHECK DI BAWAH SEBELUM MENERAPKAN: ia membuktikan versi massal
-- menjawab identik dengan fungsi yang sedang hidup.
-- ============================================================


-- ============================================
-- 1. get_batch_rewards_bulk — implementasi tunggal
-- ============================================
-- Sama persis dengan get_batch_rewards (sql/37 bagian 1), dengan dua perbedaan
-- dan hanya dua:
--   * WHERE ... = ANY(p_submission_ids)   menggantikan   = p_submission_id
--   * submission_id ikut dikembalikan dan ikut jadi kunci GROUP BY
CREATE OR REPLACE FUNCTION get_batch_rewards_bulk(p_submission_ids UUID[])
RETURNS TABLE (
  submission_id UUID,
  period_batch TEXT,
  prize_per_winner INTEGER,
  winner_count INTEGER,
  batch_status TEXT,
  can_select_winners BOOLEAN,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH all_periods AS (
    -- Jadwal pertama (baris parent)
    SELECT
      fs.id AS sid,
      TO_CHAR(fs.end_date, 'YYYY-MM') AS pb,
      fs.prize_per_winner AS base_p,
      0 AS add_p,
      fs.winner_count AS wc,
      fs.submission_status AS status,
      -- form_submissions menyimpan DATE, extend menyimpan TIMESTAMPTZ. Dibiarkan
      -- apa adanya, UNION di bawah melebarkan DATE ke tengah malam UTC (07:00 WIB),
      -- delapan jam sebelum iklannya benar-benar tayang. airing_instant_of_date()
      -- didefinisikan di sql/39.
      airing_instant_of_date(fs.start_date) AS sd,
      airing_instant_of_date(fs.end_date)   AS ed
    FROM form_submissions fs
    WHERE fs.id = ANY(p_submission_ids)
      -- rejected/spam tidak pernah tayang dan tidak menjanjikan apa pun. Ini
      -- SENGAJA bukan cek pembayaran -- lihat header sql/37.
      AND fs.submission_status NOT IN ('rejected', 'spam')

    UNION ALL

    -- Jadwal berikutnya (hanya yang sudah dibayar)
    SELECT
      e.submission_id AS sid,
      e.period_batch AS pb,
      COALESCE(e.prize_per_winner, 0) AS base_p,
      COALESCE(e.additional_prize_per_winner, 0) AS add_p,
      COALESCE(e.winner_count, 0) AS wc,
      e.submission_status AS status,
      e.start_date AS sd,
      e.end_date AS ed
    FROM form_submissions_extend e
    WHERE e.submission_id = ANY(p_submission_ids)
      AND e.payment_status = 'paid'
  ),
  batch_agg AS (
    SELECT
      ap.sid,
      ap.pb,
      MAX(CASE WHEN ap.base_p > 0 THEN ap.base_p ELSE 0 END) AS base_prize,
      SUM(ap.add_p) AS total_additional,
      MAX(CASE WHEN ap.wc > 0 THEN ap.wc ELSE 0 END) AS wc,
      BOOL_OR(
        ap.status IN ('live', 'scheduled', 'paid', 'waiting_payment')
        AND (ap.ed IS NULL OR ap.ed > NOW())
      ) AS has_active,
      MIN(ap.sd) AS start_d,
      MAX(ap.ed) AS end_d
    FROM all_periods ap
    GROUP BY ap.sid, ap.pb
  )
  SELECT
    ba.sid,
    ba.pb,
    (ba.base_prize + ba.total_additional)::INTEGER,
    ba.wc::INTEGER,
    CASE WHEN ba.has_active THEN 'active'::TEXT ELSE 'closed'::TEXT END,
    NOT ba.has_active,
    ba.start_d,
    ba.end_d
  FROM batch_agg ba
  ORDER BY ba.sid, ba.pb;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 2. get_batch_rewards — kini pembungkus tipis
-- ============================================
-- Nama, argumen, dan daftar kolom kembalian TIDAK berubah sedikit pun; hanya
-- isinya. Urutan baris tetap ORDER BY period_batch karena fungsi massal sudah
-- mengurutkan (sid, pb) dan di sini sid-nya cuma satu.
CREATE OR REPLACE FUNCTION get_batch_rewards(p_submission_id UUID)
RETURNS TABLE (
  period_batch TEXT,
  prize_per_winner INTEGER,
  winner_count INTEGER,
  batch_status TEXT,
  can_select_winners BOOLEAN,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.period_batch,
    b.prize_per_winner,
    b.winner_count,
    b.batch_status,
    b.can_select_winners,
    b.start_date,
    b.end_date
  FROM get_batch_rewards_bulk(ARRAY[p_submission_id]) b;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 3. Hak akses
-- ============================================
-- Feed aplikasi Jakpat (functions/api/surveys.js) memakai service role, tapi
-- halaman survei publik memanggilnya sebagai `anon` -- jadi hibah anon di sini
-- memang dipakai, bukan permukaan menganggur.
--
-- CATATAN KEAMANAN, sekarang jadi disengaja. Fungsi ini SECURITY DEFINER dan
-- mengembalikan agregat hadiah untuk submission_id MANA PUN, termasuk order yang
-- halamannya belum terbit. Yang dikembalikan hanya nominal, jumlah pemenang, dan
-- tanggal -- tidak ada PII -- dan nominal yang sama sudah tampil publik di halaman
-- yang terbit. Eksposurnya dinilai rendah dan DITERIMA SADAR. Kalau suatu saat
-- diputuskan lain, pembatasannya ada di bagian 4 di bawah (dikomentari).
GRANT EXECUTE ON FUNCTION get_batch_rewards_bulk(UUID[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_batch_rewards(UUID)        TO anon, authenticated, service_role;


-- ============================================
-- 4. OPSIONAL — batasi ke submission yang halamannya terbit
-- ============================================
-- Sengaja TIDAK diterapkan di file ini; diputuskan terpisah supaya perubahan
-- perilaku tidak menumpang migrasi yang mengaku "tanpa perubahan perilaku".
-- Kalau nanti dipakai, sisipkan setelah CTE all_periods:
--
-- , visible AS (
--     SELECT ap.* FROM all_periods ap
--     WHERE EXISTS (
--       SELECT 1 FROM survey_pages sp
--       WHERE sp.submission_id = ap.sid AND sp.is_published = true
--     )
--   )
--
-- Konsekuensinya: dashboard admin dan ExtendSection (yang memanggilnya untuk
-- order yang halamannya BELUM terbit) ikut kehilangan angka. Jadi pembatasan ini
-- harus dipasangkan dengan jalur terpisah untuk pemanggil ber-hak, bukan
-- ditambahkan begitu saja.


-- ============================================
-- PRE-CHECK — jalankan SEBELUM menerapkan file ini
-- ============================================
-- Inilah bukti kesetaraannya, dan ia hanya bermakna SEBELUM diterapkan: selama
-- get_batch_rewards masih berisi implementasi sql/37 yang mandiri, query di bawah
-- mengadu logika massal yang baru melawan fungsi lama itu untuk SELURUH submission.
-- Sesudah diterapkan, keduanya jadi kode yang sama dan perbandingannya jadi hampa.
--
-- HARUS mengembalikan NOL BARIS.
--
-- WITH bulk AS (
--   WITH all_periods AS (
--     SELECT fs.id AS sid, TO_CHAR(fs.end_date, 'YYYY-MM') AS pb,
--            fs.prize_per_winner AS base_p, 0 AS add_p, fs.winner_count AS wc,
--            fs.submission_status AS status,
--            airing_instant_of_date(fs.start_date) AS sd,
--            airing_instant_of_date(fs.end_date)   AS ed
--     FROM form_submissions fs
--     WHERE fs.submission_status NOT IN ('rejected', 'spam')
--     UNION ALL
--     SELECT e.submission_id, e.period_batch, COALESCE(e.prize_per_winner, 0),
--            COALESCE(e.additional_prize_per_winner, 0), COALESCE(e.winner_count, 0),
--            e.submission_status, e.start_date, e.end_date
--     FROM form_submissions_extend e
--     WHERE e.payment_status = 'paid'
--   )
--   SELECT ap.sid, ap.pb,
--          (MAX(CASE WHEN ap.base_p > 0 THEN ap.base_p ELSE 0 END) + SUM(ap.add_p))::INTEGER AS prize,
--          MAX(CASE WHEN ap.wc > 0 THEN ap.wc ELSE 0 END)::INTEGER AS wc,
--          NOT BOOL_OR(ap.status IN ('live','scheduled','paid','waiting_payment')
--                      AND (ap.ed IS NULL OR ap.ed > NOW())) AS can_select,
--          MIN(ap.sd) AS start_d, MAX(ap.ed) AS end_d
--   FROM all_periods ap GROUP BY ap.sid, ap.pb
-- ),
-- lama AS (
--   SELECT fs.id AS sid, r.period_batch AS pb, r.prize_per_winner AS prize,
--          r.winner_count AS wc, r.can_select_winners AS can_select,
--          r.start_date AS start_d, r.end_date AS end_d
--   FROM form_submissions fs
--   CROSS JOIN LATERAL get_batch_rewards(fs.id) r
-- )
-- SELECT COALESCE(b.sid, l.sid) AS submission_id,
--        COALESCE(b.pb, l.pb)   AS period_batch,
--        b.prize AS prize_baru, l.prize AS prize_lama,
--        b.wc    AS wc_baru,    l.wc    AS wc_lama,
--        b.can_select AS can_baru, l.can_select AS can_lama,
--        b.start_d AS start_baru, l.start_d AS start_lama,
--        b.end_d   AS end_baru,   l.end_d   AS end_lama
-- FROM bulk b
-- FULL OUTER JOIN lama l ON l.sid = b.sid AND l.pb IS NOT DISTINCT FROM b.pb
-- WHERE b.sid IS NULL OR l.sid IS NULL
--    OR b.prize IS DISTINCT FROM l.prize
--    OR b.wc    IS DISTINCT FROM l.wc
--    OR b.can_select IS DISTINCT FROM l.can_select
--    OR b.start_d IS DISTINCT FROM l.start_d
--    OR b.end_d   IS DISTINCT FROM l.end_d;


-- Kontrak, DICATAT SEBELUM menerapkan supaya ada pembandingnya sesudah:
--
-- SELECT pg_get_function_result('get_batch_rewards(uuid)'::regprocedure)  AS hasil,
--        pg_get_function_arguments('get_batch_rewards(uuid)'::regprocedure) AS argumen;


-- ============================================
-- VERIFIKASI — jalankan SESUDAH menerapkan
-- ============================================
--
-- 1) KONTRAK TIDAK BERGESER. Bandingkan dengan hasil yang dicatat di PRE-CHECK;
--    kedua string harus identik huruf demi huruf.
--
-- SELECT pg_get_function_result('get_batch_rewards(uuid)'::regprocedure)  AS hasil,
--        pg_get_function_arguments('get_batch_rewards(uuid)'::regprocedure) AS argumen;
--
--
-- 2) PEMBUNGKUS = FUNGSI MASSAL. Untuk seluruh submission, dua jalur itu wajib
--    menjawab sama. NOL BARIS.
--
-- WITH satuan AS (
--   SELECT fs.id AS sid, r.*
--   FROM form_submissions fs CROSS JOIN LATERAL get_batch_rewards(fs.id) r
-- ),
-- massal AS (
--   SELECT * FROM get_batch_rewards_bulk(ARRAY(SELECT id FROM form_submissions))
-- )
-- SELECT COALESCE(s.sid, m.submission_id) AS submission_id,
--        COALESCE(s.period_batch, m.period_batch) AS period_batch
-- FROM satuan s
-- FULL OUTER JOIN massal m
--   ON m.submission_id = s.sid
--  AND m.period_batch IS NOT DISTINCT FROM s.period_batch
-- WHERE s.sid IS NULL OR m.submission_id IS NULL
--    OR s.prize_per_winner   IS DISTINCT FROM m.prize_per_winner
--    OR s.winner_count       IS DISTINCT FROM m.winner_count
--    OR s.batch_status       IS DISTINCT FROM m.batch_status
--    OR s.can_select_winners IS DISTINCT FROM m.can_select_winners
--    OR s.start_date         IS DISTINCT FROM m.start_date
--    OR s.end_date           IS DISTINCT FROM m.end_date;
--
--
-- 3) PERSIS APA YANG BERUBAH DI MODE 1. Reproduksi buildBatches() apa adanya
--    (end_date mentah, "aktif" dinilai per batch, parent rejected/spam ikut) lalu
--    adu dengan jawaban SQL. Barisnya BUKAN nol -- justru inilah simpangan yang
--    task ini hapus, dan jumlahnya harus cocok dengan yang dicatat di rencana.
--
--    ⚠️ JALANKAN DUA KALI: apa adanya, lalu ganti setiap NOW() di blok js_agg
--    dengan (CURRENT_DATE + TIME '03:00') AT TIME ZONE 'UTC'. Dijalankan siang
--    hari WIB, kelas simpangan terbesar (8 jam) tidak muncul sama sekali dan
--    hasilnya nol palsu.
--
-- WITH js_periods AS (
--   SELECT sp.submission_id AS sid,
--          TO_CHAR(COALESCE(fs.end_date, sp.publish_end_date::date), 'YYYY-MM') AS pb,
--          COALESCE(fs.prize_per_winner, 0) AS base_p, 0 AS add_p,
--          COALESCE(fs.winner_count, 0) AS wc, fs.submission_status AS status,
--          COALESCE(fs.start_date, sp.publish_start_date::date)::timestamptz AS sd,
--          COALESCE(fs.end_date,   sp.publish_end_date::date)::timestamptz   AS ed
--   FROM survey_pages sp
--   JOIN form_submissions fs ON fs.id = sp.submission_id
--   WHERE sp.is_published = true
--   UNION ALL
--   SELECT e.submission_id, e.period_batch, COALESCE(e.prize_per_winner, 0),
--          COALESCE(e.additional_prize_per_winner, 0), COALESCE(e.winner_count, 0),
--          e.submission_status, e.start_date, e.end_date
--   FROM form_submissions_extend e
--   WHERE e.payment_status = 'paid'
--     AND EXISTS (SELECT 1 FROM survey_pages sp
--                 WHERE sp.submission_id = e.submission_id AND sp.is_published = true)
-- ),
-- js_agg AS (
--   SELECT p.sid, p.pb,
--          (MAX(CASE WHEN p.base_p > 0 THEN p.base_p ELSE 0 END) + SUM(p.add_p))::INTEGER AS prize,
--          MAX(CASE WHEN p.wc > 0 THEN p.wc ELSE 0 END)::INTEGER AS wc,
--          -- "aktif" dinilai PER BATCH, bukan per baris -- inilah bedanya
--          NOT (BOOL_OR(p.status IN ('live','scheduled','paid','waiting_payment'))
--               AND (MAX(p.ed) IS NULL OR MAX(p.ed) > NOW())) AS can_select,
--          MIN(p.sd) AS start_d, MAX(p.ed) AS end_d
--   FROM js_periods p WHERE p.pb IS NOT NULL GROUP BY p.sid, p.pb
-- ),
-- sql_agg AS (
--   SELECT * FROM get_batch_rewards_bulk(
--     ARRAY(SELECT DISTINCT submission_id FROM survey_pages
--           WHERE is_published = true AND submission_id IS NOT NULL))
-- )
-- SELECT j.sid, j.pb,
--        j.prize AS prize_js, s.prize_per_winner AS prize_sql,
--        j.can_select AS can_js, s.can_select_winners AS can_sql,
--        j.start_d AS start_js, s.start_date AS start_sql,
--        j.end_d AS end_js, s.end_date AS end_sql
-- FROM js_agg j
-- FULL OUTER JOIN sql_agg s
--   ON s.submission_id = j.sid AND s.period_batch IS NOT DISTINCT FROM j.pb
-- WHERE j.prize IS DISTINCT FROM s.prize_per_winner
--    OR j.wc    IS DISTINCT FROM s.winner_count
--    OR j.can_select IS DISTINCT FROM s.can_select_winners
--    OR j.start_d IS DISTINCT FROM s.start_date
--    OR j.end_d   IS DISTINCT FROM s.end_date
-- ORDER BY j.sid;
--
--
-- 4) HALAMAN PUBLIK TIDAK BERGESER NOMINALNYA. Bandingkan angka mentah yang
--    ditampilkan SurveyPage/surveys.js hari ini dengan agregat batch yang akan
--    menggantikannya. Diukur 2026-08-04: 266 halaman bersurvei, NOL berubah.
--    Harus tetap nol sesudah file ini diterapkan.
--
-- SELECT COUNT(*) FILTER (WHERE mentah IS DISTINCT FROM agregat) AS berubah,
--        COUNT(*) AS total
-- FROM (
--   SELECT sp.id,
--          (COALESCE(fs.prize_per_winner,0) * COALESCE(fs.winner_count,0)) AS mentah,
--          (SELECT b.prize_per_winner * b.winner_count
--           FROM get_batch_rewards_bulk(ARRAY[sp.submission_id]) b
--           ORDER BY (b.end_date IS NOT NULL AND b.end_date > NOW()) DESC, b.period_batch DESC
--           LIMIT 1) AS agregat
--   FROM survey_pages sp
--   JOIN form_submissions fs ON fs.id = sp.submission_id
--   WHERE sp.is_published = true
-- ) x;
--
--
-- 5) HAK AKSES. SELECT biasa di SQL Editor jalan sebagai `postgres` dan MELEWATI
--    RLS maupun hibah -- ia tidak membuktikan apa pun (pelajaran sql/43). Satu-
--    satunya bukti adalah SET LOCAL ROLE di dalam transaksi.
--
-- BEGIN;
--   SET LOCAL ROLE anon;
--   SELECT * FROM get_batch_rewards_bulk(
--     ARRAY[(SELECT submission_id FROM survey_pages
--            WHERE is_published = true AND submission_id IS NOT NULL LIMIT 1)]);
--   -- HARUS BERHASIL: halaman survei publik memanggilnya sebagai anon
-- ROLLBACK;
--
-- BEGIN;
--   SET LOCAL ROLE anon;
--   SELECT * FROM get_batch_rewards(
--     (SELECT submission_id FROM survey_pages
--      WHERE is_published = true AND submission_id IS NOT NULL LIMIT 1));
--   -- HARUS BERHASIL juga
-- ROLLBACK;


-- ============================================
-- ROLLBACK
-- ============================================
-- Kembalikan get_batch_rewards ke isi sql/37 apa adanya, lalu buang fungsi massal.
-- Jalankan sisi kode (respondents.js, surveys.js, SurveyPage.tsx) lewat revert
-- commit LEBIH DULU -- kalau tidak, mereka memanggil fungsi yang sudah tidak ada.
--
-- 1. Terapkan ulang bagian 1 dari sql/37_batch_pool_context.sql apa adanya
--    (CREATE OR REPLACE FUNCTION get_batch_rewards(p_submission_id UUID) ...).
-- 2. DROP FUNCTION IF EXISTS get_batch_rewards_bulk(UUID[]);
--
-- Tidak ada data yang perlu dipulihkan: file ini tidak pernah menulis satu baris pun.
