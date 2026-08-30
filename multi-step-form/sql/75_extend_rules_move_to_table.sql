-- ============================================================
-- Migrasi 75: penjaga jadwal ke-2 dst. pindah dari VIEW ke TABEL
--
-- Langkah *contract* Task 11, bagian ketiga — dan ini yang membuat `DROP VIEW`
-- aman.
--
-- ── Masalahnya ────────────────────────────────────────────────────────────
--
-- Trigger `INSTEAD OF UPDATE` view (`extend_view_update`) bukan sekadar penyalin
-- kolom. Ia memikul TIGA penjaga yang tidak ada di tempat lain:
--
--   1. `assert_schedule_window_free` — saat jendela digeser, atau jadwal batal
--      dihidupkan lagi
--   2. `review_status` diturunkan ulang dari order induk (tambahan sql/70)
--   3. `resync_ad_schedule_ordinals` — saat `start_date` berubah
--
-- Selama pemanggilnya menulis LEWAT view, ketiganya ikut. Begitu pemanggil
-- dipindah ke `ad_schedules` (dan nanti view-nya di-DROP), ketiganya HILANG
-- tanpa satu pun error muncul. Terukur: nol trigger di `ad_schedules` yang
-- memanggil `assert_schedule_window_free` atau `resync_ad_schedule_ordinals`.
--
-- Akibat kalau dibiarkan: `updateExtendScheduleDates()` (admin menggeser tanggal
-- jadwal ke-2) berhenti memvalidasi tumpang tindih — padahal larangan "satu
-- survei hanya tayang di satu periode" adalah seluruh alasan `sql/38` ada.
--
-- ── Yang dikerjakan berkas ini ────────────────────────────────────────────
--
-- Memindahkan ketiganya jadi trigger di `ad_schedules`, berpagar
-- `source_table = 'form_submissions_extend'` supaya jadwal ordinal 1 tidak
-- pernah tersentuh.
--
-- ⚠️ Sengaja dijalankan SELAGI view masih ada. Selama itu keduanya menyala
-- berbarengan, dan itu AMAN karena ketiga penjaganya idempoten: `assert_*`
-- hanya membaca, penurunan `review_status` menghasilkan nilai sama, dan
-- `resync_ad_schedule_ordinals` konvergen. Menunggu sampai sesudah `DROP VIEW`
-- justru membuka jendela tanpa penjaga sama sekali.
--
-- Idempoten: `CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS`.
-- Nol perubahan skema, nol perubahan data.
-- ============================================================

-- ============================================
-- 1. Penjaga jendela + sumbu review (BEFORE UPDATE)
-- ============================================

CREATE OR REPLACE FUNCTION public.enforce_extend_schedule_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_review_status TEXT;
BEGIN
  -- Aturan KAPAN divalidasi disalin apa adanya dari `extend_view_update()`:
  -- hanya saat jendelanya dipindah, atau jadwal batal dihidupkan lagi.
  -- Melebarkannya ke setiap UPDATE akan membuat operasi yang tidak menyentuh
  -- tanggal (mis. "Tandai Lunas") ikut ditolak oleh jadwalnya sendiri.
  IF (NEW.start_date IS DISTINCT FROM OLD.start_date
      OR NEW.end_date IS DISTINCT FROM OLD.end_date
      OR (OLD.status = 'cancelled' AND NEW.status <> 'cancelled'))
     AND COALESCE(NEW.status, '') <> 'cancelled'
  THEN
    -- Pengecualiannya lewat `source_id`, bukan `id` — itu kontrak
    -- `assert_schedule_window_free(p_exclude_source_id)`.
    PERFORM assert_schedule_window_free(
      NEW.submission_id, NEW.start_date, NEW.end_date, NEW.source_id, true);
  END IF;

  -- Sumbu review ikut induknya (tambahan sql/70).
  -- COALESCE: induk hilang seharusnya mustahil (ada FK), tapi kalau toh
  -- terjadi, PERTAHANKAN nilai lama — menulis NULL menghapus sumbu review
  -- dan membuat kartunya kehilangan keadaan sama sekali.
  SELECT review_status_of(fs.submission_status)
    INTO v_review_status
    FROM form_submissions fs
   WHERE fs.id = NEW.submission_id;

  NEW.review_status := COALESCE(v_review_status, NEW.review_status);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ad_schedules_extend_rules ON public.ad_schedules;
CREATE TRIGGER trg_ad_schedules_extend_rules
  BEFORE UPDATE ON public.ad_schedules
  FOR EACH ROW
  WHEN (OLD.source_table = 'form_submissions_extend')
  EXECUTE FUNCTION public.enforce_extend_schedule_rules();


-- ============================================
-- 2. Penomoran ulang ordinal (AFTER UPDATE OF start_date)
-- ============================================
--
-- Dipisah jadi AFTER karena `resync_ad_schedule_ordinals()` menulis ke
-- `ad_schedules` — memanggilnya dari BEFORE pada tabel yang sama mengundang
-- perilaku yang sulit ditebak.
--
-- ⚠️ Tidak ada rekursi: pagarnya `UPDATE OF start_date`, sementara resync hanya
-- menyentuh kolom `ordinal`. Trigger no. 1 memang ikut menyala pada tulisan
-- resync, tapi di sana tanggalnya tidak berubah sehingga `assert_*` dilewati.

CREATE OR REPLACE FUNCTION public.resync_ordinals_after_extend_move()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM resync_ad_schedule_ordinals(NEW.submission_id);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ad_schedules_extend_resync ON public.ad_schedules;
CREATE TRIGGER trg_ad_schedules_extend_resync
  AFTER UPDATE OF start_date ON public.ad_schedules
  FOR EACH ROW
  WHEN (OLD.source_table = 'form_submissions_extend'
        AND OLD.start_date IS DISTINCT FROM NEW.start_date)
  EXECUTE FUNCTION public.resync_ordinals_after_extend_move();


-- ============================================
-- 3. Verifikasi
-- ============================================
--
-- (1) Kedua trigger ada dan berpagar benar:
--   SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--   WHERE tgrelid = 'public.ad_schedules'::regclass AND NOT tgisinternal
--   ORDER BY tgname;
--
-- (2) Tumpang tindih DITOLAK lewat tulisan LANGSUNG ke tabel (dulu hanya
--     ditolak lewat view). Ambil satu jadwal ke-2 lalu geser ke jendela yang
--     sudah dipakai jadwal pertama order yang sama:
--
--   BEGIN;
--     UPDATE ad_schedules SET start_date = <jendela ordinal 1>, end_date = <...>
--     WHERE source_table='form_submissions_extend' AND source_id='<uuid>';
--     -- harapan: ERROR 'Jadwal beririsan dengan jadwal pertama survei ini …'
--   ROLLBACK;
--
-- (3) Operasi yang TIDAK menyentuh tanggal tetap lolos (regresi paling mungkin):
--
--   BEGIN;
--     UPDATE ad_schedules SET payment_status='paid'
--     WHERE source_table='form_submissions_extend' AND source_id='<uuid>';
--     -- harapan: sukses, 1 baris
--   ROLLBACK;
--
-- (4) Jadwal ordinal 1 tidak tersentuh trigger ini sama sekali:
--   sidik jari status ordinal 1 wajib tetap
--   cancelled=140, completed=8, live=177, paid=67, requested=482,
--   scheduled=60, slot_reserved=45, unscheduled=26, waiting_payment=1
