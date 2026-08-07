-- ============================================================
-- Migration 46: ad_schedules dapat sumbu kedua (review vs tayang)
-- Date: 2026-08-08
-- Phase 3, Task 9A dari docs/superpowers/plans/2026-08-05-phase-3-jadwal-iklan-terpadu.md
--
-- MASALAHNYA
-- ----------
-- form_submissions.submission_status memikul DUA sumbu sekaligus:
--   sumbu review  : in_review | approved | rejected | spam
--   sumbu tayang  : waiting_payment | paid | scheduled | live | completed
-- Satu kolom, satu nilai — jadi sebuah order hanya bisa mengatakan satu di
-- antara keduanya. sql/41 menyalin kolom itu apa adanya, dan cabang ELSE-nya
-- ("in_review/approved/slot_reserved/apa pun → waiting_payment") melipat empat
-- keadaan yang berbeda jadi satu keranjang.
--
-- Terukur 2026-08-08 atas 971 order: 564 dari 884 baris cermin ordinal 1 duduk
-- di keranjang 'waiting_payment' — 393 di antaranya belum direview sama sekali,
-- dan hanya SATU yang benar-benar menunggu pembayaran. Sebuah papan yang
-- membaca kolom itu akan memberi tahu admin bahwa 564 order menunggu ditagih.
--
-- LUBANG KEDUA: 87 ORDER TIDAK ADA DI CERMIN SAMA SEKALI
-- -----------------------------------------------------
-- sql/41 bagian 4 menghapus baris cermin begitu start_date jadi NULL, dan
-- backfill-nya menyaring `WHERE fs.start_date IS NOT NULL`. Konsekuensinya
-- order yang belum punya tanggal tidak punya baris — 87 order per 2026-08-08,
-- termasuk 2 order LUNAS yang jadwalnya belum ditetapkan. Justru order itulah
-- yang paling perlu terlihat di papan pantau.
--
-- Cabang DELETE itu sendiri jebakan yang menunggu: hari ini admin yang
-- mengosongkan tanggal diam-diam menghapus baris cermin. Sesudah Task 11 —
-- ketika ad_schedules jadi otoritatif — yang terhapus adalah jadwalnya sendiri.
--
-- APA YANG BERUBAH
-- ----------------
--   1. Kolom baru review_status  — sumbu review, milik ORDER (semua baris satu
--      order berbagi nilai yang sama, termasuk baris perpanjangan).
--   2. status jadi sumbu TAYANG SAJA, dengan tiga nilai baru yang selama ini
--      runtuh: unscheduled | requested | slot_reserved.
--   3. Setiap order punya baris ordinal 1, SELALU. Cabang DELETE dibuang.
--
-- AMAN KARENA CERMIN MASIH TANPA PEMBACA. Diverifikasi ulang 2026-08-08:
--   * nol kemunculan 'ad_schedules' di seluruh multi-step-form/src dan
--     multi-step-form/functions (hanya satu komentar di supabase.ts:1588);
--   * nol view/materialized view yang menyebutnya (pg_get_viewdef);
--   * nol fungsi DB yang menyebutnya selain ketiga fungsi sync-nya sendiri.
-- Apa pun yang salah di file ini tidak bisa menyentuh alur lama — premis yang
-- ditulis di kepala sql/41 dan masih berlaku persis.
--
-- ⚠️ ANGKA DI FILE INI ADALAH POTRET 2026-08-08, BUKAN GERBANG
-- Order masuk setiap hari: 954 pada 2026-08-07 jadi 971 pada 2026-08-08 — 17
-- order dalam sehari. Setiap uji di bagian 7 karena itu ditulis RELASIONAL
-- (cermin diadu dengan sumbernya), bukan terhadap konstanta. Angka absolut di
-- bawah hanya konteks; kalau ia berbeda saat kamu menjalankannya, itu normal.
-- Yang TIDAK boleh berbeda adalah selisihnya terhadap sumber: nol.
--
-- ⚠️ NILAI 'status' TIDAK BOLEH DIBACA SEBAGAI SUMBU REVIEW LAGI
-- Sesudah file ini, 'unscheduled'/'requested' berarti "belum ada jendela tayang
-- yang disepakati" — BUKAN "belum direview". Untuk itu baca review_status.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER IF EXISTS, INSERT … ON CONFLICT DO UPDATE. Aman dijalankan ulang.
-- TANPA perubahan data di form_submissions maupun form_submissions_extend.
-- BERGANTUNG pada sql/39 (airing_instant_of_date), sql/41 (ad_schedules),
-- sql/42 (kilat_slot_hour), sql/45 (kilat_instant_of, distribution_type).
-- Keempatnya sudah di produksi.
-- JALANKAN PRE-CHECK DI BAGIAN 6 LEBIH DULU.
-- ============================================================


