-- ============================================================================
-- sql/111 — KUOTA HARIAN HANYA MENOLAK KLAIM BARU
-- ============================================================================
--
-- Menggantikan trigger sql/110 (diterapkan 6 Okt 2026). sql/110 menutup pintu
-- insiden 6 Okt, tapi tinjauan 6–7 Okt menemukan lima cacat:
--
--   1. Cermin ordinal 1 ditulis lewat INSERT … ON CONFLICT DO UPDATE, jadi
--      BEFORE INSERT menyala di SETIAP sinkron (TG_OP='INSERT') dan
--      pengecualian "jendela tidak berubah" tidak pernah berlaku. Order yang
--      sudah berada di hari penuh gagal pada pembaruan APA PUN: catatan admin,
--      total_cost, bahkan payment_status dari webhook DOKU (STEP 5).
--   2. Di cabang itu NEW.is_extra_ad = default false. Iklan kolam tambahan
--      dicek terhadap kolam reguler.
--   3. assert_daily_ad_quota_free masih bisa dipanggil `authenticated`,
--      mengambil satu advisory lock per HARI, tanpa batas panjang jendela.
--      Tabel kunci hanya ±3.840 entri; satu RPC berjendela panjang
--      menghabiskannya.
--   4. Predikat "menahan kuota" tidak sama dengan penghitung: order
--      `approved` bertanggal (status `requested`) dihitung, tapi tidak dicek.
--   5. Menggeser/memendekkan jendela mengecek ulang SEMUA hari, termasuk hari
--      lama dan hari lampau.
--
-- ── PERILAKU SESUDAH BERKAS INI ─────────────────────────────────────────────
--
--   D1  Trigger AFTER INSERT OR UPDATE. Hanya menyala untuk aksi yang benar-
--       benar terjadi, dengan OLD/NEW asli (termasuk is_extra_ad) dan nilai
--       final sesudah semua trigger BEFORE.
--   D2  Yang dicek hanya HARI BARU (hari NEW − hari OLD), dan hanya hari
--       ≥ hari ini WIB. Baris yang tetap di hari yang sudah ia tempati tidak
--       menambah beban, jadi bayar/live/catatan selalu lewat.
--   D3  Bayar telat untuk hold yang sudah kedaluwarsa DITERIMA (keputusan
--       user 7 Okt). Uang tidak boleh gagal tercatat. Hari bisa jadi 5/4; admin
--       melihatnya di tooltip SlotCalendar lalu memindahkan satu order. Jendela
--       ini paling lama 10 menit (cron release-expired-slots */10).
--   D4  slot_reserved_at atau slot_booked_by berubah = KLAIM BARU (semua hari
--       dicek). Rebook / segarkan hold di hari penuh tetap ditolak.
--   D5  Predikat ordinal 1 disamakan dengan kaki 1 lewat (status,
--       review_status). Diverifikasi 7 Okt: 0 beda dari 1.128 baris (predikat
--       sql/110: 95 beda).
--   D6  SATU advisory lock untuk seluruh kuota, `authenticated` dicabut,
--       jendela baru maksimal 90 hari (= max={90} ScheduleForm admin).
--   D7  Pesan tetap memuat "sudah penuh" (pemetaan frontend lama tetap jalan)
--       + HINT 'daily_quota_full', nama bulan Indonesia.
--
-- ⚠️ assert_daily_ad_quota_days SENGAJA VOLATILE. Pola kunci-lalu-hitung butuh
--    snapshot baru SESUDAH kunci didapat. Kalau STABLE, hitungannya memakai
--    snapshot pemanggil dan tidak melihat pesanan transaksi lain yang baru
--    commit — dua pemesan serentak bisa lolos bersamaan.
--
-- Tidak memindahkan order apa pun. 6 Okt (5/4) dan hari historis lain
-- dibiarkan.
--
-- ── URUTAN ──────────────────────────────────────────────────────────────────
--
--   Langkah 1 (pra-cek) → Langkah 2 (migrasi) → Langkah 3 (verifikasi) →
--   Langkah 4 (uji perilaku, selalu di-ROLLBACK) → baru push frontend.
--   Jalankan di SQL Editor Supabase. JANGAN lewat MCP.
-- ============================================================================
--
-- ── HASIL PENERAPAN — 2026-10-07 ───────────────────────────────────────────
--
-- Sebelumnya diuji di PGlite (badan sinkron prod + tabel tiruan): 17/17 lulus,
-- rollback & penerapan ulang bersih; terhadap sql/110 uji yang sama gagal di
-- kasus 8a (cacat #1).
--   1a  tiga badan fungsi = salinan rollback (md5 cocok)
--   1b  0 beda jenis distribusi extend vs induk
--   1c  SENTUH: 97 disentuh, 4 GAGAL — 7de21b27, f002772a, 9a595bab, 1f6bf446,
--       semuanya "06 Oct 2026 sudah penuh" (korban sql/110)
--   2   sukses
--   3a  ACL kelima fungsi = postgres + service_role; volatilitas sesuai
--   3b  trigger AFTER INSERT OR UPDATE OF … (8 kolom)
--   3c  uji relasional: 0 beda
--   3d  SENTUH: 97 disentuh, 0 gagal
--   4   UJI_LULUS — 17 kasus (hari uji 2026-11-06); 0 baris uji tersisa
-- ============================================================================


-- ============================================================================
-- LANGKAH 1 — PRA-CEK
-- ============================================================================
--
-- 1a. Badan fungsi yang hidup harus SAMA dengan yang disalin ke blok ROLLBACK
--     di bawah (diambil 7 Okt 2026). Harapan: tiga baris `sama = true`, dan
--     dua fungsi baru belum ada. Ada `false` = berhenti, laporkan dulu.
--
-- SELECT p.proname,
--        md5(pg_get_functiondef(p.oid)) = CASE p.proname
--          WHEN 'ad_schedule_occupies_daily_quota' THEN '4a6bac726510d074c6bc3ba0344715b2'
--          WHEN 'assert_daily_ad_quota_free'       THEN '552303ebf94c7300ff80fd2fd6171ac8'
--          WHEN 'enforce_daily_ad_quota'           THEN '685771851ee79211406fca6287ca58a6'
--        END AS sama
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('ad_schedule_occupies_daily_quota', 'assert_daily_ad_quota_free',
--                     'enforce_daily_ad_quota', 'daily_quota_days', 'assert_daily_ad_quota_days')
-- ORDER BY 1;
--
-- 1b. Jenis distribusi baris lanjutan = jenis induknya. Kaki 2 penghitung
--     membaca jenis INDUK, trigger mengoper jenis BARIS. Harapan: 0.
--
-- SELECT count(*) AS beda
-- FROM ad_schedules a JOIN form_submissions fs ON fs.id = a.submission_id
-- WHERE a.source_table = 'form_submissions_extend'
--   AND a.distribution_type IS DISTINCT FROM fs.distribution_type;
--
-- 1c. BLOK SENTUH (di bawah) — jalankan SEKARANG untuk melihat korban sql/110.
--     Harapan sebelum migrasi: beberapa baris gagal "sudah penuh" (6 Okt dkk).


-- ============================================================================
-- BLOK SENTUH — dipakai di Langkah 1c dan Langkah 3d. Menulis, tapi SELALU
-- dibatalkan (exception di akhir + ROLLBACK).
-- ============================================================================
--
-- Menyentuh setiap jadwal yang menahan kuota dan berakhir ≥ 30 hari lalu,
-- persis seperti sinkron catatan admin / webhook menyentuhnya:
--   ordinal 1 → UPDATE form_submissions SET admin_notes = admin_notes
--               (kolom ada di daftar sinkron, TIDAK menyalakan trigger halaman)
--   lanjutan  → UPDATE ad_schedules SET status = status
--
-- Pesan akhirnya: SENTUH_SELESAI — N baris disentuh, M gagal. + contoh.
--
-- BEGIN;
-- SET LOCAL ROLE postgres;
-- DO $sentuh$
-- DECLARE
--   r        record;
--   v_n      int  := 0;
--   v_gagal  int  := 0;
--   v_contoh text := '';
-- BEGIN
--   FOR r IN
--     SELECT a.id, a.source_table, a.source_id, a.submission_id
--     FROM ad_schedules a
--     WHERE a.end_date >= now() - interval '30 days'
--       AND COALESCE(public.ad_schedule_occupies_daily_quota(a), false)
--     ORDER BY a.start_date
--   LOOP
--     v_n := v_n + 1;
--     BEGIN
--       IF r.source_table = 'form_submissions' THEN
--         UPDATE form_submissions SET admin_notes = admin_notes WHERE id = r.source_id;
--       ELSE
--         UPDATE ad_schedules SET status = status WHERE id = r.id;
--       END IF;
--     EXCEPTION WHEN OTHERS THEN
--       v_gagal := v_gagal + 1;
--       IF v_gagal <= 15 THEN
--         v_contoh := v_contoh || E'\n  ' || left(r.submission_id::text, 8)
--                     || ' (' || r.source_table || '): ' || SQLERRM;
--       END IF;
--     END;
--   END LOOP;
--   RAISE EXCEPTION 'SENTUH_SELESAI — % baris disentuh, % gagal.%', v_n, v_gagal, v_contoh;
-- END
-- $sentuh$;
-- ROLLBACK;


-- ============================================================================
-- LANGKAH 2 — MIGRASI (satu transaksi)
-- ============================================================================

BEGIN;

-- ── 2.1 Hari kuota sebuah jendela ──────────────────────────────────────────
-- Hari WIB, akhir-EKSKLUSIF (hari end_date adalah hari serah-terima), mulai
-- dari hari ini WIB. Hari lampau tidak pernah masuk: menulis jadwal di masa
-- lalu tidak mengambil kursi siapa pun, dan baris sampah ribuan hari
-- menghasilkan array kosong alih-alih ribuan pengecekan.
CREATE OR REPLACE FUNCTION public.daily_quota_days(p_start timestamptz, p_end timestamptz)
RETURNS date[]
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(g::date ORDER BY g), '{}'::date[])
  FROM generate_series(
         GREATEST((p_start AT TIME ZONE 'Asia/Jakarta')::date,
                  (now()   AT TIME ZONE 'Asia/Jakarta')::date),
         (p_end AT TIME ZONE 'Asia/Jakarta')::date - 1,
         '1 day') AS g
  WHERE p_start IS NOT NULL AND p_end IS NOT NULL;
