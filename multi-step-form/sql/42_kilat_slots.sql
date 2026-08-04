-- ============================================================
-- Migration 42: Slot distribusi Kilat + halaman iklan dikecualikan untuk Kilat
-- Date: 2026-08-04
--
-- DUA HAL, SATU FILE — keduanya syarat jembatan "Jadikan Kilat" di dashboard
-- admin, dan menerapkan yang satu tanpa yang lain meninggalkan lubang.
--
-- (A) KOLOM kilat_slot_hour
-- -------------------------
-- Kilat didistribusikan dalam empat gelombang push per hari kerja — 08.00,
-- 11.00, 14.00, 17.00 WIB — dua order per gelombang. Jam itu tidak bisa
-- disimpan di kolom yang sudah ada:
--
--   * form_submissions.start_date bertipe DATE (lihat sql/39). Sebuah DATE tidak
--     membawa jam sama sekali; konvensinya "15.00 WIB pada hari itu".
--   * updateScheduleDates() di src/utils/supabase.ts memaku SETIAP jadwal ke
--     15.00 WIB sebelum menulis, justru supaya reschedule tidak pernah
--     menyimpan jendela di jam yang salah.
--
-- Jadi jam pilihan Kilat hilang dua kali hari ini. Kolom terpisah membuatnya
-- eksplisit dan tidak mengusik satu pun aturan 15.00 WIB yang berlaku untuk
-- iklan regular.
--
-- NULL berarti "order Kilat yang belum ditugaskan slotnya" — itu keadaan yang
-- sah, bukan cacat data: wizard user memesan Kilat per-hari tanpa memilih jam,
-- dan admin menugaskan slotnya belakangan. Karena itu kolomnya nullable dan
-- CHECK-nya meloloskan NULL.
--
-- Aturan Senin–Jumat SENGAJA tidak dijadikan CHECK constraint. Hari kerja
-- adalah kebijakan operasional yang bisa berubah (dan libur nasional tidak
-- terwakili oleh EXTRACT(DOW) juga), sementara constraint akan mengunci baris
-- lama yang terlanjur jatuh di akhir pekan. Penegakannya di UI penjadwalan.
--
-- (B) ensure_survey_page() TIDAK LAGI MENERBITKAN HALAMAN UNTUK KILAT
-- -------------------------------------------------------------------
-- sql/40 (aktif di produksi sejak 2026-08-04) membuat + mempublikasikan halaman
-- iklan untuk setiap order yang lunas, dan tidak pernah memeriksa
-- distribution_type. Padahal Kilat justru dijual sebagai distribusi TANPA
-- halaman — "Push notifikasi langsung ke responden", dan dashboard admin sendiri
-- sudah menyatakan "Distribusi Kilat. Tidak menggunakan Page builder."
-- (CampaignActions.tsx).
--
-- Akibatnya order Kilat yang lunas mendapat kartu iklan di feed aplikasi Jakpat
-- secara cuma-cuma, lengkap dengan banner default dan satu tempat di
-- display_order — kapasitas tayang yang tidak dibayar siapa pun. Selama ini tidak
-- terlihat karena Kilat hanya bisa dipesan lewat voucher JFUSUHUD; membuka
-- jembatan admin akan membuatnya rutin.
--
-- Fungsi di bawah adalah SALINAN UTUH dari sql/40 dengan satu guard tambahan di
-- blok prasyarat. File ini MENGGANTI definisi fungsi dari sql/40 — kalau suatu
-- saat sql/40 dijalankan ulang, jalankan file ini lagi sesudahnya.
-- Trigger trg_form_submissions_ensure_page tidak disentuh; ia memanggil fungsi
-- ini lewat nama.
--
-- ⚠️ JALANKAN PRE-CHECK DI BAGIAN BAWAH LEBIH DULU. Guard ini hanya mencegah
-- halaman BARU. Halaman Kilat yang terlanjur terbit tidak disentuh — apa yang
-- harus dilakukan terhadapnya adalah keputusan manusia, bukan migrasi.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS +
-- CREATE OR REPLACE. Tidak ada perubahan data.
-- Bergantung pada airing_instant_of_date() dari sql/39 (sudah diterapkan).
-- ============================================================


-- ============================================
-- 1. Kolom slot Kilat
-- ============================================
-- DUPLICATED sebagai KILAT_SLOT_HOURS di src/utils/constants.ts — WAJIB diubah
-- bersamaan. Kalau daftar jamnya berubah, constraint ini menolak jam baru sampai
-- ikut diperbarui, dan itu memang perilaku yang diinginkan.
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS kilat_slot_hour SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'form_submissions_kilat_slot_hour_check'
  ) THEN
    ALTER TABLE public.form_submissions
      ADD CONSTRAINT form_submissions_kilat_slot_hour_check
      CHECK (kilat_slot_hour IS NULL OR kilat_slot_hour IN (8, 11, 14, 17));
  END IF;
END $$;

COMMENT ON COLUMN public.form_submissions.kilat_slot_hour IS
  'Gelombang push Kilat dalam jam WIB (8/11/14/17). NULL = order Kilat yang slotnya belum ditugaskan admin, atau order regular. Tidak berlaku untuk distribution_type = ''regular''.';

