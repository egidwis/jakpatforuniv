-- ============================================================================
-- sql/95 — KILAT PUNYA HALAMAN (Phase 5)
-- ============================================================================
--
-- ⚠️ INI MEMBALIK INVARIAN, BUKAN MENAMBAH FITUR.
--
-- Sejak sql/42, "order Kilat tidak boleh punya halaman" ditegakkan di ENAM
-- tempat. Berkas ini mencabut penegakannya di lapis SQL. Lima lapis sisanya
-- (TypeScript) dicabut di commit yang menyertai berkas ini. Jangan jalankan
-- berkas ini sendirian tanpa kode itu, dan sebaliknya.
--
-- ── PEMBALIKAN ALASAN sql/42 — DITULIS EKSPLISIT AGAR TIDAK DIHIDUPKAN LAGI ──
--
-- sql/42_kilat_slots.sql:135-142 menolak halaman Kilat dengan alasan:
--
--     "Kilat berjalan lewat push notification ke responden, bukan lewat kartu
--      iklan di feed aplikasi. Menerbitkan halaman untuknya memberi kapasitas
--      tayang yang tidak dibayar. Bukan halaman kosong, bukan halaman
--      tersembunyi — tidak ada halaman sama sekali."
--
-- Alasan itu MENOLAK "halaman tersembunyi" secara eksplisit — yaitu persis
-- rancangan Phase 5. Pemilik produk menyatakannya USANG, dengan sebab:
--
--   Premisnya "halaman = kapasitas tayang". Itu benar HANYA bila halaman itu
--   muncul di daftar publik. Halaman Kilat TIDAK muncul, di dua permukaan
--   sekaligus, disaring lewat `distribution_type`:
--
--       /pages        → src/pages/public/SurveyListingPage.tsx
--       /api/surveys  → functions/api/surveys.js
--
--   Ia bukan kartu di feed. Ia TUJUAN PENDARATAN push notification: admin
--   menyalin tautannya dari dashboard JFU lalu memasangnya ke dalam survei
--   Jakpat. Nol perhatian diambil dari iklan reguler yang membayar.
--
-- Kalau kelak ada yang hendak menghidupkan kembali penolakan itu: cabut dulu
-- kedua filter di atas, atau Kilat akan kehilangan satu-satunya tautannya.
--
-- ── SUMBER SALINAN ──────────────────────────────────────────────────────────
--
-- Badan di bawah disalin dari sql/55_auto_page_display_order_neutral.sql —
-- versi produksi terakhir — dan sudah DIVERIFIKASI karakter demi karakter
-- terhadap `pg_get_functiondef('ensure_survey_page'::regproc)` pada 2026-09-18.
--
-- ⚠️ Jangan menyalin dari sql/40 atau sql/42. Jebakan ini nyata dan sudah
-- pernah menggigit di fungsi lain (lihat sql/49 vs sql/51 pada
-- sync_ad_schedule): menyalin dari berkas yang salah menghidupkan kembali
-- cabang yang sudah sengaja dibuang.
--
-- ── YANG BERUBAH DARI sql/55, HANYA DUA ─────────────────────────────────────
--
--   1. Blok `IF v_sub.distribution_type = 'kilat' THEN RETURN NULL` DIBUANG.
--   2. Jendela terbit BERCABANG menurut distribution_type.
--
-- Sisanya — slug, blocks, banner bawaan, display_order NULL, is_hidden FALSE,
-- requires_banner_update FALSE — identik. Kalau Anda melihat perbedaan lain,
-- itu bug penyalinan, bukan kesengajaan.
--
-- Idempotent. Tanpa perubahan skema. Tanpa perubahan data selain backfill yang
-- SENGAJA DIPISAH ke blok terakhir (tidak ikut jalan saat berkas ini dieksekusi).
-- ============================================================================

