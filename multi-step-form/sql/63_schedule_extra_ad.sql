-- 63_schedule_extra_ad.sql
-- Date: 2026-08-19  ·  Task 13 Rilis 2 (bagian 3)
--
-- Memindahkan "iklan tambahan" dari ORDER ke JADWAL, dan menuliskan aturan
-- produk yang selama ini hanya hidup di kepala orang: KILAT TIDAK PUNYA KUOTA
-- IKLAN TAMBAHAN.
--
-- ============================================================================
-- KENAPA PINDAH
-- ============================================================================
--
-- `is_extra_ad` hidup di `survey_pages` — SATU baris per ORDER. Jadwal tidak
-- punya kolomnya sendiri, jadi seluruh jadwal sebuah order wajib sekolam.
-- Akibatnya sudah tertulis sebagai larangan di `ScheduleForm.tsx`:
--
--     "HANYA DIBACA, TIDAK BISA DIUBAH DI SINI ... menawarkan pilihan di sini
--      berarti menjanjikan sesuatu yang tidak tersimpan ke mana pun — admin
--      memesan ke kolam tambahan, lalu jadwalnya tetap dihitung reguler dan
--      kolam reguler kelebihan jual."
--
-- Migrasi ini yang membuat janji itu bisa ditepati.
--
-- ============================================================================
-- ATURAN BARU: KILAT TIDAK PERNAH TAMBAHAN
-- ============================================================================
--
-- Keputusan pemilik produk 2026-08-19. Iklan tambahan adalah kolam kuota di
-- KALENDER IKLAN (MAX_EXTRA_ADS_PER_DAY = 4/hari, di samping 4 reguler).
-- JFU Kilat tidak dijual lewat kalender itu sama sekali: ia punya slot jam
-- (8/11/14/17 WIB, 2 kuota per slot) dan tidak punya kolam kedua.
--
-- Aturan ini ditegakkan DUA lapis, bukan satu:
--
--   1. trigger BEFORE  -> MEMBERSIHKAN diam-diam. Ini jalur mesin: konversi
--                         reguler -> kilat (`convertDistributionType`) harus
--                         berhasil, bukan gagal, dan hasil yang benar adalah
--                         flag tambahannya ikut lepas.
--   2. CHECK constraint -> MENJAMIN. Ia tidak akan pernah berbunyi selama
--                         triggernya hidup; gunanya justru itu — kalau suatu
--                         hari triggernya dilepas, barisnya tetap tidak bisa
--                         berbohong.
--
-- Penolakan yang KERAS hanya ada di satu tempat: `set_schedule_extra_ad()`,
-- satu-satunya jalur tempat MANUSIA menyalakan flag ini. Di sana salah klik
-- harus berbunyi, bukan dibersihkan diam-diam.
--
-- ============================================================================
-- ANGKA BACKFILL — TERUKUR, MENGOREKSI DOKUMEN RENCANA
-- ============================================================================
--
-- Dokumen rencana menyebut "25 jadwal". Terukur hari ini:
--
--   jadwal terbaca tambahan (page ATAU [EXTRA_AD]) .... 25
--     - regular ...................................... 24  <- DI-BACKFILL
--     - kilat ........................................  1  <- DITINGGAL false
--
--   Rincian 24 yang di-backfill:
--     dari survey_pages.is_extra_ad saja ...............  2
--     dari admin_notes '[EXTRA_AD]' saja ............... 12
--     dari keduanya .................................... 10
--     tersebar di 21 order (21 ordinal 1 + 3 perpanjangan)
--
-- Baris kilat itu `RZ8R6SWR` ("JFSUHUD Pariwisata Sunda", admin_notes =
-- '[EXTRA_AD]'). Ia BELUM pernah salah hitung di produksi — `start_date`-nya
-- NULL, jadi ia tak pernah masuk lingkaran penghitungan kalender. Yang
-- diperbaiki di sini adalah bom waktunya: begitu jadwal itu diberi tanggal,
-- kode lama akan membuangnya ke `extraCounts` dan ia LOLOS dari kuota kilat
-- tanpa jejak.
--
-- ============================================================================
-- survey_pages.is_extra_ad TIDAK DI-DROP — IA JADI CERMIN
-- ============================================================================
--
-- Kolom itu masih dibaca lima tempat yang TIDAK disentuh migrasi ini:
-- `adOrdering.ts` + `functions/api/surveys.js` (urutan kartu iklan di aplikasi),
-- `publish-pages/types.ts`, `SubmissionsTableRow.tsx` dan `CampaignActions.tsx`
-- (label "Type: Extra Ad"). Kalau ia dibiarkan lepas, admin menandai sebuah
-- jadwal "Tambahan", papan kapasitas memindahkannya — dan kelima layar itu
-- tetap bilang "Regular Ad". Satu order, dua jawaban; pola yang sudah berkali
-- menggigit proyek ini.
--
-- Jadi ia dijaga sinkron satu arah oleh sepasang trigger:
--   ad_schedules (baris ordinal 1) --push-->  survey_pages
--   survey_pages (saat baris LAHIR) --pull--  ad_schedules
--
-- Sepasang, bukan satu, karena urutan kejadiannya bisa terbalik: halaman baru
-- lahir saat order LUNAS (`ensure_survey_page`), sedangkan flag tambahannya
-- bisa disetel jauh sebelum itu.
--
-- ⚠️ BATASNYA, DISENGAJA: cermin ini mengikuti jadwal ordinal 1 saja. Order
-- yang jadwal ke-2-nya tambahan sementara jadwal pertamanya reguler akan
-- diurutkan sebagai reguler di feed aplikasi. Itu tetap lebih benar daripada
-- hari ini (yang tidak punya konsep per-jadwal sama sekali), dan "iklan mana
-- yang sedang tayang" bukan pertanyaan yang bisa dijawab trigger tanpa cron.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Kolomnya
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE ad_schedules
  ADD COLUMN IF NOT EXISTS is_extra_ad BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ad_schedules.is_extra_ad IS
  'Jadwal ini memakai kolam kuota IKLAN TAMBAHAN (MAX_EXTRA_ADS_PER_DAY), '
  'bukan kolam reguler. Selalu false untuk distribution_type = ''kilat'' — '
  'dijaga trigger trg_ad_schedules_extra_ad_rules + CHECK. Sumber kebenaran '
  'sejak sql/63; survey_pages.is_extra_ad kini cerminnya.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Backfill — REGULER SAJA
