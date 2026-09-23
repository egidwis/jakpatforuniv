-- ============================================================================
-- sql/99 — TUTUP JENDELA HALAMAN IKLAN SAAT UANGNYA DIBALIK / ORDERNYA BATAL
-- ============================================================================
--
-- ── INSIDEN ────────────────────────────────────────────────────────────────
--
-- Order uji 08ef25ac ("asda"), terbukti ke produksi 23 Sep 2026:
--
--   16 Sep  ditandai lunas manual → trg_form_submissions_ensure_page
--           melahirkan halaman `is_published=true`, jendela 22–27 Sep
--   lalu    "Batalkan pelunasan" (unmarkScheduleAsPaid) → order kembali
--           waiting_payment, HALAMAN TIDAK DISENTUH, tetap terbit
--   21 Sep  slot dibatalkan → cancelSchedule meng-NULL-kan publish_*_date
--           → feed (/api/surveys + SurveyListingPage) membaca NULL =
--           "tayang selamanya" → 11 responden dalam 6 jam, sehari SEBELUM
--           jadwal aslinya
--
-- Tanggal NULL SENGAJA berarti "abadi" (8 halaman "Pemenang Survei Spesial"
-- memakainya), jadi NULL bukan "mati". Dan feed tidak bisa memagari status
-- bayar: anon hanya boleh membaca 8 kolom form_submissions (sql/96).
--
-- ── ATURANNYA, SATU TEMPAT ─────────────────────────────────────────────────
--
-- Halaman order hanya boleh punya jendela terbuka selama ordernya "tayang"
-- (`order_is_airable`): lunas menurut predikat trg_ensure_survey_page yang
-- SAMA PERSIS, dan tidak berstatus slot_cancelled/cancelled/rejected/spam.
--
--   1. trg_form_submissions_close_page — order KELUAR dari "tayang" (atau
--      tagihannya jadi `expired` selagi tidak lunas) → jendela halamannya
--      ditutup: publish_end_date = now(), auto_closed_at = now().
--      Menangkap SEMUA jalur: unmark, batal slot, lepas slot di klien
--      peneliti (yang tak punya hak UPDATE survey_pages), cron, SQL ops.
--   2. ensure_survey_page — halaman sudah ada DAN auto_closed_at terisi →
--      jendela ditulis ulang dengan rumus yang SAMA dengan saat lahir, lalu
--      penanda dikosongkan. Tanpa ini order yang dibayar ulang tidak pernah
--      tayang lagi: uang diterima, iklan diam, tanpa tanda apa pun.
--   3. trg_ensure_survey_page — memicu ensure saat order MASUK "tayang"
--      (dulu: saat masuk "lunas"). Bedanya hanya pada order batal yang
--      payment_status-nya lunas: kembali ke status tayang sekarang membuka
--      halamannya lagi, dan lunas-tapi-batal tidak melahirkan halaman.
--   4. release_expired_order_slots — tulisan NULL ke survey_pages DIBUANG.
--      Ia jalan SESUDAH form_submissions diperbarui, jadi akan menimpa
--      penutupan nomor 1 dengan "tayang selamanya".
--   5. trg_ad_schedules_close_page_on_unpaid — perpanjangan yang dibatalkan
--      pelunasannya: kalau jendela halaman = jendela perpanjangan itu, tutup.
--      Pembukaannya lagi sudah diurus cron_activate_extends (live+paid).
--      TANPA auto_closed_at: ensure_survey_page tidak boleh membukanya dengan
--      tanggal ordinal 1. (0 baris hari ini — celah teoretis.)
--
-- Pasangan kodenya (rilis SESUDAH berkas ini):
--   * cancelSchedule & releaseExpiredSlot berhenti meng-NULL-kan tanggal.
--   * updateScheduleDates tidak menyalin tanggal ke halaman ber-auto_closed_at.
--   * PageBuilder yang menyimpan tanggal eksplisit mengosongkan auto_closed_at
--     (admin mengambil alih jendelanya).
--   * Dashboard membaca auto_closed_at supaya halaman tertutup otomatis tidak
--     menentukan stage order (kembaran kebuntuan Review ⇄ Jadwal).
--
-- ── KENAPA BUKAN is_published=false ────────────────────────────────────────
--
-- ⛔ /api/respondents dan undian pemenang HANYA menyaring is_published
-- (survey_pages.id → page_respondents → jakpat_id). Menurunkan halaman =
-- respondennya lenyap dari undian. Menutup jendela: halaman keluar dari feed,
-- SurveyPage.tsx menolak pengunjung baru ("Survey sudah berakhir"), undian
-- utuh. Menutup jendela juga TIDAK memicu email "iklan selesai" — itu dibaca
-- dari ad_schedules, bukan tanggal halaman.
--
-- ── TANPA BACKFILL ─────────────────────────────────────────────────────────
--
-- Keputusan pemilik produk 23 Sep: "asda" dan 11 respondennya dibiarkan.
-- Berkas ini TIDAK mengubah satu baris pun yang sudah ada — trigger hanya
-- bereaksi pada transisi SESUDAH ini. Langkah 1 memperlihatkannya.
--
-- ── ASAL BADAN FUNGSI ──────────────────────────────────────────────────────
--
-- ensure_survey_page, trg_ensure_survey_page, release_expired_order_slots
-- DISALIN DARI pg_get_functiondef PRODUKSI 23 Sep 2026, bukan dari sql/40/94/95
-- (memori sync-ad-schedule-body-copy-trap). Nama kolom diverifikasi ke
-- information_schema: plpgsql tidak memeriksanya saat CREATE.
--
-- ── HIBAH ──────────────────────────────────────────────────────────────────
--
-- pg_default_acl memberi anon DAN authenticated EXECUTE ke setiap fungsi baru.
-- ensure_survey_page & trg_ensure_survey_page hari ini ber-ACL
-- `anon=X, authenticated=X` — artinya siapa pun bisa melahirkan halaman untuk
-- submission apa pun lewat RPC. Nol pemanggil di src/ & functions/, satu-
-- satunya pemanggil DB adalah trigger (SECURITY DEFINER, jalan sebagai
-- postgres), jadi hibah itu DICABUT di sini. Verifikasi di Langkah 3.
--
-- ── URUTAN RILIS ───────────────────────────────────────────────────────────
--
--   Langkah 1 (pra-cek) → Langkah 2 (migrasi) → Langkah 3 (ACL) →
--   Langkah 4 (uji perilaku, selalu di-ROLLBACK) → BARU deploy kode.
--   Kode membaca kolom auto_closed_at; tanpa kolomnya kueri halaman dashboard
--   gagal.
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — PRA-CEK (baca saja). Jalankan sebelum migrasi.
-- ============================================================================
-- Halaman order yang jendelanya terbuka padahal ordernya tidak tayang.
-- Harapan 23 Sep: TEPAT 1 baris — 08ef25ac "asda", is_hidden=true, tanggal
-- NULL. Migrasi ini TIDAK menyentuhnya (tanpa backfill). Baris lain = berhenti,
-- laporkan dulu.
--
-- SELECT fs.id, fs.title, fs.submission_status, fs.payment_status,
--        sp.slug, sp.is_hidden, sp.publish_start_date, sp.publish_end_date
-- FROM survey_pages sp
-- JOIN form_submissions fs ON fs.id = sp.submission_id
-- WHERE sp.is_published
--   AND (sp.publish_end_date IS NULL OR sp.publish_end_date > now())
--   AND NOT (
--         (COALESCE(fs.payment_status IN ('paid','completed'), FALSE)
--          OR COALESCE(fs.submission_status IN ('paid','scheduled','live','completed'), FALSE))
--         AND COALESCE(fs.submission_status NOT IN ('slot_cancelled','cancelled','rejected','spam'), TRUE)
--       );


