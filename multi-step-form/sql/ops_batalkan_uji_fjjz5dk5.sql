-- ============================================================================
-- OPS (sekali jalan): Batalkan order uji FJJZ5DK5 sebelum tayang
-- Tanggal: 2026-10-10
--
-- KONTEKS
-- Order uji tegarerputra@gmail.com «Untitled form», 1 jadwal
-- (schedule e43a663e-75fd-42b0-a731-e85b9724e502, submission
-- a9f8f78d-9d39-4fc7-b422-2404720e8c26). 9 Okt 15.19 WIB order ini ditandai
-- tayang dulu (kredit) lewat /api/admin/mark-on-credit, lalu admin menekan
-- "Hentikan Tayang". Langkah tagihannya jalan (nol tagihan pending tersisa),
-- tapi tulisan statusnya DITOLAK sql/113 (log 08:19:43Z: "submission_status
-- transition scheduled -> slot_cancelled requires service_role").
-- Akibatnya order uji ini masih `scheduled` dengan halaman terbit
-- Sen 12 Okt 15.00 → Sel 13 Okt 15.00 WIB — akan muncul di feed publik.
--
-- YANG DILAKUKAN
-- Meniru jalur pra-tayang cancelSchedule (supabase.ts, cabang ordinal 1):
--   submission_status = 'slot_cancelled', payment_status = 'expired',
--   slot_booked_by = NULL, slot_reserved_at = NULL.
-- Halaman TIDAK disentuh langsung: trg_form_submissions_close_page (sql/99)
-- menutup jendelanya (publish_end_date = now()) begitu status keluar dari
-- "tayang". Jangan kosongkan tanggal halaman — NULL = tayang selamanya
-- (pelajaran kebocoran 08ef25ac). air_on_credit_at dibiarkan (K9: riwayat).
--
-- CARA MENJALANKAN: SQL Editor, blok demi blok. JANGAN lewat MCP.
-- Tenggat: sebelum Sen 12 Okt 15.00 WIB.
-- ============================================================================


-- ============================================================================
-- 1. DRY-RUN
-- ============================================================================
SELECT fs.email, fs.title, fs.submission_status, fs.payment_status,
       fs.start_date, fs.end_date, fs.slot_booked_by,
       a.booking_id, a.air_on_credit_at IS NOT NULL AS kredit,
       sp.is_published,
       to_char(sp.publish_start_date AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI') AS terbit_wib,
       to_char(sp.publish_end_date   AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI') AS tutup_wib,
       (SELECT count(*) FROM public.ad_schedules x WHERE x.submission_id = fs.id) AS jadwal,
       (SELECT count(*) FROM public.transactions t
         WHERE t.form_submission_id = fs.id AND t.status = 'pending') AS tx_pending,
       (SELECT count(*) FROM public.invoices i
         WHERE i.form_submission_id = fs.id AND i.status = 'pending') AS inv_pending
  FROM public.form_submissions fs
  JOIN public.ad_schedules a ON a.id = 'e43a663e-75fd-42b0-a731-e85b9724e502'
  LEFT JOIN public.survey_pages sp ON sp.submission_id = fs.id
 WHERE fs.id = 'a9f8f78d-9d39-4fc7-b422-2404720e8c26';
-- Harapan: tegarerputra@gmail.com | Untitled form | scheduled | pending |
-- 2026-10-12 | 2026-10-13 | admin | FJJZ5DK5 | kredit true | is_published true |
-- 12 Oct 15:00 | 13 Oct 15:00 | jadwal 1 | tx_pending 0 | inv_pending 0.


-- ============================================================================
-- 2. APPLY
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS backup.ops_batal_uji_fjjz5dk5_fs_20261010 AS
  SELECT * FROM public.form_submissions WHERE id = 'a9f8f78d-9d39-4fc7-b422-2404720e8c26';
CREATE TABLE IF NOT EXISTS backup.ops_batal_uji_fjjz5dk5_page_20261010 AS
  SELECT * FROM public.survey_pages WHERE submission_id = 'a9f8f78d-9d39-4fc7-b422-2404720e8c26';
REVOKE ALL ON backup.ops_batal_uji_fjjz5dk5_fs_20261010, backup.ops_batal_uji_fjjz5dk5_page_20261010
  FROM PUBLIC, anon, authenticated;
ALTER TABLE backup.ops_batal_uji_fjjz5dk5_fs_20261010 ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup.ops_batal_uji_fjjz5dk5_page_20261010 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.form_submissions
     SET submission_status = 'slot_cancelled',
         payment_status    = 'expired',
         slot_booked_by    = NULL,
         slot_reserved_at  = NULL,
         updated_at        = now()
   WHERE id = 'a9f8f78d-9d39-4fc7-b422-2404720e8c26'
     AND email = 'tegarerputra@gmail.com'
     AND submission_status = 'scheduled'
     AND coalesce(payment_status, '') NOT IN ('paid', 'completed');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Harus tepat 1 baris, kena %', v_rows;
  END IF;
END $$;

COMMIT;


-- ============================================================================
-- 3. VERIFY
-- ============================================================================
SELECT fs.submission_status, fs.payment_status, fs.slot_booked_by,
       a.status AS cermin_jadwal,
       sp.is_published,
       sp.publish_end_date <= now() AS halaman_tertutup,
       sp.auto_closed_at IS NOT NULL AS ditutup_sistem
  FROM public.form_submissions fs
  JOIN public.ad_schedules a ON a.id = 'e43a663e-75fd-42b0-a731-e85b9724e502'
  LEFT JOIN public.survey_pages sp ON sp.submission_id = fs.id
 WHERE fs.id = 'a9f8f78d-9d39-4fc7-b422-2404720e8c26';
-- Harapan: slot_cancelled | expired | NULL | cermin batal (bukan scheduled) |
-- is_published true (sengaja — undian) | halaman_tertutup true | ditutup_sistem true.


-- ============================================================================
-- 4. ROLLBACK (hanya kalau perlu)
-- ============================================================================
-- Status kembali `scheduled` → trg_form_submissions_ensure_page membuka ulang
-- jendela halaman (auto_closed_at terisi → ensure_survey_page menulis ulang).
--
-- BEGIN;
-- UPDATE public.form_submissions fs
--    SET submission_status = b.submission_status,
--        payment_status    = b.payment_status,
--        slot_booked_by    = b.slot_booked_by,
--        slot_reserved_at  = b.slot_reserved_at
--   FROM backup.ops_batal_uji_fjjz5dk5_fs_20261010 b
--  WHERE fs.id = b.id
--    AND fs.submission_status = 'slot_cancelled';
-- -- Harapan: UPDATE 1
-- COMMIT;