-- Penghitung kuota membaca (tanggal, jam) hanya untuk baris Kilat, jadi indeksnya
-- parsial — iklan regular tidak perlu ikut membesarkannya.
CREATE INDEX IF NOT EXISTS idx_form_submissions_kilat_slot
  ON public.form_submissions (start_date, kilat_slot_hour)
  WHERE distribution_type = 'kilat';


-- ============================================
-- 2. ensure_survey_page — salinan sql/40 + guard Kilat
-- ============================================
CREATE OR REPLACE FUNCTION ensure_survey_page(p_submission_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub        RECORD;
  v_base_slug  TEXT;
  v_slug       TEXT;
  v_suffix     INT := 2;
  v_page_id    UUID;
  -- Mirror of defaultSurveiAdBlocks in
  -- src/components/PageBuilder/PageBuilderModal.tsx. Two copies of a static
  -- template is the lesser evil versus an edge function for three paragraphs —
  -- but if you change one, change the other.
  v_blocks JSONB := '{
    "type": "doc",
    "content": [
      {"type":"paragraph","content":[{"type":"text","text":"Hi Jakpaters! Yuk, isi survei berikut sesuai dengan kondisi kamu saat ini. Hanya responden yang sesuai kriteria, mengisi dengan serius, dan tidak menjawab asal-asalan yang akan masuk ke dalam undian 😉"}]},
      {"type":"paragraph","content":[{"type":"text","text":"Jangan lupa untuk mengisi Jakpat ID kamu dengan benar (tanpa teks \"https://jakpat.net/s/\" di awal dan tanpa spasi di dalam Jakpat ID mu)."}]},
      {"type":"paragraph","content":[{"type":"text","text":"Semua pemenang undian survei akan diumumkan setiap akhir bulan, jadi tunggu pengumuman dari kami ya. Semoga beruntung! ✨"}]}
    ]
  }'::JSONB;
BEGIN
  -- Already has a page: return it. This is the retry path.
  SELECT id INTO v_page_id FROM survey_pages WHERE submission_id = p_submission_id;
  IF FOUND THEN
    RETURN v_page_id;
  END IF;

  SELECT * INTO v_sub FROM form_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- ── TAMBAHAN sql/42 ──
  -- Kilat berjalan lewat push notification ke responden, bukan lewat kartu iklan
  -- di feed aplikasi. Menerbitkan halaman untuknya memberi kapasitas tayang yang
  -- tidak dibayar. Bukan halaman kosong, bukan halaman tersembunyi — tidak ada
  -- halaman sama sekali, sama seperti sebelum sql/40 ada.
  IF v_sub.distribution_type = 'kilat' THEN
    RETURN NULL;
  END IF;

  -- Prerequisites. A page without a working survey link is worse than no page,
  -- and a page with no window would be published indefinitely.
  IF v_sub.submission_status IN ('rejected', 'spam')
     OR COALESCE(BTRIM(v_sub.survey_url), '') = ''
     OR v_sub.start_date IS NULL
     OR v_sub.end_date IS NULL
     OR COALESCE(BTRIM(v_sub.title), '') = ''
  THEN
    RETURN NULL;
  END IF;

  -- Slug: same rules as generateSlug() in PageBuilderModal.tsx — lowercase,
  -- strip anything but a-z 0-9 space hyphen, spaces to hyphens, collapse
  -- hyphens, cap at 60.
  v_base_slug := LEFT(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(LOWER(BTRIM(v_sub.title)), '[^a-z0-9[:space:]-]', '', 'g'),
        '[[:space:]]+', '-', 'g'),
      '-+', '-', 'g'),
    60);
  v_base_slug := BTRIM(v_base_slug, '-');

  IF v_base_slug = '' THEN
    v_base_slug := 'survei';
  END IF;

  -- Uniqueness matters far more here than when an admin was watching: the
  -- public page loads with .eq('slug', slug).single(), so two pages sharing a
  -- slug break BOTH of them.
  v_slug := v_base_slug;
  IF EXISTS (SELECT 1 FROM survey_pages WHERE slug = v_slug) THEN
    v_slug := LEFT(v_base_slug, 53) || '-' || LEFT(p_submission_id::TEXT, 6);
    WHILE EXISTS (SELECT 1 FROM survey_pages WHERE slug = v_slug) LOOP
      v_slug := LEFT(v_base_slug, 51) || '-' || LEFT(p_submission_id::TEXT, 6) || '-' || v_suffix;
      v_suffix := v_suffix + 1;
    END LOOP;
  END IF;

  -- Note there is no criteria column to fill: respondent criteria live on
  -- form_submissions.criteria_responden and the public page reads them through
  -- the join, exactly as PageBuilderModal does. survey_pages.criteria (jsonb)
  -- is a different, unused column — do not repurpose it here.
  INSERT INTO survey_pages (
    submission_id, slug, title, banner_url, is_published,
    blocks, custom_fields,
    publish_start_date, publish_end_date,
    redirect_url, is_extra_ad, is_hidden,
    display_order, requires_banner_update
  ) VALUES (
    p_submission_id,
    v_slug,
    v_sub.title,
    -- Generic ad banner, served from public/. Not a technical fallback: without
    -- one the Jakpat app falls back to its own card styling, which looks
    -- nothing like an ad, and respondents cannot tell a paid survey from an
    -- announcement. Deliberately carries no prize figure, so it never goes
    -- stale when a reward batch changes.
    -- DUPLICATED as DEFAULT_AD_BANNER_URL in src/utils/constants.ts.
    '/default-ad-banner.jpg',
    TRUE,
    v_blocks,
    '[]'::JSONB,
    -- form_submissions stores DATE; the airing window is 15:00 WIB on that day.
    airing_instant_of_date(v_sub.start_date),
    airing_instant_of_date(v_sub.end_date),
    NULL,
    FALSE,
    FALSE,                    -- visible in the app feed, per the 2026-08-03 decision
    -- Not NULL: orderBand() in functions/api/surveys.js puts unplaced regular
    -- pages in band 0, the very top of the app feed. A card that has no banner
    -- yet must not be the most prominent thing in the app. MAX+1 lands it
    -- behind everything an admin has already arranged; set_survey_pages_order
    -- renormalises it the moment anyone drags the list.
    (SELECT COALESCE(MAX(display_order), -1) + 1 FROM survey_pages),
    -- FALSE, deliberately. The flag means "the banner is showing stale reward
    -- info" — that is what the DOKU webhook sets it for, when a new batch or a
    -- top-up changes the prize. A page that has no banner has nothing stale to
    -- show. Setting it TRUE here would raise a badge on every newly paid order,
    -- and since 235 of 262 published pages already run with no banner at all,
    -- that badge would be permanent and universal. A warning that is always on
    -- is a warning that stops being read.
    FALSE
  )
  RETURNING id INTO v_page_id;

  RETURN v_page_id;
