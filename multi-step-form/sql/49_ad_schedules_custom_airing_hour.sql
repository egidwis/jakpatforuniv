-- 49_ad_schedules_custom_airing_hour.sql
--
-- Problem: fitur "Jam Tayang (WIB)" di ScheduleForm.tsx (ditambahkan bersama
-- reorder flow, commit ff358e7) sudah bisa MENULIS jam kustom untuk jadwal
-- PERTAMA sebuah order (ordinal 1) — tapi tulisannya tidak pernah sampai ke
-- mana pun yang bisa dibaca balik.
--
-- Akarnya: form_submissions.start_date/end_date bertipe DATE, tanpa kapasitas
-- menyimpan jam. updateScheduleDates() (src/utils/supabase.ts) menghitung
-- instant yang benar lalu MEMBUANG jamnya lewat toWibYmd() sebelum menulis ke
-- kolom itu — satu-satunya jam yang bertahan adalah publish_start_date/
-- publish_end_date di survey_pages (TIMESTAMPTZ), karena SurveyPage.tsx/
-- adOrdering.ts membaca dari sana. ad_schedules — satu-satunya sumber yang
-- dibaca halaman Schedule & drawer-nya — dicermin ulang oleh
-- sync_ad_schedule_from_submission() lewat airing_instant_of_date(DATE), yang
-- meng-hardcode TIME '15:00' karena memang hanya menerima DATE polos. Hasilnya:
-- papan Schedule TIDAK MUNGKIN menampilkan jam kustom untuk jadwal pertama, apa
-- pun yang disimpan admin — bukan bug tampilan basi, tapi rumus yang memang
-- tidak punya input jam.
--
-- Dibuktikan di prod 2026-08-10 pada order #8462698a-8ff9-4796-9cfb-2802dfb64b51
-- (10.00 WIB dipilih admin):
--   form_submissions.start_date   2026-08-10            (DATE, jam tidak ada)
--   survey_pages.publish_start_date  2026-08-10 10:00 WIB   ✅ jam kustom kesimpan
--   ad_schedules.start_date          2026-08-10 15:00 WIB   ❌ selalu bawaan
--
-- Konsekuensi ke-2 (baru ditemukan saat migrasi ini ditulis): cron
-- notify_primary_ads_live() (sql/48) memakai airing_instant_of_date() yang
-- sama untuk menentukan "sudah tayang" — jadi order berjam kustom akan
-- menerima email beberapa jam meleset dari waktu tayang sebenarnya. Cron ini
-- SAAT INI TIDAK AKTIF (di-unschedule manual 2026-08-10, lihat
-- sql/48_ad_live_notifications.sql bagian 4) menyusul insiden pembakaran
-- notifikasi — migrasi ini menulis ulang fungsinya supaya begitu dijadwalkan
-- lagi pasca-deploy, ia sudah benar. Sekalian ditutup: fungsi lama itu juga
-- TIDAK PERNAH sadar distribution_type/kilat_slot_hour, jadi order Kilat
-- (gelombang 08/11/14/17 WIB) ikut kena rumus 15.00 yang salah — bukan
-- regresi migrasi ini, tapi tidak masuk akal dibiarkan sambil sudah membongkar
-- fungsi yang sama.
--
-- Pola kolom & fungsinya SALINAN LANGSUNG dari kilat_slot_hour (sql/42/45):
-- kolom nullable di form_submissions, NULL = "tidak ada override, pakai
-- bawaan 15.00 WIB", dicermin apa adanya ke ad_schedules. Prioritas saat ketiga
-- jalur bisa berlaku sekaligus (harusnya tidak pernah, ScheduleForm mengambil
-- cabang KilatScheduleStep terpisah total untuk order Kilat — lihat
-- ScheduleForm.tsx baris ~375): jam kustom admin > gelombang Kilat > bawaan.
--
-- Nomor bergeser 2026-08-10: sql/49 sebelumnya diklaim `reward_pools` (8B-2,
-- prasyarat Phase 4, masih ⏸️ ditunda). Bug ini genap ditemukan & diperbaiki
-- di branch yang sedang dideploy, jadi ia menumpang lebih dulu — pola yang
-- sama dengan pergeseran 45→47→49 reward_pools itu sendiri. reward_pools
-- bergeser ke sql/50, Task 11 ke sql/51-52, Task 13 ke sql/53. Lihat baris
-- "Peta dokumen" di docs/jadwal-iklan-progress.md untuk daftar file yang ikut
-- diperbarui.
--
-- Jalankan di Supabase SQL Editor.

