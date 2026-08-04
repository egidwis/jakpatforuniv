-- ============================================================
-- Migration 45: ad_schedules mengenali Kilat
-- Date: 2026-08-05
-- Phase 2, Task 8D dari docs/superpowers/plans/2026-08-03-jadwal-iklan-redesign.md
--
-- MASALAHNYA
-- ----------
-- sql/41 mengangkat SETIAP tanggal parent ke 15.00 WIB lewat
-- airing_instant_of_date(). Itu aturan yang benar — untuk iklan regular.
--
-- Kilat tidak tayang jam 15.00. Ia didorong dalam empat gelombang push per hari
-- kerja (08/11/14/17 WIB, sql/42), dua order per gelombang. Jam itu disimpan di
-- kolom TERPISAH form_submissions.kilat_slot_hour justru karena start_date
-- bertipe DATE dan updateScheduleDates() memaku setiap jadwal ke 15.00 WIB —
-- lihat header sql/42, alasannya ditulis panjang di sana.
--
-- Cermin tidak pernah diberi tahu soal kolom itu. Terukur 2026-08-05:
-- 9 order Kilat berjadwal, SEMUANYA tercermin sebagai jendela 15.00 -> 15.00
-- WIB — jam yang bukan gelombang Kilat sama sekali. Sebuah order yang benar-benar
-- didorong pukul 08.00 tercatat di cermin sebagai tayang tujuh jam kemudian.
--
-- Belum ada yang membaca ad_schedules, jadi ini belum bug hidup. Tapi Phase 3
-- (tab "Jadwal Iklan" terpadu) dibangun PERSIS di atas tabel ini. Diterapkan
-- setelah Phase 3 jadi, ia memperbaiki layar yang sudah terlanjur salah;
-- diterapkan sekarang, Phase 3 lahir benar.
--
-- LUBANG KEDUA, DITEMUKAN DI JALAN
-- --------------------------------
-- Daftar `UPDATE OF` trigger trg_ad_schedule_from_submission (sql/41 baris
-- 302-306) tidak memuat distribution_type MAUPUN kilat_slot_hour. Artinya
-- mengubah gelombang sebuah order — atau memindahkan order antar jalur
-- distribusi — secara prinsip tidak membangunkan cermin sama sekali.
--
-- Hari ini lubang itu LATEN, bukan hidup: updateKilatSchedule() selalu ikut
-- menulis start_date, dan convertDistributionType() menulis start_date = NULL,
-- jadi trigger tetap menyala lewat kolom lain. Ia menganga permanen dan tertutup
-- di sini karena kita memang sedang menyentuh fungsinya. VERIFIKASI (5) di bawah
-- adalah satu-satunya uji di file ini yang GAGAL sebelum file ini diterapkan.
--
-- BAGAIMANA KILAT DICERMINKAN
-- ---------------------------
--   regular                      -> airing_instant_of_date()  = 15.00 WIB
--   kilat, gelombang ditugaskan  -> kilat_instant_of(tgl, jam) = 08/11/14/17 WIB
--   kilat, gelombang belum       -> kilat_instant_of(tgl, 0)   = 00.00 WIB
--
-- 00.00 WIB untuk yang belum ditugaskan adalah KEPUTUSAN SADAR (2026-08-05),
-- bukan nilai default yang kebetulan. Tiga dari sembilan order Kilat berjadwal
-- sudah lunas tapi gelombangnya belum ditugaskan admin — keadaan yang sah
-- menurut sql/42, bukan cacat data. Cermin tetap harus menyimpan sesuatu.
--   * 00.00 bukan salah satu gelombang, jadi tidak bisa disalahartikan sebagai
--     jadwal sungguhan dan tidak pernah menggelembungkan kuota gelombang mana pun;
--   * ia sortirnya paling atas di hari itu;
--   * barisnya TETAP TERLIHAT — order lunas yang menunggu penugasan justru yang
--     paling perlu dilihat admin.
-- Alternatif "08.00 (gelombang paling awal)" ditolak: tidak bisa dibedakan dari
-- gelombang 08.00 sungguhan, dan membuat slot itu tampak lebih penuh dari
-- kenyataan. Alternatif "kosongkan start_date" ditolak: barisnya lenyap dari
-- setiap pembaca berbasis rentang tanggal, termasuk papan jadwal.
--
-- kilat_slot_hour IS NULL adalah PENANDA SAHNYA. Siapa pun yang membaca jam dari
-- tabel ini tanpa mengecek kolom itu salah membaca.
--
-- ⚠️ IKLAN REGULAR TIDAK BOLEH BERGESER SATU DETIK PUN. 872 dari 881 baris
-- adalah regular; cabang regular di bawah adalah salinan harfiah sql/41.
-- VERIFIKASI (2) yang membuktikannya.
--
-- PEMETAANNYA SUDAH DISIMULASIKAN KE DATA PRODUKSI, 2026-08-05, read-only —
-- ekspresi CASE yang sama persis dijalankan sebagai SELECT tanpa menerapkan
-- apa pun, atas seluruh 869 baris ordinal 1:
--   baris diuji            869
--   REGULAR BERGESER         0   <- yang paling penting
--   kilat diperbaiki         9
--   kilat jam salah          0
--   tanpa gelombang salah    0
--   tanggal bergeser         0
-- Jadi file ini menyentuh tepat 9 baris, semuanya Kilat, dan tidak satu pun
-- iklan regular. VERIFIKASI (1)/(2)/(3) mengulang ketiga pengukuran itu sesudah
-- diterapkan — kalau angkanya berbeda, yang berubah adalah datanya, bukan file ini.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER IF EXISTS, INSERT … ON CONFLICT DO UPDATE. Aman dijalankan ulang.
-- TANPA perubahan data di form_submissions maupun form_submissions_extend.
-- BERGANTUNG pada sql/39 (airing_instant_of_date), sql/41 (ad_schedules),
-- sql/42 (kilat_slot_hour). Ketiganya sudah di produksi.
-- JALANKAN PRE-CHECK DI BAGIAN 6 LEBIH DULU.
-- ============================================================