BEGIN;

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
  v_is_kilat   BOOLEAN;
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

  -- ── PENOLAKAN KILAT sql/42 DICABUT DI SINI (sql/95) ───────────────────────
  -- Dulu di titik ini berdiri:
  --     IF v_sub.distribution_type = 'kilat' THEN RETURN NULL; END IF;
  -- Alasan pencabutannya ada di kepala berkas ini. Ringkasnya: halaman Kilat
  -- tidak pernah muncul di /pages maupun /api/surveys, jadi ia tidak mengambil
  -- kapasitas tayang siapa pun. Ia satu-satunya tautan yang bisa dipasang admin
  -- ke dalam survei Jakpat. Tanpa halaman, iklan Kilat tidak bisa disiarkan
  -- sama sekali.
  v_is_kilat := (v_sub.distribution_type = 'kilat');

  -- Prerequisites. A page without a working survey link is worse than no page,
  -- and a page with no window would be published indefinitely.
  --
  -- ⚠️ `end_date IS NULL` menolak SENYAP (RETURN NULL, tanpa error) — dan untuk
  -- Kilat itu sekarang berarti "iklan tidak bisa disiarkan". Diukur 2026-09-18:
  -- 2 dari 19 order Kilat lunas punya start_date DAN end_date NULL (juga NULL
  -- di ad_schedules — tanggalnya memang tidak pernah tersimpan di mana pun).
  -- Keduanya SENGAJA dibiarkan gugur di sini; mengisi tanggalnya = menjadwalkan
  -- ulang order berbayar tanpa diminta, itu keputusan bisnis. Panel admin tab
  -- Page menampilkannya sebagai anomali yang berteriak, bukan kegagalan senyap.
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
    -- ⚠️ WAJIB TRUE, juga untuk Kilat. /api/respondents menyaring HANYA kolom
    -- ini; undian pemenang berantai survey_pages.id → page_respondents.page_id
    -- → jakpat_id. is_published=FALSE berarti pemenang Kilat tidak akan pernah
    -- bisa diundi. Penyembunyian Kilat dikerjakan di tempat lain (lihat bawah).
    TRUE,
    v_blocks,
    '[]'::JSONB,

    -- ── JENDELA TERBIT — BERCABANG (sql/95) ───────────────────────────────
    --
    -- MULAI. Reguler tayang 15:00 WIB pada tanggalnya; Kilat pada jam
    -- gelombangnya (08/11/14/17 WIB). kilat_instant_of (sql/45:99) sudah
    -- menangani kilat_slot_hour NULL → 00:00 WIB, sentinel yang sah: halaman
    -- tetap terbit dan tetap bisa dibuka sepanjang hari itu.
    CASE WHEN v_is_kilat
         THEN kilat_instant_of(v_sub.start_date, v_sub.kilat_slot_hour)
         ELSE airing_instant_of_date(v_sub.start_date)
    END,

    -- SELESAI. Reguler mengikuti end_date. Kilat: NULL.
    --
    -- ⚠️⚠️ NULL DI SINI BUKAN KELALAIAN. JANGAN "PERBAIKI". ⚠️⚠️
    --
    -- publish_end_date tidak menutup undian — ia menutup HALAMANNYA.
    -- SurveyPage.tsx:214-219 menolak SEMUA pengunjung sesudah tanggal itu
    -- lewat ("Survey sudah berakhir."), termasuk responden yang baru saja
    -- menekan push notification.
    --
    -- Untuk reguler itu benar: halaman hidup 7 hari, sama dengan masa tayang.
    -- Untuk Kilat jendelanya cuma 24 jam, sementara tautannya SUDAH tertanam
    -- di dalam survei Jakpat dan tidak bisa ditarik dari sisi kita. Tautan mati
    -- sementara push-nya masih beredar = responden mendarat di halaman tolak.
    --
    -- Jalur perpanjangan normal juga tertutup untuk Kilat: cron_activate_extends
    -- (sql/73:113-125) memindahkan jendela ke jadwal berikutnya, tapi Kilat
    -- diblokir dari penjadwalan ulang (canScheduleAgain.ts:50, sql/86:157-160).
    --
    -- NULL bukan konsep baru — ia konvensi yang sudah diuji:
    --   pageReachability.spec.ts:70 ...... jendela NULL → 'live'
    --   adOrdering.ts:69-70 .............. memperlakukan NULL sama
    --   PublishPageManagement.tsx:116-117  filter Live meloloskan NULL
    --
    -- UNDIAN TETAP TERTUTUP, lewat jalur yang TERPISAH SAMA SEKALI:
    -- get_batch_rewards_bulk membaca form_submissions.end_date dan
    -- ad_schedules.end_date — BUKAN publish_end_date. end_date Kilat sudah
    -- diisi start_date + 1 hari oleh updateKilatSchedule (supabase.ts:3166),
    -- jadi can_select_winners menyala sendiri 24 jam sesudah gelombang.
    -- ⚠️ Karena itu form_submissions.end_date Kilat TIDAK BOLEH dikosongkan
    -- oleh perubahan apa pun: ed NULL = undian beku SELAMANYA, senyap.
    --
    -- KONSEKUENSI YANG DITERIMA SADAR: storage-cleanup.js:53-55 membersihkan
    -- aset 7 hari sesudah publish_end_date, jadi banner Kilat TIDAK PERNAH
    -- terjangkau pembersih itu. Konsisten dengan "tautan tak boleh mati".
    CASE WHEN v_is_kilat
         THEN NULL
         ELSE airing_instant_of_date(v_sub.end_date)
    END,

    NULL,
    FALSE,
    -- ⚠️ is_hidden tetap FALSE, JUGA untuk Kilat — jangan tergoda memakainya.
    -- Penyembunyian Kilat bersifat STRUKTURAL lewat distribution_type, disaring
    -- di SurveyListingPage.tsx dan functions/api/surveys.js. Memakai is_hidden
    -- di sini akan salah sasaran dua kali: (a) ia tidak dihormati
    -- /api/respondents, jadi tidak menyembunyikan apa pun yang penting; dan
    -- (b) ia mencampuradukkan "disembunyikan admin" dengan "memang bukan iklan
    -- feed", sehingga admin yang menyembunyikan halaman reguler dan halaman
    -- Kilat tidak lagi bisa dibedakan.
    FALSE,                    -- visible in the app feed, per the 2026-08-03 decision
    -- NULL, not MAX+1 (sql/40/42's original rule) — reverted 2026-08-13.
    -- orderBand() in src/utils/adOrdering.ts treats a NULL, non-extra-ad page
    -- as band 0 (TOP), exactly like a manually-built page always got. Ordering
    -- no longer depends on whether a real banner has been uploaded yet, so a
    -- paying customer's ad isn't punished for an admin follow-up step nobody
    -- has done yet. set_survey_pages_order() still lets an admin place any
    -- page manually whenever they want.
    NULL,
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
  'Membuat halaman iklan untuk order lunas, idempotent. Sejak sql/95 MENCAKUP Kilat: halamannya adalah tujuan pendaratan push notification, disembunyikan dari /pages dan /api/surveys lewat filter distribution_type, dengan publish_end_date NULL supaya tautan yang sudah tertanam di survei Jakpat tidak pernah mati. Penolakan Kilat dari sql/42 dicabut — jangan dihidupkan lagi tanpa mencabut kedua filter itu dulu.';

COMMIT;

-- ============================================================================
-- DRY-RUN — jalankan ini DULU, tanpa menulis apa pun.
-- ============================================================================
--
-- Harapan per 2026-09-18: akan_lahir = 17, gagal_tanpa_tanggal = 2.
-- Kalau `akan_lahir` jauh dari 17, BERHENTI — ada yang berubah sejak rencana
-- ini ditulis. Kalau `gagal_tanpa_tanggal` > 2, laporkan sebelum melanjutkan.
--
-- SELECT
--   count(*)                                                   AS kilat_lunas,
--   count(*) FILTER (WHERE sp.id IS NOT NULL)                  AS sudah_punya_page,
--   count(*) FILTER (WHERE sp.id IS NULL
--                      AND fs.start_date IS NOT NULL
--                      AND fs.end_date   IS NOT NULL
--                      AND COALESCE(BTRIM(fs.survey_url),'') <> ''
--                      AND COALESCE(BTRIM(fs.title),'')      <> ''
--                      AND fs.submission_status NOT IN ('rejected','spam')) AS akan_lahir,
--   count(*) FILTER (WHERE sp.id IS NULL
--                      AND (fs.start_date IS NULL OR fs.end_date IS NULL))  AS gagal_tanpa_tanggal
-- FROM form_submissions fs
-- LEFT JOIN survey_pages sp ON sp.submission_id = fs.id
-- WHERE fs.distribution_type = 'kilat' AND fs.payment_status = 'paid';
--
-- Lihat DUA order yang akan gugur (diharapkan e9cb5944… dan 8c9c00a6…):
--
-- SELECT fs.id, LEFT(fs.title,40) AS judul, fs.start_date, fs.end_date,
--        fs.kilat_slot_hour, fs.created_at::date AS dibuat
-- FROM form_submissions fs
-- LEFT JOIN survey_pages sp ON sp.submission_id = fs.id
-- WHERE fs.distribution_type='kilat' AND fs.payment_status='paid'
--   AND sp.id IS NULL AND (fs.start_date IS NULL OR fs.end_date IS NULL);
--
-- Uji fungsi tanpa meninggalkan jejak — pilih satu id Kilat lunas dari daftar
-- `akan_lahir`, lalu:
--
-- BEGIN;
--   SELECT ensure_survey_page('<id-kilat-lunas>'::uuid) AS page_baru;
--   SELECT slug, is_published, is_hidden, publish_start_date, publish_end_date
--   FROM survey_pages WHERE submission_id = '<id-kilat-lunas>';
--   -- Harapan: is_published=t, is_hidden=f, publish_end_date IS NULL,
--   --          publish_start_date = jam gelombang WIB (08/11/14/17), atau
--   --          00:00 WIB bila kilat_slot_hour NULL.
-- ROLLBACK;   -- ⚠️ ROLLBACK, bukan COMMIT.
--
-- ============================================================================
-- BACKFILL — SENGAJA TERPISAH. Jangan jalankan bersama blok di atas.
-- Jalankan HANYA sesudah dry-run diperiksa pemilik produk.
-- Aman diulang: ensure_survey_page mengembalikan halaman lama bila sudah ada.
-- ============================================================================
--
-- BEGIN;
--   SELECT fs.id, LEFT(fs.title,40) AS judul,
--          ensure_survey_page(fs.id) AS page_id
--   FROM form_submissions fs
--   LEFT JOIN survey_pages sp ON sp.submission_id = fs.id
--   WHERE fs.distribution_type = 'kilat'
--     AND fs.payment_status    = 'paid'
--     AND sp.id IS NULL
--   ORDER BY fs.created_at;
--   -- Periksa: 17 baris, page_id TIDAK ADA yang NULL.
--   -- page_id NULL = prasyarat gugur → ROLLBACK dan laporkan, jangan COMMIT.
-- COMMIT;
--
-- ============================================================================
-- VERIFIKASI SESUDAH BACKFILL
-- ============================================================================
--
-- Semua halaman Kilat wajib: terbit, tidak tersembunyi, tanpa tanggal akhir.
--
-- SELECT count(*) AS total,
--        count(*) FILTER (WHERE sp.is_published)               AS terbit,
--        count(*) FILTER (WHERE NOT sp.is_hidden)              AS tidak_tersembunyi,
--        count(*) FILTER (WHERE sp.publish_end_date IS NULL)   AS tanpa_tanggal_akhir,
--        count(*) FILTER (WHERE sp.publish_start_date IS NULL) AS TANPA_MULAI_HARUS_0
-- FROM survey_pages sp
-- JOIN form_submissions fs ON fs.id = sp.submission_id
-- WHERE fs.distribution_type = 'kilat';
--
-- ⚠️ Halaman REGULER tidak boleh ikut berubah. Harapan: 0 baris.
--
-- SELECT count(*) AS reguler_kehilangan_tanggal_akhir
-- FROM survey_pages sp
-- JOIN form_submissions fs ON fs.id = sp.submission_id
-- WHERE fs.distribution_type <> 'kilat' AND sp.publish_end_date IS NULL;
--
-- Undian Kilat benar-benar terbuka (gelombang > 24 jam lalu). Kegagalannya
-- senyap — survei tetap muncul, hanya tak pernah boleh diundi. Harapan:
-- can_select_winners = true.
--
-- SELECT * FROM get_batch_rewards_bulk(ARRAY['<id-kilat-yang-sudah-lewat>']::uuid[]);
--
-- ⚠️ ACL — berkas sql bukan ACL produksi. pg_default_acl memberi `anon=X` DAN
-- `authenticated=X` ke setiap fungsi baru di public. ensure_survey_page bukan
-- fungsi baru (CREATE OR REPLACE mempertahankan ACL lama), jadi ini hanya
-- pemeriksaan. Harapan: TIDAK ADA anon/authenticated.
--
-- SELECT p.proname, array_to_string(p.proacl,' | ') AS acl
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname='public' AND p.proname='ensure_survey_page';
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
-- ⚠️ Dua lapis, dan URUTANNYA PENTING. Mengembalikan fungsi saja TIDAK
-- menghapus halaman yang sudah terlanjur lahir — dan halaman Kilat yang
-- tertinggal, sementara kode TypeScript sudah ikut di-revert (filter
-- distribution_type hilang), akan MUNCUL DI /pages. Itu lebih buruk daripada
-- keadaan sebelum maupun sesudah Phase 5. Hapus halamannya DULU.
--
-- 1) Hapus halaman Kilat yang lahir dari berkas ini.
--    Periksa dulu apa yang akan terhapus, JANGAN langsung DELETE:
--
-- SELECT sp.id, sp.slug, sp.created_at
-- FROM survey_pages sp JOIN form_submissions fs ON fs.id = sp.submission_id
-- WHERE fs.distribution_type = 'kilat';
--
--    ⚠️⚠️ DUA TABEL IKUT TERHAPUS — DIVERIFIKASI 2026-09-18, KEDUANYA CASCADE:
--         page_respondents_page_id_fkey ..... ON DELETE CASCADE
--         survey_winners_page_id_fkey ....... ON DELETE CASCADE
--
--    Artinya DELETE di bawah membuang jawaban responden DAN pemenang yang sudah
--    diundi, tanpa peringatan. Hitung dulu, JANGAN langsung DELETE:
--
-- SELECT
--   (SELECT count(*) FROM page_respondents pr
--      JOIN survey_pages sp ON sp.id = pr.page_id
--      JOIN form_submissions fs ON fs.id = sp.submission_id
--    WHERE fs.distribution_type='kilat') AS responden_akan_hilang,
--   (SELECT count(*) FROM survey_winners sw
--      JOIN survey_pages sp ON sp.id = sw.page_id
--      JOIN form_submissions fs ON fs.id = sp.submission_id
--    WHERE fs.distribution_type='kilat') AS pemenang_akan_hilang;
--
--    Bila salah satu > 0, BERHENTI dan minta keputusan manusia. Pemenang yang
--    sudah diundi mungkin sudah dibayar hadiahnya — menghapus barisnya
--    menghilangkan satu-satunya catatan bahwa undian itu pernah terjadi.
--    Dalam kasus itu, rollback yang benar adalah MENGOSONGKAN is_published
--    (halaman hilang dari semua permukaan tapi barisnya tinggal), bukan DELETE:
--
-- UPDATE survey_pages sp SET is_published = FALSE
-- FROM form_submissions fs
-- WHERE fs.id = sp.submission_id AND fs.distribution_type = 'kilat';
--
-- DELETE FROM survey_pages sp
-- USING form_submissions fs
-- WHERE fs.id = sp.submission_id AND fs.distribution_type = 'kilat';
--
-- 2) Kembalikan fungsi ke versi sql/55 (dengan penolakan Kilat).
--    Jalankan ulang sql/55_auto_page_display_order_neutral.sql apa adanya.