-- ─────────────────────────────────────────────────────────────────────────
--
-- Dua sumber lama digabung: kolom halaman DAN penanda teks di admin_notes.
-- Keduanya per-ORDER, jadi seluruh jadwal order itu ikut ditandai — persis
-- perilaku hari ini, hanya kini tersimpan per baris sehingga bisa dibedakan
-- besok.
--
-- `[EXTRA_AD]` di admin_notes SENGAJA TIDAK DIBERSIHKAN (di luar cakupan, lihat
-- dokumen rencana): ia berhenti ditulis, tetap terbaca sebagai riwayat.

UPDATE ad_schedules a
SET is_extra_ad = true
FROM form_submissions fs
WHERE fs.id = a.submission_id
  AND a.distribution_type IS DISTINCT FROM 'kilat'
  AND NOT a.is_extra_ad
  AND (
        COALESCE(fs.admin_notes, '') LIKE '%[EXTRA_AD]%'
     OR EXISTS (
          SELECT 1 FROM survey_pages sp
          WHERE sp.submission_id = a.submission_id AND sp.is_extra_ad
        )
      );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Aturan kilat: trigger yang membersihkan + CHECK yang menjamin
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_schedule_extra_ad_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Kilat tidak punya kolam tambahan. Dibersihkan, bukan ditolak: jalur yang
  -- sampai ke sini adalah mesin (mirror submission, konversi tipe distribusi),
  -- dan menggagalkan konversi demi sebuah flag turunan hanya memindahkan
  -- kerusakan ke tempat yang lebih sulit dilihat.
  IF NEW.distribution_type = 'kilat' THEN
    NEW.is_extra_ad := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_schedules_extra_ad_rules ON ad_schedules;