-- ============================================
-- 1. Dua helper pemetaan
-- ============================================
-- Ditulis sebagai fungsi, bukan ekspresi inline, supaya trigger dan backfill
-- tidak bisa menyimpang satu sama lain. Itu pelajaran yang melahirkan sql/44
-- dan diulang sql/45 — dan di file ini taruhannya lebih tinggi lagi, karena
-- pemetaannya dipakai di EMPAT tempat (dua trigger, dua backfill).

-- Sumbu review. TERJEMAHAN HARFIAH dari getDisplayStatus()
-- (src/components/submissions/lifecycle.ts:35) — daftar nilainya disalin dari
-- RESERVABLE_STATUSES di baris 32 file itu, urutan dan isi sama persis.
-- Kalau salah satu berubah, yang satunya harus ikut. Sengaja mengikuti pola
-- fallback TS-nya (nilai tak dikenal lewat apa adanya, NULL jadi 'pending')
-- alih-alih memaksa masuk salah satu dari empat nilai: cermin tidak boleh
-- MENOLAK apa yang diterima sumbernya, dan uji paritas baris-demi-baris di
-- §7(3) baru bermakna kalau keduanya berperilaku identik untuk nilai apa pun.
CREATE OR REPLACE FUNCTION review_status_of(p_submission_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_submission_status, 'pending') IN
         ('approved', 'slot_reserved', 'waiting_payment', 'paid', 'scheduled', 'live', 'completed')
      THEN 'approved'
    ELSE COALESCE(p_submission_status, 'pending')
  END;
$$;

COMMENT ON FUNCTION review_status_of(TEXT) IS
  'Sumbu review sebuah order dari submission_status: in_review | approved | rejected | spam. Terjemahan harfiah getDisplayStatus() di src/components/submissions/lifecycle.ts — ubah keduanya bersamaan. Nilai tak dikenal lewat apa adanya (sql/46).';

-- Sumbu tayang. Urutan cabangnya SIGNIFIKAN dan mengikuti presedens yang sudah
-- ada di sql/41: rejected/spam mengalahkan segalanya (sql/38 sudah
-- memperlakukannya sebagai tidak menempati jendela mana pun).
--
-- Perbedaan dengan sql/41 ada di dua cabang terakhir. Di sana keduanya jatuh ke
-- ELSE 'waiting_payment'; di sini mereka dibedakan oleh ADA TIDAKNYA TANGGAL:
--   * 'requested'   — order sudah memilih jendela tayang, tapi jendela itu
--                     belum jadi kesepakatan. 490 order per 2026-08-08.
--   * 'unscheduled' — belum ada jendela sama sekali. 26 order.
-- Dua nilai, bukan satu, karena 393 order 'in_review' TERNYATA PUNYA TANGGAL:
-- order memilih jadwal saat checkout, jauh sebelum admin mereviewnya. Melipat
-- keduanya jadi 'unscheduled' akan mengulang persis kesalahan yang file ini ada
-- untuk memperbaikinya — menyatakan "tidak punya jendela tayang" untuk baris
-- yang tanggalnya ada di kolom sebelah.
--
-- 'slot_reserved' naik jadi nilai sendiri: ia keadaan tayang yang nyata (slot
-- ditahan, kuota berkurang) dan hari ini tidak bisa dibedakan dari "belum
-- direview". 4 di antaranya tidak punya tanggal sama sekali — kejanggalan data,
-- bukan salah hitung; cermin menyalinnya apa adanya dan tidak menghakimi.
CREATE OR REPLACE FUNCTION airing_status_of(p_submission_status TEXT, p_has_dates BOOLEAN)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_submission_status IN ('rejected', 'spam') THEN 'cancelled'
    WHEN p_submission_status IN ('waiting_payment', 'paid', 'scheduled', 'live', 'completed')
      THEN p_submission_status
    WHEN p_submission_status = 'slot_reserved' THEN 'slot_reserved'
    WHEN COALESCE(p_has_dates, false) THEN 'requested'
    ELSE 'unscheduled'
  END;