-- ============================================
-- 1. Helper: instant gelombang Kilat
-- ============================================
-- Saudara airing_instant_of_date() (sql/39), pola yang sama persis. Ditulis
-- sebagai fungsi dan bukan ekspresi inline supaya trigger dan backfill tidak
-- bisa menyimpang — pelajaran yang sama yang melahirkan sql/44.
--
-- h = 0 berarti "gelombang belum ditugaskan" (lihat header). Ia sengaja TIDAK
-- ditolak di sini: fungsi ini menghitung, bukan memvalidasi. Daftar gelombang
-- yang sah ditegakkan CHECK form_submissions_kilat_slot_hour_check (sql/42).
CREATE OR REPLACE FUNCTION kilat_instant_of(d DATE, h SMALLINT)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT (d + make_time(COALESCE(h, 0)::INT, 0, 0)) AT TIME ZONE 'Asia/Jakarta';
$$;

COMMENT ON FUNCTION kilat_instant_of(DATE, SMALLINT) IS
  'Instant gelombang push Kilat: tanggal + jam WIB. h NULL/0 = gelombang belum ditugaskan, dipetakan ke 00.00 WIB (sql/45). Untuk iklan regular pakai airing_instant_of_date() — 15.00 WIB.';


-- ============================================
-- 2. Dua kolom baru di ad_schedules
-- ============================================
-- Keduanya SALINAN HARFIAH dari sumber, bukan turunan. kilat_slot_hour sengaja
-- bernama sama dengan kolom sumbernya supaya jejaknya tidak perlu ditebak.
--
-- Tanpa CHECK constraint, mengikuti alasan yang sudah ditulis panjang di header
-- sql/41: cermin tidak boleh bisa MENOLAK apa yang diterima sumbernya. Sebuah
-- CHECK yang gagal di sini akan membuat trigger melempar dan menjatuhkan alur
-- LAMA — satu hal yang file semacam ini tidak boleh pernah lakukan.
ALTER TABLE public.ad_schedules
  ADD COLUMN IF NOT EXISTS distribution_type TEXT,
  ADD COLUMN IF NOT EXISTS kilat_slot_hour   SMALLINT;

