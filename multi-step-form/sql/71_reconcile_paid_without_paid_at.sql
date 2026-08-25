-- ─────────────────────────────────────────────────────────────────────────────
-- sql/71 — lima faktur `paid` tanpa `paid_at` diberi keputusan, bukan disapu
--
-- GEJALA. Lima baris `invoices` berstatus `paid` tanpa `paid_at` sama sekali.
-- Barisnya lunas, tapi tidak bisa dibedakan dari faktur hantu: tidak ada jejak
-- kapan uangnya masuk dan lewat mana.
--
-- ⚠️ MEREKA BUKAN LIMA KEJADIAN TERPISAH. Empat di antaranya residu SATU batch
-- rekonsiliasi yang dijalankan tangan: tepat 5 baris `transactions` berbagi
-- `updated_at = 2026-08-18 17:39:05.219239+00`, semuanya `status='paid'`,
-- semuanya `payment_channel` NULL. (Bandingkan batch 13:54:59 hari yang sama =
-- 611 baris, backfill tabel-luas yang tidak terkait.)
--
-- ⚠️ BATCH DAN HIMPUNAN MASALAH TIDAK IDENTIK — ini koreksi terhadap audit awal.
-- Batch berisi 5 transaksi, tapi salah satunya (`e08559f6…`, Rp 200.000)
-- fakturnya SUDAH punya `paid_at` sejak 2026-01-15 dan karena itu tidak
-- bermasalah. Sebaliknya faktur ke-5 yang bermasalah (`47842448…`, Rp 1.000)
-- TIDAK punya baris `transactions` sama sekali dan bukan bagian batch — ia
-- yatim dari era Mayar. Jadi: 4 residu batch + 1 yatim.
--
-- KEPUTUSAN PEMILIK PRODUK: batch itu BENAR — ia mencocokkan uang yang memang
-- masuk. Yang kurang bukan keputusannya, melainkan JEJAKNYA. Karena itu migrasi
-- ini tidak menyapu rata ke satu arah:
--
--   3 dibatalkan — buktinya berdiri sendiri bahwa uangnya tidak pernah masuk
--                  LEWAT FAKTUR ITU (ada faktur saudara yang lunas asli).
--   2 di-backfill — satu-satunya faktur di jadwalnya, lunas di luar sistem.
--
-- Tidak satu rupiah pun dihapus dari buku selain yang memang tidak pernah masuk.
--
-- Idempotent: setiap pernyataan menyaring keadaan yang diharapkannya, jadi
-- menjalankan ulang tidak mengubah apa pun.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tiga faktur yang dibatalkan
--
-- Bukti per baris (diukur 2026-08-25, semuanya `payment_channel` NULL):
--
--   JFU-INV-234b70-1787035517661  Rp 1.465.200
--     Saudaranya JFU-INV-234b70-1787035348843 bernilai SAMA dan lunas asli:
--     `paid_at` 2026-08-18 06:45:33.55, kanal QRIS_DOKU, txn `completed`.
--     Yang ini lahir 06:45:21.97 — 11,6 detik SEBELUM QRIS itu mendarat. Ia
--     percobaan bayar kedua yang keburu didahului yang pertama.
--
--   JFU-INV-f6b905-1787020850205  Rp 499.500
--     Ditinggalkan, lalu digantikan JFU-INV-f6b905-1787024428997 senilai
--     Rp 1.498.500 yang dibayar VA Mandiri (`paid_at` 2026-08-18 12:22:42.6).
--     Selama ia berstatus lunas, buku KELEBIHAN Rp 499.500. Temuan ini tidak
--     pernah disebut di audit mana pun sebelum 2026-08-25.
--
--   47842448-7828-47df-90f9-ce1d6d812458  Rp 1.000
--     Order uji `059a8df3…` (7 faktur Rp 1.000–5.000). Duplikat dari Rp 1.000
--     yang lunas benar di baris `0629da0a…` (`paid_at` 2025-12-29 09:10:10).
--     Nol baris `transactions` — di luar batch.
--
-- ⚠️ TRANSAKSINYA IKUT DIBATALKAN, BUKAN HANYA FAKTURNYA. Analitik pendapatan
-- membaca `transactions`, BUKAN `total_cost` maupun `invoices` (lihat
-- utils/analytics/campaign.ts). Membatalkan faktur saja akan membiarkan
-- Rp 1.964.700 tetap terhitung sebagai pendapatan — yaitu persis kelebihan yang
-- migrasi ini ada untuk menutupnya.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE invoices
   SET status = 'cancelled'
 WHERE payment_id IN (
         'JFU-INV-234b70-1787035517661',
         'JFU-INV-f6b905-1787020850205',
         '47842448-7828-47df-90f9-ce1d6d812458'
       )
   -- Penjaga idempotensi DAN penjaga keselamatan: kalau seseorang sudah
   -- terlanjur mengisi `paid_at` untuk salah satunya, ia bukan lagi baris yang
   -- diukur di sini dan migrasi ini harus melewatinya, bukan menimpanya.
   AND status  = 'paid'
   AND paid_at IS NULL;

