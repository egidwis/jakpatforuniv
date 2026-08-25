-- ─────────────────────────────────────────────────────────────────────────────
-- sql/70 — `review_status` jadwal ke-2 dst. berhenti beku
--
-- GEJALA. Dua dari sepuluh baris `ad_schedules` ordinal ≥2 di produksi
-- (terukur 2026-08-25) menyimpan `review_status = 'approved'` sementara induknya
-- sudah lama `spam` / `cancelled`:
--
--   submission b672d1ae…  induk spam       → jadwal ke-2 masih 'approved'
--   submission dfd17a09…  induk cancelled  → jadwal ke-2 masih 'approved'
--
-- Akibatnya kartu jadwal ke-2 di dashboard peneliti tampil seolah lolos review
-- untuk order yang justru ditandai sampah — dan sisi admin membaca kolom yang sama.
--
-- ⚠️ PENYEBABNYA BUKAN YANG DIDUGA SEMULA. Rencana audit menunjuk
-- `extend_view_update()` (sql/52) yang memang tidak memperbarui `review_status`.
-- Itu benar, tapi bukan sumbernya: kedua baris di atas menyimpang saat INDUKNYA
-- berubah status, dan yang menangani itu `sync_ad_schedule_from_submission()` —
-- yang menyentuh `source_table = 'form_submissions'` SAJA, yaitu ordinal 1.
-- Menambal view saja akan lulus hari ini dan menyimpang lagi pada order
-- berikutnya yang ditandai spam.
--
-- Karena itu migrasi ini menutup KEDUA lubang:
--
--   Bagian 1 — `sync_ad_schedule_from_submission()` meneruskan review_status
--              induk ke seluruh jadwal lanjutan. Ini penyebab sesungguhnya.
--   Bagian 2 — `extend_view_update()` menurunkan review_status dari induk saat
--              view ditulis. Pertahanan berlapis: view-nya TIDAK punya kolom
--              `review_status` sama sekali (lihat definisinya di sql/52), jadi
--              nilainya wajib diturunkan, tidak bisa dikirim pemanggil.
--   Bagian 3 — menyembuhkan baris yang telanjur menyimpang.
--   Bagian 4 — uji relasional.
--
-- ⚠️ BADAN FUNGSI DI BAGIAN 1 DISALIN DARI sql/51, BUKAN sql/49.
-- `CREATE OR REPLACE FUNCTION` mengganti SELURUH badan, jadi menyalin dari
-- berkas yang salah akan menghidupkan kembali kode yang sudah sengaja dibuang.
-- Yang nyaris terjadi di sini: sql/49 punya cabang
-- `IF NEW.start_date IS NULL THEN DELETE FROM ad_schedules … RETURN NULL`, dan
-- sql/51 MEMBUANGNYA dengan sengaja — mengembalikannya akan menghapus jadwal
-- beserta booking_id-nya begitu admin mengosongkan tanggal. Versi produksi
-- (diperiksa lewat `pg_get_functiondef` sebelum migrasi ini ditulis) memang
-- versi sql/51. Periksa lagi sebelum mengubah fungsi ini di kemudian hari.
--
-- Idempotent & aman diulang. Nol DDL pada tabel — hanya fungsi dan data.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Induk mendorong review_status ke SELURUH jadwalnya
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- ── TAMBAHAN sql/70 ──
  -- Jadwal lanjutan mewarisi sumbu review induknya — aturan yang sama yang sudah
  -- dipakai `extend_view_insert()` (sql/52) saat barisnya lahir. Yang hilang
  -- selama ini cuma PEMBARUANNYA: blok di bawah menyentuh
  -- `source_table = 'form_submissions'` saja, jadi anak-anaknya tidak pernah
  -- diberi tahu saat induknya berubah status.
  --
  -- ⚠️ `IS DISTINCT FROM` di WHERE bukan penghias. Tanpa itu setiap update induk
  -- menulis ulang baris anak, dan `compute_extend_period_batch()` (sql/52)
  -- menyetel `updated_at := NOW()` pada SETIAP tulisan ke baris extend — jejak
  -- waktu jadwal lanjutan akan berdenyut tiap kali induknya disentuh.
  --
  -- Penjaga `guard_extend_payment_columns` (sql/33) yang menyala untuk baris
  -- extend tidak terusik: ia hanya menolak perubahan pada empat kolom uang
  -- (payment_status, total_cost, subtotal, ppn_amount), dan `review_status`
  -- bukan salah satunya.
  UPDATE ad_schedules
     SET review_status = review_status_of(NEW.submission_status)
   WHERE submission_id = NEW.id
     AND source_table  = 'form_submissions_extend'
     AND review_status IS DISTINCT FROM review_status_of(NEW.submission_status);

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

