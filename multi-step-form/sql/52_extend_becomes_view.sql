-- 52_extend_becomes_view.sql
-- Date: 2026-08-19  ·  Task 11 Deploy B
--
-- `form_submissions_extend` berhenti jadi tabel dan menjadi VIEW di atas
-- `ad_schedules`. Sesudah ini `ad_schedules` OTORITATIF untuk jadwal ke-2 dst.;
-- jadwal ke-1 masih dicerminkan dari `form_submissions` (di luar cakupan).
--
-- ⚠️ SATU-SATUNYA LANGKAH TASK 11 YANG TIDAK REVERSIBEL DENGAN MUDAH.
-- Jangan dibundel dengan perubahan lain. Bagian 1 membuat snapshot; itu satu-
-- satunya jalan pulang kalau ada yang meleset.
--
-- GERBANG (dijalankan 2026-08-19, semuanya hijau):
--   uji paritas sql/46 §7 ............... 0 di ketujuh kolom
--   sidik jari 15 baris SEBELUM ......... 1798a75e9750611d14178e45be2387ef
--   proyeksi ad_schedules yang sama ..... 1798a75e9750611d14178e45be2387ef  <- IDENTIK
-- Sidik jari itu dihitung dengan mengadu `form_submissions_extend` dengan
-- SELECT yang persis akan jadi badan view-nya, SEBELUM apa pun dihapus. Jadi
-- bentuk view di bagian 5 bukan harapan — ia sudah dibuktikan.
--
-- ============================================================================
-- TEMUAN YANG TIDAK ADA DI RENCANA — baca sebelum menerapkan
-- ============================================================================
--
-- (a) ASIMETRI RLS — DIPERKETAT DI RILIS INI (keputusan pemilik produk
--     2026-08-19). `form_submissions_extend` hari ini: `authenticated` boleh
--     SELECT/INSERT/UPDATE/DELETE dengan `qual = true` — siapa pun yang login
--     bisa membaca & menulis baris siapa pun, termasuk kolom uang dan
--     admin_notes milik order orang lain. `ad_schedules`: SELECT saja, hanya
--     "pemilik atau admin".
--
--     View ini `security_invoker = true`, jadi bacaannya TUNDUK RLS
--     `ad_schedules`: peneliti hanya melihat jadwalnya sendiri, admin
--     (`product@jakpat.net`) melihat semua, `service_role` melihat semua.
--     Ini PENGETATAN, bukan penjagaan perilaku — disengaja.
--
--     ⚠️ Efek sampingnya menjalar ke TULISAN, dan itu justru diinginkan:
--     sebelum `INSTEAD OF` menyala, Postgres harus meng-SELECT baris yang
--     cocok untuk membentuk OLD. SELECT itu berjalan sebagai pemanggil, jadi
--     seseorang hanya bisa MENG-UPDATE/HAPUS baris yang boleh ia LIHAT.
--
--     Prasyarat yang sudah diverifikasi sebelum menerapkan: `ad_schedules`
--     dimiliki `postgres`, `postgres` punya BYPASSRLS, dan `force_rls` mati —
--     sehingga fungsi SECURITY DEFINER di bagian 6 tetap bisa menulis. Kalau
--     salah satu prasyarat itu berubah, tulisan lewat view akan mati SENYAP.
--
-- (b) ⚠️ `anon` TIDAK BOLEH DIBERI GRANT DI VIEW INI. Di tabel lama `anon`
--     punya GRANT DML penuh tapi RLS memblokirnya (tidak ada policy `anon`).
--     Lewat view + `INSTEAD OF` yang SECURITY DEFINER, blokade itu HILANG —
--     grant ke `anon` akan membuka lubang tulis yang hari ini tertutup.
--     Bagian 7 sengaja hanya memberi `authenticated` dan `service_role`.
--
-- (c) `assert_no_schedule_overlap()` TIDAK BISA dipasang polos di
--     `ad_schedules`. Ia bercabang di `TG_TABLE_NAME` dan membaca
--     `NEW.submission_status` serta `NEW.id` — nama kolom yang tidak ada di
--     sana (`status`, `source_id`). Dipasang apa adanya, ia error di setiap
--     tulisan. Bagian 2 memecah intinya jadi fungsi biasa yang dipanggil dua
--     pihak, alih-alih menyalin logikanya dua kali — pola "dua salinan satu
--     aturan" sudah tiga kali jadi bug di proyek ini (sql/49 vs sql/46,
--     invoices vs transactions, matchesFilter vs chipCounts).
--
-- (d) `guard_extend_payment_columns()` JUSTRU BISA dipindah apa adanya:
--     keempat kolom yang dijaganya (`payment_status`, `total_cost`, `subtotal`,
--     `ppn_amount`) bernama sama persis di `ad_schedules`. Tapi ia WAJIB
--     dipagari `source_table = 'form_submissions_extend'` — tanpa itu ia ikut
--     menjatuhkan tulisan cermin ordinal 1 dari alur bayar user biasa, yang
--     persis dilarang kepala sql/41: "A mirror must never be able to reject
--     what the source accepted."
--
-- Jalankan di Supabase SQL Editor. Verifikasi + rollback di bagian bawah.
-- ============================================================================


