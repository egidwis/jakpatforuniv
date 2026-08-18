-- ============================================================
-- Migration 51: booking_id, schedule_id, dan pemulihan aturan ordinal 1
-- Date: 2026-08-18
-- Phase 2, Task 11 langkah 1 (Deploy A) dari
--   docs/superpowers/plans/2026-08-08-task-11-ad-schedules-otoritatif.md
--
-- APA INI
-- -------
-- Bagian ADITIF Task 11. Tidak satu pun bagian file ini mengubah bentuk tabel
-- lama, memindahkan pembaca, atau menyentuh form_submissions_extend. Kalau
-- rilis ini dibatalkan di tengah jalan, tidak ada yang perlu dibongkar — lihat
-- bagian 9 (ROLLBACK).
--
-- Empat hal, dan yang PERTAMA adalah perbaikan regresi yang menghalangi
-- sisanya:
--
--   0. Pulihkan aturan "satu order = satu baris ordinal 1, SELALU"
--   1. ad_schedules.booking_id  — kode jadwal yang dikutip peneliti
--   2. schedule_id di transactions/invoices + trigger penurunnya
--   3. UNIQUE (submission_id) di survey_pages
--
--
-- ⚠️ BAGIAN 0 — REGRESI YANG DITEMUKAN 2026-08-18, BACA SEBELUM APA PUN
-- ---------------------------------------------------------------------
-- sql/46 bagian 3 MEMBUANG cabang DELETE dari sync_ad_schedule_from_submission()
-- dan menjadikan aturannya total: satu order = satu baris ordinal 1, selalu.
-- Uji paritasnya (sql/46 §7(1)) berbunyi: COUNT(*) WHERE ordinal=1 harus PERSIS
-- COUNT(*) FROM form_submissions, tanpa syarat apa pun.
--
-- sql/49 menulis ulang fungsi yang sama untuk menambahkan cabang jam kustom.
-- Kepalanya menyatakan "SALINAN UTUH sql/46 (versi terakhir fungsi ini), dengan
-- SATU cabang tambahan" — tapi badan yang disalin adalah badan sql/45, dan
-- cabang DELETE ikut terbawa. Git tidak menganggapnya konflik: keduanya
-- CREATE OR REPLACE di berkas berbeda, jadi yang terakhir dijalankan menang
-- tanpa peringatan.
--
-- Terukur 2026-08-18: 1001 order, 986 baris ordinal 1. Lima belas hilang, dan
-- SEPULUH di antaranya lahir SESUDAH sql/46 diterapkan (tiga hari ini). Ini
-- bukan sisa sejarah — ia masih memakan.
--
-- KENAPA INI MEMBLOKIR TASK 11, bukan sekadar merapikan. Kepala sql/46 sudah
-- menuliskannya sepuluh hari sebelum kejadian:
--
--   "Cabang DELETE itu sendiri jebakan yang menunggu: hari ini admin yang
--    mengosongkan tanggal diam-diam menghapus baris cermin. Sesudah Task 11 —
--    ketika ad_schedules jadi otoritatif — yang terhapus adalah jadwalnya
--    sendiri."
--
-- Dan jalurnya sudah hidup: releaseScheduleSlot() ("Hapus dari list",
-- src/utils/supabase.ts) MEMANG bekerja dengan mengosongkan start_date/end_date
-- — itu mekanismenya, disengaja, supaya isUnscheduled() jadi true. Hari ini
-- klik itu menghapus baris cermin. Sesudah sql/52 ia akan menghapus JADWALNYA
-- BESERTA booking_id yang mungkin sudah dikutip peneliti ke support.
--
-- Karena itu bagian 0 dijalankan lebih dulu: tanpanya, booking_id NOT NULL
-- tidak bisa dipenuhi dengan bersih dan sql/52 lahir di atas fondasi bocor.
--
-- sync_ad_schedule_from_extend() TIDAK disentuh — DELETE di sana ada di bawah
-- TG_OP = 'DELETE', yaitu baris yang memang benar-benar dihapus. Itu benar.
--
--
-- ⚠️ BOOKING_ID TIDAK BOLEH DITURUNKAN DARI ORDINAL
-- resync_ad_schedule_ordinals() (sql/41 bagian 3) MENOMORI ULANG seluruh jadwal
-- lanjutan sebuah order begitu satu jadwal disisipkan dengan tanggal lebih awal.
-- Kode turunan ordinal karena itu akan berpindah ke jadwal lain diam-diam — dan
-- yang berpindah adalah kode yang sudah dikutip peneliti ke support. booking_id
-- dibangkitkan acak, sekali, dan TIDAK PERNAH dihitung ulang.
--
-- ⚠️ BEBERAPA BARIS BER-schedule_id SAMA BUKAN BERARTI BEBERAPA TAGIHAN
-- Terukur 2026-08-17: 82 sumber punya lebih dari satu baris transaksi/invoice,
-- dan itu hampir selalu PERCOBAAN BAYAR BERULANG atas tagihan yang sama —
-- kasus terburuk 29 baris Rp 350.000 untuk satu jadwal. Pembedanya: percobaan
-- atas tagihan yang sama BERBAGI payment_id. Menjumlahkan `amount` per
-- schedule_id tanpa membedakannya pernah menampilkan order yang lunas
-- Rp 1.150.000 sebagai Rp 3.450.000. Task 13 bersandar penuh pada pembedaan
-- ini; aturannya distempel sebagai COMMENT kolom di bagian 3 supaya tidak
-- hilang lagi.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- CREATE INDEX IF NOT EXISTS, DROP TRIGGER IF EXISTS, DO-block bersyarat.
-- Aman dijalankan ulang.
-- DEPENDS ON sql/41 (ad_schedules), sql/46 (dua sumbu), sql/49 (jam kustom).
-- JALANKAN PRE-CHECK DI BAGIAN 7 SEBELUM MENERAPKAN.
-- ============================================================