$$;

COMMENT ON FUNCTION airing_status_of(TEXT, BOOLEAN) IS
  'Sumbu tayang saja, dari submission_status + ada/tidaknya tanggal. Menggantikan cabang ELSE sql/41 yang melipat in_review/approved/slot_reserved jadi waiting_payment (sql/46).';


-- ============================================
-- 2. Kolom baru
-- ============================================
-- Tanpa CHECK constraint, alasan sama seperti sql/41 dan sql/45: cermin tidak
-- boleh bisa MENOLAK apa yang diterima sumbernya. CHECK yang gagal di sini
-- membuat trigger melempar dan menjatuhkan alur LAMA.
ALTER TABLE public.ad_schedules
  ADD COLUMN IF NOT EXISTS review_status TEXT;

COMMENT ON COLUMN public.ad_schedules.review_status IS
  'Sumbu review, milik ORDER: in_review | approved | rejected | spam. Semua baris satu order berbagi nilai yang sama, termasuk baris perpanjangan. Diturunkan lewat review_status_of() — kembarannya di klien adalah getDisplayStatus() (src/components/submissions/lifecycle.ts). Ditambahkan sql/46.';

-- Diperbarui: status bukan lagi campuran dua sumbu.
COMMENT ON COLUMN public.ad_schedules.status IS
  'Sumbu TAYANG saja: unscheduled | requested | slot_reserved | waiting_payment | paid | scheduled | live | completed | cancelled. unscheduled/requested TIDAK berarti "belum direview" — untuk itu baca review_status (sql/46). Sengaja tanpa constraint selagi tabel ini cermin — lihat header sql/41.';

-- Papan pantau Phase 3 menyaring per keadaan review lalu mengurut per tanggal.
CREATE INDEX IF NOT EXISTS idx_ad_schedules_review
  ON public.ad_schedules (review_status, start_date);


-- ============================================
-- 3. Mirror: form_submissions -> ad_schedules (ordinal 1)
-- ============================================
-- Turunan sql/45 bagian 3. Tiga perubahan, tidak ada yang lain diselundupkan:
--   (a) cabang DELETE dibuang — lihat (3b) di bawah;
--   (b) status lewat airing_status_of();
--   (c) review_status ikut ditulis.
--
-- (3b) KENAPA CABANG DELETE DIBUANG
-- Aturannya jadi TOTAL: satu order = satu baris ordinal 1, selalu. Tiga
-- keuntungan yang saling menguatkan:
--   * papan bisa menampilkan order tanpa tanggal dari SATU tabel, bukan dari
--     UNION cermin dengan form_submissions;
--   * paritasnya jadi sepele diuji — COUNT(*) WHERE ordinal=1 harus PERSIS
--     COUNT(*) FROM form_submissions, tanpa syarat apa pun (§7(1));
--   * jebakan "mengosongkan tanggal = menghapus baris" ditutup permanen.
--
-- Konsekuensi yang DITERIMA SADAR: 55 baris spam/rejected tanpa tanggal ikut
-- masuk, dan memang bukan jendela tayang. Aturan tanpa cabang lebih murah
-- daripada perkecualian yang harus dievaluasi ulang setiap kali order berpindah
-- status; papan menyaringnya di UI lewat review_status.
--
-- ⚠️ NULL-SAFETY SUDAH DIPERIKSA, JANGAN DIBUNGKUS ULANG
-- airing_instant_of_date(NULL) dan kilat_instant_of(NULL, …) keduanya
-- mengembalikan NULL: badannya ekspresi SQL biasa (`d + TIME '15:00'`,
-- `d + make_time(...)`) dan NULL merambat lewatnya. Diperiksa langsung di
-- sql/39 baris 58-64 dan sql/45 baris 99-105. TO_CHAR(NULL, 'YYYY-MM') juga
-- NULL. Jadi baris tanpa tanggal mendarat dengan start_date/end_date/
-- period_batch NULL tanpa penjagaan tambahan.
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
  -- Cabang waktu sql/45 dipertahankan utuh: Kilat didorong per gelombang,
  -- iklan regular selalu 15.00 WIB. Iklan regular tidak boleh bergeser
  -- sedetik pun — §7(5) yang membuktikannya.
  IF NEW.distribution_type = 'kilat' THEN
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
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT ON CONSTRAINT ad_schedules_source_key DO UPDATE SET
    start_date        = EXCLUDED.start_date,
    end_date          = EXCLUDED.end_date,
    duration          = EXCLUDED.duration,
    status            = EXCLUDED.status,
    review_status     = EXCLUDED.review_status,
    payment_status    = EXCLUDED.payment_status,
    prize_per_winner  = EXCLUDED.prize_per_winner,
    winner_count      = EXCLUDED.winner_count,
    period_batch      = EXCLUDED.period_batch,
    total_cost        = EXCLUDED.total_cost,
    subtotal          = EXCLUDED.subtotal,
    ppn_amount        = EXCLUDED.ppn_amount,
    voucher_code      = EXCLUDED.voucher_code,
    slot_booked_by    = EXCLUDED.slot_booked_by,
    slot_reserved_at  = EXCLUDED.slot_reserved_at,
    admin_notes       = EXCLUDED.admin_notes,
    distribution_type = EXCLUDED.distribution_type,
    kilat_slot_hour   = EXCLUDED.kilat_slot_hour,
    updated_at        = EXCLUDED.updated_at;

  RETURN NULL;
