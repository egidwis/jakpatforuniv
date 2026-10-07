-- ============================================================================
-- sql/110 — KUOTA HARIAN MENOLAK DI SETIAP PENULISAN JADWAL
-- ============================================================================
--
-- Insiden 6 Okt 2026: tanggal itu menjadi 5/4. Empat jadwal reguler sudah
-- menempatinya (termasuk perpanjangan yang tayang sejak 5 Okt 15.00). Pesanan
-- pertama seorang peneliti tetap tersimpan pukul 12.47 karena ia masuk lewat
-- INSERT form_submissions. `assert_daily_ad_quota_free` (sql/86) hanya
-- dipanggil dari `create_ad_schedule`, yaitu jadwal ke-2 dst.
--
-- Perbaikan ini tidak memindahkan pesanan yang sudah terlanjur 5/4. Ia
-- menutup pintu untuk pesanan BERIKUTNYA.
--
--   1. Kunci transaksi per hari di dalam `assert_daily_ad_quota_free`,
--      sebelum hitungan. Dua simpanan bersamaan tidak bisa sama-sama
--      melihat "masih ada kursi".
--   2. Trigger BEFORE pada `ad_schedules` memanggil penjaga yang sama
--      setiap kali jendela yang MENAHAN kuota ditulis atau digeser.
--      Sync dari form_submissions (jadwal pertama), geser tanggal admin,
--      dan ubah tanggal perpanjangan semuanya mendarat di tabel ini.
--
-- Yang SENGAJA tidak ditolak ulang:
--   pembaruan yang tidak mengubah jendela (bayar, status live, catatan).
--   Baris yang sudah 5/4 tetap bisa dilunasi. Yang ditolak adalah menulis
--   jendela BARU ke hari yang sudah penuh.
--
-- ⚠️ KOREKSI 7 Okt 2026: klaim di atas SALAH untuk jadwal pertama (ordinal 1).
--   Sync dari form_submissions memakai INSERT … ON CONFLICT DO UPDATE, jadi
--   BEFORE INSERT menyala di SETIAP sinkron (TG_OP='INSERT') dan pengecualian
--   "jendela tidak berubah" tidak pernah berlaku. NEW juga tidak membawa
--   is_extra_ad (default false), sehingga iklan tambahan dicek ke kolam reguler.
--   Akibatnya bayar/catatan admin pada baris di hari yang sudah penuh GAGAL.
--   Diganti oleh sql/111 (trigger AFTER, hanya hari baru yang dicek).
--
-- Kilat tidak kena: penjaga kuota harian memang mengembalikan sukses untuk
-- distribution_type = 'kilat' (kolamnya per gelombang, bukan per hari).
--
-- Idempoten. Jalankan di SQL Editor Supabase. Jangan lewat MCP.
-- ============================================================================

