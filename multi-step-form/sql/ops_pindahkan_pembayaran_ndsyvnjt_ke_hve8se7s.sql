-- ============================================================================
-- OPS (sekali jalan): Alihkan Pembayaran NDSYVNJT ke HVE8SE7S & Batalkan NDSYVNJT
-- Tanggal: 2026-09-30
--
-- KONTEKS:
-- 1. Peneliti Edward Theodorus (edo.psi.sadhar@gmail.com) membayar Rp 1.665.000
--    lewat DOKU CIMB VA pada reservasi NDSYVNJT (order 006273f9 / "ITS Studi 2").
-- 2. Namun pembayaran tersebut sebenarnya untuk perpanjangan jadwal HVE8SE7S
--    (order a87b687a / "Riset Psikologi Ideologi", jadwal ordinal 4)
--    yang bertanggal sama: 5–7 Oktober 2026.
-- 3. Di HVE8SE7S sempat dibuatkan tagihan manual Rp 1.665.000 (JFU-INV-a87b68-1790736330154)
--    dan ditandai MANUAL_VERIFIED.
--
-- ALUR EKSEKUSI:
-- 1. Pindahkan bukti bayar DOKU CIMB VA lunas (JFU-006273f9-1790670274322) ke HVE8SE7S
--    agar HVE8SE7S sah lunas dengan uang riil DOKU.
-- 2. Tagihan manual kembar (JFU-INV-a87b68-1790736330154) dipindahkan ke NDSYVNJT
--    dan disetel statusnya: CANCELLED (tagihan dibatalkan, paid_at NULL).
-- 3. Jadwal & order NDSYVNJT dibatalkan (status='cancelled', payment_status='pending')
--    dan halaman surveinya ditutup, membebaskan slot 5–7 Oktober.
-- ============================================================================

-- ============================================================================
-- LANGKAH 1 — AUDIT SEBELUM EKSEKUSI (DRY RUN)
-- ============================================================================
SELECT
    s.booking_id,
    s.id AS schedule_id,
    s.submission_id,
    s.ordinal,
    s.start_date,
    s.end_date,
    s.status AS schedule_status,
    s.payment_status,
    s.total_cost,
    fs.title,
    fs.email
FROM public.ad_schedules s
JOIN public.form_submissions fs ON fs.id = s.submission_id
WHERE s.booking_id IN ('NDSYVNJT', 'HVE8SE7S')
ORDER BY s.booking_id;

SELECT 'inv' AS src, s.booking_id, i.payment_id, i.amount, i.status, i.paid_at, i.schedule_id
  FROM public.invoices i
  JOIN public.ad_schedules s ON s.id = i.schedule_id
 WHERE s.booking_id IN ('NDSYVNJT', 'HVE8SE7S')
UNION ALL
SELECT 'txn' AS src, s.booking_id, t.payment_id, t.amount, t.status, NULL, t.schedule_id
  FROM public.transactions t
  JOIN public.ad_schedules s ON s.id = t.schedule_id
 WHERE s.booking_id IN ('NDSYVNJT', 'HVE8SE7S')
ORDER BY 2, 1;


-- ============================================================================
-- LANGKAH 2 — EKSEKUSI TRANSAKSI OPS
-- ============================================================================
BEGIN;

-- 1. Snapshot data ke skema backup (standar keselamatan proyek)
CREATE TABLE IF NOT EXISTS backup.ops_reassign_inv_20260930 AS
  SELECT * FROM public.invoices
   WHERE payment_id IN ('JFU-006273f9-1790670274322', 'JFU-INV-a87b68-1790736330154');

CREATE TABLE IF NOT EXISTS backup.ops_reassign_txn_20260930 AS
  SELECT * FROM public.transactions
   WHERE payment_id IN ('JFU-006273f9-1790670274322', 'JFU-INV-a87b68-1790736330154');

CREATE TABLE IF NOT EXISTS backup.ops_reassign_sched_20260930 AS
  SELECT * FROM public.ad_schedules
   WHERE booking_id IN ('NDSYVNJT', 'HVE8SE7S');

REVOKE ALL ON backup.ops_reassign_inv_20260930, backup.ops_reassign_txn_20260930, backup.ops_reassign_sched_20260930
  FROM PUBLIC, anon, authenticated;
