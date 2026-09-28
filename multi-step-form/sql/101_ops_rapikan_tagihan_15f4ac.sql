-- ============================================================================
-- 101 — OPS SEKALI JALAN: rapikan baris tagihan gabungan mati JFU-INV-15f4ac
-- ============================================================================
--
-- Konteks (28 Sep 2026)
-- ---------------------
-- Tagihan gabungan JFU-INV-15f4ac-1790216577586 (4 jadwal, Rp 2.031.300) mati
-- 28 Sep 13.59 WIB. Solusi cepat admin:
--   • tagihan baru Rp 2.031.300 di WH265TVZ saja
--     (JFU-INV-15f4ac-1790588069960, hidup s/d 30 Sep 13.59 WIB);
--   • tiga jadwal lain "Tandai Lunas" (J8AXQVCF sudah, QE8KND8B & RWJJAARF menyusul).
--
-- Masalahnya: `markScheduleAsPaid` mengubah baris `pending`/`expired` MILIK
-- JADWAL ITU menjadi `paid` (supabase.ts:910-924). Sebelum fitur bulk, jadwal
-- yang ditandai lunas tidak punya baris tagihan, jadi nol baris tersentuh.
-- Sekarang ketiganya masih memegang porsi tagihan gabungan yang mati, jadi
-- porsinya ikut tercatat LUNAS tanpa uang:
--   J8AXQVCF 527.250 (sudah) + QE8KND8B 488.400 + RWJJAARF 527.250
--   = Rp 1.542.900 pendapatan fiktif, DI ATAS Rp 2.031.300 yang nanti benar-benar
--   dibayar lewat WH265TVZ.
--
-- Berkas ini menutup SEMUA baris tagihan gabungan lama yang belum tertutup:
-- invoices DAN transactions → 'cancelled' (paid_at invoice dikosongkan).
-- Setelah itu "Tandai Lunas" pada QE8KND8B/RWJJAARF menyentuh nol baris uang,
-- persis seperti cara lama sebelum bulk.
--
-- ⚠️ 'cancelled', BUKAN 'expired' — juga untuk transactions. `markScheduleAsPaid`
-- mengubah baris `pending` DAN `expired` menjadi `paid`. Transaksi yang ditutup
-- sebagai 'expired' akan dihidupkan lagi sebagai pendapatan fiktif oleh
-- "Tandai Lunas" berikutnya. Termasuk baris WH265TVZ lama yang sudah 'expired'.
--
-- AMAN UNTUK HALAMAN IKLAN: tidak ada trigger di invoices/transactions yang
-- menulis ke form_submissions (diverifikasi pg_trigger 28 Sep: hanya
-- derive_schedule_id, penjaga kolom pemilik, dan timestamp). Status lunas
-- J8AXQVCF di form_submissions TIDAK disentuh → halamannya tetap tayang.
--
-- Boleh dijalankan SEBELUM atau SESUDAH QE8KND8B/RWJJAARF ditandai lunas;
-- keduanya ditangani.
--
-- ⚠️ JANGAN sentuh JFU-INV-15f4ac-1790588069960 — itu tagihan yang hidup.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — DRY-RUN (jalankan dulu, baca hasilnya)
-- ============================================================================
-- Harapan: 4 baris invoices + 4 baris transactions, semua payment_id ...577586.
--   J8AXQVCF  paid (inv & txn MANUAL_VERIFIED)
--   QE8KND8B  pending  (atau paid kalau sudah ditandai lunas)
--   RWJJAARF  pending  (atau paid kalau sudah ditandai lunas)
--   WH265TVZ  inv cancelled (TIDAK diubah) / txn expired (DIUBAH → cancelled)
-- Yang akan diubah = baris dengan akan_diubah = true (harapan: 3 inv + 4 txn).
--
-- SELECT 'inv' AS src, s.booking_id, i.id, i.amount, i.status, i.paid_at,
--        i.status <> 'cancelled' AS akan_diubah
--   FROM invoices i JOIN ad_schedules s ON s.id = i.schedule_id
--  WHERE i.payment_id = 'JFU-INV-15f4ac-1790216577586'
-- UNION ALL
-- SELECT 'txn', s.booking_id, t.id, t.amount, t.status || ' / ' || coalesce(t.payment_channel,''), NULL,
--        t.status <> 'cancelled'
--   FROM transactions t JOIN ad_schedules s ON s.id = t.schedule_id
--  WHERE t.payment_id = 'JFU-INV-15f4ac-1790216577586'
-- ORDER BY 2, 1;