END;
$$;

COMMENT ON FUNCTION ensure_survey_page(UUID) IS
  'Creates and publishes the survey page for a paid submission if it does not exist yet, EXCEPT for distribution_type = ''kilat'' which has no ad page at all (sql/42). Gets the generic default banner, not a real one. Idempotent — returns the existing page id on a retry.';


-- ============================================
-- PRE-CHECK — halaman Kilat yang terlanjur terbit, jalankan SEBELUM bagian 2
-- ============================================
-- Guard di atas hanya mencegah halaman baru. Yang sudah ada tetap tayang.
-- Kalau query ini mengembalikan baris, putuskan sendiri per baris: dibiarkan
-- (order lama yang memang sudah dijanjikan halaman), disembunyikan
-- (UPDATE survey_pages SET is_hidden = TRUE), atau ditarik
-- (SET is_published = FALSE). Jangan diserahkan ke skrip.
--
-- SELECT sp.id AS page_id, sp.slug, sp.is_published, sp.is_hidden,
--        sp.publish_start_date, sp.publish_end_date,
--        fs.id AS submission_id, fs.title, fs.payment_status, fs.submission_status
-- FROM survey_pages sp
-- JOIN form_submissions fs ON fs.id = sp.submission_id
-- WHERE fs.distribution_type = 'kilat'
-- ORDER BY sp.publish_start_date DESC NULLS LAST;


-- ============================================
-- VERIFIKASI — jalankan SESUDAH menerapkan
-- ============================================
-- (1) Kolom ada dan bertipe smallint:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'form_submissions'
--   AND column_name = 'kilat_slot_hour';
--
-- (2) CHECK menggigit — harus GAGAL dengan pelanggaran constraint:
-- UPDATE form_submissions SET kilat_slot_hour = 9
-- WHERE distribution_type = 'kilat' LIMIT 1;
--
-- (3) NULL tetap diterima (order Kilat yang belum ditugaskan slot):
-- UPDATE form_submissions SET kilat_slot_hour = NULL
-- WHERE distribution_type = 'kilat' LIMIT 1;
--
-- (4) Guard Kilat aktif — harus mengembalikan NULL, dan tidak meninggalkan baris:
-- SELECT ensure_survey_page('<uuid-order-kilat-yang-belum-punya-halaman>');
-- SELECT count(*) FROM survey_pages WHERE submission_id = '<uuid-order-kilat>';  -- 0
--
-- (5) Jalur regular TIDAK ikut mati — masih mengembalikan uuid halaman:
-- SELECT ensure_survey_page('<uuid-order-regular-lunas-tanpa-halaman>');


-- ============================================
-- ROLLBACK
-- ============================================
-- Kolomnya aman ditinggal (nullable, tidak dibaca kode lama). Yang perlu
-- dikembalikan hanya fungsinya: jalankan ulang bagian 2 dari
-- sql/40_auto_publish_page.sql — versinya tanpa guard Kilat.
--
-- Kalau kolomnya benar-benar harus hilang:
-- DROP INDEX IF EXISTS idx_form_submissions_kilat_slot;
-- ALTER TABLE public.form_submissions
--   DROP CONSTRAINT IF EXISTS form_submissions_kilat_slot_hour_check,
--   DROP COLUMN IF EXISTS kilat_slot_hour;