-- ============================================
-- 0. Pulihkan aturan "satu order = satu baris ordinal 1"
-- ============================================
-- SALINAN sql/49 bagian 4, dengan cabang DELETE dibuang dan tidak ada lagi yang
-- lain berubah. Prioritas waktunya HARUS tetap identik — jam kustom admin >
-- gelombang Kilat > bawaan 15.00 WIB — karena §8(4) di bawah membuktikan nol
-- baris bergeser.
--
-- NULL-safety sudah diperiksa di sql/46 dan masih berlaku:
-- airing_instant_of_date(NULL), kilat_instant_of(NULL, …),
-- airing_instant_of_custom(NULL, …) dan TO_CHAR(NULL,'YYYY-MM') semuanya NULL.
-- Baris tanpa tanggal karena itu mendarat dengan start_date/end_date/
-- period_batch NULL tanpa penjagaan tambahan. Jangan dibungkus ulang.
CREATE OR REPLACE FUNCTION sync_ad_schedule_from_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end   TIMESTAMPTZ;
BEGIN
  -- ⚠️ TIDAK ADA CABANG "start_date IS NULL -> DELETE" DI SINI. Itu disengaja,
  -- dan mengembalikannya akan menghapus jadwal beserta booking_id-nya begitu
  -- admin mengosongkan tanggal. Lihat catatan panjang di kepala berkas ini.
  IF NEW.airing_hour_wib IS NOT NULL THEN
    v_start := airing_instant_of_custom(NEW.start_date, NEW.airing_hour_wib, NEW.airing_minute_wib);
    v_end   := airing_instant_of_custom(NEW.end_date,   NEW.airing_hour_wib, NEW.airing_minute_wib);
  ELSIF NEW.distribution_type = 'kilat' THEN
    v_start := kilat_instant_of(NEW.start_date, NEW.kilat_slot_hour);
    v_end   := kilat_instant_of(NEW.end_date,   NEW.kilat_slot_hour);
  ELSE
    v_start := airing_instant_of_date(NEW.start_date);
    v_end   := airing_instant_of_date(NEW.end_date);
  END IF;

  INSERT INTO ad_schedules (
    submission_id, ordinal, source_table, source_id,
    start_date, end_date, duration,
    status, review_status, payment_status,
    prize_per_winner, winner_count, additional_prize_per_winner,
    is_new_period, period_batch,
    total_cost, subtotal, ppn_amount, voucher_code,
    slot_booked_by, slot_reserved_at, admin_notes,
    distribution_type, kilat_slot_hour,
    airing_hour_wib, airing_minute_wib,
    created_at, updated_at
  )
  VALUES (
    NEW.id, 1, 'form_submissions', NEW.id,
    v_start, v_end,
    NEW.duration,
    airing_status_of(NEW.submission_status, NEW.start_date IS NOT NULL),
    review_status_of(NEW.submission_status),
    NEW.payment_status,
    COALESCE(NEW.prize_per_winner, 0),
    COALESCE(NEW.winner_count, 0),
    0,                      -- top-up hanya pernah menempel ke jadwal berikutnya
    false,                  -- jadwal pertama membuka pool pertama, menurut definisi
    TO_CHAR(NEW.end_date, 'YYYY-MM'),
    COALESCE(NEW.total_cost, 0), NEW.subtotal, NEW.ppn_amount, NEW.voucher_code,
    NEW.slot_booked_by, NEW.slot_reserved_at, NEW.admin_notes,
    NEW.distribution_type, NEW.kilat_slot_hour,
    NEW.airing_hour_wib, NEW.airing_minute_wib,
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT ON CONSTRAINT ad_schedules_source_key DO UPDATE SET
    start_date          = EXCLUDED.start_date,
    end_date            = EXCLUDED.end_date,
    duration            = EXCLUDED.duration,
    status              = EXCLUDED.status,
    review_status       = EXCLUDED.review_status,
    payment_status      = EXCLUDED.payment_status,
    prize_per_winner    = EXCLUDED.prize_per_winner,
    winner_count        = EXCLUDED.winner_count,
    period_batch        = EXCLUDED.period_batch,
    total_cost          = EXCLUDED.total_cost,
    subtotal            = EXCLUDED.subtotal,
    ppn_amount          = EXCLUDED.ppn_amount,
    voucher_code        = EXCLUDED.voucher_code,
    slot_booked_by      = EXCLUDED.slot_booked_by,
    slot_reserved_at    = EXCLUDED.slot_reserved_at,
    admin_notes         = EXCLUDED.admin_notes,
    distribution_type   = EXCLUDED.distribution_type,
    kilat_slot_hour     = EXCLUDED.kilat_slot_hour,
    airing_hour_wib     = EXCLUDED.airing_hour_wib,
    airing_minute_wib   = EXCLUDED.airing_minute_wib,
    updated_at          = EXCLUDED.updated_at;

  RETURN NULL;
END;
$$;

-- Backfill baris ordinal 1 yang hilang selama regresi berlaku. Bentuknya sama
-- persis dengan sql/46 bagian 5a (yang juga tanpa syarat start_date), ditambah
-- kolom jam kustom yang lahir di sql/49.
INSERT INTO ad_schedules (
  submission_id, ordinal, source_table, source_id,
  start_date, end_date, duration,
  status, review_status, payment_status,
  prize_per_winner, winner_count, additional_prize_per_winner,
  is_new_period, period_batch,
  total_cost, subtotal, ppn_amount, voucher_code,
  slot_booked_by, slot_reserved_at, admin_notes,
  distribution_type, kilat_slot_hour,
  airing_hour_wib, airing_minute_wib,
  created_at, updated_at
)
SELECT
  fs.id, 1, 'form_submissions', fs.id,
  CASE WHEN fs.airing_hour_wib IS NOT NULL
         THEN airing_instant_of_custom(fs.start_date, fs.airing_hour_wib, fs.airing_minute_wib)
       WHEN fs.distribution_type = 'kilat'
         THEN kilat_instant_of(fs.start_date, fs.kilat_slot_hour)
       ELSE airing_instant_of_date(fs.start_date) END,
  CASE WHEN fs.airing_hour_wib IS NOT NULL
         THEN airing_instant_of_custom(fs.end_date, fs.airing_hour_wib, fs.airing_minute_wib)
       WHEN fs.distribution_type = 'kilat'
         THEN kilat_instant_of(fs.end_date, fs.kilat_slot_hour)
       ELSE airing_instant_of_date(fs.end_date) END,
  fs.duration,
  airing_status_of(fs.submission_status, fs.start_date IS NOT NULL),
  review_status_of(fs.submission_status),
  fs.payment_status,
  COALESCE(fs.prize_per_winner, 0),
  COALESCE(fs.winner_count, 0),
  0,
  false,
  TO_CHAR(fs.end_date, 'YYYY-MM'),
  COALESCE(fs.total_cost, 0), fs.subtotal, fs.ppn_amount, fs.voucher_code,
  fs.slot_booked_by, fs.slot_reserved_at, fs.admin_notes,
  fs.distribution_type, fs.kilat_slot_hour,
  fs.airing_hour_wib, fs.airing_minute_wib,
  COALESCE(fs.created_at, NOW()), COALESCE(fs.updated_at, NOW())
FROM form_submissions fs
ON CONFLICT ON CONSTRAINT ad_schedules_source_key DO NOTHING;


-- ============================================
-- 1. booking_id — kolom
-- ============================================
ALTER TABLE public.ad_schedules
  ADD COLUMN IF NOT EXISTS booking_id TEXT;


-- ============================================
-- 2. booking_id — pembangkit
-- ============================================
-- Alfabet membuang 0 O 1 I L U: karakter yang tertukar saat dibacakan lewat
-- telepon atau disalin ulang dari tangkapan layar. Sisa 30 karakter, panjang 8
-- => 30^8 ≈ 6,5x10^11. Dengan laju ~17 order/hari, peluang tabrakan tetap dapat
-- diabaikan sepuluh tahun ke depan; UNIQUE + loop coba-lagi menutup sisanya.
--
-- random() cukup di sini: booking_id BUKAN rahasia. Ia menggantikan UUID
-- terpotong yang selama ini sudah beredar di WhatsApp dan email, dan pencarian
-- yang memakainya hanya ada di dashboard admin (di balik auth). Yang dibutuhkan
-- adalah "tidak tertukar saat dibacakan", bukan "tidak bisa ditebak".
CREATE OR REPLACE FUNCTION generate_booking_id()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  k_alphabet CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_out TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..8 LOOP
    v_out := v_out || substr(k_alphabet, 1 + floor(random() * length(k_alphabet))::INT, 1);
  END LOOP;
  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION generate_booking_id() IS
  'Kode jadwal 8 karakter, alfabet 23456789ABCDEFGHJKMNPQRSTVWXYZ (tanpa 0 O 1 I L U). Bukan rahasia — hanya perlu tidak tertukar saat dibacakan. Ditambahkan sql/51 (Task 11).';


-- ============================================
-- 3. booking_id — backfill
-- ============================================
-- Loop, bukan satu UPDATE: tiap baris memanggil generate_booking_id() sendiri,
-- jadi dua baris BISA menerima kode yang sama dalam satu statement (peluangnya
-- ~8x10^-7 untuk 1001 baris, tapi "kecil" bukan "nol"). Putaran kedua
-- mengembalikan yang bertabrakan jadi NULL lalu mengundinya ulang, sampai nol
-- NULL tersisa. Idempotent: baris yang sudah punya kode tidak pernah disentuh.
DO $$
DECLARE
  v_left INT;
  v_guard INT := 0;
BEGIN
  LOOP
    v_guard := v_guard + 1;
    IF v_guard > 20 THEN
      RAISE EXCEPTION 'booking_id backfill tidak konvergen setelah 20 putaran — periksa generate_booking_id()';
    END IF;

    UPDATE ad_schedules SET booking_id = generate_booking_id()
    WHERE booking_id IS NULL;

    -- Yang kembar dikembalikan jadi NULL, kecuali satu pemenang per kode.
    UPDATE ad_schedules a SET booking_id = NULL
    WHERE a.booking_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM ad_schedules b
        WHERE b.booking_id = a.booking_id AND b.id < a.id
      );

    SELECT COUNT(*) INTO v_left FROM ad_schedules WHERE booking_id IS NULL;
    EXIT WHEN v_left = 0;
  END LOOP;
