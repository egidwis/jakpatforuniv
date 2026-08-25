-- 69_review_axis_cleanup.sql
-- Date: 2026-08-25
--
-- Membereskan SUMBU REVIEW supaya tiga keadaan akhir punya nama masing-masing,
-- dan supaya riwayat review berhenti menguap.
--
-- Idempotent: CREATE OR REPLACE + ADD COLUMN IF NOT EXISTS. Aman dijalankan
-- ulang, mengikuti bentuk sql/62.
--
-- ============================================================================
-- APA YANG BERUBAH, DAN KENAPA
-- ============================================================================
--
-- (1) `airing_status_of('cancelled', …)` — MENAMBAL BUG YANG SUDAH ADA.
--
--     'cancelled' tidak punya cabang sama sekali, jadi ia jatuh ke cabang
--     pass-through di bawah: order yang PUNYA tanggal mendarat sebagai
--     ad_schedules.status='requested'. Artinya order yang sudah dibatalkan
--     tampil di papan Schedule seolah sedang MEMINTA jendela tayang.
--     Terverifikasi di produksi 2026-08-25: airing_status_of('cancelled',true)
--     mengembalikan 'requested'.
--
--     Baru 1 baris terdampak karena 'cancelled' cuma pernah ditulis 2 kali.
--     Begitu pembatalan jadi jalur resmi, ini jadi sistematis.
--
-- (2) Kolom `dismissed_at` — MEMBEBASKAN KATA 'cancelled'.
--
--     'cancelled' selama ini MISNOMER. Ia berarti "peneliti menyembunyikan
--     order ini dari daftarnya" (`dismissRejectedSubmission`), bukan
--     "dibatalkan" — dan StatusPage menyaringnya habis dari dashboard.
--
--     Menyembunyikan adalah PREFERENSI TAMPILAN PEMILIK BARIS, bukan keadaan
--     order. Ia tidak berhak menduduki satu nilai status. Dipindahkan ke kolom
--     sendiri, kata 'cancelled' bebas berarti apa yang orang kira artinya —
--     alih-alih kita menaruh kata KEDUA yang mirip ('order_cancelled') di
--     sebelahnya dan membuat dua-duanya membingungkan.
--
--     Bonus: menyembunyikan jadi ORTHOGONAL. Berlaku untuk order mati apa pun
--     (Menunggu Perbaikan, Tidak Valid, Dibatalkan), bukan cuma yang kebetulan
--     lewat satu tombol.
--
-- (3) Kolom `review_history` — KOLOMNYA TIDAK PERNAH ADA.
--
--     Seluruh kode penulis & pembacanya sudah ditulis seolah ia ada.
--     `updateFormStatus` menabrak 42703 SETIAP KALI dan diam-diam mengulang
--     tanpa kolom itu — jadi cabang "fallback" ternyata satu-satunya jalur yang
--     pernah diambil, dan History Log hanya menampilkan aksi dalam sesi browser
--     yang sedang berjalan. Riwayat sebelum migrasi ini TIDAK BISA dipulihkan;
--     ia tidak pernah tersimpan di mana pun.
--
-- ============================================================================
-- YANG SENGAJA TIDAK DIUBAH
-- ============================================================================
--
--   `review_status_of()`   — ia meneruskan nilai tak dikenal apa adanya, dan
--                            itu sengaja dicocokkan dengan getDisplayStatus()
--                            di TS (sql/46 §1). 'cancelled' -> 'cancelled'
--                            sudah benar.
--   `guard_payment_columns()` (sql/33) — DENYLIST, bukan allowlist: ia hanya
--                            memblokir transisi yang menyentuh
--                            paid|scheduled|live|completed. Jadi peneliti boleh
--                            menulis 'cancelled' pada order belum lunas, DAN DB
--                            menolaknya pada order lunas. Aturan "hanya admin
--                            yang boleh membatalkan order lunas" ternyata sudah
--                            ditegakkan database. Tidak perlu trigger baru.
--   Penjaga SQL yang menyebut 'cancelled' sebagai order mati (sql/38, 52, 63,
--                            65) — maknanya tetap benar di bawah arti baru.
--
-- ============================================================================
-- PRE-CHECK — jalankan SEBELUM, catat angkanya
-- ============================================================================
--
--   SELECT airing_status_of('cancelled', true)  AS sekarang_salah;  -- 'requested'
--   SELECT count(*) FROM form_submissions WHERE submission_status='cancelled';  -- 2
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='form_submissions'
--      AND column_name IN ('dismissed_at','review_history');        -- 0

BEGIN;

-- ============================================================================
-- 1. Sumbu tayang mengenali pembatalan
-- ============================================================================
-- Ditulis ulang UTUH: CREATE OR REPLACE mengganti seluruh badan fungsi, jadi
-- cabang sql/62 ('slot_cancelled') WAJIB ikut dibawa di sini. Menghilangkannya
-- akan diam-diam memundurkan migrasi sebelumnya.
CREATE OR REPLACE FUNCTION airing_status_of(p_submission_status TEXT, p_has_dates BOOLEAN)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_submission_status IN ('rejected', 'spam') THEN 'cancelled'
    -- sql/62: pembatalan SLOT oleh admin.
    WHEN p_submission_status = 'slot_cancelled' THEN 'cancelled'
    -- sql/69: pembatalan ORDER. Tanpa cabang ini order batal yang punya
    -- tanggal jatuh ke 'requested' dan tampil di papan Schedule seolah
    -- meminta jendela tayang.
    WHEN p_submission_status = 'cancelled' THEN 'cancelled'
    WHEN p_submission_status IN ('waiting_payment', 'paid', 'scheduled', 'live', 'completed')
      THEN p_submission_status
    WHEN p_submission_status = 'slot_reserved' THEN 'slot_reserved'
    WHEN COALESCE(p_has_dates, false) THEN 'requested'
    ELSE 'unscheduled'
  END;