-- ============================================================================
-- 1. Kolom baru: form_submissions
-- ============================================================================
-- Nullable, TANPA CHECK constraint — alasan yang sama dengan kilat_slot_hour
-- (sql/42): kolom sumber tidak boleh menolak apa pun yang ditulis
-- updateScheduleDates(), dan validasi jam (0-23) sudah ditegakkan di
-- <input type="time"> + clamp Math.min/Math.max di ScheduleForm.tsx.

ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS airing_hour_wib   SMALLINT,
  ADD COLUMN IF NOT EXISTS airing_minute_wib SMALLINT;

COMMENT ON COLUMN public.form_submissions.airing_hour_wib IS
  'Jam tayang kustom (WIB) untuk jadwal PERTAMA order ini, diset admin lewat ScheduleForm. NULL = tidak ada override, pakai bawaan 15.00 WIB (airing_instant_of_date). Hanya relevan untuk order non-Kilat — Kilat pakai kilat_slot_hour. Ditambahkan sql/49.';
COMMENT ON COLUMN public.form_submissions.airing_minute_wib IS
  'Menit pendamping airing_hour_wib. NULL diperlakukan sebagai 0 oleh airing_instant_of_custom(). Ditambahkan sql/49.';


-- ============================================================================
-- 2. Kolom baru: ad_schedules (mirror)
-- ============================================================================
-- SALINAN HARFIAH dari sumber, pola yang sama dengan distribution_type/
-- kilat_slot_hour (sql/45). Tanpa CHECK — cermin tidak boleh menolak apa yang
-- diterima sumbernya (lihat header sql/41).

ALTER TABLE public.ad_schedules
  ADD COLUMN IF NOT EXISTS airing_hour_wib   SMALLINT,
  ADD COLUMN IF NOT EXISTS airing_minute_wib SMALLINT;

COMMENT ON COLUMN public.ad_schedules.airing_hour_wib IS
  'Disalin apa adanya dari form_submissions.airing_hour_wib. NULL untuk baris perpanjangan (ordinal>1) — jadwal itu sudah TIMESTAMPTZ penuh, jamnya hidup langsung di start_date/end_date. Ditambahkan sql/49.';
COMMENT ON COLUMN public.ad_schedules.airing_minute_wib IS
  'Pendamping airing_hour_wib. Ditambahkan sql/49.';


-- ============================================================================
-- 3. Helper: instant jam kustom
-- ============================================================================
-- Saudara airing_instant_of_date() (sql/39) dan kilat_instant_of() (sql/45),
-- pola yang sama persis: fungsi, bukan ekspresi inline, supaya trigger dan
-- notify_primary_ads_live() tidak bisa menyimpang satu sama lain.

CREATE OR REPLACE FUNCTION airing_instant_of_custom(d DATE, h SMALLINT, m SMALLINT DEFAULT 0)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT (d + make_time(COALESCE(h, 15)::INT, COALESCE(m, 0)::INT, 0)) AT TIME ZONE 'Asia/Jakarta';
$$;

COMMENT ON FUNCTION airing_instant_of_custom(DATE, SMALLINT, SMALLINT) IS
  'Instant jam tayang kustom admin: tanggal + jam:menit WIB. Dipanggil hanya saat airing_hour_wib IS NOT NULL — COALESCE ke 15:00 di sini murni jaga-jaga, bukan jalur yang diharapkan terpakai. Untuk bawaan pakai airing_instant_of_date(), untuk Kilat pakai kilat_instant_of(). Ditambahkan sql/49.';


-- ============================================================================
-- 4. Mirror: form_submissions -> ad_schedules (ordinal 1) — tambah cabang jam kustom
-- ============================================================================
-- SALINAN UTUH sql/46 (versi terakhir fungsi ini), dengan SATU cabang tambahan
-- di paling atas. Cabang Kilat & bawaan di bawahnya HARUS tetap identik —
-- keduanya sudah diverifikasi nol bergeser di sql/45 §7(5) / sql/46.
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

  -- ── TAMBAHAN sql/49 ──
  -- Jam kustom admin menang atas segalanya, termasuk Kilat — meski dalam
  -- praktiknya ScheduleForm.tsx tidak pernah menawarkan keduanya sekaligus
  -- (order Kilat lewat KilatScheduleStep, jalur terpisah total).
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
    start_date         = EXCLUDED.start_date,
    end_date           = EXCLUDED.end_date,
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

-- Trigger dibuat ulang HANYA untuk melebarkan daftar UPDATE OF — pola yang
-- sama dengan sql/45 bagian 3 saat kilat_slot_hour ditambahkan.
DROP TRIGGER IF EXISTS trg_ad_schedule_from_submission ON form_submissions;
CREATE TRIGGER trg_ad_schedule_from_submission
  AFTER INSERT OR UPDATE OF
    start_date, end_date, duration, submission_status, payment_status,
    prize_per_winner, winner_count, total_cost, subtotal, ppn_amount,
    voucher_code, slot_booked_by, slot_reserved_at, admin_notes,
    distribution_type, kilat_slot_hour, airing_hour_wib, airing_minute_wib
  ON form_submissions
  FOR EACH ROW EXECUTE FUNCTION sync_ad_schedule_from_submission();