END;
$$;

-- Trigger TIDAK dibuat ulang: daftar UPDATE OF-nya sudah benar sejak sql/45
-- (submission_status, start_date, end_date, distribution_type, kilat_slot_hour
-- semuanya ada di sana). Yang berubah cuma isi fungsinya.


-- ============================================
-- 4. Mirror: form_submissions_extend -> ad_schedules (ordinal 2..n)
-- ============================================
-- Turunan sql/45 bagian 4 dengan SATU tambahan: review_status distempel dari
-- order induk, persis pola yang sudah dipakai sql/45 untuk distribution_type.
--
-- status baris perpanjangan TIDAK disentuh. form_submissions_extend.
-- submission_status sudah memakai kosakata sumbu tayang sejak awal — terukur
-- 2026-08-08: completed 7, scheduled 2, waiting_payment 2, cancelled 1, nol
-- NULL, nol tanpa tanggal. Tidak ada yang perlu dipetakan.
--
-- ⚠️ review_status perpanjangan datang dari INDUKNYA, bukan dari barisnya
-- sendiri. Perpanjangan bukan objek review — yang direview adalah surveinya.
-- Perpanjangan milik order yang ditolak karena itu ber-review_status
-- 'rejected' meski status tayangnya sendiri 'completed'. Itu benar: papan
-- menyaring per order, dan sebuah order yang ditolak tidak boleh muncul di
-- antrean review hanya karena punya baris perpanjangan.
CREATE OR REPLACE FUNCTION sync_ad_schedule_from_extend()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission_id     UUID;
  v_distribution_type TEXT;
  v_review_status     TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_submission_id := OLD.submission_id;
    DELETE FROM ad_schedules
    WHERE source_table = 'form_submissions_extend' AND source_id = OLD.id;
    PERFORM resync_ad_schedule_ordinals(v_submission_id);
    RETURN NULL;
  END IF;

  v_submission_id := NEW.submission_id;

  SELECT fs.distribution_type, review_status_of(fs.submission_status)
    INTO v_distribution_type, v_review_status
  FROM form_submissions fs WHERE fs.id = NEW.submission_id;

  -- Ordinal 2 adalah placeholder: resync di bawah menetapkan nomor sebenarnya
  -- sebelum statement berakhir, dan ad_schedules_ordinal_key ditunda sampai
  -- COMMIT, jadi tabrakan sesaat di sini legal. Ordinal 1 tidak pernah jadi
  -- kandidat — resync_ad_schedule_ordinals() menomori mulai dari 2 (sql/41
  -- bagian 3, `1 + ROW_NUMBER()`), jadi baris induk yang kini selalu ada tidak
  -- bisa ditabrak.
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
  )
  VALUES (
    NEW.submission_id, 2, 'form_submissions_extend', NEW.id,
    NEW.start_date, NEW.end_date, NEW.duration,
    COALESCE(NEW.submission_status, 'waiting_payment'),
    v_review_status,
    NEW.payment_status,
    COALESCE(NEW.prize_per_winner, 0),
    COALESCE(NEW.winner_count, 0),
    COALESCE(NEW.additional_prize_per_winner, 0),
    COALESCE(NEW.is_new_month, false),
    NEW.period_batch,
    COALESCE(NEW.total_cost, 0), NEW.subtotal, NEW.ppn_amount, NEW.voucher_code,
    NEW.slot_booked_by, NEW.slot_reserved_at, NEW.admin_notes,
    v_distribution_type, NULL,
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT ON CONSTRAINT ad_schedules_source_key DO UPDATE SET
    start_date                  = EXCLUDED.start_date,
    end_date                    = EXCLUDED.end_date,
    duration                    = EXCLUDED.duration,
    status                      = EXCLUDED.status,
    review_status               = EXCLUDED.review_status,
    payment_status              = EXCLUDED.payment_status,
    prize_per_winner            = EXCLUDED.prize_per_winner,
    winner_count                = EXCLUDED.winner_count,
    additional_prize_per_winner = EXCLUDED.additional_prize_per_winner,
    is_new_period               = EXCLUDED.is_new_period,
    period_batch                = EXCLUDED.period_batch,
    total_cost                  = EXCLUDED.total_cost,
    subtotal                    = EXCLUDED.subtotal,
    ppn_amount                  = EXCLUDED.ppn_amount,
    voucher_code                = EXCLUDED.voucher_code,
    slot_booked_by              = EXCLUDED.slot_booked_by,
    slot_reserved_at            = EXCLUDED.slot_reserved_at,
    admin_notes                 = EXCLUDED.admin_notes,
    distribution_type           = EXCLUDED.distribution_type,
    updated_at                  = EXCLUDED.updated_at;

  IF TG_OP = 'INSERT' OR NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    PERFORM resync_ad_schedule_ordinals(v_submission_id);
  END IF;

  RETURN NULL;
END;
$$;

-- ⚠️ LUBANG YANG TETAP MENGANGA, DICATAT BUKAN DITUTUP
-- review_status baris perpanjangan berasal dari order induk, tapi TIDAK ADA
-- trigger di form_submissions yang menyegarkannya: mereview ulang sebuah order
-- yang punya perpanjangan meninggalkan baris perpanjangan itu di review_status
-- lamanya. Sama persis dengan lubang distribution_type yang diwarisi sql/45.
--
-- Hari ini konsekuensinya nol — 12 perpanjangan, semuanya milik order yang
-- sudah lama lewat review. Menutupnya butuh trigger keempat yang menulis ulang
-- seluruh baris satu order setiap submission_status berubah, dan itu biaya yang
-- tidak dibayar sekarang. §7(6) mengukurnya supaya kalau ia mulai berbohong,
-- ketahuan dari angka, bukan dari keluhan.


-- ============================================
-- 5. Backfill
-- ============================================
-- 5a. Jadwal pertama. Ini yang melahirkan 87 baris yang selama ini hilang DAN
-- memecah 564 baris yang runtuh. `WHERE fs.start_date IS NOT NULL` milik sql/45
-- SENGAJA DIBUANG — itulah seluruh isi perubahan (3b).
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
)
SELECT
  fs.id, 1, 'form_submissions', fs.id,
  CASE WHEN fs.distribution_type = 'kilat'
       THEN kilat_instant_of(fs.start_date, fs.kilat_slot_hour)
       ELSE airing_instant_of_date(fs.start_date) END,
  CASE WHEN fs.distribution_type = 'kilat'
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
  COALESCE(fs.created_at, NOW()), COALESCE(fs.updated_at, NOW())