END $$;


-- ============================================
-- 4. booking_id — kunci: UNIQUE, NOT NULL, dan trigger pengisi
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ad_schedules_booking_id_key'
  ) THEN
    ALTER TABLE public.ad_schedules
      ADD CONSTRAINT ad_schedules_booking_id_key UNIQUE (booking_id);
  END IF;
END $$;

ALTER TABLE public.ad_schedules ALTER COLUMN booking_id SET NOT NULL;

COMMENT ON COLUMN public.ad_schedules.booking_id IS
  'Kode jadwal yang dikutip peneliti dan admin. Opaque, abadi, TIDAK PERNAH dihitung ulang. ⚠️ JANGAN turunkan dari ordinal: resync_ad_schedule_ordinals() (sql/41) menomori ulang jadwal lanjutan begitu ada yang disisipkan lebih awal, jadi kode turunan ordinal akan berpindah ke jadwal lain diam-diam. Ditambahkan sql/51 (Task 11).';

-- ⚠️ INI TRIGGER PERTAMA DI ad_schedules. Kepala sql/41 mencatat "with no
-- trigger on ad_schedules itself, recursion is impossible". Itu masih berlaku:
-- fungsi ini hanya menyentuh NEW dan membaca tabelnya sendiri, tidak pernah
-- menulis ke tabel lain, jadi ia tidak bisa memicu siapa pun.
CREATE OR REPLACE FUNCTION assign_booking_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_guard INT := 0;
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  LOOP
    v_guard := v_guard + 1;
    IF v_guard > 20 THEN
      RAISE EXCEPTION 'Gagal membangkitkan booking_id unik setelah 20 percobaan';
    END IF;

    NEW.booking_id := generate_booking_id();
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM ad_schedules WHERE booking_id = NEW.booking_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_booking_id ON public.ad_schedules;
CREATE TRIGGER trg_assign_booking_id
  BEFORE INSERT ON public.ad_schedules
  FOR EACH ROW EXECUTE FUNCTION assign_booking_id();