$function$;

-- ── 2.2 Penjaga per daftar hari ────────────────────────────────────────────
-- Loop penghitung DISALIN PERSIS dari sql/110 (dua kaki + aturan pelepasan
-- holdsSlot). Yang berubah: satu kunci untuk seluruh kuota, daftar hari datang
-- dari pemanggil, dan pesannya ber-HINT.
CREATE OR REPLACE FUNCTION public.assert_daily_ad_quota_days(
  p_days              date[],
  p_is_extra_ad       boolean,
  p_distribution_type text,
  p_exclude_source_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE            -- WAJIB, lihat kepala berkas
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quota  INTEGER;
  v_day    DATE;
  v_full   RECORD;
  v_bulan  CONSTANT text[] :=
    ARRAY['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
BEGIN
  IF p_distribution_type = 'kilat' THEN RETURN; END IF;
  IF p_days IS NULL OR cardinality(p_days) = 0 THEN RETURN; END IF;

  v_quota := CASE WHEN COALESCE(p_is_extra_ad, false)
                  THEN max_extra_ads_per_day()
                  ELSE max_regular_ads_per_day() END;

  -- SATU kunci untuk seluruh kuota (bukan per hari seperti sql/110). Volume
  -- pesanan rendah, jadi serialisasi penuh tidak terasa, dan jumlah kunci per
  -- transaksi tetap 1 berapa pun panjang jendelanya. Re-entrant: transaksi
  -- yang sudah memegangnya (create_ad_schedule lalu trigger) tidak mengantre.
  PERFORM pg_advisory_xact_lock(hashtextextended('ad-quota', 0::bigint));

  FOREACH v_day IN ARRAY p_days
  LOOP
    SELECT COUNT(*) AS n INTO v_full
    FROM (
      -- Kaki 1 — jadwal ordinal 1. Saringan status identik dengan
      -- get_submission_slot_occupancy().
      SELECT fs.id AS source_id,
             airing_instant_of_date(fs.start_date) AS sd,
             airing_instant_of_date(fs.end_date)   AS ed,
             fs.slot_booked_by, fs.slot_reserved_at, fs.payment_status,
             COALESCE(a.is_extra_ad, false) AS is_extra
      FROM form_submissions fs
      JOIN ad_schedules a
        ON a.source_table = 'form_submissions' AND a.source_id = fs.id
      WHERE fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
        AND fs.submission_status NOT IN
            ('rejected','spam','in_review','completed','cancelled','slot_cancelled')
        AND fs.distribution_type = p_distribution_type

      UNION ALL

      -- Kaki 2 — jadwal ke-2 dst. Saringan status identik dengan
      -- get_extend_slot_occupancy().
      SELECT a.source_id, a.start_date, a.end_date,
             a.slot_booked_by, a.slot_reserved_at, a.payment_status,
             COALESCE(a.is_extra_ad, false)
      FROM ad_schedules a
      JOIN form_submissions fs ON fs.id = a.submission_id
      WHERE a.source_table = 'form_submissions_extend'
        AND a.start_date IS NOT NULL AND a.end_date IS NOT NULL
        AND a.status IN ('waiting_payment','paid','scheduled','live')
        AND fs.distribution_type IS NOT DISTINCT FROM p_distribution_type
    ) occ
    WHERE occ.is_extra = COALESCE(p_is_extra_ad, false)
      AND (p_exclude_source_id IS NULL OR occ.source_id <> p_exclude_source_id)
      AND v_day >= (occ.sd AT TIME ZONE 'Asia/Jakarta')::date
      AND v_day <  (occ.ed AT TIME ZONE 'Asia/Jakarta')::date
      -- Aturan pelepasan holdsSlot(): hold peneliti yang belum lunas dan sudah
      -- lewat 1 jam TIDAK LAGI menahan kapasitas. Ambang eksklusif — tepat di
      -- detik tenggat, slotnya masih ditahan.
      AND NOT (
        COALESCE(occ.slot_booked_by,'') = 'user'
        AND COALESCE(occ.payment_status,'pending') NOT IN ('paid','completed')
        AND occ.slot_reserved_at IS NOT NULL
        AND occ.slot_reserved_at < NOW() - INTERVAL '1 hour'
      );

    IF v_full.n >= v_quota THEN
      RAISE EXCEPTION
        'Kuota iklan % pada % sudah penuh (% dari %). Pilih tanggal lain.',
        CASE WHEN COALESCE(p_is_extra_ad,false) THEN 'tambahan' ELSE 'reguler' END,
        to_char(v_day, 'DD') || ' ' || v_bulan[extract(month FROM v_day)::int]
          || ' ' || to_char(v_day, 'YYYY'),
        v_full.n, v_quota
        USING HINT = 'daily_quota_full';
    END IF;
  END LOOP;
END;
$function$;

-- ── 2.3 Pintu lama untuk create_ad_schedule ────────────────────────────────
-- Tanda tangan SAMA dengan sql/110, jadi create_ad_schedule tidak disentuh.
CREATE OR REPLACE FUNCTION public.assert_daily_ad_quota_free(
  p_start             timestamptz,
  p_end               timestamptz,
  p_is_extra_ad       boolean,
  p_distribution_type text,
  p_exclude_source_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_start IS NULL OR p_end IS NULL THEN RETURN; END IF;

  -- Kilat punya kolam gelombangnya sendiri (8/11/14/17 WIB, 2 order/gelombang)
  -- dan TIDAK diatur kuota harian ini.
  IF p_distribution_type = 'kilat' THEN RETURN; END IF;

  IF p_end - p_start > interval '90 days' THEN
    RAISE EXCEPTION 'Jendela tayang % hari melebihi batas 90 hari.',
      ceil(extract(epoch FROM p_end - p_start) / 86400)::int
      USING HINT = 'schedule_window_too_long';
  END IF;

  PERFORM public.assert_daily_ad_quota_days(
    public.daily_quota_days(p_start, p_end),
    p_is_extra_ad, p_distribution_type, p_exclude_source_id);
END;
$function$;

-- ── 2.4 Predikat "baris ini menahan kuota" ─────────────────────────────────
-- Ordinal 1 kini identik dengan kaki 1 penghitung. Pemetaan submission_status
-- → (status, review_status) lewat airing_status_of/review_status_of:
--   in_review bertanggal → requested/in_review  → kaki 1 TIDAK menghitung
--   approved / pending bertanggal → requested/… → kaki 1 MENGHITUNG
--   completed → completed                       → kaki 1 TIDAK menghitung
-- COALESCE: NULL di sini dulu membuat `IF NOT …` tidak pernah keluar.
CREATE OR REPLACE FUNCTION public.ad_schedule_occupies_daily_quota(p_row ad_schedules)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
           p_row.start_date IS NOT NULL
       AND p_row.end_date IS NOT NULL
       AND COALESCE(p_row.distribution_type, '') <> 'kilat'
       AND CASE
             WHEN p_row.source_table = 'form_submissions_extend' THEN
               p_row.status IN ('waiting_payment','paid','scheduled','live')
             ELSE
               p_row.status IN ('waiting_payment','paid','scheduled','live','slot_reserved')
               OR (p_row.status = 'requested'
                   AND p_row.review_status IS DISTINCT FROM 'in_review')
           END,
         false);
$function$;

-- ── 2.5 Trigger function (AFTER) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_daily_ad_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_same_hold      boolean := false;
  v_window_changed boolean;
  v_days           date[];
BEGIN
  IF NOT public.ad_schedule_occupies_daily_quota(NEW) THEN
    RETURN NULL;
  END IF;

  -- Klaim yang SAMA: baris lama sudah menahan kuota di kolam & jenis yang sama,
  -- dan hold-nya tidak diperbarui (D4). Bayar, live, catatan, review jatuh di
  -- sini — termasuk bayar telat untuk hold kedaluwarsa (D3).
  IF TG_OP = 'UPDATE' THEN
    v_same_hold :=
          public.ad_schedule_occupies_daily_quota(OLD)
      AND COALESCE(OLD.is_extra_ad, false) = COALESCE(NEW.is_extra_ad, false)
      AND OLD.distribution_type IS NOT DISTINCT FROM NEW.distribution_type
      AND OLD.slot_reserved_at  IS NOT DISTINCT FROM NEW.slot_reserved_at
      AND OLD.slot_booked_by    IS NOT DISTINCT FROM NEW.slot_booked_by;
  END IF;

  -- Dipisah dengan IF, bukan satu ekspresi OR: plpgsql mengikat OLD.start_date
  -- sebelum mengevaluasi, dan OLD tidak terisi pada INSERT.
  IF TG_OP = 'INSERT' THEN
    v_window_changed := true;
  ELSE
    v_window_changed := OLD.start_date IS DISTINCT FROM NEW.start_date
                     OR OLD.end_date   IS DISTINCT FROM NEW.end_date;
  END IF;

  IF v_same_hold AND NOT v_window_changed THEN
    RETURN NULL;
  END IF;

  -- Batas 90 hari hanya untuk jendela yang BARU ditulis. Ganti status saja
  -- pada baris lama berjendela panjang (ada 1 baris sampah 7.018 hari) lewat.
  IF v_window_changed AND NEW.end_date - NEW.start_date > interval '90 days' THEN
    RAISE EXCEPTION 'Jendela tayang % hari melebihi batas 90 hari.',
      ceil(extract(epoch FROM NEW.end_date - NEW.start_date) / 86400)::int
      USING HINT = 'schedule_window_too_long';
  END IF;

  v_days := public.daily_quota_days(NEW.start_date, NEW.end_date);

  -- D2: hanya hari yang BELUM ia tempati.
  IF v_same_hold THEN
    v_days := ARRAY(
      SELECT d FROM unnest(v_days) AS d
      EXCEPT
      SELECT o FROM unnest(public.daily_quota_days(OLD.start_date, OLD.end_date)) AS o
      ORDER BY 1);
  END IF;

  PERFORM public.assert_daily_ad_quota_days(
    v_days,
    COALESCE(NEW.is_extra_ad, false),
    NEW.distribution_type,
    NEW.source_id);
  RETURN NULL;
END;
$function$;

-- ── 2.6 Trigger: BEFORE → AFTER ────────────────────────────────────────────
-- Nama sama. review_status ditambahkan (D5: approved menahan kuota),
-- slot_reserved_at & slot_booked_by ditambahkan (D4).
DROP TRIGGER IF EXISTS trg_ad_schedules_daily_quota ON public.ad_schedules;
CREATE TRIGGER trg_ad_schedules_daily_quota
  AFTER INSERT OR UPDATE OF start_date, end_date, status, review_status,
                            is_extra_ad, distribution_type,
                            slot_reserved_at, slot_booked_by
  ON public.ad_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_daily_ad_quota();

-- ── 2.7 ACL ────────────────────────────────────────────────────────────────
-- pg_default_acl memberi anon DAN authenticated EXECUTE ke setiap fungsi baru;
-- REVOKE FROM PUBLIC saja tidak cukup. Pemanggil sah hanya create_ad_schedule
-- dan trigger (SECURITY DEFINER milik postgres). Frontend tidak memanggilnya.
REVOKE ALL ON FUNCTION public.daily_quota_days(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_daily_ad_quota_days(date[], boolean, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_daily_ad_quota_free(timestamptz, timestamptz, boolean, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ad_schedule_occupies_daily_quota(ad_schedules)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_daily_ad_quota()
  FROM PUBLIC, anon, authenticated;

COMMIT;


-- ============================================================================
-- LANGKAH 3 — VERIFIKASI (baca saja, kecuali 3d)
-- ============================================================================
--
-- 3a. ACL. Harapan: HANYA postgres & service_role di kelima baris.
--
-- SELECT p.proname, array_to_string(p.proacl, ' | ') AS acl, p.provolatile
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('daily_quota_days', 'assert_daily_ad_quota_days',
--                     'assert_daily_ad_quota_free', 'ad_schedule_occupies_daily_quota',
--                     'enforce_daily_ad_quota')
-- ORDER BY 1;
-- Harapan provolatile: daily_quota_days & ad_schedule_occupies… = s,
-- tiga lainnya = v.
--
-- 3b. Trigger. Harapan: "CREATE TRIGGER trg_ad_schedules_daily_quota AFTER
--     INSERT OR UPDATE OF start_date, end_date, status, review_status, …".
--
-- SELECT pg_get_triggerdef(oid) FROM pg_trigger
-- WHERE tgrelid = 'public.ad_schedules'::regclass
--   AND tgname = 'trg_ad_schedules_daily_quota';
--
-- 3c. Uji relasional: predikat trigger = saringan kaki 1. Harapan: 0.
--
-- SELECT count(*) AS beda
-- FROM ad_schedules a JOIN form_submissions fs ON fs.id = a.source_id
-- WHERE a.source_table = 'form_submissions'
--   AND COALESCE(fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
--         AND fs.submission_status NOT IN
--             ('rejected','spam','in_review','completed','cancelled','slot_cancelled')
--         AND fs.distribution_type <> 'kilat', false)
--       IS DISTINCT FROM public.ad_schedule_occupies_daily_quota(a);
--
-- 3d. Jalankan lagi BLOK SENTUH di atas. Harapan: "… 0 gagal."


-- ============================================================================
-- LANGKAH 4 — UJI PERILAKU. Menulis, tapi SELALU dibatalkan.
-- ============================================================================
--
-- Blok di bawah SELALU berakhir dengan EXCEPTION, dan itu disengaja:
-- exception membatalkan SEMUA tulisannya, bahkan kalau ROLLBACK terlewat.
--
--   UJI_LULUS ...      → semua kasus lolos, nol perubahan tersimpan
--   UJI_GAGAL kasus N  → berhenti, kirimkan pesannya
--
-- Hari uji D = hari WIB pertama ≥ hari ini + 30 yang [D−2, D+3) kosong dari
-- jadwal apa pun. Order uji dipilih otomatis dari order reguler lama tanpa
-- jadwal lanjutan (tidak ada tumpang-tindih dengan jadwal miliknya sendiri).
-- Baris lanjutan uji memakai ordinal ≥ 900 (unik (submission_id, ordinal)
-- DEFERRED, dan semuanya di-rollback sebelum commit).
--
-- BEGIN;
-- -- WAJIB: protect_form_submissions() menolak "tandai lunas" kecuali
-- -- current_setting('role') = postgres/service_role (pelajaran sql/99).
-- SET LOCAL ROLE postgres;
--
-- CREATE FUNCTION pg_temp.harus_lolos(p_kasus text, p_sql text) RETURNS void
-- LANGUAGE plpgsql AS $f$
-- DECLARE v_rows bigint;
-- BEGIN
--   BEGIN
--     EXECUTE p_sql;
--     GET DIAGNOSTICS v_rows = ROW_COUNT;
--   EXCEPTION WHEN OTHERS THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus %: ditolak padahal harus lolos: %', p_kasus, SQLERRM;
--   END;
--   IF v_rows = 0 THEN
--     RAISE EXCEPTION 'UJI_GAGAL kasus %: perintah tidak mengenai baris apa pun', p_kasus;
--   END IF;
-- END $f$;
--
-- CREATE FUNCTION pg_temp.harus_ditolak(p_kasus text, p_sql text, p_pola text, p_hint text)
-- RETURNS void LANGUAGE plpgsql AS $f$
-- DECLARE v_err text; v_hint text;
-- BEGIN
--   BEGIN
--     EXECUTE p_sql;
--   EXCEPTION WHEN OTHERS THEN
--     GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
--     IF v_err NOT LIKE '%' || p_pola || '%' OR v_hint IS DISTINCT FROM p_hint THEN
--       RAISE EXCEPTION 'UJI_GAGAL kasus %: ditolak karena hal lain: % (hint=%)', p_kasus, v_err, v_hint;
--     END IF;
--     RETURN;
--   END;
--   RAISE EXCEPTION 'UJI_GAGAL kasus %: lolos padahal harus ditolak', p_kasus;
-- END $f$;
--
-- -- Sisipkan satu jadwal lanjutan reguler. Mengembalikan ad_schedules.id.
-- CREATE FUNCTION pg_temp.sisip(p_induk uuid, p_ordinal int, p_mulai date, p_akhir date,
--                               p_status text, p_bayar text, p_oleh text, p_hold timestamptz)
-- RETURNS uuid LANGUAGE sql AS $f$
--   INSERT INTO ad_schedules (submission_id, ordinal, source_table, source_id,
--                             start_date, end_date, duration, status, review_status,
--                             payment_status, slot_booked_by, slot_reserved_at,
--                             distribution_type, is_extra_ad)
--   VALUES (p_induk, p_ordinal, 'form_submissions_extend', gen_random_uuid(),
--           airing_instant_of_date(p_mulai), airing_instant_of_date(p_akhir),
--           p_akhir - p_mulai, p_status, 'approved',
--           p_bayar, p_oleh, p_hold, 'regular', false)
--   RETURNING id;
-- $f$;
--
-- DO $uji$
-- DECLARE
--   v_today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
--   d       date;
--   p       uuid[];
--   v_f uuid; v_g uuid; v_k uuid;
--   v_e1 uuid; v_h uuid; v_h2 uuid; v_x uuid; v_l uuid;
--   i int;
-- BEGIN
--   -- ── Setup ──
--   SELECT x::date INTO d
--   FROM generate_series(v_today + 30, v_today + 400, '1 day') AS x
--   WHERE NOT EXISTS (
--     SELECT 1 FROM ad_schedules a
--     WHERE a.start_date < airing_instant_of_date(x::date + 3)
--       AND a.end_date   > airing_instant_of_date(x::date - 2))
--   ORDER BY x LIMIT 1;
--   IF d IS NULL THEN RAISE EXCEPTION 'UJI_GAGAL setup: tidak ada hari kosong'; END IF;
--
--   SELECT array_agg(id ORDER BY created_at) INTO p FROM (
--     SELECT fs.id, fs.created_at FROM form_submissions fs
--     WHERE fs.distribution_type = 'regular'
--       AND NOT EXISTS (SELECT 1 FROM ad_schedules a
--                       WHERE a.submission_id = fs.id
--                         AND a.source_table = 'form_submissions_extend')
--       AND (fs.end_date IS NULL OR fs.end_date < v_today - 250)
--     ORDER BY fs.created_at LIMIT 14) s;
--   IF cardinality(p) < 14 THEN RAISE EXCEPTION 'UJI_GAGAL setup: order uji kurang'; END IF;
--   v_f := p[1];   -- order ordinal 1 yang dipindah ke D
--   v_g := p[2];   -- order in_review → approved
--   -- p[3] = create_ad_schedule; p[4..14] = induk baris lanjutan
--
--   SELECT fs.id INTO v_k FROM form_submissions fs
--   WHERE fs.distribution_type = 'kilat'
--     AND fs.kilat_slot_hour IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM ad_schedules a
--                     WHERE a.submission_id = fs.id
--                       AND a.source_table = 'form_submissions_extend')
--   LIMIT 1;
--
--   UPDATE ad_schedules SET is_extra_ad = false
--    WHERE source_table = 'form_submissions' AND source_id IN (v_f, v_g);
--
--   -- Kasus 1: order F (ordinal 1, lewat sinkron) pindah ke D, lunas → lolos. D = 1/4.
--   PERFORM pg_temp.harus_lolos('1', format(
--     'UPDATE form_submissions SET start_date = %L, end_date = %L, duration = 1,
--        submission_status = ''paid'', payment_status = ''paid'',
--        slot_booked_by = ''admin'', slot_reserved_at = NULL,
--        airing_hour_wib = NULL, airing_minute_wib = NULL
--      WHERE id = %L', d, d + 1, v_f));
--
--   -- Kasus 2: E1 [D−1, D+1) dan E2 [D, D+1), lunas admin → lolos. D = 3/4.
--   v_e1 := pg_temp.sisip(p[4], 901, d - 1, d + 1, 'paid', 'paid', 'admin', NULL);
--   PERFORM pg_temp.sisip(p[5], 902, d, d + 1, 'paid', 'paid', 'admin', NULL);
--
--   -- Kasus 3: H & H2 = hold peneliti yang kedaluwarsa (2 jam lalu) → lolos,
--   -- dan TIDAK dihitung. D tetap 3/4.
--   v_h  := pg_temp.sisip(p[6], 903, d, d + 1, 'waiting_payment', 'pending', 'user', now() - interval '2 hours');
--   v_h2 := pg_temp.sisip(p[7], 904, d, d + 1, 'waiting_payment', 'pending', 'user', now() - interval '2 hours');
--
--   -- Kasus 4: E3 → lolos. D = 4/4.
--   PERFORM pg_temp.sisip(p[8], 905, d, d + 1, 'paid', 'paid', 'admin', NULL);
--
--   -- Kasus 5: E4 → DITOLAK. Skenario insiden 6 Okt.
--   PERFORM pg_temp.harus_ditolak('5', format(
--     'SELECT pg_temp.sisip(%L, 906, %L, %L, ''paid'', ''paid'', ''admin'', NULL)',
--     p[9], d, d + 1), 'sudah penuh', 'daily_quota_full');
--
--   -- Kasus 6: create_ad_schedule (jalur admin) di D → DITOLAK.
--   PERFORM pg_temp.harus_ditolak('6', format(
--     'SELECT create_ad_schedule(p_submission_id => %L, p_start_date => %L,
--        p_end_date => %L, p_duration => 1, p_status => ''paid'',
--        p_payment_status => ''paid'')',
--     p[3], airing_instant_of_date(d), airing_instant_of_date(d + 1)),
--     'sudah penuh', 'daily_quota_full');
--
--   -- Kasus 7: H dibayar telat (hold tetap) → LOLOS (D3). D = 5/4.
--   PERFORM pg_temp.harus_lolos('7', format(
--     'UPDATE ad_schedules SET status = ''paid'', payment_status = ''paid'' WHERE id = %L', v_h));
--
--   -- Kasus 8: F disentuh lewat form_submissions saat D 5/4 → LOLOS (cacat #1).
--   PERFORM pg_temp.harus_lolos('8a', format(
--     'UPDATE form_submissions SET admin_notes = admin_notes WHERE id = %L', v_f));
--   PERFORM pg_temp.harus_lolos('8b', format(
--     'UPDATE form_submissions SET submission_status = ''scheduled'' WHERE id = %L', v_f));
--
--   -- Kasus 9: F jadi iklan tambahan (kolam tambahan D kosong) → lolos; lalu
--   -- disentuh lagi → LOLOS. sql/110 mengeceknya ke kolam REGULER (4/4) (cacat #2).
--   PERFORM pg_temp.harus_lolos('9a', format(
--     'UPDATE ad_schedules SET is_extra_ad = true
--      WHERE source_table = ''form_submissions'' AND source_id = %L', v_f));
--   PERFORM pg_temp.harus_lolos('9b', format(
--     'UPDATE form_submissions SET admin_notes = admin_notes WHERE id = %L', v_f));
--
--   -- Kasus 10: E1 dipendekkan ke [D, D+1) → LOLOS (cacat #5). D reguler = 4/4.
--   PERFORM pg_temp.harus_lolos('10', format(
--     'UPDATE ad_schedules SET start_date = %L, duration = 1 WHERE id = %L',
--     airing_instant_of_date(d), v_e1));
--
--   -- Kasus 11: X lahir di D+1 (lolos), lalu dipindah ke D → DITOLAK.
--   v_x := pg_temp.sisip(p[10], 907, d + 1, d + 2, 'paid', 'paid', 'admin', NULL);
--   PERFORM pg_temp.harus_ditolak('11', format(
--     'UPDATE ad_schedules SET start_date = %L, end_date = %L WHERE id = %L',
--     airing_instant_of_date(d), airing_instant_of_date(d + 1), v_x),
--     'sudah penuh', 'daily_quota_full');
--
--   -- Kasus 12: H2 menyegarkan hold di D (jendela sama) → DITOLAK (D4).
--   PERFORM pg_temp.harus_ditolak('12', format(
--     'UPDATE ad_schedules SET slot_reserved_at = now() WHERE id = %L', v_h2),
--     'sudah penuh', 'daily_quota_full');
--
--   -- Kasus 13: G in_review bertanggal D (tidak menahan → lolos), lalu
--   -- disetujui → DITOLAK (D5).
--   PERFORM pg_temp.harus_lolos('13a', format(
--     'UPDATE form_submissions SET start_date = %L, end_date = %L, duration = 1,
--        submission_status = ''in_review'', payment_status = ''pending'',
--        slot_booked_by = NULL, slot_reserved_at = NULL,
--        airing_hour_wib = NULL, airing_minute_wib = NULL
--      WHERE id = %L', d, d + 1, v_g));
--   PERFORM pg_temp.harus_ditolak('13b', format(
--     'UPDATE form_submissions SET submission_status = ''approved'' WHERE id = %L', v_g),
--     'sudah penuh', 'daily_quota_full');
--
--   -- Kasus 14: order Kilat pindah ke D → lolos (kuota harian tidak berlaku).
--   IF v_k IS NULL THEN
--     RAISE NOTICE 'kasus 14 dilewati: tidak ada order Kilat tanpa jadwal lanjutan';
--   ELSE
--     PERFORM pg_temp.harus_lolos('14', format(
--       'UPDATE form_submissions SET start_date = %L, end_date = %L,
--          submission_status = ''paid'', payment_status = ''paid''
--        WHERE id = %L', d, d + 1, v_k));
--   END IF;
--
--   -- Kasus 15: jendela baru 91 hari → DITOLAK.
--   PERFORM pg_temp.harus_ditolak('15', format(
--     'SELECT pg_temp.sisip(%L, 908, %L, %L, ''paid'', ''paid'', ''admin'', NULL)',
--     p[11], d + 100, d + 191), 'melebihi batas 90 hari', 'schedule_window_too_long');
--
--   -- Kasus 16: lima jadwal di hari LAMPAU (kemarin lusa) → semuanya lolos.
--   -- sql/110 menolak yang kelima; hari lampau tidak mengambil kursi siapa pun.
--   FOR i IN 4..8 LOOP
--     PERFORM pg_temp.harus_lolos('16', format(
--       'SELECT pg_temp.sisip(%L, %s, %L, %L, ''paid'', ''paid'', ''admin'', NULL)',
--       p[i], 910 + i, v_today - 3, v_today - 2));
--   END LOOP;
--
--   -- Kasus 17: baris lama berjendela 140 hari (lampau) berubah status saja →
--   -- lolos. Batas 90 hari hanya untuk jendela yang baru ditulis.
--   v_l := pg_temp.sisip(p[12], 909, v_today - 240, v_today - 100, 'cancelled', 'expired', 'admin', NULL);
--   PERFORM pg_temp.harus_lolos('17', format(
--     'UPDATE ad_schedules SET status = ''paid'', payment_status = ''paid'' WHERE id = %L', v_l));
--
--   RAISE EXCEPTION 'UJI_LULUS — 17 kasus lolos (hari uji %). Exception ini disengaja: semua tulisan uji dibatalkan.', d;
-- END
-- $uji$;
-- ROLLBACK;


-- ============================================================================
-- ROLLBACK MIGRASI — mengembalikan sql/110 PERSIS seperti di produksi 7 Okt
-- 2026 (md5 di Langkah 1a). Hibah `authenticated` di assert_daily_ad_quota_free
-- SENGAJA tidak dikembalikan.
-- ============================================================================
--
-- BEGIN;
--
-- CREATE OR REPLACE FUNCTION public.assert_daily_ad_quota_free(p_start timestamp with time zone, p_end timestamp with time zone, p_is_extra_ad boolean, p_distribution_type text, p_exclude_source_id uuid DEFAULT NULL::uuid)
--  RETURNS void
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_quota  INTEGER;
--   v_day    DATE;
--   v_full   RECORD;
-- BEGIN
--   IF p_start IS NULL OR p_end IS NULL THEN RETURN; END IF;
--
--   -- Kilat punya kolam gelombangnya sendiri (8/11/14/17 WIB, 2 order/gelombang)
--   -- dan TIDAK diatur kuota harian ini. Penjadwalan swalayan menolak Kilat lebih
--   -- dulu di create_ad_schedule(), jadi cabang ini hanya melindungi pemanggil lain.
--   IF p_distribution_type = 'kilat' THEN RETURN; END IF;
--
--   v_quota := CASE WHEN COALESCE(p_is_extra_ad, false)
--                   THEN max_extra_ads_per_day()
--                   ELSE max_regular_ads_per_day() END;
--
--   -- Akhir-EKSKLUSIF: hari `end_date` adalah hari serah-terima, bukan hari tayang.
--   -- Hari dihitung menurut kalender WIB, bukan UTC — sebuah jendela yang mulai
--   -- 15.00 WIB adalah 08:00 UTC di tanggal yang sama.
--   FOR v_day IN
--     SELECT generate_series(
--              (p_start AT TIME ZONE 'Asia/Jakarta')::date,
--              (p_end   AT TIME ZONE 'Asia/Jakarta')::date - 1,
--              '1 day')::date
--   LOOP
--     -- Satu kunci per (kolam, tanggal). Transaksi yang sudah memegang kunci
--     -- yang sama (create_ad_schedule lalu trigger) tidak mengantre dirinya.
--     PERFORM pg_advisory_xact_lock(hashtextextended(
--       'ad-quota|' || COALESCE(p_distribution_type, '') || '|'
--       || CASE WHEN COALESCE(p_is_extra_ad, false) THEN 'extra' ELSE 'regular' END
--       || '|' || to_char(v_day, 'YYYY-MM-DD'),
--       0::bigint
--     ));
--
--     SELECT COUNT(*) AS n INTO v_full
--     FROM (
--       -- Kaki 1 — jadwal ordinal 1. Saringan status identik dengan
--       -- get_submission_slot_occupancy().
--       SELECT fs.id AS source_id,
--              airing_instant_of_date(fs.start_date) AS sd,
--              airing_instant_of_date(fs.end_date)   AS ed,
--              fs.slot_booked_by, fs.slot_reserved_at, fs.payment_status,
--              COALESCE(a.is_extra_ad, false) AS is_extra
--       FROM form_submissions fs
--       JOIN ad_schedules a
--         ON a.source_table = 'form_submissions' AND a.source_id = fs.id
--       WHERE fs.start_date IS NOT NULL AND fs.end_date IS NOT NULL
--         AND fs.submission_status NOT IN
--             ('rejected','spam','in_review','completed','cancelled','slot_cancelled')
--         AND fs.distribution_type = p_distribution_type
--
--       UNION ALL
--
--       -- Kaki 2 — jadwal ke-2 dst. Saringan status identik dengan
--       -- get_extend_slot_occupancy().
--       SELECT a.source_id, a.start_date, a.end_date,
--              a.slot_booked_by, a.slot_reserved_at, a.payment_status,
--              COALESCE(a.is_extra_ad, false)
--       FROM ad_schedules a
--       JOIN form_submissions fs ON fs.id = a.submission_id
--       WHERE a.source_table = 'form_submissions_extend'
--         AND a.start_date IS NOT NULL AND a.end_date IS NOT NULL
--         AND a.status IN ('waiting_payment','paid','scheduled','live')
--         AND fs.distribution_type IS NOT DISTINCT FROM p_distribution_type
--     ) occ
--     WHERE occ.is_extra = COALESCE(p_is_extra_ad, false)
--       AND (p_exclude_source_id IS NULL OR occ.source_id <> p_exclude_source_id)
--       AND v_day >= (occ.sd AT TIME ZONE 'Asia/Jakarta')::date
--       AND v_day <  (occ.ed AT TIME ZONE 'Asia/Jakarta')::date
--       -- Aturan pelepasan holdsSlot(): hold peneliti yang belum lunas dan sudah
--       -- lewat 1 jam TIDAK LAGI menahan kapasitas. Ambang eksklusif — tepat di
--       -- detik tenggat, slotnya masih ditahan.
--       AND NOT (
--         COALESCE(occ.slot_booked_by,'') = 'user'
--         AND COALESCE(occ.payment_status,'pending') NOT IN ('paid','completed')
--         AND occ.slot_reserved_at IS NOT NULL
--         AND occ.slot_reserved_at < NOW() - INTERVAL '1 hour'
--       );
--
--     IF v_full.n >= v_quota THEN
--       RAISE EXCEPTION
--         'Kuota iklan % pada % sudah penuh (% dari %). Pilih tanggal lain.',
--         CASE WHEN COALESCE(p_is_extra_ad,false) THEN 'tambahan' ELSE 'reguler' END,
--         TO_CHAR(v_day, 'DD Mon YYYY'), v_full.n, v_quota;
--     END IF;
--   END LOOP;
-- END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.ad_schedule_occupies_daily_quota(p_row ad_schedules)
--  RETURNS boolean
--  LANGUAGE sql
--  STABLE
--  SET search_path TO 'public'
-- AS $function$
--   SELECT p_row.start_date IS NOT NULL
--      AND p_row.end_date IS NOT NULL
--      AND COALESCE(p_row.distribution_type, '') <> 'kilat'
--      AND CASE
--            WHEN p_row.source_table = 'form_submissions_extend' THEN
--              p_row.status IN ('waiting_payment','paid','scheduled','live')
--            ELSE
--              p_row.status IN ('waiting_payment','paid','scheduled','live','slot_reserved')
--          END;
-- $function$;
--
-- CREATE OR REPLACE FUNCTION public.enforce_daily_ad_quota()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- BEGIN
--   IF NOT public.ad_schedule_occupies_daily_quota(NEW) THEN
--     RETURN NEW;
--   END IF;
--
--   -- Jendela dan kolamnya tidak berubah, dan baris lama pun sudah menahan
--   -- kuota. Pembaruan bayar / live / catatan boleh lewat, termasuk pada hari
--   -- yang sudah terlanjur 5/4.
--   IF TG_OP = 'UPDATE'
--      AND public.ad_schedule_occupies_daily_quota(OLD)
--      AND OLD.start_date IS NOT DISTINCT FROM NEW.start_date
--      AND OLD.end_date IS NOT DISTINCT FROM NEW.end_date
--      AND COALESCE(OLD.is_extra_ad, false) IS NOT DISTINCT FROM COALESCE(NEW.is_extra_ad, false)
--      AND OLD.distribution_type IS NOT DISTINCT FROM NEW.distribution_type
--   THEN
--     RETURN NEW;
--   END IF;
--
--   PERFORM public.assert_daily_ad_quota_free(
--     NEW.start_date,
--     NEW.end_date,
--     COALESCE(NEW.is_extra_ad, false),
--     NEW.distribution_type,
--     NEW.source_id
--   );
--   RETURN NEW;
-- END;
-- $function$;
--
-- DROP TRIGGER IF EXISTS trg_ad_schedules_daily_quota ON public.ad_schedules;
-- CREATE TRIGGER trg_ad_schedules_daily_quota
--   BEFORE INSERT OR UPDATE OF start_date, end_date, status, is_extra_ad, distribution_type
--   ON public.ad_schedules
--   FOR EACH ROW EXECUTE FUNCTION enforce_daily_ad_quota();
--
-- DROP FUNCTION IF EXISTS public.assert_daily_ad_quota_days(date[], boolean, text, uuid);
-- DROP FUNCTION IF EXISTS public.daily_quota_days(timestamptz, timestamptz);
--
-- COMMIT;