$$;

COMMENT ON FUNCTION airing_status_of(TEXT, BOOLEAN) IS
  'Sumbu tayang saja, dari submission_status + ada/tidaknya tanggal. rejected/spam, slot_cancelled DAN cancelled sama-sama jadi ''cancelled'' — yang membedakannya review_status, bukan kolom ini (sql/46, 62, 69).';

-- ============================================================================
-- 2. Menyembunyikan order jadi kolom, bukan status
-- ============================================================================
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.form_submissions.dismissed_at IS
  'Kapan PEMILIK baris menyingkirkan order ini dari daftarnya. Preferensi tampilan, BUKAN keadaan order — submission_status tidak ikut berubah. Berlaku untuk order mati apa pun (rejected/spam/cancelled). NULL = masih tampil (sql/69).';

-- ============================================================================
-- 3. Riwayat review berhenti menguap
-- ============================================================================
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS review_history JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.form_submissions.review_history IS
  'Jejak keputusan review, terurut lama->baru. Entri: {action, actor, notes, timestamp}. Sebelum sql/69 kolom ini TIDAK ADA dan seluruh penulisannya gagal diam-diam (42703) — riwayat sebelum tanggal itu tidak ada di mana pun.';

-- ============================================================================
-- 4. Dua baris 'cancelled' lama = penyingkiran, bukan pembatalan
-- ============================================================================
-- Keduanya lahir dari `dismissRejectedSubmission`, artinya "disembunyikan".
-- Diberi `dismissed_at` supaya tetap tersembunyi bagi pemiliknya di bawah
-- aturan baru. `submission_status` dibiarkan 'cancelled': keduanya memang order
-- mati, jadi tidak ada yang perlu diluruskan.
--
-- NOL perubahan yang terlihat bagi dua peneliti itu.
UPDATE public.form_submissions
   SET dismissed_at = COALESCE(updated_at, created_at, NOW())
 WHERE submission_status = 'cancelled'
   AND dismissed_at IS NULL;

-- ============================================================================
-- 5. Sinkronkan ulang cermin baris yang terdampak
-- ============================================================================
-- ⚠️ CREATE OR REPLACE FUNCTION TIDAK menjalankan ulang trigger untuk baris
-- yang sudah ada. Tanpa UPDATE ini, cermin `ad_schedules` baris 'cancelled'
-- tetap memakai hasil turunan LAMA ('requested') selamanya, dan verifikasi
-- (3) di bawah akan gagal.
--
-- ⚠️ KOLOM YANG DISENTUH HARUS ADA DI DAFTAR `UPDATE OF` TRIGGERNYA.
-- `trg_ad_schedule_from_submission` menyala pada UPDATE OF start_date, …,
-- submission_status, … — `updated_at` TIDAK ada di daftar itu, jadi menyentuh
-- `updated_at` saja adalah no-op senyap: fungsinya sudah diganti, tapi cermin
-- kedua baris tetap memakai hasil turunan LAMA. (Terjadi saat migrasi ini
-- pertama diterapkan 2026-08-25: uji relasional (3) mengembalikan 2, bukan 0.)
--
-- `submission_status = submission_status` menulis nilai yang sama persis —
-- no-op bagi datanya, tapi cukup untuk membangunkan trigger.
UPDATE public.form_submissions
   SET submission_status = submission_status
 WHERE submission_status = 'cancelled';

COMMIT;

-- ============================================================================
-- VERIFIKASI — jalankan SESUDAH menerapkan, catat angkanya
-- ============================================================================
--
-- (1) Fungsi mengenali pembatalan order — harus 'cancelled', bukan 'requested':
--
--     SELECT airing_status_of('cancelled', true)  AS dgn_tanggal,   -- cancelled
--            airing_status_of('cancelled', false) AS tanpa_tanggal, -- cancelled
--            airing_status_of('slot_cancelled', true) AS slot_msh_ok, -- cancelled
--            review_status_of('cancelled')        AS review;        -- cancelled
--
-- (2) Kedua kolom ada, dan dua baris lama sudah punya dismissed_at:
--
--     SELECT count(*) FILTER (WHERE dismissed_at IS NOT NULL) AS disembunyikan,
--            count(*)                                          AS total_cancelled
--       FROM form_submissions WHERE submission_status = 'cancelled';
--     -- harapan: 2 / 2
--
-- (3) UJI RELASIONAL — cermin diadu dengan sumbernya, bukan dengan angka
--     konstan (pola sql/46 §7). Harus 0:
--
--     SELECT count(*) FROM form_submissions f
--       JOIN ad_schedules s
--         ON s.source_table = 'form_submissions' AND s.source_id = f.id
--      WHERE s.status <> airing_status_of(f.submission_status, f.start_date IS NOT NULL)
--         OR s.review_status <> review_status_of(f.submission_status);
--     -- harapan: 0
--
-- (4) Tidak ada order HIDUP yang ikut tersembunyi tanpa sengaja:
--
--     SELECT count(*) FROM form_submissions
--      WHERE dismissed_at IS NOT NULL
--        AND submission_status NOT IN ('rejected','spam','cancelled');
--     -- harapan: 0