-- ============================================================================
-- 5. Backfill
-- ============================================================================
-- Kolomnya baru dan NULL di semua baris — secara nilai ini no-op (cabang jam
-- kustom tidak pernah kepilih, hasilnya identik dengan sebelum migrasi ini).
-- Tetap dijalankan supaya ad_schedules.airing_hour_wib/airing_minute_wib
-- konsisten "salinan harfiah" sejak hari pertama, bukan menunggu UPDATE
-- berikutnya lewat trigger.
UPDATE ad_schedules a
SET airing_hour_wib   = fs.airing_hour_wib,
    airing_minute_wib = fs.airing_minute_wib
FROM form_submissions fs
WHERE a.source_table = 'form_submissions'
  AND a.source_id = fs.id
  AND (a.airing_hour_wib IS DISTINCT FROM fs.airing_hour_wib
       OR a.airing_minute_wib IS DISTINCT FROM fs.airing_minute_wib);


-- ============================================================================
-- 6. notify_primary_ads_live() — pakai instant sebenarnya, bukan bawaan 15.00
-- ============================================================================
-- CREATE OR REPLACE atas fungsi sql/48. Dua perubahan atas versi lama:
--   (a) predikat "sudah tayang" sekarang menghormati jam kustom DAN gelombang
--       Kilat, bukan cuma airing_instant_of_date() bawaan;
--   (b) body HTTP mengirim INSTANT yang sudah dihitung (v_start/v_end),
--       bukan DATE mentah — functions/api/notify-ad-live.js (diperbarui
--       terpisah, bukan lewat migrasi ini) memformat jamnya dari nilai ini,
--       jadi email tidak lagi menuliskan "pukul 15.00 WIB" yang di-hardcode.
--
-- Cron ini TIDAK AKTIF saat migrasi ini ditulis (lihat header) — aman
-- diterapkan sekarang, dan tinggal dijadwalkan ulang begitu deploy selesai:
--   select cron.schedule('notify-primary-ads-live', '*/15 * * * *',
--                         $$select public.notify_primary_ads_live()$$);
CREATE OR REPLACE FUNCTION public.notify_primary_ads_live()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_url text;
  v_secret text;
  rec record;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'notify_ad_live_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'cron_notify_secret' LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'notify_primary_ads_live: vault secrets notify_ad_live_url/cron_notify_secret belum diset, dilewati';
    RETURN;
  END IF;

  FOR rec IN
    SELECT id, email, full_name, title, start_date, end_date,
           distribution_type, kilat_slot_hour, airing_hour_wib, airing_minute_wib
    FROM public.form_submissions
    WHERE payment_status = 'paid'
      AND start_date IS NOT NULL
      AND end_date IS NOT NULL
      AND live_notified_at IS NULL
      AND email IS NOT NULL
  LOOP
    -- Urutan cabang SAMA PERSIS dengan sync_ad_schedule_from_submission()
    -- (bagian 4 di atas) — menyimpang di sini berarti email bisa terkirim
    -- padahal papan Schedule sendiri masih bilang belum tayang, atau
    -- sebaliknya.
    IF rec.airing_hour_wib IS NOT NULL THEN
      v_start := airing_instant_of_custom(rec.start_date, rec.airing_hour_wib, rec.airing_minute_wib);
      v_end   := airing_instant_of_custom(rec.end_date,   rec.airing_hour_wib, rec.airing_minute_wib);
    ELSIF rec.distribution_type = 'kilat' THEN
      v_start := kilat_instant_of(rec.start_date, rec.kilat_slot_hour);
      v_end   := kilat_instant_of(rec.end_date,   rec.kilat_slot_hour);
    ELSE
      v_start := airing_instant_of_date(rec.start_date);
      v_end   := airing_instant_of_date(rec.end_date);
    END IF;

    IF v_start > now() OR v_end <= now() THEN
      CONTINUE;
    END IF;

    PERFORM net.http_post(
      url := v_url || '?k=' || v_secret,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'id', rec.id,
        'email', rec.email,
        'full_name', rec.full_name,
        'title', rec.title,
        'start_date', v_start,
        'end_date', v_end
      )
    );

    UPDATE public.form_submissions
      SET live_notified_at = now()
      WHERE id = rec.id;
  END LOOP;
END;
$$;


