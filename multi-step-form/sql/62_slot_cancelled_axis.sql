-- 62_slot_cancelled_axis.sql
-- Date: 2026-08-19  ·  Task 13 Rilis 2 (bagian 2)
--
-- Memberi PEMBATALAN SLOT oleh admin sebuah nama sendiri di sumbu tayang,
-- terpisah dari penyingkiran order oleh peneliti.
--
-- ============================================================================
-- KENAPA TIDAK MEMAKAI ULANG 'cancelled' DI form_submissions
-- ============================================================================
--
-- `form_submissions.submission_status = 'cancelled'` SUDAH PUNYA PEMILIK:
-- `dismissRejectedSubmission()` menulisnya saat peneliti menekan "Hapus" pada
-- order yang DITOLAK/SPAM — soft-delete supaya barisnya hilang dari daftarnya
-- tanpa melenyapkan bukti (invoices/transactions/survey_pages tidak punya FK
-- ke tabel ini, jadi DELETE keras meninggalkan baris yatim).
--
-- Dua peristiwa itu berbeda dan harus tetap bisa dibedakan:
--
--   dismissal      -> keputusan PENELITI, atas order yang sudah ditolak,
--                     tidak pernah menyangkut uang maupun slot
--   pembatalan slot -> keputusan ADMIN, atas jadwal yang SEDANG memesan slot,
--                     dan bisa menyangkut tagihan yang sudah terbit
--
-- Melipat keduanya jadi satu nilai membuat laporan tidak bisa lagi menjawab
-- "berapa slot yang kami batalkan bulan ini" tanpa menebak dari kolom lain.
-- Keputusan pemilik produk 2026-08-19: PISAHKAN.
--
-- ============================================================================
-- KENAPA NILAINYA BERBEDA ANTAR TABEL — DAN KENAPA ITU BUKAN INKONSISTENSI
-- ============================================================================
--
--   form_submissions.submission_status  -> 'slot_cancelled'   (kosakata CAMPUR)
--   form_submissions_extend.submission_status -> 'cancelled'  (kosakata TAYANG)
--   ad_schedules.status                 -> 'cancelled'        (untuk KEDUANYA)
--
-- `form_submissions.submission_status` memikul DUA sumbu sekaligus (review +
-- tayang), jadi ia tidak boleh memakai kata yang sudah dipakai sumbu lain di
-- tabel itu. `form_submissions_extend.submission_status` memakai kosakata sumbu
-- tayang sejak awal, jadi 'cancelled' di sana memang sudah tepat dan TIDAK
-- diubah — mirror extend menulisnya apa adanya.
--
-- Yang penting: di tabel OTORITATIF (`ad_schedules`) keduanya bertemu di satu
-- nilai yang sama. Satu konsep, satu representasi, di tempat yang dibaca semua
-- layar.
--
-- ============================================================================
-- NOL BARIS TERSENTUH
-- ============================================================================
--
-- 'slot_cancelled' adalah nilai BARU: belum ada satu baris pun memakainya, jadi
-- migrasi ini tidak mengubah data apa pun. Ia hanya mengajari dua fungsi
-- turunan mengenalinya, supaya `cancelSchedule()` di rilis ini punya tempat
-- mendarat. Tidak ada backfill, dan memang tidak boleh ada.

BEGIN;

-- ============================================================================
-- 1. Sumbu TAYANG mengenali pembatalan slot
-- ============================================================================
-- Perubahan tunggal: satu cabang baru. Sisa CASE-nya identik dengan sql/46 —
-- ditulis utuh karena CREATE OR REPLACE mengganti seluruh badan fungsi.
CREATE OR REPLACE FUNCTION airing_status_of(p_submission_status TEXT, p_has_dates BOOLEAN)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_submission_status IN ('rejected', 'spam') THEN 'cancelled'
    -- BARU (sql/62): pembatalan slot oleh admin.
    WHEN p_submission_status = 'slot_cancelled' THEN 'cancelled'
    WHEN p_submission_status IN ('waiting_payment', 'paid', 'scheduled', 'live', 'completed')
      THEN p_submission_status
    WHEN p_submission_status = 'slot_reserved' THEN 'slot_reserved'
    WHEN COALESCE(p_has_dates, false) THEN 'requested'
    ELSE 'unscheduled'
  END;