ALTER TABLE backup.ops_reassign_inv_20260930 ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup.ops_reassign_txn_20260930 ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup.ops_reassign_sched_20260930 ENABLE ROW LEVEL SECURITY;


-- 2. Pindahkan Pembayaran Lunas DOKU CIMB VA ke HVE8SE7S
UPDATE public.invoices
   SET form_submission_id = 'a87b687a-939a-442c-ac46-5020fee11c75',
       entity_type        = 'extend',
       extend_id          = 'c25540a9-cdc0-42d1-8fab-43eef7d9a365',
       schedule_id        = '8f2d7bd4-f4cd-457e-a24c-e1a23de88811'
 WHERE payment_id = 'JFU-006273f9-1790670274322';

UPDATE public.transactions
   SET form_submission_id = 'a87b687a-939a-442c-ac46-5020fee11c75',
       entity_type        = 'extend',
       extend_id          = 'c25540a9-cdc0-42d1-8fab-43eef7d9a365',
       schedule_id        = '8f2d7bd4-f4cd-457e-a24c-e1a23de88811',
       updated_at         = now()
 WHERE payment_id = 'JFU-006273f9-1790670274322';

-- Pastikan jadwal HVE8SE7S tetap lunas dan scheduled
UPDATE public.ad_schedules
   SET payment_status = 'paid',
       status         = 'scheduled',
       updated_at     = now()
 WHERE id = '8f2d7bd4-f4cd-457e-a24c-e1a23de88811'
   AND booking_id = 'HVE8SE7S';


-- 3. Pasangkan tagihan manual ke NDSYVNJT dan BATALKAN (status='cancelled')
--    Hal ini mencatat riwayat bahwa tagihan NDSYVNJT tidak dibayar lalu dibatalkan.
UPDATE public.invoices
   SET form_submission_id = '006273f9-0c63-4e48-9e45-81571db62ccf',
       entity_type        = 'submission',
       extend_id          = NULL,
       schedule_id        = 'c57731f4-e5d8-432d-9e37-44df1cfc7c2e',
       status             = 'cancelled',
       paid_at            = NULL
 WHERE payment_id = 'JFU-INV-a87b68-1790736330154';

UPDATE public.transactions
   SET form_submission_id = '006273f9-0c63-4e48-9e45-81571db62ccf',
       entity_type        = 'submission',
       extend_id          = NULL,
       schedule_id        = 'c57731f4-e5d8-432d-9e37-44df1cfc7c2e',
       status             = 'cancelled',
       updated_at         = now()
 WHERE payment_id = 'JFU-INV-a87b68-1790736330154';


-- 4. Batalkan jadwal & pesanan NDSYVNJT
--    a. Jadwal NDSYVNJT disetel cancelled & pending
UPDATE public.ad_schedules
   SET payment_status = 'pending',
       status         = 'cancelled',
       slot_booked_by = NULL,
       updated_at     = now()
 WHERE id = 'c57731f4-e5d8-432d-9e37-44df1cfc7c2e'
   AND booking_id = 'NDSYVNJT';

--    b. Pesanan form_submissions NDSYVNJT disetel cancelled & pending
UPDATE public.form_submissions
   SET payment_status    = 'pending',
       submission_status = 'cancelled',
       updated_at        = now()
 WHERE id = '006273f9-0c63-4e48-9e45-81571db62ccf';

--    c. Tutup publikasi halaman survei milik NDSYVNJT
UPDATE public.survey_pages
   SET publish_start_date = NULL,
       publish_end_date   = NULL,
       auto_closed_at     = now(),
       updated_at         = now()
 WHERE submission_id = '006273f9-0c63-4e48-9e45-81571db62ccf';

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI SESUDAH COMMIT
-- ============================================================================
-- 1. HVE8SE7S: harus lunas Rp 1.665.000 via DOKU CIMB VA
SELECT * FROM public.schedule_billing('8f2d7bd4-f4cd-457e-a24c-e1a23de88811');

-- 2. NDSYVNJT: harus menampilkan 1 baris tagihan berstatus 'cancelled'
SELECT * FROM public.schedule_billing('c57731f4-e5d8-432d-9e37-44df1cfc7c2e');

-- 3. Periksa status kedua jadwal:
SELECT booking_id, ordinal, status, payment_status, total_cost, start_date, end_date
  FROM public.ad_schedules
 WHERE booking_id IN ('NDSYVNJT', 'HVE8SE7S')
 ORDER BY booking_id;