-- ============================================================================
-- DRY-RUN — jalankan ini DULU. Hanya SELECT. Tidak menulis apa pun.
-- Harapan: 6 Okt 2026 muncul dengan regular > 4. Hari lain yang juga
-- tembus kuota ikut terlihat. Trigger di bawah TIDAK akan mengosongkannya.
-- ============================================================================
--
-- WITH occ AS (
--   SELECT fs.id AS source_id,
--          airing_instant_of_date(fs.start_date) AS sd,
--          airing_instant_of_date(fs.end_date)   AS ed,
--          fs.slot_booked_by, fs.slot_reserved_at, fs.payment_status,
--          COALESCE(a.is_extra_ad, false) AS is_extra
--   FROM form_submissions fs
--   JOIN ad_schedules a
--     ON a.source_table = 'form_submissions' AND a.source_id = fs.id
--   WHERE fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
--     AND fs.submission_status NOT IN
--         ('rejected','spam','in_review','completed','cancelled','slot_cancelled')
--     AND fs.distribution_type = 'regular'
--   UNION ALL
--   SELECT a.source_id, a.start_date, a.end_date,
--          a.slot_booked_by, a.slot_reserved_at, a.payment_status,
--          COALESCE(a.is_extra_ad, false)
--   FROM ad_schedules a
--   JOIN form_submissions fs ON fs.id = a.submission_id
--   WHERE a.source_table = 'form_submissions_extend'
--     AND a.start_date IS NOT NULL AND a.end_date IS NOT NULL
--     AND a.status IN ('waiting_payment','paid','scheduled','live')
--     AND fs.distribution_type IS NOT DISTINCT FROM 'regular'
-- ), held AS (
--   SELECT * FROM occ
--   WHERE NOT (
--     COALESCE(slot_booked_by,'') = 'user'
--     AND COALESCE(payment_status,'pending') NOT IN ('paid','completed')
--     AND slot_reserved_at IS NOT NULL
--     AND slot_reserved_at < NOW() - INTERVAL '1 hour'
--   )
-- )
-- SELECT (gs)::date AS hari,
--        COUNT(*) FILTER (WHERE NOT h.is_extra) AS regular,
--        COUNT(*) FILTER (WHERE h.is_extra)     AS tambahan
-- FROM held h
-- CROSS JOIN LATERAL generate_series(
--        (h.sd AT TIME ZONE 'Asia/Jakarta')::date,
--        (h.ed AT TIME ZONE 'Asia/Jakarta')::date - 1,
--        '1 day') AS gs
-- GROUP BY 1
-- HAVING COUNT(*) FILTER (WHERE NOT h.is_extra) > max_regular_ads_per_day()
--     OR COUNT(*) FILTER (WHERE h.is_extra)     > max_extra_ads_per_day()
-- ORDER BY 1;

BEGIN;