UPDATE transactions
   SET status = 'cancelled'
 WHERE payment_id IN (
         'JFU-INV-234b70-1787035517661',
         'JFU-INV-f6b905-1787020850205'
       )
   AND status = 'paid'
   -- Kanal NULL adalah sidik jari batch tangan itu. Transaksi yang sungguh
   -- lewat gateway SELALU membawa kode kanal asli dari DOKU
   -- (functions/api/doku/webhook.js), jadi syarat ini membuat migrasi mustahil
   -- menyentuh pembayaran gateway yang sah.
   AND payment_channel IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Dua faktur yang diberi jejak
--
--   JFU-INV-f9b73a-1786071412699  Rp 999.000  — satu-satunya faktur di jadwalnya
--   JFU-INV-f6d371-1783483178928  Rp 375.000  — satu-satunya faktur di jadwalnya
--
-- Keduanya tidak punya saudara yang lunas asli, jadi tidak ada bukti "uangnya
-- masuk lewat faktur lain". Batch tangan itu menyatakan keduanya lunas, dan
-- pemilik produk menegaskan pernyataan itu benar.
--
-- ⚠️ `paid_at` DIISI DARI `transactions.created_at`, BUKAN `updated_at`.
-- `updated_at` adalah cap batch 18 Agu — saat seseorang MENCATAT pelunasannya,
-- bukan saat uangnya masuk. Memakainya akan menggeser dua pembayaran Juli &
-- awal Agustus ke 18 Agustus dan merusak laporan bulanan. `now()` lebih buruk
-- lagi: ia mengarang tanggal. Untuk kedua baris ini `invoices.created_at` dan
-- `transactions.created_at` berjarak < 1 detik, jadi keduanya sama-sama jujur.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE invoices i
   SET paid_at = t.created_at
  FROM transactions t
 WHERE t.payment_id = i.payment_id
   AND i.payment_id IN (
         'JFU-INV-f9b73a-1786071412699',
         'JFU-INV-f6d371-1783483178928'
       )
   AND i.status  = 'paid'
   AND i.paid_at IS NULL;

-- ⚠️ KANALNYA `MANUAL_RECONCILED`, SENGAJA BUKAN `MANUAL_VERIFIED`.
--
-- `MANUAL_VERIFIED` adalah nilai yang ditulis `markScheduleAsPaid()`, dan
-- `unmarkScheduleAsPaid()` memakainya sebagai GERBANG — baik di pemanggil
-- (ScheduleCardList) maupun di filter `.eq('payment_channel','MANUAL_VERIFIED')`
-- miliknya sendiri. Memakai ulang nilai itu di sini akan memunculkan tombol
-- "Tandai Belum Lunas" pada dua pelunasan warisan ini, sehingga admin yang tidak
-- tahu asal-usulnya bisa MEMBALIK rekonsiliasi bersejarah dengan satu klik.
--
-- Nilai baru ini juga yang membedakan "dicocokkan belakangan dari bukti di luar
-- sistem" dari "ditandai lunas oleh admin lewat drawer". Keduanya manual;
-- hanya yang kedua yang boleh dibalik dari layar.
UPDATE transactions
   SET payment_channel = 'MANUAL_RECONCILED',
       payment_method  = COALESCE(payment_method, 'manual')
 WHERE payment_id IN (
         'JFU-INV-f9b73a-1786071412699',
         'JFU-INV-f6d371-1783483178928'
       )
   AND status = 'paid'
   AND payment_channel IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Uji relasional
--
-- Gerbangnya invarian, bukan angka: NOL faktur lunas yang tidak bisa menyebut
-- kapan uangnya masuk. Ditulis begini supaya ia tetap bermakna saat data
-- bergerak — "harus 5 baris berubah" akan lulus karena kebetulan lalu
-- berbohong bulan depan.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_ghost   INTEGER;
  v_overpay INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_ghost
    FROM invoices
   WHERE status IN ('paid', 'completed') AND paid_at IS NULL;

  IF v_ghost > 0 THEN
    RAISE EXCEPTION
      'sql/71 GAGAL: masih ada % faktur lunas tanpa paid_at.', v_ghost;
  END IF;

  -- Penjaga kedua: transaksi yang dibatalkan di Bagian 1 tidak boleh tertinggal
  -- berstatus lunas — kalau tertinggal, analitik pendapatan tetap kelebihan.
  SELECT COUNT(*) INTO v_overpay
    FROM transactions
   WHERE payment_id IN (
           'JFU-INV-234b70-1787035517661',
           'JFU-INV-f6b905-1787020850205'
         )
     AND status = 'paid';

  IF v_overpay > 0 THEN
    RAISE EXCEPTION
      'sql/71 GAGAL: % transaksi yang fakturnya dibatalkan masih berstatus paid.', v_overpay;
  END IF;

  RAISE NOTICE 'sql/71 OK — nol faktur lunas tanpa paid_at, nol transaksi yatim berstatus paid.';
END $$;

COMMIT;
