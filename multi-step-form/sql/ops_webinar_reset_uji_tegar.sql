-- ============================================================================
-- ops — HAPUS ORDER UJI WEBINAR MILIK tegar@jakpat.net (3 Nov 2026)
-- ============================================================================
--
-- Tujuan: akun tegar@jakpat.net bisa membeli tiket acara uji `uji-webinar-jfu`
-- lagi. webinar_reserve_seat menolak akun yang sudah punya tiket paid
-- ("already_owned"), jadi ketiga order uji akun ini dihapus:
--
--   WBN-B8F3AAA2-1793698477952  paid       (QRIS Rp 1.110, 3 Nov 16.35 WIB)
--   WBN-2C18A157-1793691831243  cancelled  (DOKU menolak, 3 Nov)
--   WBN-E0452951-1793691794314  cancelled  (DOKU menolak, voucher JFUTGRX)
--
-- Yang SENGAJA tidak dihapus:
--   * transactions ea77d751… (Rp 1.110, entity_type='webinar'): uangnya sungguh
--     masuk ke DOKU, jadi buku tetap mencatatnya supaya cocok dengan settlement.
--     Barisnya berlabel uji lewat note.is_test.
--   * doku_webhook_events untuk invoice itu: log audit.
--   Tidak ada FK ke webinar_orders, jadi keduanya tidak menghalangi penghapusan.
--
-- Pagar: hanya baris milik akun tegar@jakpat.net DAN acara `is_test = true`.
-- Jumlahnya harus tepat 3; selain itu blok dibatalkan tanpa menghapus apa pun.
-- Cadangan disimpan di skema `backup` (bukan `public`, yang punya hibah default anon).


-- ── 1. DRY-RUN (hanya membaca) ─────────────────────────────────────────────

SELECT o.invoice_number, o.status, o.amount, o.voucher_code, o.paid_at, e.slug, e.is_test
FROM public.webinar_orders o
JOIN public.webinar_events e ON e.id = o.event_id
JOIN auth.users u ON u.id = o.auth_user_id
WHERE u.email = 'tegar@jakpat.net'
  AND e.is_test = true
ORDER BY o.created_at;
-- Harapan: 3 baris di atas, semuanya slug uji-webinar-jfu.


-- ── 2. HAPUS (satu blok; batal seluruhnya bila jumlah tidak cocok) ─────────

DO $$
DECLARE
  v_expected constant int := 3;
  v_backup   int;
  v_deleted  int;
BEGIN
  IF to_regclass('backup.webinar_orders_reset_uji_20261103') IS NOT NULL THEN
    RAISE EXCEPTION 'Cadangan sudah ada: skrip ini sudah pernah dijalankan.';
  END IF;

  CREATE TABLE backup.webinar_orders_reset_uji_20261103 AS
  SELECT o.*
  FROM public.webinar_orders o
  JOIN public.webinar_events e ON e.id = o.event_id
  JOIN auth.users u ON u.id = o.auth_user_id
  WHERE u.email = 'tegar@jakpat.net'
    AND e.is_test = true;

  SELECT count(*) INTO v_backup FROM backup.webinar_orders_reset_uji_20261103;
  IF v_backup <> v_expected THEN
    RAISE EXCEPTION 'Diharapkan % order, ditemukan %. Tidak ada yang dihapus.', v_expected, v_backup;
  END IF;

  DELETE FROM public.webinar_orders o
  USING backup.webinar_orders_reset_uji_20261103 b
  WHERE o.id = b.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> v_expected THEN
    RAISE EXCEPTION 'Terhapus % dari % order. Dibatalkan.', v_deleted, v_expected;
  END IF;

  RAISE NOTICE 'Selesai: % order uji dihapus, cadangan di backup.webinar_orders_reset_uji_20261103.', v_deleted;
END $$;


-- ── 3. VERIFIKASI ─────────────────────────────────────────────────────────

SELECT
  (SELECT count(*) FROM public.webinar_orders o JOIN auth.users u ON u.id = o.auth_user_id
     WHERE u.email = 'tegar@jakpat.net')                                        AS order_tegar_tersisa,   -- 0
  (SELECT count(*) FROM backup.webinar_orders_reset_uji_20261103)               AS cadangan,              -- 3
  (SELECT count(*) FROM public.transactions
     WHERE entity_type = 'webinar' AND payment_id = 'WBN-B8F3AAA2-1793698477952') AS transaksi_tetap,     -- 1
  (SELECT (webinar_offer_state(e.*))->>'sold' FROM public.webinar_events e
     WHERE slug = 'uji-webinar-jfu')                                            AS kursi_terjual;         -- 0


-- ── ROLLBACK (hanya bila perlu mengembalikan order) ───────────────────────
-- Gagal bila akun ini sudah membuat order baru yang bentrok dengan index
-- "satu pending per akun per acara"; selesaikan atau hapus order baru itu dulu.
--
-- BEGIN;
-- INSERT INTO public.webinar_orders
-- SELECT * FROM backup.webinar_orders_reset_uji_20261103;
-- SELECT count(*) FROM public.webinar_orders
--   WHERE id IN (SELECT id FROM backup.webinar_orders_reset_uji_20261103);  -- 3
-- COMMIT;
--
-- Membersihkan cadangan setelah yakin tidak dibutuhkan:
-- DROP TABLE backup.webinar_orders_reset_uji_20261103;