-- ============================================================================
-- 1. SNAPSHOT — satu-satunya jalan pulang. 15 baris, gratis.
-- ============================================================================
DROP TABLE IF EXISTS public.form_submissions_extend_legacy;
CREATE TABLE public.form_submissions_extend_legacy AS
  SELECT * FROM public.form_submissions_extend;

COMMENT ON TABLE public.form_submissions_extend_legacy IS
  'Snapshot form_submissions_extend tepat sebelum sql/52 mengubahnya jadi view '
  '(2026-08-19, 15 baris). Jalan pulang kalau Deploy B harus dibatalkan. '
  'Boleh dibuang setelah satu siklus rilis tanpa keluhan.';


-- ============================================================================
-- 2. Inti uji irisan jadi fungsi biasa, dipanggil DUA pihak
-- ============================================================================
-- Membaca `ad_schedules`, bukan `form_submissions_extend` — proyeksinya sudah
-- dibuktikan identik (md5 di kepala berkas), dan ini melepas fungsi dari view
-- yang sedang kita bangun.
--
-- ⚠️ SECURITY DEFINER DISENGAJA. Versi lama berjalan sebagai pemanggil, dan
-- itu benar karena RLS tabel lama `qual = true` (melihat SEMUA baris). RLS
-- `ad_schedules` menyembunyikan baris milik orang lain — uji irisan yang tidak
-- bisa melihat semua jadwal akan MELEWATKAN tabrakan, bukan menolaknya. Diam-
-- diam meloloskan dua iklan tayang bersamaan jauh lebih mahal daripada
-- menolak terlalu galak.
CREATE OR REPLACE FUNCTION public.assert_schedule_window_free(
  p_submission_id     UUID,
  p_start             TIMESTAMPTZ,
  p_end               TIMESTAMPTZ,
  p_exclude_source_id UUID,     -- jadwal yang sedang ditulis, jangan diadu dengan dirinya
  p_check_parent      BOOLEAN   -- true saat memvalidasi jadwal KE-2 dst.
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_conflict RECORD;
BEGIN
  -- Jendela setengah jadi belum bisa beririsan dengan apa pun.
  IF p_start IS NULL OR p_end IS NULL THEN RETURN; END IF;

  -- 1. Terhadap jadwal PERTAMA (hanya relevan saat menulis jadwal ke-2 dst.)
  IF p_check_parent THEN
    SELECT airing_instant_of_date(fs.start_date) AS start_date,
           airing_instant_of_date(fs.end_date)   AS end_date
      INTO v_conflict
    FROM form_submissions fs
    WHERE fs.id = p_submission_id
      AND fs.start_date IS NOT NULL
      AND fs.end_date IS NOT NULL
      AND fs.submission_status NOT IN ('rejected', 'spam')
      AND p_start < airing_instant_of_date(fs.end_date)
      AND airing_instant_of_date(fs.start_date) < p_end
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'Jadwal beririsan dengan jadwal pertama survei ini (% s/d %). Satu survei hanya bisa tayang di satu periode pada satu waktu.',
        TO_CHAR(v_conflict.start_date, 'DD Mon YYYY'),
        TO_CHAR(v_conflict.end_date, 'DD Mon YYYY');
    END IF;
  END IF;

  -- 2. Terhadap setiap jadwal lain survei yang sama.
  SELECT a.start_date, a.end_date
    INTO v_conflict
  FROM ad_schedules a
  WHERE a.submission_id = p_submission_id
    AND a.source_table = 'form_submissions_extend'
    AND (p_exclude_source_id IS NULL OR a.source_id <> p_exclude_source_id)
    AND a.status <> 'cancelled'
    AND a.start_date IS NOT NULL
    AND a.end_date IS NOT NULL
    AND p_start < a.end_date
    AND a.start_date < p_end
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Jadwal beririsan dengan jadwal lain survei ini (% s/d %). Satu survei hanya bisa tayang di satu periode pada satu waktu.',
      TO_CHAR(v_conflict.start_date, 'DD Mon YYYY'),
      TO_CHAR(v_conflict.end_date, 'DD Mon YYYY');
  END IF;
END;
$fn$;

-- Trigger di `form_submissions` (trg_submission_no_overlap) tetap memakai nama
-- fungsi yang sama; badannya kini cuma memanggil fungsi di atas. Cabang
-- `TG_TABLE_NAME = 'form_submissions_extend'` dibuang — tabel itu tidak ada lagi,
-- dan view-nya divalidasi lewat INSTEAD OF di bagian 6.
CREATE OR REPLACE FUNCTION public.assert_no_schedule_overlap()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
  v_start TIMESTAMPTZ;
  v_end   TIMESTAMPTZ;
BEGIN
  v_start := airing_instant_of_date(NEW.start_date);
  v_end   := airing_instant_of_date(NEW.end_date);

  IF v_start IS NULL OR v_end IS NULL THEN
    RETURN NEW;
  END IF;

  -- ⚠️ Hanya validasi saat jendelanya BENAR-BENAR dipindah, atau jadwal mati
  -- dihidupkan lagi. Transisi status pada baris yang sudah beririsan tidak
  -- boleh pernah RAISE: cron membalik status banyak baris dalam satu statement,
  -- dan satu baris warisan yang beririsan akan menggagalkan seluruh run.
  -- Bersarang, bukan berantai: OLD belum terisi saat INSERT.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.start_date IS NOT DISTINCT FROM OLD.start_date
       AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date
       AND NOT (
         OLD.submission_status IN ('cancelled', 'rejected', 'spam')
         AND NEW.submission_status NOT IN ('cancelled', 'rejected', 'spam')
       )
    THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.submission_status IN ('rejected', 'spam') THEN
    RETURN NEW;
  END IF;

  -- Induk tidak diadu dengan dirinya sendiri, jadi p_check_parent = false.
  PERFORM assert_schedule_window_free(NEW.id, v_start, v_end, NULL, false);
  RETURN NEW;
END;
$fn$;


-- ============================================================================
-- 3. Lepas 2 FK — FK tidak boleh menunjuk view
-- ============================================================================
-- Kolomnya TETAP ADA dan tetap terisi; `webhook.js` masih bercabang di atasnya.
-- Perannya sebagai penjamin integritas digantikan `schedule_id` (sql/51).
ALTER TABLE public.invoices     DROP CONSTRAINT IF EXISTS invoices_extend_id_fkey;
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_extend_id_fkey;


-- ============================================================================
-- 4. Pindahkan 2 penjaga ke `ad_schedules`, DIPAGARI source_table
-- ============================================================================
-- ⚠️ Pagar `source_table = 'form_submissions_extend'` bukan optimasi — ia yang
-- mencegah penjaga ini menjatuhkan tulisan cermin ordinal 1 (lihat catatan (d)).

DROP TRIGGER IF EXISTS trg_ad_schedules_guard_payment ON public.ad_schedules;
CREATE TRIGGER trg_ad_schedules_guard_payment
  BEFORE UPDATE ON public.ad_schedules
  FOR EACH ROW
  WHEN (OLD.source_table = 'form_submissions_extend')
  EXECUTE FUNCTION public.guard_extend_payment_columns();

DROP TRIGGER IF EXISTS trg_ad_schedules_period_batch ON public.ad_schedules;
CREATE TRIGGER trg_ad_schedules_period_batch
  BEFORE INSERT OR UPDATE ON public.ad_schedules
  FOR EACH ROW
  WHEN (NEW.source_table = 'form_submissions_extend')
  EXECUTE FUNCTION public.compute_extend_period_batch();


-- ============================================================================
-- 5. Tabel jadi VIEW
-- ============================================================================
-- Keempat trigger di tabel lama ikut terhapus bersama tabelnya:
--   trg_ad_schedule_from_extend       -> DIBUANG (datanya sudah DI ad_schedules)
--   trg_extend_period_batch           -> sudah pindah, bagian 4
--   trg_guard_extend_payment_columns  -> sudah pindah, bagian 4
--   trg_extend_no_overlap             -> jadi panggilan di INSTEAD OF, bagian 6
DROP FUNCTION IF EXISTS public.sync_ad_schedule_from_extend() CASCADE;
DROP TABLE public.form_submissions_extend;

-- ⚠️ `source_id AS id` WAJIB — `invoices.extend_id` dan `transactions.extend_id`
-- masih memuat nilai itu, dan `webhook.js` mencarinya lewat kolom tersebut.
-- ⚠️ `total_cost::INTEGER` WAJIB — di tabel lama kolomnya INTEGER, di
-- `ad_schedules` BIGINT. Tanpa cast, tipe kolom view berubah dan sidik jari
-- paritas tidak akan cocok.
-- ⚠️ `security_invoker = true` — lihat catatan (a). Menghapusnya diam-diam
-- MELEBARKAN akses: view jadi berjalan sebagai pemiliknya dan setiap pengguna
-- yang login kembali bisa membaca jadwal siapa pun.
CREATE VIEW public.form_submissions_extend
WITH (security_invoker = true) AS
SELECT
  source_id                   AS id,
  submission_id,
  duration,
  start_date,
  end_date,
  slot_booked_by,
  slot_reserved_at,
  status                      AS submission_status,
  payment_status,
  prize_per_winner,
  winner_count,
  additional_prize_per_winner,
  is_new_period               AS is_new_month,
  period_batch,
  total_cost::INTEGER         AS total_cost,
  voucher_code,
  admin_notes,
  created_at,
  updated_at,
  subtotal,
  ppn_amount
FROM public.ad_schedules
WHERE source_table = 'form_submissions_extend';

COMMENT ON VIEW public.form_submissions_extend IS
  'Sejak sql/52 ini VIEW di atas ad_schedules, bukan tabel. ad_schedules '
  'otoritatif untuk jadwal ke-2 dst. View ini menahan pemanggil lama '
  '(ScheduleForm, InvoiceForm, webhook.js, cron_activate_extends, dst.) sampai '
  'semuanya dipindah; sesudah itu DROP VIEW. Tulis lewat INSTEAD OF di bawah.';


-- ============================================================================
-- 6. INSTEAD OF — tulisan ke view diteruskan ke ad_schedules
-- ============================================================================
-- ⚠️ SECURITY DEFINER WAJIB. `ad_schedules` tidak punya policy INSERT/UPDATE/
-- DELETE untuk `authenticated` sama sekali (cuma SELECT). Tanpa SECURITY
-- DEFINER, setiap tulisan dari browser diam-diam kena 0 baris TANPA ERROR —
-- persis kegagalan senyap `transactions` yang baru ditutup sql/59.
-- Konsekuensinya: penjaga di bagian 4 jadi satu-satunya yang berdiri antara
-- pemanggil browser dan kolom uang. Itu disengaja, dan itulah sebabnya
-- pagarnya harus benar.

CREATE OR REPLACE FUNCTION public.extend_view_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_id                UUID := COALESCE(NEW.id, gen_random_uuid());
  v_distribution_type TEXT;
  v_review_status     TEXT;
BEGIN
  SELECT fs.distribution_type, review_status_of(fs.submission_status)
    INTO v_distribution_type, v_review_status
  FROM form_submissions fs WHERE fs.id = NEW.submission_id;

  IF COALESCE(NEW.submission_status, 'waiting_payment') <> 'cancelled' THEN
    PERFORM assert_schedule_window_free(
      NEW.submission_id, NEW.start_date, NEW.end_date, v_id, true);
  END IF;

  -- Ordinal 2 adalah PLACEHOLDER; resync di bawah menetapkan nomor sebenarnya
  -- sebelum statement berakhir, dan ad_schedules_ordinal_key ditunda sampai
  -- COMMIT sehingga tabrakan sesaat di sini legal. Ordinal 1 tidak pernah jadi
  -- kandidat — resync menomori mulai dari 2.
  INSERT INTO ad_schedules (
    submission_id, ordinal, source_table, source_id,
    start_date, end_date, duration,
    status, review_status, payment_status,
    prize_per_winner, winner_count, additional_prize_per_winner,
    is_new_period, period_batch,
    total_cost, subtotal, ppn_amount, voucher_code,
    slot_booked_by, slot_reserved_at, admin_notes,
    distribution_type, kilat_slot_hour,
    created_at, updated_at
  ) VALUES (
    NEW.submission_id, 2, 'form_submissions_extend', v_id,
    NEW.start_date, NEW.end_date, NEW.duration,
    COALESCE(NEW.submission_status, 'waiting_payment'), v_review_status, NEW.payment_status,
    COALESCE(NEW.prize_per_winner, 0), COALESCE(NEW.winner_count, 0),
    COALESCE(NEW.additional_prize_per_winner, 0),
    COALESCE(NEW.is_new_month, false), NEW.period_batch,
    COALESCE(NEW.total_cost, 0), NEW.subtotal, NEW.ppn_amount, NEW.voucher_code,
    NEW.slot_booked_by, NEW.slot_reserved_at, NEW.admin_notes,
    v_distribution_type, NULL,
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW())
  );

  PERFORM resync_ad_schedule_ordinals(NEW.submission_id);

  NEW.id := v_id;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.extend_view_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- Aturan kapan divalidasi SAMA PERSIS dengan trigger lama: hanya saat
  -- jendelanya dipindah atau jadwal batal dihidupkan lagi.
  IF (NEW.start_date IS DISTINCT FROM OLD.start_date
      OR NEW.end_date IS DISTINCT FROM OLD.end_date
      OR (OLD.submission_status = 'cancelled' AND NEW.submission_status <> 'cancelled'))
     AND COALESCE(NEW.submission_status, '') <> 'cancelled'
  THEN
    PERFORM assert_schedule_window_free(
      NEW.submission_id, NEW.start_date, NEW.end_date, OLD.id, true);
  END IF;

  UPDATE ad_schedules SET
    submission_id               = NEW.submission_id,
    start_date                  = NEW.start_date,
    end_date                    = NEW.end_date,
    duration                    = NEW.duration,
    status                      = NEW.submission_status,
    payment_status              = NEW.payment_status,
    prize_per_winner            = NEW.prize_per_winner,
    winner_count                = NEW.winner_count,
    additional_prize_per_winner = NEW.additional_prize_per_winner,
    is_new_period               = NEW.is_new_month,
    period_batch                = NEW.period_batch,
    total_cost                  = NEW.total_cost,
    subtotal                    = NEW.subtotal,
    ppn_amount                  = NEW.ppn_amount,
    voucher_code                = NEW.voucher_code,
    slot_booked_by              = NEW.slot_booked_by,
    slot_reserved_at            = NEW.slot_reserved_at,
    admin_notes                 = NEW.admin_notes,
    updated_at                  = COALESCE(NEW.updated_at, NOW())
  WHERE source_table = 'form_submissions_extend' AND source_id = OLD.id;

  IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    PERFORM resync_ad_schedule_ordinals(NEW.submission_id);
  END IF;

  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.extend_view_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  DELETE FROM ad_schedules
  WHERE source_table = 'form_submissions_extend' AND source_id = OLD.id;

  PERFORM resync_ad_schedule_ordinals(OLD.submission_id);
  RETURN OLD;