-- ============================================================================
-- LANGKAH 2 — MIGRASI
-- ============================================================================
BEGIN;

-- ── Kolom penanda ───────────────────────────────────────────────────────────
ALTER TABLE public.survey_pages
  ADD COLUMN IF NOT EXISTS auto_closed_at timestamptz;

COMMENT ON COLUMN public.survey_pages.auto_closed_at IS
  'Diisi trigger saat order keluar dari status tayang (sql/99). Terisi = jendela '
  'ditutup SISTEM dan akan dibuka lagi oleh ensure_survey_page begitu order '
  'lunas. NULL = jendela milik admin/jadwal, jangan disentuh otomatis.';


-- ── Predikat "order ini boleh tayang" ──────────────────────────────────────
-- Bagian "lunas" SAMA PERSIS dengan trg_ensure_survey_page produksi. Jangan
-- dipersempit ke payment_status saja: sebagian order dibayar di luar sistem
-- dan payment_status-nya tetap 'pending' selamanya (memori proyek).
CREATE OR REPLACE FUNCTION public.order_is_airable(p_payment_status text, p_submission_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT (COALESCE(p_payment_status IN ('paid', 'completed'), FALSE)
          OR COALESCE(p_submission_status IN ('paid', 'scheduled', 'live', 'completed'), FALSE))
     AND COALESCE(p_submission_status NOT IN ('slot_cancelled', 'cancelled', 'rejected', 'spam'), TRUE);
$function$;


-- ── 1. Penutup ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_close_survey_page()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_was_airable BOOLEAN;
  v_is_airable  BOOLEAN;
BEGIN
  v_was_airable := order_is_airable(OLD.payment_status, OLD.submission_status);
  v_is_airable  := order_is_airable(NEW.payment_status, NEW.submission_status);

  -- (a) keluar dari "tayang": unmark, batal, reject, spam.
  -- (b) tagihannya mati selagi tidak lunas: lepas slot (klien & cron). Order
  --     tanpa halaman tidak terpengaruh apa pun; ini menjaga halaman yang
  --     sempat lahir lalu uangnya dibalik sebelum berkas ini ada.
  IF (v_was_airable AND NOT v_is_airable)
     OR (NOT v_is_airable
         AND NEW.payment_status = 'expired'
         AND OLD.payment_status IS DISTINCT FROM 'expired')
  THEN
    -- ⚠️ publish_end_date, BUKAN is_published — lihat kepala berkas.
    -- Jendela yang sudah lewat tidak ditulis ulang: tanggal selesai aslinya
    -- adalah riwayat, dan auto_closed_at tidak boleh menandai halaman yang
    -- memang sudah selesai tayang.
    UPDATE survey_pages sp
       SET publish_end_date = now(),
           auto_closed_at   = now(),
           updated_at       = now()
     WHERE sp.submission_id = NEW.id
       AND (sp.publish_end_date IS NULL OR sp.publish_end_date > now());
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_form_submissions_close_page ON public.form_submissions;
CREATE TRIGGER trg_form_submissions_close_page
  AFTER UPDATE OF payment_status, submission_status ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.trg_close_survey_page();


-- ── 2. ensure_survey_page — disalin dari produksi, HANYA cabang pertama berubah
CREATE OR REPLACE FUNCTION public.ensure_survey_page(p_submission_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub        RECORD;
  v_base_slug  TEXT;
  v_slug       TEXT;
  v_suffix     INT := 2;
  v_page_id    UUID;
  v_is_kilat   BOOLEAN;
  v_closed_at  TIMESTAMPTZ;
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
  --
  -- sql/99: KECUALI jendelanya ditutup SISTEM (auto_closed_at) — order ini
  -- pernah keluar dari status tayang lalu kini dibayar lagi. Tulis ulang
  -- jendelanya dengan rumus yang SAMA dengan INSERT di bawah (reguler 15:00
  -- WIB; Kilat jam gelombang, akhir NULL), lalu kosongkan penandanya.
  -- Halaman yang ditutup/diedit admin sendiri (auto_closed_at NULL) tidak
  -- pernah disentuh di sini.
  --
  -- Penjaga order_is_airable: fungsi ini bisa dipanggil langsung oleh
  -- service_role; jangan sampai membuka jendela order yang belum lunas.
  -- Tanggal order NULL (slot sudah dilepas dan belum dipesan ulang) → jendela
  -- tetap tertutup; tab Page admin menampilkannya sebagai anomali.
  --
  -- ⚠️ Kalau ada perpanjangan yang SEDANG tayang, jendela ini sementara
  -- menunjuk ordinal 1 sampai cron_activate_extends menunjuknya kembali.
  SELECT id, auto_closed_at INTO v_page_id, v_closed_at
    FROM survey_pages WHERE submission_id = p_submission_id;
  IF FOUND THEN
    IF v_closed_at IS NOT NULL THEN
      SELECT * INTO v_sub FROM form_submissions WHERE id = p_submission_id;
      IF FOUND
         AND order_is_airable(v_sub.payment_status, v_sub.submission_status)
         AND v_sub.start_date IS NOT NULL
         AND v_sub.end_date IS NOT NULL
      THEN
        v_is_kilat := (v_sub.distribution_type = 'kilat');
        UPDATE survey_pages
           SET publish_start_date = CASE WHEN v_is_kilat
                                         THEN kilat_instant_of(v_sub.start_date, v_sub.kilat_slot_hour)
                                         ELSE airing_instant_of_date(v_sub.start_date)
                                    END,
               publish_end_date   = CASE WHEN v_is_kilat
                                         THEN NULL
                                         ELSE airing_instant_of_date(v_sub.end_date)
                                    END,
               auto_closed_at     = NULL,
               updated_at         = now()
         WHERE id = v_page_id;
      END IF;
    END IF;
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
    --
    -- ⚠️ sql/99: rumus ini DIULANG di cabang buka-ulang di atas. Ubah satu,
    -- ubah keduanya.
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
$function$;


-- ── 3. Pemicu ensure: masuk "tayang", bukan sekadar masuk "lunas" ──────────
CREATE OR REPLACE FUNCTION public.trg_ensure_survey_page()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_was_airable BOOLEAN;
  v_is_airable  BOOLEAN;
BEGIN
  -- sql/99: predikatnya pindah ke order_is_airable() — "lunas" yang sama
  -- persis dengan versi sebelumnya, DIKURANGI status batal. Kembaran simetris
  -- trg_close_survey_page: yang satu menutup saat keluar, ini membuka saat
  -- masuk.
  v_was_airable := order_is_airable(OLD.payment_status, OLD.submission_status);
  v_is_airable  := order_is_airable(NEW.payment_status, NEW.submission_status);

  IF v_is_airable AND NOT v_was_airable THEN
    PERFORM ensure_survey_page(NEW.id);
  END IF;

  RETURN NULL;
END;
$function$;


-- ── 4. Cron pelepas slot — disalin dari produksi, tulisan survey_pages DIBUANG
CREATE OR REPLACE FUNCTION public.release_expired_order_slots()
 RETURNS TABLE(lepas_submission_id uuid, tindakan text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
BEGIN
  WITH lepas AS (
    UPDATE form_submissions fs
       SET start_date        = NULL,
           end_date          = NULL,
           slot_booked_by    = NULL,
           slot_reserved_at  = NULL,
           submission_status = 'slot_reserved',
           payment_status    = 'expired',
           updated_at        = NOW()
     WHERE fs.slot_booked_by = 'user'
       AND fs.slot_reserved_at IS NOT NULL
       AND fs.slot_reserved_at < NOW() - interval '60 minutes'
       AND fs.start_date IS NOT NULL
       -- Penjaga lunas BERLAPIS, semuanya di dalam WHERE yang sama.
       AND COALESCE(fs.payment_status,'') NOT IN ('paid','completed','expired')
       AND NOT EXISTS (SELECT 1 FROM transactions t
                        WHERE t.form_submission_id = fs.id
                          AND t.status IN ('paid','completed','settled'))
       AND NOT EXISTS (SELECT 1 FROM invoices i
                        WHERE i.form_submission_id = fs.id
                          AND i.status IN ('paid','completed','settled'))
    RETURNING fs.id
  )
  SELECT array_agg(id) INTO v_ids FROM lepas;

  IF v_ids IS NULL THEN RETURN; END IF;

  -- Tagihan yang masih pending ikut mati. Hanya `pending` — status lain
  -- (paid/expired/cancelled) sudah punya artinya sendiri.
  UPDATE transactions SET status = 'expired', updated_at = NOW()
   WHERE form_submission_id = ANY(v_ids) AND status = 'pending';

  -- ⚠️ `invoices` TIDAK punya `updated_at` (diverifikasi information_schema
  -- 18 Sep) — menyebutnya di sini akan lolos CREATE lalu meledak saat cron
  -- BERJALAN. Persis jebakan sql/93 kemarin.
  UPDATE invoices SET status = 'expired'
   WHERE form_submission_id = ANY(v_ids) AND status = 'pending';

  /*
    sql/99: halaman iklan TIDAK LAGI dikosongkan di sini.

    Dulu: `UPDATE survey_pages SET publish_start_date = NULL,
    publish_end_date = NULL`. Tanggal NULL = "tayang selamanya" di feed, dan
    tulisan itu jalan SESUDAH UPDATE form_submissions di atas — jadi ia
    menimpa penutupan jendela dari trg_form_submissions_close_page. Order
    08ef25ac bocor 11 responden lewat jalur kembarannya (cancelSchedule).
    Penutupan sekarang milik trigger itu seorang.
  */

  RETURN QUERY SELECT unnest(v_ids), 'slot_dilepas'::text;
END;
$function$;


-- ── 5. Perpanjangan yang dibatalkan pelunasannya ───────────────────────────
CREATE OR REPLACE FUNCTION public.trg_close_page_on_extend_unpaid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(OLD.payment_status IN ('paid', 'completed'), FALSE)
     AND NOT COALESCE(NEW.payment_status IN ('paid', 'completed'), FALSE)
  THEN
    -- Hanya bila jendela halaman MEMANG milik perpanjangan ini — persis
    -- seperti yang ditulis cron_activate_extends langkah 2. Jendela milik
    -- jadwal lain tidak disentuh.
    -- TANPA auto_closed_at: ensure_survey_page akan membukanya dengan tanggal
    -- ordinal 1, padahal jendela ini milik perpanjangan. Membukanya lagi
    -- adalah tugas cron_activate_extends begitu jadwal ini live+paid lagi.
    UPDATE survey_pages sp
       SET publish_end_date = now(),
           updated_at       = now()
     WHERE sp.submission_id = NEW.submission_id
       AND sp.publish_start_date = OLD.start_date
       AND sp.publish_end_date   = OLD.end_date
       AND sp.publish_end_date   > now();
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ad_schedules_close_page_on_unpaid ON public.ad_schedules;
CREATE TRIGGER trg_ad_schedules_close_page_on_unpaid
  AFTER UPDATE OF payment_status ON public.ad_schedules
  FOR EACH ROW
  WHEN (OLD.source_table = 'form_submissions_extend')
  EXECUTE FUNCTION public.trg_close_page_on_extend_unpaid();


-- ── Hibah ───────────────────────────────────────────────────────────────────
-- Cabut dari SETIAP peran pg_default_acl, bukan hanya PUBLIC (memori
-- anon-default-acl-on-new-functions). CREATE OR REPLACE mempertahankan ACL
-- lama, jadi fungsi yang sudah ada juga harus dicabut eksplisit.
REVOKE ALL ON FUNCTION public.order_is_airable(text, text)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_close_survey_page()             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_close_page_on_extend_unpaid()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_survey_page(uuid)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_ensure_survey_page()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_expired_order_slots()       FROM PUBLIC, anon, authenticated;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI ACL. WAJIB: berkas sql bukan ACL produksi.
-- Harapan: HANYA postgres & service_role di keenam baris.
-- ============================================================================
--
-- SELECT p.proname, array_to_string(p.proacl, ' | ') AS acl
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('order_is_airable', 'trg_close_survey_page',
--                     'trg_close_page_on_extend_unpaid', 'ensure_survey_page',
--                     'trg_ensure_survey_page', 'release_expired_order_slots')
-- ORDER BY p.proname;


-- ============================================================================
-- LANGKAH 4 — UJI PERILAKU. Menulis, tapi SELALU dibatalkan.
-- ============================================================================
--
-- Blok DO di bawah SELALU berakhir dengan EXCEPTION, dan itu disengaja:
-- exception membatalkan SEMUA tulisannya, bahkan kalau ROLLBACK di bawahnya
-- terlewat. Baca pesannya:
--
--   UJI_LULUS ...      → semua kasus lolos, nol perubahan tersimpan
--   UJI_GAGAL kasus N  → berhenti, kirimkan pesannya
--
-- Memakai order uji 08ef25ac ("asda") dan satu order Kilat lunas yang dipilih
-- otomatis. Keduanya kembali persis seperti semula karena seluruhnya di-rollback.
--
-- BEGIN;
-- DO $uji$
-- DECLARE
--   c_asda    CONSTANT uuid := '08ef25ac-6fe3-4df1-b62c-9562446c6635';
--   v_start   timestamptz;
--   v_end     timestamptz;
--   v_closed  timestamptz;
--   v_kilat   RECORD;
--   v_umum_sebelum text;
--   v_umum_sesudah text;
-- BEGIN
--   SELECT md5(string_agg(sp::text, '|' ORDER BY sp.id)) INTO v_umum_sebelum
--     FROM survey_pages sp WHERE sp.submission_id IS NULL;
--
--   -- Pra-kondisi: halaman "asda" terbuka seperti saat baru lahir.
--   UPDATE survey_pages
--      SET publish_start_date = airing_instant_of_date('2026-09-22'),
--          publish_end_date   = airing_instant_of_date('2026-09-27'),
--          auto_closed_at     = NULL
--    WHERE submission_id = c_asda;
--
--   -- Kasus 1: tandai lunas saat halaman sudah ada → tidak disentuh.
--   UPDATE form_submissions SET payment_status = 'paid', submission_status = 'paid' WHERE id = c_asda;
--   SELECT publish_end_date, auto_closed_at INTO v_end, v_closed FROM survey_pages WHERE submission_id = c_asda;
--   IF v_end IS DISTINCT FROM airing_instant_of_date('2026-09-27') OR v_closed IS NOT NULL THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 1: lunas mengubah halaman (end=%, closed=%)', v_end, v_closed;
--   END IF;
--
--   -- Kasus 2: batalkan pelunasan → jendela ditutup SEKARANG + ditandai.
--   UPDATE form_submissions SET payment_status = 'pending', submission_status = 'waiting_payment' WHERE id = c_asda;
--   SELECT publish_end_date, auto_closed_at INTO v_end, v_closed FROM survey_pages WHERE submission_id = c_asda;
--   IF v_end IS DISTINCT FROM now() OR v_closed IS DISTINCT FROM now() THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 2: unmark tidak menutup (end=%, closed=%)', v_end, v_closed;
--   END IF;
--
--   -- Kasus 3: batal slot → tetap tertutup, TIDAK kembali NULL.
--   UPDATE form_submissions SET submission_status = 'slot_cancelled', payment_status = 'expired' WHERE id = c_asda;
--   SELECT publish_end_date INTO v_end FROM survey_pages WHERE submission_id = c_asda;
--   IF v_end IS DISTINCT FROM now() THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 3: batal slot mengubah jendela (end=%)', v_end;
--   END IF;
--
--   -- Kasus 4: cron pelepas tidak lagi menulis survey_pages.
--   IF pg_get_functiondef('public.release_expired_order_slots()'::regprocedure)
--        ~* 'UPDATE\s+survey_pages' THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 4: release_expired_order_slots masih menulis survey_pages';
--   END IF;
--
--   -- Kasus 5: dibayar lagi → jendela dibuka dengan tanggal order, penanda hilang.
--   UPDATE form_submissions SET payment_status = 'paid', submission_status = 'paid' WHERE id = c_asda;
--   SELECT publish_start_date, publish_end_date, auto_closed_at INTO v_start, v_end, v_closed
--     FROM survey_pages WHERE submission_id = c_asda;
--   IF v_start IS DISTINCT FROM airing_instant_of_date('2026-09-22')
--      OR v_end IS DISTINCT FROM airing_instant_of_date('2026-09-27')
--      OR v_closed IS NOT NULL THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 5: tidak dibuka ulang (start=%, end=%, closed=%)', v_start, v_end, v_closed;
--   END IF;
--
--   -- Kasus 6: Kilat — tutup lalu buka lagi, akhir kembali NULL.
--   SELECT fs.id, fs.start_date, fs.kilat_slot_hour INTO v_kilat
--     FROM form_submissions fs JOIN survey_pages sp ON sp.submission_id = fs.id
--    WHERE fs.distribution_type = 'kilat' AND fs.payment_status = 'paid'
--      AND fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
--      AND sp.publish_end_date IS NULL          -- konvensi Kilat, belum diedit admin
--    LIMIT 1;
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 6: tidak ada order Kilat lunas untuk diuji';
--   END IF;
--   UPDATE form_submissions SET payment_status = 'pending', submission_status = 'waiting_payment' WHERE id = v_kilat.id;
--   SELECT publish_end_date, auto_closed_at INTO v_end, v_closed FROM survey_pages WHERE submission_id = v_kilat.id;
--   IF v_end IS DISTINCT FROM now() OR v_closed IS NULL THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 6a: Kilat tidak ditutup (end=%, closed=%)', v_end, v_closed;
--   END IF;
--   UPDATE form_submissions SET payment_status = 'paid', submission_status = 'paid' WHERE id = v_kilat.id;
--   SELECT publish_start_date, publish_end_date, auto_closed_at INTO v_start, v_end, v_closed
--     FROM survey_pages WHERE submission_id = v_kilat.id;
--   IF v_start IS DISTINCT FROM kilat_instant_of(v_kilat.start_date, v_kilat.kilat_slot_hour)
--      OR v_end IS NOT NULL OR v_closed IS NOT NULL THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 6b: Kilat tidak dibuka benar (start=%, end=%, closed=%)', v_start, v_end, v_closed;
--   END IF;
--
--   -- Kasus 7: halaman tanpa order (pengumuman pemenang) tidak tersentuh.
--   SELECT md5(string_agg(sp::text, '|' ORDER BY sp.id)) INTO v_umum_sesudah
--     FROM survey_pages sp WHERE sp.submission_id IS NULL;
--   IF v_umum_sebelum IS DISTINCT FROM v_umum_sesudah THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus 7: halaman tanpa order berubah';
--   END IF;
--
--   RAISE EXCEPTION 'UJI_LULUS — 7 kasus lolos. Exception ini disengaja: semua tulisan uji dibatalkan.';
-- END
-- $uji$;
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK MIGRASI — mengembalikan badan fungsi PRODUKSI 23 Sep 2026.
-- ============================================================================
-- ⚠️ Jangan jalankan sesudah kode pasangannya dideploy: dashboard membaca
-- kolom auto_closed_at. Rollback kode dulu, baru ini.
--
-- BEGIN;
--
-- DROP TRIGGER IF EXISTS trg_form_submissions_close_page ON public.form_submissions;
-- DROP TRIGGER IF EXISTS trg_ad_schedules_close_page_on_unpaid ON public.ad_schedules;
--
-- CREATE OR REPLACE FUNCTION public.trg_ensure_survey_page()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_was_paid BOOLEAN;
--   v_is_paid  BOOLEAN;
-- BEGIN
--   v_was_paid := COALESCE(OLD.payment_status IN ('paid', 'completed'), FALSE)
--              OR COALESCE(OLD.submission_status IN ('paid', 'scheduled', 'live', 'completed'), FALSE);
--   v_is_paid  := COALESCE(NEW.payment_status IN ('paid', 'completed'), FALSE)
--              OR COALESCE(NEW.submission_status IN ('paid', 'scheduled', 'live', 'completed'), FALSE);
--
--   IF v_is_paid AND NOT v_was_paid THEN
--     PERFORM ensure_survey_page(NEW.id);
--   END IF;
--
--   RETURN NULL;
-- END;
-- $function$;
--
-- -- ensure_survey_page: kembalikan cabang pertama saja — sisa badannya
-- -- identik dengan produksi. Cara paling aman: jalankan ulang definisi di
-- -- LANGKAH 2 dengan blok "IF FOUND THEN ... END IF;" pertama diganti menjadi:
-- --
-- --     SELECT id INTO v_page_id FROM survey_pages WHERE submission_id = p_submission_id;
-- --     IF FOUND THEN
-- --       RETURN v_page_id;
-- --     END IF;
-- --
-- -- dan baris `v_closed_at TIMESTAMPTZ;` dihapus dari DECLARE.
--
-- -- release_expired_order_slots: jalankan ulang definisi di LANGKAH 2 dengan
-- -- komentar /* sql/99 ... */ diganti tulisan lamanya:
-- --
-- --     UPDATE survey_pages sp
-- --        SET publish_start_date = NULL, publish_end_date = NULL, updated_at = NOW()
-- --      WHERE sp.submission_id = ANY(v_ids);
--
-- DROP FUNCTION IF EXISTS public.trg_close_survey_page();
-- DROP FUNCTION IF EXISTS public.trg_close_page_on_extend_unpaid();
-- DROP FUNCTION IF EXISTS public.order_is_airable(text, text);
--
-- -- Sesudah ensure_survey_page dikembalikan (ia tidak lagi membaca kolomnya).
-- ALTER TABLE public.survey_pages DROP COLUMN IF EXISTS auto_closed_at;
--
-- -- ACL produksi sebelum sql/99 (anon & authenticated memang ber-EXECUTE).
-- -- Pertimbangkan TIDAK mengembalikannya: nol pemanggil di luar trigger.
-- GRANT EXECUTE ON FUNCTION public.ensure_survey_page(uuid) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.trg_ensure_survey_page()  TO anon, authenticated;
--
-- COMMIT;
