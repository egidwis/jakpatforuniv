-- ============================================================================
-- OPS (sekali jalan): Tayangkan 4 jadwal tagihan tempo grup 06a98b
-- Tanggal: 2026-10-10
--
-- KONTEKS
-- 9 Okt 12.57 WIB admin menerbitkan tagihan tempo gabungan
-- JFU-INV-06a98b-1791525418485 (4 pesanan, 4 × Rp 527.250 = Rp 2.109.000).
-- Sesudah tagihan tertulis, UI memanggil mark_schedules_on_credit dari
-- browser — tapi sql/113 (diterapkan 8 Okt 14.25 WIB) sudah menolak JWT
-- non-service_role untuk transisi slot_reserved -> scheduled. Log Postgres
-- 05:57:02Z: "submission_status transition slot_reserved -> scheduled requires
-- service_role". Tagihan tempo-nya terbit, tapi jadwalnya tertinggal
-- "Reserved" dan halaman iklannya tidak pernah lahir.
--
--   booking    schedule_id                            mulai (WIB)
--   X5EKV7S9   d64ed981-6d86-4bc2-a3d0-d0050ca06c68   Min 11 Okt 15.00  ⚠️
--   E8RTNDPW   1502ef55-c8d6-4d38-bb55-7c46d830ba57   Sen 12 Okt 15.00
--   A5NBAAX3   66cc1c63-5f23-41e2-9ec8-e8cb72839c2d   Sel 13 Okt 15.00
--   VVGA4DSY   b5cc8150-8edc-44ad-88e1-5d7a326efd10   Rab 14 Okt 15.00
--
-- YANG DILAKUKAN
-- Memanggil RPC yang SAMA dengan UI: mark_schedules_on_credit (sql/102 §9).
-- SQL Editor tidak membawa request.jwt.claims, jadi cek admin di RPC,
-- guard_payment_columns (sql/113) dan guard_air_on_credit_columns meloloskannya
-- — persis seperti cron. RPC itu:
--   · mengisi ad_schedules.air_on_credit_at (+ catatan),
--   · menulis form_submissions.submission_status = 'scheduled'
--     → trg_form_submissions_ensure_page melahirkan survey_pages
--       (jendela 15.00 WIB start → 15.00 WIB end),
--   · slot_booked_by = 'admin' (sudah 'admin' → kuota sql/111 menganggapnya
--     klaim yang sama, tidak dihitung ulang).
--
-- YANG TIDAK DISENTUH
-- invoices / transactions. Tagihan gabungan tetap SATU, link DOKU-nya tetap
-- yang sudah dikirim, tidak ada email baru. Peneliti tetap membayar lewat
-- link yang sama; /bayar/ memperbaruinya tiap 7 hari (tempo_renewable).
--
-- CARA MENJALANKAN (SQL Editor Supabase, JANGAN lewat MCP)
-- Blok-blok di bawah dijalankan SATU PER SATU — sorot bloknya, lalu Run.
--   1. DRY-RUN  → cocokkan dengan harapan di bawah tiap kueri.
--   2. UJI      → DO-block yang SENGAJA gagal di akhir. Pesan errornya
--                 "UJI LULUS …" = semua berhasil lalu dibatalkan otomatis.
--                 Pesan lain = berhenti, kirim pesannya.
--   3. APPLY    → BEGIN … COMMIT. Kalau ada error, jalankan `ROLLBACK;`.
--   4. VERIFY
--   5. ROLLBACK → hanya kalau perlu, dan HANYA sebelum Min 11 Okt 15.00 WIB.
-- ============================================================================


-- ============================================================================
-- 1. DRY-RUN
-- ============================================================================
SELECT a.booking_id,
       a.id                     AS schedule_id,
       a.status                 AS jadwal,
       fs.submission_status     AS order_status,
       fs.payment_status,
       a.slot_booked_by,
       a.air_on_credit_at,
       a.start_date,
       a.end_date,
       coalesce(btrim(fs.survey_url), '') <> ''  AS ada_survey_url,
       (SELECT count(*) FROM public.survey_pages sp WHERE sp.submission_id = fs.id) AS halaman
  FROM public.ad_schedules a
  JOIN public.form_submissions fs ON fs.id = a.source_id
 WHERE a.source_table = 'form_submissions'
   AND a.id IN ('d64ed981-6d86-4bc2-a3d0-d0050ca06c68',
                '1502ef55-c8d6-4d38-bb55-7c46d830ba57',
                '66cc1c63-5f23-41e2-9ec8-e8cb72839c2d',
                'b5cc8150-8edc-44ad-88e1-5d7a326efd10')
 ORDER BY a.start_date;