COMMENT ON COLUMN public.ad_schedules.distribution_type IS
  'Disalin apa adanya dari form_submissions.distribution_type: regular | kilat. Untuk baris ordinal>1 disalin dari order induknya. Produksi 2026-08-05: 0 NULL di sumber.';
COMMENT ON COLUMN public.ad_schedules.kilat_slot_hour IS
  'Gelombang push Kilat dalam jam WIB (8/11/14/17), disalin dari form_submissions. NULL = order regular ATAU order Kilat yang gelombangnya belum ditugaskan — dalam kasus kedua start_date mendarat di 00.00 WIB, bukan di gelombang mana pun. Ini penanda sahnya: jangan membaca jam dari start_date tanpa mengecek kolom ini.';

-- Papan jadwal terpadu Phase 3 akan menyaring per jalur distribusi.
CREATE INDEX IF NOT EXISTS idx_ad_schedules_distribution
  ON public.ad_schedules (distribution_type, start_date);


-- ============================================
-- 3. Mirror: form_submissions -> ad_schedules (ordinal 1)
-- ============================================
-- SALINAN UTUH sql/41 bagian 4, dengan SATU percabangan waktu ditambahkan dan
-- dua kolom baru ikut ditulis. Tidak ada perubahan perilaku lain yang
-- diselundupkan — kalau pemetaan status perlu diperbaiki, itu task lain.
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
  IF NEW.start_date IS NULL THEN
    DELETE FROM ad_schedules
    WHERE source_table = 'form_submissions' AND source_id = NEW.id;
    RETURN NULL;
  END IF;

  -- ── TAMBAHAN sql/45 ──
  -- Satu-satunya perbedaan perilaku terhadap sql/41. Cabang regular di bawah
  -- HARUS tetap identik dengan aslinya: 872 dari 881 baris melewatinya.
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
    status, payment_status,
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
    CASE
      WHEN NEW.submission_status IN ('rejected', 'spam') THEN 'cancelled'
      WHEN NEW.submission_status IN ('waiting_payment', 'paid', 'scheduled', 'live', 'completed')
        THEN NEW.submission_status
      ELSE 'waiting_payment'
    END,
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

-- Trigger dibuat ulang HANYA untuk memperlebar daftar UPDATE OF. Dua kolom
-- terakhir itu yang menutup lubang di header.
DROP TRIGGER IF EXISTS trg_ad_schedule_from_submission ON form_submissions;
CREATE TRIGGER trg_ad_schedule_from_submission
  AFTER INSERT OR UPDATE OF
    start_date, end_date, duration, submission_status, payment_status,
    prize_per_winner, winner_count, total_cost, subtotal, ppn_amount,
    voucher_code, slot_booked_by, slot_reserved_at, admin_notes,
    distribution_type, kilat_slot_hour
  ON form_submissions
  FOR EACH ROW EXECUTE FUNCTION sync_ad_schedule_from_submission();