FROM form_submissions fs
ON CONFLICT ON CONSTRAINT ad_schedules_source_key DO UPDATE SET
  start_date        = EXCLUDED.start_date,
  end_date          = EXCLUDED.end_date,
  duration          = EXCLUDED.duration,
  status            = EXCLUDED.status,
  review_status     = EXCLUDED.review_status,
  payment_status    = EXCLUDED.payment_status,
  prize_per_winner  = EXCLUDED.prize_per_winner,
  winner_count      = EXCLUDED.winner_count,
  period_batch      = EXCLUDED.period_batch,
  total_cost        = EXCLUDED.total_cost,
  subtotal          = EXCLUDED.subtotal,
  ppn_amount        = EXCLUDED.ppn_amount,
  voucher_code      = EXCLUDED.voucher_code,
  slot_booked_by    = EXCLUDED.slot_booked_by,
  slot_reserved_at  = EXCLUDED.slot_reserved_at,
  admin_notes       = EXCLUDED.admin_notes,
  distribution_type = EXCLUDED.distribution_type,
  kilat_slot_hour   = EXCLUDED.kilat_slot_hour,
  updated_at        = EXCLUDED.updated_at;

-- 5b. Perpanjangan — cukup stempel review_status dari induknya. UPDATE, bukan
-- INSERT ulang, alasan sama seperti sql/45 bagian 5b: waktu dan ordinal-nya
-- tidak berubah, jadi tidak digerakkan.
UPDATE ad_schedules a
SET review_status = review_status_of(fs.submission_status)
FROM form_submissions_extend e
JOIN form_submissions fs ON fs.id = e.submission_id
WHERE a.source_table = 'form_submissions_extend'
  AND a.source_id = e.id
  AND a.review_status IS DISTINCT FROM review_status_of(fs.submission_status);


