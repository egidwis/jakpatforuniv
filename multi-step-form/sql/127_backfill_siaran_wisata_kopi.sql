-- ============================================================================
-- sql/127 — BACKFILL SIARAN SATU GELOMBANG KILAT YANG JATUH DI CELAH RILIS
-- ============================================================================
--
-- Order #a4582981 "Wisata Kopi" (lunas), gelombang 15 Okt 2026 14.00 WIB
-- (ad_schedules 215c5ade…, [15 Okt 07:00Z, 16 Okt 07:00Z)).
--
-- Kenapa ada: backfill U8 sql/118 hanya mengisi gelombang lunas yang SUDAH
-- selesai saat migrasi dijalankan — gelombang ini belum. Toggle siaran (R4)
-- baru ada di produksi sejak Push A (25 Okt), jadi di antaranya gelombang ini
-- tak pernah bisa ditandai dan `broadcast_at` tetap NULL. Akibatnya badge tab
-- Kilat menghitungnya sebagai "menunggu siaran" selamanya (dibetulkan juga di
-- kode: `awaitsBroadcast` berhenti menghitung jendela yang sudah habis).
--
-- ── PERILAKU SESUDAH BERKAS INI ─────────────────────────────────────────────
--
--   Baris itu diisi persis seperti U8 sql/118: broadcast_at = start,
--   broadcast_ended_at = end, *_by = 'backfill'. Jendela undian TIDAK berubah:
--   airing_window_end(start, end, start, end) = LEAST(start + (end − start),
--   end) = end — sama dengan sebelum backfill (belum disiarkan → end).
--
--   Penjaga kolom siaran (U6 sql/118) dan pintu jadwal (sql/124) melewatkan
--   tulisan tanpa JWT, jadi berkas ini dijalankan di SQL Editor.
--
-- ── URUTAN ──────────────────────────────────────────────────────────────────
--
--   Langkah 1 (pra-cek) → Langkah 2 (migrasi) → Langkah 3 (verifikasi).
--   Jalankan di SQL Editor Supabase. JANGAN lewat MCP. Tidak bergantung pada
--   deploy kode mana pun.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — PRA-CEK (baca saja)
-- ============================================================================
--
-- 1a. Kandidat = SATU baris ini saja (aturan U8, dibaca 26 Okt 2026).
--     Harapan: 1 baris, id 215c5ade-95b3-4175-a2a7-6f75f54a6c87,
--     submission a4582981-…, payment_status paid, broadcast_at NULL.
--     Lebih dari satu baris = BERHENTI, kabari dulu.
--
-- SELECT id, submission_id, start_date, end_date, payment_status, broadcast_at
-- FROM public.ad_schedules
-- WHERE distribution_type = 'kilat'
--   AND start_date IS NOT NULL
--   AND end_date <= now()
--   AND (payment_status IN ('paid', 'completed') OR air_on_credit_at IS NOT NULL)
--   AND broadcast_at IS NULL;
--
-- 1b. Jendela undian sebelum backfill — dicatat untuk dibandingkan di 3b.
--     Harapan: 2026-10-16 07:00:00+00.
--
-- SELECT airing_window_end(start_date, end_date, broadcast_at, broadcast_ended_at) AS selesai
-- FROM public.ad_schedules WHERE id = '215c5ade-95b3-4175-a2a7-6f75f54a6c87';


-- ============================================================================
-- LANGKAH 2 — MIGRASI (satu transaksi)
-- ============================================================================

BEGIN;

UPDATE public.ad_schedules
   SET broadcast_at       = start_date,
       broadcast_by       = 'backfill',
       broadcast_ended_at = end_date,
       broadcast_ended_by = 'backfill'
 WHERE id = '215c5ade-95b3-4175-a2a7-6f75f54a6c87'
   AND distribution_type = 'kilat'
   AND end_date <= now()
   AND payment_status IN ('paid', 'completed')
   AND broadcast_at IS NULL;

-- Tepat satu baris, atau batal seluruhnya.
DO $cek$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.ad_schedules
  WHERE id = '215c5ade-95b3-4175-a2a7-6f75f54a6c87' AND broadcast_by = 'backfill';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'sql/127: harapan 1 baris ter-backfill, dapat %', v_n;
  END IF;
END
$cek$;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja)
-- ============================================================================
--
-- 3a. Tidak ada lagi gelombang Kilat lunas lampau yang belum ditandai.
--     Harapan: 0.
--
-- SELECT count(*) FROM public.ad_schedules
-- WHERE distribution_type = 'kilat' AND start_date IS NOT NULL AND end_date <= now()
--   AND (payment_status IN ('paid', 'completed') OR air_on_credit_at IS NOT NULL)
--   AND broadcast_at IS NULL;
--
-- 3b. Jendela undian TIDAK berubah. Harapan: sama dengan 1b
--     (2026-10-16 07:00:00+00), broadcast_by = backfill.
--
-- SELECT broadcast_at, broadcast_by, broadcast_ended_at, broadcast_ended_by,
--        airing_window_end(start_date, end_date, broadcast_at, broadcast_ended_at) AS selesai
-- FROM public.ad_schedules WHERE id = '215c5ade-95b3-4175-a2a7-6f75f54a6c87';


-- ============================================================================
-- ROLLBACK — hanya bila perlu
-- ============================================================================
--
-- Mengembalikan baris ke keadaan 26 Okt 2026 (keempat kolom NULL). Dengan kode
-- baru (`awaitsBroadcast` tanpa jendela habis) badge tetap tidak menghitungnya.
--
-- BEGIN;
-- UPDATE public.ad_schedules
--    SET broadcast_at = NULL, broadcast_by = NULL,
--        broadcast_ended_at = NULL, broadcast_ended_by = NULL
--  WHERE id = '215c5ade-95b3-4175-a2a7-6f75f54a6c87'
--    AND broadcast_by = 'backfill';
-- COMMIT;