-- ============================================================================
-- 7. PRE-CHECK — jalankan SEBELUM bagian 1-6
-- ============================================================================
-- Tidak ada yang menulis di sini. Jalankan SATU PER SATU — SQL Editor Supabase
-- hanya menampilkan hasil statement terakhir kalau dijalankan sekaligus.
--
-- -- (0) Ketergantungan. Keempatnya wajib ada, masing-masing 1 baris.
-- SELECT p.proname, pg_get_function_arguments(p.oid) AS argumen
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('airing_instant_of_date', 'kilat_instant_of', 'airing_status_of', 'review_status_of');
--
-- -- (1) Peta medan SEBELUM migrasi — konfirmasi kolom belum ada.
-- SELECT table_name, column_name FROM information_schema.columns
-- WHERE table_schema='public' AND column_name IN ('airing_hour_wib','airing_minute_wib');
--
-- -- (2) Order yang dikonfirmasi kena bug ini di prod — catat instant SEBELUM
-- -- migrasi, untuk dibandingkan sesudahnya di VERIFIKASI (2).
-- SELECT fs.id, fs.start_date::text,
--        sp.publish_start_date, ad.start_date AS ad_schedules_start_date
-- FROM form_submissions fs
-- LEFT JOIN survey_pages sp ON sp.submission_id = fs.id
-- LEFT JOIN ad_schedules ad ON ad.source_table='form_submissions' AND ad.source_id=fs.id
-- WHERE fs.id = '8462698a-8ff9-4796-9cfb-2802dfb64b51';


-- ============================================================================
-- 8. VERIFIKASI — jalankan SESUDAH bagian 1-6
-- ============================================================================
--
-- -- (1) Kolom baru ada di kedua tabel, tipe SMALLINT, nullable.
-- SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
-- WHERE table_schema='public' AND column_name IN ('airing_hour_wib','airing_minute_wib')
-- ORDER BY table_name;
--
-- -- (2) TIDAK ADA regresi: semua order regular non-kustom masih 15.00 WIB
-- -- tersirat di ad_schedules ordinal 1. Harus 0.
-- SELECT COUNT(*) AS salah_regresi
-- FROM ad_schedules a
-- WHERE a.source_table = 'form_submissions'
--   AND a.distribution_type IS DISTINCT FROM 'kilat'
--   AND a.airing_hour_wib IS NULL
--   AND TO_CHAR(a.start_date AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') <> '15:00';
--
-- -- (3) Order #8462698a sekarang menulis jam kustom dan ad_schedules
-- -- menampilkannya juga. Set jam kustomnya dulu lewat ScheduleForm (atau
-- -- manual UPDATE form_submissions SET airing_hour_wib=10, airing_minute_wib=0
-- -- WHERE id=... untuk order yang SUDAH bertelanjang jam sejak sebelum
-- -- migrasi ini — survey_pages-nya sudah benar, form_submissions/ad_schedules
-- -- yang perlu disusulkan), lalu:
-- SELECT fs.airing_hour_wib, fs.airing_minute_wib,
--        TO_CHAR(ad.start_date AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') AS ad_schedules_jam,
--        TO_CHAR(sp.publish_start_date AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') AS survey_pages_jam
-- FROM form_submissions fs
-- LEFT JOIN ad_schedules ad ON ad.source_table='form_submissions' AND ad.source_id=fs.id
-- LEFT JOIN survey_pages sp ON sp.submission_id = fs.id
-- WHERE fs.id = '8462698a-8ff9-4796-9cfb-2802dfb64b51';
-- -- ad_schedules_jam HARUS SAMA dengan survey_pages_jam sesudah langkah di atas.
--
-- -- (4) notify_primary_ads_live() belum dijadwalkan lagi (lihat header) —
-- -- aman dites manual, tidak mengirim apa pun sampai cron.schedule dipanggil:
-- -- SELECT public.notify_primary_ads_live();


-- ============================================================================
-- 9. Rollback
-- ============================================================================
--
--   DROP TRIGGER IF EXISTS trg_ad_schedule_from_submission ON form_submissions;
--   -- lalu tempel ulang definisi fungsi & trigger dari sql/46 (tanpa cabang
--   -- jam kustom, tanpa dua kolom di INSERT/UPDATE list).
--   CREATE OR REPLACE FUNCTION public.notify_primary_ads_live() ...  -- tempel ulang dari sql/48
--   DROP FUNCTION IF EXISTS airing_instant_of_custom(DATE, SMALLINT, SMALLINT);
--   ALTER TABLE public.ad_schedules DROP COLUMN IF EXISTS airing_hour_wib, DROP COLUMN IF EXISTS airing_minute_wib;
--   ALTER TABLE public.form_submissions DROP COLUMN IF EXISTS airing_hour_wib, DROP COLUMN IF EXISTS airing_minute_wib;