CREATE TRIGGER trg_ad_schedules_extra_ad_rules
  BEFORE INSERT OR UPDATE ON ad_schedules
  FOR EACH ROW EXECUTE FUNCTION enforce_schedule_extra_ad_rules();

ALTER TABLE ad_schedules DROP CONSTRAINT IF EXISTS ad_schedules_kilat_never_extra;
ALTER TABLE ad_schedules
  ADD CONSTRAINT ad_schedules_kilat_never_extra
  CHECK (distribution_type IS DISTINCT FROM 'kilat' OR NOT is_extra_ad);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Kalender pemesanan ikut membacanya
-- ─────────────────────────────────────────────────────────────────────────
--
-- ⚠️ INI BAGIAN YANG PALING MUDAH TERLEWAT. Cabang perpanjangan di
-- `fetchSlotAvailability` datang dari RPC ini sejak sql/52, jadi mengganti
-- `extraAdMap` di TypeScript saja akan membuat setiap jadwal ke-2 diam-diam
-- kembali dihitung reguler.
--
-- DROP + CREATE (bukan REPLACE) karena bentuk baris kembaliannya berubah;
-- karena itu grant-nya ikut hilang dan harus dipasang ulang di bawah.

DROP FUNCTION IF EXISTS get_extend_slot_occupancy(TEXT);

