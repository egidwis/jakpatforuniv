-- ============================================================================
-- 90. Penjaga tumpang tindih berhenti dihalangi jadwal yang sudah MATI
-- ============================================================================
--
-- MASALAHNYA, dilaporkan pemilik produk 2026-09-17 dengan tangkapan layar:
--
--   "Jadwal beririsan dengan jadwal lain survei ini (28 Sep 2026 s/d 30 Sep
--    2026). Satu survei hanya bisa tayang di satu periode pada satu waktu."
--
-- Penolakan itu benar untuk jadwal yang HIDUP. Tapi `assert_schedule_window_free`
-- memakai BLACKLIST satu nilai:
--
--     AND a.status <> 'cancelled'
--
-- sehingga ia masih terhalang oleh:
--
--   1. `status = 'slot_cancelled'` — nilai sah kedua untuk "dibatalkan", dipakai
--      di `schedulePageState` dan `assert_daily_ad_quota_free`. Blacklist satu
--      nilai melewatkannya.
--   2. Jadwal ber-`status='waiting_payment'` yang HOLD 1 JAM-NYA SUDAH LEWAT.
--      Baris ini tidak menahan kuota (quota guard sudah mengecualikannya sejak
--      lama) tapi TETAP menahan jendela. Dua penjaga, dua pendapat.
--   3. Kaki ordinal 1 yang hanya membuang 'rejected','spam' — sementara quota
--      guard membuang enam status, termasuk 'cancelled' dan 'slot_cancelled'.
--
-- Terukur di produksi sebelum perbaikan ini:
--
--   jadwal perpanjangan `waiting_payment` yang hold-nya sudah lewat : 1
--   jadwal perpanjangan ber-status 'cancelled'                      : 8
--
-- ⚠️ ATURANNYA DISALIN, BUKAN DIKARANG. Seluruh saringan di bawah diambil apa
-- adanya dari `assert_daily_ad_quota_free` (sql/86), yang sudah menyelesaikan
-- pertanyaan yang sama persis: "jadwal mana yang masih benar-benar menahan
-- sesuatu?". Dua penjaga yang menjawabnya berbeda adalah cacat, dan sampai
-- berkas ini mereka memang berbeda.
--
--   * allowlist `status IN ('waiting_payment','paid','scheduled','live')`,
--     bukan blacklist — status baru yang belum terpikir akan default ke MATI
--     (tidak menghalangi), bukan ke hidup.
--   * hold peneliti yang belum lunas dan sudah lewat 1 jam tidak menahan apa pun.
--     Ambangnya EKSKLUSIF: tepat di detik tenggat, slotnya masih ditahan.
--
-- ⚠️ YANG TIDAK BERUBAH: jadwal yang masih hidup tetap ditolak. Ini bukan
-- melonggarkan aturan "satu survei satu periode" — ia hanya berhenti menghitung
-- jadwal yang sudah tidak ada sebagai penghalang.
--
-- Idempoten: CREATE OR REPLACE, tanda tangannya tidak berubah.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assert_schedule_window_free(
  p_submission_id uuid,
  p_start timestamp with time zone,
  p_end timestamp with time zone,
  p_exclude_source_id uuid,
  p_check_parent boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conflict RECORD;
BEGIN
  IF p_start IS NULL OR p_end IS NULL THEN RETURN; END IF;

  IF p_check_parent THEN
    SELECT airing_instant_of_date(fs.start_date) AS start_date,
           airing_instant_of_date(fs.end_date)   AS end_date
      INTO v_conflict
    FROM form_submissions fs
    WHERE fs.id = p_submission_id
      AND fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
      -- ⚠️ DISELARASKAN dengan `assert_daily_ad_quota_free` kaki 1. Sebelumnya
      -- hanya ('rejected','spam') — jadi order yang SUDAH DIBATALKAN tetap
      -- menghalangi jadwal barunya sendiri.
      AND fs.submission_status NOT IN
          ('rejected','spam','in_review','completed','cancelled','slot_cancelled')
      -- Hold peneliti yang sudah lewat tidak menahan jendela. Aturan
      -- `holdsSlot()`, sama dengan quota guard.
      AND NOT (
        COALESCE(fs.slot_booked_by,'') = 'user'
        AND COALESCE(fs.payment_status,'pending') NOT IN ('paid','completed')
        AND fs.slot_reserved_at IS NOT NULL
        AND fs.slot_reserved_at < NOW() - INTERVAL '1 hour'
      )
      AND p_start < airing_instant_of_date(fs.end_date)
      AND airing_instant_of_date(fs.start_date) < p_end
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Jadwal beririsan dengan jadwal pertama survei ini (% s/d %). Satu survei hanya bisa tayang di satu periode pada satu waktu.',
        TO_CHAR(v_conflict.start_date,'DD Mon YYYY'), TO_CHAR(v_conflict.end_date,'DD Mon YYYY');
    END IF;
  END IF;

  SELECT a.start_date, a.end_date INTO v_conflict
  FROM ad_schedules a
  WHERE a.submission_id = p_submission_id
    AND a.source_table = 'form_submissions_extend'
    AND (p_exclude_source_id IS NULL OR a.source_id <> p_exclude_source_id)
    -- ⚠️ ALLOWLIST, bukan `<> 'cancelled'`. Blacklist satu nilai melewatkan
    -- 'slot_cancelled', dan akan melewatkan setiap status baru yang ditambahkan
    -- nanti. Identik dengan `assert_daily_ad_quota_free` kaki 2.
    AND a.status IN ('waiting_payment','paid','scheduled','live')
    AND a.start_date IS NOT NULL AND a.end_date IS NOT NULL
    -- ⚠️ INI YANG DILAPORKAN: reservasi yang hold-nya sudah lewat tidak lagi
    -- menahan kuota, jadi ia juga tidak boleh menahan jendela.
    AND NOT (
      COALESCE(a.slot_booked_by,'') = 'user'
      AND COALESCE(a.payment_status,'pending') NOT IN ('paid','completed')
      AND a.slot_reserved_at IS NOT NULL
      AND a.slot_reserved_at < NOW() - INTERVAL '1 hour'
    )
    AND p_start < a.end_date AND a.start_date < p_end
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Jadwal beririsan dengan jadwal lain survei ini (% s/d %). Satu survei hanya bisa tayang di satu periode pada satu waktu.',
      TO_CHAR(v_conflict.start_date,'DD Mon YYYY'), TO_CHAR(v_conflict.end_date,'DD Mon YYYY');
  END IF;
END;
$function$;

-- ============================================================================
-- VERIFIKASI (jalankan manual sesudah menerapkan)
-- ============================================================================
-- -- 1. Jadwal MATI tidak lagi menghalangi (diharapkan: nol baris):
-- SELECT a.booking_id, a.status FROM ad_schedules a
--  WHERE a.source_table='form_submissions_extend'
--    AND a.status NOT IN ('waiting_payment','paid','scheduled','live')
--    AND a.start_date < '2026-10-01' AND a.end_date > '2026-09-27';
--
-- -- 2. Jadwal HIDUP tetap menghalangi — aturannya tidak dilonggarkan:
-- SELECT public.assert_schedule_window_free(
--   (SELECT submission_id FROM ad_schedules WHERE booking_id='GTFBMQ6F'),
--   '2026-09-28 08:00+00','2026-09-30 08:00+00', NULL, false);
-- -- diharapkan: EXCEPTION 'Jadwal beririsan…' (GTFBMQ6F masih waiting_payment
-- -- dan hold-nya belum lewat). Kalau hold-nya SUDAH lewat, ia lolos — dan itu
-- -- memang perilaku yang dibetulkan berkas ini.