-- ============================================
-- 4. Mirror: form_submissions_extend -> ad_schedules (ordinal 2..n)
-- ============================================
-- Perpanjangan sudah menyimpan instant dan sudah memakai kosakata status target,
-- jadi waktunya tidak disentuh sama sekali di sini. Yang ditambahkan hanya
-- stempel distribution_type dari order induk.
--
-- Terukur 2026-08-05: NOL perpanjangan milik order Kilat — semua perpanjangan
-- hari ini regular. Ini ditulis supaya perpanjangan Kilat yang PERTAMA nanti
-- tidak lahir tanpa jenis distribusi, bukan untuk memperbaiki baris yang ada.
--
-- kilat_slot_hour sengaja dibiarkan NULL untuk baris perpanjangan: gelombang
-- adalah properti order, dan form_submissions_extend tidak punya kolom itu.
-- Kalau Kilat kelak bisa diperpanjang, di situlah kolomnya harus lahir — bukan
-- ditebak di sini.
CREATE OR REPLACE FUNCTION sync_ad_schedule_from_extend()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission_id     UUID;
  v_distribution_type TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_submission_id := OLD.submission_id;
    DELETE FROM ad_schedules
    WHERE source_table = 'form_submissions_extend' AND source_id = OLD.id;
    PERFORM resync_ad_schedule_ordinals(v_submission_id);
    RETURN NULL;
  END IF;

  v_submission_id := NEW.submission_id;

  SELECT distribution_type INTO v_distribution_type
  FROM form_submissions WHERE id = NEW.submission_id;

  -- Ordinal 2 adalah placeholder: resync di bawah menetapkan nomor sebenarnya
  -- sebelum statement berakhir, dan ad_schedules_ordinal_key ditunda sampai
  -- COMMIT, jadi tabrakan sesaat di sini legal.
  INSERT INTO ad_schedules (
    submission_id, ordinal, source_table, source_id,
    start_date, end_date, duration,
    status, payment_status,
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

-- Trigger extend TIDAK dibuat ulang: daftar UPDATE OF-nya tidak berubah.
-- form_submissions_extend tidak punya distribution_type maupun kilat_slot_hour.


-- ============================================
-- 5. Backfill
-- ============================================
-- 5a. Jadwal pertama — pemetaan yang sama dengan bagian 3, secara set.
-- Ini yang memperbaiki 9 baris Kilat DAN menstempel distribution_type ke 869
-- baris ordinal 1. Baris regular ditulis ulang dengan nilai yang identik.
INSERT INTO ad_schedules (
  submission_id, ordinal, source_table, source_id,
  start_date, end_date, duration,
  status, payment_status,
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
  CASE
    WHEN fs.submission_status IN ('rejected', 'spam') THEN 'cancelled'
    WHEN fs.submission_status IN ('waiting_payment', 'paid', 'scheduled', 'live', 'completed')
      THEN fs.submission_status
    ELSE 'waiting_payment'
  END,
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
WHERE fs.start_date IS NOT NULL
ON CONFLICT ON CONSTRAINT ad_schedules_source_key DO UPDATE SET
  start_date        = EXCLUDED.start_date,
  end_date          = EXCLUDED.end_date,
  duration          = EXCLUDED.duration,
  status            = EXCLUDED.status,
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

-- 5b. Perpanjangan — cukup stempel distribution_type dari induknya.
-- Sengaja UPDATE, bukan INSERT ulang seperti sql/41 bagian 6b: waktunya tidak
-- berubah, dan menulis ulang barisnya akan menyeret perhitungan ordinal tanpa
-- alasan. Yang tidak perlu bergerak, tidak digerakkan.
UPDATE ad_schedules a
SET distribution_type = fs.distribution_type
FROM form_submissions_extend e
JOIN form_submissions fs ON fs.id = e.submission_id
WHERE a.source_table = 'form_submissions_extend'
  AND a.source_id = e.id
  AND a.distribution_type IS DISTINCT FROM fs.distribution_type;


-- ============================================
-- 6. PRE-CHECK — jalankan SEBELUM bagian 1-5
-- ============================================
-- Tidak ada yang menulis di sini. Jalankan SATU PER SATU — SQL Editor Supabase
-- hanya menampilkan hasil statement terakhir kalau dijalankan sekaligus.
--
-- -- (0) Ketergantungan. Ketiganya wajib ada, masing-masing 1 baris.
-- SELECT p.proname, pg_get_function_arguments(p.oid) AS argumen
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname IN ('airing_instant_of_date', 'resync_ad_schedule_ordinals')
-- UNION ALL
-- SELECT 'kolom kilat_slot_hour', data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='form_submissions' AND column_name='kilat_slot_hour';
--
-- -- (1) Peta medan. TERUKUR 2026-08-05 — catat ulang sebelum menerapkan,
-- -- VERIFIKASI (1)/(4) mengadu hasilnya ke angka-angka ini:
-- --   mirror_total 881 · ordinal_1 869 · ordinal_2n 12
-- --   regular 872 · kilat 9 (6 bergelombang, 3 belum)
-- --   baris_yang_akan_berubah 9  <- HANYA baris Kilat. Kalau angka ini menyentuh
-- --   baris regular, JANGAN diterapkan: cabang regular berarti tidak identik.
-- SELECT
--   COUNT(*) AS mirror_total,
--   COUNT(*) FILTER (WHERE a.source_table='form_submissions')        AS ordinal_1,
--   COUNT(*) FILTER (WHERE a.source_table='form_submissions_extend') AS ordinal_2n,
--   COUNT(*) FILTER (WHERE fs.distribution_type='regular')           AS regular,
--   COUNT(*) FILTER (WHERE fs.distribution_type='kilat')             AS kilat,
--   COUNT(*) FILTER (WHERE fs.distribution_type='kilat' AND fs.kilat_slot_hour IS NOT NULL) AS kilat_bergelombang,
--   COUNT(*) FILTER (WHERE fs.distribution_type='kilat' AND fs.kilat_slot_hour IS NULL)     AS kilat_tanpa_gelombang
-- FROM ad_schedules a JOIN form_submissions fs ON fs.id = a.submission_id;
--
-- -- (2) Nilai distribution_type yang harus dilewati pemetaan. Produksi
-- -- 2026-08-05: 'regular' dan 'kilat' saja, 0 NULL. Nilai ketiga yang muncul di
-- -- sini akan jatuh ke cabang regular (15.00 WIB) — pastikan itu memang benar
-- -- untuknya sebelum menerapkan.
-- SELECT COALESCE(distribution_type,'(null)') AS nilai, COUNT(*)
-- FROM form_submissions GROUP BY 1 ORDER BY 2 DESC;
--
-- -- (3) Pilih subjek uji untuk VERIFIKASI (5): order Kilat yang gelombangnya
-- -- SUDAH ditugaskan, supaya perubahannya kelihatan.
-- SELECT id, title, start_date, kilat_slot_hour, submission_status
-- FROM form_submissions
-- WHERE distribution_type = 'kilat' AND kilat_slot_hour IS NOT NULL
-- ORDER BY start_date DESC LIMIT 5;


-- ============================================
-- 7. VERIFIKASI — jalankan SESUDAH menerapkan
-- ============================================
-- -- (1) ⚠️ UJI INTINYA. Jam WIB cermin harus SAMA dengan kilat_slot_hour untuk
-- -- setiap order Kilat yang gelombangnya ditugaskan. Harus NOL baris.
-- SELECT a.submission_id, fs.title, fs.kilat_slot_hour,
--        TO_CHAR(a.start_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') AS cermin_wib
-- FROM ad_schedules a JOIN form_submissions fs ON fs.id = a.submission_id
-- WHERE a.source_table = 'form_submissions'
--   AND fs.distribution_type = 'kilat'
--   AND fs.kilat_slot_hour IS NOT NULL
--   AND EXTRACT(HOUR FROM a.start_date AT TIME ZONE 'Asia/Jakarta') <> fs.kilat_slot_hour;
--
-- -- (2) ⚠️ IKLAN REGULAR TIDAK BERGESER. Ulangan §8(3) sql/41. Kedua kolom
-- -- harus 0, atas 872 baris regular.
-- SELECT COUNT(*) FILTER (
--          WHERE TO_CHAR(a.start_date AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') <> '15:00'
--        ) AS jam_mulai_salah,
--        COUNT(*) FILTER (
--          WHERE (a.start_date AT TIME ZONE 'Asia/Jakarta')::DATE <> fs.start_date
--        ) AS tanggal_mulai_bergeser
-- FROM ad_schedules a JOIN form_submissions fs ON fs.id = a.source_id
-- WHERE a.source_table = 'form_submissions'
--   AND fs.distribution_type <> 'kilat'
--   AND a.start_date IS NOT NULL;
--
-- -- (3) Yang belum ditugaskan mendarat di 00.00 WIB pada tanggal yang benar,
-- -- dan kilat_slot_hour-nya tetap NULL. 3 baris, ketiganya jam '00:00'.
-- SELECT fs.title,
--        TO_CHAR(a.start_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') AS cermin_wib,
--        (a.start_date AT TIME ZONE 'Asia/Jakarta')::DATE = fs.start_date AS tanggal_cocok,
--        a.kilat_slot_hour
-- FROM ad_schedules a JOIN form_submissions fs ON fs.id = a.submission_id
-- WHERE a.source_table = 'form_submissions'
--   AND fs.distribution_type = 'kilat' AND fs.kilat_slot_hour IS NULL;
--
-- -- (4) Paritas jumlah baris TIDAK berubah — file ini tidak melahirkan maupun
-- -- membunuh baris. Kedua selisih harus 0, totalnya tetap 881.
-- SELECT
--   (SELECT COUNT(*) FROM ad_schedules)             AS total,
--   (SELECT COUNT(*) FROM ad_schedules WHERE ordinal = 1)
--     - (SELECT COUNT(*) FROM form_submissions WHERE start_date IS NOT NULL) AS selisih_jadwal_pertama,
--   (SELECT COUNT(*) FROM ad_schedules WHERE source_table='form_submissions_extend')
--     - (SELECT COUNT(*) FROM form_submissions_extend)                       AS selisih_jadwal_lanjutan,
--   (SELECT COUNT(*) FROM ad_schedules WHERE distribution_type IS NULL)      AS belum_terstempel;
--
-- -- (5) ⚠️ SATU-SATUNYA UJI YANG GAGAL SEBELUM FILE INI DITERAPKAN.
-- -- Ubah gelombang TANPA menyentuh kolom lain; cermin wajib ikut. Sebelum
-- -- sql/45, kilat_slot_hour tidak ada di daftar UPDATE OF, jadi jam_sesudah
-- -- akan sama dengan jam_sebelum. Semuanya dibatalkan di akhir.
-- BEGIN;
--   SELECT EXTRACT(HOUR FROM start_date AT TIME ZONE 'Asia/Jakarta') AS jam_sebelum
--   FROM ad_schedules WHERE submission_id = '<uuid-kilat-dari-PRE-CHECK-3>' AND ordinal = 1;
--
--   UPDATE form_submissions SET kilat_slot_hour = 11
--   WHERE id = '<uuid-kilat-dari-PRE-CHECK-3>';
--
--   SELECT EXTRACT(HOUR FROM start_date AT TIME ZONE 'Asia/Jakarta') AS jam_sesudah,
--          kilat_slot_hour
--   FROM ad_schedules WHERE submission_id = '<uuid-kilat-dari-PRE-CHECK-3>' AND ordinal = 1;
--   -- jam_sesudah HARUS 11, kilat_slot_hour HARUS 11
-- ROLLBACK;
--
-- -- (6) Papan jadwal admin tetap sepakat. fetchKilatSchedule() masih membaca
-- -- form_submissions LANGSUNG, bukan cermin — jadi ia pembanding independen.
-- -- Setiap baris harus 'cocok'.
-- SELECT fs.title, fs.start_date, fs.kilat_slot_hour AS papan_jadwal,
--        a.kilat_slot_hour                            AS cermin,
--        CASE WHEN fs.kilat_slot_hour IS NOT DISTINCT FROM a.kilat_slot_hour
--             THEN 'cocok' ELSE 'BEDA' END AS hasil
-- FROM form_submissions fs
-- JOIN ad_schedules a ON a.submission_id = fs.id AND a.source_table = 'form_submissions'
-- WHERE fs.distribution_type = 'kilat'
-- ORDER BY fs.start_date DESC;
--
-- -- (7) Alur lama tidak regresi. cron harus tetap bersih.
-- --   SELECT cron_activate_extends();


-- ============================================
-- 8. ROLLBACK
-- ============================================
-- Kembalikan kedua fungsi sync + trigger ke versi sql/41 (jalankan ulang bagian
-- 4 dan 5 file itu), lalu backfill ulang bagian 6a-nya supaya jam Kilat kembali
-- ke 15.00 WIB. Kolomnya aman ditinggal: nullable, dan tidak ada satu pun
-- pembaca ad_schedules di seluruh sistem.
--
-- Kalau kolomnya benar-benar harus hilang:
-- DROP INDEX IF EXISTS idx_ad_schedules_distribution;
-- ALTER TABLE public.ad_schedules
--   DROP COLUMN IF EXISTS distribution_type,
--   DROP COLUMN IF EXISTS kilat_slot_hour;
-- DROP FUNCTION IF EXISTS kilat_instant_of(DATE, SMALLINT);
