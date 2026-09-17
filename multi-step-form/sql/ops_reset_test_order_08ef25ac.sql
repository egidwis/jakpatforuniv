-- ============================================================================
-- OPS — reset data UJI order 08ef25ac (GANTENG / tegarerputra@gmail.com)
-- ============================================================================
--
-- Diminta pemilik produk 17 Sep 2026: "hapus hasil testing ku juga boleh, kita
-- mulai testing dari awal saja."
--
-- ⚠️ BUKAN migrasi. Jangan masukkan ke urutan sql/NN. Jalankan sekali, sadar.
--
-- ── APA YANG DIHAPUS ───────────────────────────────────────────────────────
--
-- HANYA jadwal perpanjangan (ordinal >= 2) milik SATU order uji, beserta
-- tagihannya. Terukur sebelum penulisan:
--
--     jadwal ordinal >= 2 .... 9   (8 cancelled, 1 waiting_payment)
--     invoices terkait ....... 7   (0 paid)
--     transactions terkait ... 7   (0 lunas)
--     payment_id berbagi ..... 0   (tidak ada tagihan gabungan)
--
-- ── APA YANG TIDAK DISENTUH ────────────────────────────────────────────────
--
--   * ordinal 1 (16ceea07…, 22 Sep) — LUNAS, iklan sungguhan. Jangan.
--   * order mana pun selain 08ef25ac.
--   * baris ber-status lunas, apa pun ordinalnya (dipagari di WHERE).
--
-- ⚠️ `payment_status` BUKAN bukti pembayaran (memori proyek): sebagian order
-- dibayar di luar sistem. Karena itu penjaga lunas di bawah membaca
-- `transactions`/`invoices` JUGA, bukan hanya kolom status jadwalnya.
--
-- ── URUTAN HAPUS ───────────────────────────────────────────────────────────
-- FK invoices/transactions NO ACTION memblokir penghapusan induk, jadi urutan
-- wajib: transactions → invoices → ad_schedules. Memori proyek:
-- `order-deletion-fk-topology.md`.
-- ============================================================================

BEGIN;

-- Sasaran, dikunci sekali supaya seluruh langkah memakai daftar yang sama.
CREATE TEMP TABLE _sasaran ON COMMIT DROP AS
SELECT s.id AS schedule_id, s.source_id, s.ordinal
FROM ad_schedules s
WHERE s.submission_id = '08ef25ac-6fe3-4df1-b62c-9562446c6635'
  AND s.ordinal >= 2
  -- Penjaga lunas berlapis: jadwal, transaksi, DAN tagihan.
  AND COALESCE(s.payment_status,'') NOT IN ('paid','completed')
  AND COALESCE(s.status,'')         NOT IN ('paid','live','completed')
  AND NOT EXISTS (
        SELECT 1 FROM transactions t
        WHERE t.schedule_id = s.id
          AND t.status IN ('paid','completed','settled'))
  AND NOT EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.schedule_id = s.id
          AND i.status IN ('paid','completed','settled'));

-- Perlihatkan dulu apa yang akan hilang (baca hasilnya sebelum COMMIT).
SELECT 'AKAN DIHAPUS' AS langkah,
       (SELECT count(*) FROM _sasaran) AS jadwal,
       (SELECT count(*) FROM transactions WHERE schedule_id IN (SELECT schedule_id FROM _sasaran)) AS transaksi,
       (SELECT count(*) FROM invoices     WHERE schedule_id IN (SELECT schedule_id FROM _sasaran)) AS tagihan;

DELETE FROM transactions WHERE schedule_id IN (SELECT schedule_id FROM _sasaran);
DELETE FROM invoices     WHERE schedule_id IN (SELECT schedule_id FROM _sasaran);
DELETE FROM ad_schedules WHERE id          IN (SELECT schedule_id FROM _sasaran);

-- Sesudahnya: ordinal 1 HARUS masih berdiri dan tetap lunas.
SELECT 'SESUDAH' AS langkah, ordinal, status, payment_status, start_date::date AS tgl
FROM ad_schedules
WHERE submission_id = '08ef25ac-6fe3-4df1-b62c-9562446c6635'
ORDER BY ordinal;

-- ⚠️ Periksa dua hasil SELECT di atas. Kalau benar: COMMIT. Kalau ragu: ROLLBACK.
COMMIT;