-- ============================================
-- 6. PRE-CHECK — jalankan SEBELUM bagian 1-5
-- ============================================
-- Tidak ada yang menulis di sini. Jalankan SATU PER SATU — SQL Editor Supabase
-- hanya menampilkan hasil statement terakhir kalau dijalankan sekaligus.
--
-- -- (0) Ketergantungan. Keempatnya wajib ada.
-- SELECT p.proname, pg_get_function_arguments(p.oid) AS argumen
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('airing_instant_of_date', 'kilat_instant_of', 'resync_ad_schedule_ordinals')
-- UNION ALL
-- SELECT 'kolom distribution_type', data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='ad_schedules' AND column_name='distribution_type';
--
-- -- (1) ⚠️ PREMIS FILE INI: CERMIN MASIH TANPA PEMBACA DI SISI DB.
-- -- Kedua query harus mengembalikan NOL baris. Kalau tidak, ada pembaca yang
-- -- lahir setelah 2026-08-08 dan kosakata status yang berubah akan mengenainya.
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND p.prokind='f'
--   AND pg_get_functiondef(p.oid) ILIKE '%ad_schedules%'
--   AND p.proname NOT IN ('sync_ad_schedule_from_submission','sync_ad_schedule_from_extend','resync_ad_schedule_ordinals');
-- SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname='public' AND c.relkind IN ('v','m') AND pg_get_viewdef(c.oid) ILIKE '%ad_schedules%';
--
-- -- (2) Peta medan. POTRET 2026-08-08 — catat ulang milikmu, angkanya bergerak
-- -- belasan per hari. Yang penting bukan nilainya, tapi bahwa
-- -- ordinal_1 + hilang = order_total.
-- --   order_total 971 · ordinal_1 884 · hilang_dari_cermin 87 · ordinal_2n 12
-- SELECT
--   (SELECT COUNT(*) FROM form_submissions)                            AS order_total,
--   (SELECT COUNT(*) FROM ad_schedules WHERE ordinal = 1)              AS ordinal_1,
--   (SELECT COUNT(*) FROM form_submissions WHERE start_date IS NULL)   AS hilang_dari_cermin,
--   (SELECT COUNT(*) FROM ad_schedules
--     WHERE source_table='form_submissions_extend')                    AS ordinal_2n;
--
-- -- (3) Sebaran yang DIHARAPKAN sesudah migrasi, dihitung dari SUMBER. Simpan
-- -- hasilnya; §7(4) mengadu sebaran cermin dengan angka-angka ini.
-- -- Potret 2026-08-08: requested 490 · live 172 · cancelled 130 · scheduled 60
-- -- · slot_reserved 48 · paid 36 · unscheduled 26 · completed 8 · waiting_payment 1
-- SELECT airing_status_of(submission_status, start_date IS NOT NULL) AS status_sesudah, COUNT(*)
-- FROM form_submissions GROUP BY 1 ORDER BY 2 DESC;   -- butuh bagian 1 sudah dijalankan
--
-- -- (4) Snapshot waktu untuk §7(5). Baris bertanggal TIDAK BOLEH bergeser.
-- CREATE TEMP TABLE _t46_before AS
-- SELECT source_table, source_id, start_date, end_date FROM ad_schedules;
--
-- -- (5) Anomali yang seharusnya tidak ada: baris cermin tanpa tanggal sumber.
-- -- Terukur 0 pada 2026-08-08 (dua di antaranya masih ada pada 2026-08-07 —
-- -- sudah normal dengan sendirinya). Kalau > 0, migrasi tetap menormalkannya.
-- SELECT COUNT(*) FROM ad_schedules a
-- JOIN form_submissions fs ON fs.id = a.source_id
-- WHERE a.source_table='form_submissions' AND fs.start_date IS NULL;