-- ============================================================================
-- LANGKAH 2 — MIGRASI
-- ============================================================================
BEGIN;

-- Snapshot jalan-pulang di skema `backup` (BUKAN public — CTAS tak mewarisi RLS
-- dan default privileges memberi anon hak penuh di public).
CREATE TABLE backup.inv_15f4ac_20260928 AS
  SELECT * FROM public.invoices
   WHERE payment_id = 'JFU-INV-15f4ac-1790216577586';
CREATE TABLE backup.txn_15f4ac_20260928 AS
  SELECT * FROM public.transactions
   WHERE payment_id = 'JFU-INV-15f4ac-1790216577586';
REVOKE ALL ON backup.inv_15f4ac_20260928, backup.txn_15f4ac_20260928
  FROM PUBLIC, anon, authenticated;
ALTER TABLE backup.inv_15f4ac_20260928 ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup.txn_15f4ac_20260928 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_inv int;
  n_txn int;
BEGIN
  -- ⚠️ `invoices` TIDAK punya updated_at.
  UPDATE public.invoices
     SET status = 'cancelled', paid_at = NULL
   WHERE payment_id = 'JFU-INV-15f4ac-1790216577586'
     AND status <> 'cancelled';
  GET DIAGNOSTICS n_inv = ROW_COUNT;

  UPDATE public.transactions
     SET status = 'cancelled', updated_at = now()
   WHERE payment_id = 'JFU-INV-15f4ac-1790216577586'
     AND status <> 'cancelled';
  GET DIAGNOSTICS n_txn = ROW_COUNT;

  RAISE NOTICE 'invoices ditutup: %, transactions ditutup: %', n_inv, n_txn;

  -- Harapan 3 inv (J8AXQVCF, QE8KND8B, RWJJAARF) + 4 txn (ketiganya + WH265TVZ
  -- yang 'expired'). Selain itu = berhenti.
  IF n_inv <> 3 OR n_txn <> 4 THEN
    RAISE EXCEPTION 'Jumlah baris tak sesuai harapan (inv=%, txn=%). Dibatalkan — laporkan dulu.', n_inv, n_txn;
  END IF;

  -- Tagihan yang hidup tidak boleh ikut tersentuh.
  IF NOT EXISTS (SELECT 1 FROM public.invoices
                  WHERE payment_id = 'JFU-INV-15f4ac-1790588069960'
                    AND status = 'pending') THEN
    RAISE EXCEPTION 'Tagihan hidup ...069960 tidak lagi pending — periksa sebelum lanjut.';
  END IF;
END $$;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (sesudah COMMIT)
-- ============================================================================
-- 1. Nol baris lunas tersisa di tagihan gabungan lama (harapan: 0):
-- SELECT count(*) FROM invoices
--  WHERE payment_id = 'JFU-INV-15f4ac-1790216577586' AND status = 'paid';
--
-- 2. Halaman J8AXQVCF tetap terbuka (harapan: publish_end_date di masa depan
--    atau NULL, auto_closed_at NULL):
-- SELECT sp.slug, sp.publish_start_date, sp.publish_end_date, sp.auto_closed_at
--   FROM survey_pages sp
--   JOIN ad_schedules s ON s.submission_id = sp.submission_id
--  WHERE s.booking_id = 'J8AXQVCF';
--
-- 3. Tagihan hidup utuh (harapan: 1 baris pending Rp 2.031.300):
-- SELECT amount, status, expires_at FROM invoices
--  WHERE payment_id = 'JFU-INV-15f4ac-1790588069960';


-- ============================================================================
-- ROLLBACK (hanya kalau perlu) — pulihkan persis dari snapshot
-- ============================================================================
-- BEGIN;
-- UPDATE public.invoices i
--    SET status = b.status, paid_at = b.paid_at
--   FROM backup.inv_15f4ac_20260928 b
--  WHERE i.id = b.id;
-- UPDATE public.transactions t
--    SET status = b.status, updated_at = now()
--   FROM backup.txn_15f4ac_20260928 b
--  WHERE t.id = b.id;
-- COMMIT;
--
-- Snapshot boleh di-DROP setelah WH265TVZ lunas dan tenang satu siklus:
-- DROP TABLE backup.inv_15f4ac_20260928, backup.txn_15f4ac_20260928;