-- ── 1. Kunci per hari, lalu hitung ──────────────────────────────────────────
-- Tubuhnya sama dengan sql/86. Satu-satunya tambahan adalah
-- pg_advisory_xact_lock SEBELUM COUNT, urut tanggal naik, supaya dua
-- transaksi yang memesan rentang bertindihan mengantre dengan urutan yang
-- sama dan tidak deadlock. Kunci dilepas saat transaksi selesai.
CREATE OR REPLACE FUNCTION public.assert_daily_ad_quota_free(
  p_start             TIMESTAMPTZ,
  p_end               TIMESTAMPTZ,
  p_is_extra_ad       BOOLEAN,
  p_distribution_type TEXT,
  p_exclude_source_id UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_quota  INTEGER;
  v_day    DATE;
  v_full   RECORD;
BEGIN
  IF p_start IS NULL OR p_end IS NULL THEN RETURN; END IF;

  -- Kilat punya kolam gelombangnya sendiri (8/11/14/17 WIB, 2 order/gelombang)
  -- dan TIDAK diatur kuota harian ini. Penjadwalan swalayan menolak Kilat lebih
  -- dulu di create_ad_schedule(), jadi cabang ini hanya melindungi pemanggil lain.
  IF p_distribution_type = 'kilat' THEN RETURN; END IF;

  v_quota := CASE WHEN COALESCE(p_is_extra_ad, false)
                  THEN max_extra_ads_per_day()
                  ELSE max_regular_ads_per_day() END;

  -- Akhir-EKSKLUSIF: hari `end_date` adalah hari serah-terima, bukan hari tayang.
  -- Hari dihitung menurut kalender WIB, bukan UTC — sebuah jendela yang mulai
  -- 15.00 WIB adalah 08:00 UTC di tanggal yang sama.
  FOR v_day IN
    SELECT generate_series(
             (p_start AT TIME ZONE 'Asia/Jakarta')::date,
             (p_end   AT TIME ZONE 'Asia/Jakarta')::date - 1,
             '1 day')::date
  LOOP
    -- Satu kunci per (kolam, tanggal). Transaksi yang sudah memegang kunci
    -- yang sama (create_ad_schedule lalu trigger) tidak mengantre dirinya.
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'ad-quota|' || COALESCE(p_distribution_type, '') || '|'
      || CASE WHEN COALESCE(p_is_extra_ad, false) THEN 'extra' ELSE 'regular' END
      || '|' || to_char(v_day, 'YYYY-MM-DD'),
      0::bigint
    ));

    SELECT COUNT(*) AS n INTO v_full
    FROM (
      -- Kaki 1 — jadwal ordinal 1. Saringan status identik dengan
      -- get_submission_slot_occupancy().
      SELECT fs.id AS source_id,
             airing_instant_of_date(fs.start_date) AS sd,
             airing_instant_of_date(fs.end_date)   AS ed,
             fs.slot_booked_by, fs.slot_reserved_at, fs.payment_status,
             COALESCE(a.is_extra_ad, false) AS is_extra
      FROM form_submissions fs
      JOIN ad_schedules a
        ON a.source_table = 'form_submissions' AND a.source_id = fs.id
      WHERE fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
        AND fs.submission_status NOT IN
            ('rejected','spam','in_review','completed','cancelled','slot_cancelled')
        AND fs.distribution_type = p_distribution_type

      UNION ALL

      -- Kaki 2 — jadwal ke-2 dst. Saringan status identik dengan
      -- get_extend_slot_occupancy().
      SELECT a.source_id, a.start_date, a.end_date,
             a.slot_booked_by, a.slot_reserved_at, a.payment_status,
             COALESCE(a.is_extra_ad, false)
      FROM ad_schedules a
      JOIN form_submissions fs ON fs.id = a.submission_id
      WHERE a.source_table = 'form_submissions_extend'
        AND a.start_date IS NOT NULL AND a.end_date IS NOT NULL
        AND a.status IN ('waiting_payment','paid','scheduled','live')
        AND fs.distribution_type IS NOT DISTINCT FROM p_distribution_type
    ) occ
    WHERE occ.is_extra = COALESCE(p_is_extra_ad, false)
      AND (p_exclude_source_id IS NULL OR occ.source_id <> p_exclude_source_id)
      AND v_day >= (occ.sd AT TIME ZONE 'Asia/Jakarta')::date
      AND v_day <  (occ.ed AT TIME ZONE 'Asia/Jakarta')::date
      -- Aturan pelepasan holdsSlot(): hold peneliti yang belum lunas dan sudah
      -- lewat 1 jam TIDAK LAGI menahan kapasitas. Ambang eksklusif — tepat di
      -- detik tenggat, slotnya masih ditahan.
      AND NOT (
        COALESCE(occ.slot_booked_by,'') = 'user'
        AND COALESCE(occ.payment_status,'pending') NOT IN ('paid','completed')
        AND occ.slot_reserved_at IS NOT NULL
        AND occ.slot_reserved_at < NOW() - INTERVAL '1 hour'
      );

    IF v_full.n >= v_quota THEN
      RAISE EXCEPTION
        'Kuota iklan % pada % sudah penuh (% dari %). Pilih tanggal lain.',
        CASE WHEN COALESCE(p_is_extra_ad,false) THEN 'tambahan' ELSE 'reguler' END,
        TO_CHAR(v_day, 'DD Mon YYYY'), v_full.n, v_quota;
    END IF;
  END LOOP;
END;
$fn$;

COMMENT ON FUNCTION public.assert_daily_ad_quota_free(timestamptz, timestamptz, boolean, text, uuid) IS
  'Menolak jendela tayang yang melewati kuota harian. Mencerminkan holdsSlot() + '
  'fetchSlotAvailability() — dua kaki occupancy, hold lepas tidak dihitung, '
  'akhir-eksklusif, kolam extra terpisah. Sejak sql/110 mengunci hari yang '
  'sedang dicek (pg_advisory_xact_lock) sebelum hitungan, dan dipanggil juga '
  'oleh trigger trg_ad_schedules_daily_quota, bukan hanya create_ad_schedule.';

-- ── 2. Apakah baris ini sedang menahan kuota harian? ────────────────────────
-- Daftar statusnya disalin dari saringan di dalam assert_daily_ad_quota_free,
-- bukan aturan baru. `requested` / `completed` / `cancelled` tidak menahan:
-- menyelesaikan atau membatalkan jadwal tidak boleh ditolak hanya karena
-- harinya sudah penuh.
CREATE OR REPLACE FUNCTION public.ad_schedule_occupies_daily_quota(p_row ad_schedules)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $occ$
  SELECT p_row.start_date IS NOT NULL
     AND p_row.end_date IS NOT NULL
     AND COALESCE(p_row.distribution_type, '') <> 'kilat'
     AND CASE
           WHEN p_row.source_table = 'form_submissions_extend' THEN
             p_row.status IN ('waiting_payment','paid','scheduled','live')
           ELSE
             p_row.status IN ('waiting_payment','paid','scheduled','live','slot_reserved')
         END;