$$;

COMMENT ON FUNCTION airing_status_of(TEXT, BOOLEAN) IS
  'Sumbu tayang saja, dari submission_status + ada/tidaknya tanggal. rejected/spam DAN slot_cancelled sama-sama jadi ''cancelled'' — yang membedakannya review_status, bukan kolom ini (sql/62).';

-- ============================================================================
-- 2. Sumbu REVIEW tidak boleh ikut berubah
-- ============================================================================
-- ⚠️ TANPA BAGIAN INI, MEMBATALKAN SLOT AKAN MENGHAPUS RIWAYAT REVIEW.
--
-- `review_status_of()` memetakan apa pun di luar daftar "sudah lolos review"
-- menjadi dirinya sendiri. Jadi tanpa perubahan ini, order yang slotnya
-- dibatalkan akan ber-`review_status = 'slot_cancelled'` — nilai yang tidak
-- dikenal permukaan mana pun, dan yang lebih buruk: fakta bahwa kuesionernya
-- PERNAH DISETUJUI hilang dari cermin. Padahal justru order yang sudah
-- disetujui yang bisa punya slot untuk dibatalkan.
--
-- Membatalkan slot tidak membatalkan persetujuan. Sumbu review tetap 'approved'.
CREATE OR REPLACE FUNCTION review_status_of(p_submission_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_submission_status, 'pending') IN
         ('approved', 'slot_reserved', 'waiting_payment', 'paid', 'scheduled', 'live', 'completed',
          'slot_cancelled')
      THEN 'approved'
    ELSE COALESCE(p_submission_status, 'pending')
  END;
$$;

COMMENT ON FUNCTION review_status_of(TEXT) IS
  'Sumbu review saja. slot_cancelled ikut dipetakan ''approved'': membatalkan slot tidak membatalkan persetujuan kuesionernya (sql/62).';

COMMIT;

-- ============================================================================
-- VERIFIKASI — jalankan SESUDAH menerapkan, catat angkanya
-- ============================================================================
--
-- (1) Kedua fungsi mengenali nilai baru — harus 'cancelled' dan 'approved':
--
--     SELECT airing_status_of('slot_cancelled', true)  AS tayang,   -- cancelled
--            airing_status_of('slot_cancelled', false) AS tanpa_tgl, -- cancelled
--            review_status_of('slot_cancelled')        AS review;    -- approved
--
-- (2) NOL baris tersentuh — nilai ini belum dipakai siapa pun:
--
--     SELECT count(*) FROM form_submissions WHERE submission_status = 'slot_cancelled';
--     -- harapan: 0
--
-- (3) Tidak ada cermin yang jadi menyimpang gara-gara fungsi berubah.
--     Query ini membandingkan status cermin dengan hasil turunan hari ini;
--     harus tetap 0 SEBELUM dan SESUDAH migrasi:
--
--     SELECT count(*)
--       FROM ad_schedules a
--       JOIN form_submissions fs ON fs.id = a.submission_id
--      WHERE a.source_table = 'form_submissions'
--        AND a.status IS DISTINCT FROM
--            airing_status_of(fs.submission_status, fs.start_date IS NOT NULL);
--     -- harapan: 0
--
-- (4) Dismissal peneliti TIDAK ikut berubah artinya — 'cancelled' di
--     form_submissions tetap jatuh ke requested/unscheduled seperti sebelumnya:
--
--     SELECT airing_status_of('cancelled', true) AS masih_requested;  -- requested
--
-- ============================================================================
-- YANG BERGANTUNG PADA MIGRASI INI
-- ============================================================================
--
--   `cancelSchedule()` (utils/supabase.ts) menulis 'slot_cancelled' untuk
--   ordinal 1. Sebelum migrasi ini diterapkan, tulisan itu mendarat sebagai
--   `ad_schedules.status = 'requested'` — jadwal yang dibatalkan akan tampak
--   seperti permintaan aktif dan TETAP memakan kuota. Jangan deploy kodenya
--   lebih dulu.
--
--   Chip 'cancelled' (status-tokens.ts, chipKindOf, occupiesSlot) sudah
--   mendarat di commit sebelumnya dan menunggu nilai ini.