-- ============================================
-- 5. schedule_id di transactions & invoices
-- ============================================
-- ON DELETE SET NULL, bukan CASCADE. Sebuah baris pembayaran tidak boleh hilang
-- karena baris jadwalnya hilang — riwayat uang bertahan lebih lama daripada
-- jadwal yang melahirkannya, dan pemulihan bagian 0 di atas justru ada supaya
-- jadwal tidak menghilang diam-diam.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES public.ad_schedules(id) ON DELETE SET NULL;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES public.ad_schedules(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.transactions.schedule_id IS
  'Jadwal yang ditagih baris ini. ⚠️ BEBERAPA BARIS DENGAN schedule_id SAMA BUKAN BERARTI BEBERAPA TAGIHAN — hampir selalu percobaan bayar berulang atas tagihan yang sama (terukur 2026-08-17: 82 sumber >1 baris, terburuk 29 baris Rp 350.000 untuk satu jadwal). Pembedanya: percobaan atas tagihan yang sama BERBAGI payment_id. Menjumlahkan amount per schedule_id tanpa membedakannya pernah menampilkan order lunas Rp 1.150.000 sebagai Rp 3.450.000. Ditambahkan sql/51 (Task 11); menggantikan entity_type+extend_id.';

COMMENT ON COLUMN public.invoices.schedule_id IS
  'Jadwal yang ditagih baris ini. Aturan pembeda percobaan-vs-tagihan sama persis dengan transactions.schedule_id — baca komentar di sana sebelum menjumlahkan uang. Ditambahkan sql/51 (Task 11).';

CREATE INDEX IF NOT EXISTS idx_transactions_schedule ON public.transactions(schedule_id);
CREATE INDEX IF NOT EXISTS idx_invoices_schedule     ON public.invoices(schedule_id);


-- ============================================
-- 6. schedule_id — backfill + trigger penurun
-- ============================================
UPDATE public.transactions t
SET schedule_id = a.id
FROM public.ad_schedules a
WHERE t.schedule_id IS NULL
  AND (
    (t.entity_type = 'extend' AND t.extend_id IS NOT NULL
      AND a.source_table = 'form_submissions_extend' AND a.source_id = t.extend_id)
    OR
    (COALESCE(t.entity_type, '') <> 'extend' AND t.form_submission_id IS NOT NULL
      AND a.source_table = 'form_submissions' AND a.source_id = t.form_submission_id)
  );

UPDATE public.invoices i
SET schedule_id = a.id
FROM public.ad_schedules a
WHERE i.schedule_id IS NULL
  AND (
    (i.entity_type = 'extend' AND i.extend_id IS NOT NULL
      AND a.source_table = 'form_submissions_extend' AND a.source_id = i.extend_id)
    OR
    (COALESCE(i.entity_type, '') <> 'extend' AND i.form_submission_id IS NOT NULL
      AND a.source_table = 'form_submissions' AND a.source_id = i.form_submission_id)
  );

-- ⚠️ TANPA TRIGGER INI KOLOMNYA MATI SEBELUM SEMPAT DIPAKAI.
-- Satu-satunya penulis baris transactions/invoices adalah
-- functions/api/doku/create-payment.js, dan ia mengirim entity_type/extend_id
-- saja. Jadi setiap tagihan yang lahir antara rilis ini dan selesainya
-- pemindahan pemanggil (Task 11 langkah 3) akan ber-schedule_id NULL, dan
-- Task 13 mewarisi kolom setengah terisi — persis keadaan yang membuat
-- prototipe multi-invoice salah menghitung uang 2026-08-17.
--
-- Trigger ini menutup SEMUA penulis sekaligus — create-payment, webhook DOKU,
-- dan tulisan manual lewat SQL — tanpa menunggu satu pun deploy frontend.
--
-- ⚠️ INI SEMENTARA. Buang di rilis yang membuat pemanggilnya mengirim
-- schedule_id sendiri (langkah 3), bersama entity_type/extend_id.
CREATE OR REPLACE FUNCTION derive_schedule_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.schedule_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.entity_type = 'extend' AND NEW.extend_id IS NOT NULL THEN
    SELECT a.id INTO NEW.schedule_id
    FROM ad_schedules a
    WHERE a.source_table = 'form_submissions_extend' AND a.source_id = NEW.extend_id;
  ELSIF NEW.form_submission_id IS NOT NULL THEN
    SELECT a.id INTO NEW.schedule_id
    FROM ad_schedules a
    WHERE a.source_table = 'form_submissions' AND a.source_id = NEW.form_submission_id;
  END IF;

  -- Tidak ketemu = biarkan NULL. Jadwalnya memang belum ada di cermin; menolak
  -- baris pembayaran karena itu akan menjatuhkan alur bayar demi kerapian
  -- kolom turunan.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION derive_schedule_id() IS
  'Mengisi schedule_id dari entity_type+extend_id/form_submission_id saat penulisnya belum mengirimnya. SEMENTARA — dibuang bersama entity_type/extend_id di Task 11 langkah 3. Ditambahkan sql/51.';

DROP TRIGGER IF EXISTS trg_derive_schedule_id ON public.transactions;
CREATE TRIGGER trg_derive_schedule_id
  BEFORE INSERT OR UPDATE OF entity_type, extend_id, form_submission_id
  ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION derive_schedule_id();

DROP TRIGGER IF EXISTS trg_derive_schedule_id ON public.invoices;
CREATE TRIGGER trg_derive_schedule_id
  BEFORE INSERT OR UPDATE OF entity_type, extend_id, form_submission_id
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION derive_schedule_id();


-- ============================================
-- 7. UNIQUE (submission_id) di survey_pages
-- ============================================
-- Partial: 17 halaman announcement memang tidak punya submission. Datanya sudah
-- bersih (0 duplikat dari 312 halaman per 2026-08-18), jadi ini murni mengunci
-- aturan yang selama ini sudah dipatuhi — bukan pembersihan.
CREATE UNIQUE INDEX IF NOT EXISTS survey_pages_submission_id_key
  ON public.survey_pages (submission_id)
  WHERE submission_id IS NOT NULL;


-- ============================================
-- 8. PRE-CHECK — jalankan SEBELUM bagian 0-7
-- ============================================
-- Angka di file ini potret 2026-08-18. Order masuk tiap hari, jadi ujinya
-- ditulis RELASIONAL (cermin diadu dengan sumbernya), bukan lawan konstanta.
--
-- -- (1) Besarnya regresi bagian 0. Selisihnya = baris yang akan lahir.
-- SELECT (SELECT COUNT(*) FROM form_submissions)                       AS order_total,
--        (SELECT COUNT(*) FROM ad_schedules WHERE ordinal = 1)         AS cermin_ordinal1,
--        (SELECT COUNT(*) FROM form_submissions)
--          - (SELECT COUNT(*) FROM ad_schedules WHERE ordinal = 1)     AS akan_lahir;
--
-- -- (2) Cabang DELETE memang masih hidup. Harus true sebelum, false sesudah.
-- SELECT position('DELETE FROM ad_schedules' IN pg_get_functiondef(p.oid)) > 0 AS masih_ada_delete
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'sync_ad_schedule_from_submission';
--
-- -- (3) survey_pages sudah bersih. Kolom kedua HARUS 0 atau bagian 7 gagal.
-- SELECT COUNT(*) FILTER (WHERE submission_id IS NULL) AS tanpa_submission,
--        (SELECT COUNT(*) FROM (
--           SELECT submission_id FROM survey_pages
--           WHERE submission_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1) x) AS duplikat
-- FROM survey_pages;
--
-- -- (4) Sidik waktu SEBELUM. Simpan hasilnya, adu dengan §9(4) sesudahnya.
-- SELECT MD5(STRING_AGG(
--          source_table || '|' || source_id || '|' ||
--          COALESCE(EXTRACT(EPOCH FROM start_date)::TEXT, '-') || '|' ||
--          COALESCE(EXTRACT(EPOCH FROM end_date)::TEXT, '-'),
--          E'\n' ORDER BY source_table, source_id)) AS sidik_waktu
-- FROM ad_schedules WHERE start_date IS NOT NULL;


-- ============================================
-- 9. VERIFIKASI — jalankan SESUDAH menerapkan
-- ============================================
-- -- (1) Aturan sql/46 §7(1) pulih. Ketiganya harus sama, selisih 0.
-- SELECT (SELECT COUNT(*) FROM form_submissions)               AS order_total,
--        (SELECT COUNT(*) FROM ad_schedules WHERE ordinal = 1) AS cermin_ordinal1,
--        (SELECT COUNT(*) FROM form_submissions)
--          - (SELECT COUNT(*) FROM ad_schedules WHERE ordinal = 1) AS selisih_harus_0;
--
-- -- (2) Cabang DELETE benar-benar hilang. Harus false.
-- SELECT position('DELETE FROM ad_schedules' IN pg_get_functiondef(p.oid)) > 0 AS masih_ada_delete
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'sync_ad_schedule_from_submission';
--
-- -- (3) ⚠️ UJI TRIGGER HIDUP — yang GAGAL sebelum file ini. Mengosongkan
-- -- tanggal harus MEMPERTAHANKAN baris (status 'unscheduled'), dan booking_id
-- -- HARUS SAMA sebelum & sesudah. Semuanya dibatalkan di akhir.
-- BEGIN;
--   CREATE TEMP TABLE _t51 AS
--   SELECT fs.id, fs.start_date, fs.end_date,
--          (SELECT booking_id FROM ad_schedules
--            WHERE source_table='form_submissions' AND source_id=fs.id) AS bid_sebelum
--   FROM form_submissions fs
--   WHERE fs.start_date IS NOT NULL AND fs.distribution_type <> 'kilat' LIMIT 1;
--
--   UPDATE form_submissions SET start_date = NULL, end_date = NULL
--   WHERE id = (SELECT id FROM _t51);
--
--   SELECT COUNT(*) AS harus_1, MAX(a.status) AS harus_unscheduled,
--          MAX(a.booking_id) = MAX(t.bid_sebelum) AS booking_id_bertahan
--   FROM ad_schedules a, _t51 t
--   WHERE a.source_table='form_submissions' AND a.source_id = t.id;
--
--   UPDATE form_submissions fs SET start_date = t.start_date, end_date = t.end_date
--   FROM _t51 t WHERE fs.id = t.id;
-- ROLLBACK;
--
-- -- (4) Sidik waktu SESUDAH — harus IDENTIK dengan §8(4). Bagian 0 tidak boleh
-- -- menggeser jadwal yang sudah ada, hanya menambah yang hilang.
-- SELECT MD5(STRING_AGG(
--          source_table || '|' || source_id || '|' ||
--          COALESCE(EXTRACT(EPOCH FROM start_date)::TEXT, '-') || '|' ||
--          COALESCE(EXTRACT(EPOCH FROM end_date)::TEXT, '-'),
--          E'\n' ORDER BY source_table, source_id)) AS sidik_waktu
-- FROM ad_schedules WHERE start_date IS NOT NULL;
--
-- -- (5) booking_id: unik, tanpa NULL, tanpa karakter ambigu. Semua kolom 0
-- -- kecuali yang pertama.
-- SELECT COUNT(*) - COUNT(DISTINCT booking_id)                        AS kembar_harus_0,
--        COUNT(*) FILTER (WHERE booking_id IS NULL)                   AS null_harus_0,
--        COUNT(*) FILTER (WHERE booking_id ~ '[0O1ILU]')              AS ambigu_harus_0,
--        COUNT(*) FILTER (WHERE LENGTH(booking_id) <> 8)              AS panjang_salah_harus_0
-- FROM ad_schedules;
--
-- -- (6) schedule_id: yatim dihitung, bukan diasumsikan. Per 2026-08-18
-- -- ekspektasinya 4 dan 4 — semuanya milik order yang cerminnya lahir di
-- -- bagian 0, jadi SESUDAH migrasi ini angkanya harus 0.
-- SELECT (SELECT COUNT(*) FROM transactions WHERE schedule_id IS NULL) AS txn_yatim,
--        (SELECT COUNT(*) FROM invoices     WHERE schedule_id IS NULL) AS inv_yatim,
--        (SELECT COUNT(*) FROM transactions) AS txn_total,
--        (SELECT COUNT(*) FROM invoices)     AS inv_total;
--
-- -- (7) Penautannya benar, bukan sekadar terisi. Kedua kolom harus 0.
-- SELECT COUNT(*) FILTER (WHERE t.entity_type = 'extend'
--                           AND a.source_id IS DISTINCT FROM t.extend_id)          AS extend_salah_tautan,
--        COUNT(*) FILTER (WHERE COALESCE(t.entity_type,'') <> 'extend'
--                           AND a.source_id IS DISTINCT FROM t.form_submission_id) AS submission_salah_tautan
-- FROM transactions t JOIN ad_schedules a ON a.id = t.schedule_id;
--
-- -- (8) Trigger penurun bekerja untuk baris BARU. Harus mengembalikan 1 baris
-- -- dengan schedule_id terisi. Dibatalkan di akhir.
-- BEGIN;
--   INSERT INTO transactions (form_submission_id, amount, status, payment_id)
--   SELECT source_id, 1, 'pending', 'T51-PROBE-' || gen_random_uuid()
--   FROM ad_schedules WHERE ordinal = 1 LIMIT 1
--   RETURNING schedule_id IS NOT NULL AS terisi_otomatis;
-- ROLLBACK;
--
-- -- (9) Alur lama tidak regresi.
-- --   SELECT cron_activate_extends();


-- ============================================
-- 10. ROLLBACK
-- ============================================
-- Seluruh file ini aditif; membatalkannya tidak menyentuh satu pun data lama.
--
-- DROP TRIGGER IF EXISTS trg_derive_schedule_id ON public.invoices;
-- DROP TRIGGER IF EXISTS trg_derive_schedule_id ON public.transactions;
-- DROP FUNCTION IF EXISTS derive_schedule_id();
-- ALTER TABLE public.invoices     DROP COLUMN IF EXISTS schedule_id;
-- ALTER TABLE public.transactions DROP COLUMN IF EXISTS schedule_id;
--
-- DROP TRIGGER IF EXISTS trg_assign_booking_id ON public.ad_schedules;
-- DROP FUNCTION IF EXISTS assign_booking_id();
-- ALTER TABLE public.ad_schedules DROP COLUMN IF EXISTS booking_id;  -- ikut membuang UNIQUE-nya
-- DROP FUNCTION IF EXISTS generate_booking_id();
--
-- DROP INDEX IF EXISTS survey_pages_submission_id_key;
--
-- ⚠️ BAGIAN 0 SENGAJA TIDAK PUNYA ROLLBACK. Mengembalikan cabang DELETE berarti
-- mengembalikan bug-nya, dan baris ordinal 1 yang lahir di sini akan terhapus
-- sendiri begitu tanggalnya dikosongkan. Kalau benar-benar harus, jalankan
-- ulang sql/49 bagian 4 — lalu catat bahwa uji paritas sql/46 §7(1) kembali
-- gagal, dan sql/52 TIDAK BOLEH diterapkan sampai ia hijau lagi.