CREATE FUNCTION get_extend_slot_occupancy(p_distribution_type TEXT DEFAULT 'regular')
RETURNS TABLE (
  id                UUID,
  submission_id     UUID,
  start_date        TIMESTAMPTZ,
  end_date          TIMESTAMPTZ,
  submission_status TEXT,
  payment_status    TEXT,
  slot_booked_by    TEXT,
  slot_reserved_at  TIMESTAMPTZ,
  title             TEXT,
  admin_notes       TEXT,
  is_extra_ad       BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.source_id, a.submission_id,
         a.start_date, a.end_date,
         a.status, a.payment_status,
         a.slot_booked_by, a.slot_reserved_at,
         fs.title, fs.admin_notes,
         a.is_extra_ad
  FROM ad_schedules a
  JOIN form_submissions fs ON fs.id = a.submission_id
  WHERE a.source_table = 'form_submissions_extend'
    AND a.start_date IS NOT NULL
    AND a.end_date IS NOT NULL
    AND a.status IN ('waiting_payment','paid','scheduled','live')
    AND fs.distribution_type IS NOT DISTINCT FROM p_distribution_type;
$$;

-- Pelajaran sql/52: Supabase memasang ALTER DEFAULT PRIVILEGES ... TO anon,
-- jadi "tidak memberi grant" TIDAK cukup — harus dicabut eksplisit.
REVOKE ALL ON FUNCTION get_extend_slot_occupancy(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_extend_slot_occupancy(TEXT) TO authenticated, service_role;

-- Kaki KEDUA kalender: jadwal ordinal 1.
--
-- Kenapa fungsi baru dan bukan menambah kolom di SELECT yang sudah ada:
-- kaki ini membaca `form_submissions` LANGSUNG, dan `is_extra_ad` tidak ada di
-- sana — ia ada di `ad_schedules`, yang RLS-nya membatasi peneliti ke ordernya
-- sendiri. Membaca ad_schedules dari klien berarti kalender peneliti berhenti
-- melihat pesaingnya dan kuota jebol; persis alasan sql/52 memindahkan kaki
-- perpanjangan ke RPC.
--
-- Saringan, tanggal, dan tipe kolomnya SENGAJA IDENTIK dengan query lama
-- (`start_date`/`end_date` tetap DATE dari `form_submissions`, bukan
-- TIMESTAMPTZ dari cermin) supaya migrasi ini tidak menyelundupkan perubahan
-- perilaku tanggal di kalender. Yang berubah hanya: satu kolom baru ikut, dan
-- kaki ini berhenti bergantung pada policy "User View Own Submissions"
-- (USING true) yang memapar seluruh baris order — termasuk email dan telepon —
-- ke setiap akun yang login.

CREATE OR REPLACE FUNCTION get_submission_slot_occupancy(p_distribution_type TEXT DEFAULT 'regular')
RETURNS TABLE (
  id                UUID,
  title             TEXT,
  start_date        DATE,
  end_date          DATE,
  submission_status TEXT,
  slot_booked_by    TEXT,
  slot_reserved_at  TIMESTAMPTZ,
  payment_status    TEXT,
  admin_notes       TEXT,
  is_extra_ad       BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fs.id, fs.title, fs.start_date, fs.end_date,
         fs.submission_status, fs.slot_booked_by, fs.slot_reserved_at,
         fs.payment_status, fs.admin_notes,
         a.is_extra_ad
  FROM form_submissions fs
  JOIN ad_schedules a
    ON a.source_table = 'form_submissions' AND a.source_id = fs.id
  WHERE fs.start_date IS NOT NULL
    AND fs.submission_status NOT IN (
      'rejected','spam','in_review','completed','cancelled','slot_cancelled'
    )
    AND fs.distribution_type = p_distribution_type;
$$;

REVOKE ALL ON FUNCTION get_submission_slot_occupancy(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_submission_slot_occupancy(TEXT) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Jalur tulis: view perpanjangan ikut membawa kolomnya
-- ─────────────────────────────────────────────────────────────────────────
--
-- Jadwal BARU dibuat lewat INSERT ke view `form_submissions_extend`. Tanpa
-- kolom ini di view, admin hanya bisa menandai jadwal SESUDAH ia tersimpan —
-- dan di antara dua langkah itu jadwalnya memakan slot reguler. Jendela itu
-- kecil, tapi ia persis kerusakan yang sedang kita perbaiki.

CREATE OR REPLACE VIEW form_submissions_extend
WITH (security_invoker = true) AS
  SELECT a.source_id AS id,
         a.submission_id,
         a.duration,
         a.start_date,
         a.end_date,
         a.slot_booked_by,
         a.slot_reserved_at,
         a.status AS submission_status,
         a.payment_status,
         a.prize_per_winner,
         a.winner_count,
         a.additional_prize_per_winner,
         a.is_new_period AS is_new_month,
         a.period_batch,
         a.total_cost::INTEGER AS total_cost,
         a.voucher_code,
         a.admin_notes,
         a.created_at,
         a.updated_at,
         a.subtotal,
         a.ppn_amount,
         a.is_extra_ad
  FROM ad_schedules a
  WHERE a.source_table = 'form_submissions_extend';

CREATE OR REPLACE FUNCTION extend_view_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id                UUID := COALESCE(NEW.id, gen_random_uuid());
  v_distribution_type TEXT;
  v_review_status     TEXT;
  v_is_extra          BOOLEAN;
BEGIN
  SELECT fs.distribution_type, review_status_of(fs.submission_status)
    INTO v_distribution_type, v_review_status
  FROM form_submissions fs WHERE fs.id = NEW.submission_id;

  -- Tidak disebut = MEWARISI ordinal 1, bukan false.
  --
  -- Ini yang membuat perilaku hari ini tetap utuh: layar admin sudah memanggil
  -- `onCreateSchedule(schedules[0]?.isExtraAd)`, jadi jadwal ke-2 sebuah iklan
  -- tambahan memang selalu tambahan. Default false akan diam-diam memindahkan
  -- jadwal itu ke kolam reguler — regresi yang tak terlihat sampai kolam
  -- reguler kelebihan jual.
  v_is_extra := NEW.is_extra_ad;
  IF v_is_extra IS NULL THEN
    SELECT a.is_extra_ad INTO v_is_extra
    FROM ad_schedules a
    WHERE a.submission_id = NEW.submission_id
      AND a.source_table = 'form_submissions';
  END IF;

  IF COALESCE(NEW.submission_status, 'waiting_payment') <> 'cancelled' THEN
    PERFORM assert_schedule_window_free(NEW.submission_id, NEW.start_date, NEW.end_date, v_id, true);
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
    is_extra_ad,
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
    COALESCE(v_is_extra, false),
    COALESCE(NEW.created_at, NOW()), COALESCE(NEW.updated_at, NOW())
  );

  PERFORM resync_ad_schedule_ordinals(NEW.submission_id);
  NEW.id := v_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION extend_view_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.start_date IS DISTINCT FROM OLD.start_date
      OR NEW.end_date IS DISTINCT FROM OLD.end_date
      OR (OLD.submission_status = 'cancelled' AND NEW.submission_status <> 'cancelled'))
     AND COALESCE(NEW.submission_status, '') <> 'cancelled'
  THEN
    PERFORM assert_schedule_window_free(NEW.submission_id, NEW.start_date, NEW.end_date, OLD.id, true);
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
    -- NULL berarti "tidak disebut di payload", bukan "jadikan reguler".
    is_extra_ad                 = COALESCE(NEW.is_extra_ad, OLD.is_extra_ad, false),
    updated_at                  = COALESCE(NEW.updated_at, NOW())
  WHERE source_table = 'form_submissions_extend' AND source_id = OLD.id;

  IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    PERFORM resync_ad_schedule_ordinals(NEW.submission_id);
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Satu-satunya jalur MANUSIA: set_schedule_extra_ad()
-- ─────────────────────────────────────────────────────────────────────────
--
-- Kenapa RPC dan bukan UPDATE langsung: `ad_schedules` TIDAK punya policy
-- UPDATE sama sekali (cek pg_policy — hanya SELECT untuk pemilik/admin, dan
-- akses penuh service_role). Setiap tulisan dari dashboard melewati view atau
-- trigger SECURITY DEFINER. Jadwal ordinal 1 tidak ada di view mana pun, jadi
-- tanpa fungsi ini togglenya mustahil untuk jadwal pertama — yaitu justru
-- jadwal yang dimiliki 21 dari 21 order tambahan hari ini.

CREATE OR REPLACE FUNCTION set_schedule_extra_ad(p_schedule_id UUID, p_is_extra BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_distribution_type TEXT;
BEGIN
  IF NOT (
       COALESCE(auth.jwt() ->> 'email', '') = 'product@jakpat.net'
    OR COALESCE(auth.role(), '') = 'service_role'
  ) THEN
    RAISE EXCEPTION 'Hanya admin yang boleh mengubah status iklan tambahan.'
      USING ERRCODE = '42501';
  END IF;

  SELECT a.distribution_type INTO v_distribution_type
  FROM ad_schedules a WHERE a.id = p_schedule_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jadwal % tidak ditemukan.', p_schedule_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Di sini penolakannya KERAS, beda dari trigger yang membersihkan diam-diam:
  -- ini satu-satunya tempat seorang manusia menyatakan maksud, dan maksud yang
  -- keliru harus berbunyi.
  IF p_is_extra AND v_distribution_type = 'kilat' THEN
    RAISE EXCEPTION 'JFU Kilat tidak punya kuota iklan tambahan — slot tambahan hanya berlaku untuk Iklan.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE ad_schedules
  SET is_extra_ad = p_is_extra, updated_at = NOW()
  WHERE id = p_schedule_id;

  RETURN p_is_extra;
END;
$$;

REVOKE ALL ON FUNCTION set_schedule_extra_ad(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_schedule_extra_ad(UUID, BOOLEAN) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. survey_pages jadi cermin (dua arah kejadian, satu arah kebenaran)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION push_page_extra_ad()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE survey_pages sp
  SET is_extra_ad = NEW.is_extra_ad
  WHERE sp.submission_id = NEW.submission_id
    AND sp.is_extra_ad IS DISTINCT FROM NEW.is_extra_ad;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_schedules_push_page_extra_ad ON ad_schedules;
CREATE TRIGGER trg_ad_schedules_push_page_extra_ad
  AFTER UPDATE OF is_extra_ad ON ad_schedules
  FOR EACH ROW
  WHEN (NEW.source_table = 'form_submissions'
        AND OLD.is_extra_ad IS DISTINCT FROM NEW.is_extra_ad)
  EXECUTE FUNCTION push_page_extra_ad();

CREATE OR REPLACE FUNCTION pull_page_extra_ad()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_extra BOOLEAN;
BEGIN
  -- Halaman lepas (tanpa order) tidak punya jadwal untuk diikuti; nilainya
  -- dibiarkan apa adanya.
  IF NEW.submission_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.is_extra_ad INTO v_is_extra
  FROM ad_schedules a
  WHERE a.submission_id = NEW.submission_id
    AND a.source_table = 'form_submissions';

  IF FOUND THEN
    NEW.is_extra_ad := v_is_extra;
  END IF;
  RETURN NEW;
END;
$$;

-- BEFORE INSERT, dan sengaja MENIMPA nilai yang dikirim pemanggil: sejak
-- migrasi ini `ad_schedules` yang memiliki jawabannya. `ensure_survey_page()`
-- (sql/40/42/55) menuliskan FALSE mati di sana, dan `PageBuilderModal`
-- mengirim salinan yang ia baca saat modal dibuka — keduanya tidak tahu apa
-- yang admin setel sesudahnya.
DROP TRIGGER IF EXISTS trg_survey_pages_pull_extra_ad ON survey_pages;
CREATE TRIGGER trg_survey_pages_pull_extra_ad
  BEFORE INSERT ON survey_pages
  FOR EACH ROW EXECUTE FUNCTION pull_page_extra_ad();

COMMENT ON COLUMN survey_pages.is_extra_ad IS
  'CERMIN dari ad_schedules.is_extra_ad jadwal ordinal 1 sejak sql/63 — jangan '
  'tulis langsung. Masih dibaca adOrdering.ts, functions/api/surveys.js, '
  'publish-pages/types.ts, SubmissionsTableRow.tsx, CampaignActions.tsx.';

COMMIT;

-- ============================================================================
-- VERIFIKASI (jalankan setelah COMMIT, catat angkanya)
-- ============================================================================
--
--   -- 24 regular, 0 kilat
--   SELECT distribution_type, count(*) FROM ad_schedules
--   WHERE is_extra_ad GROUP BY 1;
--
--   -- 0 — cermin halaman sepakat dengan jadwal ordinal 1
--   SELECT count(*) FROM survey_pages sp
--   JOIN ad_schedules a ON a.submission_id = sp.submission_id
--                      AND a.source_table = 'form_submissions'
--   WHERE COALESCE(sp.is_extra_ad,false) IS DISTINCT FROM a.is_extra_ad;
--
--   -- 0 — aturan kilat tidak bisa dilanggar
--   SELECT count(*) FROM ad_schedules
--   WHERE distribution_type = 'kilat' AND is_extra_ad;
--
--   -- false — anon tidak boleh menjalankan keduanya
--   SELECT has_function_privilege('anon','set_schedule_extra_ad(uuid,boolean)','EXECUTE'),
--          has_function_privilege('anon','get_extend_slot_occupancy(text)','EXECUTE'),
--          has_function_privilege('anon','get_submission_slot_occupancy(text)','EXECUTE');
--
--   -- kedua kaki masih memulangkan baris (kalender tidak kosong)
--   SELECT (SELECT count(*) FROM get_submission_slot_occupancy('regular')) AS ord1_regular,
--          (SELECT count(*) FROM get_extend_slot_occupancy('regular'))     AS extend_regular;
--
-- ============================================================================
-- YANG BERGANTUNG PADA MIGRASI INI
-- ============================================================================
--
--   `fetchSlotAvailability` berhenti memakai `extraAdMap` (query survey_pages
--   terpisah — kaki yang MENGGANTUNG di produksi 2026-08-19) dan membaca
--   `is_extra_ad` dari kedua RPC. Selama migrasi ini
--   belum diterapkan, kaki perpanjangan tidak mengembalikan kolomnya dan SEMUA
--   jadwal ke-2 akan terbaca reguler.
--
--   Toggle "Iklan tambahan" di `ScheduleForm.tsx` memanggil
--   `set_schedule_extra_ad()`. Tanpa migrasi ini fungsinya tidak ada dan
--   togglenya gagal keras — itu perilaku yang benar; jangan deploy kodenya
--   lebih dulu.