COMMENT ON FUNCTION sync_ad_schedule_from_submission() IS
  'Cermin form_submissions -> ad_schedules ordinal 1, PLUS penerusan review_status '
  'ke jadwal lanjutan (sql/70). Sebelum sql/70 anak-anaknya tidak pernah ikut induk '
  'berubah status, jadi jadwal ke-2 order spam tetap terbaca ''approved''. '
  'TANPA cabang start_date IS NULL -> DELETE: dibuang sengaja di sql/51.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tulisan lewat view ikut menurunkan review_status
--
-- View `form_submissions_extend` TIDAK punya kolom `review_status` (sql/52),
-- jadi nilainya tidak bisa datang dari `NEW` — ia harus diturunkan dari induk,
-- persis seperti `extend_view_insert()` melakukannya.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.extend_view_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_review_status TEXT;
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

  -- ── TAMBAHAN sql/70 ──
  SELECT review_status_of(fs.submission_status)
    INTO v_review_status
    FROM form_submissions fs
   WHERE fs.id = NEW.submission_id;

  UPDATE ad_schedules SET
    submission_id               = NEW.submission_id,
    start_date                  = NEW.start_date,
    end_date                    = NEW.end_date,
    duration                    = NEW.duration,
    status                      = NEW.submission_status,
    -- Induk hilang seharusnya mustahil (ada FK), tapi kalau toh terjadi,
    -- PERTAHANKAN nilai lama — menulis NULL akan menghapus sumbu review dan
    -- membuat kartunya kehilangan keadaan sama sekali.
    review_status               = COALESCE(v_review_status, ad_schedules.review_status),
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Menyembuhkan baris yang sudah menyimpang — LANGSUNG, bukan lewat induk
--
-- ⚠️ PENDEKATAN "SENTUH INDUKNYA" DIPERTIMBANGKAN LALU DITOLAK.
--
-- Pola yang terbukti di sql/69 adalah `SET submission_status = submission_status`
-- pada `form_submissions` — menyalakan `trg_ad_schedule_from_submission` tanpa
-- mengubah nilai (`updated_at` TIDAK ada di daftar `UPDATE OF`-nya, jadi
-- menyentuh itu akan jadi no-op senyap).
--
--   Dugaan awal saat menulis migrasi ini: menyentuh induk akan menjalankan
--   cabang `start_date IS NULL -> DELETE`, dan salah satu dari dua induk yang
--   perlu disembuhkan (b672d1ae…) memang ber-`start_date` NULL sambil masih
--   memiliki baris cermin ordinal 1 senilai Rp 222.000. Pemeriksaan ke
--   produksi MEMBANTAH dugaan itu: cabang tersebut sudah dibuang sql/51, jadi
--   sentuhan induk aman — dan ke-94 baris cermin "yatim" yang sempat terhitung
--   ternyata BUKAN sampah, melainkan justru yang dilindungi sql/51.
--
--   Yang tersisa dari pertimbangan itu tetap berlaku: sentuhan induk
--   menjalankan ULANG seluruh upsert cermin ordinal 1 demi memperbaiki satu
--   kolom di baris anak. Cakupan sebesar itu tidak ada alasannya di sini.
--
-- Jadi penyembuhannya menulis `ad_schedules` langsung. Ia tidak bisa jadi no-op
-- senyap (tidak ada trigger yang perlu dibujuk), cakupannya persis baris yang
-- salah, dan nol baris lain tersentuh.
--
-- Bahwa TRIGGERNYA benar-benar hidup dijaga Bagian 1 untuk perubahan berikutnya;
-- invariannya diuji ulang di Bagian 4.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE ad_schedules s
   SET review_status = review_status_of(f.submission_status)
  FROM form_submissions f
 WHERE f.id = s.submission_id
   AND s.source_table  = 'form_submissions_extend'
   AND s.review_status IS DISTINCT FROM review_status_of(f.submission_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Uji relasional — bukan angka konstan
--
-- Sengaja TIDAK berbunyi "harus 2 baris yang berubah". Angka konstan lulus
-- karena kebetulan dan berbohong saat data bergerak; yang diuji di sini adalah
-- INVARIANNYA: tidak boleh ada jadwal lanjutan yang sumbu review-nya berbeda
-- dari yang dihasilkan `review_status_of()` atas induknya.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_drift INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_drift
    FROM ad_schedules s
    JOIN form_submissions f ON f.id = s.submission_id
   WHERE s.source_table = 'form_submissions_extend'
     AND s.review_status IS DISTINCT FROM review_status_of(f.submission_status);

  IF v_drift > 0 THEN
    RAISE EXCEPTION
      'sql/70 GAGAL: masih ada % jadwal lanjutan yang review_status-nya menyimpang dari induknya.',
      v_drift;
  END IF;

  RAISE NOTICE 'sql/70 OK — nol jadwal lanjutan menyimpang dari induknya.';
END $$;

COMMIT;