-- ============================================
-- 7. VERIFIKASI — jalankan SESUDAH menerapkan
-- ============================================
-- Semua uji di bawah RELASIONAL: cermin diadu dengan sumbernya, bukan dengan
-- konstanta. Itu disengaja — data bertambah belasan order per hari, jadi uji
-- berbasis angka tetap akan berbohong besok.
--
-- -- (1) ⚠️ UJI INTINYA. Aturan total: satu order = satu baris ordinal 1.
-- -- Ketiga kolom harus 0.
-- SELECT
--   (SELECT COUNT(*) FROM ad_schedules WHERE ordinal = 1)
--     - (SELECT COUNT(*) FROM form_submissions)                AS selisih_ordinal_1,
--   (SELECT COUNT(*) FROM form_submissions fs WHERE NOT EXISTS (
--      SELECT 1 FROM ad_schedules a
--      WHERE a.source_table='form_submissions' AND a.source_id = fs.id)) AS order_tanpa_baris,
--   (SELECT COUNT(*) FROM ad_schedules WHERE ordinal = 1
--      AND source_table <> 'form_submissions')                 AS ordinal1_bukan_induk;
--
-- -- (2) Paritas perpanjangan tidak tersenggol. Harus 0.
-- SELECT (SELECT COUNT(*) FROM ad_schedules WHERE source_table='form_submissions_extend')
--      - (SELECT COUNT(*) FROM form_submissions_extend) AS selisih_perpanjangan;
--
-- -- (3) ⚠️ review_status BARIS DEMI BARIS, bukan agregat. Harus 0.
-- SELECT COUNT(*) AS review_status_salah
-- FROM ad_schedules a JOIN form_submissions fs ON fs.id = a.submission_id
-- WHERE a.source_table = 'form_submissions'
--   AND a.review_status IS DISTINCT FROM review_status_of(fs.submission_status);
-- -- dan nol yang NULL:
-- SELECT COUNT(*) AS review_status_null FROM ad_schedules WHERE review_status IS NULL;
--
-- -- (4) ⚠️ status BARIS DEMI BARIS. Harus 0. Ini yang membuktikan 564 baris
-- -- yang runtuh benar-benar terpecah.
-- SELECT COUNT(*) AS status_salah
-- FROM ad_schedules a JOIN form_submissions fs ON fs.id = a.source_id
-- WHERE a.source_table = 'form_submissions'
--   AND a.status IS DISTINCT FROM airing_status_of(fs.submission_status, fs.start_date IS NOT NULL);
-- -- Sebarannya, untuk diadu dengan PRE-CHECK (3):
-- SELECT status, COUNT(*) FROM ad_schedules WHERE ordinal = 1 GROUP BY 1 ORDER BY 2 DESC;
--
-- -- (5) ⚠️ TIDAK ADA WAKTU YANG BERGESER. Butuh _t46_before dari PRE-CHECK (4),
-- -- di SESI YANG SAMA (TEMP table mati saat koneksi tutup). Harus 0 baris.
-- SELECT b.source_table, b.source_id, b.start_date AS sebelum, a.start_date AS sesudah
-- FROM _t46_before b JOIN ad_schedules a
--   ON a.source_table = b.source_table AND a.source_id = b.source_id
-- WHERE a.start_date IS DISTINCT FROM b.start_date
--    OR a.end_date   IS DISTINCT FROM b.end_date;
-- -- Iklan regular tetap 15.00 WIB (ulangan §7(2) sql/45). Kedua kolom 0.
-- SELECT COUNT(*) FILTER (WHERE TO_CHAR(a.start_date AT TIME ZONE 'Asia/Jakarta','HH24:MI') <> '15:00') AS jam_salah,
--        COUNT(*) FILTER (WHERE (a.start_date AT TIME ZONE 'Asia/Jakarta')::DATE <> fs.start_date)      AS tanggal_bergeser
-- FROM ad_schedules a JOIN form_submissions fs ON fs.id = a.source_id
-- WHERE a.source_table='form_submissions' AND fs.distribution_type <> 'kilat'
--   AND a.start_date IS NOT NULL;
--
-- -- (6) Kedua sumbu benar-benar terpisah. Baris yang dulu mustahil dibedakan
-- -- sekarang punya nama sendiri; 'unscheduled' tidak boleh punya tanggal dan
-- -- 'requested' harus punya. Kedua kolom terakhir 0.
-- SELECT a.review_status, a.status, COUNT(*),
--        COUNT(*) FILTER (WHERE a.status='unscheduled' AND a.start_date IS NOT NULL) AS unscheduled_bertanggal,
--        COUNT(*) FILTER (WHERE a.status='requested'   AND a.start_date IS NULL)     AS requested_tanpa_tanggal
-- FROM ad_schedules a WHERE a.ordinal = 1
-- GROUP BY 1,2 ORDER BY 3 DESC;
-- -- Lubang review_status perpanjangan (lihat catatan di bawah bagian 4). Hari
-- -- ini 0; kalau mulai naik, trigger keempat itu sudah harus dibayar.
-- SELECT COUNT(*) AS perpanjangan_review_basi
-- FROM ad_schedules a JOIN form_submissions fs ON fs.id = a.submission_id
-- WHERE a.source_table='form_submissions_extend'
--   AND a.review_status IS DISTINCT FROM review_status_of(fs.submission_status);
--
-- -- (7) ⚠️ UJI TRIGGER HIDUP — yang GAGAL sebelum file ini diterapkan.
-- -- Mengosongkan tanggal dulu MENGHAPUS baris; sekarang baris harus BERTAHAN
-- -- dan status-nya jadi 'unscheduled'. Semuanya dibatalkan di akhir.
-- BEGIN;
--   -- ambil satu order regular bertanggal apa pun
--   CREATE TEMP TABLE _t46_subj AS
--   SELECT id, start_date, end_date FROM form_submissions
--   WHERE start_date IS NOT NULL AND distribution_type <> 'kilat' LIMIT 1;
--
--   UPDATE form_submissions SET start_date = NULL, end_date = NULL
--   WHERE id = (SELECT id FROM _t46_subj);
--
--   SELECT COUNT(*) AS harus_1, MAX(status) AS harus_unscheduled, MAX(review_status) AS review_tetap
--   FROM ad_schedules
--   WHERE source_table='form_submissions' AND source_id = (SELECT id FROM _t46_subj);
--
--   UPDATE form_submissions fs SET start_date = s.start_date, end_date = s.end_date
--   FROM _t46_subj s WHERE fs.id = s.id;
--
--   SELECT status, TO_CHAR(start_date AT TIME ZONE 'Asia/Jakarta','YYYY-MM-DD HH24:MI') AS kembali_seperti_semula
--   FROM ad_schedules
--   WHERE source_table='form_submissions' AND source_id = (SELECT id FROM _t46_subj);
-- ROLLBACK;
--
-- -- (8) Alur lama tidak regresi. cron harus tetap bersih.
-- --   SELECT cron_activate_extends();


-- ============================================
-- 8. ROLLBACK
-- ============================================
-- Jalankan ulang bagian 3, 4, dan 5a-5b file sql/45 — itu mengembalikan kedua
-- fungsi sync ke versi sebelumnya BESERTA cabang DELETE-nya, lalu menulis ulang
-- status dari pemetaan lama. Yang TIDAK dikembalikan oleh langkah itu: 87 baris
-- tanpa tanggal yang lahir di sini akan tetap ada, karena backfill sql/45
-- menyaringnya alih-alih menghapusnya. Buang eksplisit:
--
-- DELETE FROM ad_schedules a USING form_submissions fs
-- WHERE a.source_table = 'form_submissions' AND a.source_id = fs.id
--   AND fs.start_date IS NULL;
--
-- Kolom review_status aman ditinggal (nullable, tanpa pembaca). Kalau harus:
-- DROP INDEX IF EXISTS idx_ad_schedules_review;
-- ALTER TABLE public.ad_schedules DROP COLUMN IF EXISTS review_status;
-- DROP FUNCTION IF EXISTS review_status_of(TEXT);
-- DROP FUNCTION IF EXISTS airing_status_of(TEXT, BOOLEAN);