END;
$fn$;

CREATE TRIGGER trg_extend_view_insert INSTEAD OF INSERT ON public.form_submissions_extend
  FOR EACH ROW EXECUTE FUNCTION public.extend_view_insert();
CREATE TRIGGER trg_extend_view_update INSTEAD OF UPDATE ON public.form_submissions_extend
  FOR EACH ROW EXECUTE FUNCTION public.extend_view_update();
CREATE TRIGGER trg_extend_view_delete INSTEAD OF DELETE ON public.form_submissions_extend
  FOR EACH ROW EXECUTE FUNCTION public.extend_view_delete();


-- ============================================================================
-- 7. Grants — REVOKE dari `anon` WAJIB, bukan sekadar "tidak diberikan"
-- ============================================================================
-- ⚠️ TERBUKTI SAAT MENERAPKAN 2026-08-19: Supabase memasang
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon` di skema `public`,
-- jadi VIEW BARU LANGSUNG MEWARISI hak penuh untuk `anon` — tujuh privilege,
-- termasuk INSERT/UPDATE/DELETE — tanpa satu baris GRANT pun ditulis di sini.
-- Tidak menuliskan grant untuk `anon` TIDAK CUKUP; ia harus dicabut.
--
-- Kenapa ini berbahaya justru di sini: bacaan `anon` memang tetap kosong
-- (security_invoker=true -> RLS ad_schedules -> tidak ada policy `anon`), TAPI
-- tulisan lolos — `INSTEAD OF` di bagian 6 SECURITY DEFINER, jadi ia menulis
-- sebagai `postgres` dan melewati RLS sepenuhnya. Di tabel lama lubang ini
-- tertutup karena tulisan `anon` dihadang RLS langsung.
REVOKE ALL ON public.form_submissions_extend FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_submissions_extend
  TO authenticated, service_role;


-- ============================================================================
-- 8. Kuota slot harus tetap melihat jadwal SEMUA ORANG
-- ============================================================================
-- ⚠️ WAJIB ADA BERSAMA `security_invoker = true`, bukan tambahan opsional.
--
-- `fetchSlotAvailability()` menghitung kuota 2-iklan-per-hari dan karena itu
-- harus membaca jendela tayang SEMUA order, bukan cuma milik si pemanggil.
-- Dengan view yang tunduk RLS, SELECT langsung dari peneliti hanya
-- mengembalikan jadwalnya sendiri — tanggal yang sebenarnya penuh tampak
-- kosong, dan order baru menembus kuota. Bugnya SENYAP: tidak ada error, cuma
-- angka yang salah.
--
-- Catatan konsistensi: `form_submissions` sendiri sudah terbuka untuk semua
-- pengguna login — policy "User View Own Submissions" ber-`qual = true`
-- (namanya menyesatkan). Jadi porsi ordinal 1 pada hitungan yang sama memang
-- selalu terlihat penuh; fungsi ini menyamakan porsi jadwal ke-2 dst. tanpa
-- membuka kembali seluruh tabel.
CREATE OR REPLACE FUNCTION public.get_extend_slot_occupancy(p_distribution_type TEXT DEFAULT 'regular')
RETURNS TABLE (
  id UUID, submission_id UUID,
  start_date TIMESTAMPTZ, end_date TIMESTAMPTZ,
  submission_status TEXT, payment_status TEXT,
  slot_booked_by TEXT, slot_reserved_at TIMESTAMPTZ,
  title TEXT, admin_notes TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT a.source_id, a.submission_id,
         a.start_date, a.end_date,
         a.status, a.payment_status,
         a.slot_booked_by, a.slot_reserved_at,
         fs.title, fs.admin_notes
  FROM ad_schedules a
  JOIN form_submissions fs ON fs.id = a.submission_id
  WHERE a.source_table = 'form_submissions_extend'
    AND a.start_date IS NOT NULL
    AND a.end_date IS NOT NULL
    -- ⚠️ SATU-SATUNYA tempat daftar status penahan slot hidup sekarang.
    -- Dulu ia juga jadi konstanta SLOT_OCCUPYING_EXTEND_STATUSES di
    -- src/utils/supabase.ts; salinan itu sudah dibuang supaya tidak ada dua
    -- tempat menulis satu aturan.
    AND a.status IN ('waiting_payment','paid','scheduled','live')
    AND fs.distribution_type IS NOT DISTINCT FROM p_distribution_type;
$fn$;

COMMENT ON FUNCTION public.get_extend_slot_occupancy(TEXT) IS
  'Jendela tayang jadwal ke-2 dst. yang MENAHAN SLOT, untuk hitungan kuota kalender. '
  'SECURITY DEFINER karena sql/52 membuat bacaan form_submissions_extend tunduk RLS '
  'ad_schedules (pemilik/admin saja) - tanpa ini peneliti tidak melihat extend milik '
  'orang lain dan kuota jadi kurang hitung sehingga tanggal penuh tampak kosong.';

REVOKE ALL ON FUNCTION public.get_extend_slot_occupancy(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_extend_slot_occupancy(TEXT) TO authenticated, service_role;


-- ============================================================================
-- VERIFIKASI — jalankan SESUDAH menerapkan, adu dengan angka di kepala berkas
-- ============================================================================
-- -- (1) ⚠️ UJI INTINYA. Harus PERSIS 15 dan 1798a75e9750611d14178e45be2387ef.
-- SELECT COUNT(*) AS baris,
--   md5(string_agg(
--     id::text||'|'||submission_id::text||'|'||COALESCE(duration::text,'~')||'|'||
--     COALESCE(EXTRACT(EPOCH FROM start_date)::text,'~')||'|'||COALESCE(EXTRACT(EPOCH FROM end_date)::text,'~')||'|'||
--     COALESCE(slot_booked_by,'~')||'|'||COALESCE(EXTRACT(EPOCH FROM slot_reserved_at)::text,'~')||'|'||
--     COALESCE(submission_status,'~')||'|'||COALESCE(payment_status,'~')||'|'||
--     COALESCE(prize_per_winner::text,'~')||'|'||COALESCE(winner_count::text,'~')||'|'||
--     COALESCE(additional_prize_per_winner::text,'~')||'|'||COALESCE(is_new_month::text,'~')||'|'||
--     COALESCE(period_batch,'~')||'|'||COALESCE(total_cost::text,'~')||'|'||COALESCE(voucher_code,'~')||'|'||
--     COALESCE(admin_notes,'~')||'|'||COALESCE(EXTRACT(EPOCH FROM created_at)::text,'~')||'|'||
--     COALESCE(EXTRACT(EPOCH FROM updated_at)::text,'~')||'|'||COALESCE(subtotal::text,'~')||'|'||
--     COALESCE(ppn_amount::text,'~'),
--   E'\n' ORDER BY id)) AS sidik_sesudah
-- FROM form_submissions_extend;
--
-- -- (2) Tipe kolom view identik dengan tabel lama (buktikan total_cost tetap integer):
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'form_submissions_extend' ORDER BY ordinal_position;
--
-- -- (3) cron tetap bersih, dan jadwal berjalan tidak berubah status:
-- SELECT cron_activate_extends();
--
-- -- (4) Kontrak pihak ketiga — bandingkan keluaran nyata, bukan cuma signature:
-- SELECT * FROM get_batch_rewards_bulk(ARRAY['<submission_id yang punya jadwal ke-2>']::uuid[]);
--
-- -- (5) INSERT lewat view (tombol "Jadwal Iklan Baru") -> ordinal benar,
-- --     booking_id terbit; lalu rentang beririsan HARUS ditolak.
--
-- -- (6) UPDATE kolom uang lewat InvoiceForm sebagai admin -> berhasil;
-- --     sebagai non-admin -> ditolak 'payment columns ... only be changed by an admin'.
--
-- -- (7) ⚠️ Alur bayar user biasa (ordinal 1) TETAP JALAN — membuktikan penjaga
-- --     di bagian 4 tidak menjatuhkan tulisan cermin:
-- UPDATE form_submissions SET payment_status = payment_status WHERE id = '<order manapun>';
--
-- -- (8) anon TIDAK punya akses (harus nol baris):
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_name = 'form_submissions_extend' AND grantee = 'anon';

-- ============================================================================
-- ROLLBACK — selama snapshot bagian 1 masih ada
-- ============================================================================
-- DROP VIEW public.form_submissions_extend CASCADE;
-- CREATE TABLE public.form_submissions_extend AS SELECT * FROM public.form_submissions_extend_legacy;
-- -- lalu pulihkan pkey/index/RLS/trigger dari 19_create_extend_table.sql + 33 + 38 + 41,
-- -- dan kembalikan assert_no_schedule_overlap() ke versi sql/38.
-- -- ⚠️ Baris yang lahir SESUDAH sql/52 diterapkan hanya ada di ad_schedules —
-- -- salin manual sebelum rollback, snapshot tidak memuatnya.