-- Harapan: 4 baris; jadwal & order_status = slot_reserved; payment_status =
-- pending; slot_booked_by = admin; air_on_credit_at NULL; ada_survey_url true;
-- halaman 0.

SELECT i.payment_id, count(*) AS baris, sum(i.amount) AS total,
       bool_and(i.is_tempo) AS semua_tempo,
       array_agg(DISTINCT i.status) AS status
  FROM public.invoices i
 WHERE i.payment_id = 'JFU-INV-06a98b-1791525418485'
 GROUP BY i.payment_id;
-- Harapan: 1 baris; baris 4; total 2109000; semua_tempo true; status {pending}.


-- ============================================================================
-- 2. UJI (otomatis dibatalkan — tidak ada yang tersimpan)
-- ============================================================================
DO $$
DECLARE
  v_ok     int;
  v_hasil  text;
  v_pages  int;
  v_window text;
BEGIN
  SELECT count(*) FILTER (WHERE r.outcome = 'ok'),
         string_agg(r.schedule_id::text || '=' || r.outcome, ', ')
    INTO v_ok, v_hasil
    FROM public.mark_schedules_on_credit(
           ARRAY['d64ed981-6d86-4bc2-a3d0-d0050ca06c68',
                 '1502ef55-c8d6-4d38-bb55-7c46d830ba57',
                 '66cc1c63-5f23-41e2-9ec8-e8cb72839c2d',
                 'b5cc8150-8edc-44ad-88e1-5d7a326efd10']::uuid[],
           'UJI') AS r;

  SELECT count(*),
         string_agg(to_char(sp.publish_start_date AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI')
                    || '→' ||
                    to_char(sp.publish_end_date AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI'),
                    ', ' ORDER BY sp.publish_start_date)
    INTO v_pages, v_window
    FROM public.survey_pages sp
   WHERE sp.is_published
     AND sp.submission_id IN (SELECT a.source_id FROM public.ad_schedules a
                               WHERE a.id IN ('d64ed981-6d86-4bc2-a3d0-d0050ca06c68',
                                              '1502ef55-c8d6-4d38-bb55-7c46d830ba57',
                                              '66cc1c63-5f23-41e2-9ec8-e8cb72839c2d',
                                              'b5cc8150-8edc-44ad-88e1-5d7a326efd10'));

  IF v_ok = 4 AND v_pages = 4 THEN
    RAISE EXCEPTION 'UJI LULUS (sengaja dibatalkan): 4x ok, 4 halaman WIB [%]', v_window;
  END IF;
  RAISE EXCEPTION 'UJI GAGAL: ok=% halaman=% hasil=[%]', v_ok, v_pages, v_hasil;
END $$;
-- Harapan: ERROR "UJI LULUS (sengaja dibatalkan): 4x ok, 4 halaman WIB
-- [11 Oct 15:00→12 Oct 15:00, 12 Oct 15:00→13 Oct 15:00, …]".


-- ============================================================================
-- 3. APPLY
-- ============================================================================
BEGIN;

-- Snapshot ke skema backup (memori backup-schema-snapshot-rule).
CREATE TABLE IF NOT EXISTS backup.ops_tempo_06a98b_sched_20261010 AS
  SELECT * FROM public.ad_schedules
   WHERE id IN ('d64ed981-6d86-4bc2-a3d0-d0050ca06c68',
                '1502ef55-c8d6-4d38-bb55-7c46d830ba57',
                '66cc1c63-5f23-41e2-9ec8-e8cb72839c2d',
                'b5cc8150-8edc-44ad-88e1-5d7a326efd10');
CREATE TABLE IF NOT EXISTS backup.ops_tempo_06a98b_fs_20261010 AS
  SELECT * FROM public.form_submissions
   WHERE id IN (SELECT source_id FROM backup.ops_tempo_06a98b_sched_20261010);
REVOKE ALL ON backup.ops_tempo_06a98b_sched_20261010, backup.ops_tempo_06a98b_fs_20261010
  FROM PUBLIC, anon, authenticated;
ALTER TABLE backup.ops_tempo_06a98b_sched_20261010 ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup.ops_tempo_06a98b_fs_20261010 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_ok    int;
  v_hasil text;
BEGIN
  SELECT count(*) FILTER (WHERE r.outcome = 'ok'),
         string_agg(r.schedule_id::text || '=' || r.outcome, ', ')
    INTO v_ok, v_hasil
    FROM public.mark_schedules_on_credit(
           ARRAY['d64ed981-6d86-4bc2-a3d0-d0050ca06c68',
                 '1502ef55-c8d6-4d38-bb55-7c46d830ba57',
                 '66cc1c63-5f23-41e2-9ec8-e8cb72839c2d',
                 'b5cc8150-8edc-44ad-88e1-5d7a326efd10']::uuid[],
           'Susulan: penandaan tayang dulu 9 Okt ditolak sql/113; ditandai lewat SQL Editor 10 Okt') AS r;

  IF v_ok IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION 'Harus 4x ok, dapat: %', v_hasil;
  END IF;
END $$;

-- RPC menulis air_on_credit_by dari email JWT; SQL Editor tidak punya,
-- jadi isi manual supaya jejaknya setara kredit lain (WH265TVZ).
UPDATE public.ad_schedules
   SET air_on_credit_by = 'product@jakpat.net'
 WHERE id IN ('d64ed981-6d86-4bc2-a3d0-d0050ca06c68',
              '1502ef55-c8d6-4d38-bb55-7c46d830ba57',
              '66cc1c63-5f23-41e2-9ec8-e8cb72839c2d',
              'b5cc8150-8edc-44ad-88e1-5d7a326efd10')
   AND air_on_credit_by IS NULL;

COMMIT;


-- ============================================================================
-- 4. VERIFY
-- ============================================================================
SELECT a.booking_id,
       a.status                 AS jadwal,
       fs.submission_status     AS order_status,
       fs.payment_status,
       a.air_on_credit_at IS NOT NULL AS kredit,
       a.air_on_credit_by,
       sp.is_published,
       to_char(sp.publish_start_date AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI') AS terbit_wib,
       to_char(sp.publish_end_date   AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI') AS tutup_wib
  FROM public.ad_schedules a
  JOIN public.form_submissions fs ON fs.id = a.source_id
  LEFT JOIN public.survey_pages sp ON sp.submission_id = fs.id
 WHERE a.id IN ('d64ed981-6d86-4bc2-a3d0-d0050ca06c68',
                '1502ef55-c8d6-4d38-bb55-7c46d830ba57',
                '66cc1c63-5f23-41e2-9ec8-e8cb72839c2d',
                'b5cc8150-8edc-44ad-88e1-5d7a326efd10')
 ORDER BY a.start_date;
-- Harapan: 4 baris; jadwal & order_status = scheduled; payment_status =
-- pending (BELUM lunas — memang begitu); kredit true; air_on_credit_by =
-- product@jakpat.net; is_published true; terbit 11/12/13/14 Okt 15:00,
-- tutup sehari sesudahnya 15:00.

SELECT count(*) AS baris, sum(amount) AS total, array_agg(DISTINCT status) AS status
  FROM public.invoices
 WHERE payment_id = 'JFU-INV-06a98b-1791525418485';
-- Harapan: 4 | 2109000 | {pending} — tagihan tidak berubah sama sekali.


-- ============================================================================
-- 5. ROLLBACK (hanya kalau perlu, dan HANYA sebelum Min 11 Okt 15.00 WIB)
-- ============================================================================
-- Status kembali slot_reserved → trg_form_submissions_close_page (sql/99)
-- menutup jendela halaman (publish_end_date = now(), auto_closed_at).
-- Halamannya tidak dihapus; kalau kelak ditandai tayang lagi,
-- ensure_survey_page membuka ulang jendelanya.
--
-- BEGIN;
-- UPDATE public.form_submissions fs
--    SET submission_status = 'slot_reserved'
--  WHERE fs.id IN (SELECT source_id FROM backup.ops_tempo_06a98b_sched_20261010)
--    AND fs.submission_status = 'scheduled'
--    AND fs.payment_status NOT IN ('paid', 'completed');
-- -- Harapan: UPDATE 4
-- UPDATE public.ad_schedules a
--    SET air_on_credit_at = NULL, air_on_credit_by = NULL, air_on_credit_note = NULL
--  WHERE a.id IN (SELECT id FROM backup.ops_tempo_06a98b_sched_20261010);
-- -- Harapan: UPDATE 4
-- COMMIT;