$occ$;

COMMENT ON FUNCTION public.ad_schedule_occupies_daily_quota(ad_schedules) IS
  'True bila baris ad_schedules ini masuk hitungan assert_daily_ad_quota_free. '
  'Dipakai trigger sql/110 supaya pembayaran dan perubahan status pada jendela '
  'yang sama tidak ditolak ulang.';

REVOKE ALL ON FUNCTION public.ad_schedule_occupies_daily_quota(ad_schedules) FROM PUBLIC, anon, authenticated;

-- ── 3. Trigger ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_daily_ad_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $trg$
BEGIN
  IF NOT public.ad_schedule_occupies_daily_quota(NEW) THEN
    RETURN NEW;
  END IF;

  -- Jendela dan kolamnya tidak berubah, dan baris lama pun sudah menahan
  -- kuota. Pembaruan bayar / live / catatan boleh lewat, termasuk pada hari
  -- yang sudah terlanjur 5/4.
  IF TG_OP = 'UPDATE'
     AND public.ad_schedule_occupies_daily_quota(OLD)
     AND OLD.start_date IS NOT DISTINCT FROM NEW.start_date
     AND OLD.end_date IS NOT DISTINCT FROM NEW.end_date
     AND COALESCE(OLD.is_extra_ad, false) IS NOT DISTINCT FROM COALESCE(NEW.is_extra_ad, false)
     AND OLD.distribution_type IS NOT DISTINCT FROM NEW.distribution_type
  THEN
    RETURN NEW;
  END IF;

  PERFORM public.assert_daily_ad_quota_free(
    NEW.start_date,
    NEW.end_date,
    COALESCE(NEW.is_extra_ad, false),
    NEW.distribution_type,
    NEW.source_id
  );
  RETURN NEW;
END;
$trg$;

COMMENT ON FUNCTION public.enforce_daily_ad_quota() IS
  'BEFORE INSERT/UPDATE ad_schedules. Menolak jendela baru yang menembus kuota '
  'harian. source_id sendiri dikecualikan supaya geser tanggal tidak dihitung '
  'sebagai pesaing dirinya. sql/110.';

REVOKE ALL ON FUNCTION public.enforce_daily_ad_quota() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ad_schedules_daily_quota ON public.ad_schedules;
CREATE TRIGGER trg_ad_schedules_daily_quota
  BEFORE INSERT OR UPDATE OF start_date, end_date, status, is_extra_ad, distribution_type
  ON public.ad_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_daily_ad_quota();

COMMIT;

-- ============================================================================
-- VERIFIKASI — jalankan sesudah COMMIT.
-- ============================================================================
--
-- SELECT tgname, pg_get_triggerdef(oid)
-- FROM pg_trigger
-- WHERE tgname = 'trg_ad_schedules_daily_quota' AND NOT tgisinternal;
-- -- diharapkan: 1 baris, BEFORE INSERT OR UPDATE OF start_date, end_date, ...
--
-- -- Hari yang sudah 4/4 harus ditolak. Ganti tanggalnya bila 6 Okt sudah lewat.
-- SELECT public.assert_daily_ad_quota_free(
--   '2026-10-06T08:00:00Z'::timestamptz,
--   '2026-10-07T08:00:00Z'::timestamptz,
--   false, 'regular', NULL);
-- -- diharapkan: EXCEPTION "... sudah penuh (4 dari 4)" atau lebih
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_ad_schedules_daily_quota ON public.ad_schedules;
-- DROP FUNCTION IF EXISTS public.enforce_daily_ad_quota();
-- DROP FUNCTION IF EXISTS public.ad_schedule_occupies_daily_quota(ad_schedules);
-- -- Kunci per hari ikut hidup di assert_daily_ad_quota_free. Untuk
-- -- mengembalikan tubuh persis sql/86 (tanpa pg_advisory_xact_lock),
-- -- terapkan ulang bagian 2 berkas sql/86.
-- COMMIT;
